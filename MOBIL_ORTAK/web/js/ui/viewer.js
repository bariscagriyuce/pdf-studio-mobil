// Sayfa tuvali: yerleşim, görüntüleme, yakınlaştırma, iki parmak hareketleri
// ve koordinat dönüşümü. Masaüstündeki ui/pageview.py + core/renderer.py.

import { $ } from "./ui.js";
import { settings } from "./store.js";

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 12;
const MAX_BASE_PIXELS = 5.5e6; // bir sayfanın tam görüntüsü için üst sınır (bellek)
const KEEP_SCREENS = 3; // bu kadar ekran uzaktaki sayfaların görüntüsü bırakılır

export class Viewer {
  constructor(app) {
    this.app = app;
    this.engine = app.engine;
    this.scroller = $("#viewer");
    this.container = $("#pages");
    this.pages = [];
    this.els = [];
    this.pos = [];
    this.zoom = 1;
    this.fitMode = "width";
    this.layoutMode = settings.layout || "continuous";
    this.gap = 12;
    this.margin = 12;
    this.current = 0;
    this.versions = [];
    this.busy = false;
    this.token = 0;
    this._raf = 0;
    this.dpr = Math.min(3, window.devicePixelRatio || 1);

    this.scroller.addEventListener("scroll", () => this._schedule(), { passive: true });
    new ResizeObserver(() => this._onResize()).observe(this.scroller);
    this.scroller.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });
    this._setupPinch();
  }

  get open() {
    return this.pages.length > 0;
  }

  // ------------------------------------------------------------- belge
  setDocument(pages, { keepPlace = false } = {}) {
    const anchor = keepPlace ? this._anchor() : null;
    this.token++; // yoldaki eski görüntü istekleri yeni sayfalara yazılmasın
    this.pages = pages;
    this.versions = pages.map(() => 0);
    for (const el of this.els) el.div.remove();
    this.els = pages.map((p, i) => this._makePage(i));
    if (this.current >= pages.length) this.current = Math.max(0, pages.length - 1);
    if (this.fitMode && !keepPlace) this._applyFit();
    else if (this.fitMode) this._applyFit(true);
    this.layout();
    if (anchor) this._restoreAnchor(anchor);
    else if (!keepPlace) this.scroller.scrollTo(0, 0);
    this._schedule();
  }

  clear() {
    this.token++;
    this.pages = [];
    for (const el of this.els) el.div.remove();
    this.els = [];
    this.pos = [];
    this.container.style.width = this.container.style.height = "0px";
  }

  /** Belirli sayfalar değişti: görüntüleri yenile (eskisi yenisi gelene kadar kalır). */
  invalidate(pnos) {
    for (const p of pnos) if (p < this.versions.length) this.versions[p]++;
    this._schedule();
    for (const p of pnos) this.updateOverlay(p);
  }

  invalidateAll() {
    this.invalidate(this.pages.map((_, i) => i));
  }

  _makePage(i) {
    const div = document.createElement("div");
    div.className = "page";
    div.dataset.pno = i;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 0;
    const detail = document.createElement("canvas");
    detail.className = "detail";
    detail.hidden = true;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ov");
    svg.setAttribute("preserveAspectRatio", "none");
    const p = this.pages[i];
    svg.setAttribute("viewBox", `0 0 ${p.width} ${p.height}`);
    const badge = document.createElement("div");
    badge.className = "num-badge";
    badge.textContent = p.label && p.label !== String(i + 1) ? `${p.label} (${i + 1})` : String(i + 1);
    div.append(canvas, detail, svg, badge);
    this.container.append(div);
    return { div, canvas, detail, svg, scale: 0, ver: -1, detailKey: "" };
  }

  // ------------------------------------------------------------ yerleşim
  _viewport() {
    return { w: this.scroller.clientWidth, h: this.scroller.clientHeight };
  }

  layout() {
    const z = this.zoom;
    const { w: vw, h: vh } = this._viewport();
    const n = this.pages.length;
    this.pos = new Array(n);
    const mode = this.layoutMode;
    const gap = this.gap, m = this.margin;
    let rows = [];
    if (mode === "double" || mode === "cover") {
      let i = 0;
      if (mode === "cover" && n) rows.push([0]), (i = 1);
      for (; i < n; i += 2) rows.push(i + 1 < n ? [i, i + 1] : [i]);
    } else {
      rows = this.pages.map((_, i) => [i]);
    }
    let contentW = 0;
    for (const r of rows) {
      const rw = r.reduce((s, i) => s + this.pages[i].width * z, 0) + gap * (r.length - 1);
      contentW = Math.max(contentW, rw);
    }
    const totalW = Math.max(vw, contentW + 2 * m);
    let y = m;
    rows.forEach((r, rowIndex) => {
      const hs = r.map((i) => this.pages[i].height * z);
      const rh = Math.max(...hs);
      const rw = r.reduce((s, i) => s + this.pages[i].width * z, 0) + gap * (r.length - 1);
      let x = (totalW - rw) / 2;
      r.forEach((i, k) => {
        const w = this.pages[i].width * z, h = hs[k];
        this.pos[i] = { x, y: y + (rh - h) / 2, w, h, row: rowIndex };
        x += w + gap;
      });
      y += rh + gap;
    });
    let totalH = y - gap + m;
    if (mode === "single") {
      // Tek sayfa: yalnızca geçerli sayfa görünür, dikey olarak ortalanır
      this.pages.forEach((p, i) => {
        const w = p.width * z, h = p.height * z;
        this.pos[i] = { x: (totalW - w) / 2, y: Math.max(m, (vh - h) / 2), w, h, row: i };
      });
      const cur = this.pos[this.current] || { h: 0 };
      totalH = Math.max(vh, cur.h + 2 * m);
    }
    this.container.style.width = totalW + "px";
    this.container.style.height = totalH + "px";
    this.els.forEach((el, i) => {
      const p = this.pos[i];
      el.div.style.transform = `translate(${p.x}px, ${p.y}px)`;
      el.div.style.width = p.w + "px";
      el.div.style.height = p.h + "px";
      el.div.hidden = mode === "single" && i !== this.current;
      el.canvas.style.width = p.w + "px";
      el.canvas.style.height = p.h + "px";
      el.detail.hidden = true;
      el.detailKey = "";
    });
    this._schedule();
  }

  setLayout(mode) {
    const anchor = this._anchor();
    this.layoutMode = mode;
    settings.layout = mode;
    if (this.fitMode) this._applyFit(true);
    this.layout();
    this._restoreAnchor(anchor);
  }

  // --------------------------------------------------------- yakınlaştırma
  _applyFit(silent = false) {
    if (!this.pages.length) return;
    const { w: vw, h: vh } = this._viewport();
    const ref = this.pages[this.current] || this.pages[0];
    const perRow = this.layoutMode === "double" || this.layoutMode === "cover" ? 2 : 1;
    const maxW = Math.max(...this.pages.map((p) => p.width)) * perRow + this.gap * (perRow - 1);
    let z;
    if (this.fitMode === "page") z = Math.min((vw - 2 * this.margin) / (ref.width * perRow + this.gap * (perRow - 1)), (vh - 2 * this.margin) / ref.height);
    else z = (vw - 2 * this.margin) / maxW;
    this.zoom = clamp(z, MIN_ZOOM, MAX_ZOOM);
    if (!silent) this.app.onZoom?.(this.zoom);
  }

  fit(mode) {
    const anchorPage = this.current;
    this.fitMode = mode;
    this._applyFit();
    this.layout();
    this.scrollToPage(anchorPage, { smooth: false });
  }

  /** Yakınlaştırmayı değiştirir; anchor (istemci koordinatı) altındaki nokta yerinde kalır. */
  setZoom(z, anchor = null) {
    z = clamp(z, MIN_ZOOM, MAX_ZOOM);
    if (!this.pages.length || Math.abs(z - this.zoom) < 1e-4) return;
    const rect = this.scroller.getBoundingClientRect();
    const a = anchor || { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const hit = this.clientToPage(a.x, a.y, true);
    this.fitMode = null;
    this.zoom = z;
    this.layout();
    if (hit) this._placePoint(hit.pno, hit.pt, a.x, a.y);
    this.app.onZoom?.(this.zoom);
  }

  zoomBy(f, anchor) {
    this.setZoom(this.zoom * f, anchor);
  }

  _placePoint(pno, pt, cx, cy) {
    const rect = this.scroller.getBoundingClientRect();
    const p = this.pos[pno];
    const x = p.x + pt[0] * this.zoom;
    const y = p.y + pt[1] * this.zoom;
    this.scroller.scrollLeft = x - (cx - rect.left);
    this.scroller.scrollTop = y - (cy - rect.top);
  }

  _anchor() {
    if (!this.pages.length) return null;
    const rect = this.scroller.getBoundingClientRect();
    const hit = this.clientToPage(rect.left + rect.width / 2, rect.top + 1, true);
    return hit ? { ...hit, cx: rect.left + rect.width / 2, cy: rect.top + 1 } : null;
  }

  _restoreAnchor(a) {
    if (!a || a.pno >= this.pages.length) return;
    this._placePoint(a.pno, a.pt, a.cx, a.cy);
  }

  _onResize() {
    if (!this.pages.length) return;
    const anchor = this._anchor();
    if (this.fitMode) this._applyFit();
    this.layout();
    this._restoreAnchor(anchor);
  }

  _onWheel(e) {
    if (!this.pages.length) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      this.zoomBy(Math.exp(-e.deltaY * 0.0022), { x: e.clientX, y: e.clientY });
    } else if (this.layoutMode === "single") {
      const atEnd = this.scroller.scrollTop + this.scroller.clientHeight >= this.scroller.scrollHeight - 2;
      const atTop = this.scroller.scrollTop <= 0;
      if (e.deltaY > 30 && atEnd) { e.preventDefault(); this.goto(this.current + 1); }
      else if (e.deltaY < -30 && atTop) { e.preventDefault(); this.goto(this.current - 1); }
    }
  }

  // ---------------------------------------------------- iki parmak hareketi
  _setupPinch() {
    const el = this.scroller;
    let st = null;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    el.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2 && this.pages.length) {
        e.preventDefault();
        this.app.cancelGesture?.();
        const c = mid(e.touches);
        const rect = this.scroller.getBoundingClientRect();
        st = {
          d0: dist(e.touches), c0: c, z0: this.zoom, hit: this.clientToPage(c.x, c.y, true),
          ox: el.scrollLeft + (c.x - rect.left), oy: el.scrollTop + (c.y - rect.top), scale: 1, dx: 0, dy: 0,
        };
        this.container.style.transformOrigin = `${st.ox}px ${st.oy}px`;
      }
    }, { passive: false });
    el.addEventListener("touchmove", (e) => {
      if (this.app.gestureLock && e.touches.length === 1) {
        e.preventDefault();
        return;
      }
      if (!st || e.touches.length !== 2) return;
      e.preventDefault();
      const c = mid(e.touches);
      st.scale = clamp(st.z0 * (dist(e.touches) / st.d0), MIN_ZOOM, MAX_ZOOM) / st.z0;
      st.dx = c.x - st.c0.x;
      st.dy = c.y - st.c0.y;
      st.c = c;
      this.container.style.transform = `translate(${st.dx}px, ${st.dy}px) scale(${st.scale})`;
      this.app.onZoom?.(st.z0 * st.scale, true);
    }, { passive: false });
    const end = (e) => {
      if (!st || e.touches.length >= 2) return;
      const s = st;
      st = null;
      this.container.style.transform = "";
      this.container.style.transformOrigin = "";
      const c = s.c || s.c0;
      if (Math.abs(s.scale - 1) > 0.01 && s.hit) {
        this.fitMode = null;
        this.zoom = clamp(s.z0 * s.scale, MIN_ZOOM, MAX_ZOOM);
        this.layout();
        this._placePoint(s.hit.pno, s.hit.pt, c.x, c.y);
        this.app.onZoom?.(this.zoom);
      } else {
        this.scroller.scrollLeft -= s.dx;
        this.scroller.scrollTop -= s.dy;
      }
    };
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
  }

  // ------------------------------------------------------- koordinatlar
  /** İstemci koordinatını sayfa noktasına çevirir. nearest: sayfa dışındaysa en yakın sayfa. */
  clientToPage(cx, cy, nearest = false) {
    if (!this.pages.length) return null;
    const rect = this.scroller.getBoundingClientRect();
    const x = cx - rect.left + this.scroller.scrollLeft;
    const y = cy - rect.top + this.scroller.scrollTop;
    let best = null, bestD = Infinity;
    for (let i = 0; i < this.pos.length; i++) {
      if (this.layoutMode === "single" && i !== this.current) continue;
      const p = this.pos[i];
      const dx = x < p.x ? p.x - x : x > p.x + p.w ? x - p.x - p.w : 0;
      const dy = y < p.y ? p.y - y : y > p.y + p.h ? y - p.y - p.h : 0;
      const d = dx + dy;
      if (d === 0) return { pno: i, pt: [(x - p.x) / this.zoom, (y - p.y) / this.zoom], inside: true };
      if (d < bestD) { bestD = d; best = i; }
    }
    if (!nearest || best === null) return null;
    const p = this.pos[best];
    const px = clamp(x - p.x, 0, p.w), py = clamp(y - p.y, 0, p.h);
    return { pno: best, pt: [px / this.zoom, py / this.zoom], inside: false };
  }

  pageToClient(pno, pt) {
    const rect = this.scroller.getBoundingClientRect();
    const p = this.pos[pno];
    return { x: rect.left + p.x + pt[0] * this.zoom - this.scroller.scrollLeft, y: rect.top + p.y + pt[1] * this.zoom - this.scroller.scrollTop };
  }

  // ---------------------------------------------------------- gezinme
  goto(pno, opts) {
    if (!this.pages.length) return;
    pno = clamp(pno, 0, this.pages.length - 1);
    this.scrollToPage(pno, opts);
  }

  scrollToPage(pno, { smooth = false, y = null } = {}) {
    if (!this.pos[pno]) return;
    if (this.layoutMode === "single" && pno !== this.current) {
      this.current = pno;
      this.layout();
      this.app.onPageChange?.(pno);
    }
    const p = this.pos[pno];
    const top = y === null ? p.y - this.margin : p.y + y * this.zoom - this.scroller.clientHeight / 3;
    this.scroller.scrollTo({ top, left: this.scroller.scrollLeft, behavior: smooth ? "smooth" : "auto" });
    if (this.layoutMode !== "single") this._setCurrent(pno);
  }

  /** Sayfadaki bir dikdörtgeni görünür alana getirir (arama sonucu vb.). */
  revealRect(pno, r) {
    if (!this.pos[pno]) return;
    if (this.layoutMode === "single" && pno !== this.current) {
      this.current = pno;
      this.layout();
      this.app.onPageChange?.(pno);
    }
    const p = this.pos[pno];
    const z = this.zoom;
    const vw = this.scroller.clientWidth, vh = this.scroller.clientHeight;
    const cx = p.x + ((r[0] + r[2]) / 2) * z, cy = p.y + ((r[1] + r[3]) / 2) * z;
    const sl = this.scroller.scrollLeft, stp = this.scroller.scrollTop;
    const inView = cx > sl + 20 && cx < sl + vw - 20 && cy > stp + 40 && cy < stp + vh - 80;
    if (!inView) this.scroller.scrollTo({ left: cx - vw / 2, top: cy - vh / 2.5 });
  }

  _setCurrent(pno) {
    if (pno !== this.current) {
      this.current = pno;
      this.app.onPageChange?.(pno);
    }
  }

  _updateCurrent() {
    if (this.layoutMode === "single" || !this.pos.length) return;
    const top = this.scroller.scrollTop, h = this.scroller.clientHeight;
    const probe = top + h * 0.35;
    let best = this.current, bestD = Infinity;
    for (let i = 0; i < this.pos.length; i++) {
      const p = this.pos[i];
      const d = probe < p.y ? p.y - probe : probe > p.y + p.h ? probe - p.y - p.h : 0;
      if (d < bestD) { bestD = d; best = i; }
      if (p.y > probe + h) break;
    }
    this._setCurrent(best);
  }

  // ----------------------------------------------------------- görüntüleme
  _schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._updateCurrent();
      this._pump();
    });
  }

  _visible() {
    const top = this.scroller.scrollTop, left = this.scroller.scrollLeft;
    const vw = this.scroller.clientWidth, vh = this.scroller.clientHeight;
    const out = [];
    for (let i = 0; i < this.pos.length; i++) {
      if (this.layoutMode === "single" && i !== this.current) continue;
      const p = this.pos[i];
      if (p.y + p.h < top - vh * 0.5 || p.y > top + vh * 1.5) continue;
      if (p.x + p.w < left - vw || p.x > left + vw * 2) continue;
      const visTop = Math.max(p.y, top), visBot = Math.min(p.y + p.h, top + vh);
      const visible = visBot > visTop;
      const d = visible ? 0 : Math.min(Math.abs(p.y - (top + vh)), Math.abs(p.y + p.h - top));
      out.push({ i, visible, d });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  _baseScale(i) {
    const p = this.pages[i];
    const want = this.zoom * this.dpr;
    const cap = Math.sqrt(MAX_BASE_PIXELS / (p.width * p.height));
    return Math.min(want, cap);
  }

  _nextJob() {
    for (const { i, visible } of this._visible()) {
      const el = this.els[i];
      const base = this._baseScale(i);
      if (el.ver !== this.versions[i] || Math.abs(el.scale - base) / base > 0.08) return { kind: "base", i, scale: base };
      if (visible && base < this.zoom * this.dpr * 0.95) {
        const clip = this._visibleClip(i);
        if (clip) {
          const key = `${this.versions[i]}:${this.zoom.toFixed(4)}:${clip.map((v) => Math.round(v)).join(",")}`;
          if (el.detailKey !== key) return { kind: "detail", i, scale: this.zoom * this.dpr, clip, key };
        }
      }
    }
    return null;
  }

  _visibleClip(i) {
    const p = this.pos[i];
    const z = this.zoom;
    const top = this.scroller.scrollTop, left = this.scroller.scrollLeft;
    const vw = this.scroller.clientWidth, vh = this.scroller.clientHeight;
    const x0 = Math.max(0, (left - p.x) / z), y0 = Math.max(0, (top - p.y) / z);
    const x1 = Math.min(this.pages[i].width, (left + vw - p.x) / z), y1 = Math.min(this.pages[i].height, (top + vh - p.y) / z);
    if (x1 <= x0 || y1 <= y0) return null;
    // biraz pay bırak: küçük kaydırmalarda yeniden çizmeye gerek kalmasın
    const px = (x1 - x0) * 0.15, py = (y1 - y0) * 0.15;
    return [Math.max(0, x0 - px), Math.max(0, y0 - py), Math.min(this.pages[i].width, x1 + px), Math.min(this.pages[i].height, y1 + py)];
  }

  async _pump() {
    this._release();
    if (this.busy || !this.pages.length) return;
    const job = this._nextJob();
    if (!job) return;
    this.busy = true;
    const token = this.token;
    const ver = this.versions[job.i];
    try {
      const img = await this.engine.call("render", job.i, job.scale, job.kind === "detail" ? job.clip : null);
      if (token !== this.token || !this.els[job.i] || !img.width) return;
      const el = this.els[job.i];
      const target = job.kind === "detail" ? el.detail : el.canvas;
      target.width = img.width;
      target.height = img.height;
      target.getContext("2d").putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
      if (job.kind === "detail") {
        const z = this.zoom;
        target.style.left = (img.bbox[0] / job.scale) * z + "px";
        target.style.top = (img.bbox[1] / job.scale) * z + "px";
        target.style.width = (img.width / job.scale) * z + "px";
        target.style.height = (img.height / job.scale) * z + "px";
        target.hidden = false;
        el.detailKey = job.key;
      } else {
        el.scale = job.scale;
        el.ver = ver;
        el.detail.hidden = true;
        el.detailKey = "";
      }
    } catch (e) {
      if (e.code !== "no-doc" && e.code !== "page") console.warn("render:", e);
      if (this.els[job.i]) this.els[job.i].ver = ver; // sonsuz döngüye girme
    } finally {
      this.busy = false;
      if (token === this.token) this._schedule();
    }
  }

  /** Uzaktaki sayfaların görüntü belleğini bırak. */
  _release() {
    const top = this.scroller.scrollTop, vh = this.scroller.clientHeight;
    for (let i = 0; i < this.els.length; i++) {
      const p = this.pos[i], el = this.els[i];
      if (!p || !el.canvas.width) continue;
      if (p.y + p.h < top - vh * KEEP_SCREENS || p.y > top + vh * (KEEP_SCREENS + 1)) {
        el.canvas.width = el.canvas.height = 0;
        el.detail.width = el.detail.height = 0;
        el.detail.hidden = true;
        el.scale = 0;
        el.detailKey = "";
      }
    }
  }

  // --------------------------------------------------------------- kaplama
  updateOverlay(pno) {
    const el = this.els[pno];
    if (!el) return;
    el.svg.innerHTML = this.app.overlayMarkup(pno, this.zoom);
  }

  updateOverlays() {
    for (let i = 0; i < this.els.length; i++) this.updateOverlay(i);
  }
}

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
