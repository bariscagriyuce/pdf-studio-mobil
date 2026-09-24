// Araç ayarları ve seçili nesnenin özellikleri. Masaüstündeki ui/inspector.py
// (sağ panel) karşılığı; mobilde alt sayfada açılır.

import { h, openSheet, colorPicker, toast } from "./ui.js";
import { settings, saveSettings } from "./store.js";
import { T, LABELS } from "./tools.js";

const STROKE_TOOLS = new Set([T.INK, T.RECT, T.ELLIPSE, T.LINE, T.ARROW, T.POLYGON, T.UNDERLINE, T.STRIKEOUT, T.SQUIGGLY]);
const WIDTH_TOOLS = new Set([T.INK, T.RECT, T.ELLIPSE, T.LINE, T.ARROW, T.POLYGON]);
const FILL_TOOLS = new Set([T.RECT, T.ELLIPSE, T.POLYGON, T.FREETEXT]);
const OPACITY_TOOLS = new Set([T.INK, T.RECT, T.ELLIPSE, T.LINE, T.ARROW, T.POLYGON, T.HIGHLIGHT, T.UNDERLINE, T.STRIKEOUT, T.SQUIGGLY, T.FREETEXT, T.STAMP]);
const TEXT_TOOLS = new Set([T.TEXT_ADD, T.FREETEXT]);

const NOTE_ICON_LABELS = { Note: "Not", Comment: "Yorum", Key: "Anahtar", Help: "Yardım", NewParagraph: "Yeni paragraf", Paragraph: "Paragraf", Insert: "Ekle" };

const row = (label, control) => h("div", { class: "field" }, h("label", {}, label), control);

function rangeRow(label, value, min, max, step, fmt, onInput) {
  const r = h("input", { type: "range", min, max, step, value });
  const out = h("output", {}, fmt(value));
  r.oninput = () => { out.textContent = fmt(+r.value); onInput(+r.value); };
  return row(label, h("div", { class: "range-line" }, r, out));
}

export class Inspector {
  constructor(app) {
    this.app = app;
  }

  /** Etkin aracın ayarları (değişiklik anında kaydedilir). */
  openTool() {
    const tool = this.app.tool;
    const st = settings.tool;
    const save = () => saveSettings();
    const body = h("div", {});
    if (tool === T.HIGHLIGHT) body.append(row("Vurgu rengi", colorPicker(st.highlightColor, { onChange: (c) => { st.highlightColor = c; save(); } }).el));
    if (STROKE_TOOLS.has(tool)) body.append(row("Renk", colorPicker(st.color, { onChange: (c) => { st.color = c; save(); } }).el));
    if (FILL_TOOLS.has(tool)) body.append(row(tool === T.FREETEXT ? "Arka plan" : "Dolgu", colorPicker(st.fill, { allowNone: true, onChange: (c) => { st.fill = c; save(); } }).el));
    if (WIDTH_TOOLS.has(tool)) body.append(rangeRow("Kalınlık", st.width, 0.5, 20, 0.5, (v) => v + " pt", (v) => { st.width = v; save(); }));
    if (OPACITY_TOOLS.has(tool)) body.append(rangeRow("Saydamlık", Math.round(st.opacity * 100), 10, 100, 5, (v) => "%" + v, (v) => { st.opacity = v / 100; save(); }));
    if (TEXT_TOOLS.has(tool)) {
      const fam = h("select", {}, ...this.app.fontFamilies.map((f) => h("option", { value: f }, f)));
      fam.value = st.fontFamily;
      fam.onchange = () => { st.fontFamily = fam.value; save(); };
      const size = h("input", { type: "number", min: 3, max: 400, step: 0.5, value: st.fontsize });
      size.oninput = () => { if (+size.value > 0) { st.fontsize = +size.value; save(); } };
      body.append(h("div", { class: "row2" }, row("Yazı tipi", fam), row("Punto", size)));
      body.append(row("Metin rengi", colorPicker(st.textColor, { onChange: (c) => { st.textColor = c; save(); } }).el));
      const bold = h("input", { type: "checkbox" });
      bold.checked = st.bold;
      bold.onchange = () => { st.bold = bold.checked; save(); };
      const italic = h("input", { type: "checkbox" });
      italic.checked = st.italic;
      italic.onchange = () => { st.italic = italic.checked; save(); };
      body.append(h("div", { style: { display: "flex", gap: "16px" } }, h("label", { class: "checkline" }, bold, "Kalın"), h("label", { class: "checkline" }, italic, "İtalik")));
    }
    if (tool === T.NOTE) {
      const s = h("select", {}, ...this.app.consts.noteIcons.map((i) => h("option", { value: i }, NOTE_ICON_LABELS[i] || i)));
      s.value = st.noteIcon;
      s.onchange = () => { st.noteIcon = s.value; save(); };
      body.append(row("Not simgesi", s));
    }
    if (tool === T.STAMP) {
      const s = h("select", {}, ...this.app.consts.stamps.map((name, i) => h("option", { value: i }, `${this.app.consts.stampLabels[name] || name} (${name})`)));
      s.value = st.stampIndex;
      s.onchange = () => { st.stampIndex = +s.value; save(); };
      body.append(row("Damga türü", s));
    }
    if (tool === T.REDACT) body.append(row("Karartma dolgusu", colorPicker(st.redactFill, { onChange: (c) => { st.redactFill = c; save(); } }).el));
    if (tool === T.POLYGON) {
      const c = h("input", { type: "checkbox" });
      c.checked = st.polygonClosed;
      c.onchange = () => { st.polygonClosed = c.checked; save(); this.app.updateFloat(); };
      body.append(h("label", { class: "checkline" }, c, "Kapalı çokgen (açıksa çoklu çizgi)"));
    }
    const author = h("input", { type: "text", value: settings.author, placeholder: "Açıklamalarda görünecek ad" });
    author.oninput = () => { settings.author = author.value.trim(); save(); };
    body.append(row("Yazar", author));
    if (body.children.length === 1) body.prepend(h("div", { class: "hint" }, "Bu aracın ayarı yok."));
    return openSheet({ title: `Ayarlar — ${LABELS[tool] || "Araç"}`, body, buttons: [{ label: "Tamam", primary: true, value: true }] });
  }

