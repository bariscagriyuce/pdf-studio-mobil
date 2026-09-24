// Kenar paneli: küçük resimler (çoklu seçim, sürükleyerek sıralama), yer
// imleri, açıklamalar, arama sonuçları, form alanları, görüntüler.
// Masaüstündeki ui/panels.py karşılığı.

import { $, h, toast, form, confirmBox, promptBox, escapeHtml } from "./ui.js";
import { icon } from "./icons.js";
import { cssColorOf } from "./colors.js";

const TABS = [
  ["thumbs", "thumbnails", "Sayfalar"],
  ["toc", "bookmark", "Yer imleri"],
  ["annots", "comment", "Açıklamalar"],
  ["search", "search", "Arama"],
  ["forms", "form", "Formlar"],
  ["images", "image", "Görüntüler"],
];

export class Panels {
  constructor(app) {
    this.app = app;
    this.el = $("#sidepanel");
    this.tab = "thumbs";
    this.picked = new Set();
    this.thumbCache = new Map(); // pno -> { ver, canvas }
    this.thumbVer = [];
    this.observer = null;
  }

  get isOpen() {
    return !this.el.hidden;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open(this.tab);
  }

  open(tab) {
    if (!this.app.isOpen) return;
    this.tab = tab || this.tab;
    this.el.hidden = false;
    this.render();
    // Masaüstü düzeninde görüntüleyici genişliği değişti
    requestAnimationFrame(() => this.app.viewer._onResize());
  }

  close() {
    this.el.hidden = true;
    this.picked.clear();
    requestAnimationFrame(() => this.app.viewer._onResize());
  }

  /** Telefonda bir öğeye dokununca paneli kapat (sayfa görünsün). */
  _afterPick() {
    if (innerWidth < 900) this.close();
  }

  selectedPages() {
    return this.isOpen && this.tab === "thumbs" ? [...this.picked].sort((a, b) => a - b) : [];
  }

  clearPicked() {
    this.picked.clear();
    if (this.isOpen && this.tab === "thumbs") this.render();
  }

  refresh(structural, pages) {
    if (structural) {
      this.thumbCache.clear();
      this.picked = new Set([...this.picked].filter((p) => p < this.app.viewer.pages.length));
    } else if (pages) {
      for (const p of pages) this.thumbCache.delete(p);
    }
    if (!this.isOpen) return;
    if (this.tab === "thumbs" && !structural && pages) {
      for (const p of pages) this._drawThumb(p, true);
    } else if (this.tab !== "search") {
      this.render();
    }
  }

  onPageChange(pno) {
    if (!this.isOpen || this.tab !== "thumbs") return;
    for (const t of this.el.querySelectorAll(".thumb")) t.classList.toggle("cur", +t.dataset.pno === pno);
    const cur = this.el.querySelector(`.thumb[data-pno="${pno}"]`);
    if (cur && !this._dragging) cur.scrollIntoView({ block: "nearest" });
  }

  showSearch() {
    if (this.isOpen && this.tab === "search") this.render();
  }

  // ---------------------------------------------------------------- çizim
  render() {
    const el = this.el;
    el.innerHTML = "";
    const tabs = h("div", { class: "panel-tabs" });
    for (const [id, ic, label] of TABS) {
      tabs.append(h("button", { class: id === this.tab ? "on" : "", title: label, "aria-label": label, html: icon(ic), onclick: () => { this.tab = id; this.picked.clear(); this.render(); } }));
    }
    tabs.append(h("span", { class: "spacer" }), h("button", { title: "Kapat", "aria-label": "Kapat", html: icon("close"), onclick: () => this.close() }));
    el.append(tabs);
    const head = h("div", { class: "panel-head" });
    const body = h("div", { class: "panel-body" });
    el.append(head, body);
    const fn = { thumbs: this.renderThumbs, toc: this.renderToc, annots: this.renderAnnots, search: this.renderSearch, forms: this.renderForms, images: this.renderImages }[this.tab];
    fn.call(this, head, body);
  }

