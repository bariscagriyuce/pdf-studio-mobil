// Metin düzenleme motoru: blok tespiti, yerinde değiştirme, ara-değiştir.
// Masaüstündeki core/textedit.py karşılığı.

import { mu } from "./mu.js";
import * as G from "./geom.js";
import { normalizePdfFontname } from "./fonts.js";
import { PageWriter, insertTextbox, measuredHeight, ASCENT } from "./writer.js";

export const ALIGN = { sol: 0, orta: 1, "sağ": 2, "iki yana": 3 };

export function withPage(doc, pno, fn) {
  const page = doc.loadPage(pno);
  try {
    return fn(page);
  } finally {
    page.destroy();
  }
}

function toRgb(color) {
  if (!color || !color.length) return [0, 0, 0];
  if (color.length === 1) return [color[0], color[0], color[0]];
  if (color.length === 4) {
    const [c, m, y, k] = color;
    return [1 - Math.min(1, c + k), 1 - Math.min(1, m + k), 1 - Math.min(1, y + k)];
  }
  return color.slice(0, 3);
}

// ------------------------------------------------------------------ okuma
/**
 * Sayfanın yapılandırılmış metni (önbellekli). Her blok satırlardan, her satır
 * aynı yazı tipi/punto/renkteki parçalardan (span) ve karakterlerden oluşur.
 */
export function pageText(E, pno) {
  const key = E.version + ":" + pno;
  const hit = E.cache.text.get(key);
  if (hit) return hit;
  const blocks = withPage(E.doc, pno, (page) => {
    const st = page.toStructuredText("preserve-whitespace");
    const out = [];
    let blk = null, line = null, span = null;
    try {
      st.walk({
        beginTextBlock(bbox) { blk = { bbox, lines: [] }; },
        beginLine(bbox, wmode, dir) { line = { bbox, dir, spans: [], chars: [] }; span = null; },
        onChar(c, origin, font, size, quad, color) {
          const fname = font.getName();
          const rgb = toRgb(color);
          const key2 = fname + "|" + size.toFixed(2) + "|" + rgb.map((v) => v.toFixed(3)).join(",");
          if (!span || span.key !== key2) {
            const n = normalizePdfFontname(fname);
            span = {
              key: key2, text: "", bbox: null, origin,
              style: {
                family: n.family, size: Math.round(size * 100) / 100, color: rgb,
                bold: n.bold || font.isBold(), italic: n.italic || font.isItalic(),
                align: 0, lineSpacing: 1.15, pdfFont: fname,
              },
            };
            line.spans.push(span);
          }
          const r = G.quadToRect(quad);
          span.text += c;
          span.bbox = G.union(span.bbox, r);
          line.chars.push({ c, r, o: origin, span });
        },
        endLine() {
          if (line && line.chars.length) blk.lines.push(line);
        },
        endTextBlock() {
          if (blk && blk.lines.length) out.push(blk);
        },
      });
    } finally {
      st.destroy();
    }
    return out;
  });
  for (const b of blocks) {
    for (const l of b.lines) l.text = l.chars.map((ch) => ch.c).join("");
    b.text = b.lines.map((l) => l.text).join("\n");
  }
  E.cache.text.set(key, blocks);
  return blocks;
}

/** Arayüze gönderilecek sade blok nesnesi (karakter listesi olmadan). */
export function blockInfo(pno, b, index) {
  const first = b.lines[0].chars[0];
  const style = { ...b.lines[0].spans[0].style };
  // satır aralığını ilk iki satırın taban çizgileri arasından tahmin et
  if (b.lines.length > 1) {
    const d = b.lines[1].chars[0].o[1] - first.o[1];
    if (d > 0 && style.size > 0) style.lineSpacing = Math.round((d / style.size) * 100) / 100;
  }
  return {
    pno, index, bbox: b.bbox, text: b.text, style,
    baseline: first.o[1], x: first.o[0],
    lines: b.lines.map((l) => ({
      bbox: l.bbox, text: l.text,
      spans: l.spans.map((s) => ({ text: s.text, bbox: s.bbox, style: s.style })),
    })),
  };
}

