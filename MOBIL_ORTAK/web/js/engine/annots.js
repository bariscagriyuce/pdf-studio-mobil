// Açıklama (annotation) işlemleri: vurgu, not, çizim, şekil, damga, bağlantı.
// Masaüstündeki core/annots.py karşılığı.

import * as G from "./geom.js";
import { withPage } from "./textedit.js";
import { EngineError } from "./engine.js";

export const TYPE_NAMES = {
  Text: "Yapışkan not", FreeText: "Serbest metin", Line: "Çizgi", Square: "Dikdörtgen",
  Circle: "Elips", Polygon: "Çokgen", PolyLine: "Çoklu çizgi", Highlight: "Vurgu",
  Underline: "Altı çizili", Squiggly: "Dalgalı", StrikeOut: "Üstü çizili", Stamp: "Damga",
  Caret: "Şapka", Ink: "Serbest çizim", FileAttachment: "Dosya eki", Redact: "Karartma",
  Widget: "Form alanı", Link: "Bağlantı", Popup: "Açılır not", Sound: "Ses", Movie: "Film",
};

export const STAMP_TEXTS = [
  "Approved", "AsIs", "Confidential", "Departmental", "Draft", "Experimental",
  "Expired", "Final", "ForComment", "ForPublicRelease", "NotApproved",
  "NotForPublicRelease", "Sold", "TopSecret",
];

export const STAMP_LABELS = {
  Approved: "Onaylandı", AsIs: "Olduğu gibi", Confidential: "Gizli", Departmental: "Birim içi",
  Draft: "Taslak", Experimental: "Deneysel", Expired: "Süresi doldu", Final: "Son hâli",
  ForComment: "Görüşe", ForPublicRelease: "Kamuya açık", NotApproved: "Onaylanmadı",
  NotForPublicRelease: "Kamuya kapalı", Sold: "Satıldı", TopSecret: "Çok gizli",
};

export const NOTE_ICONS = ["Note", "Comment", "Key", "Help", "NewParagraph", "Paragraph", "Insert"];

const MARKUP = { highlight: "Highlight", underline: "Underline", strikeout: "StrikeOut", squiggly: "Squiggly" };
const MARKUP_LABELS = { highlight: "Vurgu", underline: "Altını çiz", strikeout: "Üstünü çiz", squiggly: "Dalgalı çizgi" };
const SKIP_TYPES = new Set(["Widget", "Popup", "Link"]);

// ------------------------------------------------------------ yardımcılar
function annotId(a) {
  const obj = a.getObject();
  return obj.isIndirect() ? obj.asIndirect() : 0;
}

function safe(fn, dflt) {
  try {
    return fn();
  } catch {
    return dflt;
  }
}

