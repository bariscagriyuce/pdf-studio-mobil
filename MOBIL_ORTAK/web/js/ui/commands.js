// Komutlar: masaüstündeki tüm menü eylemleri (Dosya, Düzen, Görünüm, Sayfa,
// Metin, Ekle, Form, Araçlar, Yardım), araçların sayfada bitirdiği işler ve
// çekmece menü. Masaüstündeki ui/mainwindow.py'nin eylem kısmının karşılığı.

import { $, h, toast, withBusy, setBusyText, form, confirmBox, promptBox, contextMenu, parsePages, parseRanges, fmtBytes, escapeHtml } from "./ui.js";
import { icon } from "./icons.js";
import { settings, saveSettings } from "./store.js";
import { T, LABELS, ICONS } from "./tools.js";
import { textEditDialog, textAddDialog, signatureDialog, linkDialog, tableDialog, shortcutsDialog, aboutDialog, preferencesDialog, b64ToBytes } from "./dialogs.js";
import { Inspector } from "./inspector.js";
import { Panels } from "./panels.js";
import { runOcr } from "./ocr.js";

const PAGE_FORMATS = ["{n}", "{n} / {total}", "- {n} -", "Sayfa {n}", "Sayfa {n} / {total}", "{n}/{total}"];
const POSITIONS = [["alt-orta", "Alt orta"], ["alt-sağ", "Alt sağ"], ["alt-sol", "Alt sol"], ["üst-orta", "Üst orta"], ["üst-sağ", "Üst sağ"], ["üst-sol", "Üst sol"]];

export class Commands {
  constructor(app) {
    this.app = app;
    this.engine = app.engine;
    this.list = [];
    this.byId = new Map();
    this.inspector = new Inspector(app);
    this.panels = new Panels(app);
    this._register();
  }

  // ------------------------------------------------------------ kayıt
  add(section, id, label, run, opts = {}) {
    const c = { section, id, label, run, icon: opts.icon, key: opts.key, short: opts.short, needsDoc: opts.needsDoc !== false, check: opts.check };
    this.list.push(c);
    this.byId.set(id, c);
  }

  get(id) {
    return this.byId.get(id);
  }

  async run(id) {
    const c = this.byId.get(id);
    if (!c) return;
    if (c.needsDoc && !this.app.isOpen) {
      toast("Önce bir belge açın");
      return;
    }
    try {
      await c.run();
    } catch (e) {
      console.error(e);
      toast(e.message || String(e), { error: true, ms: 5000 });
    }
  }

  /** Motor çağrısını meşgul göstergesiyle çalıştırır; hatayı bildirir. */
  async act(fn, text = "Çalışıyor…") {
    try {
      return await withBusy(text, fn);
    } catch (e) {
      toast(e.message || String(e), { error: true, ms: 5000 });
      throw e;
    }
  }

  call(method, ...args) {
    return this.act(() => this.engine.call(method, ...args));
  }

  get cur() {
    return this.app.viewer.current;
  }

  get total() {
    return this.app.viewer.pages.length;
  }

  /** Sayfa işlemlerinin hedefi: panelde seçili küçük resimler ya da geçerli sayfa */
  targets() {
    const sel = this.panels.selectedPages();
    return sel.length ? sel : [this.cur];
  }

  pagesField(key = "pages", label = "Sayfalar", value = "all") {
    return { key, type: "pages", label, total: this.total, current: this.cur, value };
  }

