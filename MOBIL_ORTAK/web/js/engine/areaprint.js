// Sayfanın seçili bir alanını yazdırma / ayrı PDF olarak çıkarma.
// Masaüstündeki core/areaprint.py karşılığı.
//
// Masaüstü alanı Qt yazıcısına raster olarak çizer. Mobilde yazdırma sistemin
// yazdırma penceresine bir PDF verilerek yapıldığı için alan doğrudan vektör
// bir "baskı PDF'i"ne yerleştirilir: metin seçilebilir kalır, çözünürlük kaybı
// olmaz. Açıklamalar ve form alanları geçici bir kopyada içeriğe gömülür
// (ekranda görünen birebir basılsın).
//
// Koordinatlar: alanlar sayfanın *görüntülenen* düzlemindedir (uygulamanın
// geri kalanıyla aynı). Döndürülmüş sayfalarda PDF düzlemine dönüşümü
// pageToXObject'in verdiği sayfa matrisi üstlenir.

import { mu } from "./mu.js";
import * as G from "./geom.js";
import { PageWriter, pageToXObject } from "./writer.js";
import { EngineError } from "./engine.js";

/** Arayüzde gösterilen metinleri çeviri anahtarı olarak işaretler (çevirmez). */
const N_ = (text) => text;

export const FIT = "fit"; // kâğıda sığdır (büyüt/küçült)
export const ACTUAL = "actual"; // gerçek boyut (%100)
export const CUSTOM = "custom"; // özel ölçek

/** Kesim işaretleri için kenar payı (7,5 mm) */
export const MARK_MARGIN_PT = (7.5 * 72) / 25.4;

export const PAPERS = {
  [N_("A4 (210 × 297 mm)")]: [595, 842],
  [N_("A5 (148 × 210 mm)")]: [420, 595],
  [N_("A3 (297 × 420 mm)")]: [842, 1191],
  [N_("Letter (8,5 × 11 inç)")]: [612, 792],
  [N_("Legal (8,5 × 14 inç)")]: [612, 1008],
};

/** Alanın kâğıt üzerindeki konumu → [x, y, genişlik, yükseklik] (nokta) */
export function placement(areaW, areaH, paperW, paperH, { mode = FIT, scale = 1, center = true, upscale = true } = {}) {
  if (areaW <= 0 || areaH <= 0) return [0, 0, 0, 0];
  let s;
  if (mode === FIT) {
    s = Math.min(paperW / areaW, paperH / areaH);
    if (!upscale) s = Math.min(s, 1);
  } else if (mode === CUSTOM) {
    s = Math.max(0.01, scale);
  } else {
    s = 1;
  }
  const w = areaW * s, h = areaH * s;
  return center ? [(paperW - w) / 2, (paperH - h) / 2, w, h] : [0, 0, w, h];
}

/** Alanı sayfa sınırlarına kırpar (görüntülenen düzlemde). */
export function clampToPage(E, pno, rect) {
  const b = E.withPage(pno, (p) => p.getBounds());
  return G.intersect(G.norm(rect), b);
}

function cutMarks(w, r) {
  const mm = 72 / 25.4;
  const len = 6 * mm, gap = 1.5 * mm;
  const ops = ["q 0.31 0.31 0.31 RG 0.3 w"];
  for (const [cx, sx] of [[r[0], -1], [r[2], 1]]) {
    for (const [cy, sy] of [[r[1], -1], [r[3], 1]]) {
      ops.push(`${cx + sx * gap} ${cy} m ${cx + sx * (gap + len)} ${cy} l S`);
      ops.push(`${cx} ${cy + sy * gap} m ${cx} ${cy + sy * (gap + len)} l S`);
    }
  }
  ops.push("Q");
  w.raw(ops.join("\n"));
}

/**
 * Alanları yeni bir PDF'e yerleştirir; her öğe bir kâğıt (sayfa) olur.
 * items: [{ pno, rect }] — rect görüntülenen düzlemde
 * opts:
 *   paper: [g, y] kâğıt boyutu (nokta); null → alanın kendi boyutu ("PDF olarak kaydet")
 *   orientation: "auto" | "portrait" | "landscape"  (auto: geniş alanda yatay)
 *   mode: fit | actual | custom, scale, upscale, center, marks
 */
export function areaPdf(E, items, opts = {}) {
  const { paper = null, orientation = "auto", mode = FIT, scale = 1, upscale = true, center = true, marks = false } = opts;
  const src = new mu.PDFDocument(E.requireDoc().saveToBuffer(""));
  const out = new mu.PDFDocument();
  try {
    if (E.password && src.needsPassword()) src.authenticatePassword(E.password);
    // Açıklamalar ve form alanları ayrı nesnelerdir; içeriğe gömülmezlerse basılmaz
    try { src.bake(true, true); } catch { /* gömülemeyen açıklama: olduğu gibi */ }
    const map = out.newGraftMap();
    const ctx = { doc: out, fonts: E.fonts, cache: { fonts: new Map(), gs: new Map(), text: new Map() } };
    let n = 0;
    for (const { pno, rect } of items) {
      if (pno < 0 || pno >= src.countPages()) continue;
      const bounds = src.loadPage(pno);
      const b = bounds.getBounds();
      bounds.destroy();
      const area = G.intersect(G.norm(rect), b);
      if (G.isEmpty(area) || G.width(area) < 1 || G.height(area) < 1) continue;
      const aw = G.width(area), ah = G.height(area);

      let pw, ph, pad = 0, place;
      if (!paper) {
        // gerçek boyutta, kenar boşluksuz
        pw = aw; ph = ah;
        place = [0, 0, aw, ah];
      } else {
        [pw, ph] = paper;
        const land = orientation === "landscape" || (orientation === "auto" && aw > ah);
        if (land !== pw > ph) [pw, ph] = [ph, pw];
        pad = marks ? MARK_MARGIN_PT : 0;
        const p = placement(aw, ah, pw - 2 * pad, ph - 2 * pad, { mode, scale, center, upscale });
        place = [p[0] + pad, p[1] + pad, p[2], p[3]];
      }
      out.insertPage(n, out.addPage([0, 0, pw, ph], 0, {}, ""));
      const { ref, T } = pageToXObject(out, src, pno, map);
      const s = place[2] / aw;
      // kaynak PDF → görüntülenen düzlem → alanın köşesi orijin → ölçek → kâğıttaki yer
      const m = G.concat(T, [s, 0, 0, s, place[0] - area[0] * s, place[1] - area[1] * s]);
      const target = [place[0], place[1], place[0] + place[2], place[1] + place[3]];
      const w = new PageWriter(ctx, n);
      w.raw(`q ${target[0]} ${target[1]} ${place[2]} ${place[3]} re W n`);
      w.form(ref, m);
      w.raw("Q");
      if (marks && paper) cutMarks(w, target);
      w.commit();
      n++;
    }
    if (!n) throw new EngineError(N_("Yazdırılacak geçerli bir alan yok"), "area");
    return out.saveToBuffer("garbage=compact,compress").asUint8Array().slice();
  } finally {
    out.destroy();
    src.destroy();
  }
}
