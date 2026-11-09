// Özel iletişim pencereleri: metin düzenleme (canlı önizleme), metin ekleme,
// imza, bağlantı, belge bilgisi, kısayollar, ayarlar, hakkında.
// Masaüstündeki ui/dialogs.py karşılığı.

import { h, openSheet, colorPicker, toast, escapeHtml } from "./ui.js";
import { icon } from "./icons.js";
import { settings, saveSettings } from "./store.js";
import { appName } from "../branding.js";

const ALIGNS = [[0, "Sola", "align-left"], [1, "Ortala", "align-center"], [2, "Sağa", "align-right"], [3, "İki yana", "align-justify"]];

function familySelect(families, value) {
  const s = h("select", {});
  const list = [...new Set([...(value ? [value] : []), ...families])];
  for (const f of list) s.append(h("option", { value: f }, f));
  s.value = value || families[0];
  return s;
}

function seg(options, value, onChange) {
  let cur = value;
  const box = h("div", { class: "seg" });
  const btns = options.map(([v, label]) => {
    const b = h("button", { type: "button", onclick: () => { cur = v; btns.forEach((x) => x.classList.toggle("on", x === b)); onChange && onChange(v); } }, label);
    b.classList.toggle("on", v === cur);
    return b;
  });
  box.append(...btns);
  return { el: box, get: () => cur };
}

const field = (label, control) => h("div", { class: "field" }, h("label", {}, label), control);

// ---------------------------------------------------------------- metin düzenle
/**
 * block: motorun blockAt çıktısı. Dönüş: { text, style, background, grow } ya da null
 */
export function textEditDialog(app, block) {
  const families = app.fontFamilies;
  const st = block.style;
  const text = h("textarea", { rows: Math.min(10, Math.max(3, block.text.split("\n").length + 1)) });
  text.value = block.text;
  const fam = familySelect(families, st.family);
  const size = h("input", { type: "number", min: 3, max: 400, step: 0.5, value: st.size });
  const color = colorPicker(st.color);
  const align = seg(ALIGNS.map(([v, l]) => [v, l]), st.align || 0, () => schedule());
  const spacing = h("input", { type: "number", min: 0.6, max: 4, step: 0.05, value: st.lineSpacing || 1.15 });
  const bold = h("input", { type: "checkbox" });
  bold.checked = !!st.bold;
  const italic = h("input", { type: "checkbox" });
  italic.checked = !!st.italic;
  const bg = colorPicker(null, { allowNone: true });
  const grow = h("input", { type: "checkbox" });
  grow.checked = true;
  const canvas = h("canvas", {});
  const note = h("div", { class: "hint" }, "Önizleme");

  const values = () => ({
    text: text.value,
    style: { family: fam.value, size: +size.value || st.size, color: color.get(), align: align.get(), lineSpacing: +spacing.value || 1.15, bold: bold.checked, italic: italic.checked },
    background: bg.get(),
    grow: grow.checked,
  });

  let timer = null, seq = 0;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const id = ++seq;
      const v = values();
      try {
        const img = await app.engine.call("previewReplace", block.pno, block.bbox, v.text, v.style, { baseline: block.baseline, background: v.background, grow: v.grow }, 2);
        if (id !== seq || !img.width) return;
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext("2d").putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
        note.textContent = "Önizleme — değişiklik yalnızca “Uygula”da belgeye işlenir";
      } catch (e) {
        note.textContent = "Önizleme alınamadı: " + e.message;
      }
    }, 300);
  };
  for (const el of [text, fam, size, spacing, bold, italic, grow]) el.addEventListener("input", schedule);
  color.el.addEventListener("click", () => setTimeout(schedule));
  color.el.addEventListener("input", schedule);
  bg.el.addEventListener("click", () => setTimeout(schedule));
  bg.el.addEventListener("input", schedule);
  schedule();

  const body = h("div", {},
    field("Metin", text),
    h("div", { class: "preview-box" }, canvas), note,
    h("div", { class: "row2" }, field("Yazı tipi", fam), field("Punto", size)),
    field("Renk", color.el),
    field("Hizalama", align.el),
    h("div", { class: "row2" }, field("Satır aralığı", spacing), h("div", { class: "field" }, h("label", {}, "Stil"),
      h("div", { style: { display: "flex", gap: "14px" } }, h("label", { class: "checkline" }, bold, "Kalın"), h("label", { class: "checkline" }, italic, "İtalik")))),
    field("Arka plan (silinen alanı boya)", bg.el),
    h("label", { class: "checkline" }, grow, "Sığmazsa kutuyu büyüt"),
  );
  return openSheet({ title: "Metni düzenle", body, wide: true, buttons: [{ label: "Vazgeç", value: null }, { label: "Uygula", primary: true, value: values }] });
}