function dateStr(d) {
  if (!d || !(d instanceof Date) || isNaN(d)) return "";
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export function annotInfo(pno, a) {
  const type = a.getType();
  return {
    pno,
    id: annotId(a),
    type,
    typeName: TYPE_NAMES[type] || type,
    rect: a.getBounds(),
    author: safe(() => a.getAuthor(), ""),
    content: safe(() => a.getContents(), ""),
    modified: dateStr(safe(() => a.getModificationDate(), null)),
    color: safe(() => a.getColor(), []),
    fill: safe(() => (a.hasInteriorColor() ? a.getInteriorColor() : []), []),
    opacity: safe(() => a.getOpacity(), 1),
    width: safe(() => (a.hasBorder() ? a.getBorderWidth() : 0), 0),
    icon: safe(() => (a.hasIcon() ? a.getIcon() : ""), ""),
    hasFill: safe(() => a.hasInteriorColor(), false),
    hasBorder: safe(() => a.hasBorder(), false),
    resizable: !["Text", "FileAttachment", "Caret"].includes(type),
  };
}

function findAnnot(page, id) {
  for (const a of page.getAnnotations()) if (annotId(a) === id) return a;
  throw new EngineError("Açıklama bulunamadı", "annot");
}

function finish(a, { color, fill, opacity, width, author, content, subject } = {}) {
  if (color !== undefined && color !== null) safe(() => a.setColor(color));
  if (fill !== undefined) safe(() => a.hasInteriorColor() && a.setInteriorColor(fill || []));
  if (width !== undefined && width !== null) safe(() => a.hasBorder() && a.setBorderWidth(width));
  if (opacity !== undefined && opacity !== null) safe(() => a.setOpacity(Math.max(0, Math.min(1, opacity))));
  if (author) safe(() => a.setAuthor(author));
  if (content !== undefined && content !== null && content !== "") safe(() => a.setContents(content));
  if (subject) safe(() => a.setSubject(subject));
  safe(() => a.setModificationDate(new Date()));
  a.update();
  return a;
}

// ------------------------------------------------------------------ listeler
export function listAnnots(E, pno) {
  return withPage(E.doc, pno, (page) =>
    page.getAnnotations().filter((a) => !SKIP_TYPES.has(a.getType())).map((a) => annotInfo(pno, a)));
}

export function allAnnots(E) {
  const out = [];
  for (let i = 0; i < E.pageCount; i++) out.push(...listAnnots(E, i));
  return out;
}

export function annotAt(E, pno, pt, tolerance = 4) {
  return withPage(E.doc, pno, (page) => {
    let best = null, bestArea = Infinity;
    for (const a of page.getAnnotations()) {
      const type = a.getType();
      if (SKIP_TYPES.has(type)) continue;
      let r = a.getBounds();
      if (["Line", "Ink", "PolyLine", "Polygon"].includes(type)) r = G.inflate(r, tolerance);
      if (G.contains(r, pt) && G.area(r) < bestArea) {
        best = a;
        bestArea = G.area(r);
      }
    }
    return best ? annotInfo(pno, best) : null;
  });
}

// ------------------------------------------------------------------ işaretleme
export function addMarkup(E, pno, kind, quads, { color = [1, 0.85, 0.2], opacity = 1, author = "", content = "" } = {}) {
  if (!quads || !quads.length) throw new EngineError("Seçili metin yok", "selection");
  return E.edit(MARKUP_LABELS[kind], [pno], () => withPage(E.doc, pno, (page) => {
    const a = page.createAnnotation(MARKUP[kind]);
    a.setQuadPoints(quads);
    return annotId(finish(a, { color, opacity, author, content }));
  }));
}

export function addStickyNote(E, pno, point, text, { icon = "Note", color = [1, 0.85, 0.3], author = "" } = {}) {
  return E.edit("Yapışkan not", [pno], () => withPage(E.doc, pno, (page) => {
    const a = page.createAnnotation("Text");
    a.setRect([point[0], point[1], point[0] + 20, point[1] + 20]);
    a.setIcon(icon);
    return annotId(finish(a, { color, author, content: text }));
  }));
}

export const FREE_TEXT_FONTS = { Helvetica: "Helv", Times: "TiRo", Courier: "Cour" };

export function addFreeText(E, pno, rect, text, {
  fontsize = 12, font = "Helvetica", textColor = [0, 0, 0], fillColor = null, borderWidth = 0,
  align = 0, opacity = 1, author = "",
} = {}) {
  return E.edit("Serbest metin kutusu", [pno], () => withPage(E.doc, pno, (page) => {
    const a = page.createAnnotation("FreeText");
    a.setRect(G.norm(rect));
    a.setContents(text);
    a.setDefaultAppearance(FREE_TEXT_FONTS[font] || "Helv", fontsize, textColor);
    safe(() => a.setQuadding(align));
    safe(() => a.setBorderWidth(borderWidth));
    // FreeText'te C (renk) arka plan dolgusudur
    if (fillColor) safe(() => a.setColor(fillColor));
    else safe(() => a.setColor([]));
    return annotId(finish(a, { opacity, author }));
  }));
}

// -------------------------------------------------------------------- çizimler
export function addInk(E, pno, strokes, { color = [0.9, 0.1, 0.1], width = 2, opacity = 1, author = "" } = {}) {
  const hand = strokes.filter((s) => s.length > 1).map((s) => s.map((p) => [+p[0], +p[1]]));
  if (!hand.length) return null;
  return E.edit("Serbest çizim", [pno], () => withPage(E.doc, pno, (page) => {
    const a = page.createAnnotation("Ink");
    a.setInkList(hand);
    return annotId(finish(a, { color, width, opacity, author }));
  }));
}

/** kind: rect | ellipse | line | arrow | double_arrow */
export function addShape(E, pno, kind, p0, p1, { color = [0.85, 0.1, 0.1], fill = null, width = 1.5, opacity = 1, author = "", content = "" } = {}) {
  const label = { rect: "Dikdörtgen", ellipse: "Elips", line: "Çizgi", arrow: "Ok", double_arrow: "Çift ok", measure: "Ölçü" }[kind] || "Şekil";
  return E.edit(label, [pno], () => withPage(E.doc, pno, (page) => {
    let a;
    if (kind === "rect" || kind === "ellipse") {
      a = page.createAnnotation(kind === "rect" ? "Square" : "Circle");
      a.setRect(G.rect(p0[0], p0[1], p1[0], p1[1]));
      if (fill) a.setInteriorColor(fill);
    } else {
      a = page.createAnnotation("Line");
      a.setLine(p0, p1);
      if (kind === "arrow") a.setLineEndingStyles("None", "OpenArrow");
      else if (kind === "double_arrow") a.setLineEndingStyles("OpenArrow", "OpenArrow");
      else if (kind === "measure") {
        a.setLineEndingStyles("Butt", "Butt");
        safe(() => a.setIntent("LineDimension"));
        safe(() => a.setLineCaption(true));
      }
    }
    return annotId(finish(a, { color, width, opacity, author, content }));
  }));
}

export function addPolygon(E, pno, points, { closed = true, color = [0.85, 0.1, 0.1], fill = null, width = 1.5, opacity = 1, author = "" } = {}) {
  if (points.length < 2) return null;
  return E.edit(closed ? "Çokgen" : "Çoklu çizgi", [pno], () => withPage(E.doc, pno, (page) => {
    const a = page.createAnnotation(closed ? "Polygon" : "PolyLine");
    a.setVertices(points);
    if (fill && closed) a.setInteriorColor(fill);
    return annotId(finish(a, { color, width, opacity, author }));
  }));
}

export function addStamp(E, pno, rect, stampIndex = 0, { color = [0.1, 0.4, 0.1], opacity = 1, author = "" } = {}) {
  return E.edit("Damga", [pno], () => withPage(E.doc, pno, (page) => {
    const a = page.createAnnotation("Stamp");
    const r = G.norm(rect);
    if (r[2] - r[0] < 20) { r[2] = r[0] + 150; r[3] = r[1] + 45; }
    a.setRect(r);
    a.setIcon(STAMP_TEXTS[stampIndex] || STAMP_TEXTS[0]);
    return annotId(finish(a, { color, opacity, author }));
  }));
}

export function addCaret(E, pno, rect, { color = [0.1, 0.3, 0.9], author = "" } = {}) {
  return E.edit("Şapka işareti", [pno], () => withPage(E.doc, pno, (page) => {
    const a = page.createAnnotation("Caret");
    const r = G.norm(rect);
    a.setRect([r[0], r[1], r[0] + 12, r[1] + 12]);
    return annotId(finish(a, { color, author }));
  }));
}

export function addFileAttachment(E, pno, point, name, bytes, { author = "", mime = "application/octet-stream" } = {}) {
  return E.edit("Dosya eki", [pno], () => {
    const fs = E.doc.addEmbeddedFile(name, mime, bytes, new Date(), new Date(), false);
    return withPage(E.doc, pno, (page) => {
      const a = page.createAnnotation("FileAttachment");
      a.setRect([point[0], point[1], point[0] + 18, point[1] + 22]);
      a.setFileSpec(fs);
      return annotId(finish(a, { author, content: name }));
    });
  });
}

/** Dosya eki açıklamasının içeriği: { name, bytes } */
export function attachmentData(E, pno, id) {
  return withPage(E.doc, pno, (page) => {
    const a = findAnnot(page, id);
    const fs = a.getFileSpec();
    const params = E.doc.getFilespecParams(fs);
    const buf = E.doc.getEmbeddedFileContents(fs);
    return { name: params.filename || "ek", bytes: buf ? buf.asUint8Array().slice() : new Uint8Array() };
  });
}

// -------------------------------------------------------------------- bağlantı
export function addLink(E, pno, rect, { uri = "", targetPage = null } = {}) {
  return E.edit("Bağlantı ekle", [pno], () => withPage(E.doc, pno, (page) => {
    let target = uri;
    if (!target && targetPage !== null) {
      target = E.doc.formatLinkURI({ type: "Fit", chapter: 0, page: targetPage, x: 0, y: 0, width: 0, height: 0, zoom: 0 });
    }
    if (!target) throw new EngineError("Bağlantı hedefi yok", "link");
    page.createLink(G.norm(rect), target);
  }));
}

export function listLinks(E, pno) {
  return withPage(E.doc, pno, (page) => page.getLinks().map((l) => {
    const uri = l.getURI();
    let target = -1;
    if (!l.isExternal()) target = safe(() => E.doc.resolveLink(uri), -1);
    return { rect: l.getBounds(), uri: l.isExternal() ? uri : "", page: target };
  }));
}

export function deleteLink(E, pno, rect) {
  return E.edit("Bağlantıyı sil", [pno], () => withPage(E.doc, pno, (page) => {
    let n = 0;
    for (const l of page.getLinks()) {
      if (G.intersects(l.getBounds(), rect)) { page.deleteLink(l); n++; }
    }
    return n;
  }));
}

// -------------------------------------------------------------------- düzenleme
export function deleteAnnot(E, pno, id) {
  return E.edit("Açıklamayı sil", [pno], () => withPage(E.doc, pno, (page) => page.deleteAnnotation(findAnnot(page, id))));
}

export function deleteAnnots(E, items) {
  const pages = [...new Set(items.map((i) => i.pno))];
  return E.edit("Açıklamaları sil", pages, () => {
    for (const pno of pages) {
      const ids = new Set(items.filter((i) => i.pno === pno).map((i) => i.id));
      withPage(E.doc, pno, (page) => {
        for (const a of page.getAnnotations()) if (ids.has(annotId(a))) page.deleteAnnotation(a);
      });
    }
  });
}

export function clearAnnots(E, pages = null) {
  const rng = pages || [...Array(E.pageCount).keys()];
  let n = 0;
  E.edit("Tüm açıklamaları kaldır", rng, () => {
    for (const pno of rng) {
      withPage(E.doc, pno, (page) => {
        for (const a of page.getAnnotations().slice()) {
          if (a.getType() === "Widget") continue;
          page.deleteAnnotation(a);
          n++;
        }
      });
    }
  });
  return n;
}

export function updateAnnot(E, pno, id, props = {}) {
  return E.edit("Açıklamayı düzenle", [pno], () => withPage(E.doc, pno, (page) => {
    const a = findAnnot(page, id);
    if (props.rect) transformAnnot(a, a.getBounds(), G.norm(props.rect));
    if (props.icon) safe(() => a.setIcon(props.icon));
    if (props.fontsize || props.textColor) {
      const da = safe(() => a.getDefaultAppearance(), null);
      if (da) safe(() => a.setDefaultAppearance(da.font, props.fontsize || da.size, props.textColor || da.color));
    }
    if (props.content !== undefined) safe(() => a.setContents(props.content || ""));
    if (props.author !== undefined) safe(() => a.setAuthor(props.author || ""));
    finish(a, { color: props.color, fill: props.fill, opacity: props.opacity, width: props.width });
    return annotInfo(pno, a);
  }));
}

/** Açıklamanın tüm koordinatlarını eski kutudan yeni kutuya taşır/ölçekler. */
function transformAnnot(a, from, to) {
  const type = a.getType();
  const moveOnly = ["Text", "FileAttachment", "Caret"].includes(type);
  const fn = moveOnly
    ? (p) => [p[0] + (to[0] - from[0]), p[1] + (to[1] - from[1])]
    : (p) => G.mapPoint(p, from, to);
  if (a.hasInkList()) {
    a.setInkList(a.getInkList().map((s) => s.map(fn)));
  } else if (a.hasLine()) {
    const [p, q] = a.getLine();
    a.setLine(fn(p), fn(q));
  } else if (a.hasVertices()) {
    a.setVertices(a.getVertices().map(fn));
  } else if (a.hasQuadPoints()) {
    a.setQuadPoints(a.getQuadPoints().map((q) => {
      const out = [];
      for (let i = 0; i < 8; i += 2) out.push(...fn([q[i], q[i + 1]]));
      return out;
    }));
  } else if (a.hasRect()) {
    const r = a.getRect();
    const p0 = fn([r[0], r[1]]), p1 = fn([r[2], r[3]]);
    a.setRect(G.rect(p0[0], p0[1], p1[0], p1[1]));
  }
  a.update();
}

export function moveAnnot(E, pno, id, dx, dy) {
  return E.edit("Açıklamayı taşı", [pno], () => withPage(E.doc, pno, (page) => {
    const a = findAnnot(page, id);
    const b = a.getBounds();
    transformAnnot(a, b, G.offset(b, dx, dy));
    return annotInfo(pno, a);
  }));
}

export function resizeAnnot(E, pno, id, rect) {
  return E.edit("Açıklamayı boyutlandır", [pno], () => withPage(E.doc, pno, (page) => {
    const a = findAnnot(page, id);
    transformAnnot(a, a.getBounds(), G.norm(rect));
    return annotInfo(pno, a);
  }));
}

/** Açıklamaları/form alanlarını sayfa içeriğine gömer (düzenlenemez hâle getirir). */
export function flatten(E, { annots = true, widgets = true } = {}) {
  return E.edit("Düzleştir", null, (doc) => doc.bake(annots, widgets));
}
