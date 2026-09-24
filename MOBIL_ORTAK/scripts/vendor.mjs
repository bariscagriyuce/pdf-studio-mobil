// node_modules içindeki çalışma zamanı dosyalarını web/vendor altına kopyalar.
// (mupdf.js motoru, tesseract.js OCR çekirdeği ve Türkçe/İngilizce dil verisi)
// Kullanım: npm install && npm run vendor

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nm = path.join(root, "node_modules");
const out = path.join(root, "web", "vendor");

const FILES = [
  ["mupdf/dist/mupdf.js", "mupdf/mupdf.js"],
  ["mupdf/dist/mupdf-wasm.js", "mupdf/mupdf-wasm.js"],
  ["mupdf/dist/mupdf-wasm.wasm", "mupdf/mupdf-wasm.wasm"],
  ["mupdf/LICENSE", "mupdf/LICENSE", true],
  ["tesseract.js/dist/tesseract.esm.min.js", "tesseract/tesseract.esm.min.js"],
  ["tesseract.js/dist/worker.min.js", "tesseract/worker.min.js"],
  ["tesseract.js/LICENSE.md", "tesseract/LICENSE.md", true],
  // Yalnızca LSTM motoru kullanılır (dil verisi *_best_int); işlemcinin desteğine
  // göre tesseract.js bu üç çekirdekten birini seçer
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract/core/tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract/core/tesseract-core-lstm.wasm.js"],
  ["@tesseract.js-data/tur/4.0.0_best_int/tur.traineddata.gz", "tesseract/lang/tur.traineddata.gz"],
  ["@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "tesseract/lang/eng.traineddata.gz"],
];

if (!fs.existsSync(path.join(nm, "mupdf"))) {
  console.error("node_modules bulunamadı. Önce MOBIL_ORTAK içinde `npm install` çalıştırın.");
  process.exit(1);
}

let total = 0;
for (const [src, dst, optional] of FILES) {
  const from = path.join(nm, src);
  const to = path.join(out, dst);
  if (!fs.existsSync(from)) {
    if (optional) continue;
    console.error("Eksik dosya: " + from);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  total += fs.statSync(to).size;
}
const version = JSON.parse(fs.readFileSync(path.join(nm, "mupdf", "package.json"), "utf8")).version;
fs.writeFileSync(path.join(out, "versions.json"), JSON.stringify({
  mupdf: version,
  tesseract: JSON.parse(fs.readFileSync(path.join(nm, "tesseract.js", "package.json"), "utf8")).version,
}, null, 2));
console.log(`vendor: ${FILES.length} dosya, ${(total / 1048576).toFixed(1)} MB → ${path.relative(root, out)}`);
