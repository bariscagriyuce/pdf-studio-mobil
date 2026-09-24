// Sayfa içeriğine gerçek PDF operatörleri yazan katman.
//
// PyMuPDF'in insert_textbox / insert_text / insert_image / show_pdf_page
// yardımcılarının karşılığıdır. Tüm çizimler sayfanın *görüntülenen*
// koordinatlarında yapılır: her akış "q <ters sayfa dönüşümü> cm" ile başlar,
// böylece döndürülmüş veya kırpılmış sayfalarda da içerik okuyucuya dik görünür.

import { mu } from "./mu.js";
import * as G from "./geom.js";
import { winAnsiCode } from "./fonts.js";

const f = (v) => (Math.abs(v) < 1e-6 ? "0" : (+v.toFixed(4)).toString());
const mat = (m) => m.map(f).join(" ");
const rgb = (c) => (c || [0, 0, 0]).slice(0, 3).map(f).join(" ");

// --------------------------------------------------------------- içerik akışı
function readContents(obj) {
  const c = obj.get("Contents");
  const items = [];
  if (c.isArray()) c.forEach((v) => items.push(v));
  else if (!c.isNull()) items.push(c);
  return items;
}

/** Önbellekteki nesne hâlâ bizim eklediğimiz nesne mi? (numaralar yeniden kullanılabilir) */
function hasKey(ref, key) {
  try {
    const k = ref.resolve().get("PSKey");
    return k.isString() && k.asString() === key;
  } catch {
    return false;
  }
}

function isMarker(item, kind) {
  try {
    const m = item.get("PSWrap");
    return !m.isNull() && m.asName() === kind;
  } catch {
    return false;
  }
}

/**
 * İçerik, sonuna ekleme yapılabilecek kadar "temiz" mi? q/Q dengeli ve en üst
 * düzeyde cm / kırpma / gs yoksa grafik durumu sızmaz; sarmalamaya gerek kalmaz.
 * (Her düzenlemede yeniden sarmalamak q derinliğini sınırsız büyütürdü.)
 */
function contentIsClean(items) {
  let depth = 0;
  for (const item of items) {
    let s;
    try {
      s = item.readStream().asString();
    } catch {
      return false;
    }
    const n = s.length;
    let i = 0;
    let tok = "";
    const flush = () => {
      if (!tok) return true;
      const t = tok;
      tok = "";
      if (t === "q") depth++;
      else if (t === "Q") { depth--; if (depth < 0) return false; }
      else if (depth === 0 && (t === "cm" || t === "W" || t === "W*" || t === "gs")) return false;
      return true;
    };
    while (i < n) {
      const ch = s[i];
      if (ch === "(") {
        if (!flush()) return false;
        let lvl = 1;
        i++;
        while (i < n && lvl) {
          if (s[i] === "\\") i++;
          else if (s[i] === "(") lvl++;
          else if (s[i] === ")") lvl--;
          i++;
        }
        continue;
      }
      if (ch === "<" && s[i + 1] !== "<") {
        if (!flush()) return false;
        while (i < n && s[i] !== ">") i++;
        i++;
        continue;
      }
      if (ch === "%") {
        if (!flush()) return false;
        while (i < n && s[i] !== "\n" && s[i] !== "\r") i++;
        continue;
      }
      if (" \t\r\n\f\0[]<>{}/".includes(ch)) {
        if (!flush()) return false;
        if (ch === "/") {
          i++;
          while (i < n && !" \t\r\n\f\0[]<>{}/()%".includes(s[i])) i++;
          continue;
        }
        i++;
        continue;
      }
      tok += ch;
      i++;
      if (tok === "BI") {
        // satır içi görüntü: EI'ye kadar atla
        const end = s.indexOf("EI", i);
        i = end < 0 ? n : end + 2;
        tok = "";
      }
    }
    if (!flush()) return false;
  }
  return depth === 0;
}

// ------------------------------------------------------------------ yazıcı
export class PageWriter {
  /** E: motor durumu ({ doc, fonts, cache }) */
  constructor(E, pno) {
    this.E = E;
    this.doc = E.doc;
    this.pno = pno;
    this.page = this.doc.loadPage(pno);
    this.obj = this.page.getObject();
    this.T = this.page.getTransform();
    this.inv = G.invert(this.T);
    this.bounds = this.page.getBounds();
    this.ops = [];
    this._res = null;
  }

  // ---------------------------------------------------------- kaynaklar
  resources() {
    if (this._res) return this._res;
    let res = this.obj.get("Resources");
    if (res.isNull()) {
      const inh = this.obj.getInheritable("Resources");
      if (inh.isNull()) {
        this.obj.put("Resources", this.doc.newDictionary());
      } else {
        // Miras alınan kaynakları sayfaya kopyala (diğer sayfalar etkilenmesin)
        const copy = this.doc.newDictionary();
        inh.forEach((v, k) => copy.put(k, v));
        this.obj.put("Resources", copy);
      }
      res = this.obj.get("Resources");
    }
    this._res = res;
    return res;
  }