/** Metin ekle (sayfa içeriğine). Dönüş: { text, style } */
export function textAddDialog(app, defaults) {
  const t = settings.tool;
  const text = h("textarea", { rows: 4, placeholder: "Eklenecek metin…" });
  const fam = familySelect(app.fontFamilies, t.fontFamily);
  const size = h("input", { type: "number", min: 3, max: 400, step: 0.5, value: t.fontsize });
  const color = colorPicker(t.textColor);
  const align = seg(ALIGNS.map(([v, l]) => [v, l]), t.align);
  const bold = h("input", { type: "checkbox" });
  bold.checked = t.bold;
  const italic = h("input", { type: "checkbox" });
  italic.checked = t.italic;
  const body = h("div", {},
    field("Metin", text),
    h("div", { class: "row2" }, field("Yazı tipi", fam), field("Punto", size)),
    field("Renk", color.el), field("Hizalama", align.el),
    h("div", { style: { display: "flex", gap: "16px" } }, h("label", { class: "checkline" }, bold, "Kalın"), h("label", { class: "checkline" }, italic, "İtalik")),
  );
  return openSheet({
    title: defaults?.title || "Metin ekle", body,
    buttons: [{ label: "Vazgeç", value: null }, {
      label: "Ekle", primary: true,
      validate: () => { if (!text.value.trim()) { toast("Metin boş"); return false; } return true; },
      value: () => {
        const style = { family: fam.value, size: +size.value || 12, color: color.get(), align: align.get(), bold: bold.checked, italic: italic.checked, lineSpacing: t.lineSpacing };
        Object.assign(t, { fontFamily: style.family, fontsize: style.size, textColor: style.color, align: style.align, bold: style.bold, italic: style.italic });
        saveSettings();
        return { text: text.value, style };
      },
    }],
  });
}

// ------------------------------------------------------------------ imza
async function ensureSignatureFonts() {
  const faces = [["PSSigSerif", "LiberationSerif-Italic.ttf"], ["PSSigSans", "LiberationSans-Italic.ttf"], ["PSSigMono", "LiberationMono-Regular.ttf"], ["PSSigDejaVu", "DejaVuSans-Oblique.ttf"]];
  for (const [name, file] of faces) {
    if ([...document.fonts].some((f) => f.family === name)) continue;
    try {
      const face = new FontFace(name, `url(fonts/${file})`);
      await face.load();
      document.fonts.add(face);
    } catch { /* yok say */ }
  }
}