  _register() {
    const A = this.app;
    const add = this.add.bind(this);
    const tool = (t, section, key) => add(section, "tool_" + t, LABELS[t], () => A.setTool(t), { icon: ICONS[t], key });

    // ---------------------------------------------------------------- Dosya
    add("Dosya", "new", "Yeni boş belge", () => this.newDocument(), { icon: "new", needsDoc: false });
    add("Dosya", "new_images", "Görüntülerden PDF", () => A.newFromImages(), { icon: "image", needsDoc: false });
    add("Dosya", "merge_new", "PDF birleştir (yeni)", () => this.mergeNew(), { icon: "merge", needsDoc: false });
    add("Dosya", "open", "Aç…", () => A.openDialog(), { icon: "open", key: "Ctrl+O", needsDoc: false });
    add("Dosya", "home", "Ana ekran / son kullanılanlar", () => A.closeDocument(), { icon: "home" });
    add("Dosya", "save", "Kaydet", () => A.save(), { icon: "save", key: "Ctrl+S" });
    add("Dosya", "save_as", "Farklı kaydet…", () => A.saveAs(), { icon: "save-as", key: "Ctrl+Shift+S" });
    add("Dosya", "share", "Paylaş…", () => this.share(), { icon: "share" });
    add("Dosya", "encrypt", "Şifrele ve izinler…", () => this.encrypt(), { icon: "lock", short: "Şifrele" });
    add("Dosya", "export_images", "Dışa aktar: sayfaları görüntü olarak…", () => this.exportImages(), { icon: "export" });
    add("Dosya", "export_text", "Dışa aktar: metin / HTML / XML / JSON…", () => this.exportText(), { icon: "export" });
    add("Dosya", "export_pages", "Dışa aktar: seçili sayfalar (PDF)…", () => this.extractPages(), { icon: "extract" });
    add("Dosya", "export_all_images", "Dışa aktar: gömülü görüntüler…", () => this.exportAllImages(), { icon: "image" });
    add("Dosya", "print", "Yazdır…", () => this.print(), { icon: "print", key: "Ctrl+P" });
    add("Dosya", "close", "Belgeyi kapat", () => A.closeDocument(), { icon: "close", key: "Ctrl+W" });

    // ---------------------------------------------------------------- Düzen
    add("Düzen", "undo", "Geri al", () => this.undo(), { icon: "undo", key: "Ctrl+Z" });
    add("Düzen", "redo", "Yinele", () => this.redo(), { icon: "redo", key: "Ctrl+Y" });
    add("Düzen", "copy", "Seçili metni kopyala", () => this.copy(), { icon: "copy", key: "Ctrl+C" });
    add("Düzen", "find", "Bul…", () => A.openSearch(), { icon: "search", key: "Ctrl+F" });
    add("Düzen", "find_next", "Sonraki sonuç", () => A.searchStep(1), { icon: "chevron-down", key: "F3" });
    add("Düzen", "find_prev", "Önceki sonuç", () => A.searchStep(-1), { icon: "chevron-up", key: "Shift+F3" });
    add("Düzen", "find_replace", "Bul ve değiştir…", () => this.findReplace(), { icon: "search", short: "Bul-değiştir", key: "Ctrl+H" });
    add("Düzen", "props", "Belge özellikleri (meta veri)…", () => this.metadata(), { icon: "info" });

    // -------------------------------------------------------------- Görünüm
    add("Görünüm", "zoom_in", "Yakınlaştır", () => A.viewer.zoomBy(1.25), { icon: "zoom-in", key: "Ctrl+=", short: "Yakınlaştır" });
    add("Görünüm", "zoom_out", "Uzaklaştır", () => A.viewer.zoomBy(0.8), { icon: "zoom-out", key: "Ctrl+-", short: "Uzaklaştır" });
    add("Görünüm", "zoom_100", "Gerçek boyut (%100)", () => A.viewer.setZoom(1), { icon: "zoom-in", key: "Ctrl+0" });
    add("Görünüm", "fit_width", "Genişliğe sığdır", () => A.viewer.fit("width"), { icon: "fit-width", key: "Ctrl+1", short: "Genişlik" });
    add("Görünüm", "fit_page", "Sayfaya sığdır", () => A.viewer.fit("page"), { icon: "fit-page", key: "Ctrl+2", short: "Sayfa" });
    add("Görünüm", "layout", "Sayfa düzeni…", () => this.chooseLayout(), { icon: "columns", short: "Düzen" });
    add("Görünüm", "goto", "Sayfaya git…", () => this.gotoPage(), { icon: "next" });
    add("Görünüm", "sidebar", "Kenar çubuğu (paneller)", () => this.panels.toggle(), { icon: "sidebar", key: "F9" });
    add("Görünüm", "inspector", "Araç ayarları", () => this.inspector.openTool(), { icon: "palette", key: "F10" });
    add("Görünüm", "text_boxes", "Metin kutularını göster", () => this.toggleTextBoxes(), { icon: "text-edit", check: () => settings.showTextBoxes });
    add("Görünüm", "fullscreen", "Odak modu (çubukları gizle)", () => this.focusMode(), { icon: "fullscreen", key: "F11" });
    add("Görünüm", "theme", "Koyu / açık tema", () => A.toggleTheme(), { icon: "sun", needsDoc: false, short: "Tema" });

    // ---------------------------------------------------------------- Sayfa
    add("Sayfa", "page_insert", "Boş sayfa ekle…", () => this.insertPage(), { icon: "page-add", short: "Sayfa ekle" });
    add("Sayfa", "images_as_pages", "Görüntüleri sayfa olarak ekle…", () => this.imagesAsPages(), { icon: "image", short: "Görüntü sayfa" });
    add("Sayfa", "page_dup", "Sayfayı çoğalt", () => this.call("duplicatePages", this.targets()), { icon: "page-copy", short: "Çoğalt" });
    add("Sayfa", "page_delete", "Sayfayı sil…", () => this.deletePages(this.targets()), { icon: "page-delete", short: "Sil" });
    add("Sayfa", "rot_left", "Sola döndür", () => this.call("rotatePages", this.targets(), -90), { icon: "rotate-left", key: "Ctrl+Shift+←", short: "Sola" });
    add("Sayfa", "rot_right", "Sağa döndür", () => this.call("rotatePages", this.targets(), 90), { icon: "rotate-right", key: "Ctrl+Shift+→", short: "Sağa" });
    add("Sayfa", "reverse", "Sıralamayı ters çevir", () => this.call("reversePages"), { icon: "split" });
    add("Sayfa", "page_move", "Sayfaları taşı…", () => this.movePages(), { icon: "drag" });
    tool(T.CROP, "Sayfa", "C");
    add("Sayfa", "page_crop_reset", "Kırpmayı sıfırla", () => this.call("resetCrop", this.targets()), { icon: "crop" });
    add("Sayfa", "page_resize", "Sayfa boyutunu değiştir…", () => this.resizePages(), { icon: "fit-page" });
    add("Sayfa", "merge", "PDF birleştir (ekle)…", () => this.merge(), { icon: "merge", short: "Birleştir" });
    add("Sayfa", "split", "PDF'i böl…", () => this.split(), { icon: "split", short: "Böl" });
    add("Sayfa", "page_extract", "Sayfaları çıkar (ayrı PDF)…", () => this.extractPages(), { icon: "extract", short: "Çıkar" });

    // ---------------------------------------------------------------- Metin
    tool(T.TEXT_EDIT, "Metin", "E");
    tool(T.TEXT_ADD, "Metin", "T");
    tool(T.ERASE_AREA, "Metin");
    add("Metin", "ocr", "OCR — aranabilir metin katmanı…", () => this.ocr(), { icon: "ocr" });

    // ------------------------------------------------------------------ Ekle
    for (const [t, key] of [[T.HIGHLIGHT], [T.UNDERLINE], [T.STRIKEOUT], [T.SQUIGGLY], [T.NOTE, "N"], [T.FREETEXT], [T.INK, "D"], [T.RECT, "R"], [T.ELLIPSE], [T.LINE, "L"], [T.ARROW, "A"], [T.POLYGON], [T.STAMP], [T.IMAGE, "I"], [T.SIGNATURE, "S"], [T.LINK, "K"], [T.MEASURE, "M"]]) tool(t, "Ekle", key);
    add("Ekle", "watermark", "Filigran…", () => this.watermark(), { icon: "watermark" });
    add("Ekle", "pagenum", "Sayfa numarası / üst-alt bilgi…", () => this.pageNumbers(), { icon: "number" });
    add("Ekle", "attach", "Dosya eki…", () => this.attachFile(), { icon: "import" });
    add("Ekle", "bookmark_add", "Yer imi ekle (bu sayfa)…", () => this.panels.addBookmark(), { icon: "bookmark" });

    // ------------------------------------------------------------------ Form
    tool(T.FORM_TEXT, "Form");
    tool(T.FORM_CHECK, "Form");
    add("Form", "forms_panel", "Form alanlarını doldur", () => this.panels.open("forms"), { icon: "form", short: "Doldur" });
    add("Form", "form_export", "Değerleri JSON olarak dışa aktar…", () => this.formExport(), { icon: "export", short: "JSON dışa" });
    add("Form", "form_import", "Değerleri JSON'dan içe aktar…", () => this.formImport(), { icon: "import", short: "JSON içe" });
    add("Form", "form_flatten", "Formu düzleştir", () => this.formFlatten(), { icon: "layers", short: "Düzleştir" });

    // --------------------------------------------------------------- Araçlar
    tool(T.REDACT, "Araçlar");
    add("Araçlar", "apply_redactions", "Karartmaları uygula", () => this.applyRedactions(), { icon: "redact", key: "Ctrl+Shift+R", short: "Uygula" });
    tool(T.ERASER, "Araçlar");
    add("Araçlar", "flatten", "Açıklamaları düzleştir", () => this.flatten(), { icon: "layers" });
    add("Araçlar", "clear_annots", "Tüm açıklamaları kaldır…", () => this.clearAnnots(), { icon: "trash" });
    add("Araçlar", "compress", "Boyut küçült…", () => this.compress(), { icon: "compress" });
    add("Araçlar", "sanitize", "Belgeyi temizle (gizlilik)…", () => this.sanitize(), { icon: "eraser", short: "Temizle" });
    add("Araçlar", "decrypt", "Şifreyi kaldır…", () => this.decrypt(), { icon: "unlock", short: "Şifre kaldır" });
    add("Araçlar", "doc_info", "Belge bilgisi…", () => this.docInfo(), { icon: "info" });
    add("Araçlar", "fonts", "Yazı tipi içe aktar…", () => this.app.fontStore.importFonts(), { icon: "font", needsDoc: false });
    add("Araçlar", "preferences", "Ayarlar…", () => preferencesDialog(A), { icon: "settings", needsDoc: false });

    // ----------------------------------------------------------------- Yardım
    add("Yardım", "shortcuts", "Kısayollar ve hareketler", () => shortcutsDialog(), { icon: "info", needsDoc: false });
    add("Yardım", "about", "Hakkında", () => aboutDialog(A), { icon: "info-circle", needsDoc: false });
  }