  // ------------------------------------------------------------ küçük resim
  renderThumbs(head, body) {
    const n = this.app.viewer.pages.length;
    const picked = this.picked.size;
    head.append(h("span", { class: "grow" }, picked ? `${picked} sayfa seçili` : `${n} sayfa`));
    if (picked) {
      const cmd = (label, id) => h("button", { onclick: () => this.app.commands.run(id) }, label);
      head.append(cmd("Döndür", "rot_right"), cmd("Çoğalt", "page_dup"), cmd("Çıkar", "page_extract"), cmd("Sil", "page_delete"), h("button", { onclick: () => this.clearPicked() }, "✕"));
    } else {
      head.append(h("button", { onclick: () => { this.picked = new Set([...Array(n).keys()]); this.render(); } }, "Tümünü seç"));
    }
    const grid = h("div", { class: "thumbs" });
    body.append(grid, h("div", { class: "hint", style: { padding: "10px 6px" } }, "Dokun: sayfaya git · Basılı tut: seç · Seçiliyken sürükle: taşı"));
    this.observer?.disconnect();
    this.observer = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) this._drawThumb(+e.target.dataset.pno);
    }, { root: body, rootMargin: "200px" });
    for (let i = 0; i < n; i++) {
      const p = this.app.viewer.pages[i];
      const t = h("div", { class: "thumb" + (i === this.app.viewer.current ? " cur" : "") + (this.picked.has(i) ? " picked" : ""), "data-pno": i });
      const w = 96, hh = Math.round((96 * p.height) / p.width);
      const c = h("canvas", { width: 2, height: 2, style: { width: w + "px", height: hh + "px" } });
      t.append(c, h("small", {}, p.label && p.label !== String(i + 1) ? `${p.label} (${i + 1})` : String(i + 1)));
      this._thumbEvents(t, i);
      grid.append(t);
      this.observer.observe(t);
    }
  }

  async _drawThumb(pno, force = false) {
    const t = this.el.querySelector(`.thumb[data-pno="${pno}"]`);
    if (!t) return;
    const c = t.querySelector("canvas");
    if (!force && c.dataset.done) return;
    c.dataset.done = "1";
    try {
      const img = await this.app.engine.call("thumbnail", pno, 96 * Math.min(2, devicePixelRatio || 1) * 1.45);
      c.width = img.width;
      c.height = img.height;
      c.getContext("2d").putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    } catch { /* belge değişmiş olabilir */ }
  }

  _thumbEvents(t, i) {
    let timer = null, start = null, moved = false, longFired = false;
    t.addEventListener("pointerdown", (e) => {
      start = { x: e.clientX, y: e.clientY };
      moved = false;
      longFired = false;
      if (this.picked.has(i) && this.picked.size) {
        // seçili sayfayı sürüklemeye başla
        this._startDrag(e, i);
        return;
      }
      timer = setTimeout(() => {
        longFired = true;
        navigator.vibrate?.(10);
        this.picked.add(i);
        t.classList.add("picked");
        this.render();
      }, 450);
    });
    t.addEventListener("pointermove", (e) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) {
        moved = true;
        clearTimeout(timer);
      }
    });
    t.addEventListener("pointerup", () => {
      clearTimeout(timer);
      if (moved || longFired || this._dragging) return;
      if (this.picked.size) {
        if (this.picked.has(i)) this.picked.delete(i); else this.picked.add(i);
        this.render();
      } else {
        this.app.viewer.goto(i);
        this._afterPick();
      }
    });
    t.addEventListener("pointercancel", () => clearTimeout(timer));
    t.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  _startDrag(e, i) {
    const grid = this.el.querySelector(".thumbs");
    const src = e.currentTarget;
    let target = null;
    let active = false;
    const x0 = e.clientX, y0 = e.clientY;
    src.setPointerCapture(e.pointerId);
    const move = (ev) => {
      if (!active && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10) {
        active = true;
        this._dragging = true;
        for (const p of this.picked) this.el.querySelector(`.thumb[data-pno="${p}"]`)?.classList.add("dragging");
      }
      if (!active) return;
      ev.preventDefault();
      for (const t of grid.children) t.classList.remove("drop-before");
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".thumb");
      if (under) {
        const r = under.getBoundingClientRect();
        let idx = +under.dataset.pno;
        if (ev.clientX > r.left + r.width / 2) idx += 1;
        target = idx;
        const mark = grid.querySelector(`.thumb[data-pno="${idx}"]`);
        if (mark) mark.classList.add("drop-before");
      }
      // kenara yaklaşınca kaydır
      const body = this.el.querySelector(".panel-body");
      const br = body.getBoundingClientRect();
      if (ev.clientY < br.top + 40) body.scrollTop -= 12;
      else if (ev.clientY > br.bottom - 40) body.scrollTop += 12;
    };
    const up = async () => {
      src.removeEventListener("pointermove", move);
      src.removeEventListener("pointerup", up);
      src.removeEventListener("pointercancel", up);
      setTimeout(() => { this._dragging = false; }, 0);
      if (!active) {
        // dokunuş: seçimi değiştir
        if (this.picked.has(i)) this.picked.delete(i); else this.picked.add(i);
        this.render();
        return;
      }
      if (target === null) { this.render(); return; }
      const pages = [...this.picked].sort((a, b) => a - b);
      this.picked.clear();
      await this.app.commands.call("movePages", pages, target);
    };
    src.addEventListener("pointermove", move);
    src.addEventListener("pointerup", up);
    src.addEventListener("pointercancel", up);
  }

  // ------------------------------------------------------------- yer imleri
  async renderToc(head, body) {
    const toc = await this.app.engine.call("getToc");
    head.append(h("span", { class: "grow" }, `${toc.length} yer imi`), h("button", { onclick: () => this.addBookmark() }, "+ Ekle"));
    if (!toc.length) {
      body.append(h("div", { class: "empty" }, "Belgede yer imi yok. “+ Ekle” ile geçerli sayfaya yer imi ekleyin."));
      return;
    }
    toc.forEach((e, i) => {
      const item = h("button", {
        class: "list-item", style: { paddingLeft: 8 + (e.level - 1) * 16 + "px" },
        html: icon("bookmark") + `<span class="grow"><span>${escapeHtml(e.title || "(adsız)")}</span></span><span class="meta">${e.page >= 0 ? e.page + 1 : ""}</span>`,
        onclick: () => { if (e.page >= 0) { this.app.viewer.goto(e.page); this._afterPick(); } },
      });
      item.addEventListener("contextmenu", (ev) => { ev.preventDefault(); this.editBookmark(toc, i); });
      let t = null;
      item.addEventListener("pointerdown", () => { t = setTimeout(() => { t = null; this.editBookmark(toc, i); }, 500); });
      item.addEventListener("pointerup", () => clearTimeout(t));
      item.addEventListener("pointercancel", () => clearTimeout(t));
      body.append(item);
    });
    body.append(h("div", { class: "hint", style: { padding: "10px 6px" } }, "Basılı tutun: yeniden adlandır, düzey değiştir, sil"));
  }

  async addBookmark() {
    const title = await promptBox("Yer imi ekle", `Başlık (sayfa ${this.app.viewer.current + 1})`, `Sayfa ${this.app.viewer.current + 1}`);
    if (!title) return;
    const toc = await this.app.engine.call("getToc");
    const pno = this.app.viewer.current;
    let at = toc.findIndex((e) => e.page > pno);
    if (at < 0) at = toc.length;
    toc.splice(at, 0, { level: 1, title, page: pno });
    await this.app.commands.call("setToc", toc);
    if (this.isOpen && this.tab === "toc") this.render();
    toast("Yer imi eklendi");
  }

  async editBookmark(toc, i) {
    const e = toc[i];
    const v = await form("Yer imini düzenle", [
      { key: "title", label: "Başlık", value: e.title },
      { key: "page", type: "number", label: "Sayfa", value: e.page + 1, min: 1, max: this.app.viewer.pages.length },
      { key: "level", type: "number", label: "Düzey (1 = en üst)", value: e.level, min: 1, max: 8 },
      { key: "del", type: "check", label: "Bu yer imini sil" },
    ], { ok: "Kaydet" });
    if (!v) return;
    if (v.del) toc.splice(i, 1);
    else toc[i] = { level: Math.max(1, Math.min(i === 0 ? 1 : toc[i - 1].level + 1, v.level || 1)), title: v.title, page: Math.max(0, Math.min(this.app.viewer.pages.length - 1, (v.page || 1) - 1)) };
    await this.app.commands.call("setToc", toc);
    this.render();
  }

  // ------------------------------------------------------------ açıklamalar
  async renderAnnots(head, body) {
    const list = await this.app.engine.call("allAnnots");
    head.append(h("span", { class: "grow" }, `${list.length} açıklama`));
    if (list.length) head.append(h("button", { onclick: () => this.app.commands.run("clear_annots") }, "Tümünü kaldır"));
    if (!list.length) {
      body.append(h("div", { class: "empty" }, "Belgede açıklama yok."));
      return;
    }
    let lastPage = -1;
    for (const a of list) {
      if (a.pno !== lastPage) {
        body.append(h("div", { class: "section-title" }, `Sayfa ${a.pno + 1}`));
        lastPage = a.pno;
      }
      const sw = a.color && a.color.length ? `<span class="swatch" style="background:${cssColorOf(a.color)}"></span>` : `<span class="swatch"></span>`;
      body.append(h("button", {
        class: "list-item",
        html: sw + `<span class="grow"><span>${escapeHtml(a.typeName)}${a.author ? " — " + escapeHtml(a.author) : ""}</span><span class="meta">${escapeHtml((a.content || "").slice(0, 80) || a.modified || "")}</span></span>`,
        onclick: () => {
          this.app.viewer.revealRect(a.pno, a.rect);
          this.app.setTool("select");
          this.app.setObject({ kind: "annot", pno: a.pno, info: a, rect: a.rect, resizable: a.resizable });
          this._afterPick();
        },
      }));
    }
  }

  // ------------------------------------------------------------------ arama
  renderSearch(head, body) {
    const s = this.app.search;
    const input = h("input", { type: "search", placeholder: "Belgede ara…", value: s.query, enterkeyhint: "search" });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") this.app.runSearch(input.value); });
    head.append(input);
    if (!s.query) {
      body.append(h("div", { class: "empty" }, "Aramak için bir metin yazıp Enter'a basın."));
      return;
    }
    body.append(h("div", { class: "hint", style: { padding: "4px 6px" } }, `${s.hits.length} sonuç`));
    s.hits.slice(0, 1000).forEach((hit, i) => {
      body.append(h("button", {
        class: "list-item" + (i === s.index ? " on" : ""),
        html: `<span class="meta" style="min-width:34px">s.${hit.pno + 1}</span><span class="grow"><span>${escapeHtml(hit.context)}</span></span>`,
        onclick: () => { this.app.gotoHit(i); this._afterPick(); },
      }));
    });
  }

  // ------------------------------------------------------------------ formlar
  async renderForms(head, body) {
    const fields = await this.app.engine.call("listFields", null);
    head.append(h("span", { class: "grow" }, `${fields.length} alan`));
    if (!fields.length) {
      body.append(h("div", { class: "empty" }, "Belgede form alanı yok. “Form” araçlarıyla alan ekleyebilirsiniz."));
      return;
    }
    head.append(h("button", { onclick: () => this.app.commands.run("form_export") }, "JSON"));
    for (const f of fields) {
      const val = f.type === "checkbox" || f.type === "radiobutton" ? (f.value && f.value !== "Off" ? "☑" : "☐") : f.value || "—";
      const item = h("div", { class: "list-item" },
        h("span", { class: "grow" }, h("span", {}, f.label || f.name), h("span", { class: "meta" }, `${f.typeName} · s.${f.pno + 1}${f.required ? " · zorunlu" : ""}${f.readonly ? " · salt okunur" : ""}`)),
        h("span", { class: "meta", style: { maxWidth: "40%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, val),
        h("button", { class: "icon-btn", title: "Sil", html: icon("trash"), onclick: async (e) => {
          e.stopPropagation();
          if (await confirmBox("Alanı sil", `“${f.name}” alanı silinsin mi?`, { ok: "Sil", danger: true })) {
            await this.app.commands.call("deleteField", f.pno, f.id);
          }
        } }),
      );
      item.style.cursor = "pointer";
      item.onclick = async () => {
        this.app.viewer.revealRect(f.pno, f.rect);
        await this.app.commands.fillField(f);
        this.render();
      };
      body.append(item);
    }
  }

  // ---------------------------------------------------------------- görüntüler
  async renderImages(head, body) {
    const list = await this.app.engine.call("allImages");
    head.append(h("span", { class: "grow" }, `${list.length} görüntü`));
    if (list.length) head.append(h("button", { onclick: () => this.app.commands.run("export_all_images") }, "Tümünü dışa aktar"));
    if (!list.length) {
      body.append(h("div", { class: "empty" }, "Belgede görüntü yok."));
      return;
    }
    for (const im of list) {
      body.append(h("button", {
        class: "list-item",
        html: icon("image") + `<span class="grow"><span>Sayfa ${im.pno + 1} · ${im.width}×${im.height}</span><span class="meta">${escapeHtml(im.colorspace || "")} · ${im.bpc} bit · ${Math.round(im.rect[2] - im.rect[0])}×${Math.round(im.rect[3] - im.rect[1])} pt</span></span>`,
        onclick: () => {
          this.app.viewer.revealRect(im.pno, im.rect);
          this.app.setTool("select");
          this.app.setObject({ kind: "image", pno: im.pno, info: im, rect: im.rect, resizable: true, keepAspect: true });
          this._afterPick();
        },
      }));
    }
  }
}