/** İmza oluştur: çiz / yaz / içe aktar. Dönüş: PNG baytları (saydam) */
export async function signatureDialog(app) {
  await ensureSignatureFonts();
  let mode = "draw";
  let color = [0.05, 0.1, 0.45];
  let width = 2.6;
  let imported = null;
  const pad = h("canvas", { class: "sigpad" });
  const strokes = [];
  const typed = h("input", { type: "text", placeholder: "Adınız Soyadınız", value: settings.author || "" });
  const font = h("select", {}, ...[["PSSigSerif", "El yazısı (serif italik)"], ["PSSigSans", "Sans italik"], ["PSSigDejaVu", "DejaVu eğik"], ["PSSigMono", "Daktilo"]].map(([v, l]) => h("option", { value: v }, l)));
  const colorP = colorPicker(color, { onChange: (c) => { color = c; redraw(); } });
  const widthR = h("input", { type: "range", min: 1, max: 8, step: 0.2, value: width });
  const imgBox = h("div", { class: "hint" }, "Saydam arka planlı bir PNG seçin.");
  const importBtn = h("button", { class: "btn", onclick: async () => {
    const files = await app.bridge.openFiles({ kind: "image" });
    if (!files.length) return;
    imported = files[0].bytes;
    const url = URL.createObjectURL(new Blob([imported]));
    imgBox.innerHTML = "";
    imgBox.append(h("img", { src: url, style: { maxWidth: "100%", maxHeight: "160px", background: "#fff", borderRadius: "8px" } }));
  } }, "Görüntü seç…");

  const ctx = () => pad.getContext("2d");
  const fitPad = () => {
    const r = pad.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    pad.width = Math.max(10, r.width * dpr);
    pad.height = Math.max(10, r.height * dpr);
    redraw();
  };
  const redraw = () => {
    const c = ctx();
    const dpr = window.devicePixelRatio || 1;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, pad.width, pad.height);
    const css = `rgb(${color.map((v) => Math.round(v * 255)).join(",")})`;
    if (mode === "draw") {
      c.strokeStyle = css;
      c.lineCap = c.lineJoin = "round";
      for (const s of strokes) {
        c.lineWidth = s.w;
        c.beginPath();
        s.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.stroke();
      }
      if (!strokes.length) {
        c.fillStyle = "#99a";
        c.font = "14px system-ui";
        c.fillText("Buraya parmağınızla ya da kalemle imzalayın", 14, 26);
      }
    } else if (mode === "type") {
      const w = pad.width / dpr, hh = pad.height / dpr;
      let size = 64;
      c.fillStyle = css;
      c.textBaseline = "middle";
      do {
        c.font = `${size}px ${font.value}`;
        size -= 2;
      } while (size > 12 && c.measureText(typed.value).width > w - 24);
      c.fillText(typed.value, 12, hh / 2);
    }
  };
  let cur = null;
  pad.addEventListener("pointerdown", (e) => {
    if (mode !== "draw") return;
    pad.setPointerCapture(e.pointerId);
    const r = pad.getBoundingClientRect();
    const pressure = e.pressure && e.pointerType === "pen" ? 0.5 + e.pressure : 1;
    cur = { w: +widthR.value * pressure, pts: [[e.clientX - r.left, e.clientY - r.top]] };
    strokes.push(cur);
    redraw();
  });
  pad.addEventListener("pointermove", (e) => {
    if (!cur) return;
    const r = pad.getBoundingClientRect();
    for (const ce of e.getCoalescedEvents ? e.getCoalescedEvents() : [e]) cur.pts.push([ce.clientX - r.left, ce.clientY - r.top]);
    redraw();
  });
  pad.addEventListener("pointerup", () => { cur = null; });
  typed.addEventListener("input", redraw);
  font.addEventListener("change", redraw);
  widthR.addEventListener("input", () => { width = +widthR.value; });

  const drawPane = h("div", {}, pad, h("div", { class: "row2", style: { marginTop: "8px" } },
    field("Kalınlık", widthR), h("div", { class: "field" }, h("label", {}, " "), h("button", { class: "btn", onclick: () => { strokes.length = 0; redraw(); } }, "Temizle"))));
  const typePane = h("div", { hidden: true }, field("Metin", typed), field("Yazı tipi", font));
  const importPane = h("div", { hidden: true }, importBtn, imgBox);
  const tabs = h("div", { class: "tabs" });
  const panes = { draw: drawPane, type: typePane, import: importPane };
  for (const [k, label] of [["draw", "Çiz"], ["type", "Yaz"], ["import", "İçe aktar"]]) {
    tabs.append(h("button", { class: k === mode ? "on" : "", onclick: (e) => {
      mode = k;
      for (const b of tabs.children) b.classList.toggle("on", b === e.currentTarget);
      for (const [pk, pane] of Object.entries(panes)) pane.hidden = pk !== k;
      pad.hidden = k === "import";
      if (k === "type") typePane.prepend(pad);
      if (k === "draw") drawPane.prepend(pad);
      requestAnimationFrame(fitPad);
    } }, label));
  }
  const saveCb = h("input", { type: "checkbox" });
  saveCb.checked = true;
  const body = h("div", {}, tabs, drawPane, typePane, importPane, field("Renk", colorP.el), h("label", { class: "checkline" }, saveCb, "Bu imzayı sonraki kullanımlar için sakla"));
  const res = await openSheet({
    title: "İmza oluştur", body, wide: true,
    onOpen: () => requestAnimationFrame(fitPad),
    buttons: [{ label: "Vazgeç", value: null }, { label: "Kullan", primary: true, value: () => mode }],
  });
  if (!res) return null;
  let png;
  if (res === "import") {
    if (!imported) return null;
    png = imported;
  } else {
    if (res === "draw" && !strokes.length) return null;
    if (res === "type" && !typed.value.trim()) return null;
    png = await trimCanvas(pad);
  }
  if (saveCb.checked) {
    settings.signature = bytesToB64(png);
    saveSettings();
  }
  return png;
}

/** Kanvasın boş kenarlarını kırpıp saydam PNG üretir. */
async function trimCanvas(c) {
  const ctx = c.getContext("2d");
  const { width: w, height: hh } = c;
  const data = ctx.getImageData(0, 0, w, hh).data;
  let x0 = w, y0 = hh, x1 = 0, y1 = 0;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = hh - 1; }
  const m = 6;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(hh - 1, y1 + m);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d").drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  const blob = await new Promise((r) => out.toBlob(r, "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

