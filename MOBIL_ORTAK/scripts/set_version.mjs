// Sürüm numarasını tek komutla her yere işler:
//   node MOBIL_ORTAK/scripts/set_version.mjs 1.2.3
//
// Tek kaynak MOBIL_ORTAK/package.json'daki "version"dır. Android bunu derlemede
// okur (versionName, versionCode = 1.2.3 → 10203); iOS projesindeki
// MARKETING_VERSION burada güncellenir. CI, git etiketinden gelen sürümü verir.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const version = (process.argv[2] || "").trim().replace(/^v/i, "");
if (!/^\d+(\.\d+)*([-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Kullanım: node MOBIL_ORTAK/scripts/set_version.mjs <sürüm>  (ör. 1.2.3)");
  process.exit(2);
}
const numeric = version.split(/[-+]/)[0];

function update(rel, pattern, replacement, { all = false } = {}) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  const re = new RegExp(pattern, all ? "g" : "");
  if (!re.test(text)) {
    console.error(`Sürüm alanı bulunamadı: ${rel}`);
    process.exit(1);
  }
  fs.writeFileSync(file, text.replace(new RegExp(pattern, all ? "g" : ""), replacement));
  console.log(`OK: ${rel} -> ${version}`);
}

update("MOBIL_ORTAK/package.json", '"version":\\s*"[^"]*"', `"version": "${version}"`);
// package-lock.json'da kök paketin sürümü iki yerde geçer (ilk iki "version")
{
  const rel = "MOBIL_ORTAK/package-lock.json";
  const file = path.join(root, rel);
  if (fs.existsSync(file)) {
    const lock = JSON.parse(fs.readFileSync(file, "utf8"));
    lock.version = version;
    if (lock.packages && lock.packages[""]) lock.packages[""].version = version;
    fs.writeFileSync(file, JSON.stringify(lock, null, 2) + "\n");
    console.log(`OK: ${rel} -> ${version}`);
  }
}
update("IOS/PDFStudio.xcodeproj/project.pbxproj", "MARKETING_VERSION = [^;]+;", `MARKETING_VERSION = ${numeric};`, { all: true });
