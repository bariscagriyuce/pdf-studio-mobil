// Şifreleme, izinler ve belge temizliği. Masaüstündeki core/security.py karşılığı.

import { withPage } from "./textedit.js";
import { EngineError, SAVE_OPTIONS } from "./engine.js";

/** Arayüzde gösterilen metinleri çeviri anahtarı olarak işaretler (çevirmez). */
const N_ = (text) => text;

export const PERMISSIONS = [
  ["print", 4, N_("Yazdırma")],
  ["modify", 8, N_("İçeriği değiştirme")],
  ["copy", 16, N_("Metin/görüntü kopyalama")],
  ["annotate", 32, N_("Açıklama ekleme")],
  ["form", 256, N_("Form doldurma")],
  ["accessibility", 512, N_("Erişilebilirlik için çıkarma")],
  ["assemble", 1024, N_("Sayfa düzenleme (birleştir/böl)")],
  ["print_hq", 2048, N_("Yüksek çözünürlüklü yazdırma")],
];

export const METHODS = {
  [N_("AES-256 (en güçlü)")]: "aes-256",
  "AES-128": "aes-128",
  "RC4-128 (eski)": "rc4-128",
  [N_("Şifreleme yok")]: "none",
};

/** Seçili izinlerden PDF /P değeri (ayrılmış bitler 1). */
export function permissionFlags(selected) {
  let value = -3904; // 0xFFFFF0C0
  for (const [key, flag] of PERMISSIONS) if (selected.includes(key)) value |= flag;
  return value;
}

export function currentPermissions(E) {
  const p = E.permissions();
  const map = { print: "print", modify: "edit", copy: "copy", annotate: "annotate", form: "form", accessibility: "accessibility", assemble: "assemble", print_hq: "print-hq" };
  return PERMISSIONS.filter(([k]) => p[map[k]]).map(([k]) => k);
}

function checkPassword(pw) {
  // mupdf seçenek dizesi virgülle ayrılır; parolada virgül olamaz
  if (pw && /[,=]/.test(pw)) throw new EngineError(N_("Parola virgül (,) veya eşittir (=) içeremez"), "password-chars");
}

export function saveEncrypted(E, { userPw = "", ownerPw = "", allowed = null, method = "aes-256" } = {}) {
  checkPassword(userPw);
  checkPassword(ownerPw);
  if (method === "none") return saveDecrypted(E);
  const perms = permissionFlags(allowed || PERMISSIONS.map(([k]) => k));
  const opts = [SAVE_OPTIONS, `encrypt=${method}`, `permissions=${perms}`, `owner-password=${ownerPw || userPw}`];
  if (userPw) opts.push(`user-password=${userPw}`);
  return E.requireDoc().saveToBuffer(opts.join(",")).asUint8Array().slice();
}

export function saveDecrypted(E) {
  return E.requireDoc().saveToBuffer(SAVE_OPTIONS + ",encrypt=none").asUint8Array().slice();
}

/** Gizlilik temizliği: meta veri, JavaScript, ekler ve bağlantılar. */
export function sanitize(E, { metadata = true, js = true, attachments = false, links = false } = {}) {
  return E.edit(N_("Belgeyi temizle"), null, (doc) => {
    const root = doc.getTrailer().get("Root");
    if (metadata) {
      for (const k of ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate"]) {
        try { doc.setMetaData("info:" + k, ""); } catch { /* yok say */ }
      }
      const info = doc.getTrailer().get("Info");
      if (!info.isNull()) info.forEach((v, k) => info.delete(k));
      root.delete("Metadata");
    }
    if (js) {
      const names = root.get("Names");
      if (!names.isNull()) names.delete("JavaScript");
      root.delete("OpenAction");
      root.delete("AA");
      const n = doc.countObjects();
      for (let i = 1; i < n; i++) {
        let obj;
        try {
          obj = doc.newIndirect(i).resolve();
        } catch {
          continue;
        }
        if (!obj.isDictionary()) continue;
        for (const key of ["JS", "AA"]) if (!obj.get(key).isNull()) obj.delete(key);
        const s = obj.get("S");
        if (s.isName() && s.asName() === "JavaScript") obj.delete("S");
      }
    }
    if (attachments) {
      try {
        for (const name of Object.keys(doc.getEmbeddedFiles())) doc.deleteEmbeddedFile(name);
      } catch { /* yok say */ }
      for (let pno = 0; pno < doc.countPages(); pno++) {
        withPage(doc, pno, (page) => {
          for (const a of page.getAnnotations().slice()) if (a.getType() === "FileAttachment") page.deleteAnnotation(a);
        });
      }
    }
    if (links) {
      for (let pno = 0; pno < doc.countPages(); pno++) {
        withPage(doc, pno, (page) => { for (const l of page.getLinks()) page.deleteLink(l); });
      }
    }
  });
}

export function documentReport(E, { path = "" } = {}) {
  const doc = E.requireDoc();
  const meta = E.getMetadata();
  let annots = 0, images = 0, words = 0, links = 0;
  for (let pno = 0; pno < doc.countPages(); pno++) {
    withPage(doc, pno, (page) => {
      annots += page.getAnnotations().filter((a) => !["Widget", "Popup"].includes(a.getType())).length;
      links += page.getLinks().length;
      const st = page.toStructuredText("preserve-images");
      try {
        st.walk({ onImageBlock() { images++; } });
        words += st.asText().split(/\s+/).filter(Boolean).length;
      } finally {
        st.destroy();
      }
    });
  }
  return [
    [N_("Dosya"), path || E.name],
    [N_("Sayfa sayısı"), doc.countPages()],
    [N_("PDF sürümü"), meta.format],
    [N_("Başlık"), meta.title],
    [N_("Yazar"), meta.author],
    [N_("Konu"), meta.subject],
    [N_("Anahtar kelimeler"), meta.keywords],
    [N_("Üretici"), meta.producer],
    [N_("Oluşturan"), meta.creator],
    [N_("Oluşturma"), meta.creationDate],
    [N_("Değiştirme"), meta.modDate],
    [N_("Şifreleme"), meta.encryption && meta.encryption !== "None" ? meta.encryption : N_("Hayır")],
    [N_("Form içeriyor"), E.hasForm() ? N_("Evet") : N_("Hayır")],
    [N_("Açıklama sayısı"), annots],
    [N_("Bağlantı sayısı"), links],
    [N_("Görüntü sayısı"), images],
    [N_("Kelime sayısı"), words],
    [N_("Yer imi sayısı"), E.getToc().length],
    [N_("Gömülü dosya"), Object.keys(safeFiles(doc)).length],
  ];
}

function safeFiles(doc) {
  try {
    return doc.getEmbeddedFiles();
  } catch {
    return {};
  }
}