export function textBlocks(E, pno) {
  return pageText(E, pno).map((b, i) => blockInfo(pno, b, i));
}

export function blockAt(E, pno, pt) {
  let best = null, bi = -1;
  pageText(E, pno).forEach((b, i) => {
    if (G.contains(b.bbox, pt) && (!best || G.area(b.bbox) < G.area(best.bbox))) { best = b; bi = i; }
  });
  return best ? blockInfo(pno, best, bi) : null;
}

export function lineAt(E, pno, pt) {
  for (const b of pageText(E, pno)) {
    if (!G.contains(b.bbox, pt)) continue;
    for (const l of b.lines) {
      const r = [l.bbox[0], l.bbox[1] - 1, l.bbox[2], l.bbox[3] + 1];
      if (G.contains(r, pt)) {
        return { bbox: l.bbox, text: l.text, style: { ...l.spans[0].style }, baseline: l.chars[0].o[1] };
      }
    }
  }
  return null;
}

/** Sayfadaki kelimeler okuma sırasıyla: [{ text, rect }] */
export function words(E, pno) {
  const out = [];
  for (const b of pageText(E, pno)) {
    for (const l of b.lines) {
      let cur = null;
      for (const ch of l.chars) {
        if (/\s/.test(ch.c)) { cur = null; continue; }
        if (!cur) { cur = { text: "", rect: null }; out.push(cur); }
        cur.text += ch.c;
        cur.rect = G.union(cur.rect, ch.r);
      }
    }
  }
  return out;
}

export function wordsInRect(E, pno, rect) {
  return words(E, pno).filter((w) => {
    const inter = G.intersect(w.rect, rect);
    return !G.isEmpty(inter) && G.area(inter) > G.area(w.rect) * 0.35;
  });
}

/** İki nokta arasındaki metni seçer: { quads, text } */
export function selection(E, pno, p, q) {
  return withPage(E.doc, pno, (page) => {
    const st = page.toStructuredText("preserve-whitespace");
    try {
      const quads = st.highlight(p, q, 4000);
      const text = st.copy(p, q);
      return { quads, rects: quads.map(G.quadToRect), text };
    } finally {
      st.destroy();
    }
  });
}

/** Bir alanın içindeki metin (masaüstündeki get_textbox). */
export function rectText(E, pno, rect) {
  const lines = [];
  for (const b of pageText(E, pno)) {
    for (const l of b.lines) {
      const s = l.chars.filter((ch) => G.contains(rect, G.center(ch.r))).map((ch) => ch.c).join("");
      if (s.trim()) lines.push(s);
    }
  }
  return lines.join("\n");
}

export function pageFullText(E, pno) {
  return withPage(E.doc, pno, (page) => {
    const st = page.toStructuredText("preserve-whitespace");
    try {
      return st.asText();
    } finally {
      st.destroy();
    }
  });
}

// ------------------------------------------------------------- stil
/** Arayüz stilini ({family,size,color,bold,italic,align,lineSpacing}) yazılabilir hâle getirir. */
export async function resolveStyle(ctx, style, text) {
  const spec = ctx.fonts.resolve(style.family || "Helvetica", !!style.bold, !!style.italic, text || "");
  await ctx.fonts.ensure(spec);
  if (spec.kind === "ttf") await ctx.fonts.ensure(ctx.fonts.fallbackFor(spec));
  return {
    spec,
    size: +style.size || 11,
    color: style.color || [0, 0, 0],
    align: style.align | 0,
    lineSpacing: +style.lineSpacing || 1.15,
    opacity: style.opacity,
  };
}

// ------------------------------------------------------------- yazma / silme
export const REDACT = { IMAGE_NONE: 0, IMAGE_REMOVE: 1, IMAGE_PIXELS: 2, LINE_NONE: 0, LINE_IF_COVERED: 1, LINE_IF_TOUCHED: 2, TEXT_REMOVE: 0, TEXT_NONE: 1 };

