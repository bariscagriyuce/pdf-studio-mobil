// Belge modeli: mupdf belgesini sarmalar, undo/redo ve değişiklik takibini yönetir.
// Masaüstündeki core/document.py + core/history.py + core/renderer.py karşılığı.

import { mu } from "./mu.js";
import * as G from "./geom.js";
import { FontManager } from "./fonts.js";

/** Arayüzde gösterilen metinleri çeviri anahtarı olarak işaretler (çevirmez). */
const N_ = (text) => text;

/** Motor hatası. İleti Türkçe çeviri anahtarıdır; değişken kısımlar params'ta
 *  ({name} gibi yer tutucularla) taşınır, arayüz seçili dile çevirir. */
export class EngineError extends Error {
  constructor(message, code, params) {
    super(params ? message.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m)) : message);
    this.key = message;
    this.code = code || "error";
    this.params = params || null;
  }
}

// --------------------------------------------------------------- geçmiş
/**
 * Belge baytlarının tam kopyalarını tutan basit ve güvenli undo yığını.
 * Karmaşık ters-işlem mantığı yerine tam kopya kullanılır; redaksiyon, sayfa
 * taşıma, font gömme gibi her işlem kayıpsız geri alınabilir. Mobilde bellek
 * kısıtlı olduğu için adım sayısının yanında toplam bayt sınırı da vardır.
 */
export class History {
  constructor(limit = 30, maxBytes = 256 * 1024 * 1024) {
    this.limit = limit;
    this.maxBytes = maxBytes;
    this.undoStack = [];
    this.redoStack = [];
  }
  clear() { this.undoStack = []; this.redoStack = []; }
  bytes() {
    let n = 0;
    for (const s of this.undoStack) n += s.data.length;
    for (const s of this.redoStack) n += s.data.length;
    return n;
  }
  push(snap) {
    this.undoStack.push(snap);
    this.redoStack = [];
    while (this.undoStack.length > this.limit || (this.undoStack.length > 1 && this.bytes() > this.maxBytes)) {
      this.undoStack.shift();
    }
  }
  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  undoLabel() { return this.undoStack.length ? this.undoStack[this.undoStack.length - 1].label : ""; }
  redoLabel() { return this.redoStack.length ? this.redoStack[this.redoStack.length - 1].label : ""; }
  undo(current) {
    const snap = this.undoStack.pop();
    if (!snap) return null;
    this.redoStack.push({ label: snap.label, data: current.data, page: current.page });
    return snap;
  }
  redo(current) {
    const snap = this.redoStack.pop();
    if (!snap) return null;
    this.undoStack.push({ label: snap.label, data: current.data, page: current.page });
    return snap;
  }
}

// ---------------------------------------------------------------- motor
export const SAVE_OPTIONS = "garbage=compact,compress";

export class Engine {
  constructor({ loadFont } = {}) {
    this.fonts = new FontManager(loadFont);
    this.doc = null;
    this.name = "Adsız.pdf";
    this.password = null;
    this.dirty = false;
    this.version = 0;
    this.history = new History();
    this.change = null;
    this._resetCache();
  }

  _resetCache() {
    this.cache = { fonts: new Map(), gs: new Map(), text: new Map(), wrapBegin: null, wrapEnd: null };
  }

  // ------------------------------------------------------------ durum
  get isOpen() { return !!this.doc; }
  get pageCount() { return this.doc ? this.doc.countPages() : 0; }

  requireDoc() {
    if (!this.doc) throw new EngineError(N_("Açık belge yok"), "no-doc");
    return this.doc;
  }

  state() {
    return {
      open: !!this.doc,
      name: this.name,
      version: this.version,
      dirty: this.dirty,
      pageCount: this.pageCount,
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo(),
      undoLabel: this.history.undoLabel(),
      redoLabel: this.history.redoLabel(),
      encrypted: this.doc ? this.isEncrypted() : false,
    };
  }

