// Yazı tipi yöneticisi. Masaüstündeki core/fonts.py karşılığı.
//
// PDF'in yerleşik 14 fontu yalnızca Latin-1 (WinAnsi) kodlar ve "ığşİĞŞ"
// karakterlerini bozar. Masaüstü sürüm sistem fontlarını tarar; mobilde sistem
// fontlarına erişim olmadığı için uygulama kendi Unicode fontlarını taşır
// (Liberation: Arial/Times/Courier ile aynı ölçüler, DejaVu Sans) ve kullanıcının
// içe aktardığı TTF/OTF dosyalarını da kaydeder.

import { mu } from "./mu.js";
import { EngineError } from "./engine.js";

/** Arayüzde gösterilen metinleri çeviri anahtarı olarak işaretler (çevirmez). */
const N_ = (text) => text;

export const BUNDLED = [
  ["Liberation Sans", false, false, "LiberationSans-Regular.ttf"],
  ["Liberation Sans", true, false, "LiberationSans-Bold.ttf"],
  ["Liberation Sans", false, true, "LiberationSans-Italic.ttf"],
  ["Liberation Sans", true, true, "LiberationSans-BoldItalic.ttf"],
  ["Liberation Serif", false, false, "LiberationSerif-Regular.ttf"],
  ["Liberation Serif", true, false, "LiberationSerif-Bold.ttf"],
  ["Liberation Serif", false, true, "LiberationSerif-Italic.ttf"],
  ["Liberation Serif", true, true, "LiberationSerif-BoldItalic.ttf"],
  ["Liberation Mono", false, false, "LiberationMono-Regular.ttf"],
  ["Liberation Mono", true, false, "LiberationMono-Bold.ttf"],
  ["Liberation Mono", false, true, "LiberationMono-Italic.ttf"],
  ["Liberation Mono", true, true, "LiberationMono-BoldItalic.ttf"],
  ["DejaVu Sans", false, false, "DejaVuSans.ttf"],
  ["DejaVu Sans", true, false, "DejaVuSans-Bold.ttf"],
  ["DejaVu Sans", false, true, "DejaVuSans-Oblique.ttf"],
  ["DejaVu Sans", true, true, "DejaVuSans-BoldOblique.ttf"],
].map(([family, bold, italic, file]) => ({ family, bold, italic, file, source: "bundled" }));

/** Yerleşik base14 aileleri (yalnızca WinAnsi metin için, gömme gerektirmez). */
export const BASE14_FAMILIES = ["Helvetica", "Times", "Courier"];

const BASE14_NAMES = {
  Helvetica: ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"],
  Times: ["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"],
  Courier: ["Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"],
};

// PDF'lerde sık geçen aile adlarının base14 / Liberation karşılıkları
const ALIASES = {
  arial: "Helvetica", arialmt: "Helvetica", helvetica: "Helvetica", helv: "Helvetica",
  helveticaneue: "Helvetica", liberationsans: "Helvetica", arimo: "Helvetica",
  timesnewroman: "Times", timesnewromanpsmt: "Times", times: "Times", timesroman: "Times",
  tiro: "Times", liberationserif: "Times", tinos: "Times",
  couriernew: "Courier", courier: "Courier", couriernewpsmt: "Courier", cour: "Courier",
  liberationmono: "Courier", cousine: "Courier",
};

const UNICODE_FOR_BASE14 = { Helvetica: "Liberation Sans", Times: "Liberation Serif", Courier: "Liberation Mono" };

export const DEFAULT_FAMILY = "Liberation Sans";
export const FALLBACK_FAMILY = "DejaVu Sans";

// WinAnsiEncoding: 0x80-0x9F aralığının Unicode karşılıkları
const WINANSI_EXTRA = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

export function winAnsiCode(cp) {
  if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)) return cp;
  return WINANSI_EXTRA[cp] ?? -1;
}

export function isWinAnsi(text) {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === 10 || cp === 13 || cp === 9) continue;
    if (winAnsiCode(cp) < 0) return false;
  }
  return true;
}

