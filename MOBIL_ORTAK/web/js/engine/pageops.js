// Sayfa düzeyi işlemler: ekle, sil, döndür, taşı, kırp, birleştir, böl, filigran.
// Masaüstündeki core/pageops.py karşılığı.

import { mu } from "./mu.js";
import * as G from "./geom.js";
import { withPage, resolveStyle } from "./textedit.js";
import { PageWriter, pageToXObject, fitMatrix } from "./writer.js";
import { drawImage } from "./images.js";
import { EngineError, appendConverted, graftPages, inheritedRotation, SAVE_OPTIONS } from "./engine.js";

export const PAGE_PRESETS = {
  "A4 (595 x 842)": [595, 842],
  "A3 (842 x 1191)": [842, 1191],
  "A5 (420 x 595)": [420, 595],
  "Letter (612 x 792)": [612, 792],
  "Legal (612 x 1008)": [612, 1008],
  "Tabloid (792 x 1224)": [792, 1224],
};

const range = (n) => [...Array(n).keys()];

// ----------------------------------------------------------------- ekleme
export function insertBlank(E, index, width, height, count = 1) {
  return E.edit("Boş sayfa ekle", null, (doc) => {
    for (let i = 0; i < count; i++) doc.insertPage(index + i, doc.addPage([0, 0, width, height], 0, {}, ""));
  });
}

/** Sayfaları bağımsız kopyalar olarak hemen arkalarına çoğaltır. */
export function duplicatePages(E, indices) {
  const sel = [...new Set(indices)].sort((a, b) => a - b);
  return E.edit("Sayfayı çoğalt", null, (doc) => {
    // Kaynağı ayrı bir kopyadan almak, içerik akışlarının ve açıklamaların
    // paylaşılmasını önler (birini düzenlemek diğerini bozmasın).
    const src = new mu.PDFDocument(doc.saveToBuffer(""));
    if (E.password && src.needsPassword()) src.authenticatePassword(E.password);
    try {
      // kaynak sayfa i, önündeki çoğaltılan sayfa sayısı kadar kayar
      const pageFor = (i) => i + sel.filter((s) => s < i).length;
      graftPages(doc, src, sel.map((pno, k) => [pno, pno + k + 1]), pageFor);
    } finally {
      src.destroy();
    }
  });
}

export function deletePages(E, indices) {
  const drop = new Set(indices);
  const keep = range(E.pageCount).filter((i) => !drop.has(i));
  if (!keep.length) throw new EngineError("Belgede en az bir sayfa kalmalı", "last-page");
  return E.edit("Sayfa sil", null, (doc) => doc.rearrangePages(keep));
}

export function reorderPages(E, order, label = "Sayfaları yeniden sırala") {
  return E.edit(label, null, (doc) => doc.rearrangePages(order));
}

/** `indices` sayfalarını, taşımadan önceki `target` konumunun önüne getirir. */
export function movePages(E, indices, target) {
  const sel = [...new Set(indices)].sort((a, b) => a - b);
  const s = new Set(sel);
  const rest = range(E.pageCount).filter((i) => !s.has(i));
  const before = rest.filter((i) => i < target);
  const after = rest.filter((i) => i >= target);
  return reorderPages(E, [...before, ...sel, ...after]);
}

export function reversePages(E) {
  return reorderPages(E, range(E.pageCount).reverse(), "Sıralamayı ters çevir");
}

export function rotatePages(E, indices, delta) {
  return E.edit("Sayfayı döndür", null, (doc) => {
    for (const pno of indices) {
      const obj = doc.findPage(pno);
      obj.put("Rotate", (((inheritedRotation(obj) + delta) % 360) + 360) % 360);
    }
  });
}

export function setRotation(E, indices, value) {
  return E.edit("Dönüşü ayarla", null, (doc) => {
    for (const pno of indices) doc.findPage(pno).put("Rotate", ((value % 360) + 360) % 360);
  });
}

function boxOf(obj, name) {
  const b = obj.getInheritable(name);
  if (!b.isArray()) return null;
  const v = [];
  b.forEach((x) => v.push(x.asNumber()));
  return G.norm(v);
}