export function bytesToB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ------------------------------------------------------------------ bağlantı
export function linkDialog(total, current) {
  let kind = "uri";
  const url = h("input", { type: "url", placeholder: "https://…", value: "https://" });
  const page = h("input", { type: "number", min: 1, max: total, value: Math.min(total, current + 2) });
  const kindSeg = seg([["uri", "Web adresi"], ["page", "Belge içi sayfa"]], kind, (v) => {
    kind = v;
    urlRow.hidden = v !== "uri";
    pageRow.hidden = v !== "page";
  });
  const urlRow = field("Adres", url);
  const pageRow = field(`Sayfa (1–${total})`, page);
  pageRow.hidden = true;
  return openSheet({
    title: "Bağlantı ekle", body: h("div", {}, kindSeg.el, urlRow, pageRow),
    buttons: [{ label: "Vazgeç", value: null }, {
      label: "Ekle", primary: true,
      validate: () => {
        if (kind === "uri" && !/^[a-z][a-z0-9+.-]*:.+/i.test(url.value.trim())) { toast("Geçerli bir adres girin"); return false; }
        return true;
      },
      value: () => (kind === "uri" ? { uri: url.value.trim() } : { targetPage: Math.min(total, Math.max(1, +page.value || 1)) - 1 }),
    }],
  });
}

// ------------------------------------------------------------------ bilgi
export function tableDialog(title, rows, { wide = false } = {}) {
  const table = h("table", { class: "kv" });
  for (const [k, v] of rows) table.append(h("tr", {}, h("td", {}, k), h("td", { style: { wordBreak: "break-word" } }, String(v ?? ""))));
  return openSheet({ title, body: table, wide, buttons: [{ label: "Kapat", primary: true, value: true }] });
}

export const SHORTCUTS = [
  ["Aç / Kaydet / Farklı kaydet", "Ctrl+O · Ctrl+S · Ctrl+Shift+S"],
  ["Geri al / Yinele", "Ctrl+Z · Ctrl+Y"],
  ["Bul / sonraki / önceki sonuç", "Ctrl+F · F3 · Shift+F3"],
  ["Yazdır / seçili alanı yazdır", "Ctrl+P · Ctrl+Shift+P"],
  ["Yakınlaştır / uzaklaştır / %100", "Ctrl+= · Ctrl+- · Ctrl+0"],
  ["Genişliğe / sayfaya sığdır", "Ctrl+1 · Ctrl+2"],
  ["Sürekli yakınlaştırma", "Ctrl + tekerlek · iki parmak"],
  ["Seç · El · Metni düzenle · Metin ekle", "V · H · E · T"],
  ["Çizim · Dikdörtgen · Çizgi · Ok", "D · R · L · A"],
  ["Not · İmza · Görüntü · Bağlantı · Kırp · Ölç", "N · S · I · K · C · M"],
  ["Karartmaları uygula", "Ctrl+Shift+R"],
  ["Sayfayı döndür", "Ctrl+Shift+← / →"],
  ["Kenar çubuğu / ayarlar / odak modu", "F9 · F10 · F11"],
  ["Önceki / sonraki sayfa", "PgUp · PgDn"],
  ["Seçili nesneyi taşı (Shift ile ince)", "Ok tuşları"],
  ["Seçimi / çizimi iptal et", "Esc"],
  ["Sayfa kaydır / yakınlaştır (dokunmatik)", "iki parmak"],
  ["Metin seç (dokunmatik)", "basılı tut + sürükle"],
  ["Yakınlaştır / sığdır (dokunmatik)", "çift dokunuş"],
];

export function shortcutsDialog() {
  const table = h("table", { class: "kv shortcut-table" });
  for (const [k, v] of SHORTCUTS) table.append(h("tr", {}, h("td", {}, k), h("td", {}, v)));
  return openSheet({ title: "Klavye ve dokunma kısayolları", body: table, wide: true, buttons: [{ label: "Kapat", primary: true, value: true }] });
}