  // ----------------------------------------------------------- açma
  _openBytes(bytes, password) {
    let doc;
    try {
      doc = mu.Document.openDocument(bytes, "application/pdf");
    } catch (e) {
      throw new EngineError(N_("Belge açılamadı: {error}"), "open-failed", { error: e.message || String(e) });
    }
    if (doc.needsPassword()) {
      if (!password || !doc.authenticatePassword(password)) {
        doc.destroy();
        throw new EngineError(password ? N_("Parola yanlış") : N_("Belge parola korumalı"), "password");
      }
    }
    const pdf = doc.asPDF();
    if (!pdf) {
      doc.destroy();
      throw new EngineError(N_("Bu dosya bir PDF değil"), "not-pdf");
    }
    return pdf;
  }

  _install(doc, name) {
    if (this.doc && this.doc !== doc) this.doc.destroy();
    this.doc = doc;
    if (name !== undefined) this.name = name || "Adsız.pdf";
    this._resetCache();
    this.version++;
    this.change = { structural: true };
  }

  open(bytes, name, password) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const isPdf = looksLikePdf(data);
    let doc;
    if (isPdf) {
      doc = this._openBytes(data, password);
    } else {
      // Görüntü, XPS, EPUB, CBZ... gibi mupdf'in açabildiği biçimleri PDF'e çevir
      doc = new mu.PDFDocument(convertToPdf(data, name));
      name = (name || "Belge").replace(/\.[^.]+$/, "") + ".pdf";
    }
    this._install(doc, name);
    this.password = isPdf ? password || null : null;
    this.history.clear();
    this.dirty = !isPdf;
    return this.info();
  }

  newBlank(width = 595, height = 842, pages = 1) {
    const doc = new mu.PDFDocument();
    for (let i = 0; i < Math.max(1, pages); i++) doc.insertPage(-1, doc.addPage([0, 0, width, height], 0, {}, ""));
    this._install(doc, "Adsız.pdf");
    this.password = null;
    this.history.clear();
    this.dirty = true;
    return this.info();
  }

  newFromImages(files) {
    const doc = new mu.PDFDocument();
    for (const file of files) appendConverted(doc, file.bytes, file.name, doc.countPages());
    if (!doc.countPages()) doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, {}, ""));
    this._install(doc, "Görüntüler.pdf");
    this.password = null;
    this.history.clear();
    this.dirty = true;
    return this.info();
  }

  close() {
    if (this.doc) this.doc.destroy();
    this.doc = null;
    this.name = "Adsız.pdf";
    this.password = null;
    this.dirty = false;
    this.history.clear();
    this._resetCache();
    this.version++;
    this.change = { structural: true };
  }

  info() {
    const doc = this.requireDoc();
    return {
      name: this.name,
      pageCount: doc.countPages(),
      pages: this.pageSizes(),
      encrypted: this.isEncrypted(),
      hasForm: this.hasForm(),
      toc: this.getToc(),
    };
  }

  // -------------------------------------------------------- kaydetme
  /** Kaydedilecek baytlar. Masaüstündeki save(garbage=4, deflate, clean). */
  save(options = SAVE_OPTIONS) {
    const doc = this.requireDoc();
    const bytes = doc.saveToBuffer(options).asUint8Array().slice();
    // Çöp toplama nesne numaralarını değiştirebilir; temiz bir durumdan devam et.
    // "Kaydedildi" işaretini dosya gerçekten yazıldıktan sonra markSaved koyar.
    const dirty = this.dirty;
    this._reload(bytes);
    this.dirty = dirty;
    return bytes;
  }

  exportBytes(options = SAVE_OPTIONS) {
    return this.requireDoc().saveToBuffer(options).asUint8Array().slice();
  }

  markSaved(name) {
    if (name) this.name = name;
    this.dirty = false;
  }

  _reload(bytes) {
    const doc = this._openBytes(bytes, this.password);
    this._install(doc);
  }

  // ------------------------------------------------------ düzenleme
  snapshot(label, page = 0) {
    return { label, page, data: this.requireDoc().saveToBuffer("").asUint8Array().slice() };
  }

  /**
   * Bir düzenleme işlemini undo yığınına kaydederek çalıştırır.
   * pages: yalnızca bu sayfalar yeniden çizilmeli; null ise yapısal değişiklik.
   */
  edit(label, pages, fn) {
    this.requireDoc();
    const before = this.snapshot(label, pages && pages.length ? pages[0] : 0);
    let result;
    try {
      result = fn(this.doc);
    } catch (e) {
      // Yarım kalmış değişiklikleri geri sar
      this._restore(before);
      throw e;
    }
    if (!pages) {
      // Sayfa silme/yeniden sıralama nesneleri serbest bırakır ve numaralarını
      // yeniden kullanır; mupdf'in kendi yazı tipi/kaynak önbelleği ise eski
      // numaraları tutmaya devam eder. Belgeyi kendi baytlarından yeniden açmak
      // tüm önbellekleri tutarlı hâle getirir.
      this._reload(this.doc.saveToBuffer("").asUint8Array().slice());
    }
    this.history.push(before);
    this.version++;
    this.dirty = true;
    this.cache.text.clear();
    this.change = pages ? { pages: [...new Set(pages)] } : { structural: true };
    return result;
  }

  _restore(snap) {
    this._reload(snap.data);
    this.dirty = true;
  }

  undo() {
    if (!this.history.canUndo()) return "";
    const label = this.history.undoLabel();
    const snap = this.history.undo(this.snapshot(label));
    if (snap) this._restore(snap);
    return label;
  }

  redo() {
    if (!this.history.canRedo()) return "";
    const label = this.history.redoLabel();
    const snap = this.history.redo(this.snapshot(label));
    if (snap) this._restore(snap);
    return label;
  }

  // ------------------------------------------------------- sayfalar
  /** Sayfayı yükler, fn'i çalıştırır ve sayfayı bırakır (mupdf önbelleği tazelensin). */
  withPage(pno, fn) {
    const doc = this.requireDoc();
    if (pno < 0 || pno >= doc.countPages()) throw new EngineError(N_("Geçersiz sayfa: {n}"), "page", { n: pno + 1 });
    const page = doc.loadPage(pno);
    try {
      return fn(page);
    } finally {
      page.destroy();
    }
  }

  pageSizes() {
    const doc = this.requireDoc();
    const out = [];
    for (let i = 0; i < doc.countPages(); i++) {
      out.push(this.withPage(i, (p) => {
        const b = p.getBounds();
        const rot = inheritedRotation(p.getObject());
        return { width: b[2] - b[0], height: b[3] - b[1], rotation: rot, label: safeLabel(p) };
      }));
    }
    return out;
  }

  pageSize(pno) {
    return this.withPage(pno, (p) => {
      const b = p.getBounds();
      return [b[2] - b[0], b[3] - b[1]];
    });
  }

  // ------------------------------------------------------ görüntüleme
  /**
   * Sayfayı RGBA piksel olarak çizer. scale: 1 = 72 DPI.
   * clip: yalnızca bu bölgeyi (sayfa koordinatı) çiz — yüksek yakınlaştırmada
   * tüm sayfayı dev bir görüntüye çizmek yerine görünen parça çizilir.
   */
  render(pno, scale, clip = null, opts = {}) {
    return this.withPage(pno, (page) => {
      const b = page.getBounds();
      const area = clip ? G.intersect(clip, b) : b;
      const bbox = [
        Math.floor(area[0] * scale), Math.floor(area[1] * scale),
        Math.ceil(area[2] * scale), Math.ceil(area[3] * scale),
      ];
      if (bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) return { width: 0, height: 0, data: new Uint8ClampedArray(0), bbox };
      const pix = new mu.Pixmap(mu.ColorSpace.DeviceRGB, bbox, true);
      try {
        pix.clear(255);
        const m = mu.Matrix.scale(scale, scale);
        const dev = new mu.DrawDevice(mu.Matrix.identity, pix);
        try {
          if (opts.annots === false) page.runPageContents(dev, m);
          else page.run(dev, m);
        } finally {
          dev.close();
          dev.destroy();
        }
        const data = new Uint8ClampedArray(pix.getPixels());
        return { width: pix.getWidth(), height: pix.getHeight(), data, bbox, scale };
      } finally {
        pix.destroy();
      }
    });
  }

  thumbnail(pno, maxSide = 180) {
    const [w, h] = this.pageSize(pno);
    return this.render(pno, maxSide / Math.max(w, h, 1));
  }

  /** PNG / JPEG olarak sayfa görüntüsü (dışa aktarma, OCR, yazdırma). */
  renderImage(pno, { dpi = 150, format = "png", gray = false, alpha = false, quality = 92, annots = true } = {}) {
    return this.withPage(pno, (page) => {
      const cs = gray ? mu.ColorSpace.DeviceGray : mu.ColorSpace.DeviceRGB;
      const z = dpi / 72;
      const pix = page.toPixmap(mu.Matrix.scale(z, z), cs, alpha && format === "png", annots);
      try {
        pix.setResolution(dpi, dpi);
        const out = format === "jpg" ? pix.asJPEG(quality, false) : format === "pam" ? pix.asPAM() : pix.asPNG();
        return { bytes: out.slice(), width: pix.getWidth(), height: pix.getHeight() };
      } finally {
        pix.destroy();
      }
    });
  }

  // ---------------------------------------------------------- meta veri
  getMetadata() {
    const doc = this.requireDoc();
    const g = (k) => doc.getMetaData(k) || "";
    return {
      title: g("info:Title"), author: g("info:Author"), subject: g("info:Subject"),
      keywords: g("info:Keywords"), creator: g("info:Creator"), producer: g("info:Producer"),
      creationDate: g("info:CreationDate"), modDate: g("info:ModDate"),
      format: g("format"), encryption: g("encryption"),
    };
  }

  setMetadata(meta) {
    return this.edit(N_("Meta veri"), null, (doc) => {
      const keys = { title: "Title", author: "Author", subject: "Subject", keywords: "Keywords", creator: "Creator", producer: "Producer" };
      for (const [k, v] of Object.entries(keys)) if (k in meta) doc.setMetaData("info:" + v, meta[k] || "");
    });
  }

  isEncrypted() {
    const enc = this.doc ? this.doc.getMetaData("encryption") : "";
    return !!enc && enc !== "None";
  }

  hasForm() {
    const doc = this.requireDoc();
    const af = doc.getTrailer().get("Root").get("AcroForm");
    if (af.isNull()) return false;
    const fields = af.get("Fields");
    return fields.isArray() && fields.length > 0;
  }

  permissions() {
    const doc = this.requireDoc();
    const out = {};
    for (const p of ["print", "copy", "edit", "annotate", "form", "accessibility", "assemble", "print-hq"]) {
      out[p] = doc.hasPermission(p);
    }
    return out;
  }

  // ------------------------------------------------------------ yer imleri
  /** [{ level, title, page }] — masaüstündeki get_toc(simple=False). */
  getToc() {
    const doc = this.requireDoc();
    const out = [];
    let items = null;
    try {
      items = doc.loadOutline();
    } catch {
      items = null;
    }
    const walk = (list, level) => {
      for (const it of list || []) {
        let page = typeof it.page === "number" ? it.page : -1;
        if (page < 0 && it.uri) {
          try { page = doc.resolveLink(it.uri); } catch { page = -1; }
        }
        out.push({ level, title: it.title || "", page, uri: it.uri && !it.uri.startsWith("#") ? it.uri : "" });
        if (it.down) walk(it.down, level + 1);
      }
    };
    walk(items, 1);
    return out;
  }

  /** Yer imi ağacını baştan kurar. entries: [{ level, title, page }] */
  setToc(entries) {
    return this.edit(N_("Yer imleri"), null, (doc) => writeOutline(doc, entries));
  }
}

