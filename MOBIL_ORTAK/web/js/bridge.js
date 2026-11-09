// Yerel uygulama köprüsü (Android / iOS) + tarayıcı yedeği.
//
// Sözleşme (her iki platform aynı JSON mesajlarını konuşur):
//   JS → yerel : Android: window.PDFStudioNative.postMessage(json)
//                iOS    : webkit.messageHandlers.native.postMessage(json)
//   yerel → JS : window.PDFStudioBridge.receive(obj)
//     { id, ok: true, result } | { id, ok: false, error }   — bir isteğin yanıtı
//     { event: "openFile", file } | { event: "back" }      — kendiliğinden olaylar
//
// Dosya içeriği JS'e bir URL üzerinden gelir (file.url; yerel taraf bu adresi
// kendi şema/yol işleyicisiyle sunar). JS'ten yerele baytlar base64 parçalar
// hâlinde gönderilir (writeBegin / writeChunk / writeEnd).

import { N_ } from "./i18n.js";

const CHUNK = 512 * 1024;

/** Yerel kabukların (Kotlin / Swift) JS'e gönderdiği hata iletileri; arayüz
 *  bunları errText() ile seçili dile çevirir. Burada yalnızca çeviri anahtarı
 *  olarak listelenirler. */
export const NATIVE_MESSAGES = [
  N_("Dosya seçici bulunamadı"), N_("Dosyaya artık erişilemiyor"), N_("Dosyaya erişim izni yok ya da dosya taşınmış"),
  N_("Dosya yazmak için açılamadı"), N_("Geçersiz yazma belirteci"), N_("Geçici dosya oluşturulamadı"), N_("Bozuk veri"),
  N_("Kaydedilemedi"), N_("Yazılamadı"),
];

function detect() {
  if (window.PDFStudioNative && typeof window.PDFStudioNative.postMessage === "function") return "android";
  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.native) return "ios";
  return "web";
}

function toBase64(bytes) {
  let s = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return btoa(s);
}

export class Bridge {
  constructor() {
    this.platform = detect();
    this.seq = 0;
    this.pending = new Map();
    this.handlers = {};
    window.PDFStudioBridge = { receive: (msg) => this._receive(typeof msg === "string" ? JSON.parse(msg) : msg) };
  }

  get native() {
    return this.platform !== "web";
  }

  on(event, fn) {
    this.handlers[event] = fn;
  }

  _post(obj) {
    const json = JSON.stringify(obj);
    if (this.platform === "android") window.PDFStudioNative.postMessage(json);
    else window.webkit.messageHandlers.native.postMessage(json);
  }

