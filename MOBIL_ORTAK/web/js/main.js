// Uygulama girişi: motoru başlatır, arayüzü kurar, yerel köprüyü ve klavye
// kısayollarını bağlar.

import { EngineClient } from "./rpc.js";
import { Bridge } from "./bridge.js";
import { App } from "./ui/app.js";
import { Commands } from "./ui/commands.js";
import { Interaction } from "./ui/interact.js";
import { FontStore } from "./ui/fontstore.js";
import { toast, sheetOpen, closeTopSheet, closeContextMenu } from "./ui/ui.js";
import { TOOL_KEYS, T } from "./ui/tools.js";
import { appName } from "./branding.js";

async function boot() {
  document.title = appName();
  const engine = new EngineClient();
  const bridge = new Bridge();
  await engine.start();

  const app = new App(engine, bridge);
  app.commands = new Commands(app);
  app.interact = new Interaction(app);
  app.fontStore = new FontStore(app);
  app.fontFamilies = ["Helvetica", "Times", "Courier"];
  app.refreshFonts = async () => {
    app.fontFamilies = await engine.call("fontFamilies");
  };
  await app.init();
  await app.fontStore.load();

  // ------------------------------------------------------ yerel köprü olayları
  bridge.on("openFile", async (msg) => {
    try {
      const f = await bridge.fetchFile(msg.file);
      await app.openFile(f);
    } catch (e) {
      toast("Dosya açılamadı: " + e.message, { error: true });
    }
  });
  bridge.on("back", () => bridge.backResult(app.handleBack()));
  bridge.on("save", () => app.save()); // uygulama arka plana giderken hatırlatma vb.
  bridge.ready();

  setupKeyboard(app);
  setupDragDrop(app);
  window.PDFStudioApp = app; // hata ayıklama için
}

// ------------------------------------------------------------------ klavye
function setupKeyboard(app) {
  const C = (id) => app.commands.run(id);
  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    if (e.key === "Escape") {
      closeContextMenu();
      if (sheetOpen()) closeTopSheet();
      else if (app._focus) C("fullscreen");
      else app.handleBack();
      e.preventDefault();
      return;
    }
    if (sheetOpen() && !mod) return;
    if (mod) {
      const map = {
        o: "open", s: e.shiftKey ? "save_as" : "save", z: e.shiftKey ? "redo" : "undo", y: "redo", f: "find", h: "find_replace",
        p: "print", w: "close", c: typing ? null : "copy", "=": "zoom_in", "+": "zoom_in", "-": "zoom_out", 0: "zoom_100", 1: "fit_width", 2: "fit_page",
      };
      if (e.shiftKey && k === "r") { e.preventDefault(); C("apply_redactions"); return; }
      if (e.shiftKey && k === "p") { e.preventDefault(); C("print_area"); return; }
      if (e.shiftKey && e.key === "ArrowLeft") { e.preventDefault(); C("rot_left"); return; }
      if (e.shiftKey && e.key === "ArrowRight") { e.preventDefault(); C("rot_right"); return; }
      const id = map[k];
      if (id) { e.preventDefault(); C(id); }
      return;
    }
    if (typing) return;
    if (e.key === "F3") { e.preventDefault(); C(e.shiftKey ? "find_prev" : "find_next"); return; }
    if (e.key === "F9") { e.preventDefault(); C("sidebar"); return; }
    if (e.key === "F10") { e.preventDefault(); C("inspector"); return; }
    if (e.key === "F11") { e.preventDefault(); C("fullscreen"); return; }
    if (!app.isOpen) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      if (app.objSel) { e.preventDefault(); app.commands.deleteSelectedObject(); }
      return;
    }
    if (e.key.startsWith("Arrow") && app.objSel) {
      e.preventDefault();
      const step = e.shiftKey ? 0.5 : 4;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      app.commands.nudgeObject(...d);
      return;
    }
    if (e.key === "PageDown" || (e.key === "ArrowRight" && app.viewer.layoutMode === "single")) { e.preventDefault(); app.viewer.goto(app.viewer.current + 1); return; }
    if (e.key === "PageUp" || (e.key === "ArrowLeft" && app.viewer.layoutMode === "single")) { e.preventDefault(); app.viewer.goto(app.viewer.current - 1); return; }
    if (e.key === "Home") { app.viewer.goto(0); return; }
    if (e.key === "End") { app.viewer.goto(app.viewer.pages.length - 1); return; }
    if (e.key === "Enter" && app.tool === T.POLYGON) { app.interact.finishPolygon(true); return; }
    const tool = TOOL_KEYS[k];
    if (tool && !e.altKey) app.setTool(tool);
  });
}

// ------------------------------------------------- sürükle bırak (tarayıcı/tablet)
function setupDragDrop(app) {
  window.addEventListener("dragover", (e) => { e.preventDefault(); });
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    await app.openFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), handle: null });
  });
}

boot().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<div style="padding:24px;font-family:system-ui;color:#e5484d">${appName()} başlatılamadı:<br><pre style="white-space:pre-wrap">${String(e && (e.stack || e.message || e))}</pre></div>`;
});