// ------------------------------------------------------------ yardımcılar
export function looksLikePdf(bytes) {
  const head = String.fromCharCode(...bytes.subarray(0, Math.min(1024, bytes.length)));
  return head.includes("%PDF");
}

const MIME = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp",
  tif: "image/tiff", tiff: "image/tiff", webp: "image/webp", jxr: "image/jxr", pnm: "image/x-portable-anymap",
  xps: "application/oxps", oxps: "application/oxps", epub: "application/epub+zip", cbz: "application/x-cbz",
  fb2: "text/xml", svg: "image/svg+xml", txt: "text/plain",
};

export function mimeFor(name) {
  const ext = (name || "").split(".").pop().toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

/** mupdf'in açabildiği her belgeyi PDF baytına çevirir (PyMuPDF convert_to_pdf). */
export function convertToPdf(bytes, name) {
  const src = mu.Document.openDocument(bytes, mimeFor(name));
  try {
    const buf = new mu.Buffer();
    const writer = new mu.DocumentWriter(buf, "pdf", "");
    const n = src.countPages();
    for (let i = 0; i < n; i++) {
      const page = src.loadPage(i);
      const b = page.getBounds();
      const dev = writer.beginPage(b);
      page.run(dev, mu.Matrix.identity);
      writer.endPage();
      page.destroy();
    }
    writer.close();
    return buf.asUint8Array().slice();
  } finally {
    src.destroy();
  }
}

/** Başka bir belgenin (PDF ya da dönüştürülebilir biçim) sayfalarını `at` konumuna ekler. */
export function appendConverted(doc, bytes, name, at, password) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let src;
  if (looksLikePdf(data)) {
    const d = mu.Document.openDocument(data, "application/pdf");
    if (d.needsPassword() && !(password && d.authenticatePassword(password))) {
      d.destroy();
      throw new EngineError(N_("“{name}” parola korumalı"), "password", { name });
    }
    src = d.asPDF();
  } else {
    src = new mu.PDFDocument(convertToPdf(data, name));
  }
  try {
    const n = src.countPages();
    graftPages(doc, src, [...Array(n).keys()].map((i) => [i, at + i]), (k) => at + k);
    return n;
  } finally {
    src.destroy();
  }
}