/**
 * Alanlardaki içeriği gerçekten kaldırır (redaksiyon). fill verilirse alanların
 * üzeri o renkle boyanır.
 */
export function redactRects(ctx, pno, rects, { fill = null, images = REDACT.IMAGE_NONE, graphics = REDACT.LINE_NONE, text = REDACT.TEXT_REMOVE } = {}) {
  withPage(ctx.doc, pno, (page) => {
    for (const r of rects) {
      const a = page.createAnnotation("Redact");
      a.setRect(G.norm(r));
    }
    page.applyRedactions(false, images, graphics, text);
  });
  if (fill) {
    const w = new PageWriter(ctx, pno);
    for (const r of rects) w.fillRect(G.norm(r), fill);
    w.commit();
  }
}

/** Metni kutuya sığdırır; gerekirse punto küçültür. Kalan yeri döndürür. */
export function insertFitted(w, box, text, style, { shrink = true, baseline } = {}) {
  let size = style.size;
  for (let i = 0; i < 48; i++) {
    const st = { ...style, size };
    const rc = insertTextbox(w, box, text, st, { baseline, force: !shrink || size <= 3 });
    if (rc >= -0.01 || !shrink || size <= 3) return rc;
    size = Math.max(3, size - Math.max(0.4, size * 0.06));
  }
  return -1;
}

function doReplace(ctx, pno, rect, newText, st, opts) {
  const { background = null, grow = true, expandWidth = true, rightMargin = 32, baseline = null } = opts;
  const box = G.norm(rect);
  redactRects(ctx, pno, [G.inflate(box, 0.6)], { fill: background });
  if (!newText.trim()) return true;
  const w = new PageWriter(ctx, pno);
  try {
    const pb = w.bounds;
    const target = box.slice();
    const limit = Math.max(target[0] + 20, pb[2] - rightMargin);
    if (expandWidth && !newText.trim().includes("\n")) target[2] = Math.max(target[2], limit);
    target[2] = Math.min(pb[2] - 2, target[2]);
    if (grow) {
      const need = measuredHeight(w, newText, Math.max(8, target[2] - target[0]), st);
      if (need > target[3] - target[1]) target[3] = Math.min(pb[3] - 2, target[1] + need);
    }
    const first = baseline != null ? baseline : target[1] + st.size * ASCENT;
    target[3] = Math.max(target[3], first + st.size * 0.3);
    const rc = insertFitted(w, target, newText, st, { baseline: first });
    w.commit();
    return rc >= -0.01;
  } catch (e) {
    w.close();
    throw e;
  }
}

/**
 * Bir alandaki metni siler ve yerine yeni metni aynı stille yazar.
 * grow: metin sığmazsa kutu aşağı büyür; expandWidth: tek satırlık bloklar
 * sayfa sağ kenarına kadar genişleyebilir (uzayan metin gereksiz yere alt
 * satıra kaymaz).
 */
export async function replaceRegionText(E, pno, rect, newText, style, opts = {}) {
  const st = await resolveStyle(E, style, newText);
  return E.edit(opts.label || "Metni düzenle", [pno], () => doReplace(E, pno, rect, newText, st, opts));
}

/** Metin düzenleme penceresi için canlı önizleme: sadece o sayfanın geçici kopyası üzerinde. */
export async function previewReplace(E, pno, rect, newText, style, opts = {}, scale = 2) {
  const st = await resolveStyle(E, style, newText);
  const tmp = new mu.PDFDocument();
  try {
    tmp.graftPage(0, E.doc, pno);
    const ctx = { doc: tmp, fonts: E.fonts, cache: { fonts: new Map(), gs: new Map(), text: new Map() } };
    doReplace(ctx, 0, rect, newText, st, opts);
    const page = tmp.loadPage(0);
    try {
      const b = page.getBounds();
      const clip = [b[0], Math.max(b[1], rect[1] - 24), b[2], Math.min(b[3], Math.max(rect[3], rect[1] + 60) + 60)];
      const bbox = clip.map((v, i) => (i < 2 ? Math.floor(v * scale) : Math.ceil(v * scale)));
      const pix = new mu.Pixmap(mu.ColorSpace.DeviceRGB, bbox, true);
      pix.clear(255);
      const m = mu.Matrix.scale(scale, scale);
      const dev = new mu.DrawDevice(mu.Matrix.identity, pix);
      page.run(dev, m);
      dev.close();
      dev.destroy();
      const out = { width: pix.getWidth(), height: pix.getHeight(), data: new Uint8ClampedArray(pix.getPixels()), clip };
      pix.destroy();
      return out;
    } finally {
      page.destroy();
    }
  } finally {
    tmp.destroy();
  }
}

