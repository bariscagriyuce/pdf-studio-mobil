// PDF form alanları: listeleme, doldurma, ekleme, silme, dışa/içe aktarma.
// Masaüstündeki core/forms.py karşılığı.

import { mu } from "./mu.js";
import * as G from "./geom.js";
import { withPage, resolveStyle } from "./textedit.js";
import { EngineError } from "./engine.js";
import { isWinAnsi } from "./fonts.js";
import { wrapLines, ASCENT, DESCENT } from "./writer.js";

export const FIELD_TYPE_NAMES = {
  button: "Düğme", checkbox: "Onay kutusu", combobox: "Açılır liste", listbox: "Liste",
  radiobutton: "Seçenek düğmesi", signature: "İmza", text: "Metin kutusu",
};

function widgetId(w) {
  const o = w.getObject();
  return o.isIndirect() ? o.asIndirect() : 0;
}

function safe(fn, dflt) {
  try {
    return fn();
  } catch {
    return dflt;
  }
}

function fieldInfo(pno, w) {
  const type = safe(() => w.getFieldType(), "text");
  const flags = safe(() => w.getFieldFlags(), 0);
  return {
    pno, id: widgetId(w),
    name: safe(() => w.getName(), ""),
    label: safe(() => w.getLabel(), "") || safe(() => w.getName(), ""),
    type, typeName: FIELD_TYPE_NAMES[type] || "Alan",
    value: String(safe(() => w.getValue(), "") ?? ""),
    options: safe(() => (w.isChoice() ? w.getOptions() : []), []),
    rect: w.getBounds(),
    readonly: !!(flags & 1), required: !!(flags & 2),
    multiline: safe(() => w.isMultiline(), false),
    maxLen: safe(() => (w.isText() ? w.getMaxLen() : 0), 0),
  };
}

export function listFields(E, pno = null) {
  const rng = pno === null || pno === undefined ? [...Array(E.pageCount).keys()] : [pno];
  const out = [];
  for (const i of rng) withPage(E.doc, i, (page) => { for (const w of page.getWidgets()) out.push(fieldInfo(i, w)); });
  return out;
}

export function fieldAt(E, pno, pt) {
  return withPage(E.doc, pno, (page) => {
    for (const w of page.getWidgets()) if (G.contains(w.getBounds(), pt)) return fieldInfo(pno, w);
    return null;
  });
}

const isOn = (v) => v === true || (typeof v === "string" && v !== "" && v !== "Off" && v !== "false" && v !== "0");

function applyValue(E, st, w, value) {
  const type = w.getFieldType();
  if (type === "checkbox" || type === "radiobutton") {
    const cur = isOn(w.getValue());
    if (cur !== isOn(value)) w.toggle();
  } else if (type === "combobox" || type === "listbox") {
    w.setChoiceValue(String(value ?? ""));
  } else if (type === "text") {
    w.setTextValue(String(value ?? ""));
  } else {
    return false;
  }
  w.update();
  const text = String(value ?? "");
  if ((type === "text" || type === "combobox") && !isWinAnsi(text)) unicodeAppearance(E, st, w, text);
  return true;
}

/**
 * mupdf, WinAnsi dışı karakterlerde (ığşİĞŞ) DA yazı tipini bırakıp yedek bir
 * yola geçiyor ve metni kutunun dışına yerleştiriyor. Bu durumda görünümü
 * gömülü bir Unicode yazı tipiyle kendimiz üretiriz.
 */