  /** Seçili açıklamanın özellikleri. */
  async openObject() {
    const o = this.app.objSel;
    if (!o || o.kind !== "annot") return;
    const a = o.info;
    const content = h("textarea", { rows: 3 });
    content.value = a.content || "";
    const author = h("input", { type: "text", value: a.author || "" });
    const color = a.color && a.color.length ? colorPicker(a.color) : a.type === "FreeText" ? colorPicker(null, { allowNone: true }) : colorPicker([0, 0, 0]);
    const fill = a.hasFill ? colorPicker(a.fill, { allowNone: true }) : null;
    let opacity = a.opacity ?? 1;
    let width = a.width || 1;
    const body = h("div", {},
      h("div", { class: "hint" }, `${a.typeName} · sayfa ${o.pno + 1}${a.modified ? " · " + a.modified : ""}`),
      row(a.type === "FreeText" ? "Metin" : "İçerik / yorum", content),
      row("Yazar", author),
      row(a.type === "FreeText" ? "Arka plan" : "Renk", color.el),
    );
    if (fill) body.append(row("Dolgu", fill.el));
    if (a.hasBorder) body.append(rangeRow("Kalınlık", width, 0, 20, 0.5, (v) => v + " pt", (v) => { width = v; }));
    body.append(rangeRow("Saydamlık", Math.round(opacity * 100), 10, 100, 5, (v) => "%" + v, (v) => { opacity = v / 100; }));
    let icon = null;
    if (a.type === "Text") {
      icon = h("select", {}, ...this.app.consts.noteIcons.map((i) => h("option", { value: i }, NOTE_ICON_LABELS[i] || i)));
      icon.value = a.icon || "Note";
      body.append(row("Simge", icon));
    } else if (a.type === "Stamp") {
      icon = h("select", {}, ...this.app.consts.stamps.map((n) => h("option", { value: n }, this.app.consts.stampLabels[n] || n)));
      icon.value = a.icon || "Draft";
      body.append(row("Damga", icon));
    }
    let textColor = null, fontsize = null;
    if (a.type === "FreeText") {
      fontsize = h("input", { type: "number", min: 4, max: 200, placeholder: "değişmesin" });
      textColor = colorPicker(null, { allowNone: true });
      body.append(row("Punto", fontsize), row("Metin rengi (boş: değişmesin)", textColor.el));
    }
    const res = await openSheet({
      title: "Açıklama özellikleri", body,
      buttons: [{ label: "Sil", danger: true, value: "delete" }, { label: "Vazgeç", value: null }, { label: "Uygula", primary: true, value: "apply" }],
    });
    if (res === "delete") return this.app.commands.deleteSelectedObject();
    if (res !== "apply") return;
    const props = { content: content.value, author: author.value, opacity, color: color.get() || [] };
    if (fill) props.fill = fill.get() || [];
    if (a.hasBorder) props.width = width;
    if (icon) props.icon = icon.value;
    if (fontsize && +fontsize.value) props.fontsize = +fontsize.value;
    if (textColor && textColor.get()) props.textColor = textColor.get();
    try {
      const info = await this.app.commands.act(() => this.app.engine.call("updateAnnot", o.pno, a.id, props));
      this.app.setObject({ ...o, info, rect: info.rect });
    } catch (e) {
      toast(e.message, { error: true });
    }
  }
}