export async function insertTextBox(E, pno, rect, text, style, { label = "Metin ekle" } = {}) {
  const st = await resolveStyle(E, style, text);
  return E.edit(label, [pno], () => {
    const w = new PageWriter(E, pno);
    const box = G.norm(rect);
    if (box[3] - box[1] < st.size * 1.4) box[3] = box[1] + st.size * 1.6;
    if (box[2] - box[0] < 12) box[2] = box[0] + 200;
    const rc = insertFitted(w, box, text, st);
    w.commit();
    return rc >= -0.01;
  });
}

export function deleteTextRegion(E, pno, rect, { background = null, removeImages = false, removeGraphics = false, label = "Alanı sil" } = {}) {
  return E.edit(label, [pno], () => {
    redactRects(E, pno, [rect], {
      fill: background,
      images: removeImages ? REDACT.IMAGE_REMOVE : REDACT.IMAGE_NONE,
      graphics: removeGraphics ? REDACT.LINE_IF_COVERED : REDACT.LINE_NONE,
    });
  });
}

/** Gerçek karartma: içerik kaldırılır, üzerine dolgu çizilir. areas: [{ pno, rect }] */
export function redactAreas(E, areas, { fill = [0, 0, 0], removeImages = true } = {}) {
  const byPage = new Map();
  for (const a of areas) {
    if (!byPage.has(a.pno)) byPage.set(a.pno, []);
    byPage.get(a.pno).push(a.rect);
  }
  return E.edit("Karart (redaksiyon)", [...byPage.keys()], () => {
    for (const [pno, rects] of byPage) {
      redactRects(E, pno, rects, {
        fill,
        images: removeImages ? REDACT.IMAGE_REMOVE : REDACT.IMAGE_NONE,
        graphics: REDACT.LINE_IF_COVERED,
      });
    }
    return byPage.size;
  });
}

// --------------------------------------------------------------- ara / değiştir
const fold = (c) => {
  const l = c.toLocaleLowerCase("tr");
  return l.length === 1 ? l : c.toLowerCase().charAt(0);
};
const isWordChar = (c) => !!c && /[\p{L}\p{N}_]/u.test(c);

function searchPage(E, pno, needle, { caseSensitive = false, wholeWords = false } = {}) {
  // Sayfa metnini düzleştir: bloklar "\n", satırlar " " ile ayrılır; ardışık
  // boşluklar tek boşluğa indirilir. Her karakterin kutusu ve satırı saklanır.
  const chars = [];
  const push = (c, r, line, src = null) => {
    if (/\s/.test(c)) {
      if (!chars.length || chars[chars.length - 1].c === " " || chars[chars.length - 1].c === "\n") return;
      c = " ";
    }
    chars.push({ c, r, line, src });
  };
  let lineId = 0;
  for (const b of pageText(E, pno)) {
    for (const l of b.lines) {
      lineId++;
      for (const ch of l.chars) push(ch.c, ch.r, lineId, ch);
      push(" ", null, lineId);
    }
    if (chars.length && chars[chars.length - 1].c === " ") chars[chars.length - 1].c = "\n";
    else chars.push({ c: "\n", r: null, line: lineId });
  }
  const norm = needle.replace(/\s+/g, " ").trim();
  if (!norm) return [];
  const hay = chars.map((ch) => (caseSensitive ? ch.c : fold(ch.c)));
  const pat = [...norm].map((c) => (caseSensitive ? c : fold(c)));
  const hits = [];
  outer: for (let i = 0; i + pat.length <= hay.length; i++) {
    for (let k = 0; k < pat.length; k++) {
      const h = hay[i + k] === "\n" ? " " : hay[i + k];
      if (h !== pat[k]) continue outer;
    }
    const j = i + pat.length;
    if (wholeWords && (isWordChar(chars[i - 1]?.c) || isWordChar(chars[j]?.c))) continue;
    const perLine = new Map();
    const matched = chars.slice(i, j).filter((ch) => ch.r);
    for (const ch of matched) perLine.set(ch.line, G.union(perLine.get(ch.line), ch.r));
    const rects = [...perLine.values()];
    if (rects.length) {
      hits.push({ pno, rects, rect: rects.reduce((a, r) => G.union(a, r), null), first: matched[0], text: chars.slice(i, j).map((c) => c.c).join("") });
    }
    i = j - 1;
  }
  return hits;
}

