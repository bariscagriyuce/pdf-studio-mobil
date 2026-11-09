// Çeviri denetimi (masaüstündeki packaging/check_translations.py karşılığı).
// Koddaki t("…"), tn("…") ve N_("…") anahtarlarını toplar; her dil için eksik
// çeviri, yer tutucu uyumsuzluğu ve kullanılmayan anahtarları bildirir.
//   node test/i18n.test.mjs            → denetle (eksik varsa çıkış kodu 1)
//   node test/i18n.test.mjs --missing  → eksik anahtarları JSON olarak yaz

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "js");
const LANGS = ["en", "pt_BR"];

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "locales") out.push(...walk(p)); } else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

/** Kaynak koddaki çeviri anahtarları: { anahtar: [dosya:satır, ...] } */
export function collectKeys() {
  const keys = new Map();
  const re = /\b(?:t|tn|N_)\(\s*("(?:[^"\\\n]|\\.)*")/g;
  for (const file of walk(root)) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(re)) {
      let key;
      try { key = JSON.parse(m[1]); } catch { continue; }
      const line = src.slice(0, m.index).split("\n").length;
      if (!keys.has(key)) keys.set(key, []);
      keys.get(key).push(`${path.relative(root, file)}:${line}`);
    }
  }
  return keys;
}

const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

async function main() {
  const keys = collectKeys();
  let errors = 0;
  const missingOut = {};
  for (const lang of LANGS) {
    const catalog = (await import(path.join(root, "locales", `${lang}.js`))).default;
    const missing = [...keys.keys()].filter((k) => !(k in catalog));
    const unused = Object.keys(catalog).filter((k) => !keys.has(k));
    const bad = [];
    for (const [k, v] of Object.entries(catalog)) {
      const want = placeholders(k);
      const forms = v && typeof v === "object" ? Object.values(v) : [v];
      for (const f of forms) if (typeof f !== "string" || placeholders(f) !== want) bad.push(k);
    }
    missingOut[lang] = missing;
    console.log(`${lang}: ${keys.size} anahtar · eksik ${missing.length} · yer tutucu hatası ${bad.length} · kullanılmayan ${unused.length}`);
    for (const k of missing.slice(0, 40)) console.log(`  eksik: ${JSON.stringify(k)}  (${keys.get(k)[0]})`);
    for (const k of bad) console.log(`  yer tutucu: ${JSON.stringify(k)}`);
    for (const k of unused.slice(0, 20)) console.log(`  kullanılmıyor: ${JSON.stringify(k)}`);
    errors += missing.length + bad.length;
  }
  if (process.argv.includes("--missing")) {
    fs.writeFileSync(process.argv[process.argv.indexOf("--missing") + 1] || "/dev/stdout", JSON.stringify(missingOut, null, 1));
  }
  if (errors) {
    console.log(`SONUÇ: ${errors} ÇEVİRİ SORUNU`);
    process.exit(1);
  }
  console.log("SONUÇ: ÇEVİRİLER TAM ✔");
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
