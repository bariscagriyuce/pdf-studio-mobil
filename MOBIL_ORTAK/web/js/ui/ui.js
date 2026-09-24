// Ortak arayüz yardımcıları: DOM kurucu, bildirim, meşgul göstergesi, alt
// sayfa (sheet) pencereleri, alan listesinden form üreten kurucu, bağlam menüsü.

import { icon } from "./icons.js";

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function iconBtn(name, label, onclick, cls = "icon-btn") {
  return h("button", { class: cls, "aria-label": label, title: label, html: icon(name), onclick });
}

// ------------------------------------------------------------- renk
export const toHex = (c) => "#" + (c || [0, 0, 0]).slice(0, 3).map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
export const fromHex = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
};
export const cssColor = (c, a = 1) => (c && c.length >= 3 ? `rgba(${c.slice(0, 3).map((v) => Math.round(v * 255)).join(",")},${a})` : "transparent");

export const PALETTE = [
  "#000000", "#ffffff", "#e5484d", "#f76b15", "#ffd400", "#3fb950", "#12a594", "#2f6fed", "#8e4ec6", "#d6409f", "#8b93a5", "#6b4f2a",
];

// ------------------------------------------------------------ bildirim
let toastTimer = null;
export function toast(msg, { error = false, ms = 2600 } = {}) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("error", !!error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

let busyDepth = 0;
export async function withBusy(text, fn) {
  const el = $("#busy");
  busyDepth++;
  $("#busy-text").textContent = text || "Çalışıyor…";
  const timer = setTimeout(() => { if (busyDepth) el.hidden = false; }, 180);
  try {
    return await fn();
  } finally {
    busyDepth--;
    if (!busyDepth) {
      clearTimeout(timer);
      el.hidden = true;
    }
  }
}
export function setBusyText(text) {
  $("#busy-text").textContent = text;
}

// ------------------------------------------------------------- pencereler
const sheetStack = [];

/** Açık pencere varsa en üsttekini kapatır (Android geri tuşu, Esc). */
export function closeTopSheet() {
  const top = sheetStack[sheetStack.length - 1];
  if (!top) return false;
  top.close(null);
  return true;
}
export const sheetOpen = () => sheetStack.length > 0;

/**
 * Alt sayfa (telefonda) / ortalanmış pencere (tablette) açar.
 * buttons: [{ label, value, primary, danger, validate }]
 * body: HTMLElement ya da (ctx) => HTMLElement. ctx.close(değer) ile kapanır.
 */
export function openSheet({ title, body, buttons = [], wide = false, onOpen, dismissable = true }) {
  return new Promise((resolve) => {
    const scrim = h("div", { class: "sheet-scrim" });
    const sheet = h("div", { class: "sheet" + (wide ? " wide" : ""), role: "dialog", "aria-label": title });
    const ctx = {
      close(value) {
        const i = sheetStack.indexOf(ctx);
        if (i >= 0) sheetStack.splice(i, 1);
        scrim.remove();
        resolve(value);
      },
      sheet,
    };
    const head = h("div", { class: "sheet-head" }, h("h2", {}, title), iconBtn("close", "Kapat", () => ctx.close(null)));
    const content = typeof body === "function" ? body(ctx) : body;
    const bodyEl = h("div", { class: "sheet-body" }, content);
    sheet.append(h("div", { class: "sheet-grab" }), head, bodyEl);
    if (buttons.length) {
      const foot = h("div", { class: "sheet-foot" });
      for (const b of buttons) {
        foot.append(h("button", {
          class: "btn" + (b.primary ? " primary" : "") + (b.danger ? " danger" : ""),
          onclick: async () => {
            if (b.validate) {
              const ok = await b.validate();
              if (!ok) return;
            }
            ctx.close(typeof b.value === "function" ? b.value() : b.value);
          },
        }, b.label));
      }
      sheet.append(foot);
    }
    scrim.append(sheet);
    scrim.addEventListener("pointerdown", (e) => { if (e.target === scrim && dismissable) ctx.close(null); });
    $("#sheet-root").append(scrim);
    sheetStack.push(ctx);
    if (onOpen) onOpen(ctx);
    const first = sheet.querySelector("input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea");
    if (first && !("ontouchstart" in window)) setTimeout(() => first.focus(), 60);
  });
}

export function alertBox(title, message) {
  return openSheet({ title, body: h("p", { style: { whiteSpace: "pre-wrap", lineHeight: 1.5 } }, message), buttons: [{ label: "Tamam", primary: true, value: true }] });
}

export function confirmBox(title, message, { ok = "Tamam", cancel = "Vazgeç", danger = false } = {}) {
  return openSheet({
    title,
    body: h("p", { style: { whiteSpace: "pre-wrap", lineHeight: 1.5 } }, message),
    buttons: [{ label: cancel, value: false }, { label: ok, primary: !danger, danger, value: true }],
  }).then((v) => !!v);
}

/** Üç seçenekli soru (Kaydet / Kaydetme / Vazgeç gibi). Dönüş: "a" | "b" | null */
export function askBox(title, message, a, b) {
  return openSheet({
    title,
    body: h("p", { style: { lineHeight: 1.5 } }, message),
    buttons: [{ label: "Vazgeç", value: null }, { label: b, value: "b" }, { label: a, primary: true, value: "a" }],
  });
}

export async function promptBox(title, label, value = "", { type = "text", placeholder = "" } = {}) {
  const v = await form(title, [{ key: "v", type, label, value, placeholder }]);
  return v ? v.v : null;
}

// ------------------------------------------------------------- form kurucu
/**
 * Alan tanımlarından form üretir ve { anahtar: değer } döndürür (iptalde null).
 * Tür: text | password | url | number | textarea | select | seg | check | range |
 *      color | pages | info | custom | radio
 * Ortak: key, label, value, hint, show(values) → görünürlük
 */
export function form(title, fields, { ok = "Tamam", cancel = "Vazgeç", wide = false, validate } = {}) {
  const getters = {};
  const rows = [];
  const values = () => Object.fromEntries(Object.entries(getters).map(([k, g]) => [k, g()]));
  const refresh = () => {
    const v = values();
    for (const r of rows) if (r.def.show) r.el.hidden = !r.def.show(v);
  };
  const body = h("div", {});
  for (const f of fields) {
    const el = buildField(f, getters, refresh);
    rows.push({ def: f, el });
    body.append(el);
  }
  setTimeout(refresh, 0);
  return openSheet({
    title, body, wide,
    buttons: [
      { label: cancel, value: null },
      {
        label: ok, primary: true, value: () => values(),
        validate: async () => {
          if (!validate) return true;
          const msg = await validate(values());
          if (msg) { toast(msg, { error: true }); return false; }
          return true;
        },
      },
    ],
  });
}

function buildField(f, getters, refresh) {
  const id = "f_" + Math.random().toString(36).slice(2);
  const wrap = (control, row = false) => h("div", { class: "field" + (row ? " row" : "") },
    f.label ? h("label", { for: id }, f.label) : null, control, f.hint ? h("div", { class: "hint" }, f.hint) : null);
  switch (f.type) {
    case "info":
      return h("div", { class: "field" }, typeof f.value === "string" ? h("div", { class: "hint", style: { fontSize: "13px", lineHeight: 1.5 } }, f.value) : f.value);
    case "custom": {
      const el = f.render((get) => { getters[f.key] = get; }, refresh);
      return wrap(el);
    }
    case "textarea": {
      const t = h("textarea", { id, placeholder: f.placeholder || "", rows: f.rows || 5 });
      t.value = f.value ?? "";
      t.oninput = refresh;
      getters[f.key] = () => t.value;
      return wrap(t);
    }
    case "select": {
      const s = h("select", { id });
      for (const o of f.options) {
        const [val, lab] = Array.isArray(o) ? o : [o, o];
        s.append(h("option", { value: val }, lab));
      }
      s.value = f.value ?? (Array.isArray(f.options[0]) ? f.options[0][0] : f.options[0]);
      s.onchange = () => { refresh(); f.onChange && f.onChange(s.value); };
      getters[f.key] = () => (f.numeric ? +s.value : s.value);
      return wrap(s);
    }
    case "seg": {
      let cur = f.value ?? f.options[0][0];
      const seg = h("div", { class: "seg" });
      const btns = f.options.map(([val, lab, ic]) => {
        const b = h("button", { type: "button", title: lab, html: ic ? icon(ic) : "", onclick: () => { cur = val; btns.forEach((x) => x.classList.toggle("on", x === b)); refresh(); } });
        if (!ic) b.textContent = lab;
        b.classList.toggle("on", val === cur);
        return b;
      });
      seg.append(...btns);
      getters[f.key] = () => cur;
      return wrap(seg);
    }
    case "radio": {
      let cur = f.value ?? f.options[0][0];
      const box = h("div", {});
      for (const [val, lab] of f.options) {
        const r = h("input", { type: "radio", name: id, value: val });
        r.checked = val === cur;
        r.onchange = () => { cur = val; refresh(); };
        box.append(h("label", { class: "checkline" }, r, lab));
      }
      getters[f.key] = () => cur;
      return wrap(box);
    }
    case "check": {
      const c = h("input", { type: "checkbox", id });
      c.checked = !!f.value;
      c.onchange = refresh;
      getters[f.key] = () => c.checked;
      return h("label", { class: "checkline" }, c, f.label);
    }
    case "range": {
      const r = h("input", { type: "range", id, min: f.min, max: f.max, step: f.step || 1 });
      r.value = f.value;
      const fmt = f.format || ((v) => v);
      const out = h("output", {}, fmt(+r.value));
      r.oninput = () => { out.textContent = fmt(+r.value); refresh(); };
      getters[f.key] = () => +r.value;
      return wrap(h("div", { class: "range-line" }, r, out));
    }
    case "color": {
      const picker = colorPicker(f.value, { allowNone: f.allowNone, onChange: refresh });
      getters[f.key] = picker.get;
      return wrap(picker.el);
    }
    case "pages": {
      const { total, current } = f;
      let mode = f.value || "all";
      const rng = h("input", { type: "text", placeholder: "örn. 1-3, 5, 8-", value: f.range || "" });
      const box = h("div", {});
      const opts = [["all", `Tüm sayfalar (1–${total})`], ["current", `Geçerli sayfa (${current + 1})`], ["range", "Aralık:"]];
      for (const [val, lab] of opts) {
        const r = h("input", { type: "radio", name: id, value: val });
        r.checked = val === mode;
        r.onchange = () => { mode = val; rng.disabled = mode !== "range"; };
        box.append(h("label", { class: "checkline" }, r, lab));
      }
      rng.disabled = mode !== "range";
      box.append(rng);
      getters[f.key] = () => (mode === "all" ? [...Array(total).keys()] : mode === "current" ? [current] : parsePages(rng.value, total));
      return wrap(box);
    }
    default: {
      const i = h("input", { id, type: f.type || "text", placeholder: f.placeholder || "", min: f.min, max: f.max, step: f.step, autocomplete: "off", enterkeyhint: "done" });
      i.value = f.value ?? "";
      i.oninput = refresh;
      getters[f.key] = () => (f.type === "number" ? (i.value === "" ? null : +i.value) : i.value);
      return wrap(i);
    }
  }
}

/** Renk seçici: hazır renkler + özel renk (+ isteğe bağlı "yok"). */
export function colorPicker(value, { allowNone = false, onChange } = {}) {
  let cur = value && value.length ? toHex(value) : allowNone ? null : "#000000";
  const box = h("div", { class: "swatches" });
  const btns = [];
  const sync = () => btns.forEach(([b, hex]) => b.classList.toggle("on", hex === cur));
  const pick = (hex) => { cur = hex; custom.value = hex || "#000000"; sync(); onChange && onChange(get()); };
  if (allowNone) {
    const b = h("button", { type: "button", class: "swatch-btn none", title: "Yok", onclick: () => pick(null) });
    btns.push([b, null]);
    box.append(b);
  }
  for (const hex of PALETTE) {
    const b = h("button", { type: "button", class: "swatch-btn", style: { background: hex }, title: hex, onclick: () => pick(hex) });
    btns.push([b, hex]);
    box.append(b);
  }
  const custom = h("input", { type: "color", class: "swatch-custom", title: "Özel renk" });
  custom.value = cur || "#000000";
  custom.oninput = () => { cur = custom.value; sync(); onChange && onChange(get()); };
  box.append(custom);
  sync();
  const get = () => (cur ? fromHex(cur) : null);
  return { el: box, get, set: (c) => { cur = c && c.length ? toHex(c) : allowNone ? null : "#000000"; custom.value = cur || "#000000"; sync(); } };
}

/** "1-3, 5, 9-" → [0,1,2,4,8,9,...] (0 tabanlı, sıralı, tekrarsız) */
export function parsePages(text, total) {
  const out = new Set();
  for (const part of (text || "").split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(part);
    if (m) {
      const a = m[1] ? +m[1] : 1;
      const b = m[2] ? +m[2] : total;
      for (let i = Math.max(1, a); i <= Math.min(total, b); i++) out.add(i - 1);
    } else if (/^\d+$/.test(part)) {
      const n = +part;
      if (n >= 1 && n <= total) out.add(n - 1);
    }
  }
  return [...out].sort((x, y) => x - y);
}

/** "1-3, 4-8, 9-" → [[0,2],[3,7],[8,total-1]] */
export function parseRanges(text, total) {
  const out = [];
  for (const part of (text || "").split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(part);
    let a, b;
    if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : total; } else if (/^\d+$/.test(part)) { a = b = +part; } else continue;
    a = Math.max(1, a); b = Math.min(total, b);
    if (a <= b) out.push([a - 1, b - 1]);
  }
  return out;
}

