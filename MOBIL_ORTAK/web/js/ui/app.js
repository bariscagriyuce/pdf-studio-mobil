// Uygulama çekirdeği: belge yaşam döngüsü, durum, kaplama katmanı, arama,
// üst/alt çubuklar ve ana ekran. Masaüstündeki ui/mainwindow.py'nin mobil karşılığı.

import { $, h, toast, withBusy, form, askBox, promptBox, closeTopSheet, sheetOpen, closeContextMenu, escapeHtml } from "./ui.js";
import { icon } from "./icons.js";
import { settings, saveSettings, addRecent, removeRecent } from "./store.js";
import { Viewer } from "./viewer.js";
import { T, CATEGORIES, LABELS, SHORT, ICONS, HINTS, DRAW_TOOLS } from "./tools.js";
import { appName } from "../branding.js";
import { t, tn, num, pct, locale, setLanguage, setSystemLocale, currentLanguage, N_, errText } from "../i18n.js";

export class App {
  constructor(engine, bridge) {
    this.engine = engine;
    this.bridge = bridge;
    this.settings = settings;
    this.tool = T.SELECT;
    this.category = "view";
    this.doc = null; // { name, handle }
    this.info = null;
    this.consts = null;
    this.search = { query: "", hits: [], index: -1 };
    this.selection = null; // { pno, rects, quads, text }
    this.objSel = null; // { kind, pno, info, rect }
    this.redactMarks = [];
    this.draft = null; // { pno, markup }
    this.measure = null;
    this.blocks = new Map();
    this.links = new Map();
    this.gestureLock = false;
    this.commands = null; // commands.js tarafından atanır
    this.viewer = new Viewer(this);
    engine.onChange((state, change) => this._onEngineChange(state, change));
  }