  sub(name) {
    const res = this.resources();
    let d = res.get(name);
    if (d.isNull()) {
      res.put(name, this.doc.newDictionary());
      d = res.get(name);
    }
    return d;
  }

  _nameFor(subName, prefix, ref) {
    const d = this.sub(subName);
    const num = ref.isIndirect() ? ref.asIndirect() : 0;
    let found = null;
    const used = new Set();
    d.forEach((v, k) => {
      used.add(k);
      if (num && v.isIndirect() && v.asIndirect() === num) found = k;
    });
    if (found) return found;
    let i = 1;
    while (used.has(prefix + i)) i++;
    d.put(prefix + i, ref);
    return prefix + i;
  }

  fontRef(spec) {
    const cache = this.E.cache;
    let ref = cache.fonts.get(spec.key);
    // Sayfa silme/yeniden sıralama sahipsiz nesneleri bırakıp numaralarını
    // yeniden kullanabilir; önbellekteki nesne hâlâ bir yazı tipi mi?
    if (ref && !hasKey(ref, spec.key)) ref = null;
    if (!ref) {
      const font = this.E.fonts.font(spec);
      ref = spec.kind === "base14" ? this.doc.addSimpleFont(font, "Latin") : this.doc.addFont(font);
      if (ref.resolve().isDictionary()) ref.put("PSKey", this.doc.newString(spec.key));
      cache.fonts.set(spec.key, ref);
    }
    return ref;
  }

  fontName(spec) {
    return this._nameFor("Font", "PSF", this.fontRef(spec));
  }

  gsName(fillAlpha = 1, strokeAlpha = 1) {
    const key = `gs:${f(fillAlpha)}:${f(strokeAlpha)}`;
    const cache = this.E.cache;
    let ref = cache.gs.get(key);
    if (ref && !hasKey(ref, key)) ref = null;
    if (!ref) {
      const d = this.doc.newDictionary();
      d.put("Type", this.doc.newName("ExtGState"));
      d.put("PSKey", this.doc.newString(key));
      d.put("ca", fillAlpha);
      d.put("CA", strokeAlpha);
      ref = this.doc.addObject(d);
      cache.gs.set(key, ref);
    }
    return this._nameFor("ExtGState", "PSGS", ref);
  }

  xobjectName(ref) {
    return this._nameFor("XObject", "PSX", ref);
  }

