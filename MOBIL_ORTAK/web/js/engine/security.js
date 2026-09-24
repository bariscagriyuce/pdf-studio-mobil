// Şifreleme, izinler ve belge temizliği. Masaüstündeki core/security.py karşılığı.

import { withPage } from "./textedit.js";
import { EngineError, SAVE_OPTIONS } from "./engine.js";

export const PERMISSIONS = [
  ["print", 4, "Yazdırma"],
  ["modify", 8, "İçeriği değiştirme"],
  ["copy", 16, "Metin/görüntü kopyalama"],
  ["annotate", 32, "Açıklama ekleme"],
  ["form", 256, "Form doldurma"],
  ["accessibility", 512, "Erişilebilirlik için çıkarma"],
  ["assemble", 1024, "Sayfa düzenleme (birleştir/böl)"],
  ["print_hq", 2048, "Yüksek çözünürlüklü yazdırma"],
];

export const METHODS = {
  "AES-256 (en güçlü)": "aes-256",
  "AES-128": "aes-128",
  "RC4-128 (eski)": "rc4-128",
  "Şifreleme yok": "none",
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
  if (pw && /[,=]/.test(pw)) throw new EngineError("Parola virgül (,) veya eşittir (=) içeremez", "password-chars");
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
  return E.edit("Belgeyi temizle", null, (doc) => {
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
    ["Dosya", path || E.name],
    ["Sayfa sayısı", doc.countPages()],
    ["PDF sürümü", meta.format],
    ["Başlık", meta.title],
    ["Yazar", meta.author],
    ["Konu", meta.subject],
    ["Anahtar kelimeler", meta.keywords],
    ["Üretici", meta.producer],
    ["Oluşturan", meta.creator],
    ["Oluşturma", meta.creationDate],
    ["Değiştirme", meta.modDate],
    ["Şifreleme", meta.encryption && meta.encryption !== "None" ? meta.encryption : "Hayır"],
    ["Form içeriyor", E.hasForm() ? "Evet" : "Hayır"],
    ["Açıklama sayısı", annots],
    ["Bağlantı sayısı", links],
    ["Görüntü sayısı", images],
    ["Kelime sayısı", words],
    ["Yer imi sayısı", E.getToc().length],
    ["Gömülü dosya", Object.keys(safeFiles(doc)).length],
  ];
}

function safeFiles(doc) {
  try {
    return doc.getEmbeddedFiles();
  } catch {
    return {};
  }
}