  // =================================================================== çekmece
  openDrawer() {
    const d = $("#drawer");
    d.innerHTML = "";
    const panel = h("div", { class: "drawer-panel" });
    panel.append(h("div", { class: "drawer-head" }, h("img", { src: "img/icon.png", alt: "" }), h("b", {}, "PDF Studio")));
    const body = h("div", { class: "drawer-body" });
    const sections = [...new Set(this.list.map((c) => c.section))];
    for (const s of sections) {
      const group = h("div", { class: "menu-group" + (s === "Dosya" ? " open" : "") });
      group.append(h("button", { class: "menu-title", html: `<span>${s}</span>` + icon("chevron-down"), onclick: () => group.classList.toggle("open") }));
      const items = h("div", { class: "menu-items" });
      for (const c of this.list.filter((x) => x.section === s)) {
        const disabled = c.needsDoc && !this.app.isOpen;
        const checked = c.check && c.check();
        const toolOn = c.id.startsWith("tool_") && this.app.tool === c.id.slice(5);
        items.append(h("button", {
          class: "menu-item" + (checked || toolOn ? " checked" : ""), disabled,
          html: icon(c.icon || "info") + `<span>${escapeHtml(c.label)}</span>` + (c.key && !checked && !toolOn ? `<kbd>${c.key}</kbd>` : ""),
          onclick: () => { this.closeDrawer(); this.run(c.id); },
        }));
      }
      group.append(items);
      body.append(group);
    }
    panel.append(body);
    d.append(panel);
    d.hidden = false;
    d.onpointerdown = (e) => { if (e.target === d) this.closeDrawer(); };
  }

  closeDrawer() {
    $("#drawer").hidden = true;
  }

  // ============================================================ Dosya işlemleri
  async newDocument() {
    const presets = this.app.consts.pagePresets;
    const v = await form("Yeni boş belge", [
      { key: "preset", type: "select", label: "Boyut", options: [...Object.keys(presets), "Özel"], value: "A4 (595 x 842)" },
      { key: "w", type: "number", label: "Genişlik (pt)", value: 595, show: (x) => x.preset === "Özel" },
      { key: "h", type: "number", label: "Yükseklik (pt)", value: 842, show: (x) => x.preset === "Özel" },
      { key: "land", type: "check", label: "Yatay" },
      { key: "n", type: "number", label: "Sayfa sayısı", value: 1, min: 1, max: 500 },
    ]);
    if (!v) return;
    let [w, hh] = v.preset === "Özel" ? [v.w || 595, v.h || 842] : presets[v.preset];
    if (v.land) [w, hh] = [hh, w];
    await this.app.newBlank(w, hh, Math.max(1, v.n || 1));
  }

  async mergeNew() {
    const files = await this.app.bridge.openFiles({ kind: "doc", multiple: true });
    if (!files.length) return;
    if (!(await this.app.confirmDiscard())) return;
    const info = await this.act(() => this.engine.call("newBlank", 595, 842, 1));
    this.app._installDoc(info, { name: "Birleştirilmiş.pdf", handle: null });
    await this._mergeFiles(files, 0);
    await this.engine.call("deletePages", [this.total - 1]).catch(() => {});
  }