const squash = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** 'ABCDEF+Arial-BoldMT' -> { family: 'Arial', bold: true, italic: false } */
export function normalizePdfFontname(name) {
  let n = name || "";
  if (n.slice(0, 8).includes("+")) n = n.split("+", 2)[1];
  const low = n.toLowerCase();
  const bold = ["bold", "black", "heavy", "semibold"].some((t) => low.includes(t));
  const italic = ["italic", "oblique"].some((t) => low.includes(t));
  for (const sep of ["-", ","]) if (n.includes(sep)) n = n.split(sep)[0];
  for (const suffix of ["PSMT", "MT", "PS", "Std", "Pro"]) {
    if (n.endsWith(suffix) && n.length > suffix.length + 2) { n = n.slice(0, -suffix.length); break; }
  }
  // "TimesNewRoman" -> "Times New Roman" gibi ayrıştırma görüntüde daha iyi durur
  n = n.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return { family: n || "Helvetica", bold, italic };
}

// ------------------------------------------------------------ TTF ad tablosu
/** TTF/OTF/TTC baytlarından (aile, stil) okur; masaüstündeki _read_name_table. */
export function readNameTable(bytes) {
  try {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let base = 0;
    if (String.fromCharCode(...bytes.subarray(0, 4)) === "ttcf") base = dv.getUint32(12);
    const numTables = dv.getUint16(base + 4);
    let nameOff = 0;
    for (let i = 0; i < numTables; i++) {
      const rec = base + 12 + i * 16;
      const tag = String.fromCharCode(...bytes.subarray(rec, rec + 4));
      if (tag === "name") { nameOff = dv.getUint32(rec + 8); break; }
    }
    if (!nameOff) return null;
    const count = dv.getUint16(nameOff + 2);
    const strOff = dv.getUint16(nameOff + 4);
    const best = {};
    for (let i = 0; i < count; i++) {
      const r = nameOff + 6 + i * 12;
      const plat = dv.getUint16(r), lang = dv.getUint16(r + 4), nid = dv.getUint16(r + 6);
      const len = dv.getUint16(r + 8), off = dv.getUint16(r + 10);
      if (![1, 2, 16, 17].includes(nid)) continue;
      const raw = bytes.subarray(nameOff + strOff + off, nameOff + strOff + off + len);
      let txt = "";
      if (plat === 3 || plat === 0) {
        for (let k = 0; k + 1 < raw.length; k += 2) txt += String.fromCharCode((raw[k] << 8) | raw[k + 1]);
      } else {
        txt = String.fromCharCode(...raw);
      }
      txt = txt.replace(/\0/g, "").trim();
      if (!txt) continue;
      const score = plat === 3 && lang === 0x409 ? 3 : plat === 3 ? 2 : 1;
      if (!best[nid] || best[nid][0] < score) best[nid] = [score, txt];
    }
    const family = (best[16] || best[1] || [0, ""])[1];
    const style = (best[17] || best[2] || [0, "Regular"])[1];
    return family ? { family, style } : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ yönetici
export class FontManager {
  constructor(loadBytes) {
    this.loadBytes = loadBytes; // async (file) => Uint8Array
    this.fonts = BUNDLED.slice();
    this._bytes = new Map(); // file|id -> Uint8Array
    this._mu = new Map(); // anahtar -> mupdf Font
    this._widthCache = new Map();
  }

  families() {
    const set = new Set(BASE14_FAMILIES);
    for (const f of this.fonts) set.add(f.family);
    return [...set];
  }

  userFonts() {
    return this.fonts.filter((f) => f.source === "user").map(({ family, bold, italic, id }) => ({ family, bold, italic, id }));
  }

  registerUserFont(id, bytes) {
    const info = readNameTable(bytes);
    if (!info) throw new Error(N_("Yazı tipi dosyası okunamadı"));
    const low = info.style.toLowerCase();
    const entry = {
      family: info.family, style: info.style, id, file: "user:" + id, source: "user",
      bold: /bold|black|heavy/.test(low), italic: /italic|oblique/.test(low),
    };
    this.fonts = this.fonts.filter((f) => f.file !== entry.file);
    this.fonts.push(entry);
    this._bytes.set(entry.file, bytes);
    return { family: entry.family, style: entry.style, bold: entry.bold, italic: entry.italic };
  }

  find(family, bold = false, italic = false) {
    const want = squash(family);
    const exact = this.fonts.filter((f) => squash(f.family) === want);
    for (const [b, i] of [[bold, italic], [bold, false], [false, italic], [false, false]]) {
      const f = exact.find((x) => x.bold === b && x.italic === i);
      if (f) return f;
    }
    if (want) {
      const partial = this.fonts.filter((f) => squash(f.family).includes(want) || want.includes(squash(f.family)));
      const f = partial.find((x) => x.bold === bold && x.italic === italic) || partial[0];
      if (f) return f;
    }
    return null;
  }

  /** Bir PDF aile adı için en uygun gömülebilir (Unicode) yazı tipi. */
  unicodeFor(family, bold, italic) {
    const canon = ALIASES[squash(family)];
    if (canon) return this.find(UNICODE_FOR_BASE14[canon], bold, italic);
    const direct = this.find(family, bold, italic);
    if (direct) return direct;
    const low = (family || "").toLowerCase();
    let fam = DEFAULT_FAMILY;
    if (/mono|courier|consol|code/.test(low)) fam = "Liberation Mono";
    else if (/serif|times|roman|georgia|garamond|cambria|book|minion|palatino/.test(low) && !/sans/.test(low)) fam = "Liberation Serif";
    return this.find(fam, bold, italic);
  }

  /**
   * Metni yazmak için yazı tipi seçer (masaüstündeki resolve_insert_font).
   * Metin WinAnsi ile ifade edilebiliyorsa ve aile standart bir base14 ise gömme
   * yapılmaz; aksi hâlde bir TTF gömülür.
   */
  resolve(family, bold, italic, text) {
    const canon = ALIASES[squash(family)] || (BASE14_FAMILIES.includes(family) ? family : null);
    if (canon && isWinAnsi(text || "")) {
      const names = BASE14_NAMES[canon];
      const name = names[(bold ? 1 : 0) + (italic ? 2 : 0)];
      return { kind: "base14", key: "b14:" + name, name, family: canon, bold, italic };
    }
    const f = this.unicodeFor(family, bold, italic) || this.find(DEFAULT_FAMILY, bold, italic);
    return { kind: "ttf", key: "ttf:" + f.file, file: f.file, family: f.family, bold: f.bold, italic: f.italic };
  }

  fallbackFor(spec) {
    const f = this.find(FALLBACK_FAMILY, spec.bold, spec.italic);
    return { kind: "ttf", key: "ttf:" + f.file, file: f.file, family: f.family, bold: f.bold, italic: f.italic };
  }

  async ensure(spec) {
    if (spec.kind !== "ttf" || this._bytes.has(spec.file)) return;
    if (spec.file.startsWith("user:")) throw new EngineError(N_("Kullanıcı yazı tipi yüklenmemiş: {name}"), "font", { name: spec.family });
    this._bytes.set(spec.file, await this.loadBytes(spec.file));
  }

  bytes(spec) {
    return this._bytes.get(spec.file);
  }

  /** mupdf Font nesnesi (önbellekli). `ensure` önceden çağrılmış olmalı. */
  font(spec) {
    let f = this._mu.get(spec.key);
    if (!f) {
      if (spec.kind === "base14") f = new mu.Font(spec.name);
      else {
        const data = this._bytes.get(spec.file);
        if (!data) throw new EngineError(N_("Yazı tipi yüklenmedi: {name}"), "font", { name: spec.file });
        f = new mu.Font(spec.family.replace(/\s+/g, ""), data);
      }
      this._mu.set(spec.key, f);
    }
    return f;
  }

  /** (glif, ilerleme) — ilerleme 1 puntoluk birimde. glif 0 ise karakter fontta yok. */
  glyph(spec, cp) {
    const key = spec.key + ":" + cp;
    let v = this._widthCache.get(key);
    if (!v) {
      const font = this.font(spec);
      const gid = font.encodeCharacter(cp);
      v = [gid, gid || spec.kind === "base14" ? font.advanceGlyph(gid, 0) : 0.5];
      this._widthCache.set(key, v);
    }
    return v;
  }

  textWidth(spec, text, size) {
    let w = 0;
    for (const ch of text) w += this.glyph(spec, ch.codePointAt(0))[1];
    return w * size;
  }
}