export async function aboutDialog(app) {
  const info = await app.bridge.appInfo();
  let versions = {};
  try {
    versions = await (await fetch("vendor/versions.json")).json();
  } catch { /* yok */ }
  const body = h("div", { style: { lineHeight: 1.55, fontSize: "14px" } },
    h("div", { class: "home-logo" }, h("img", { src: "img/icon.png", alt: "" }), h("div", {}, h("h1", {}, appName()), h("p", {}, `Sürüm ${escapeHtml(info.version || "?")} · ${info.platform === "android" ? "Android" : info.platform === "ios" ? "iOS" : "Tarayıcı"}`))),
    h("p", {}, "Adobe Acrobat Pro benzeri PDF düzenleyici: gerçek metin düzenleme, açıklamalar, sayfa yönetimi, formlar, imza, gerçek karartma, şifreleme, OCR ve dışa aktarma. Tamamen çevrimdışı çalışır; hiçbir veri dışarı gönderilmez."),
    h("div", { class: "section-title" }, "Bileşenler"),
    h("table", { class: "kv" },
      h("tr", {}, h("td", {}, "PDF motoru"), h("td", {}, `MuPDF (mupdf.js ${versions.mupdf || ""}) — AGPL-3.0`)),
      h("tr", {}, h("td", {}, "OCR"), h("td", {}, `Tesseract (tesseract.js ${versions.tesseract || ""}) — Apache-2.0`)),
      h("tr", {}, h("td", {}, "Yazı tipleri"), h("td", {}, "Liberation (OFL 1.1), DejaVu (Bitstream Vera lisansı)")),
      h("tr", {}, h("td", {}, "Motor çalışma kipi"), h("td", {}, app.engine.mode === "worker" ? "Arka plan iş parçacığı" : "Ana iş parçacığı")),
    ),
    h("p", { class: "hint" }, "MuPDF AGPL-3.0 lisanslıdır; uygulamayı kapalı kaynak ticari bir ürün olarak dağıtmak için Artifex'ten ticari lisans gerekir."),
  );
  return openSheet({ title: "Hakkında", body, buttons: [{ label: "Kapat", primary: true, value: true }] });
}

// ------------------------------------------------------------------ ayarlar
export async function preferencesDialog(app) {
  const theme = seg([["system", "Sistem"], ["dark", "Koyu"], ["light", "Açık"]], settings.theme);
  const author = h("input", { type: "text", value: settings.author, placeholder: "Açıklamalarda görünecek ad" });
  const layout = h("select", {}, ...[["continuous", "Sürekli"], ["single", "Tek sayfa"], ["double", "Çift sayfa"], ["cover", "Çift sayfa (kapaklı)"]].map(([v, l]) => h("option", { value: v }, l)));
  layout.value = settings.layout;
  const boxes = h("input", { type: "checkbox" });
  boxes.checked = settings.showTextBoxes;
  const fontList = h("div", {});
  const renderFonts = async () => {
    const fonts = await app.engine.call("userFonts");
    fontList.innerHTML = "";
    if (!fonts.length) fontList.append(h("div", { class: "hint" }, "Henüz içe aktarılmış yazı tipi yok. Uygulama Liberation (Arial/Times/Courier uyumlu) ve DejaVu Sans ile gelir; Türkçe karakterlerin tamamını destekler."));
    for (const f of fonts) fontList.append(h("div", { class: "list-item" }, h("span", { class: "grow" }, h("span", {}, f.family), h("span", { class: "meta" }, [f.bold && "Kalın", f.italic && "İtalik"].filter(Boolean).join(", ") || "Normal")),
      h("button", { class: "icon-btn", html: icon("trash"), onclick: async () => { await app.fontStore.remove(f.id); renderFonts(); } })));
  };
  renderFonts();
  const body = h("div", {},
    field("Tema", theme.el),
    field("Yazar adı", author),
    field("Varsayılan sayfa düzeni", layout),
    h("label", { class: "checkline" }, boxes, "Metin kutularını göster"),
    h("div", { class: "section-title" }, "Yazı tipleri"),
    fontList,
    h("button", { class: "btn", style: { marginTop: "8px" }, onclick: async () => { await app.fontStore.importFonts(); renderFonts(); } }, "TTF / OTF içe aktar…"),
  );
  const ok = await openSheet({ title: "Ayarlar", body, buttons: [{ label: "Kapat", value: null }, { label: "Kaydet", primary: true, value: true }] });
  if (!ok) return;
  settings.theme = theme.get();
  settings.author = author.value.trim();
  settings.showTextBoxes = boxes.checked;
  if (settings.layout !== layout.value && app.isOpen) app.viewer.setLayout(layout.value);
  settings.layout = layout.value;
  saveSettings();
  app.applyTheme();
  if (app.isOpen) {
    if (settings.showTextBoxes) app.loadVisibleBlocks();
    app.viewer.updateOverlays();
  }
}