  _receive(msg) {
    if (msg.event) {
      const fn = this.handlers[msg.event];
      if (fn) Promise.resolve(fn(msg)).catch((e) => console.error(e));
      else if (msg.event === "back") this._post({ cmd: "backResult", handled: false });
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(Object.assign(new Error(msg.error || N_("İşlem başarısız")), { code: msg.code || "native" }));
  }

  call(cmd, args = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this._post({ id, cmd, ...args });
    });
  }

  /** Yerel tarafa JS'in hazır olduğunu bildirir (bekleyen "birlikte aç" dosyaları gelir). */
  ready() {
    if (this.native) this._post({ cmd: "ready" });
  }

  // ---------------------------------------------------------------- açma
  /**
   * Dosya seçtirir. Dönüş: [{ name, bytes, handle, mime }] (iptalde boş dizi)
   * kind: "pdf" | "image" | "any" | "json" | "font"
   */
  async openFiles({ kind = "pdf", multiple = false } = {}) {
    if (!this.native) return this._webOpen(kind, multiple);
    const files = await this.call("openFiles", { kind, multiple });
    return Promise.all((files || []).map((f) => this.fetchFile(f)));
  }

  async fetchFile(f) {
    const res = await fetch(f.url);
    if (!res.ok) throw Object.assign(new Error(N_("Dosya okunamadı: {name}")), { params: { name: f.name } });
    return { name: f.name, handle: f.handle || null, mime: f.mime || "", bytes: new Uint8Array(await res.arrayBuffer()) };
  }

  /** Daha önce açılmış bir dosyayı tanıtıcısıyla yeniden açar (son kullanılanlar). */
  async openHandle(handle) {
    if (!this.native) throw new Error(N_("Bu dosyaya artık erişilemiyor"));
    const f = await this.call("openHandle", { handle });
    return this.fetchFile(f);
  }

  _webOpen(kind, multiple) {
    const accept = {
      pdf: "application/pdf,.pdf",
      image: "image/*",
      json: "application/json,.json",
      font: ".ttf,.otf,.ttc,font/ttf,font/otf",
      any: "",
      doc: "application/pdf,.pdf,image/*,.xps,.oxps,.epub,.cbz,.fb2,.svg",
    }[kind] ?? "";
    return new Promise((resolve) => {
      const input = document.getElementById("file-input");
      input.value = "";
      input.accept = accept;
      input.multiple = multiple;
      const done = async () => {
        window.removeEventListener("focus", onFocus);
        const list = [...(input.files || [])];
        resolve(await Promise.all(list.map(async (f) => ({ name: f.name, mime: f.type, handle: null, bytes: new Uint8Array(await f.arrayBuffer()) }))));
      };
      const onFocus = () => setTimeout(() => { if (!input.files || !input.files.length) { window.removeEventListener("focus", onFocus); resolve([]); } }, 800);
      input.onchange = done;
      window.addEventListener("focus", onFocus);
      input.click();
    });
  }

  // ------------------------------------------------------------- yazma
  /**
   * mode: "save"   → handle üzerine yaz (yoksa saveAs gibi davranır)
   *       "saveAs" → sistem "farklı kaydet" penceresi
   *       "share"  → paylaşım menüsü
   *       "print"  → sistem yazdırma (PDF); media ("A4", "Letter"...) ve
   *                  landscape verilirse yazdırma penceresi o kâğıtla açılır
   * Dönüş: { handle, name } ya da iptalde null
   */
  async writeFile(mode, { name, mime = "application/pdf", handle = null, media = null, landscape = null }, bytes) {
    if (!this.native) return this._webWrite(mode, name, mime, bytes);
    const { token } = await this.call("writeBegin", { size: bytes.length });
    for (let i = 0; i < bytes.length; i += CHUNK) {
      await this.call("writeChunk", { token, data: toBase64(bytes.subarray(i, i + CHUNK)) });
    }
    return this.call("writeEnd", { token, mode, name, mime, handle, media, landscape });
  }

  async _webWrite(mode, name, mime, bytes) {
    const blob = new Blob([bytes], { type: mime });
    if (mode === "print") {
      const url = URL.createObjectURL(blob);
      const frame = document.createElement("iframe");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      frame.src = url;
      document.body.appendChild(frame);
      frame.onload = () => {
        try { frame.contentWindow.print(); } catch { window.open(url, "_blank"); }
        setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000);
      };
      return { name };
    }
    if (mode === "share" && navigator.canShare) {
      const file = new File([blob], name, { type: mime });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: name });
          return { name };
        } catch (e) {
          if (e.name === "AbortError") return null;
        }
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return { name, handle: null };
  }

  // ------------------------------------------------------------ diğer
  openUrl(url) {
    if (this.native) return this.call("openUrl", { url });
    window.open(url, "_blank", "noopener");
    return Promise.resolve();
  }

  setDirty(dirty) {
    if (this.native) this._post({ cmd: "setDirty", dirty: !!dirty });
  }

  backResult(handled) {
    if (this.native) this._post({ cmd: "backResult", handled: !!handled });
  }

  async appInfo() {
    if (!this.native) return { platform: "web", version: "dev" };
    try {
      return await this.call("appInfo");
    } catch {
      return { platform: this.platform, version: "?" };
    }
  }
}
