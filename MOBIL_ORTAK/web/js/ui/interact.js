// Sayfa üzerindeki dokunma / kalem / fare etkileşimleri: her aracın hareketi,
// metin seçimi, nesne taşıma-boyutlandırma, çift dokunuşla yakınlaştırma.
// Masaüstündeki ui/pageview.py fare olaylarının karşılığı.

import { toast } from "./ui.js";
import { settings } from "./store.js";
import { T, RECT_TOOLS, LINE_TOOLS, MARKUP_TOOLS, TAP_SIZES } from "./tools.js";
import { cssColorOf } from "./colors.js";
import { t, errText } from "../i18n.js";

const TAP_SLOP = 8; // px
const LONG_PRESS = 450; // ms
const DOUBLE_TAP = 300; // ms

export class Interaction {
  constructor(app) {
    this.app = app;
    this.viewer = app.viewer;
    this.pointers = new Map();
    this.g = null; // etkin hareket
    this.poly = null; // { pno, pts }
    this.liveRect = null;
    this.lastTap = null;
    const el = this.viewer.container;
    el.addEventListener("pointerdown", (e) => this.down(e));
    el.addEventListener("pointermove", (e) => this.move(e));
    el.addEventListener("pointerup", (e) => this.up(e));
    el.addEventListener("pointercancel", (e) => this.cancelPointer(e));
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (e.pointerType === "touch" || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) return;
      const hit = this.viewer.clientToPage(e.clientX, e.clientY);
      if (hit) this.app.commands.pageContextMenu(hit, e.clientX, e.clientY);
    });
  }

  // ---------------------------------------------------------------- yardımcı
  hitAt(e, nearest = false) {
    return this.viewer.clientToPage(e.clientX, e.clientY, nearest);
  }

  /** Hareketin başladığı sayfada, sayfa sınırlarına kıstırılmış nokta */
  ptOn(pno, e) {
    const p = this.viewer.pos[pno];
    const rect = this.viewer.scroller.getBoundingClientRect();
    const z = this.viewer.zoom;
    const x = (e.clientX - rect.left + this.viewer.scroller.scrollLeft - p.x) / z;
    const y = (e.clientY - rect.top + this.viewer.scroller.scrollTop - p.y) / z;
    const pg = this.viewer.pages[pno];
    return [Math.max(0, Math.min(pg.width, x)), Math.max(0, Math.min(pg.height, y))];
  }

  cancel() {
    if (this.g && this.g.timer) clearTimeout(this.g.timer);
    if (this.g && this.g.draft) this.app.setDraft(null, null);
    this.g = null;
    this.liveRect = null;
    this.app.gestureLock = false;
  }

  cancelPointer(e) {
    this.pointers.delete(e.pointerId);
    if (this.g && this.g.id === e.pointerId) this.cancel();
  }

  // ----------------------------------------------------------------- basma
  down(e) {
    if (!this.app.isOpen || e.button > 0) return;
    this.pointers.set(e.pointerId, e.pointerType);
    const touches = [...this.pointers.values()].filter((pt) => pt === "touch").length;
    if (e.pointerType === "touch" && touches > 1) {
      // İkinci parmak: yakınlaştırma/kaydırma görüntüleyicide; araç hareketini bırak
      if (this.g && this.g.kind === "ink" && this.g.pts.length < 4) this.cancel();
      else if (this.g && this.g.kind !== "ink") this.cancel();
      return;
    }
    const hit = this.hitAt(e);
    const tool = this.app.tool;
    const base = { id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, moved: false, hit, t0: performance.now() };

    // Seçili nesne üzerinde: taşı / boyutlandır
    const obj = this.app.objSel;
    if (obj && hit && hit.pno === obj.pno) {
      const handle = this.handleAt(obj, hit.pt);
      if (handle >= 0 || contains(obj.rect, hit.pt, 2 / this.viewer.zoom)) {
        e.preventDefault();
        this.capture(e);
        this.g = { ...base, kind: handle >= 0 ? "resize" : "move", handle, pno: obj.pno, start: hit.pt, rect0: obj.rect.slice() };
        return;
      }
    }

    if (tool === T.PAN || (tool === T.SELECT && e.pointerType === "touch" && !hit)) {
      if (e.pointerType === "mouse") {
        this.capture(e);
        this.g = { ...base, kind: "scroll", sl: this.viewer.scroller.scrollLeft, st: this.viewer.scroller.scrollTop };
      } else {
        this.g = { ...base, kind: "tap" };
      }
      return;
    }
    if (!hit) {
      this.app.clearSelection();
      this.app.clearObject();
      return;
    }
    const pno = hit.pno;

    if (tool === T.SELECT) {
      if (e.pointerType === "touch") {
        this.g = { ...base, kind: "tap", pno };
        this.g.timer = setTimeout(() => this.longPress(), LONG_PRESS);
      } else {
        this.capture(e);
        this.g = { ...base, kind: "select-text", pno, p0: hit.pt, armed: true };
      }
      return;
    }
    if (MARKUP_TOOLS.has(tool)) {
      e.preventDefault();
      this.capture(e);
      this.g = { ...base, kind: "select-text", pno, p0: hit.pt, markup: tool, armed: true };
      return;
    }
    if (tool === T.INK) {
      e.preventDefault();
      this.capture(e);
      this.g = { ...base, kind: "ink", pno, pts: [hit.pt], draft: true };
      this.drawInk();
      return;
    }
    if (RECT_TOOLS.has(tool)) {
      e.preventDefault();
      this.capture(e);
      this.g = { ...base, kind: "rect", pno, p0: hit.pt, p1: hit.pt, draft: true };
      return;
    }
    if (LINE_TOOLS.has(tool)) {
      e.preventDefault();
      this.capture(e);
      this.g = { ...base, kind: "line", pno, p0: hit.pt, p1: hit.pt, draft: true };
      return;
    }
    // Dokunma araçları (not, silgi, metni düzenle, çokgen)
    if (tool === T.POLYGON) e.preventDefault();
    this.g = { ...base, kind: "tap", pno };
  }

  capture(e) {
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch { /* yok say */ }
  }

  handleAt(obj, pt) {
    if (obj.resizable === false) return -1;
    const r = obj.rect;
    const tol = 16 / this.viewer.zoom;
    const corners = [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]];
    return corners.findIndex(([x, y]) => Math.abs(pt[0] - x) <= tol && Math.abs(pt[1] - y) <= tol);
  }

  // -------------------------------------------------------------- basılı tut
  async longPress() {
    const g = this.g;
    if (!g || g.moved || g.kind !== "tap") return;
    g.timer = null;
    navigator.vibrate?.(12);
    const sel = await this.app.engine.call("selection", g.pno, g.hit.pt, g.hit.pt);
    if (this.g !== g) return;
    if (!sel.rects.length) {
      // metin yok: sayfa menüsü
      this.g = null;
      this.app.commands.pageContextMenu(g.hit, g.x0, g.y0);
      return;
    }
    this.app.gestureLock = true;
    this.g = { ...g, kind: "select-text", p0: g.hit.pt, armed: true };
    this.app.setSelection({ pno: g.pno, ...sel });
  }

  // ------------------------------------------------------------------ hareket
  move(e) {
    const g = this.g;
    if (this.app.tool === T.TEXT_EDIT && e.pointerType === "mouse" && !g) this.hover(e);
    if (!g || g.id !== e.pointerId) return;
    if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > TAP_SLOP) {
      g.moved = true;
      if (g.timer) { clearTimeout(g.timer); g.timer = null; }
    }
    switch (g.kind) {
      case "scroll":
        this.viewer.scroller.scrollLeft = g.sl - (e.clientX - g.x0);
        this.viewer.scroller.scrollTop = g.st - (e.clientY - g.y0);
        break;
      case "select-text":
        if (g.moved || this.app.gestureLock) this.updateSelection(g, this.ptOn(g.pno, e));
        break;
      case "ink":
        e.preventDefault();
        for (const ce of e.getCoalescedEvents ? e.getCoalescedEvents() : [e]) g.pts.push(this.ptOn(g.pno, ce));
        this.drawInk();
        break;
      case "rect":
        g.p1 = this.ptOn(g.pno, e);
        this.drawRect(g);
        break;
      case "line":
        g.p1 = this.ptOn(g.pno, e);
        this.drawLine(g);
        break;
      case "move":
      case "resize":
        this.updateObjectDrag(g, this.ptOn(g.pno, e));
        break;
    }
  }

  hover(e) {
    const hit = this.hitAt(e);
    const blocks = hit && this.app.blocks.get(hit.pno);
    let found = null;
    if (Array.isArray(blocks)) found = blocks.find((b) => contains(b.bbox, hit.pt)) || null;
    if (found !== this.app.hoverBlock) {
      this.app.hoverBlock = found;
      if (hit) this.viewer.updateOverlay(hit.pno);
    }
  }

  updateSelection(g, pt) {
    g.p1 = pt;
    if (g.pending) { g.again = true; return; }
    g.pending = true;
    this.app.engine.call("selection", g.pno, g.p0, pt).then((sel) => {
      g.pending = false;
      if (this.g !== g && !g.finishing) return;
      g.sel = sel;
      this.app.setSelection({ pno: g.pno, ...sel });
      if (g.again) { g.again = false; this.updateSelection(g, g.p1); }
    });
  }

  updateObjectDrag(g, pt) {
    const dx = pt[0] - g.start[0], dy = pt[1] - g.start[1];
    const r = g.rect0.slice();
    if (g.kind === "move") {
      this.liveRect = [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy];
    } else {
      const ix = g.handle % 2 === 0 ? 0 : 2, iy = g.handle < 2 ? 1 : 3;
      r[ix] += dx;
      r[iy] += dy;
      if (this.app.objSel.keepAspect) {
        const w0 = g.rect0[2] - g.rect0[0], h0 = g.rect0[3] - g.rect0[1];
        const w = Math.abs(r[2] - r[0]);
        const hgt = (w * h0) / w0;
        if (iy === 1) r[1] = r[3] - hgt; else r[3] = r[1] + hgt;
      }
      this.liveRect = [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])];
    }
    this.viewer.updateOverlay(g.pno);
  }

  // ------------------------------------------------------------- taslaklar
  drawInk() {
    const g = this.g;
    const st = settings.tool;
    const d = g.pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
    this.app.setDraft(g.pno, `<path class="ink" d="${d}" stroke="${cssColorOf(st.color)}" stroke-width="${st.width}" stroke-opacity="${st.opacity}"/>`);
  }

  drawRect(g) {
    const [x0, y0] = g.p0, [x1, y1] = g.p1;
    const r = [Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)];
    const tool = this.app.tool;
    const st = settings.tool;
    let m;
    if (tool === T.RECT || tool === T.ELLIPSE) {
      const fill = st.fill ? cssColorOf(st.fill) : "none";
      const common = `fill="${fill}" stroke="${cssColorOf(st.color)}" stroke-width="${st.width}" opacity="${st.opacity}"`;
      m = tool === T.RECT
        ? `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" ${common}/>`
        : `<ellipse cx="${r[0] + r[2] / 2}" cy="${r[1] + r[3] / 2}" rx="${r[2] / 2}" ry="${r[3] / 2}" ${common}/>`;
    } else if (tool === T.CROP) {
      m = `<rect class="crop-mark" x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}"/>`;
    } else if (tool === T.REDACT) {
      m = `<rect class="redact-mark" x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}"/>`;
    } else {
      m = `<rect class="draft-fill" x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}"/>`;
    }
    this.app.setDraft(g.pno, m);
  }

  drawLine(g) {
    const tool = this.app.tool;
    const st = settings.tool;
    const [a, b] = [g.p0, g.p1];
    if (tool === T.MEASURE) {
      this.app.measure = { pno: g.pno, p0: a, p1: b };
      this.app.setDraft(g.pno, null);
      this.app.updateFloat();
      return;
    }
    let m = `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${cssColorOf(st.color)}" stroke-width="${st.width}" opacity="${st.opacity}" stroke-linecap="round"/>`;
    if (tool === T.ARROW) {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const L = Math.max(8, st.width * 4);
      const p1 = [b[0] - L * Math.cos(ang - 0.45), b[1] - L * Math.sin(ang - 0.45)];
      const p2 = [b[0] - L * Math.cos(ang + 0.45), b[1] - L * Math.sin(ang + 0.45)];
      m += `<path d="M${p1[0]} ${p1[1]}L${b[0]} ${b[1]}L${p2[0]} ${p2[1]}" fill="none" stroke="${cssColorOf(st.color)}" stroke-width="${st.width}" opacity="${st.opacity}"/>`;
    }
    this.app.setDraft(g.pno, m);
  }

  drawPolygon() {
    const p = this.poly;
    if (!p) return;
    const st = settings.tool;
    const d = p.pts.map((q, i) => (i ? "L" : "M") + q[0] + " " + q[1]).join("");
    const dots = p.pts.map((q) => `<circle cx="${q[0]}" cy="${q[1]}" r="${4 / this.viewer.zoom}" fill="${cssColorOf(st.color)}"/>`).join("");
    this.app.setDraft(p.pno, `<path d="${d}${settings.tool.polygonClosed && p.pts.length > 2 ? "Z" : ""}" fill="none" stroke="${cssColorOf(st.color)}" stroke-width="${st.width}"/>${dots}`);
  }

  async finishPolygon(commit) {
    const p = this.poly;
    this.poly = null;
    this.app.setDraft(null, null);
    this.app.updateFloat();
    if (!commit || !p || p.pts.length < 2) return;
    const st = settings.tool;
    await this.app.commands.act(() => this.app.engine.call("addPolygon", p.pno, p.pts, {
      closed: st.polygonClosed, color: st.color, fill: st.polygonClosed ? st.fill : null, width: st.width, opacity: st.opacity, author: settings.author,
    }));
  }

  // -------------------------------------------------------------------- bırakma
  async up(e) {
    this.pointers.delete(e.pointerId);
    const g = this.g;
    if (!g || g.id !== e.pointerId) return;
    if (g.timer) clearTimeout(g.timer);
    this.g = null;
    const app = this.app;
    const cmds = app.commands;
    try {
      switch (g.kind) {
        case "tap":
          if (!g.moved) await this.tap(g, e);
          break;
        case "scroll":
          break;
        case "select-text": {
          app.gestureLock = false;
          if (!g.moved && !g.markup) {
            await this.tap(g, e);
            break;
          }
          g.finishing = true;
          const sel = await app.engine.call("selection", g.pno, g.p0, this.ptOn(g.pno, e));
          if (g.markup) {
            app.clearSelection();
            if (sel.quads.length) await cmds.addMarkup(g.markup, g.pno, sel.quads);
          } else {
            app.setSelection({ pno: g.pno, ...sel });
          }
          break;
        }
        case "ink": {
          app.setDraft(null, null);
          if (g.pts.length > 1) {
            const st = settings.tool;
            await cmds.act(() => app.engine.call("addInk", g.pno, [simplify(g.pts, 0.35 / this.viewer.zoom)], { color: st.color, width: st.width, opacity: st.opacity, author: settings.author }));
          }
          break;
        }
        case "rect": {
          app.setDraft(null, null);
          let [x0, y0] = g.p0, [x1, y1] = g.p1;
          let r = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
          const tool = app.tool;
          if (r[2] - r[0] < 4 || r[3] - r[1] < 4) {
            const size = TAP_SIZES[tool];
            if (!size) {
              toast("Alanı parmağınızı sürükleyerek çizin");
              break;
            }
            const pg = this.viewer.pages[g.pno];
            const cx = g.p0[0], cy = g.p0[1];
            r = [cx - size[0] / 2, cy - size[1] / 2, cx + size[0] / 2, cy + size[1] / 2];
            const dx = Math.max(0, -r[0]) - Math.max(0, r[2] - pg.width);
            const dy = Math.max(0, -r[1]) - Math.max(0, r[3] - pg.height);
            r = [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy];
          }
          await cmds.handleRectTool(tool, g.pno, r);
          break;
        }
        case "line": {
          app.setDraft(null, null);
          if (Math.hypot(g.p1[0] - g.p0[0], g.p1[1] - g.p0[1]) < 3) break;
          if (app.tool !== T.MEASURE) await cmds.handleLineTool(app.tool, g.pno, g.p0, g.p1);
          break;
        }
        case "move":
        case "resize": {
          const r = this.liveRect;
          this.liveRect = null;
          if (!g.moved || !r) {
            this.viewer.updateOverlay(g.pno);
            break;
          }
          await cmds.commitObjectRect(r, g.kind);
          break;
        }
      }
    } catch (err) {
      toast(errText(err), { error: true });
    }
  }

  async tap(g, e) {
    const app = this.app;
    const hit = g.hit;
    const now = performance.now();
    const tool = app.tool;
    // Çift dokunuş: yakınlaştır / sığdır
    if ((tool === T.SELECT || tool === T.PAN) && this.lastTap && now - this.lastTap.t < DOUBLE_TAP && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 30) {
      this.lastTap = null;
      clearTimeout(this._tapTimer);
      const v = this.viewer;
      if (v.fitMode === "width" || v.zoom < 1.5) v.setZoom(Math.max(2, v.zoom * 2.2), { x: e.clientX, y: e.clientY });
      else v.fit("width");
      return;
    }
    this.lastTap = { t: now, x: e.clientX, y: e.clientY };
    if (!hit) return;
    const pno = hit.pno;
    const cmds = app.commands;
    switch (tool) {
      case T.SELECT:
        await cmds.selectAt(pno, hit.pt, e);
        break;
      case T.PAN:
        await cmds.followLinkAt(pno, hit.pt);
        break;
      case T.NOTE:
        await cmds.addNote(pno, hit.pt);
        break;
      case T.ERASER:
        await cmds.eraseAt(pno, hit.pt);
        break;
      case T.TEXT_EDIT:
        await cmds.editTextAt(pno, hit.pt);
        break;
      case T.POLYGON:
        if (!this.poly || this.poly.pno !== pno) this.poly = { pno, pts: [] };
        this.poly.pts.push(hit.pt);
        this.drawPolygon();
        app.updateFloat();
        break;
    }
  }
}

function contains(r, p, tol = 0) {
  return p[0] >= r[0] - tol && p[0] <= r[2] + tol && p[1] >= r[1] - tol && p[1] <= r[3] + tol;
}

/** Ramer–Douglas–Peucker: kalem çizgisindeki gereksiz noktaları at. */
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = -1, dmax = 0;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}