  async _mergeFiles(files, at) {
    const list = [];
    for (const f of files) {
      const item = { name: f.name, bytes: f.bytes };
      list.push(item);
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const n = await this.act(() => this.engine.call("mergeFiles", list, at), "Birleştiriliyor…");
        toast(`${n} sayfa eklendi`);
        return n;
      } catch (e) {
        if (e.code !== "password") return 0;
        const m = /'(.+)'/.exec(e.message);
        const target = list.find((f) => m && f.name === m[1]) || list[0];
        const pw = await promptBox("Parola gerekli", `“${target.name}” parola korumalı:`, "", { type: "password" });
        if (pw === null) return 0;
        target.password = pw;
      }
    }
    return 0;
  }

  async share() {
    const bytes = await this.act(() => this.engine.call("exportBytes"), "Hazırlanıyor…");
    await this.app.bridge.writeFile("share", { name: this.engine.state.name, mime: "application/pdf" }, bytes);
  }

  async print() {
    const bytes = await this.act(() => this.engine.call("exportBytes"), "Yazdırmaya hazırlanıyor…");
    await this.app.bridge.writeFile("print", { name: this.engine.state.name, mime: "application/pdf" }, bytes);
  }

  stem() {
    return (this.engine.state.name || "belge").replace(/\.pdf$/i, "");
  }

  async encrypt() {
    const c = this.app.consts;
    const v = await form("Şifreleme ve izinler", [
      { key: "user", type: "password", label: "Kullanıcı parolası (açmak için)", hint: "Boş bırakılırsa belge parola sormadan açılır; izinler yine uygulanır." },
      { key: "owner", type: "password", label: "Sahip parolası (izinleri değiştirmek için)" },
      { key: "method", type: "select", label: "Yöntem", options: Object.entries(c.methods).map(([l, v2]) => [v2, l]), value: "aes-256" },
      { type: "info", value: "İzin verilen işlemler:" },
      ...c.permissions.map(([k, , label]) => ({ key: "p_" + k, type: "check", label, value: true })),
    ], {
      ok: "Şifrele ve kaydet",
      validate: (x) => (!x.user && !x.owner && x.method !== "none" ? "En az bir parola girin" : /[,=]/.test(x.user + x.owner) ? "Parola virgül (,) veya eşittir (=) içeremez" : null),
    });
    if (!v) return;
    const allowed = c.permissions.map(([k]) => k).filter((k) => v["p_" + k]);
    const bytes = await this.act(() => this.engine.call("saveEncrypted", { userPw: v.user, ownerPw: v.owner, allowed, method: v.method }), "Şifreleniyor…");
    await this.app.deliver(`${this.stem()}_sifreli.pdf`, bytes, "application/pdf");
  }

  async decrypt() {
    if (!this.engine.state.encrypted) {
      toast("Belge şifreli değil");
      return;
    }
    const bytes = await this.act(() => this.engine.call("saveDecrypted"), "Şifre kaldırılıyor…");
    await this.app.deliver(`${this.stem()}_sifresiz.pdf`, bytes, "application/pdf");
  }

  async exportImages() {
    const webp = await canEncodeWebp();
    const v = await form("Sayfaları görüntü olarak dışa aktar", [
      { key: "fmt", type: "seg", label: "Biçim", value: "png", options: [["png", "PNG"], ["jpg", "JPG"], ...(webp ? [["webp", "WEBP"]] : []), ["pam", "PAM"]] },
      { key: "dpi", type: "range", label: "Çözünürlük (DPI)", value: 150, min: 36, max: 1200, step: 12, format: (x) => x + " dpi" },
      { key: "gray", type: "check", label: "Gri tonlama" },
      { key: "alpha", type: "check", label: "Saydam arka plan (PNG)", show: (x) => x.fmt === "png" },
      this.pagesField(),
    ], { ok: "Dışa aktar" });
    if (!v || !v.pages.length) return;
    const big = v.pages.length * (v.dpi / 72) ** 2 * 595 * 842 * 3;
    if (big > 1.5e9 && !(await confirmBox("Büyük çıktı", `Bu ayarlarla yaklaşık ${fmtBytes(big)} ham görüntü verisi üretilecek. Devam edilsin mi?`))) return;
    const files = [];
    await this.act(async () => {
      for (let i = 0; i < v.pages.length; i++) {
        setBusyText(`Sayfa ${i + 1}/${v.pages.length} dışa aktarılıyor…`);
        files.push(...(await this.engine.call("exportImages", { pages: [v.pages[i]], dpi: v.dpi, format: v.fmt, gray: v.gray, alpha: v.alpha, stem: this.stem() })));
      }
    });
    await this.deliverFiles(files, `${this.stem()}_goruntuler.zip`);
  }

  /** Tek dosyaysa doğrudan, birden çoksa ZIP olarak teslim eder. */
  async deliverFiles(files, zipName) {
    if (!files.length) {
      toast("Dışa aktarılacak bir şey yok");
      return;
    }
    if (files.length === 1) {
      const f = files[0];
      await this.app.deliver(f.name, f.bytes, mimeOf(f.name));
      return;
    }
    const zip = await this.act(() => this.engine.call("zip", files), "ZIP hazırlanıyor…");
    await this.app.deliver(zipName, zip, "application/zip");
  }

  async exportText() {
    const modes = this.app.consts.textModes;
    const v = await form("Metni dışa aktar", [
      { key: "mode", type: "select", label: "Biçim", options: Object.keys(modes), value: Object.keys(modes)[0] },
      { key: "sep", type: "check", label: "Sayfa ayraçlarını ekle", value: true },
      this.pagesField(),
    ], { ok: "Dışa aktar" });
    if (!v) return;
    const [mode, ext] = modes[v.mode];
    const text = await this.act(() => this.engine.call("exportText", { mode, pages: v.pages, separator: v.sep, title: this.stem() }));
    const mime = { txt: "text/plain", md: "text/markdown", html: "text/html", xhtml: "application/xhtml+xml", xml: "application/xml", json: "application/json" }[ext];
    await this.app.deliver(`${this.stem()}.${ext}`, new TextEncoder().encode(text), mime + ";charset=utf-8");
  }

  async exportAllImages() {
    const files = await this.act(() => this.engine.call("extractAllImages"), "Görüntüler çıkarılıyor…");
    await this.deliverFiles(files, `${this.stem()}_gomulu_goruntuler.zip`);
  }

  // ============================================================ Düzen
  async undo() {
    const label = await this.engine.call("undo");
    if (label) toast("Geri alındı: " + label);
    this.app.clearObject();
    this.app.clearSelection();
  }

  async redo() {
    const label = await this.engine.call("redo");
    if (label) toast("Yinelendi: " + label);
    this.app.clearObject();
  }

  async copy() {
    const text = this.app.selection && this.app.selection.text;
    if (!text) {
      toast("Kopyalanacak seçili metin yok");
      return;
    }
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      if (this.app.bridge.native) {
        try { await this.app.bridge.call("copyText", { text }); ok = true; } catch { /* yok say */ }
      }
      if (!ok) {
        const ta = h("textarea", { style: { position: "fixed", opacity: 0 } });
        ta.value = text;
        document.body.append(ta);
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      }
    }
    toast(ok ? "Kopyalandı" : "Kopyalanamadı", { error: !ok });
  }

  async findReplace() {
    const v = await form("Bul ve değiştir", [
      { key: "needle", type: "text", label: "Aranan", value: this.app.search.query || (this.app.selection ? this.app.selection.text : "") },
      { key: "repl", type: "text", label: "Yeni metin" },
      { key: "cs", type: "check", label: "Büyük/küçük harf duyarlı", value: settings.searchCase },
      { key: "ww", type: "check", label: "Yalnızca tam kelimeler", value: settings.searchWhole },
      { key: "style", type: "check", label: "Özgün yazı tipi ve rengi koru", value: true },
      this.pagesField(),
      { type: "info", value: "Eski metin gerçekten kaldırılır (redaksiyon) ve yenisi sayfa içeriğine yazılır." },
    ], { ok: "Tümünü değiştir", validate: (x) => (!x.needle ? "Aranan metin boş" : null) });
    if (!v) return;
    const n = await this.act(() => this.engine.call("replaceAll", v.needle, v.repl, {
      caseSensitive: v.cs, wholeWords: v.ww, pages: v.pages, matchStyle: v.style,
      style: { family: settings.tool.fontFamily, size: settings.tool.fontsize, color: settings.tool.textColor },
    }), "Değiştiriliyor…");
    toast(n ? `${n} yer değiştirildi` : "Eşleşme bulunamadı");
  }

  async metadata() {
    const m = await this.engine.call("getMetadata");
    const v = await form("Belge özellikleri", [
      { key: "title", label: "Başlık", value: m.title },
      { key: "author", label: "Yazar", value: m.author },
      { key: "subject", label: "Konu", value: m.subject },
      { key: "keywords", label: "Anahtar kelimeler", value: m.keywords },
      { key: "creator", label: "Oluşturan", value: m.creator },
      { key: "producer", label: "Üretici", value: m.producer },
      { type: "info", value: `PDF sürümü: ${m.format || "?"} · Şifreleme: ${m.encryption && m.encryption !== "None" ? m.encryption : "yok"}` },
    ], { ok: "Kaydet" });
    if (v) await this.call("setMetadata", v);
  }

  // ============================================================ Görünüm
  async chooseLayout() {
    const v = await form("Sayfa düzeni", [{ key: "l", type: "radio", value: this.app.viewer.layoutMode, options: [["continuous", "Sürekli"], ["single", "Tek sayfa"], ["double", "Çift sayfa"], ["cover", "Çift sayfa (kapaklı)"]] }]);
    if (v) {
      this.app.viewer.setLayout(v.l);
      saveSettings();
    }
  }

  async gotoPage() {
    const v = await promptBox("Sayfaya git", `Sayfa numarası (1–${this.total})`, String(this.cur + 1), { type: "number" });
    if (v === null || v === "") return;
    this.app.viewer.goto(Math.round(+v) - 1);
  }

  toggleTextBoxes() {
    settings.showTextBoxes = !settings.showTextBoxes;
    saveSettings();
    if (settings.showTextBoxes) this.app.loadVisibleBlocks();
    this.app.viewer.updateOverlays();
  }

  focusMode() {
    const on = !$("#topbar").hidden;
    $("#topbar").hidden = on;
    $("#toolbar").hidden = on || !this.app.isOpen;
    if (on) toast("Odak modu — çıkmak için geri tuşu / F11");
    this.app._focus = on;
  }

  // ============================================================ Sayfa
  async insertPage() {
    const presets = this.app.consts.pagePresets;
    const cur = this.app.viewer.pages[this.cur];
    const v = await form("Boş sayfa ekle", [
      { key: "preset", type: "select", label: "Boyut", options: ["Geçerli sayfayla aynı", ...Object.keys(presets), "Özel"], value: "Geçerli sayfayla aynı" },
      { key: "w", type: "number", label: "Genişlik (pt)", value: Math.round(cur.width), show: (x) => x.preset === "Özel" },
      { key: "h", type: "number", label: "Yükseklik (pt)", value: Math.round(cur.height), show: (x) => x.preset === "Özel" },
      { key: "land", type: "check", label: "Yatay", show: (x) => x.preset !== "Geçerli sayfayla aynı" },
      { key: "n", type: "number", label: "Adet", value: 1, min: 1, max: 200 },
      { key: "where", type: "select", label: "Konum", numeric: true, value: 0, options: [[0, `Geçerli sayfadan sonra (${this.cur + 1})`], [1, `Geçerli sayfadan önce (${this.cur + 1})`], [2, "Belgenin sonuna"], [3, "Belgenin başına"]] },
    ], { ok: "Ekle" });
    if (!v) return;
    let [w, hh] = v.preset === "Özel" ? [v.w || 595, v.h || 842] : v.preset === "Geçerli sayfayla aynı" ? [cur.width, cur.height] : presets[v.preset];
    if (v.land && v.preset !== "Geçerli sayfayla aynı" && hh > w) [w, hh] = [hh, w];
    const at = [this.cur + 1, this.cur, this.total, 0][v.where];
    await this.call("insertBlank", at, w, hh, Math.max(1, v.n || 1));
    this.app.viewer.goto(at);
  }

  async imagesAsPages() {
    const files = await this.app.bridge.openFiles({ kind: "image", multiple: true });
    if (!files.length) return;
    const n = await this.act(() => this.engine.call("insertImagesAsPages", files.map((f) => ({ name: f.name, bytes: f.bytes })), this.cur + 1), "Görüntüler ekleniyor…");
    toast(`${n} sayfa eklendi`);
  }

  async deletePages(pages) {
    if (pages.length >= this.total) {
      toast("Belgede en az bir sayfa kalmalı", { error: true });
      return;
    }
    const label = pages.length === 1 ? `${pages[0] + 1}. sayfa` : `${pages.length} sayfa`;
    if (!(await confirmBox("Sayfa sil", `${label} silinsin mi? (Geri alınabilir)`, { ok: "Sil", danger: true }))) return;
    await this.call("deletePages", pages);
    this.panels.clearPicked();
  }

  async movePages() {
    const v = await form("Sayfaları taşı", [
      { key: "pages", type: "text", label: "Taşınacak sayfalar", value: String(this.cur + 1), placeholder: "örn. 3-5, 8" },
      { key: "to", type: "number", label: `Hangi sayfanın önüne? (1–${this.total + 1}; sona taşımak için ${this.total + 1})`, value: 1 },
    ], { ok: "Taşı" });
    if (!v) return;
    const pages = parsePages(v.pages, this.total);
    if (!pages.length) return;
    await this.call("movePages", pages, Math.max(0, Math.min(this.total, (v.to || 1) - 1)));
  }

  async resizePages() {
    const presets = this.app.consts.pagePresets;
    const v = await form("Sayfa boyutunu değiştir", [
      { key: "preset", type: "select", label: "Yeni boyut", options: [...Object.keys(presets), "Özel"], value: "A4 (595 x 842)" },
      { key: "w", type: "number", label: "Genişlik (pt)", value: 595, show: (x) => x.preset === "Özel" },
      { key: "h", type: "number", label: "Yükseklik (pt)", value: 842, show: (x) => x.preset === "Özel" },
      { key: "land", type: "check", label: "Yatay" },
      this.pagesField("pages", "Sayfalar", "current"),
      { type: "info", value: "İçerik yeni boyuta ölçeklenir. Açıklamalar korunmaz (masaüstü sürümdeki gibi)." },
    ], { ok: "Uygula" });
    if (!v || !v.pages.length) return;
    let [w, hh] = v.preset === "Özel" ? [v.w || 595, v.h || 842] : presets[v.preset];
    if (v.land) [w, hh] = [Math.max(w, hh), Math.min(w, hh)];
    await this.act(() => this.engine.call("resizePages", v.pages, w, hh), "Sayfalar yeniden boyutlanıyor…");
  }

  async merge() {
    const files = await this.app.bridge.openFiles({ kind: "doc", multiple: true });
    if (!files.length) return;
    const v = await form("PDF birleştir", [
      { type: "info", value: files.map((f) => "• " + f.name).join("\n") },
      { key: "where", type: "select", label: "Nereye eklensin?", numeric: true, value: 0, options: [[0, "Belgenin sonuna"], [1, `Geçerli sayfadan sonra (${this.cur + 1})`], [2, "Belgenin başına"]] },
    ], { ok: "Birleştir" });
    if (!v) return;
    const at = [this.total, this.cur + 1, 0][v.where];
    await this._mergeFiles(files, at);
  }

  async split() {
    const v = await form("PDF'i böl", [
      { key: "mode", type: "radio", value: "every", options: [["every", "Her N sayfada bir böl"], ["ranges", "Aralıklara göre böl (örn. 1-3, 4-8, 9-)"]] },
      { key: "n", type: "number", label: "N", value: 1, min: 1, show: (x) => x.mode === "every" },
      { key: "ranges", type: "text", label: "Aralıklar", placeholder: "1-3, 4-8, 9-", show: (x) => x.mode === "ranges" },
    ], { ok: "Böl" });
    if (!v) return;
    const stem = this.stem();
    let parts;
    if (v.mode === "every") parts = await this.act(() => this.engine.call("splitEvery", Math.max(1, v.n || 1), stem), "Bölünüyor…");
    else {
      const ranges = parseRanges(v.ranges, this.total);
      if (!ranges.length) { toast("Geçerli bir aralık girin", { error: true }); return; }
      parts = await this.act(() => this.engine.call("splitByRanges", ranges, stem), "Bölünüyor…");
    }
    await this.deliverFiles(parts, `${stem}_bolumler.zip`);
  }

  async extractPages() {
    const sel = this.panels.selectedPages();
    const v = await form("Sayfaları çıkar", [
      { key: "pages", type: "pages", label: "Sayfalar", total: this.total, current: this.cur, value: sel.length > 1 ? "range" : "current", range: sel.length > 1 ? sel.map((p) => p + 1).join(",") : "" },
      { key: "del", type: "check", label: "Çıkardıktan sonra bu belgeden sil" },
    ], { ok: "Çıkar" });
    if (!v || !v.pages.length) return;
    const bytes = await this.act(() => this.engine.call("extractPages", v.pages));
    const name = `${this.stem()}_sayfa_${v.pages.length === 1 ? v.pages[0] + 1 : v.pages[0] + 1 + "-" + (v.pages[v.pages.length - 1] + 1)}.pdf`;
    const res = await this.app.deliver(name, bytes, "application/pdf");
    if (res && v.del && v.pages.length < this.total) await this.call("deletePages", v.pages);
  }

  // ============================================================ Ekle
  async watermark() {
    const v = await form("Filigran", [
      { key: "kind", type: "seg", label: "Tür", value: "text", options: [["text", "Metin"], ["image", "Görüntü"]] },
      { key: "text", label: "Metin", value: "GİZLİ", show: (x) => x.kind === "text" },
      { key: "family", type: "select", label: "Yazı tipi", options: this.app.fontFamilies, value: "Helvetica", show: (x) => x.kind === "text" },
      { key: "size", type: "number", label: "Punto", value: 60, show: (x) => x.kind === "text" },
      { key: "color", type: "color", label: "Renk", value: [0.6, 0.6, 0.6], show: (x) => x.kind === "text" },
      { key: "angle", type: "range", label: "Açı", value: 45, min: -90, max: 90, format: (x) => x + "°", show: (x) => x.kind === "text" },
      { key: "scale", type: "range", label: "Ölçek", value: 50, min: 5, max: 100, format: (x) => "%" + x, show: (x) => x.kind === "image" },
      { key: "opacity", type: "range", label: "Saydamlık", value: 25, min: 5, max: 100, format: (x) => "%" + x },
      { key: "behind", type: "check", label: "İçeriğin arkasına yerleştir" },
      this.pagesField(),
    ], { ok: "Uygula", validate: (x) => (x.kind === "text" && !x.text.trim() ? "Metin boş" : null) });
    if (!v || !v.pages.length) return;
    if (v.kind === "text") {
      await this.act(() => this.engine.call("addTextWatermark", v.text, v.pages, { fontsize: v.size || 48, color: v.color, opacity: v.opacity / 100, angle: v.angle, family: v.family, behind: v.behind }), "Filigran ekleniyor…");
    } else {
      const files = await this.app.bridge.openFiles({ kind: "image" });
      if (!files.length) return;
      await this.act(() => this.engine.call("addImageWatermark", files[0].bytes, v.pages, { opacity: v.opacity / 100, scale: v.scale / 100, behind: v.behind }), "Filigran ekleniyor…");
    }
  }

  async pageNumbers() {
    const v = await form("Sayfa numarası / üst-alt bilgi", [
      { key: "num", type: "check", label: "Sayfa numarası ekle", value: true },
      { key: "fmt", type: "select", label: "Numara biçimi", options: PAGE_FORMATS, value: "{n} / {total}", show: (x) => x.num },
      { key: "pos", type: "select", label: "Konum", options: POSITIONS, value: "alt-orta", show: (x) => x.num },
      { key: "start", type: "number", label: "Başlangıç no", value: 1, show: (x) => x.num },
      { key: "size", type: "number", label: "Punto", value: 10 },
      { key: "color", type: "color", label: "Renk", value: [0, 0, 0] },
      { key: "margin", type: "number", label: "Kenar boşluğu (pt)", value: 28 },
      { key: "header", label: "Üst bilgi", placeholder: "(isteğe bağlı)" },
      { key: "footer", label: "Alt bilgi", placeholder: "(isteğe bağlı)" },
      this.pagesField(),
    ], { ok: "Uygula" });
    if (!v || !v.pages.length) return;
    await this.act(async () => {
      if (v.num) await this.engine.call("addPageNumbers", v.pages, { fmt: v.fmt, position: v.pos, fontsize: v.size || 10, color: v.color, margin: v.margin ?? 28, startAt: v.start ?? 1 });
      if (v.header || v.footer) await this.engine.call("addHeaderFooter", v.pages, { header: v.header, footer: v.footer, fontsize: Math.max(6, (v.size || 10) - 1), color: v.color, margin: Math.max(8, (v.margin ?? 28) - 4) });
    });
  }

  async attachFile() {
    const files = await this.app.bridge.openFiles({ kind: "any" });
    if (!files.length) return;
    const f = files[0];
    const pg = this.app.viewer.pages[this.cur];
    await this.call("addFileAttachment", this.cur, [pg.width - 40, 30], f.name, f.bytes, { author: settings.author, mime: f.mime || "application/octet-stream" });
    toast("Ek eklendi: " + f.name);
  }

  // ============================================================ Form
  async formExport() {
    const json = await this.engine.call("exportJson");
    await this.app.deliver(`${this.stem()}_form.json`, new TextEncoder().encode(json), "application/json");
  }

  async formImport() {
    const files = await this.app.bridge.openFiles({ kind: "json" });
    if (!files.length) return;
    const n = await this.call("importJson", new TextDecoder().decode(files[0].bytes));
    toast(`${n} alan dolduruldu`);
  }

  async formFlatten() {
    if (!(await confirmBox("Formu düzleştir", "Form alanları sayfa içeriğine gömülecek ve artık düzenlenemeyecek. Devam edilsin mi?"))) return;
    await this.call("flattenForms");
  }

  // ============================================================ Araçlar
  async applyRedactions() {
    const marks = this.app.redactMarks;
    if (!marks.length) {
      toast("Önce “Karart” aracıyla alanları işaretleyin");
      this.app.setTool(T.REDACT);
      return;
    }
    const ok = await confirmBox("Karartmaları uygula", `${marks.length} alandaki metin, görüntü ve grafikler kalıcı olarak silinecek ve üzeri boyanacak.\n\nBelge kaydedildiğinde bu içerik geri getirilemez.`, { ok: "Uygula", danger: true });
    if (!ok) return;
    await this.act(() => this.engine.call("redactAreas", marks, { fill: settings.tool.redactFill, removeImages: true }), "Karartılıyor…");
    this.app.redactMarks = [];
    this.app.updateFloat();
    toast("Karartma uygulandı");
  }

  async redactSelection() {
    const s = this.app.selection;
    if (!s) return;
    this.app.redactMarks.push(...s.rects.map((r) => ({ pno: s.pno, rect: r })));
    this.app.clearSelection();
    this.app.setTool(T.REDACT);
    toast("Karartma için işaretlendi — “Karartmaları uygula” deyin");
  }

  async flatten() {
    if (!(await confirmBox("Açıklamaları düzleştir", "Tüm açıklamalar ve form alanları sayfa içeriğine gömülecek. Devam edilsin mi?"))) return;
    await this.call("flatten", { annots: true, widgets: true });
  }

  async clearAnnots() {
    if (!(await confirmBox("Tüm açıklamaları kaldır", "Belgedeki tüm açıklamalar silinecek (geri alınabilir).", { ok: "Kaldır", danger: true }))) return;
    const n = await this.call("clearAnnots", null);
    toast(`${n} açıklama kaldırıldı`);
  }

  async compress() {
    const v = await form("Boyut küçült", [
      { key: "dpi", type: "select", label: "Görüntü çözünürlüğü", numeric: true, value: 150, options: [[0, "Değiştirme"], [300, "300 DPI (baskı)"], [200, "200 DPI"], [150, "150 DPI (önerilen)"], [96, "96 DPI (ekran)"], [72, "72 DPI (en küçük)"]] },
      { key: "q", type: "range", label: "JPEG kalitesi", value: 70, min: 20, max: 95, format: (x) => "%" + x },
      { key: "subset", type: "check", label: "Yazı tiplerini alt kümele", value: true },
      { type: "info", value: "Açık belge değişmez; küçültülmüş kopya ayrı dosya olarak kaydedilir." },
    ], { ok: "Küçült" });
    if (!v) return;
    const r = await this.act(() => this.engine.call("compress", { imageDpi: v.dpi, jpegQuality: v.q, subsetFonts: v.subset }), "Küçültülüyor…");
    const pct = Math.round((1 - r.after / r.before) * 100);
    const go = await confirmBox("Boyut küçültüldü", `${fmtBytes(r.before)} → ${fmtBytes(r.after)} (${pct > 0 ? "%" + pct + " küçük" : "küçülme yok"})\n${r.images} görüntü yeniden sıkıştırıldı.`, { ok: "Kaydet / paylaş" });
    if (go) await this.app.deliver(`${this.stem()}_kucuk.pdf`, r.bytes, "application/pdf");
  }

  async sanitize() {
    const v = await form("Belgeyi temizle", [
      { key: "metadata", type: "check", label: "Meta veriyi kaldır (yazar, başlık, XMP)", value: true },
      { key: "js", type: "check", label: "JavaScript ve otomatik eylemleri kaldır", value: true },
      { key: "attachments", type: "check", label: "Gömülü dosyaları ve ekleri kaldır" },
      { key: "links", type: "check", label: "Tüm bağlantıları kaldır" },
    ], { ok: "Temizle" });
    if (v) {
      await this.call("sanitize", v);
      toast("Belge temizlendi");
    }
  }

  async docInfo() {
    const rows = await this.act(() => this.engine.call("documentReport", { path: this.engine.state.name }), "İnceleniyor…");
    await tableDialog("Belge bilgisi", rows);
  }

  async ocr() {
    await runOcr(this.app);
  }

  // ============================================================ araç işleri
  async handleRectTool(tool, pno, r) {
    const A = this.app;
    const st = settings.tool;
    switch (tool) {
      case T.RECT:
      case T.ELLIPSE:
        return this.act(() => this.engine.call("addShape", pno, tool, [r[0], r[1]], [r[2], r[3]], { color: st.color, fill: st.fill, width: st.width, opacity: st.opacity, author: settings.author }));
      case T.FREETEXT: {
        const v = await form("Metin kutusu (açıklama)", [
          { key: "text", type: "textarea", label: "Metin", rows: 3 },
          { key: "font", type: "seg", label: "Yazı tipi", value: ["Helvetica", "Times", "Courier"].includes(st.fontFamily) ? st.fontFamily : "Helvetica", options: [["Helvetica", "Helvetica"], ["Times", "Times"], ["Courier", "Courier"]] },
          { key: "size", type: "number", label: "Punto", value: st.fontsize },
          { key: "color", type: "color", label: "Metin rengi", value: st.textColor },
          { key: "fill", type: "color", label: "Arka plan", value: st.fill, allowNone: true },
          { key: "border", type: "range", label: "Kenarlık", value: 0, min: 0, max: 6, step: 0.5, format: (x) => x + " pt" },
          { key: "align", type: "seg", label: "Hizalama", value: st.align < 3 ? st.align : 0, options: [[0, "Sola"], [1, "Ortala"], [2, "Sağa"]] },
        ], { ok: "Ekle", validate: (x) => (!x.text.trim() ? "Metin boş" : null) });
        if (!v) return;
        Object.assign(st, { fontsize: v.size || 12, textColor: v.color });
        saveSettings();
        return this.act(() => this.engine.call("addFreeText", pno, r, v.text, { fontsize: v.size || 12, font: v.font, textColor: v.color, fillColor: v.fill, borderWidth: v.border, align: v.align, opacity: st.opacity, author: settings.author }));
      }
      case T.IMAGE: {
        const files = await A.bridge.openFiles({ kind: "image" });
        if (!files.length) return;
        return this.act(() => this.engine.call("placeImage", pno, r, files[0].bytes, { label: "Görüntü ekle" }));
      }
      case T.SIGNATURE: {
        let png = settings.signature ? b64ToBytes(settings.signature) : null;
        if (png) {
          const choice = await form("İmza", [{ key: "c", type: "radio", value: "saved", options: [["saved", "Kayıtlı imzamı kullan"], ["new", "Yeni imza oluştur"]] }], { ok: "Devam" });
          if (!choice) return;
          if (choice.c === "new") png = null;
        }
        if (!png) png = await signatureDialog(A);
        if (!png) return;
        return this.act(() => this.engine.call("placeImage", pno, r, png, { label: "İmza ekle" }));
      }
      case T.STAMP:
        return this.act(() => this.engine.call("addStamp", pno, r, st.stampIndex, { opacity: st.opacity, author: settings.author }));
      case T.LINK: {
        const v = await linkDialog(this.total, pno);
        if (!v) return;
        await this.act(() => this.engine.call("addLink", pno, r, v));
        return toast("Bağlantı eklendi");
      }
      case T.REDACT:
        A.redactMarks.push({ pno, rect: r });
        A.viewer.updateOverlay(pno);
        A.updateFloat();
        return;
      case T.CROP: {
        const v = await form("Sayfayı kırp", [
          { type: "info", value: `Yeni sınır: ${Math.round(r[2] - r[0])} × ${Math.round(r[3] - r[1])} pt` },
          { key: "pages", type: "pages", label: "Uygulanacak sayfalar", total: this.total, current: pno, value: "current" },
        ], { ok: "Kırp" });
        if (!v || !v.pages.length) return;
        return this.act(() => this.engine.call("cropPages", v.pages, r, pno));
      }
      case T.TEXT_ADD: {
        const v = await textAddDialog(A);
        if (!v) return;
        const ok = await this.act(() => this.engine.call("insertTextBox", pno, r, v.text, v.style));
        if (!ok) toast("Metin kutuya sığmadı; punto küçültüldü ya da taştı", { error: true });
        return;
      }
      case T.ERASE_AREA: {
        const v = await form("Alanı sil", [
          { type: "info", value: "Seçilen alandaki içerik sayfadan kalıcı olarak kaldırılır (geri alınabilir)." },
          { key: "images", type: "check", label: "Görüntüleri de sil" },
          { key: "graphics", type: "check", label: "Çizgi ve şekilleri de sil" },
          { key: "bg", type: "color", label: "Alanı boya", value: null, allowNone: true },
        ], { ok: "Sil" });
        if (!v) return;
        return this.act(() => this.engine.call("deleteTextRegion", pno, r, { background: v.bg, removeImages: v.images, removeGraphics: v.graphics }));
      }
      case T.FORM_TEXT:
      case T.FORM_CHECK: {
        const isCheck = tool === T.FORM_CHECK;
        const v = await form(isCheck ? "Onay kutusu ekle" : "Form alanı ekle", [
          { key: "kind", type: "select", label: "Tür", value: isCheck ? "checkbox" : "text", options: isCheck ? [["checkbox", "Onay kutusu"], ["radio", "Seçenek düğmesi"]] : [["text", "Metin kutusu"], ["multiline", "Çok satırlı metin"], ["combobox", "Açılır liste"], ["listbox", "Liste"], ["signature", "İmza alanı"]] },
          { key: "name", label: "Alan adı", value: isCheck ? "onay" : "alan" },
          { key: "value", label: "Varsayılan değer", show: (x) => ["text", "multiline", "combobox"].includes(x.kind) },
          { key: "options", type: "textarea", label: "Seçenekler (her satıra bir tane)", rows: 4, show: (x) => x.kind === "combobox" || x.kind === "listbox" },
          { key: "on", type: "check", label: "İşaretli başlasın", show: (x) => x.kind === "checkbox" || x.kind === "radio" },
          { key: "size", type: "number", label: "Punto", value: 11, show: (x) => !["checkbox", "radio", "signature"].includes(x.kind) },
        ], { ok: "Ekle", validate: (x) => (!x.name.trim() ? "Alan adı gerekli" : null) });
        if (!v) return;
        const kind = v.kind === "multiline" ? "text" : v.kind;
        const opts = { kind, name: v.name.trim(), fontsize: v.size || 11, multiline: v.kind === "multiline", options: (v.options || "").split("\n").map((s) => s.trim()).filter(Boolean) };
        if (kind === "checkbox" || kind === "radio") opts.value = v.on ? "Yes" : "";
        const name = await this.act(() => this.engine.call("addField", pno, r, opts));
        if (v.value && kind !== "checkbox" && kind !== "radio") {
          const f = (await this.engine.call("listFields", pno)).find((x) => x.name === name);
          if (f) await this.engine.call("setValue", pno, f.id, v.value);
        }
        return toast("Alan eklendi: " + name);
      }
    }
  }

  async handleLineTool(tool, pno, p0, p1) {
    const st = settings.tool;
    return this.act(() => this.engine.call("addShape", pno, tool === T.ARROW ? "arrow" : "line", p0, p1, { color: st.color, width: st.width, opacity: st.opacity, author: settings.author }));
  }

  async addMeasure() {
    const m = this.app.measure;
    if (!m) return;
    await this.act(() => this.engine.call("addShape", m.pno, "measure", m.p0, m.p1, { color: [0.9, 0.2, 0.2], width: 1, content: this.app.measureText(), author: settings.author }));
    this.app.measure = null;
    this.app.updateFloat();
    this.app.viewer.updateOverlay(m.pno);
  }

  async addMarkup(kind, pno, quads) {
    const st = settings.tool;
    return this.act(() => this.engine.call("addMarkup", pno, kind, quads, { color: kind === "highlight" ? st.highlightColor : st.color, opacity: st.opacity, author: settings.author }));
  }

  async markupSelection(kind) {
    const s = this.app.selection;
    if (!s) return;
    await this.addMarkup(kind, s.pno, s.quads);
    this.app.clearSelection();
  }

  async addNote(pno, pt) {
    const text = await promptBox("Yapışkan not", "Not metni", "", { type: "textarea" });
    if (text === null) return;
    const st = settings.tool;
    await this.act(() => this.engine.call("addStickyNote", pno, [pt[0] - 10, pt[1] - 10], text, { icon: st.noteIcon, color: [1, 0.85, 0.3], author: settings.author }));
  }

  async eraseAt(pno, pt) {
    const a = await this.engine.call("annotAt", pno, pt, 8);
    if (!a) {
      toast("Burada açıklama yok");
      return;
    }
    await this.act(() => this.engine.call("deleteAnnot", pno, a.id));
    toast(`${a.typeName} silindi`);
  }

  async editTextAt(pno, pt) {
    const block = await this.engine.call("blockAt", pno, pt);
    if (!block) {
      toast("Burada düzenlenebilir metin yok");
      return;
    }
    this.app.hoverBlock = null;
    const v = await textEditDialog(this.app, block);
    if (!v) return;
    const ok = await this.act(() => this.engine.call("replaceRegionText", pno, block.bbox, v.text, v.style, { baseline: block.baseline, background: v.background, grow: v.grow }), "Metin düzenleniyor…");
    if (!ok) toast("Metin kutuya tam sığmadı; punto küçültüldü", { error: true });
  }

  // ------------------------------------------------------------ seç aracı
  async selectAt(pno, pt) {
    const A = this.app;
    A.clearSelection();
    const field = await this.engine.call("fieldAt", pno, pt);
    if (field) {
      A.clearObject();
      return this.fillField(field);
    }
    const annot = await this.engine.call("annotAt", pno, pt, 6);
    if (annot) {
      A.setObject({ kind: "annot", pno, info: annot, rect: annot.rect, resizable: annot.resizable });
      return;
    }
    if (await this.followLinkAt(pno, pt)) return;
    const img = await this.engine.call("imageAt", pno, pt);
    if (img) {
      A.setObject({ kind: "image", pno, info: img, rect: img.rect, resizable: true, keepAspect: true });
      return;
    }
    A.clearObject();
  }

  async followLinkAt(pno, pt) {
    const links = await this.app.linksFor(pno);
    const l = links.find((x) => pt[0] >= x.rect[0] && pt[0] <= x.rect[2] && pt[1] >= x.rect[1] && pt[1] <= x.rect[3]);
    if (!l) return false;
    if (l.uri) {
      if (await confirmBox("Bağlantıyı aç", `Bu adres tarayıcıda açılsın mı?\n\n${l.uri}`, { ok: "Aç" })) this.app.bridge.openUrl(l.uri);
    } else if (l.page >= 0) {
      this.app.viewer.goto(l.page);
    }
    return true;
  }

  async fillField(f) {
    if (f.readonly) {
      toast("Bu alan salt okunur");
      return;
    }
    let value;
    if (f.type === "checkbox" || f.type === "radiobutton") {
      value = !(f.value && f.value !== "Off");
    } else if (f.type === "combobox" || f.type === "listbox") {
      const v = await form(f.label || f.name, [{ key: "v", type: "radio", value: f.value || f.options[0], options: f.options.map((o) => [o, o]) }]);
      if (!v) return;
      value = v.v;
    } else if (f.type === "text") {
      const v = await form(f.label || f.name, [{ key: "v", type: f.multiline ? "textarea" : "text", value: f.value, label: f.maxLen ? `En çok ${f.maxLen} karakter` : "" }]);
      if (!v) return;
      value = f.maxLen ? v.v.slice(0, f.maxLen) : v.v;
    } else if (f.type === "signature") {
      toast("İmza alanına “İmza” aracıyla imzanızı yerleştirin");
      return;
    } else {
      return;
    }
    await this.act(() => this.engine.call("setValue", f.pno, f.id, value));
  }

  async commitObjectRect(r, kind) {
    const o = this.app.objSel;
    if (!o) return;
    if (o.kind === "annot") {
      const info = kind === "move"
        ? await this.act(() => this.engine.call("moveAnnot", o.pno, o.info.id, r[0] - o.rect[0], r[1] - o.rect[1]))
        : await this.act(() => this.engine.call("resizeAnnot", o.pno, o.info.id, r));
      this.app.setObject({ ...o, info, rect: info.rect });
    } else if (o.kind === "image") {
      const box = await this.act(() => this.engine.call("moveResizeImage", o.pno, o.rect, r, { keepProportion: true }));
      const img = await this.engine.call("imageAt", o.pno, [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]);
      if (img) this.app.setObject({ ...o, info: img, rect: img.rect });
      else this.app.clearObject();
    }
  }

  async nudgeObject(dx, dy) {
    const o = this.app.objSel;
    if (!o) return;
    await this.commitObjectRect([o.rect[0] + dx, o.rect[1] + dy, o.rect[2] + dx, o.rect[3] + dy], "move");
  }

  async deleteSelectedObject() {
    const o = this.app.objSel;
    if (!o) return;
    if (o.kind === "annot") await this.act(() => this.engine.call("deleteAnnot", o.pno, o.info.id));
    else if (o.kind === "image") await this.act(() => this.engine.call("deleteImage", o.pno, o.rect));
    this.app.clearObject();
  }

  async replaceImage(o) {
    const files = await this.app.bridge.openFiles({ kind: "image" });
    if (!files.length) return;
    await this.act(() => this.engine.call("replaceImage", o.pno, o.rect, files[0].bytes, { keepProportion: true }));
    this.app.clearObject();
  }

  async saveImage(o) {
    const png = await this.act(() => this.engine.call("extractImage", o.pno, o.info.index));
    await this.app.deliver(`${this.stem()}_s${o.pno + 1}_goruntu.png`, png, "image/png");
  }

  async saveAttachment(o) {
    const d = await this.act(() => this.engine.call("attachmentData", o.pno, o.info.id));
    await this.app.deliver(d.name, d.bytes, mimeOf(d.name));
  }

  // ---------------------------------------------------------- bağlam menüsü
  pageContextMenu(hit, x, y) {
    const pno = hit.pno;
    const A = this.app;
    const items = [];
    if (A.selection && A.selection.text) {
      items.push({ label: "Kopyala", icon: "copy", action: () => this.copy() },
        { label: "Vurgula", icon: "highlight", action: () => this.markupSelection("highlight") },
        { label: "Altını çiz", icon: "underline", action: () => this.markupSelection("underline") },
        { label: "Üstünü çiz", icon: "strikeout", action: () => this.markupSelection("strikeout") }, "-");
    }
    items.push(
      { label: "Bu metni düzenle…", icon: "text-edit", action: () => this.editTextAt(pno, hit.pt) },
      { label: "Buraya not ekle…", icon: "note", action: () => this.addNote(pno, hit.pt) },
      "-",
      { label: "Boş sayfa ekle…", icon: "page-add", action: () => { A.viewer.goto(pno); this.insertPage(); } },
      { label: "Bu sayfayı çoğalt", icon: "page-copy", action: () => this.call("duplicatePages", [pno]) },
      { label: "Bu sayfayı döndür", icon: "rotate-right", action: () => this.call("rotatePages", [pno], 90) },
      { label: "Bu sayfayı sil", icon: "page-delete", danger: true, action: () => this.deletePages([pno]) },
      "-",
      { label: "Genişliğe sığdır", icon: "fit-width", action: () => A.viewer.fit("width") },
      { label: "Sayfaya sığdır", icon: "fit-page", action: () => A.viewer.fit("page") },
    );
    contextMenu(x, y, items);
  }
}

// ---------------------------------------------------------------- yardımcılar
export function mimeOf(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", pam: "image/x-portable-arbitrarymap",
    txt: "text/plain", html: "text/html", json: "application/json", xml: "application/xml", zip: "application/zip",
  }[ext] || "application/octet-stream";
}

let webpSupport = null;
async function canEncodeWebp() {
  if (webpSupport !== null) return webpSupport;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 2;
    webpSupport = c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

