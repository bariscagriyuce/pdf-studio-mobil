// Motoru barındıran katman: Worker içinde de, (yedek olarak) ana iş parçacığında
// da aynı kod çalışır. Her çağrının yanıtına belge durumu ve değişiklik özeti
// eklenir; arayüz bunlarla neyi yeniden çizeceğine karar verir.

import * as mupdf from "../vendor/mupdf/mupdf.js";
import { installMupdf } from "./engine/mu.js";
import { createApi, takeChange } from "./engine/api.js";

installMupdf(mupdf);
try {
  mupdf.setLog?.({ warning() {}, error(m) { console.warn("mupdf:", m); } });
} catch { /* eski sürüm */ }

const fontBase = new URL("../fonts/", import.meta.url);
const { api, engine } = createApi({
  loadFont: async (file) => {
    const res = await fetch(new URL(file, fontBase));
    if (!res.ok) throw new Error("Yazı tipi yüklenemedi: " + file);
    return new Uint8Array(await res.arrayBuffer());
  },
});

/** Sonuçtaki ikili tamponları aktarılabilir listesine toplar. */
function transferables(value, out = [], depth = 0) {
  if (!value || depth > 3) return out;
  if (ArrayBuffer.isView(value)) {
    if (value.byteOffset === 0 && value.byteLength === value.buffer.byteLength && !out.includes(value.buffer)) out.push(value.buffer);
  } else if (typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap) {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) transferables(v, out, depth + 1);
  } else if (typeof value === "object") {
    for (const v of Object.values(value)) transferables(v, out, depth + 1);
  }
  return out;
}

/** Tarayıcıya özgü son işlemler (webp kodlama motorda yok). */
async function postProcess(method, result) {
  if (method === "exportImages" && Array.isArray(result) && typeof OffscreenCanvas !== "undefined") {
    for (const item of result) {
      if (!item.convert) continue;
      try {
        const bmp = await createImageBitmap(new Blob([item.bytes], { type: "image/png" }));
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        c.getContext("2d").drawImage(bmp, 0, 0);
        const blob = await c.convertToBlob({ type: item.convert, quality: 0.92 });
        if (blob.type === item.convert) item.bytes = new Uint8Array(await blob.arrayBuffer());
        else item.name = item.name.replace(/\.webp$/, ".png");
      } catch {
        item.name = item.name.replace(/\.webp$/, ".png");
      }
      delete item.convert;
    }
  }
  return result;
}

export async function handle(method, args) {
  const fn = api[method];
  if (!fn) throw Object.assign(new Error("Bilinmeyen komut: " + method), { code: "method" });
  const result = await postProcess(method, await fn(...(args || [])));
  const { state, change } = takeChange(engine);
  return { result, state, change };
}

export function errorInfo(e) {
  return { message: (e && (e.key || e.message)) || String(e), code: (e && e.code) || "error", params: (e && e.params) || null, state: engine.state() };
}

export { transferables };