/**
 * Sayfaları açıklamalarıyla birlikte aşılar. mupdf'in graftPage'i yalnızca sayfa
 * içeriğini kopyalar; PyMuPDF insert_pdf / fullcopy_page gibi açıklamaları ve
 * bağlantıları da taşımak için Annots elle kopyalanır. Form alanları (Widget)
 * AcroForm yapısını bozmamak için taşınmaz.
 * pairs: [[kaynakSayfa, hedefSıra], ...] (artan hedef sırasıyla)
 * pageFor(i): kaynak sayfa i'nin hedef belgedeki son sırası (iç bağlantılar için)
 */
export function graftPages(doc, src, pairs, pageFor) {
  const map = doc.newGraftMap();
  for (const [s, d] of pairs) map.graftPage(d, src, s);
  const srcIndex = srcPageIndex(src);
  for (const [s, d] of pairs) copyAnnots(doc, map, src, s, d, srcIndex, pageFor);
}

function copyAnnots(doc, map, src, srcPno, dstPno, srcIndex, pageFor) {
  const annots = src.findPage(srcPno).get("Annots");
  if (!annots.isArray() || !annots.length) return;
  const dstObj = doc.findPage(dstPno);
  const n = doc.countPages();
  const out = doc.newArray();
  annots.forEach((ref) => {
    const d = ref.resolve();
    if (!d.isDictionary()) return;
    const subtype = d.get("Subtype").isName() ? d.get("Subtype").asName() : "";
    if (subtype === "Widget" || subtype === "Popup") return;
    const nd = doc.newDictionary();
    d.forEach((v, k) => {
      if (["P", "Popup", "Parent", "IRT"].includes(k)) return;
      if (subtype === "Link" && (k === "Dest" || k === "A")) return;
      nd.put(k, map.graftObject(v));
    });
    if (subtype === "Link") {
      const A = d.get("A");
      if (A.isDictionary() && A.get("S").isName() && A.get("S").asName() === "URI") {
        nd.put("A", map.graftObject(A));
      } else {
        let dest = d.get("Dest");
        if (dest.isNull() && A.isDictionary()) dest = A.get("D");
        const target = dest.isArray() && dest.get(0).isIndirect() ? srcIndex.get(dest.get(0).asIndirect()) : undefined;
        const final = target === undefined || !pageFor ? -1 : pageFor(target);
        if (final < 0 || final >= n) return;
        const arr = doc.newArray();
        arr.push(doc.findPage(final));
        arr.push(doc.newName("Fit"));
        nd.put("Dest", arr);
      }
    }
    nd.put("P", dstObj);
    out.push(doc.addObject(nd));
  });
  if (out.length) dstObj.put("Annots", out);
}