  async init() {
    this.consts = await this.engine.call("constants");
    this.applyTheme();
    this._buildTopbar();
    this._buildToolbar();
    this.renderHome();
    this.updateState(this.engine.state);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => this.applyTheme());
  }

  get isOpen() {
    return !!this.doc;
  }

  // ------------------------------------------------------------------ tema
  applyTheme() {
    const pref = settings.theme;
    const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]').content = dark ? "#232733" : "#ffffff";
    this.bridge.native && this.bridge.call("setTheme", { dark }).catch(() => {});
  }

  toggleTheme() {
    const cur = document.documentElement.dataset.theme;
    settings.theme = cur === "dark" ? "light" : "dark";
    saveSettings();
    this.applyTheme();
  }

  // ------------------------------------------------------------ üst çubuk
  _buildTopbar() {
    const set = (id, ic, fn) => {
      const b = $(id);
      b.innerHTML = icon(ic);
      b.onclick = fn;
    };
    this._labelTopbar();
    set("#btn-menu", "menu", () => this.commands.openDrawer());
    set("#btn-undo", "undo", () => this.commands.run("undo"));
    set("#btn-redo", "redo", () => this.commands.run("redo"));
    set("#btn-panels", "sidebar", () => this.commands.run("sidebar"));
    set("#btn-search", "search", () => this.commands.run("find"));
    set("#btn-save", "save", () => this.commands.run("save"));
    $("#page-pill").onclick = () => this.commands.run("goto");
    // arama çubuğu (etiketler _labelTopbar'da)
    set("#search-prev", "chevron-up", () => this.searchStep(-1));
    set("#search-next", "chevron-down", () => this.searchStep(1));
    set("#search-opts", "settings", () => this.searchOptions());
    set("#search-close", "close", () => this.closeSearch());
    const input = $("#search-input");
    let timer = null;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.runSearch(input.value), 350);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (input.value !== this.search.query) this.runSearch(input.value);
        else this.searchStep(e.shiftKey ? -1 : 1);
      } else if (e.key === "Escape") this.closeSearch();
    });
  }

  /** index.html'deki erişilebilirlik etiketleri ve yer tutucular (dil değişince de) */
  _labelTopbar() {
    const labels = {
      "#btn-menu": N_("Menü"), "#btn-undo": N_("Geri al"), "#btn-redo": N_("Yinele"), "#btn-panels": N_("Paneller"),
      "#btn-search": N_("Bul"), "#btn-save": N_("Kaydet"), "#search-prev": N_("Önceki"), "#search-next": N_("Sonraki"),
      "#search-opts": N_("Seçenekler"), "#search-close": N_("Kapat"),
    };
    for (const [id, label] of Object.entries(labels)) {
      $(id).setAttribute("aria-label", t(label));
      $(id).title = t(label);
    }
    $("#search-input").placeholder = t("Belgede ara…");
  }

  /** Arayüz dilini değiştirir ve kaydeder ("system", "tr", "en", "pt_BR"). */
  setLanguage(pref) {
    settings.language = pref;
    saveSettings();
    setLanguage(pref);
    this.relocalize();
    if (!this.bridge.native) return;
    this.bridge
      .call("setLanguage", { lang: pref })
      .then((r) => {
        if (!r || !r.system) return;
        setSystemLocale(r.system);
        // "Sistem" seçildiyse ve cihaz dili WebView'in sandığından farklıysa düzelt
        if (settings.language === pref && setLanguage(pref) !== this._shownLanguage) this.relocalize();
      })
      .catch(() => {});
  }

  /** Dil değişti: kalıcı arayüz parçalarını yeni dilde yeniden kur. */
  relocalize() {
    this._shownLanguage = currentLanguage();
    document.title = appName();
    this._labelTopbar();
    this._buildToolbar();
    this.renderHome();
    this.updateState(this.engine.state);
    this.updateFloat();
    this.commands?.panels?.isOpen && this.commands.panels.render();
  }

  updateState(state) {
    const open = !!state.open && !!this.doc;
    $("#doc-title").textContent = open ? state.name : appName();
    $("#doc-title").classList.toggle("dirty", open && state.dirty);
    $("#btn-undo").disabled = !state.canUndo;
    $("#btn-redo").disabled = !state.canRedo;
    $("#btn-undo").title = state.canUndo ? t("Geri al: {label}", { label: t(state.undoLabel) }) : t("Geri al");
    $("#btn-redo").title = state.canRedo ? t("Yinele: {label}", { label: t(state.redoLabel) }) : t("Yinele");
    for (const id of ["#btn-undo", "#btn-redo", "#btn-panels", "#btn-search", "#btn-save"]) $(id).hidden = !open;
    $("#toolbar").hidden = !open;
    $("#page-pill").hidden = !open;
    $("#home").hidden = open;
    this.updateSubtitle();
    this.bridge.setDirty(open && state.dirty);
  }

  updateSubtitle() {
    if (!this.doc) {
      $("#doc-sub").textContent = "";
      return;
    }
    const n = this.viewer.pages.length;
    const z = Math.round(this.viewer.zoom * 100);
    $("#doc-sub").textContent = tn("{n} sayfa", n) + " · " + pct(z) + (this.tool !== T.SELECT ? " · " + t(LABELS[this.tool]) : "");
    $("#page-pill").textContent = `${this.viewer.current + 1} / ${n}`;
  }

  onPageChange() {
    this.updateSubtitle();
    this.commands?.panels?.onPageChange(this.viewer.current);
  }

  onZoom(z, live = false) {
    const pill = $("#zoom-pill");
    pill.textContent = pct(Math.round(z * 100));
    pill.hidden = false;
    clearTimeout(this._zoomTimer);
    this._zoomTimer = setTimeout(() => { pill.hidden = true; }, live ? 900 : 700);
    if (!live) {
      this.updateSubtitle();
      this.viewer.updateOverlays();
    }
  }

  // ------------------------------------------------------------ alt çubuk
  _buildToolbar() {
    const cats = $("#tool-cats");
    cats.innerHTML = "";
    for (const c of CATEGORIES) {
      cats.append(h("button", { "data-cat": c.id, onclick: () => this.setCategory(c.id) }, t(c.label)));
    }
    this.setCategory(this.category);
  }

  setCategory(id) {
    this.category = id;
    for (const b of $("#tool-cats").children) b.classList.toggle("on", b.dataset.cat === id);
    const row = $("#tool-row");
    row.innerHTML = "";
    const cat = CATEGORIES.find((c) => c.id === id);
    for (const item of cat.items) {
      if (item.startsWith("cmd:")) {
        const cmd = this.commands.get(item.slice(4));
        if (!cmd) continue;
        row.append(h("button", { class: "tool-btn", title: t(cmd.label), html: icon(cmd.icon || "info") + `<span>${escapeHtml(t(cmd.short || cmd.label))}</span>`, onclick: () => this.commands.run(cmd.id) }));
      } else {
        const b = h("button", { class: "tool-btn", "data-tool": item, title: t(LABELS[item]), html: icon(ICONS[item]) + `<span>${escapeHtml(t(SHORT[item]))}</span>`, onclick: () => this.setTool(this.tool === item && item !== T.SELECT ? T.SELECT : item) });
        row.append(b);
      }
    }
    this._syncToolButtons();
  }

  _syncToolButtons() {
    for (const b of document.querySelectorAll(".tool-btn[data-tool]")) b.classList.toggle("on", b.dataset.tool === this.tool);
  }

  setTool(tool) {
    this.cancelGesture();
    if (this.tool === T.POLYGON && tool !== T.POLYGON) this.interact?.finishPolygon(false);
    this.tool = tool;
    this.clearObject();
    this.measure = null;
    if (tool !== T.SELECT) this.clearSelection();
    $("#viewer").classList.toggle("draw-mode", DRAW_TOOLS.has(tool));
    this._syncToolButtons();
    const hint = $("#tool-hint");
    if (tool !== T.SELECT && tool !== T.PAN && HINTS[tool]) {
      hint.textContent = t(HINTS[tool]);
      hint.hidden = false;
      clearTimeout(this._hintTimer);
      this._hintTimer = setTimeout(() => { hint.hidden = true; }, 4500);
    } else {
      hint.hidden = true;
    }
    this.updateFloat();
    this.updateSubtitle();
    if (tool === T.TEXT_EDIT || settings.showTextBoxes) this.loadVisibleBlocks();
    this.viewer.updateOverlays();
  }

  // ----------------------------------------------------- yüzen eylemler
  /** Araca/seçime göre alttaki yüzen düğmeler. */
  updateFloat() {
    const box = $("#float-actions");
    const acts = [];
    const add = (label, ic, fn, cls = "") => acts.push(h("button", { class: cls, html: icon(ic) + `<span>${label}</span>`, onclick: fn }));
    if (this.selection && this.selection.text) {
      add(t("Kopyala"), "copy", () => this.commands.run("copy"));
      add(t("Vurgula"), "highlight", () => this.commands.markupSelection("highlight"));
      add(t("Altını çiz"), "underline", () => this.commands.markupSelection("underline"));
      add(t("Üstünü çiz"), "strikeout", () => this.commands.markupSelection("strikeout"));
      add(t("Karart"), "redact", () => this.commands.redactSelection());
      add("", "close", () => this.clearSelection());
    } else if (this.objSel) {
      const o = this.objSel;
      if (o.kind === "annot") {
        add(t("Özellikler"), "settings", () => this.commands.inspector.openObject());
        if (o.info.type === "FileAttachment") add(t("Eki kaydet"), "save", () => this.commands.saveAttachment(o));
      } else if (o.kind === "image") {
        add(t("Değiştir"), "image", () => this.commands.replaceImage(o));
        add(t("Kaydet"), "save", () => this.commands.saveImage(o));
      }
      add(t("Sil"), "trash", () => this.commands.deleteSelectedObject(), "danger");
      add("", "close", () => this.clearObject());
    } else if (this.tool === T.POLYGON && this.interact?.poly) {
      add(t("Bitti"), "check", () => this.interact.finishPolygon(true), "primary");
      add(settings.tool.polygonClosed ? t("Kapalı") : t("Açık"), "polygon", () => { settings.tool.polygonClosed = !settings.tool.polygonClosed; saveSettings(); this.updateFloat(); });
      add(t("İptal"), "close", () => this.interact.finishPolygon(false));
    } else if (this.tool === T.REDACT && this.redactMarks.length) {
      add(t("Karartmaları uygula ({n})", { n: this.redactMarks.length }), "redact", () => this.commands.run("apply_redactions"), "danger");
      add(t("Temizle"), "close", () => { this.redactMarks = []; this.viewer.updateOverlays(); this.updateFloat(); });
    } else if (this.tool === T.MEASURE && this.measure) {
      add(this.measureText(), "measure", () => {});
      add(t("Belgeye ekle"), "plus", () => this.commands.addMeasure());
    } else if (this.tool !== T.SELECT && this.tool !== T.PAN) {
      add(t("Ayarlar"), "palette", () => this.commands.inspector.openTool());
      add(t("Bitti"), "check", () => this.setTool(T.SELECT), "primary");
    }
    box.innerHTML = "";
    box.append(...acts);
    box.hidden = !acts.length || !this.isOpen;
  }

  measureText() {
    const m = this.measure;
    if (!m) return "";
    const d = Math.hypot(m.p1[0] - m.p0[0], m.p1[1] - m.p0[1]);
    return t("{pt} pt · {mm} mm · {inch} inç", { pt: num(d, 1), mm: num((d / 72) * 25.4, 1), inch: num(d / 72, 2) });
  }

  // ------------------------------------------------------------- seçimler
  setSelection(sel) {
    this.selection = sel && sel.rects && sel.rects.length ? sel : null;
    this.viewer.updateOverlays();
    this.updateFloat();
  }

  clearSelection() {
    if (!this.selection) return;
    this.selection = null;
    this.viewer.updateOverlays();
    this.updateFloat();
  }

  setObject(obj) {
    this.objSel = obj;
    this.viewer.updateOverlays();
    this.updateFloat();
    $("#viewer").classList.toggle("draw-mode", !!obj || DRAW_TOOLS.has(this.tool));
  }

  clearObject() {
    if (!this.objSel) return;
    this.objSel = null;
    this.viewer.updateOverlays();
    this.updateFloat();
    $("#viewer").classList.toggle("draw-mode", DRAW_TOOLS.has(this.tool));
  }

  cancelGesture() {
    this.interact?.cancel();
    this.gestureLock = false;
  }

  // --------------------------------------------------------- metin blokları
  async loadBlocks(pno) {
    if (this.blocks.has(pno)) return this.blocks.get(pno);
    const p = this.engine.call("textBlocks", pno).then((b) => {
      this.blocks.set(pno, b);
      this.viewer.updateOverlay(pno);
      return b;
    });
    this.blocks.set(pno, p);
    return p;
  }

  loadVisibleBlocks() {
    if (!this.isOpen) return;
    const c = this.viewer.current;
    for (const p of [c - 1, c, c + 1, c + 2]) if (p >= 0 && p < this.viewer.pages.length) this.loadBlocks(p);
  }

  async linksFor(pno) {
    if (!this.links.has(pno)) this.links.set(pno, await this.engine.call("listLinks", pno).catch(() => []));
    return this.links.get(pno);
  }

  // ----------------------------------------------------------- kaplama
  overlayMarkup(pno, zoom) {
    const out = [];
    const R = (r, cls, extra = "") => `<rect class="${cls}" x="${r[0]}" y="${r[1]}" width="${r[2] - r[0]}" height="${r[3] - r[1]}" ${extra}/>`;
    if (settings.showTextBoxes || this.tool === T.TEXT_EDIT) {
      const b = this.blocks.get(pno);
      if (Array.isArray(b)) for (const blk of b) out.push(R(blk.bbox, "blk" + (this.hoverBlock === blk ? " hover" : "")));
      else if (!b && pno === this.viewer.current) this.loadBlocks(pno);
    }
    const s = this.search;
    s.hits.forEach((hit, i) => {
      if (hit.pno !== pno) return;
      for (const r of hit.rects) out.push(R(r, "hit" + (i === s.index ? " cur" : "")));
    });
    if (this.selection && this.selection.pno === pno) for (const r of this.selection.rects) out.push(R(r, "sel"));
    for (const m of this.redactMarks) if (m.pno === pno) out.push(R(m.rect, "redact-mark"));
    if (this.measure && this.measure.pno === pno) {
      const { p0, p1 } = this.measure;
      out.push(`<line class="measure-line" x1="${p0[0]}" y1="${p0[1]}" x2="${p1[0]}" y2="${p1[1]}"/>`);
      const fs = 12 / zoom;
      out.push(`<text class="measure-label" style="font-size:${fs}px;stroke-width:${3 / zoom}px" x="${(p0[0] + p1[0]) / 2 + 6 / zoom}" y="${(p0[1] + p1[1]) / 2 - 6 / zoom}">${escapeHtml(this.measureText())}</text>`);
    }
    if (this.objSel && this.objSel.pno === pno) {
      const r = this.interact?.liveRect || this.objSel.rect;
      out.push(R(r, "objsel"));
      if (this.objSel.resizable !== false) {
        const hs = 9 / zoom;
        for (const [x, y] of [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]]) {
          out.push(`<rect class="handle" x="${x - hs / 2}" y="${y - hs / 2}" width="${hs}" height="${hs}" rx="${hs / 4}"/>`);
        }
      }
    }
    if (this.draft && this.draft.pno === pno) out.push(this.draft.markup);
    return out.join("");
  }

  setDraft(pno, markup) {
    const old = this.draft && this.draft.pno;
    this.draft = markup ? { pno, markup } : null;
    if (old !== undefined && old !== null && old !== pno) this.viewer.updateOverlay(old);
    if (pno !== null && pno !== undefined) this.viewer.updateOverlay(pno);
  }

  // ------------------------------------------------------------ motor olayı
  async _onEngineChange(state, change) {
    this.updateState(state);
    if (!change || !this.doc) return;
    if (change.structural) {
      this.blocks.clear();
      this.links.clear();
      const pages = await this.engine.call("pageSizes");
      this.viewer.setDocument(pages, { keepPlace: true });
      this.viewer.invalidateAll();
      this.search.hits = [];
      this.search.index = -1;
      // sayfa numaraları değişti: arama açıksa sonuçları yeniden hesapla
      if (this.search.query) this.runSearch(this.search.query, { reveal: false });
      this.redactMarks = this.redactMarks.filter((m) => m.pno < pages.length);
      this.commands?.panels?.refresh(true);
    } else if (change.pages) {
      for (const p of change.pages) {
        this.blocks.delete(p);
        this.links.delete(p);
      }
      this.viewer.invalidate(change.pages);
      this.commands?.panels?.refresh(false, change.pages);
    }
    this.updateSubtitle();
    if (this.tool === T.TEXT_EDIT || settings.showTextBoxes) this.loadVisibleBlocks();
  }

  // ------------------------------------------------------------ belge işlemleri
  async confirmDiscard() {
    if (!this.doc || !this.engine.state.dirty) return true;
    const ans = await askBox(t("Kaydedilmemiş değişiklikler"), t("“{name}” belgesindeki değişiklikler kaydedilsin mi?", { name: this.engine.state.name }), t("Kaydet"), t("Kaydetme"));
    if (ans === null) return false;
    if (ans === "a") return this.save();
    return true;
  }

  /** { name, bytes, handle } — PDF ya da mupdf'in açabildiği başka bir biçim */
  async openFile(file, { skipConfirm = false } = {}) {
    if (!skipConfirm && !(await this.confirmDiscard())) return false;
    let password = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const data = file.bytes.slice();
        const info = await withBusy(t("Belge açılıyor…"), () => this.engine.call("open", data, file.name, password));
        this._installDoc(info, { name: info.name, handle: file.handle || null });
        if (file.handle) addRecent({ name: file.name, handle: file.handle, date: Date.now() });
        return true;
      } catch (e) {
        if (e.code !== "password") {
          toast(e.code === "open-failed" ? errText(e) : t("Belge açılamadı: {error}", { error: errText(e) }), { error: true, ms: 5000 });
          return false;
        }
        password = await promptBox(attempt ? t("Parola yanlış") : t("Parola gerekli"), t("“{name}” parola korumalı. Parolayı girin:", { name: file.name }), "", { type: "password" });
        if (password === null) return false;
      }
    }
    return false;
  }

  _installDoc(info, doc) {
    this.doc = doc;
    this.info = info;
    this.search = { query: "", hits: [], index: -1 };
    this.selection = null;
    this.objSel = null;
    this.redactMarks = [];
    this.blocks.clear();
    this.links.clear();
    this.viewer.fitMode = "width";
    this.viewer.current = 0;
    this.viewer.setDocument(info.pages);
    this.setTool(T.SELECT);
    this.updateState(this.engine.state);
    this.commands?.panels?.refresh(true);
    this.closeSearch();
    $("#viewer").focus({ preventScroll: true });
  }

  async newBlank(w = 595, h = 842, n = 1) {
    if (!(await this.confirmDiscard())) return;
    const info = await this.engine.call("newBlank", w, h, n);
    this._installDoc(info, { name: info.name, handle: null });
  }

  async newFromImages() {
    const files = await this.bridge.openFiles({ kind: "image", multiple: true });
    if (!files.length) return;
    if (!(await this.confirmDiscard())) return;
    const info = await withBusy(t("Görüntüler PDF'e dönüştürülüyor…"), () => this.engine.call("newFromImages", files.map((f) => ({ name: f.name, bytes: f.bytes }))));
    this._installDoc(info, { name: info.name, handle: null });
  }

  async openDialog() {
    const files = await this.bridge.openFiles({ kind: "doc" });
    if (files.length) await this.openFile(files[0]);
  }

  async openRecent(r) {
    try {
      const f = await withBusy(t("Açılıyor…"), () => this.bridge.openHandle(r.handle));
      await this.openFile({ ...f, name: f.name || r.name, handle: r.handle });
    } catch (e) {
      toast(t("Dosyaya erişilemiyor: {error}", { error: errText(e) }), { error: true });
      removeRecent(r.handle);
      this.renderHome();
    }
  }

  /** Kaydet: tanıtıcı varsa üzerine yazar, yoksa farklı kaydet. */
  async save() {
    if (!this.doc) return false;
    if (!this.doc.handle || !this.bridge.native) return this.saveAs();
    try {
      const bytes = await withBusy(t("Kaydediliyor…"), () => this.engine.call("save"));
      await this.bridge.writeFile("save", { name: this.engine.state.name, handle: this.doc.handle }, bytes);
      await this.engine.call("markSaved", this.engine.state.name);
      toast("Kaydedildi");
      return true;
    } catch (e) {
      toast(t("Kaydedilemedi: {error} — “Farklı kaydet” deneyin.", { error: errText(e) }), { error: true, ms: 5000 });
      return false;
    }
  }

  async saveAs() {
    if (!this.doc) return false;
    try {
      const bytes = await withBusy(t("Hazırlanıyor…"), () => this.engine.call("save"));
      const res = await this.bridge.writeFile("saveAs", { name: this.engine.state.name }, bytes);
      if (!res) return false;
      if (res.handle) this.doc.handle = res.handle;
      await this.engine.call("markSaved", res.name || this.engine.state.name);
      if (res.handle) addRecent({ name: res.name || this.engine.state.name, handle: res.handle, date: Date.now() });
      toast("Kaydedildi: " + (res.name || this.engine.state.name));
      return true;
    } catch (e) {
      toast(t("Kaydedilemedi: {error}", { error: errText(e) }), { error: true, ms: 5000 });
      return false;
    }
  }

  /** Bayt üreten bir işlemin çıktısını kaydet/paylaş (dışa aktarma, bölme...). */
  async deliver(name, bytes, mime) {
    const how = this.bridge.native ? await form(`“${name}”`, [
      { type: "info", value: t("{size} MB hazır. Ne yapılsın?", { size: num(bytes.length / 1048576, 2) }) },
      { key: "mode", type: "radio", value: "saveAs", options: [["saveAs", t("Dosyaya kaydet")], ["share", t("Paylaş")]] },
    ], { ok: t("Devam") }) : { mode: "saveAs" };
    if (!how) return null;
    try {
      const res = await this.bridge.writeFile(how.mode, { name, mime }, bytes);
      if (res && how.mode === "saveAs") toast("Kaydedildi: " + (res.name || name));
      return res;
    } catch (e) {
      toast(t("İşlem başarısız: {error}", { error: errText(e) }), { error: true });
      return null;
    }
  }

  async closeDocument() {
    if (!(await this.confirmDiscard())) return;
    await this.engine.call("close");
    this.doc = null;
    this.info = null;
    this.viewer.clear();
    this.setTool(T.SELECT);
    this.closeSearch();
    this.commands?.panels?.close();
    this.renderHome();
    this.updateState(this.engine.state);
  }

  // ------------------------------------------------------------------- arama
  openSearch() {
    $("#searchbar").hidden = false;
    const i = $("#search-input");
    i.focus();
    i.select();
  }

  closeSearch() {
    $("#searchbar").hidden = true;
    if (this.search.hits.length) {
      this.search = { query: "", hits: [], index: -1 };
      this.viewer.updateOverlays();
    }
    $("#search-count").textContent = "";
  }

  async runSearch(query, { reveal = true } = {}) {
    this.search.query = query;
    if (!query.trim()) {
      this.search.hits = [];
      this.search.index = -1;
      $("#search-count").textContent = "";
      this.viewer.updateOverlays();
      this.commands?.panels?.showSearch();
      return;
    }
    const hits = await this.engine.call("findAll", query, { caseSensitive: settings.searchCase, wholeWords: settings.searchWhole });
    if (this.search.query !== query) return;
    this.search.hits = hits;
    // geçerli sayfadan sonraki ilk sonuca git
    const i = hits.findIndex((x) => x.pno >= this.viewer.current);
    this.search.index = hits.length ? Math.max(0, i) : -1;
    $("#search-count").textContent = hits.length ? `${this.search.index + 1}/${hits.length}` : "0";
    this.viewer.updateOverlays();
    if (reveal && hits.length) this.viewer.revealRect(hits[this.search.index].pno, hits[this.search.index].rect);
    this.commands?.panels?.showSearch();
  }

  searchStep(dir) {
    const s = this.search;
    if (!s.hits.length) {
      if ($("#search-input").value) this.runSearch($("#search-input").value);
      return;
    }
    s.index = (s.index + dir + s.hits.length) % s.hits.length;
    this.gotoHit(s.index);
  }

  gotoHit(i) {
    const s = this.search;
    s.index = i;
    $("#search-count").textContent = `${i + 1}/${s.hits.length}`;
    this.viewer.updateOverlays();
    this.viewer.revealRect(s.hits[i].pno, s.hits[i].rect);
  }

  async searchOptions() {
    const v = await form(t("Arama seçenekleri"), [
      { key: "c", type: "check", label: t("Büyük/küçük harf duyarlı"), value: settings.searchCase },
      { key: "w", type: "check", label: t("Yalnızca tam kelimeler"), value: settings.searchWhole },
    ]);
    if (!v) return;
    settings.searchCase = v.c;
    settings.searchWhole = v.w;
    saveSettings();
    if (this.search.query) this.runSearch(this.search.query);
  }

  // ------------------------------------------------------------ ana ekran
  renderHome() {
    const home = $("#home");
    home.innerHTML = "";
    const action = (ic, title, sub, fn) => h("button", { onclick: fn, html: icon(ic) + `<div><b>${title}</b><br><span>${sub}</span></div>` });
    const inner = h("div", { class: "home-inner" },
      h("div", { class: "home-logo" }, h("img", { src: "img/icon.png", alt: "" }), h("div", {}, h("h1", {}, appName()), h("p", {}, t("PDF düzenleyici — metin, açıklama, sayfa, form, güvenlik")))),
      h("div", { class: "home-actions" },
        action("open", t("PDF aç"), t("Cihazdan ya da buluttan"), () => this.openDialog()),
        action("new", t("Boş belge"), t("A4, yeni sayfa"), () => this.commands.run("new")),
        action("image", t("Görüntülerden PDF"), t("Fotoğrafları birleştir"), () => this.newFromImages()),
        action("merge", t("PDF birleştir"), t("Birden çok dosya"), () => this.commands.run("merge_new")),
      ),
    );
    if (settings.recent.length) {
      inner.append(h("div", { class: "home-section" }, t("Son kullanılanlar")));
      for (const r of settings.recent) {
        const d = new Date(r.date);
        inner.append(h("button", { class: "recent-item", onclick: () => this.openRecent(r), html: icon("new") + `<div><b>${escapeHtml(r.name)}</b><small>${d.toLocaleDateString(locale())} ${d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}</small></div>` }));
      }
      inner.append(h("button", { class: "btn", style: { marginTop: "8px" }, onclick: () => { settings.recent = []; saveSettings(); this.renderHome(); } }, t("Listeyi temizle")));
    }
    inner.append(h("div", { class: "home-section" }, t("Diğer")), h("div", { class: "home-actions" },
      action("settings", t("Ayarlar"), t("Tema, yazar adı, yazı tipleri"), () => this.commands.run("preferences")),
      action("info", t("Hakkında"), t("Sürüm ve lisanslar"), () => this.commands.run("about")),
    ));
    home.append(inner);
  }

  // -------------------------------------------------------------- geri tuşu
  /** Android geri tuşu / Esc: açık katmanı kapat. İşlendiyse true. */
  handleBack() {
    closeContextMenu();
    if (sheetOpen()) return closeTopSheet();
    if (!$("#drawer").hidden) { this.commands.closeDrawer(); return true; }
    if (!$("#sidepanel").hidden && innerWidth < 900) { this.commands.panels.close(); return true; }
    if (!$("#searchbar").hidden) { this.closeSearch(); return true; }
    if (this.selection) { this.clearSelection(); return true; }
    if (this.objSel) { this.clearObject(); return true; }
    if (this.tool === T.POLYGON && this.interact?.poly) { this.interact.finishPolygon(false); return true; }
    if (this.tool !== T.SELECT) { this.setTool(T.SELECT); return true; }
    if (this.doc) { this.closeDocument(); return true; }
    return false;
  }
}

