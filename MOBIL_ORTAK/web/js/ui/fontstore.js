// Kullanıcının içe aktardığı yazı tipleri (TTF/OTF). Masaüstü sürüm sistem
// fontlarını tarar; mobilde uygulama kendi deposunda saklar ve her açılışta
// motora kaydeder.

import { toast } from "./ui.js";

const DB = "pdfstudio-fonts";
const STORE = "fonts";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
  });
}

export class FontStore {
  constructor(app) {
    this.app = app;
  }

  /** Kayıtlı yazı tiplerini motora yükler. */
  async load() {
    try {
      const db = await openDb();
      const req = await new Promise((resolve, reject) => {
        const t = db.transaction(STORE, "readonly");
        const r = t.objectStore(STORE).getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      for (const f of req) {
        try {
          await this.app.engine.call("registerFont", f.id, f.bytes);
        } catch { /* bozuk dosya */ }
      }
    } catch (e) {
      console.warn("Yazı tipi deposu açılamadı:", e);
    }
    await this.app.refreshFonts();
  }

  async importFonts() {
    const files = await this.app.bridge.openFiles({ kind: "font", multiple: true });
    if (!files.length) return;
    let ok = 0;
    const db = await openDb().catch(() => null);
    for (const f of files) {
      const id = f.name.replace(/[^\w.-]+/g, "_") + "_" + f.bytes.length;
      try {
        const info = await this.app.engine.call("registerFont", id, f.bytes);
        if (db) await tx(db, "readwrite", (s) => s.put({ id, name: f.name, bytes: f.bytes }));
        ok++;
        toast(`Eklendi: ${info.family} ${info.style || ""}`);
      } catch (e) {
        toast(`${f.name}: ${e.message}`, { error: true });
      }
    }
    if (ok) await this.app.refreshFonts();
  }

  async remove(id) {
    const db = await openDb();
    await tx(db, "readwrite", (s) => s.delete(id));
    toast("Yazı tipi kaldırıldı (uygulama yeniden açılınca listeden düşer)");
  }
}