  // ------------------------------------------------------------- metin
  /** Metni yazı tipi + yedek yazı tipi parçalarına böler. */
  runs(spec, text) {
    const fm = this.E.fonts;
    const out = [];
    const fb = spec.kind === "ttf" ? fm.fallbackFor(spec) : null;
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      let use = spec;
      let [gid, adv] = fm.glyph(spec, cp);
      if (!gid && fb && fb.key !== spec.key) {
        const [g2, a2] = fm.glyph(fb, cp);
        if (g2) { use = fb; gid = g2; adv = a2; }
      }
      const last = out[out.length - 1];
      if (last && last.spec.key === use.key) {
        last.text += ch;
        last.gids.push(gid);
        last.adv += adv;
      } else {
        out.push({ spec: use, text: ch, gids: [gid], adv });
      }
    }
    return out;
  }

  measure(spec, text, size) {
    let w = 0;
    for (const r of this.runs(spec, text)) w += r.adv;
    return w * size;
  }

  _encode(run) {
    if (run.spec.kind === "base14") {
      let hex = "";
      for (const ch of run.text) {
        const code = winAnsiCode(ch.codePointAt(0));
        hex += (code < 0 ? 0x3f : code).toString(16).padStart(2, "0");
      }
      return hex;
    }
    return run.gids.map((g) => g.toString(16).padStart(4, "0")).join("");
  }

  /**
   * Tek satır metin yazar. (x, y) ilk karakterin taban çizgisi başlangıcıdır.
   * opts: color, opacity, renderMode (3 = görünmez, OCR için), hscale,
   *       rotate (derece, `around` noktası etrafında), charSpacing
   */
  text(spec, str, x, y, size, opts = {}) {
    if (!str) return 0;
    const hs = opts.hscale || 1;
    let base = [size * hs, 0, 0, -size, x, y];
    if (opts.rotate) {
      const c = opts.around || [x, y];
      const R = G.concat(G.concat([1, 0, 0, 1, -c[0], -c[1]], G.rotation(opts.rotate)), [1, 0, 0, 1, c[0], c[1]]);
      base = G.concat(base, R);
    }
    const parts = [];
    parts.push("q");
    if (opts.opacity != null && opts.opacity < 1) parts.push(`/${this.gsName(opts.opacity, opts.opacity)} gs`);
    parts.push(`${rgb(opts.color)} rg ${rgb(opts.color)} RG`);
    parts.push(`BT 0 Tc 0 Tw 100 Tz 0 Ts ${opts.renderMode || 0} Tr`);
    let adv = 0;
    for (const run of this.runs(spec, str)) {
      const name = this.fontName(run.spec);
      const m = G.concat([1, 0, 0, 1, adv, 0], base);
      parts.push(`/${name} 1 Tf ${mat(m)} Tm <${this._encode(run)}> Tj`);
      adv += run.adv;
    }
    parts.push("ET Q");
    this.ops.push(parts.join("\n"));
    return adv * size * hs;
  }

  // ------------------------------------------------------------- şekiller
  fillRect(r, color, opacity = 1) {
    const gs = opacity < 1 ? `/${this.gsName(opacity, opacity)} gs ` : "";
    this.ops.push(`q ${gs}${rgb(color)} rg ${f(r[0])} ${f(r[1])} ${f(r[2] - r[0])} ${f(r[3] - r[1])} re f Q`);
  }

  image(ref, r, opacity = 1) {
    const name = this.xobjectName(ref);
    const gs = opacity < 1 ? `/${this.gsName(opacity, opacity)} gs ` : "";
    const m = [r[2] - r[0], 0, 0, -(r[3] - r[1]), r[0], r[3]];
    this.ops.push(`q ${gs}${mat(m)} cm /${name} Do Q`);
  }

  /** Bir form XObject'i (başka sayfanın içeriği) verilen matrisle çizer. */
  form(ref, m) {
    const name = this.xobjectName(ref);
    this.ops.push(`q ${mat(m)} cm /${name} Do Q`);
  }

  raw(str) {
    this.ops.push(str);
  }

  // --------------------------------------------------------------- yazma
  commit({ behind = false } = {}) {
    if (!this.ops.length) {
      this.close();
      return;
    }
    const doc = this.doc;
    const body = `q ${mat(this.inv)} cm\n${this.ops.join("\n")}\nQ\n`;
    const stm = doc.addStream(body, {});
    const items = readContents(this.obj);
    const arr = doc.newArray();
    if (behind) {
      arr.push(stm);
      items.forEach((v) => arr.push(v));
    } else {
      const wrapped = items.length >= 2 && isMarker(items[0], "Begin") && items.some((v) => isMarker(v, "End"));
      if (items.length && !wrapped && !contentIsClean(items)) {
        const [qb, qe] = this._markers();
        arr.push(qb);
        items.forEach((v) => arr.push(v));
        arr.push(qe);
      } else {
        items.forEach((v) => arr.push(v));
      }
      arr.push(stm);
    }
    this.obj.put("Contents", arr);
    this.close();
  }

  _markers() {
    const c = this.E.cache;
    if (!c.wrapBegin || !isMarker(c.wrapBegin, "Begin") || !isMarker(c.wrapEnd, "End")) {
      c.wrapBegin = this.doc.addStream("q\n", { PSWrap: this.doc.newName("Begin") });
      c.wrapEnd = this.doc.addStream("\nQ\n", { PSWrap: this.doc.newName("End") });
    }
    return [c.wrapBegin, c.wrapEnd];
  }

  close() {
    if (this.page) {
      this.page.destroy();
      this.page = null;
    }
  }
}

// ------------------------------------------------------------ metin kutusu
export const ASCENT = 0.9;
export const DESCENT = 0.22;

/** Metni verilen genişliğe sarar. Dönüş: [{ text, words, width, last }] */
export function wrapLines(w, spec, text, size, maxWidth) {
  const lines = [];
  const space = w.measure(spec, " ", size);
  for (const para of text.replace(/\r\n?/g, "\n").split("\n")) {
    const words = para.split(" ");
    let cur = [];
    let curW = 0;
    const push = (last) => {
      lines.push({ words: cur, text: cur.join(" "), width: curW, last });
      cur = [];
      curW = 0;
    };
    for (let word of words) {
      let ww = w.measure(spec, word, size);
      // tek başına sığmayan uzun kelimeyi karakterlerden böl
      while (ww > maxWidth && word.length > 1) {
        if (cur.length) push(false);
        let cut = word.length - 1;
        while (cut > 1 && w.measure(spec, word.slice(0, cut), size) > maxWidth) cut--;
        cur = [word.slice(0, cut)];
        curW = w.measure(spec, cur[0], size);
        push(false);
        word = word.slice(cut);
        ww = w.measure(spec, word, size);
      }
      const add = cur.length ? space + ww : ww;
      if (cur.length && curW + add > maxWidth + 0.01) push(false);
      curW += cur.length ? space + ww : ww;
      cur.push(word);
    }
    push(true);
  }
  return lines;
}

