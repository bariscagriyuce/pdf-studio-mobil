// Dışa aktarma: görüntü, metin, HTML, sıkıştırma ve OCR metin katmanı.
// Masaüstündeki core/exporting.py karşılığı. OCR'ın kendisi (tanıma) arayüz
// tarafında tesseract.js ile yapılır; burada bulunan kelimeler sayfaya
// görünmez, aranabilir metin olarak yazılır.

import { mu } from "./mu.js";
import { withPage, resolveStyle } from "./textedit.js";
import { PageWriter } from "./writer.js";
import { subsetBytes } from "./pageops.js";

/** Arayüzde gösterilen metinleri çeviri anahtarı olarak işaretler (çevirmez). */
const N_ = (text) => text;

export const TEXT_MODES = {
  [N_("Düz metin (.txt)")]: ["text", "txt"],
  "HTML (.html)": ["html", "html"],
  "XHTML (.xhtml)": ["xhtml", "xhtml"],
  "XML (.xml)": ["xml", "xml"],
  "JSON (.json)": ["json", "json"],
  [N_("Markdown benzeri (.md)")]: ["md", "md"],
};

export const IMAGE_FORMATS = ["png", "jpg", "webp", "pam"];

const pad3 = (n) => String(n).padStart(3, "0");

export function exportImages(E, { pages = null, dpi = 200, format = "png", stem = "sayfa", alpha = false, gray = false, quality = 92 } = {}) {
  const rng = pages || [...Array(E.pageCount).keys()];
  return rng.map((pno) => {
    // webp'yi motor değil tarayıcı kodlar: burada PNG üretilir, worker dönüştürür
    const fmt = format === "webp" ? "png" : format;
    const img = E.renderImage(pno, { dpi, format: fmt, gray, alpha, quality });
    return { name: `${stem}_${pad3(pno + 1)}.${format}`, bytes: img.bytes, convert: format === "webp" ? "image/webp" : null };
  });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const bb = (r) => r.map((v) => v.toFixed(2)).join(" ");

function pageXml(E, pno) {
  return withPage(E.doc, pno, (page) => {
    const b = page.getBounds();
    const st = page.toStructuredText("preserve-whitespace");
    const out = [`<page number="${pno + 1}" width="${(b[2] - b[0]).toFixed(2)}" height="${(b[3] - b[1]).toFixed(2)}">`];
    let span = null;
    const flush = () => {
      if (span) out.push(`<span font="${esc(span.font)}" size="${span.size.toFixed(2)}">${esc(span.text)}</span>`);
      span = null;
    };
    try {
      st.walk({
        beginTextBlock(bbox) { out.push(`<block bbox="${bb(bbox)}">`); },
        beginLine(bbox) { out.push(`<line bbox="${bb(bbox)}">`); },
        onChar(c, origin, font, size) {
          const name = font.getName();
          if (!span || span.font !== name || span.size !== size) {
            flush();
            span = { font: name, size, text: "" };
          }
          span.text += c;
        },
        endLine() { flush(); out.push("</line>"); },
        endTextBlock() { out.push("</block>"); },
        onImageBlock(bbox, transform, image) {
          out.push(`<image bbox="${bb(bbox)}" width="${image.getWidth()}" height="${image.getHeight()}"/>`);
        },
      });
    } finally {
      st.destroy();
    }
    out.push("</page>");
    return out.join("\n");
  });
}

export function exportText(E, { mode = "text", pages = null, separator = true, title = "belge" } = {}) {
  const rng = pages || [...Array(E.pageCount).keys()];
  if (mode === "json") {
    const data = rng.map((pno) => withPage(E.doc, pno, (page) => {
      const st = page.toStructuredText("preserve-whitespace");
      try {
        return { page: pno + 1, content: JSON.parse(st.asJSON()) };
      } finally {
        st.destroy();
      }
    }));
    return JSON.stringify(data, null, 1);
  }
  if (mode === "xml") {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<document name="${esc(title)}">\n${rng.map((p) => pageXml(E, p)).join("\n")}\n</document>\n`;
  }
  if (mode === "html" || mode === "xhtml") {
    const body = rng.map((pno) => withPage(E.doc, pno, (page) => {
      const st = page.toStructuredText("preserve-whitespace");
      try {
        return st.asHTML(pno + 1);
      } finally {
        st.destroy();
      }
    })).join("\n");
    if (mode === "xhtml") {
      return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/><title>${esc(title)}</title></head><body>\n${body}\n</body></html>\n`;
    }
    return `<!doctype html><html><head><meta charset='utf-8'><title>${esc(title)}</title></head><body>\n${body}\n</body></html>\n`;
  }
  const chunks = rng.map((pno) => {
    const txt = withPage(E.doc, pno, (page) => {
      const st = page.toStructuredText("preserve-whitespace");
      try {
        return st.asText();
      } finally {
        st.destroy();
      }
    });
    if (mode === "md") return `\n## Sayfa ${pno + 1}\n\n${txt}`;
    return separator ? `\n----- Sayfa ${pno + 1} -----\n${txt}` : txt;
  });
  return chunks.join("");
}

export function exportPdfSubset(E, pages) {
  return subsetBytes(E, pages);
}