function srcPageIndex(src) {
  const m = new Map();
  for (let i = 0; i < src.countPages(); i++) {
    const p = src.findPage(i);
    if (p.isIndirect()) m.set(p.asIndirect(), i);
  }
  return m;
}

export function inheritedRotation(obj) {
  const r = obj.getInheritable("Rotate");
  const v = r.isNull() ? 0 : r.asNumber();
  return ((v % 360) + 360) % 360;
}

function safeLabel(page) {
  try {
    return page.getLabel() || "";
  } catch {
    return "";
  }
}

function writeOutline(doc, entries) {
  const root = doc.getTrailer().get("Root");
  if (!entries || !entries.length) {
    root.delete("Outlines");
    return;
  }
  const outlines = doc.addObject(doc.newDictionary());
  outlines.put("Type", doc.newName("Outlines"));
  // düz listeyi ağaca çevir
  const tree = { children: [] };
  const stack = [{ level: 0, node: tree }];
  for (const e of entries) {
    const lvl = Math.max(1, e.level | 0);
    while (stack.length > 1 && stack[stack.length - 1].level >= lvl) stack.pop();
    const node = { e, children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ level: lvl, node });
  }
  const n = doc.countPages();
  const build = (parentRef, nodes) => {
    const refs = nodes.map(() => doc.addObject(doc.newDictionary()));
    let total = 0;
    nodes.forEach((node, i) => {
      const ref = refs[i];
      ref.put("Title", doc.newString(node.e.title || ""));
      ref.put("Parent", parentRef);
      if (i > 0) ref.put("Prev", refs[i - 1]);
      if (i < refs.length - 1) ref.put("Next", refs[i + 1]);
      const pg = Math.min(Math.max(0, node.e.page | 0), n - 1);
      const dest = doc.newArray();
      dest.push(doc.findPage(pg));
      dest.push(doc.newName("XYZ"));
      dest.push(doc.newNull());
      dest.push(doc.newNull());
      dest.push(doc.newNull());
      ref.put("Dest", dest);
      if (node.children.length) {
        const c = build(ref, node.children);
        ref.put("Count", c);
      }
      total += 1;
    });
    parentRef.put("First", refs[0]);
    parentRef.put("Last", refs[refs.length - 1]);
    return total;
  };
  const count = build(outlines, tree.children);
  outlines.put("Count", count);
  root.put("Outlines", outlines);
}
