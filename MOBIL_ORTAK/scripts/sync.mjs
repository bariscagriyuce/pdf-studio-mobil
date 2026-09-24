// Ortak arayüzü (web/) mobil projelerin içine kopyalar. Android ve iOS
// derlemeleri bunu kendiliğinden çağırır; elle çalıştırmak da mümkündür:
//   node scripts/sync.mjs              → her iki platform
//   node scripts/sync.mjs android      → yalnızca ANDROID
//   node scripts/sync.mjs ios <hedef>  → verilen klasöre (Xcode derleme adımı)

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "..");
const web = path.join(root, "web");

const TARGETS = {
  android: path.join(repo, "ANDROID", "app", "src", "main", "assets", "www"),
  ios: path.join(repo, "IOS", "PDFStudio", "www"),
};

function ensureVendor() {
  if (fs.existsSync(path.join(web, "vendor", "mupdf", "mupdf-wasm.wasm"))) return;
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  if (!fs.existsSync(path.join(root, "node_modules", "mupdf"))) {
    console.log("sync: bağımlılıklar kuruluyor (npm ci)...");
    execFileSync(npm, ["ci", "--no-audit", "--no-fund"], { cwd: root, stdio: "inherit" });
  }
  execFileSync(process.execPath, [path.join(root, "scripts", "vendor.mjs")], { stdio: "inherit" });
}

function copyDir(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) n += copyDir(s, d);
    else { fs.copyFileSync(s, d); n++; }
  }
  return n;
}

ensureVendor();
const which = process.argv[2];
const custom = process.argv[3];
const list = which ? [which] : Object.keys(TARGETS);
for (const name of list) {
  const dst = custom || TARGETS[name];
  if (!dst) throw new Error("Bilinmeyen hedef: " + name);
  const n = copyDir(web, dst);
  console.log(`sync: ${n} dosya → ${path.relative(repo, dst) || dst}`);
}