function unicodeAppearance(E, st, w, text) {
  const doc = E.doc;
  const obj = w.getObject();
  const rect = [];
  obj.get("Rect").forEach((v) => rect.push(v.asNumber()));
  const [x0, y0, x1, y1] = G.norm(rect);
  const W = x1 - x0, H = y1 - y0;
  const da = obj.getInheritable("DA");
  const daStr = da.isString() ? da.asString() : "";
  const m = /([\d.]+)\s+Tf/.exec(daStr);
  const c = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/.exec(daStr) || null;
  const g = /([\d.]+)\s+g(\s|$)/.exec(daStr);
  const color = c ? `${c[1]} ${c[2]} ${c[3]} rg` : g ? `${g[1]} g` : "0 g";
  const multiline = safe(() => w.isMultiline(), false);
  let size = m ? +m[1] : 0;
  if (!size) size = multiline ? 10 : Math.max(4, Math.min(12, (H - 4) * 0.72));
  const q = obj.getInheritable("Q");
  const align = q.isNumber() ? q.asNumber() : 0;
  const mk = obj.get("MK");
  const col = (k) => {
    const a = mk.isDictionary() ? mk.get(k) : null;
    if (!a || !a.isArray() || !a.length) return null;
    const v = [];
    a.forEach((x) => v.push(x.asNumber()));
    return v.length === 1 ? `${v[0]} g` : v.length === 3 ? `${v.join(" ")} rg` : null;
  };
  const bg = col("BG"), bc = col("BC");
  const fontRef = doc.addFont(E.fonts.font(st.spec));
  const enc = (s2) => [...s2].map((ch) => E.fonts.glyph(st.spec, ch.codePointAt(0))[0].toString(16).padStart(4, "0")).join("");
  const measure = { measure: (spec, t, sz) => E.fonts.textWidth(spec, t, sz) };
  const pad = 2;
  const lines = multiline ? wrapLines(measure, st.spec, text, size, W - 2 * pad) : [{ text: text.replace(/\n/g, " "), width: E.fonts.textWidth(st.spec, text, size) }];
  const parts = ["/Tx BMC q"];
  if (bg) parts.push(`${bg} 0 0 ${W} ${H} re f`);
  if (bc) parts.push(`${bc.replace(/rg$/, "RG").replace(/ g$/, " G")} 1 w 0.5 0.5 ${W - 1} ${H - 1} re S`);
  parts.push(`1 1 ${W - 2} ${H - 2} re W n BT /PSU ${size} Tf ${color}`);
  const lh = size * 1.15;
  let y = multiline ? H - pad - size * ASCENT : (H - size * (ASCENT + DESCENT)) / 2 + size * DESCENT;
  for (const line of lines) {
    const extra = W - 2 * pad - line.width;
    const x = pad + (align === 1 ? extra / 2 : align === 2 ? extra : 0);
    parts.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm <${enc(line.text)}> Tj`);
    y -= lh;
  }
  parts.push("ET Q EMC");
  const res = doc.newDictionary();
  const fonts = doc.newDictionary();
  fonts.put("PSU", fontRef);
  res.put("Font", fonts);
  const d = doc.newDictionary();
  d.put("Type", doc.newName("XObject"));
  d.put("Subtype", doc.newName("Form"));
  d.put("BBox", arr(doc, [0, 0, W, H]));
  d.put("Resources", res);
  const ap = doc.newDictionary();
  ap.put("N", doc.addStream(parts.join("\n"), d));
  obj.put("AP", ap);
}

async function fieldStyle(E, values) {
  return resolveStyle(E, { family: "Liberation Sans", size: 11 }, values.map((v) => String(v ?? "")).join("") + "ığş");
}

export async function setValue(E, pno, id, value) {
  const st = await fieldStyle(E, [value]);
  return E.edit("Form alanını doldur", [pno], () => withPage(E.doc, pno, (page) => {
    for (const w of page.getWidgets()) {
      if (widgetId(w) === id) return applyValue(E, st, w, value);
    }
    return false;
  }));
}

/** { alan_adı: değer } sözlüğüne göre toplu doldurma. */
export async function setValues(E, values) {
  const st = await fieldStyle(E, Object.values(values));
  let n = 0;
  E.edit("Formu doldur", null, () => {
    for (let pno = 0; pno < E.pageCount; pno++) {
      withPage(E.doc, pno, (page) => {
        for (const w of page.getWidgets()) {
          const name = w.getName();
          if (name in values && applyValue(E, st, w, values[name])) n++;
        }
      });
    }
  });
  return n;
}

export function exportValues(E) {
  const out = {};
  for (const f of listFields(E)) if (f.name) out[f.name] = f.type === "checkbox" ? isOn(f.value) : f.value;
  return out;
}

export function exportJson(E) {
  return JSON.stringify(exportValues(E), null, 2);
}

export async function importJson(E, text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new EngineError("JSON dosyası okunamadı", "json");
  }
  return setValues(E, data);
}

// ------------------------------------------------------------------ ekleme
function arr(doc, values) {
  const a = doc.newArray();
  values.forEach((v) => a.push(v));
  return a;
}

function uniqueName(E, name) {
  const used = new Set(listFields(E).map((f) => f.name));
  if (!used.has(name)) return name;
  let i = 2;
  while (used.has(`${name}_${i}`)) i++;
  return `${name}_${i}`;
}

function ensureAcroForm(doc) {
  const root = doc.getTrailer().get("Root");
  let af = root.get("AcroForm");
  if (af.isNull()) {
    root.put("AcroForm", doc.addObject(doc.newDictionary()));
    af = root.get("AcroForm");
  }
  if (af.get("Fields").isNull()) af.put("Fields", doc.newArray());
  if (af.get("DA").isNull()) af.put("DA", doc.newString("/Helv 0 Tf 0 g"));
  let dr = af.get("DR");
  if (dr.isNull()) { af.put("DR", doc.newDictionary()); dr = af.get("DR"); }
  let fonts = dr.get("Font");
  if (fonts.isNull()) { dr.put("Font", doc.newDictionary()); fonts = dr.get("Font"); }
  if (fonts.get("Helv").isNull()) fonts.put("Helv", doc.addSimpleFont(new mu.Font("Helvetica"), "Latin"));
  if (fonts.get("ZaDb").isNull()) {
    const z = doc.newDictionary();
    z.put("Type", doc.newName("Font"));
    z.put("Subtype", doc.newName("Type1"));
    z.put("BaseFont", doc.newName("ZapfDingbats"));
    fonts.put("ZaDb", doc.addObject(z));
  }
  return af;
}

const rgbStr = (c) => (c || [0, 0, 0]).slice(0, 3).map((v) => (+v).toFixed(3)).join(" ");

/** Onay kutusu için /Yes ve /Off görünümleri (mupdf yeni alanda üretmeyebilir). */
function checkboxAppearance(doc, w, h, { border, fill, text, radio }) {
  const res = doc.newDictionary();
  const fontDict = doc.newDictionary();
  const af = doc.getTrailer().get("Root").get("AcroForm");
  fontDict.put("ZaDb", af.get("DR").get("Font").get("ZaDb"));
  res.put("Font", fontDict);
  const bg = fill ? `${rgbStr(fill)} rg 0 0 ${w} ${h} re f ` : "";
  const bd = border ? `${rgbStr(border)} RG 1 w 0.5 0.5 ${w - 1} ${h - 1} re S ` : "";
  const size = Math.min(w, h) * 0.8;
  const glyph = radio ? "l" : "4";
  const tw = size * (radio ? 0.791 : 0.846);
  const mark = `BT /ZaDb ${size.toFixed(2)} Tf ${rgbStr(text)} rg ${((w - tw) / 2).toFixed(2)} ${((h - size * 0.7) / 2).toFixed(2)} Td (${glyph}) Tj ET`;
  const mk = (body) => {
    const d = doc.newDictionary();
    d.put("Type", doc.newName("XObject"));
    d.put("Subtype", doc.newName("Form"));
    d.put("BBox", arr(doc, [0, 0, w, h]));
    d.put("Resources", res);
    return doc.addStream(`q ${bg}${bd}Q q ${body} Q`, d);
  };
  const n = doc.newDictionary();
  n.put("Yes", mk(mark));
  n.put("Off", mk(""));
  const ap = doc.newDictionary();
  ap.put("N", n);
  return ap;
}

export function addField(E, pno, rect, {
  kind = "text", name = "alan", value = "", options = [], fontsize = 11,
  borderColor = [0.4, 0.4, 0.4], fillColor = [0.96, 0.96, 1], textColor = [0, 0, 0],
  maxLen = 0, multiline = false,
} = {}) {
  const fieldName = uniqueName(E, name || "alan");
  return E.edit("Form alanı ekle", [pno], (doc) => {
    const af = ensureAcroForm(doc);
    const page = doc.loadPage(pno);
    let ref;
    try {
      const inv = G.invert(page.getTransform());
      const r = G.transformRect(G.norm(rect), inv);
      const d = doc.newDictionary();
      d.put("Type", doc.newName("Annot"));
      d.put("Subtype", doc.newName("Widget"));
      d.put("T", doc.newString(fieldName));
      d.put("Rect", arr(doc, r));
      d.put("F", 4);
      d.put("P", page.getObject());
      const mk = doc.newDictionary();
      if (borderColor) mk.put("BC", arr(doc, borderColor));
      if (fillColor) mk.put("BG", arr(doc, fillColor));
      d.put("MK", mk);
      const bs = doc.newDictionary();
      bs.put("W", 1);
      bs.put("S", doc.newName("S"));
      d.put("BS", bs);
      let ff = 0;
      if (kind === "checkbox" || kind === "radio") {
        d.put("FT", doc.newName("Btn"));
        d.put("DA", doc.newString(`/ZaDb 0 Tf ${rgbStr(textColor)} rg`));
        mk.put("CA", doc.newString(kind === "radio" ? "l" : "4"));
        if (kind === "radio") ff |= 1 << 15;
        const on = isOn(value);
        d.put("V", doc.newName(on ? "Yes" : "Off"));
        d.put("AS", doc.newName(on ? "Yes" : "Off"));
        d.put("AP", checkboxAppearance(doc, r[2] - r[0], r[3] - r[1], { border: borderColor, fill: fillColor, text: textColor, radio: kind === "radio" }));
      } else if (kind === "combobox" || kind === "listbox") {
        d.put("FT", doc.newName("Ch"));
        d.put("DA", doc.newString(`/Helv ${fontsize} Tf ${rgbStr(textColor)} rg`));
        if (kind === "combobox") ff |= 1 << 17;
        const opt = doc.newArray();
        for (const o of options || []) opt.push(doc.newString(String(o)));
        d.put("Opt", opt);
        if (value) d.put("V", doc.newString(String(value)));
      } else if (kind === "signature") {
        d.put("FT", doc.newName("Sig"));
      } else {
        d.put("FT", doc.newName("Tx"));
        d.put("DA", doc.newString(`/Helv ${fontsize} Tf ${rgbStr(textColor)} rg`));
        if (multiline) ff |= 1 << 12;
        if (maxLen) d.put("MaxLen", maxLen);
        if (value) d.put("V", doc.newString(String(value)));
      }
      if (ff) d.put("Ff", ff);
      ref = doc.addObject(d);
      const po = page.getObject();
      let annots = po.get("Annots");
      if (annots.isNull()) { po.put("Annots", doc.newArray()); annots = po.get("Annots"); }
      annots.push(ref);
      af.get("Fields").push(ref);
    } finally {
      page.destroy();
    }
    // Sayfayı taze yükleyip mupdf'in görünümü üretmesini sağla (Türkçe
    // başlangıç değeri varsa görünüm, alan eklendikten sonra setValue ile yenilenir)
    const num = ref.asIndirect();
    withPage(doc, pno, (p) => {
      for (const w of p.getWidgets()) {
        if (widgetId(w) !== num) continue;
        if (kind === "text" && value) w.setTextValue(String(value));
        if (kind !== "checkbox" && kind !== "radio") safe(() => w.update());
      }
    });
    return fieldName;
  });
}

function removeFromArray(arrObj, num) {
  if (!arrObj.isArray()) return false;
  for (let i = arrObj.length - 1; i >= 0; i--) {
    const v = arrObj.get(i);
    if (v.isIndirect() && v.asIndirect() === num) { arrObj.delete(i); return true; }
  }
  return false;
}

export function deleteField(E, pno, id) {
  return E.edit("Form alanını sil", [pno], (doc) => {
    withPage(doc, pno, (page) => {
      const po = page.getObject();
      removeFromArray(po.get("Annots"), id);
    });
    const af = doc.getTrailer().get("Root").get("AcroForm");
    if (!af.isNull()) {
      const fields = af.get("Fields");
      if (!removeFromArray(fields, id) && fields.isArray()) {
        // ebeveyni olan (Kids) alanlar
        const visit = (a) => {
          for (let i = 0; i < a.length; i++) {
            const kids = a.get(i).get("Kids");
            if (kids.isArray() && (removeFromArray(kids, id) || visit(kids))) return true;
          }
          return false;
        };
        visit(fields);
      }
    }
  });
}

export function flattenForms(E) {
  return E.edit("Formu düzleştir", null, (doc) => doc.bake(false, true));
}