// ------------------------------------------------------------------ sıkıştırma
function rewriteImages(doc, dpi, quality) {
  // Görüntünün yerleşim boyutunu bilmeden güvenli üst sınır: en büyük sayfa
  // kenarını hedef DPI'da kaplayan piksel sayısı.
  let maxSide = 0;
  for (let i = 0; i < doc.countPages(); i++) {
    withPage(doc, i, (p) => {
      const b = p.getBounds();
      maxSide = Math.max(maxSide, b[2] - b[0], b[3] - b[1]);
    });
  }
  const limit = Math.max(64, Math.round((maxSide / 72) * dpi));
  const n = doc.countObjects();
  const masks = new Set();
  const images = [];
  for (let i = 1; i < n; i++) {
    let obj;
    try {
      obj = doc.newIndirect(i);
      if (!obj.isStream()) continue;
    } catch {
      continue;
    }
    const st = obj.get("Subtype");
    if (!st.isName() || st.asName() !== "Image") continue;
    const sm = obj.get("SMask");
    if (sm.isIndirect()) masks.add(sm.asIndirect());
    const mk = obj.get("Mask");
    if (mk.isIndirect()) masks.add(mk.asIndirect());
    images.push(obj);
  }
  let changed = 0;
  for (const ref of images) {
    const num = ref.asIndirect();
    if (masks.has(num)) continue;
    const im = ref.get("ImageMask");
    if (im.isBoolean() && im.asBoolean()) continue;
    if (ref.get("BitsPerComponent").asNumber() === 1) continue;
    let img, pix;
    try {
      img = doc.loadImage(ref);
      const w = img.getWidth(), h = img.getHeight();
      const oldLen = ref.readRawStream().length;
      pix = img.toPixmap();
      const cs = pix.getColorSpace();
      if (!cs || (!cs.isRGB() && !cs.isGray())) {
        const conv = pix.convertToColorSpace(mu.ColorSpace.DeviceRGB, false);
        pix.destroy();
        pix = conv;
      } else if (pix.getAlpha()) {
        const conv = pix.convertToColorSpace(cs, false);
        pix.destroy();
        pix = conv;
      }
      const scale = Math.min(1, limit / Math.max(w, h));
      if (scale < 0.95) {
        const nw = Math.max(1, Math.round(w * scale)), nh = Math.max(1, Math.round(h * scale));
        const warped = pix.warp([[0, 0], [w, 0], [w, h], [0, h]], nw, nh);
        pix.destroy();
        pix = warped;
      }
      const jpeg = pix.asJPEG(quality, false);
      if (jpeg.length >= oldLen * 0.95) continue;
      const gray = pix.getColorSpace().isGray();
      ref.writeRawStream(jpeg);
      ref.put("Filter", doc.newName("DCTDecode"));
      ref.delete("DecodeParms");
      ref.delete("Decode");
      ref.put("Width", pix.getWidth());
      ref.put("Height", pix.getHeight());
      ref.put("BitsPerComponent", 8);
      ref.put("ColorSpace", doc.newName(gray ? "DeviceGray" : "DeviceRGB"));
      changed++;
    } catch {
      /* dönüştürülemeyen görüntüyü olduğu gibi bırak */
    } finally {
      if (pix) pix.destroy();
    }
  }
  return changed;
}

/** Belgeyi küçültür. Dönüş: { before, after, bytes } — açık belge değişmez. */
export function compress(E, { imageDpi = 0, jpegQuality = 70, subsetFonts = true, clean = true } = {}) {
  const src = E.exportBytes();
  const doc = new mu.PDFDocument(src);
  try {
    if (E.password && doc.needsPassword()) doc.authenticatePassword(E.password);
    const images = imageDpi > 0 ? rewriteImages(doc, imageDpi, jpegQuality) : 0;
    if (subsetFonts) {
      try { doc.subsetFonts(); } catch { /* yok say */ }
    }
    const opts = ["garbage=deduplicate", "compress", "compress-fonts", "compress-images"];
    if (clean) opts.push("clean");
    const bytes = doc.saveToBuffer(opts.join(",")).asUint8Array().slice();
    return { before: src.length, after: bytes.length, bytes, images };
  } finally {
    doc.destroy();
  }
}

// ------------------------------------------------------------------------ OCR
/** OCR için sayfa görüntüsü (gri, PNG). */
export function ocrImage(E, pno, dpi = 300) {
  return E.renderImage(pno, { dpi, format: "png", gray: true, annots: false });
}

/**
 * Tanınan kelimeleri sayfaya görünmez (Tr 3) metin olarak yazar.
 * results: [{ pno, width, height, words: [{ text, bbox: [x0,y0,x1,y1] }] }]
 * (bbox, width/height ile aynı piksel uzayında)
 */
export async function applyOcr(E, results) {
  const st = await resolveStyle(E, { family: "Liberation Sans", size: 10 }, "ığşİĞŞ");
  let words = 0;
  E.edit("OCR uygula", results.map((r) => r.pno), () => {
    for (const r of results) {
      const w = new PageWriter(E, r.pno);
      const b = w.bounds;
      const sx = (b[2] - b[0]) / r.width, sy = (b[3] - b[1]) / r.height;
      for (const word of r.words) {
        const text = (word.text || "").trim();
        if (!text) continue;
        const x0 = b[0] + word.bbox[0] * sx, x1 = b[0] + word.bbox[2] * sx;
        const y0 = b[1] + word.bbox[1] * sy, y1 = b[1] + word.bbox[3] * sy;
        const size = Math.max(2, (y1 - y0) * 0.9);
        const natural = w.measure(st.spec, text, size);
        const hscale = natural > 0 ? Math.max(0.2, Math.min(5, (x1 - x0) / natural)) : 1;
        w.text(st.spec, text, x0, y1 - (y1 - y0) * 0.18, size, { renderMode: 3, hscale });
        words++;
      }
      w.commit({ behind: false });
    }
  });
  return words;
}
