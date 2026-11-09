// Komutlar: masaüstündeki tüm menü eylemleri (Dosya, Düzen, Görünüm, Sayfa,
// Metin, Ekle, Form, Araçlar, Yardım), araçların sayfada bitirdiği işler ve
// çekmece menü. Masaüstündeki ui/mainwindow.py'nin eylem kısmının karşılığı.

import { $, h, toast, withBusy, setBusyText, form, formBody, openSheet, confirmBox, promptBox, contextMenu, parsePages, parseRanges, fmtBytes, escapeHtml } from "./ui.js";
import { icon } from "./icons.js";
import { settings, saveSettings } from "./store.js";
import { T, LABELS, ICONS } from "./tools.js";
import { textEditDialog, textAddDialog, signatureDialog, linkDialog, tableDialog, shortcutsDialog, aboutDialog, preferencesDialog, b64ToBytes } from "./dialogs.js";
import { Inspector } from "./inspector.js";
import { Panels } from "./panels.js";
import { runOcr } from "./ocr.js";
import { appName } from "../branding.js";
import { t, tn, num, pct, LANGUAGES, N_, errText } from "../i18n.js";

const PAGE_FORMATS = ["{n}", "{n} / {total}", "- {n} -", N_("Sayfa {n}"), N_("Sayfa {n} / {total}"), "{n}/{total}"];
const POSITIONS = [["alt-orta", N_("Alt orta")], ["alt-sağ", N_("Alt sağ")], ["alt-sol", N_("Alt sol")], ["üst-orta", N_("Üst orta")], ["üst-sağ", N_("Üst sağ")], ["üst-sol", N_("Üst sol")]];

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
      toast(errText(e), { error: true, ms: 5000 });
    }
  }

  /** Motor çağrısını meşgul göstergesiyle çalıştırır; hatayı bildirir. */
  async act(fn, text = t("Çalışıyor…")) {
    try {
      return await withBusy(text, fn);
    } catch (e) {
      toast(errText(e), { error: true, ms: 5000 });
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

  pagesField(key = "pages", label = t("Sayfalar"), value = "all") {
    return { key, type: "pages", label, total: this.total, current: this.cur, value };
  }

  _register() {
    const A = this.app;
    const add = this.add.bind(this);
    const tool = (tl, section, key) => add(section, "tool_" + tl, LABELS[tl], () => A.setTool(tl), { icon: ICONS[tl], key });

    // ---------------------------------------------------------------- Dosya
    add(N_("Dosya"), "new", N_("Yeni boş belge"), () => this.newDocument(), { icon: "new", needsDoc: false });
    add(N_("Dosya"), "new_images", N_("Görüntülerden PDF"), () => A.newFromImages(), { icon: "image", needsDoc: false });
    add(N_("Dosya"), "merge_new", N_("PDF birleştir (yeni)"), () => this.mergeNew(), { icon: "merge", needsDoc: false });
    add(N_("Dosya"), "open", N_("Aç…"), () => A.openDialog(), { icon: "open", key: "Ctrl+O", needsDoc: false });
    add(N_("Dosya"), "home", N_("Ana ekran / son kullanılanlar"), () => A.closeDocument(), { icon: "home" });
    add(N_("Dosya"), "save", N_("Kaydet"), () => A.save(), { icon: "save", key: "Ctrl+S" });
    add(N_("Dosya"), "save_as", N_("Farklı kaydet…"), () => A.saveAs(), { icon: "save-as", key: "Ctrl+Shift+S" });
    add(N_("Dosya"), "share", N_("Paylaş…"), () => this.share(), { icon: "share" });
    add(N_("Dosya"), "encrypt", N_("Şifrele ve izinler…"), () => this.encrypt(), { icon: "lock", short: N_("Şifrele") });
    add(N_("Dosya"), "export_images", N_("Dışa aktar: sayfaları görüntü olarak…"), () => this.exportImages(), { icon: "export" });
    add(N_("Dosya"), "export_text", N_("Dışa aktar: metin / HTML / XML / JSON…"), () => this.exportText(), { icon: "export" });
    add(N_("Dosya"), "export_pages", N_("Dışa aktar: seçili sayfalar (PDF)…"), () => this.extractPages(), { icon: "extract" });
    add(N_("Dosya"), "export_all_images", N_("Dışa aktar: gömülü görüntüler…"), () => this.exportAllImages(), { icon: "image" });
    add(N_("Dosya"), "print", N_("Yazdır…"), () => this.print(), { icon: "print", key: "Ctrl+P", short: N_("Yazdır") });
    add(N_("Dosya"), "print_area", N_("Seçili alanı yazdır…"), () => this.startPrintArea(), { icon: "print-area", key: "Ctrl+Shift+P", short: N_("Alanı yazdır") });
    add(N_("Dosya"), "close", N_("Belgeyi kapat"), () => A.closeDocument(), { icon: "close", key: "Ctrl+W" });

    // ---------------------------------------------------------------- Düzen
    add(N_("Düzen"), "undo", N_("Geri al"), () => this.undo(), { icon: "undo", key: "Ctrl+Z" });
    add(N_("Düzen"), "redo", N_("Yinele"), () => this.redo(), { icon: "redo", key: "Ctrl+Y" });
    add(N_("Düzen"), "copy", N_("Seçili metni kopyala"), () => this.copy(), { icon: "copy", key: "Ctrl+C" });
    add(N_("Düzen"), "find", N_("Bul…"), () => A.openSearch(), { icon: "search", key: "Ctrl+F" });
    add(N_("Düzen"), "find_next", N_("Sonraki sonuç"), () => A.searchStep(1), { icon: "chevron-down", key: "F3" });
    add(N_("Düzen"), "find_prev", N_("Önceki sonuç"), () => A.searchStep(-1), { icon: "chevron-up", key: "Shift+F3" });
    add(N_("Düzen"), "find_replace", N_("Bul ve değiştir…"), () => this.findReplace(), { icon: "search", short: N_("Bul-değiştir"), key: "Ctrl+H" });
    add(N_("Düzen"), "props", N_("Belge özellikleri (meta veri)…"), () => this.metadata(), { icon: "info" });

    // -------------------------------------------------------------- Görünüm
    add(N_("Görünüm"), "zoom_in", N_("Yakınlaştır"), () => A.viewer.zoomBy(1.25), { icon: "zoom-in", key: "Ctrl+=", short: N_("Yakınlaştır") });
    add(N_("Görünüm"), "zoom_out", N_("Uzaklaştır"), () => A.viewer.zoomBy(0.8), { icon: "zoom-out", key: "Ctrl+-", short: N_("Uzaklaştır") });
    add(N_("Görünüm"), "zoom_100", N_("Gerçek boyut (%100)"), () => A.viewer.setZoom(1), { icon: "zoom-in", key: "Ctrl+0" });
    add(N_("Görünüm"), "fit_width", N_("Genişliğe sığdır"), () => A.viewer.fit("width"), { icon: "fit-width", key: "Ctrl+1", short: N_("Genişlik") });
    add(N_("Görünüm"), "fit_page", N_("Sayfaya sığdır"), () => A.viewer.fit("page"), { icon: "fit-page", key: "Ctrl+2", short: N_("Sayfa") });
    add(N_("Görünüm"), "layout", N_("Sayfa düzeni…"), () => this.chooseLayout(), { icon: "columns", short: N_("Düzen") });
    add(N_("Görünüm"), "goto", N_("Sayfaya git…"), () => this.gotoPage(), { icon: "next" });
    add(N_("Görünüm"), "sidebar", N_("Kenar çubuğu (paneller)"), () => this.panels.toggle(), { icon: "sidebar", key: "F9" });
    add(N_("Görünüm"), "inspector", N_("Araç ayarları"), () => this.inspector.openTool(), { icon: "palette", key: "F10" });
    add(N_("Görünüm"), "text_boxes", N_("Metin kutularını göster"), () => this.toggleTextBoxes(), { icon: "text-edit", check: () => settings.showTextBoxes });
    add(N_("Görünüm"), "fullscreen", N_("Odak modu (çubukları gizle)"), () => this.focusMode(), { icon: "fullscreen", key: "F11" });
    add(N_("Görünüm"), "theme", N_("Koyu / açık tema"), () => A.toggleTheme(), { icon: "sun", needsDoc: false, short: N_("Tema") });
    add(N_("Görünüm"), "language", N_("Dil…"), () => this.chooseLanguage(), { icon: "globe", needsDoc: false, short: N_("Dil") });

    // ---------------------------------------------------------------- Sayfa
    add(N_("Sayfa"), "page_insert", N_("Boş sayfa ekle…"), () => this.insertPage(), { icon: "page-add", short: N_("Sayfa ekle") });
    add(N_("Sayfa"), "images_as_pages", N_("Görüntüleri sayfa olarak ekle…"), () => this.imagesAsPages(), { icon: "image", short: N_("Görüntü sayfa") });
    add(N_("Sayfa"), "page_dup", N_("Sayfayı çoğalt"), () => this.call("duplicatePages", this.targets()), { icon: "page-copy", short: N_("Çoğalt") });
    add(N_("Sayfa"), "page_delete", N_("Sayfayı sil…"), () => this.deletePages(this.targets()), { icon: "page-delete", short: N_("Sil") });
    add(N_("Sayfa"), "rot_left", N_("Sola döndür"), () => this.call("rotatePages", this.targets(), -90), { icon: "rotate-left", key: "Ctrl+Shift+←", short: N_("Sola") });
    add(N_("Sayfa"), "rot_right", N_("Sağa döndür"), () => this.call("rotatePages", this.targets(), 90), { icon: "rotate-right", key: "Ctrl+Shift+→", short: N_("Sağa") });
    add(N_("Sayfa"), "reverse", N_("Sıralamayı ters çevir"), () => this.call("reversePages"), { icon: "split" });
    add(N_("Sayfa"), "page_move", N_("Sayfaları taşı…"), () => this.movePages(), { icon: "drag" });
    tool(T.CROP, N_("Sayfa"), "C");
    add(N_("Sayfa"), "page_crop_reset", N_("Kırpmayı sıfırla"), () => this.call("resetCrop", this.targets()), { icon: "crop" });
    add(N_("Sayfa"), "page_resize", N_("Sayfa boyutunu değiştir…"), () => this.resizePages(), { icon: "fit-page" });
    add(N_("Sayfa"), "merge", N_("PDF birleştir (ekle)…"), () => this.merge(), { icon: "merge", short: N_("Birleştir") });
    add(N_("Sayfa"), "split", N_("PDF'i böl…"), () => this.split(), { icon: "split", short: N_("Böl") });
    add(N_("Sayfa"), "page_extract", N_("Sayfaları çıkar (ayrı PDF)…"), () => this.extractPages(), { icon: "extract", short: N_("Çıkar") });

    // ---------------------------------------------------------------- Metin
    tool(T.TEXT_EDIT, N_("Metin"), "E");
    tool(T.TEXT_ADD, N_("Metin"), "T");
    tool(T.ERASE_AREA, N_("Metin"));
    add(N_("Metin"), "ocr", N_("OCR — aranabilir metin katmanı…"), () => this.ocr(), { icon: "ocr" });

    // ------------------------------------------------------------------ Ekle
    for (const [tl, key] of [[T.HIGHLIGHT], [T.UNDERLINE], [T.STRIKEOUT], [T.SQUIGGLY], [T.NOTE, "N"], [T.FREETEXT], [T.INK, "D"], [T.RECT, "R"], [T.ELLIPSE], [T.LINE, "L"], [T.ARROW, "A"], [T.POLYGON], [T.STAMP], [T.IMAGE, "I"], [T.SIGNATURE, "S"], [T.LINK, "K"], [T.MEASURE, "M"]]) tool(tl, N_("Ekle"), key);
    add(N_("Ekle"), "watermark", N_("Filigran…"), () => this.watermark(), { icon: "watermark" });
    add(N_("Ekle"), "pagenum", N_("Sayfa numarası / üst-alt bilgi…"), () => this.pageNumbers(), { icon: "number" });
    add(N_("Ekle"), "attach", N_("Dosya eki…"), () => this.attachFile(), { icon: "import" });
    add(N_("Ekle"), "bookmark_add", N_("Yer imi ekle (bu sayfa)…"), () => this.panels.addBookmark(), { icon: "bookmark" });

    // ------------------------------------------------------------------ Form
    tool(T.FORM_TEXT, N_("Form"));
    tool(T.FORM_CHECK, N_("Form"));
    add(N_("Form"), "forms_panel", N_("Form alanlarını doldur"), () => this.panels.open("forms"), { icon: "form", short: N_("Doldur") });
    add(N_("Form"), "form_export", N_("Değerleri JSON olarak dışa aktar…"), () => this.formExport(), { icon: "export", short: N_("JSON dışa") });
    add(N_("Form"), "form_import", N_("Değerleri JSON'dan içe aktar…"), () => this.formImport(), { icon: "import", short: N_("JSON içe") });
    add(N_("Form"), "form_flatten", N_("Formu düzleştir"), () => this.formFlatten(), { icon: "layers", short: N_("Düzleştir") });

    // --------------------------------------------------------------- Araçlar
    tool(T.REDACT, N_("Araçlar"));
    add(N_("Araçlar"), "apply_redactions", N_("Karartmaları uygula"), () => this.applyRedactions(), { icon: "redact", key: "Ctrl+Shift+R", short: N_("Uygula") });
    tool(T.ERASER, N_("Araçlar"));
    add(N_("Araçlar"), "flatten", N_("Açıklamaları düzleştir"), () => this.flatten(), { icon: "layers" });
    add(N_("Araçlar"), "clear_annots", N_("Tüm açıklamaları kaldır…"), () => this.clearAnnots(), { icon: "trash" });
    add(N_("Araçlar"), "compress", N_("Boyut küçült…"), () => this.compress(), { icon: "compress" });
    add(N_("Araçlar"), "sanitize", N_("Belgeyi temizle (gizlilik)…"), () => this.sanitize(), { icon: "eraser", short: N_("Temizle") });
    add(N_("Araçlar"), "decrypt", N_("Şifreyi kaldır…"), () => this.decrypt(), { icon: "unlock", short: N_("Şifre kaldır") });
    add(N_("Araçlar"), "doc_info", N_("Belge bilgisi…"), () => this.docInfo(), { icon: "info" });
    add(N_("Araçlar"), "fonts", N_("Yazı tipi içe aktar…"), () => this.app.fontStore.importFonts(), { icon: "font", needsDoc: false });
    add(N_("Araçlar"), "preferences", N_("Ayarlar…"), () => preferencesDialog(A), { icon: "settings", needsDoc: false });

    // ----------------------------------------------------------------- Yardım
    add(N_("Yardım"), "shortcuts", N_("Kısayollar ve hareketler"), () => shortcutsDialog(), { icon: "info", needsDoc: false });
    add(N_("Yardım"), "about", N_("Hakkında"), () => aboutDialog(A), { icon: "info-circle", needsDoc: false });
  }

  // =================================================================== çekmece
  openDrawer() {
    const d = $("#drawer");
    d.innerHTML = "";
    const panel = h("div", { class: "drawer-panel" });
    panel.append(h("div", { class: "drawer-head" }, h("img", { src: "img/icon.png", alt: "" }), h("b", {}, appName())));
    const body = h("div", { class: "drawer-body" });
    const sections = [...new Set(this.list.map((c) => c.section))];
    for (const s of sections) {
      const group = h("div", { class: "menu-group" + (s === "Dosya" ? " open" : "") });
      group.append(h("button", { class: "menu-title", html: `<span>${escapeHtml(t(s))}</span>` + icon("chevron-down"), onclick: () => group.classList.toggle("open") }));
      const items = h("div", { class: "menu-items" });
      for (const c of this.list.filter((x) => x.section === s)) {
        const disabled = c.needsDoc && !this.app.isOpen;
        const checked = c.check && c.check();
        const toolOn = c.id.startsWith("tool_") && this.app.tool === c.id.slice(5);
        items.append(h("button", {
          class: "menu-item" + (checked || toolOn ? " checked" : ""), disabled,
          html: icon(c.icon || "info") + `<span>${escapeHtml(t(c.label))}</span>` + (c.key && !checked && !toolOn ? `<kbd>${c.key}</kbd>` : ""),
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
    const v = await form(t("Yeni boş belge"), [
      { key: "preset", type: "select", label: t("Boyut"), options: [...Object.keys(presets).map((k) => [k, t(k)]), ["custom", t("Özel")]], value: "A4 (595 x 842)" },
      { key: "w", type: "number", label: t("Genişlik (pt)"), value: 595, show: (x) => x.preset === "custom" },
      { key: "h", type: "number", label: t("Yükseklik (pt)"), value: 842, show: (x) => x.preset === "custom" },
      { key: "land", type: "check", label: t("Yatay") },
      { key: "n", type: "number", label: t("Sayfa sayısı"), value: 1, min: 1, max: 500 },
    ]);
    if (!v) return;
    let [w, hh] = v.preset === "custom" ? [v.w || 595, v.h || 842] : presets[v.preset];
    if (v.land) [w, hh] = [hh, w];
    await this.app.newBlank(w, hh, Math.max(1, v.n || 1));
  }

  async mergeNew() {
    const files = await this.app.bridge.openFiles({ kind: "doc", multiple: true });
    if (!files.length) return;
    if (!(await this.app.confirmDiscard())) return;
    const info = await this.act(() => this.engine.call("newBlank", 595, 842, 1));
    this.app._installDoc(info, { name: t("Birleştirilmiş.pdf"), handle: null });
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
        const n = await this.act(() => this.engine.call("mergeFiles", list, at), t("Birleştiriliyor…"));
        toast(`${n} sayfa eklendi`);
        return n;
      } catch (e) {
        if (e.code !== "password") return 0;
        const target = list.find((f) => e.params && f.name === e.params.name) || list[0];
        const pw = await promptBox(t("Parola gerekli"), t("“{name}” parola korumalı:", { name: target.name }), "", { type: "password" });
        if (pw === null) return 0;
        target.password = pw;
      }
    }
    return 0;
  }

  async share() {
    const bytes = await this.act(() => this.engine.call("exportBytes"), t("Hazırlanıyor…"));
    await this.app.bridge.writeFile("share", { name: this.engine.state.name, mime: "application/pdf" }, bytes);
  }

  async print() {
    const bytes = await this.act(() => this.engine.call("exportBytes"), t("Yazdırmaya hazırlanıyor…"));
    await this.app.bridge.writeFile("print", { name: this.engine.state.name, mime: "application/pdf" }, bytes);
  }

  stem() {
    return (this.engine.state.name || "belge").replace(/\.pdf$/i, "");
  }

  async encrypt() {
    const c = this.app.consts;
    const v = await form(t("Şifreleme ve izinler"), [
      { key: "user", type: "password", label: t("Kullanıcı parolası (açmak için)"), hint: t("Boş bırakılırsa belge parola sormadan açılır; izinler yine uygulanır.") },
      { key: "owner", type: "password", label: t("Sahip parolası (izinleri değiştirmek için)") },
      { key: "method", type: "select", label: t("Yöntem"), options: Object.entries(c.methods).map(([l, v2]) => [v2, t(l)]), value: "aes-256" },
      { type: "info", value: t("İzin verilen işlemler:") },
      ...c.permissions.map(([k, , label]) => ({ key: "p_" + k, type: "check", label: t(label), value: true })),
    ], {
      ok: t("Şifrele ve kaydet"),
      validate: (x) => (!x.user && !x.owner && x.method !== "none" ? t("En az bir parola girin") : /[,=]/.test(x.user + x.owner) ? t("Parola virgül (,) veya eşittir (=) içeremez") : null),
    });
    if (!v) return;
    const allowed = c.permissions.map(([k]) => k).filter((k) => v["p_" + k]);
    const bytes = await this.act(() => this.engine.call("saveEncrypted", { userPw: v.user, ownerPw: v.owner, allowed, method: v.method }), t("Şifreleniyor…"));
    await this.app.deliver(`${this.stem()}_sifreli.pdf`, bytes, "application/pdf");
  }

  async decrypt() {
    if (!this.engine.state.encrypted) {
      toast("Belge şifreli değil");
      return;
    }
    const bytes = await this.act(() => this.engine.call("saveDecrypted"), t("Şifre kaldırılıyor…"));
    await this.app.deliver(`${this.stem()}_sifresiz.pdf`, bytes, "application/pdf");
  }

  async exportImages() {
    const webp = await canEncodeWebp();
    const v = await form(t("Sayfaları görüntü olarak dışa aktar"), [
      { key: "fmt", type: "seg", label: t("Biçim"), value: "png", options: [["png", "PNG"], ["jpg", "JPG"], ...(webp ? [["webp", "WEBP"]] : []), ["pam", "PAM"]] },
      { key: "dpi", type: "range", label: t("Çözünürlük (DPI)"), value: 150, min: 36, max: 1200, step: 12, format: (x) => x + " dpi" },
      { key: "gray", type: "check", label: t("Gri tonlama") },
      { key: "alpha", type: "check", label: t("Saydam arka plan (PNG)"), show: (x) => x.fmt === "png" },
      this.pagesField(),
    ], { ok: t("Dışa aktar") });
    if (!v || !v.pages.length) return;
    const big = v.pages.length * (v.dpi / 72) ** 2 * 595 * 842 * 3;
    if (big > 1.5e9 && !(await confirmBox(t("Büyük çıktı"), t("Bu ayarlarla yaklaşık {size} ham görüntü verisi üretilecek. Devam edilsin mi?", { size: fmtBytes(big) })))) return;
    const files = [];
    await this.act(async () => {
      for (let i = 0; i < v.pages.length; i++) {
        setBusyText(t("Sayfa {i}/{n} dışa aktarılıyor…", { i: i + 1, n: v.pages.length }));
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
    const zip = await this.act(() => this.engine.call("zip", files), t("ZIP hazırlanıyor…"));
    await this.app.deliver(zipName, zip, "application/zip");
  }

  async exportText() {
    const modes = this.app.consts.textModes;
    const v = await form(t("Metni dışa aktar"), [
      { key: "mode", type: "select", label: t("Biçim"), options: Object.keys(modes).map((k) => [k, t(k)]), value: Object.keys(modes)[0] },
      { key: "sep", type: "check", label: t("Sayfa ayraçlarını ekle"), value: true },
      this.pagesField(),
    ], { ok: t("Dışa aktar") });
    if (!v) return;
    const [mode, ext] = modes[v.mode];
    const text = await this.act(() => this.engine.call("exportText", { mode, pages: v.pages, separator: v.sep, title: this.stem() }));
    const mime = { txt: "text/plain", md: "text/markdown", html: "text/html", xhtml: "application/xhtml+xml", xml: "application/xml", json: "application/json" }[ext];
    await this.app.deliver(`${this.stem()}.${ext}`, new TextEncoder().encode(text), mime + ";charset=utf-8");
  }

  async exportAllImages() {
    const files = await this.act(() => this.engine.call("extractAllImages"), t("Görüntüler çıkarılıyor…"));
    await this.deliverFiles(files, `${this.stem()}_gomulu_goruntuler.zip`);
  }

  // ============================================================ Düzen
  async undo() {
    const label = await this.engine.call("undo");
    if (label) toast(t("Geri alındı: {label}", { label: t(label) }));
    this.app.clearObject();
    this.app.clearSelection();
  }

  async redo() {
    const label = await this.engine.call("redo");
    if (label) toast(t("Yinelendi: {label}", { label: t(label) }));
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
    toast(ok ? t("Kopyalandı") : t("Kopyalanamadı"), { error: !ok });
  }

  async findReplace() {
    const v = await form(t("Bul ve değiştir"), [
      { key: "needle", type: "text", label: t("Aranan"), value: this.app.search.query || (this.app.selection ? this.app.selection.text : "") },
      { key: "repl", type: "text", label: t("Yeni metin") },
      { key: "cs", type: "check", label: t("Büyük/küçük harf duyarlı"), value: settings.searchCase },
      { key: "ww", type: "check", label: t("Yalnızca tam kelimeler"), value: settings.searchWhole },
      { key: "style", type: "check", label: t("Özgün yazı tipi ve rengi koru"), value: true },
      this.pagesField(),
      { type: "info", value: t("Eski metin gerçekten kaldırılır (redaksiyon) ve yenisi sayfa içeriğine yazılır.") },
    ], { ok: t("Tümünü değiştir"), validate: (x) => (!x.needle ? t("Aranan metin boş") : null) });
    if (!v) return;
    const n = await this.act(() => this.engine.call("replaceAll", v.needle, v.repl, {
      caseSensitive: v.cs, wholeWords: v.ww, pages: v.pages, matchStyle: v.style,
      style: { family: settings.tool.fontFamily, size: settings.tool.fontsize, color: settings.tool.textColor },
    }), t("Değiştiriliyor…"));
    toast(n ? tn("{n} yer değiştirildi", n) : t("Eşleşme bulunamadı"));
  }

  async metadata() {
    const m = await this.engine.call("getMetadata");
    const v = await form(t("Belge özellikleri"), [
      { key: "title", label: t("Başlık"), value: m.title },
      { key: "author", label: t("Yazar"), value: m.author },
      { key: "subject", label: t("Konu"), value: m.subject },
      { key: "keywords", label: t("Anahtar kelimeler"), value: m.keywords },
      { key: "creator", label: t("Oluşturan"), value: m.creator },
      { key: "producer", label: t("Üretici"), value: m.producer },
      { type: "info", value: t("PDF sürümü: {format} · Şifreleme: {enc}", { format: m.format || "?", enc: m.encryption && m.encryption !== "None" ? m.encryption : t("yok") }) },
    ], { ok: t("Kaydet") });
    if (v) await this.call("setMetadata", v);
  }

  // ============================================================ Görünüm
  async chooseLayout() {
    const v = await form(t("Sayfa düzeni"), [{ key: "l", type: "radio", value: this.app.viewer.layoutMode, options: [["continuous", t("Sürekli")], ["single", t("Tek sayfa")], ["double", t("Çift sayfa")], ["cover", t("Çift sayfa (kapaklı)")]] }]);
    if (v) {
      this.app.viewer.setLayout(v.l);
      saveSettings();
    }
  }

  /** Görünüm → Dil (masaüstüyle aynı seçenekler). Dil anında değişir; açık belge korunur. */
  async chooseLanguage() {
    const v = await form(t("Dil"), [{
      key: "lang", type: "radio", value: settings.language,
      options: [["system", t("Sistem dili")], ...Object.entries(LANGUAGES)],
    }]);
    if (!v || v.lang === settings.language) return;
    this.app.setLanguage(v.lang);
  }

  async gotoPage() {
    const v = await promptBox(t("Sayfaya git"), t("Sayfa numarası (1–{n})", { n: this.total }), String(this.cur + 1), { type: "number" });
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
    const v = await form(t("Boş sayfa ekle"), [
      { key: "preset", type: "select", label: t("Boyut"), options: [["same", t("Geçerli sayfayla aynı")], ...Object.keys(presets).map((k) => [k, t(k)]), ["custom", t("Özel")]], value: "same" },
      { key: "w", type: "number", label: t("Genişlik (pt)"), value: Math.round(cur.width), show: (x) => x.preset === "custom" },
      { key: "h", type: "number", label: t("Yükseklik (pt)"), value: Math.round(cur.height), show: (x) => x.preset === "custom" },
      { key: "land", type: "check", label: t("Yatay"), show: (x) => x.preset !== "same" },
      { key: "n", type: "number", label: t("Adet"), value: 1, min: 1, max: 200 },
      { key: "where", type: "select", label: t("Konum"), numeric: true, value: 0, options: [[0, t("Geçerli sayfadan sonra ({n})", { n: this.cur + 1 })], [1, t("Geçerli sayfadan önce ({n})", { n: this.cur + 1 })], [2, t("Belgenin sonuna")], [3, t("Belgenin başına")]] },
    ], { ok: t("Ekle") });
    if (!v) return;
    let [w, hh] = v.preset === "custom" ? [v.w || 595, v.h || 842] : v.preset === "same" ? [cur.width, cur.height] : presets[v.preset];
    if (v.land && v.preset !== "same" && hh > w) [w, hh] = [hh, w];
    const at = [this.cur + 1, this.cur, this.total, 0][v.where];
    await this.call("insertBlank", at, w, hh, Math.max(1, v.n || 1));
    this.app.viewer.goto(at);
  }

  async imagesAsPages() {
    const files = await this.app.bridge.openFiles({ kind: "image", multiple: true });
    if (!files.length) return;
    const n = await this.act(() => this.engine.call("insertImagesAsPages", files.map((f) => ({ name: f.name, bytes: f.bytes })), this.cur + 1), t("Görüntüler ekleniyor…"));
    toast(`${n} sayfa eklendi`);
  }

  async deletePages(pages) {
    if (pages.length >= this.total) {
      toast("Belgede en az bir sayfa kalmalı", { error: true });
      return;
    }
    const label = pages.length === 1 ? `${pages[0] + 1}. sayfa` : `${pages.length} sayfa`;
    if (!(await confirmBox(t("Sayfa sil"), t("{what} silinsin mi? (Geri alınabilir)", { what: label }), { ok: t("Sil"), danger: true }))) return;
    await this.call("deletePages", pages);
    this.panels.clearPicked();
  }

  async movePages() {
    const v = await form(t("Sayfaları taşı"), [
      { key: "pages", type: "text", label: t("Taşınacak sayfalar"), value: String(this.cur + 1), placeholder: t("örn. 3-5, 8") },
      { key: "to", type: "number", label: t("Hangi sayfanın önüne? (1–{n}; sona taşımak için {n})", { n: this.total + 1 }), value: 1 },
    ], { ok: t("Taşı") });
    if (!v) return;
    const pages = parsePages(v.pages, this.total);
    if (!pages.length) return;
    await this.call("movePages", pages, Math.max(0, Math.min(this.total, (v.to || 1) - 1)));
  }

  async resizePages() {
    const presets = this.app.consts.pagePresets;
    const v = await form(t("Sayfa boyutunu değiştir"), [
      { key: "preset", type: "select", label: t("Yeni boyut"), options: [...Object.keys(presets).map((k) => [k, t(k)]), ["custom", t("Özel")]], value: "A4 (595 x 842)" },
      { key: "w", type: "number", label: t("Genişlik (pt)"), value: 595, show: (x) => x.preset === "custom" },
      { key: "h", type: "number", label: t("Yükseklik (pt)"), value: 842, show: (x) => x.preset === "custom" },
      { key: "land", type: "check", label: t("Yatay") },
      this.pagesField("pages", t("Sayfalar"), "current"),
      { type: "info", value: t("İçerik yeni boyuta ölçeklenir. Açıklamalar korunmaz (masaüstü sürümdeki gibi).") },
    ], { ok: t("Uygula") });
    if (!v || !v.pages.length) return;
    let [w, hh] = v.preset === "custom" ? [v.w || 595, v.h || 842] : presets[v.preset];
    if (v.land) [w, hh] = [Math.max(w, hh), Math.min(w, hh)];
    await this.act(() => this.engine.call("resizePages", v.pages, w, hh), t("Sayfalar yeniden boyutlanıyor…"));
  }

  async merge() {
    const files = await this.app.bridge.openFiles({ kind: "doc", multiple: true });
    if (!files.length) return;
    const v = await form(t("PDF birleştir"), [
      { type: "info", value: files.map((f) => "• " + f.name).join("\n") },
      { key: "where", type: "select", label: t("Nereye eklensin?"), numeric: true, value: 0, options: [[0, t("Belgenin sonuna")], [1, t("Geçerli sayfadan sonra ({n})", { n: this.cur + 1 })], [2, t("Belgenin başına")]] },
    ], { ok: t("Birleştir") });
    if (!v) return;
    const at = [this.total, this.cur + 1, 0][v.where];
    await this._mergeFiles(files, at);
  }

  async split() {
    const v = await form(t("PDF'i böl"), [
      { key: "mode", type: "radio", value: "every", options: [["every", t("Her N sayfada bir böl")], ["ranges", t("Aralıklara göre böl (örn. 1-3, 4-8, 9-)")]] },
      { key: "n", type: "number", label: "N", value: 1, min: 1, show: (x) => x.mode === "every" },
      { key: "ranges", type: "text", label: t("Aralıklar"), placeholder: "1-3, 4-8, 9-", show: (x) => x.mode === "ranges" },
    ], { ok: t("Böl") });
    if (!v) return;
    const stem = this.stem();
    let parts;
    if (v.mode === "every") parts = await this.act(() => this.engine.call("splitEvery", Math.max(1, v.n || 1), stem), t("Bölünüyor…"));
    else {
      const ranges = parseRanges(v.ranges, this.total);
      if (!ranges.length) { toast("Geçerli bir aralık girin", { error: true }); return; }
      parts = await this.act(() => this.engine.call("splitByRanges", ranges, stem), t("Bölünüyor…"));
    }
    await this.deliverFiles(parts, `${stem}_bolumler.zip`);
  }

  async extractPages() {
    const sel = this.panels.selectedPages();
    const v = await form(t("Sayfaları çıkar"), [
      { key: "pages", type: "pages", label: t("Sayfalar"), total: this.total, current: this.cur, value: sel.length > 1 ? "range" : "current", range: sel.length > 1 ? sel.map((p) => p + 1).join(",") : "" },
      { key: "del", type: "check", label: t("Çıkardıktan sonra bu belgeden sil") },
    ], { ok: t("Çıkar") });
    if (!v || !v.pages.length) return;
    const bytes = await this.act(() => this.engine.call("extractPages", v.pages));
    const name = `${this.stem()}_sayfa_${v.pages.length === 1 ? v.pages[0] + 1 : v.pages[0] + 1 + "-" + (v.pages[v.pages.length - 1] + 1)}.pdf`;
    const res = await this.app.deliver(name, bytes, "application/pdf");
    if (res && v.del && v.pages.length < this.total) await this.call("deletePages", v.pages);
  }

  // ============================================================ Ekle
  async watermark() {
    const v = await form(t("Filigran"), [
      { key: "kind", type: "seg", label: t("Tür"), value: "text", options: [["text", t("Metin")], ["image", t("Görüntü")]] },
      { key: "text", label: "Metin", value: t("GİZLİ"), show: (x) => x.kind === "text" },
      { key: "family", type: "select", label: t("Yazı tipi"), options: this.app.fontFamilies, value: "Helvetica", show: (x) => x.kind === "text" },
      { key: "size", type: "number", label: t("Punto"), value: 60, show: (x) => x.kind === "text" },
      { key: "color", type: "color", label: t("Renk"), value: [0.6, 0.6, 0.6], show: (x) => x.kind === "text" },
      { key: "angle", type: "range", label: t("Açı"), value: 45, min: -90, max: 90, format: (x) => x + "°", show: (x) => x.kind === "text" },
      { key: "scale", type: "range", label: t("Ölçek"), value: 50, min: 5, max: 100, format: (x) => "%" + x, show: (x) => x.kind === "image" },
      { key: "opacity", type: "range", label: t("Saydamlık"), value: 25, min: 5, max: 100, format: (x) => "%" + x },
      { key: "behind", type: "check", label: t("İçeriğin arkasına yerleştir") },
      this.pagesField(),
    ], { ok: t("Uygula"), validate: (x) => (x.kind === "text" && !x.text.trim() ? t("Metin boş") : null) });
    if (!v || !v.pages.length) return;
    if (v.kind === "text") {
      await this.act(() => this.engine.call("addTextWatermark", v.text, v.pages, { fontsize: v.size || 48, color: v.color, opacity: v.opacity / 100, angle: v.angle, family: v.family, behind: v.behind }), t("Filigran ekleniyor…"));
    } else {
      const files = await this.app.bridge.openFiles({ kind: "image" });
      if (!files.length) return;
      await this.act(() => this.engine.call("addImageWatermark", files[0].bytes, v.pages, { opacity: v.opacity / 100, scale: v.scale / 100, behind: v.behind }), t("Filigran ekleniyor…"));
    }
  }

  async pageNumbers() {
    const v = await form(t("Sayfa numarası / üst-alt bilgi"), [
      { key: "num", type: "check", label: t("Sayfa numarası ekle"), value: true },
      { key: "fmt", type: "select", label: t("Numara biçimi"), options: PAGE_FORMATS.map((f) => [f, t(f)]), value: "{n} / {total}", show: (x) => x.num },
      { key: "pos", type: "select", label: t("Konum"), options: POSITIONS.map(([k, l]) => [k, t(l)]), value: "alt-orta", show: (x) => x.num },
      { key: "start", type: "number", label: t("Başlangıç no"), value: 1, show: (x) => x.num },
      { key: "size", type: "number", label: t("Punto"), value: 10 },
      { key: "color", type: "color", label: t("Renk"), value: [0, 0, 0] },
      { key: "margin", type: "number", label: t("Kenar boşluğu (pt)"), value: 28 },
      { key: "header", label: t("Üst bilgi"), placeholder: t("(isteğe bağlı)") },
      { key: "footer", label: t("Alt bilgi"), placeholder: t("(isteğe bağlı)") },
      this.pagesField(),
    ], { ok: t("Uygula") });
    if (!v || !v.pages.length) return;
    await this.act(async () => {
      if (v.num) await this.engine.call("addPageNumbers", v.pages, { fmt: t(v.fmt), position: v.pos, fontsize: v.size || 10, color: v.color, margin: v.margin ?? 28, startAt: v.start ?? 1 });
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
    if (!(await confirmBox(t("Formu düzleştir"), t("Form alanları sayfa içeriğine gömülecek ve artık düzenlenemeyecek. Devam edilsin mi?")))) return;
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
    const ok = await confirmBox(t("Karartmaları uygula"), tn("{n} alandaki metin, görüntü ve grafikler kalıcı olarak silinecek ve üzeri boyanacak.\n\nBelge kaydedildiğinde bu içerik geri getirilemez.", marks.length), { ok: t("Uygula"), danger: true });
    if (!ok) return;
    await this.act(() => this.engine.call("redactAreas", marks, { fill: settings.tool.redactFill, removeImages: true }), t("Karartılıyor…"));
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
    if (!(await confirmBox(t("Açıklamaları düzleştir"), t("Tüm açıklamalar ve form alanları sayfa içeriğine gömülecek. Devam edilsin mi?")))) return;
    await this.call("flatten", { annots: true, widgets: true });
  }

  async clearAnnots() {
    if (!(await confirmBox(t("Tüm açıklamaları kaldır"), t("Belgedeki tüm açıklamalar silinecek (geri alınabilir)."), { ok: t("Kaldır"), danger: true }))) return;
    const n = await this.call("clearAnnots", null);
    toast(tn("{n} açıklama kaldırıldı", n));
  }

  async compress() {
    const v = await form(t("Boyut küçült"), [
      { key: "dpi", type: "select", label: t("Görüntü çözünürlüğü"), numeric: true, value: 150, options: [[0, t("Değiştirme")], [300, t("300 DPI (baskı)")], [200, t("200 DPI")], [150, t("150 DPI (önerilen)")], [96, t("96 DPI (ekran)")], [72, t("72 DPI (en küçük)")]] },
      { key: "q", type: "range", label: t("JPEG kalitesi"), value: 70, min: 20, max: 95, format: (x) => "%" + x },
      { key: "subset", type: "check", label: t("Yazı tiplerini alt kümele"), value: true },
      { type: "info", value: t("Açık belge değişmez; küçültülmüş kopya ayrı dosya olarak kaydedilir.") },
    ], { ok: t("Küçült") });
    if (!v) return;
    const r = await this.act(() => this.engine.call("compress", { imageDpi: v.dpi, jpegQuality: v.q, subsetFonts: v.subset }), t("Küçültülüyor…"));
    const saving = Math.round((1 - r.after / r.before) * 100);
    const go = await confirmBox(t("Boyut küçültüldü"), t("{before} → {after} ({change})\n{images} görüntü yeniden sıkıştırıldı.", { before: fmtBytes(r.before), after: fmtBytes(r.after), images: r.images, change: saving > 0 ? t("{p} küçük", { p: pct(saving) }) : t("küçülme yok") }), { ok: t("Kaydet / paylaş") });
    if (go) await this.app.deliver(`${this.stem()}_kucuk.pdf`, r.bytes, "application/pdf");
  }

  async sanitize() {
    const v = await form(t("Belgeyi temizle"), [
      { key: "metadata", type: "check", label: t("Meta veriyi kaldır (yazar, başlık, XMP)"), value: true },
      { key: "js", type: "check", label: t("JavaScript ve otomatik eylemleri kaldır"), value: true },
      { key: "attachments", type: "check", label: t("Gömülü dosyaları ve ekleri kaldır") },
      { key: "links", type: "check", label: t("Tüm bağlantıları kaldır") },
    ], { ok: t("Temizle") });
    if (v) {
      await this.call("sanitize", v);
      toast("Belge temizlendi");
    }
  }

  async docInfo() {
    const rows = await this.act(() => this.engine.call("documentReport", { path: this.engine.state.name }), t("İnceleniyor…"));
    await tableDialog(t("Belge bilgisi"), rows);
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
        const v = await form(t("Metin kutusu (açıklama)"), [
          { key: "text", type: "textarea", label: "Metin", rows: 3 },
          { key: "font", type: "seg", label: t("Yazı tipi"), value: ["Helvetica", "Times", "Courier"].includes(st.fontFamily) ? st.fontFamily : "Helvetica", options: [["Helvetica", "Helvetica"], ["Times", "Times"], ["Courier", "Courier"]] },
          { key: "size", type: "number", label: t("Punto"), value: st.fontsize },
          { key: "color", type: "color", label: t("Metin rengi"), value: st.textColor },
          { key: "fill", type: "color", label: t("Arka plan"), value: st.fill, allowNone: true },
          { key: "border", type: "range", label: t("Kenarlık"), value: 0, min: 0, max: 6, step: 0.5, format: (x) => x + " pt" },
          { key: "align", type: "seg", label: t("Hizalama"), value: st.align < 3 ? st.align : 0, options: [[0, t("Sola")], [1, t("Ortala")], [2, t("Sağa")]] },
        ], { ok: t("Ekle"), validate: (x) => (!x.text.trim() ? t("Metin boş") : null) });
        if (!v) return;
        Object.assign(st, { fontsize: v.size || 12, textColor: v.color });
        saveSettings();
        return this.act(() => this.engine.call("addFreeText", pno, r, v.text, { fontsize: v.size || 12, font: v.font, textColor: v.color, fillColor: v.fill, borderWidth: v.border, align: v.align, opacity: st.opacity, author: settings.author }));
      }
      case T.IMAGE: {
        const files = await A.bridge.openFiles({ kind: "image" });
        if (!files.length) return;
        return this.act(() => this.engine.call("placeImage", pno, r, files[0].bytes, { label: t("Görüntü ekle") }));
      }
      case T.SIGNATURE: {
        let png = settings.signature ? b64ToBytes(settings.signature) : null;
        if (png) {
          const choice = await form(t("İmza"), [{ key: "c", type: "radio", value: "saved", options: [["saved", t("Kayıtlı imzamı kullan")], ["new", t("Yeni imza oluştur")]] }], { ok: t("Devam") });
          if (!choice) return;
          if (choice.c === "new") png = null;
        }
        if (!png) png = await signatureDialog(A);
        if (!png) return;
        return this.act(() => this.engine.call("placeImage", pno, r, png, { label: t("İmza ekle") }));
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
        const v = await form(t("Sayfayı kırp"), [
          { type: "info", value: t("Yeni sınır: {w} × {h} pt", { w: Math.round(r[2] - r[0]), h: Math.round(r[3] - r[1]) }) },
          { key: "pages", type: "pages", label: t("Uygulanacak sayfalar"), total: this.total, current: pno, value: "current" },
        ], { ok: t("Kırp") });
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
        const v = await form(t("Alanı sil"), [
          { type: "info", value: t("Seçilen alandaki içerik sayfadan kalıcı olarak kaldırılır (geri alınabilir).") },
          { key: "images", type: "check", label: t("Görüntüleri de sil") },
          { key: "graphics", type: "check", label: t("Çizgi ve şekilleri de sil") },
          { key: "bg", type: "color", label: t("Alanı boya"), value: null, allowNone: true },
        ], { ok: t("Sil") });
        if (!v) return;
        return this.act(() => this.engine.call("deleteTextRegion", pno, r, { background: v.bg, removeImages: v.images, removeGraphics: v.graphics }));
      }
      case T.PRINT_AREA:
        return this.printArea(pno, r);
      case T.FORM_TEXT:
      case T.FORM_CHECK: {
        const isCheck = tool === T.FORM_CHECK;
        const v = await form(isCheck ? t("Onay kutusu ekle") : t("Form alanı ekle"), [
          { key: "kind", type: "select", label: t("Tür"), value: isCheck ? "checkbox" : "text", options: isCheck ? [["checkbox", t("Onay kutusu")], ["radio", t("Seçenek düğmesi")]] : [["text", t("Metin kutusu")], ["multiline", t("Çok satırlı metin")], ["combobox", t("Açılır liste")], ["listbox", t("Liste")], ["signature", t("İmza alanı")]] },
          { key: "name", label: t("Alan adı"), value: isCheck ? "onay" : "alan" },
          { key: "value", label: t("Varsayılan değer"), show: (x) => ["text", "multiline", "combobox"].includes(x.kind) },
          { key: "options", type: "textarea", label: t("Seçenekler (her satıra bir tane)"), rows: 4, show: (x) => x.kind === "combobox" || x.kind === "listbox" },
          { key: "on", type: "check", label: t("İşaretli başlasın"), show: (x) => x.kind === "checkbox" || x.kind === "radio" },
          { key: "size", type: "number", label: t("Punto"), value: 11, show: (x) => !["checkbox", "radio", "signature"].includes(x.kind) },
        ], { ok: t("Ekle"), validate: (x) => (!x.name.trim() ? t("Alan adı gerekli") : null) });
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
    const text = await promptBox(t("Yapışkan not"), t("Not metni"), "", { type: "textarea" });
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
    toast(t("{type} silindi", { type: t(a.typeName) }));
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
    const ok = await this.act(() => this.engine.call("replaceRegionText", pno, block.bbox, v.text, v.style, { baseline: block.baseline, background: v.background, grow: v.grow }), t("Metin düzenleniyor…"));
    if (!ok) toast("Metin kutuya tam sığmadı; punto küçültüldü", { error: true });
  }

  // ------------------------------------------------------ seçili alanı yazdır
  startPrintArea() {
    this.app.setTool(T.PRINT_AREA);
  }

  /** Çizilen alanı yazdırır ya da ayrı bir PDF olarak kaydeder (masaüstündeki print_area). */
  async printArea(pno, rect) {
    const area = await this.engine.call("clampToPage", pno, rect);
    const aw = area[2] - area[0], ah = area[3] - area[1];
    if (!(aw >= 2 && ah >= 2)) {
      toast("Seçili alan çok küçük ya da sayfanın dışında", { error: true });
      return;
    }
    const mm = 25.4 / 72;
    const papers = this.app.consts.papers;
    const { body, values } = formBody([
      { type: "info", value: t("Sayfa {n} · seçili alan {w} × {h} mm", { n: pno + 1, w: Math.round(aw * mm), h: Math.round(ah * mm) }) },
      { key: "mode", type: "radio", label: t("Ölçek"), value: "fit", options: [["fit", t("Kâğıda sığdır")], ["actual", t("Gerçek boyut (%100)")], ["custom", t("Özel ölçek")]] },
      { key: "noUp", type: "check", label: t("Küçük alanları büyütme (en fazla %100)"), show: (x) => x.mode === "fit" },
      { key: "pct", type: "range", label: t("Özel ölçek"), value: 150, min: 10, max: 1000, step: 5, format: (x) => "%" + x, show: (x) => x.mode === "custom" },
      { key: "paper", type: "select", label: t("Kâğıt"), options: Object.keys(papers).map((k) => [k, t(k)]), value: Object.keys(papers)[0] },
      { key: "orient", type: "seg", label: t("Yön"), value: "auto", options: [["auto", t("Otomatik")], ["portrait", t("Dikey")], ["landscape", t("Yatay")]] },
      { key: "center", type: "check", label: t("Kâğıdın ortasına yerleştir"), value: true },
      { key: "marks", type: "check", label: t("Kesim işaretleri ekle (köşelere ince çizgi)") },
      { key: "pages", type: "pages", label: t("Aynı alanı şu sayfalarda bas"), total: this.total, current: pno, value: "current" },
      { type: "info", value: t("Her sayfadaki aynı bölge ayrı bir kâğıda basılır (etiket, fiş, form kesiti gibi). “PDF olarak kaydet” alanı gerçek boyutta, vektör kalitesinde kaydeder; metin seçilebilir kalır, açıklamalar dahildir. Baskı önizlemesini sistemin yazdırma penceresi gösterir.") },
    ]);
    const action = await openSheet({
      title: t("Seçili alanı yazdır"), body,
      buttons: [{ label: t("Vazgeç"), value: null }, { label: t("PDF olarak kaydet"), value: "pdf" }, { label: t("Önizle ve yazdır"), primary: true, value: "print" }],
    });
    if (!action) return;
    const v = values();
    if (!v.pages.length) {
      toast("Geçerli bir sayfa aralığı girin", { error: true });
      return;
    }
    const items = v.pages.map((p) => ({ pno: p, rect: area }));
    const name = `${this.stem()}_alan_s${pno + 1}.pdf`;
    if (action === "pdf") {
      const bytes = await this.act(() => this.engine.call("areaPdf", items, { paper: null }), t("Alan hazırlanıyor…"));
      await this.app.deliver(name, bytes, "application/pdf");
      return;
    }
    const bytes = await this.act(() => this.engine.call("areaPdf", items, {
      paper: papers[v.paper], orientation: v.orient, mode: v.mode, scale: v.pct / 100,
      upscale: !v.noUp, center: v.center, marks: v.marks,
    }), t("Baskı hazırlanıyor…"));
    // Yazdırma penceresi de aynı kâğıt ve yönle açılsın (motorun kuralıyla aynı)
    const landscape = v.orient === "landscape" || (v.orient === "auto" && aw > ah);
    await this.app.bridge.writeFile("print", { name, mime: "application/pdf", media: v.paper.split(" ")[0], landscape }, bytes);
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
      if (await confirmBox(t("Bağlantıyı aç"), t("Bu adres tarayıcıda açılsın mı?\n\n{url}", { url: l.uri }), { ok: t("Aç") })) this.app.bridge.openUrl(l.uri);
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
      const v = await form(f.label || f.name, [{ key: "v", type: f.multiline ? "textarea" : "text", value: f.value, label: f.maxLen ? t("En çok {n} karakter", { n: f.maxLen }) : "" }]);
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
      items.push({ label: t("Kopyala"), icon: "copy", action: () => this.copy() },
        { label: t("Vurgula"), icon: "highlight", action: () => this.markupSelection("highlight") },
        { label: t("Altını çiz"), icon: "underline", action: () => this.markupSelection("underline") },
        { label: t("Üstünü çiz"), icon: "strikeout", action: () => this.markupSelection("strikeout") }, "-");
    }
    items.push(
      { label: t("Bu metni düzenle…"), icon: "text-edit", action: () => this.editTextAt(pno, hit.pt) },
      { label: t("Buraya not ekle…"), icon: "note", action: () => this.addNote(pno, hit.pt) },
      { label: t("Bir alanı yazdır…"), icon: "print-area", action: () => this.startPrintArea() },
      "-",
      { label: t("Boş sayfa ekle…"), icon: "page-add", action: () => { A.viewer.goto(pno); this.insertPage(); } },
      { label: t("Bu sayfayı çoğalt"), icon: "page-copy", action: () => this.call("duplicatePages", [pno]) },
      { label: t("Bu sayfayı döndür"), icon: "rotate-right", action: () => this.call("rotatePages", [pno], 90) },
      { label: t("Bu sayfayı sil"), icon: "page-delete", danger: true, action: () => this.deletePages([pno]) },
      "-",
      { label: t("Genişliğe sığdır"), icon: "fit-width", action: () => A.viewer.fit("width") },
      { label: t("Sayfaya sığdır"), icon: "fit-page", action: () => A.viewer.fit("page") },
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