export function findAll(E, needle, opts = {}) {
  if (!needle) return [];
  const n = E.pageCount;
  const pages = opts.pages || [...Array(n).keys()];
  const out = [];
  for (const pno of pages) {
    for (const h of searchPage(E, pno, needle, opts)) {
      out.push({ pno, rects: h.rects, rect: h.rect, context: contextFor(E, pno, h) });
    }
    if (opts.limit && out.length >= opts.limit) break;
  }
  return out;
}

function contextFor(E, pno, hit) {
  for (const b of pageText(E, pno)) {
    for (const l of b.lines) {
      if (G.intersects(l.bbox, hit.rects[0])) return l.text.trim().slice(0, 120);
    }
  }
  return hit.text;
}

/** Belge genelinde metin değiştirir. Değiştirilen örnek sayısını döndürür. */
export async function replaceAll(E, needle, replacement, opts = {}) {
  if (!needle) return 0;
  const n = E.pageCount;
  const pages = opts.pages || [...Array(n).keys()];
  // Önce tüm eşleşmeleri ve stillerini topla (yazı tiplerini önceden yükleyebilmek için)
  const plan = [];
  for (const pno of pages) {
    const hits = searchPage(E, pno, needle, opts);
    if (!hits.length) continue;
    const items = [];
    for (const h of hits) {
      const src = h.first && h.first.src;
      const base = opts.matchStyle === false || !src ? { ...(opts.style || {}) } : { ...src.span.style };
      const st = await resolveStyle(E, { ...base, align: 0, lineSpacing: 1 }, replacement);
      items.push({ h, st, origin: src ? src.o : [h.rect[0], h.rect[3]] });
    }
    plan.push({ pno, items });
  }
  if (!plan.length) return 0;
  let count = 0;
  E.edit(`'${needle}' değiştir`, plan.map((p) => p.pno), () => {
    for (const { pno, items } of plan) {
      const rects = items.flatMap((it) => it.h.rects);
      redactRects(E, pno, rects, { fill: null });
      if (!replacement) { count += items.length; continue; }
      const w = new PageWriter(E, pno);
      const right = w.bounds[2] - 2;
      for (const { h, st, origin } of items) {
        // Yeni metin eskisinden genişse sağdaki kelimeye binmesin: önce yatayda
        // en fazla %80'e kadar sıkıştır, yetmezse punto küçült.
        const slot = h.rects[0][2] - origin[0];
        const natural = w.measure(st.spec, replacement, st.size);
        let size = st.size;
        let hscale = 1;
        if (natural > slot + 0.5) {
          hscale = Math.max(0.8, slot / natural);
          if (natural * hscale > slot + 0.5) size = Math.max(3, (st.size * slot) / (natural * hscale));
        }
        w.text(st.spec, replacement, origin[0], origin[1], size, { color: st.color, hscale });
        count++;
      }
      w.commit();
    }
  });
  return count;
}