/** rect: kırpma alanı, `refPage` sayfasının görüntülenen koordinatlarında. */
export function cropPages(E, indices, rect, refPage = null) {
  return E.edit("Sayfayı kırp", null, (doc) => {
    const ref = refPage ?? indices[0];
    // Referans sayfadaki kutuyu sayfa sınırlarına göre orantısal kaydet;
    // aynı ölçüdeki tüm sayfalara birebir uygulanır (masaüstüyle aynı davranış).
    const refBounds = withPage(doc, ref, (p) => p.getBounds());
    for (const pno of indices) {
      withPage(doc, pno, (page) => {
        const b = page.getBounds();
        const r = pno === ref ? G.norm(rect) : G.offset(G.norm(rect), b[0] - refBounds[0], b[1] - refBounds[1]);
        const clipped = G.intersect(r, b);
        if (G.isEmpty(clipped)) return;
        const pdfRect = G.transformRect(clipped, G.invert(page.getTransform()));
        const media = boxOf(page.getObject(), "MediaBox") || pdfRect;
        const final = G.intersect(pdfRect, media);
        if (!G.isEmpty(final)) page.setPageBox("CropBox", final);
      });
    }
  });
}

export function resetCrop(E, indices) {
  return E.edit("Kırpmayı sıfırla", null, (doc) => {
    for (const pno of indices) {
      const obj = doc.findPage(pno);
      const media = obj.getInheritable("MediaBox");
      obj.delete("CropBox");
      for (const k of ["TrimBox", "ArtBox", "BleedBox"]) obj.delete(k);
      if (!media.isNull()) obj.put("CropBox", media);
    }
  });
}

/** Sayfa içeriğini yeni boyuta ölçekleyerek yeniden oluşturur. */
export function resizePages(E, indices, width, height) {
  const targets = [...new Set(indices)].sort((a, b) => a - b);
  return E.edit("Sayfa boyutunu değiştir", null, (doc) => {
    for (const pno of targets) {
      const { ref, T, bounds } = pageToXObject(doc, doc, pno, null);
      const pageObj = doc.addPage([0, 0, width, height], 0, {}, "");
      doc.insertPage(pno + 1, pageObj);
      const ctx = { doc, fonts: E.fonts, cache: E.cache };
      const w = new PageWriter(ctx, pno + 1);
      const m = fitMatrix(T, bounds, [0, 0, width, height], true);
      // PageWriter ters dönüşümü kendisi uygular; burada görüntü uzayında çiziyoruz.
      w.form(ref, m);
      w.commit();
      doc.deletePage(pno);
    }
  });
}

// ------------------------------------------------------------------ birleştir
/** files: [{ name, bytes, password? }] — PDF ya da görüntü/XPS/EPUB... */
export function mergeFiles(E, files, at) {
  let added = 0;
  E.edit("PDF birleştir", null, (doc) => {
    let pos = at;
    for (const f of files) {
      const n = appendConverted(doc, f.bytes, f.name, pos, f.password);
      pos += n;
      added += n;
    }
  });
  return added;
}

export function insertImagesAsPages(E, files, at) {
  let added = 0;
  E.edit("Görüntüyü sayfa olarak ekle", null, (doc) => {
    let pos = at;
    for (const f of files) {
      const n = appendConverted(doc, f.bytes, f.name, pos);
      pos += n;
      added += n;
    }
  });
  return added;
}

// ------------------------------------------------------------------- çıkarma
export function subsetBytes(E, indices) {
  const out = new mu.PDFDocument();
  try {
    const map = out.newGraftMap();
    indices.forEach((pno, k) => map.graftPage(k, E.doc, pno));
    return out.saveToBuffer(SAVE_OPTIONS).asUint8Array().slice();
  } finally {
    out.destroy();
  }
}

export function extractPages(E, indices) {
  return subsetBytes(E, indices);
}