// ------------------------------------------------------------- bağlam menüsü
/** items: [{ label, icon, action, danger } | "-"]; strip: üstte ikonlu hızlı düğmeler */
export function contextMenu(x, y, items, strip = null) {
  closeContextMenu();
  const menu = h("div", { class: "ctx-menu" });
  const close = () => closeContextMenu();
  if (strip && strip.length) {
    const row = h("div", { class: "ctx-strip" });
    for (const it of strip) row.append(h("button", { html: icon(it.icon) + `<span>${it.label}</span>`, onclick: () => { close(); it.action(); } }));
    menu.append(row, h("hr"));
  }
  for (const it of items) {
    if (it === "-") { menu.append(h("hr")); continue; }
    menu.append(h("button", { class: it.danger ? "danger" : "", html: (it.icon ? icon(it.icon) : "") + `<span>${it.label}</span>`, onclick: () => { close(); it.action(); } }));
  }
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + "px";
  menu.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + "px";
  const scrim = h("div", { style: { position: "fixed", inset: 0, zIndex: 79 }, onpointerdown: close });
  scrim.id = "ctx-scrim";
  document.body.append(scrim);
  menu.id = "ctx-menu";
}

export function closeContextMenu() {
  document.getElementById("ctx-menu")?.remove();
  document.getElementById("ctx-scrim")?.remove();
}

export const fmtBytes = (n) => (n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(2) + " MB");
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
