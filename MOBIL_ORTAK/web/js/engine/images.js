// Sayfa içindeki görüntüleri listeleme, çıkarma, değiştirme, taşıma ve silme;
// sayfaya görüntü / imza yerleştirme. Masaüstündeki core/images.py karşılığı.

import { mu } from "./mu.js";
import * as G from "./geom.js";
import { withPage, redactRects, REDACT } from "./textedit.js";
import { PageWriter } from "./writer.js";
import { EngineError } from "./engine.js";

/** Arayüzde gösterilen metinleri çeviri anahtarı olarak işaretler (çevirmez). */
const N_ = (text) => text;

/** Sayfada görünen görüntüler: [{ index, rect, width, height, bpc, colorspace }] */
function walkImages(doc, pno, fn) {
  return withPage(doc, pno, (page) => {
    const st = page.toStructuredText("preserve-images");
    const out = [];
    try {
      let i = 0;
      st.walk({
        onImageBlock(bbox, transform, image) {
          out.push(fn(i++, bbox, image));
        },
      });
    } finally {
      st.destroy();
    }
    return out;
  });
}

function csName(image) {
  try {
    const cs = image.getColorSpace();
    return cs ? cs.getName() : image.getImageMask() ? "Maske" : "";
  } catch {
    return "";
  }
}

export function listImages(E, pno) {
  return walkImages(E.doc, pno, (index, rect, image) => ({
    pno, index, id: `${pno}:${index}`, rect,
    width: image.getWidth(), height: image.getHeight(),
    bpc: image.getBitsPerComponent(), colorspace: csName(image),
  }));
}

export function allImages(E) {
  const out = [];
  for (let i = 0; i < E.pageCount; i++) out.push(...listImages(E, i));
  return out;
}

export function imageAt(E, pno, pt) {
  let best = null;
  for (const img of listImages(E, pno)) {
    if (G.contains(img.rect, pt) && (!best || G.area(img.rect) < G.area(best.rect))) best = img;
  }
  return best;
}

function imageToPng(image) {
  let pix = image.toPixmap();
  try {
    const cs = pix.getColorSpace();
    if (cs && !cs.isRGB() && !cs.isGray()) {
      const conv = pix.convertToColorSpace(mu.ColorSpace.DeviceRGB, true);
      pix.destroy();
      pix = conv;
    }
    return pix.asPNG().slice();
  } finally {
    pix.destroy();
  }
}

/** Görüntüyü PNG olarak çıkarır. */
export function extractImage(E, pno, index) {
  const found = walkImages(E.doc, pno, (i, rect, image) => (i === index ? imageToPng(image) : null)).find(Boolean);
  if (!found) throw new EngineError(N_("Görüntü bulunamadı"), "image");
  return found;
}

/** Tüm gömülü görüntüler: [{ name, bytes }] (aynı görüntü bir kez). */
export function extractAllImages(E, { minSide = 8 } = {}) {
  const out = [];
  const seen = new Set();
  for (let pno = 0; pno < E.pageCount; pno++) {
    walkImages(E.doc, pno, (i, rect, image) => {
      const w = image.getWidth(), h = image.getHeight();
      if (w < minSide || h < minSide) return null;
      const png = imageToPng(image);
      let hash = 0;
      for (let k = 0; k < png.length; k += 97) hash = (hash * 31 + png[k]) | 0;
      const key = `${w}x${h}:${png.length}:${hash}`;
      if (seen.has(key)) return null;
      seen.add(key);
      out.push({ name: `s${String(pno + 1).padStart(3, "0")}_g${i + 1}.png`, bytes: png });
      return null;
    });
  }
  return out;
}

function largestOverlap(E, pno, rect) {
  let best = null, area = -1;
  for (const img of listImages(E, pno)) {
    const inter = G.intersect(img.rect, rect);
    if (!G.isEmpty(inter) && G.area(inter) > area) { best = img; area = G.area(inter); }
  }
  return best;
}

function removeImagesIn(E, pno, rect) {
  redactRects(E, pno, [G.inflate(rect, 0.5)], {
    images: REDACT.IMAGE_REMOVE, graphics: REDACT.LINE_NONE, text: REDACT.TEXT_NONE,
  });
}

/** Görüntü baytlarını (PNG/JPEG/...) sayfaya yerleştirir; alt işlev. */
export function drawImage(ctx, pno, rect, bytes, { keepProportion = true, overlay = true, opacity = 1 } = {}) {
  const image = new mu.Image(bytes);
  const ref = ctx.doc.addImage(image);
  let box = G.norm(rect);
  if (keepProportion) box = G.fitInside([image.getWidth(), image.getHeight()], box);
  const w = new PageWriter(ctx, pno);
  w.image(ref, box, opacity);
  w.commit({ behind: !overlay });
  return box;
}

export function placeImage(E, pno, rect, bytes, { label = N_("Görüntü ekle"), keepProportion = true, overlay = true, opacity = 1 } = {}) {
  return E.edit(label, [pno], () => drawImage(E, pno, rect, bytes, { keepProportion, overlay, opacity }));
}

export function deleteImage(E, pno, rect) {
  return E.edit(N_("Görüntüyü sil"), [pno], () => removeImagesIn(E, pno, rect));
}

export function replaceImage(E, pno, rect, bytes, { keepProportion = true } = {}) {
  return E.edit(N_("Görüntüyü değiştir"), [pno], () => {
    removeImagesIn(E, pno, rect);
    drawImage(E, pno, rect, bytes, { keepProportion });
  });
}

/** Görüntüyü kaldırıp yeni konum/boyutta yeniden yerleştirir. */
export function moveResizeImage(E, pno, oldRect, newRect, { keepProportion = true } = {}) {
  const img = largestOverlap(E, pno, oldRect);
  if (!img) throw new EngineError(N_("Görüntü bulunamadı"), "image");
  const png = extractImage(E, pno, img.index);
  return E.edit(N_("Görüntüyü taşı/boyutlandır"), [pno], () => {
    removeImagesIn(E, pno, img.rect);
    return drawImage(E, pno, newRect, png, { keepProportion });
  });
}
