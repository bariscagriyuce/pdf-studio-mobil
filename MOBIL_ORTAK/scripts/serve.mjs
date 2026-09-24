// Geliştirme sunucusu: ortak arayüzü telefona kurmadan tarayıcıda denemek için.
// Kullanım: npm run serve   →   http://localhost:8765

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
const port = Number(process.env.PORT || 8765);
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm",
  ".ttf": "font/ttf", ".png": "image/png", ".svg": "image/svg+xml", ".gz": "application/gzip",
  ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json",
};

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(root, url === "/" ? "index.html" : url);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end("bulunamadı"); return; }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
      "Cross-Origin-Opener-Policy": "same-origin",
    });
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, () => console.log(`PDF Studio (mobil arayüz) → http://localhost:${port}`));
