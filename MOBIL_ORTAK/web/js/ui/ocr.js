// OCR: taranmış sayfalara aranabilir metin katmanı. Masaüstünde sistemdeki
// Tesseract kullanılıyordu; mobilde aynı motor (tesseract.js, WebAssembly)
// Türkçe + İngilizce dil verisiyle uygulamanın içinde gelir — çevrimdışı çalışır.

import { form, toast, withBusy, setBusyText } from "./ui.js";

const base = new URL("../../vendor/tesseract/", import.meta.url);

/** Worker içinde yakalanmayan hatalar (ör. çekirdek dosyası yüklenemedi) sözü reddetsin. */
let failWith = null;
const failure = () => new Promise((_, reject) => { failWith = reject; });
const guard = (p) => Promise.race([p, failure()]);

async function createWorker(langs) {
  const mod = await import(new URL("tesseract.esm.min.js", base).href);
  const Tesseract = mod.default || mod;
  return Tesseract.createWorker(langs, 1 /* OEM.LSTM_ONLY */, {
    errorHandler: (e) => failWith && failWith(e instanceof Error ? e : new Error(e && e.message ? e.message : String(e))),
    workerPath: new URL("worker.min.js", base).href,
    corePath: new URL("core/", base).href,
    langPath: new URL("lang/", base).href,
    gzip: true,
    cacheMethod: "none",
    workerBlobURL: false,
  });
}

/** TSV çıktısından kelimeler: [{ text, bbox: [x0,y0,x1,y1] }] */
function wordsFromTsv(tsv) {
  const out = [];
  for (const line of (tsv || "").split("\n")) {
    const c = line.split("\t");
    if (c.length < 12 || c[0] !== "5") continue;
    const text = c.slice(11).join("\t").trim();
    const conf = +c[10];
    if (!text || conf < 0) continue;
    const [l, t, w, h] = [+c[6], +c[7], +c[8], +c[9]];
    out.push({ text, bbox: [l, t, l + w, t + h] });
  }
  return out;
}

export async function runOcr(app) {
  const total = app.viewer.pages.length;
  const v = await form("OCR — aranabilir metin katmanı", [
    { type: "info", value: "Taranmış (görüntü) sayfalardaki yazılar tanınır ve sayfaya görünmez, aranabilir/seçilebilir metin olarak eklenir. Görünüm değişmez." },
    { key: "lang", type: "select", label: "Dil", value: "tur+eng", options: [["tur+eng", "Türkçe + İngilizce"], ["tur", "Türkçe"], ["eng", "İngilizce"]] },
    { key: "dpi", type: "select", label: "Çözünürlük", numeric: true, value: 300, options: [[200, "200 DPI (hızlı)"], [300, "300 DPI (önerilen)"], [400, "400 DPI (küçük yazılar)"]] },
    { key: "pages", type: "pages", label: "Sayfalar", total, current: app.viewer.current, value: "current" },
  ], { ok: "Başlat" });
  if (!v || !v.pages.length) return;
  const results = [];
  let worker = null;
  try {
    await withBusy("OCR motoru yükleniyor…", async () => {
      worker = await guard(createWorker(v.lang));
      for (let i = 0; i < v.pages.length; i++) {
        const pno = v.pages[i];
        setBusyText(`Sayfa ${pno + 1} tanınıyor… (${i + 1}/${v.pages.length})`);
        const img = await app.engine.call("ocrImage", pno, v.dpi);
        const blob = new Blob([img.bytes], { type: "image/png" });
        const res = await guard(worker.recognize(blob, {}, { tsv: true, text: false, blocks: false }));
        results.push({ pno, width: img.width, height: img.height, words: wordsFromTsv(res.data.tsv) });
      }
      setBusyText("Metin katmanı yazılıyor…");
      const n = results.reduce((s, r) => s + r.words.length, 0);
      if (n) await app.engine.call("applyOcr", results);
      toast(n ? `${n} kelime tanındı ve eklendi` : "Tanınan metin bulunamadı");
    });
  } catch (e) {
    console.error(e);
    toast("OCR başarısız: " + (e.message || e), { error: true, ms: 6000 });
  } finally {
    if (worker) worker.terminate().catch(() => {});
  }
}