/**
 * PyMuPDF insert_textbox karşılığı. Sığarsa yazar ve kalan dikey boşluğu (>=0)
 * döndürür; sığmazsa hiçbir şey yazmaz ve negatif değer döndürür.
 * style: { spec, size, color, align (0 sol,1 orta,2 sağ,3 iki yana), lineSpacing, opacity }
 * opts.baseline: ilk satırın taban çizgisi (verilmezse kutunun üstünden hesaplanır)
 */
export function insertTextbox(w, box, text, style, opts = {}) {
  const size = style.size;
  const lh = size * (style.lineSpacing || 1.15);
  const width = Math.max(4, box[2] - box[0]);
  const lines = wrapLines(w, style.spec, text, size, width);
  const first = opts.baseline != null ? opts.baseline : box[1] + size * ASCENT;
  const bottom = first + (lines.length - 1) * lh + size * DESCENT;
  const rc = box[3] - bottom;
  if (rc < -0.01 && !opts.force) return rc;
  const space = w.measure(style.spec, " ", size);
  lines.forEach((line, i) => {
    const y = first + i * lh;
    let x = box[0];
    const extra = width - line.width;
    if (style.align === 1) x += extra / 2;
    else if (style.align === 2) x += extra;
    if (style.align === 3 && !line.last && line.words.length > 1) {
      const gap = space + extra / (line.words.length - 1);
      for (const word of line.words) {
        w.text(style.spec, word, x, y, size, { color: style.color, opacity: style.opacity });
        x += w.measure(style.spec, word, size) + gap;
      }
    } else {
      w.text(style.spec, line.text, x, y, size, { color: style.color, opacity: style.opacity });
    }
  });
  return rc;
}

/** Metnin verilen genişlikte kaplayacağı yükseklik (masaüstündeki _measured_height). */
export function measuredHeight(w, text, width, style) {
  const lines = wrapLines(w, style.spec, text, style.size, width);
  return Math.max(1, lines.length) * style.size * (style.lineSpacing || 1.15) + style.size * 0.5;
}

// ------------------------------------------------------ sayfa -> form XObject
/**
 * Bir sayfanın içeriğini (açıklamalar hariç) hedef belgede form XObject yapar.
 * PyMuPDF show_pdf_page'in temel taşı. Dönüş: { ref, T } — T kaynak sayfanın
 * PDF uzayından görüntü uzayına dönüşümü.
 */
export function pageToXObject(targetDoc, srcDoc, pno, graftMap) {
  const page = srcDoc.loadPage(pno);
  try {
    const obj = page.getObject();
    const T = page.getTransform();
    const bounds = page.getBounds();
    const buf = new mu.Buffer();
    for (const item of readContents(obj)) {
      buf.writeBuffer(item.readStream());
      buf.write("\n");
    }
    let res = obj.getInheritable("Resources");
    let box = obj.getInheritable("CropBox");
    if (box.isNull()) box = obj.getInheritable("MediaBox");
    const bbox = targetDoc.newArray();
    box.forEach((v) => bbox.push(v.asNumber()));
    if (graftMap && !res.isNull()) res = graftMap.graftObject(res);
    const dict = targetDoc.newDictionary();
    dict.put("Type", targetDoc.newName("XObject"));
    dict.put("Subtype", targetDoc.newName("Form"));
    dict.put("BBox", bbox);
    if (!res.isNull()) dict.put("Resources", res);
    const ref = targetDoc.addStream(buf, dict);
    return { ref, T, bounds };
  } finally {
    page.destroy();
  }
}

/** Kaynak sayfayı (görünür yönüyle) hedef kutuya oranı koruyarak sığdıran matris. */
export function fitMatrix(T, srcBounds, targetBox, keep = true) {
  const sw = srcBounds[2] - srcBounds[0];
  const sh = srcBounds[3] - srcBounds[1];
  let sx = (targetBox[2] - targetBox[0]) / sw;
  let sy = (targetBox[3] - targetBox[1]) / sh;
  if (keep) sx = sy = Math.min(sx, sy);
  const w = sw * sx, h = sh * sy;
  const tx = targetBox[0] + ((targetBox[2] - targetBox[0]) - w) / 2 - srcBounds[0] * sx;
  const ty = targetBox[1] + ((targetBox[3] - targetBox[1]) - h) / 2 - srcBounds[1] * sy;
  return G.concat(T, [sx, 0, 0, sy, tx, ty]);
}