/** ranges: [[a, b], ...] (0 tabanlı, uçlar dahil). Dönüş: [{ name, bytes }] */
export function splitByRanges(E, ranges, stem = "belge") {
  return ranges.map(([a, b], idx) => ({
    name: `${stem}_${String(idx + 1).padStart(2, "0")}_${a + 1}-${b + 1}.pdf`,
    bytes: subsetBytes(E, range(b - a + 1).map((i) => a + i)),
  }));
}

export function splitEvery(E, n, stem = "belge") {
  const total = E.pageCount;
  const ranges = [];
  for (let i = 0; i < total; i += n) ranges.push([i, Math.min(i + n - 1, total - 1)]);
  return splitByRanges(E, ranges, stem);
}

// ------------------------------------------------------------------ filigran
export async function addTextWatermark(E, text, indices, {
  fontsize = 48, color = [0.6, 0.6, 0.6], opacity = 0.25, angle = 45, family = "Helvetica", behind = false,
} = {}) {
  const st = await resolveStyle(E, { family, size: fontsize, color }, text);
  return E.edit("Filigran ekle", indices, () => {
    for (const pno of indices) {
      const w = new PageWriter(E, pno);
      const b = w.bounds;
      const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      const tw = w.measure(st.spec, text, fontsize);
      // Görüntü uzayında y aşağı olduğu için saat yönünün tersine açı eksi işaretlidir
      w.text(st.spec, text, cx - tw / 2, cy + fontsize * 0.35, fontsize, {
        color, opacity, rotate: -angle, around: [cx, cy],
      });
      w.commit({ behind });
    }
  });
}

export function addImageWatermark(E, bytes, indices, { opacity = 0.2, scale = 0.5, behind = false } = {}) {
  return E.edit("Görüntü filigranı", indices, () => {
    for (const pno of indices) {
      const b = withPage(E.doc, pno, (p) => p.getBounds());
      const w = (b[2] - b[0]) * scale, h = (b[3] - b[1]) * scale;
      const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      drawImage(E, pno, [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], bytes, { keepProportion: true, overlay: !behind, opacity });
    }
  });
}

// --------------------------------------------------------------- sayfa numarası
export function formatNumber(fmt, vars) {
  return fmt.replace(/\{(n|total|N|page)\}/g, (_, k) => String(vars[k]));
}

export async function addPageNumbers(E, indices, {
  fmt = "{n} / {total}", position = "alt-orta", fontsize = 10, color = [0, 0, 0],
  margin = 28, startAt = 1, family = "Helvetica",
} = {}) {
  const total = E.pageCount;
  const texts = indices.map((pno, i) => formatNumber(fmt, { n: startAt + i, N: startAt + i, total, page: pno + 1 }));
  const st = await resolveStyle(E, { family, size: fontsize, color }, texts.join(""));
  return E.edit("Sayfa numarası ekle", indices, () => {
    indices.forEach((pno, i) => {
      const w = new PageWriter(E, pno);
      const b = w.bounds;
      const text = texts[i];
      const tw = w.measure(st.spec, text, fontsize);
      const [vert, horiz] = position.split("-");
      const y = vert === "üst" ? b[1] + margin : b[3] - margin;
      const x = horiz === "sol" ? b[0] + margin : horiz === "sağ" ? b[2] - margin - tw : (b[0] + b[2] - tw) / 2;
      w.text(st.spec, text, x, y, fontsize, { color });
      w.commit();
    });
  });
}

export async function addHeaderFooter(E, indices, {
  header = "", footer = "", fontsize = 9, color = [0.2, 0.2, 0.2], margin = 24, family = "Helvetica",
} = {}) {
  const st = await resolveStyle(E, { family, size: fontsize, color }, header + footer);
  return E.edit("Üst/alt bilgi", indices, () => {
    for (const pno of indices) {
      const w = new PageWriter(E, pno);
      const b = w.bounds;
      for (const [text, y] of [[header, b[1] + margin], [footer, b[3] - margin]]) {
        if (!text) continue;
        const tw = w.measure(st.spec, text, fontsize);
        w.text(st.spec, text, (b[0] + b[2] - tw) / 2, y, fontsize, { color });
      }
      w.commit();
    }
  });
}
