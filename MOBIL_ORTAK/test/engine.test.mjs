// Ortak motorun kendi kendini sınaması (masaüstündeki `--self-test` karşılığı).
// Gerçek bir belge oluşturur, tüm çekirdek düzenleme yollarını çalıştırır ve
// sonuçlarını doğrular.  Çalıştırma:  npm test   (MOBIL_ORTAK içinde)
// İsteğe bağlı: `node test/engine.test.mjs <çıktı-klasörü>` ara PDF/PNG'leri yazar.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as mupdf from "mupdf";
import { installMupdf } from "../web/js/engine/mu.js";
import { createApi, takeChange } from "../web/js/engine/api.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.join(here, "..", "web", "fonts");
const outDir = process.argv[2] || null;
if (outDir) fs.mkdirSync(outDir, { recursive: true });

installMupdf(mupdf);
mupdf.setLog?.(() => {});
const { api, engine: E } = createApi({ loadFont: async (file) => new Uint8Array(fs.readFileSync(path.join(fontDir, file))) });

const failures = [];
let passed = 0;
function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failures.push([name, e]);
    console.log(`  ✘ ${name}: ${e.message}`);
  }
}
const text = (pno) => api.pageFullText(pno);
const dump = (name, bytes) => outDir && fs.writeFileSync(path.join(outDir, name), bytes);
const png = (pno, name) => outDir && dump(name, api.renderImage(pno, { dpi: 72 }).bytes);

console.log("PDF Studio mobil motor sınaması");
console.log(`  mupdf.js : ${JSON.parse(fs.readFileSync(path.join(here, "..", "node_modules", "mupdf", "package.json"))).version}`);
console.log(`  Node     : ${process.version}\n`);

// --- örnek belge üret (Türkçe karakterler dahil)
await check("boş belge", () => api.newBlank(595, 842, 3));
await check("başlık ve satırlar yaz", async () => {
  for (let i = 0; i < 3; i++) {
    await api.insertTextBox(i, [60, 60, 540, 100], `Bölüm ${i + 1} — Türkçe Başlık ığşçöü`, { family: "Liberation Sans", size: 20 });
    const lines = Array.from({ length: 12 }, (_, k) => `${k + 1}. satır Lorem ipsum dolor.`).join("\n");
    await api.insertTextBox(i, [60, 125, 540, 400], lines, { family: "Helvetica", size: 11, lineSpacing: 1.8 });
  }
  expect(text(0).includes("Türkçe Başlık ığşçöü"), "Türkçe başlık okunamadı: " + text(0).slice(0, 80));
  expect(text(1).includes("5. satır Lorem ipsum dolor."), "satırlar yazılmadı");
});
await check("yer imleri", () => {
  api.setToc([{ level: 1, title: "Giriş", page: 0 }, { level: 2, title: "Alt başlık", page: 1 }, { level: 1, title: "Son", page: 2 }]);
  const toc = api.getToc();
  expect(toc.length === 3 && toc[1].level === 2 && toc[2].page === 2, JSON.stringify(toc));
});
let saved;
await check("kaydet ve yeniden aç", () => {
  saved = api.save();
  api.open(saved, "kaynak.pdf");
  expect(api.state().pageCount === 3, "sayfa sayısı " + api.state().pageCount);
  expect(!api.state().dirty, "açılışta kirli");
  dump("kaynak.pdf", saved);
});
await check("sayfa görüntüleme", () => {
  const r = api.render(0, 1.5);
  expect(r.width === Math.ceil(595 * 1.5) && r.data.length === r.width * r.height * 4, `${r.width}x${r.height}`);
  const inked = r.data.some((v, i) => i % 4 === 0 && v < 128);
  expect(inked, "sayfa boş çizildi");
});
/** Görüntüde koyu piksellerin en soldaki x'i (ölçek doğruluğu için) */
const inkLeft = (r) => {
  let minx = 1e9;
  for (let y = 0; y < r.height; y += 2) for (let x = 0; x < r.width; x++) if (r.data[(y * r.width + x) * 4] < 100) { minx = Math.min(minx, x); break; }
  return minx;
};
await check("görüntüleme ölçeği", () => {
  expect(Math.abs(inkLeft(api.render(0, 1)) - 60) <= 2, "ölçek 1: " + inkLeft(api.render(0, 1)));
  expect(Math.abs(inkLeft(api.render(0, 2)) - 120) <= 3, "ölçek 2: " + inkLeft(api.render(0, 2)));
});
await check("bölgesel görüntüleme", () => {
  const r = api.render(0, 4, [50, 50, 300, 120]);
  expect(r.width === 1000 && r.height === 280, `${r.width}x${r.height}`);
  expect(Math.abs(r.bbox[0] + inkLeft(r) - 240) <= 10, "bölge ölçeği: " + (r.bbox[0] + inkLeft(r)));
});
await check("küçük resim", () => expect(api.thumbnail(0, 120).height === 120, "yükseklik"));
await check("yazı tipi aileleri", () => expect(api.fontFamilies().includes("Liberation Sans"), "yok"));

let blocks;
await check("metin bloğu tespiti", () => {
  blocks = api.textBlocks(0);
  expect(blocks.length >= 2, "blok sayısı " + blocks.length);
  expect(blocks[0].style.size === 20, "punto " + blocks[0].style.size);
});
await check("metni düzenle (Türkçe)", async () => {
  const b = blocks[0];
  const ok = await api.replaceRegionText(0, b.bbox, "DÜZENLENDİ ığşçöü İĞŞÇÖÜ", b.style, { baseline: b.baseline });
  expect(ok, "sığmadı");
  const t = text(0);
  expect(t.includes("DÜZENLENDİ ığşçöü İĞŞÇÖÜ"), "yeni metin yok: " + t.slice(0, 60));
  expect(!t.includes("Bölüm 1"), "eski metin silinmedi");
  const nb = api.blockAt(0, [b.bbox[0] + 5, b.baseline - 5]);
  expect(nb && Math.abs(nb.baseline - b.baseline) < 0.6, `taban çizgisi kaydı: ${nb && nb.baseline} / ${b.baseline}`);
  png(0, "duzenle.png");
});
await check("canlı önizleme", async () => {
  const b = api.textBlocks(1)[0];
  const r = await api.previewReplace(1, b.bbox, "Önizleme", b.style, { baseline: b.baseline }, 1);
  expect(r.width > 0 && r.data.length === r.width * r.height * 4, "önizleme boş");
  expect(text(1).includes("Bölüm 2"), "önizleme belgeyi değiştirdi");
});
await check("geri al", () => {
  expect(api.undo() === "Metni düzenle", "etiket");
  expect(text(0).includes("Bölüm 1"), "geri alınmadı");
});
await check("yinele", () => {
  api.redo();
  expect(text(0).includes("DÜZENLENDİ"), "yinelenmedi");
});
await check("ara (Türkçe büyük/küçük harf)", () => {
  // Türkçe katlama: "İ"↔"i", "I"↔"ı"
  expect(api.findAll("iğşçöü").length === 1, "İĞŞÇÖÜ bulunamadı: " + api.findAll("iğşçöü").length);
  expect(api.findAll("IĞŞ").length === 3, "ığş araması: " + api.findAll("IĞŞ").length);
  const lorem = api.findAll("lorem");
  expect(lorem.length === 36, "lorem: " + lorem.length);
  expect(api.findAll("lorem", { caseSensitive: true }).length === 0, "büyük/küçük duyarlı");
  expect(api.findAll("satır Lorem", {}).length === 36, "iki kelime");
  expect(api.findAll("Lore", { wholeWords: true }).length === 0, "tam kelime");
});
await check("bul-değiştir", async () => {
  const n = await api.replaceAll("Lorem", "LOREM");
  expect(n === 36, "değişen: " + n);
  const t1 = text(1);
  expect(!t1.includes("Lorem") && (t1.match(/LOREM/g) || []).length === 12, "değişmedi: " + JSON.stringify(t1.slice(0, 120)));
  png(1, "degistir.png");
});
await check("metin ekle (kutu, iki yana)", async () => {
  const long = "Bu uzun paragraf iki yana yaslanarak kutuya sığdırılır; gerekirse punto küçültülür. ".repeat(4);
  expect(await api.insertTextBox(2, [300, 420, 540, 520], long, { family: "Liberation Serif", size: 11, align: 3 }), "sığmadı");
  expect(text(2).includes("yaslanarak"), "yazılmadı");
});
await check("seçim", () => {
  const s = api.selection(1, [60, 140], [400, 150]);
  expect(s.quads.length > 0 && s.text.includes("satır"), JSON.stringify(s.text));
});
await check("vurgu", () => {
  const q = api.findAll("ipsum").filter((h) => h.pno === 0).slice(0, 3).flatMap((h) => h.rects.map((r) => [r[0], r[1], r[2], r[1], r[0], r[3], r[2], r[3]]));
  api.addMarkup(0, "highlight", q, { color: [1, 1, 0] });
  expect(api.listAnnots(0).some((a) => a.type === "Highlight"), "vurgu yok");
});
await check("altı/üstü çizili, dalgalı", () => {
  for (const k of ["underline", "strikeout", "squiggly"]) api.addMarkup(1, k, [[60, 130, 200, 130, 60, 145, 200, 145]], { color: [0, 0, 1] });
  expect(api.listAnnots(1).length === 3, "adet");
});
await check("serbest çizim", () => api.addInk(0, [[[60, 600], [150, 650], [240, 610]]], { width: 3 }));
await check("şekiller", () => {
  api.addShape(0, "rect", [300, 600], [450, 700], { fill: [0.9, 0.9, 1] });
  api.addShape(0, "ellipse", [460, 600], [560, 700]);
  api.addShape(0, "arrow", [60, 720], [250, 760]);
  api.addShape(0, "double_arrow", [60, 780], [250, 800]);
  api.addPolygon(0, [[300, 720], [350, 800], [400, 720]], { closed: true, fill: [0, 1, 0] });
  api.addPolygon(0, [[420, 720], [470, 800], [520, 720]], { closed: false });
});
await check("not", () => api.addStickyNote(0, [500, 100], "Türkçe not ığş", { author: "Barış" }));
await check("serbest metin kutusu", () => {
  api.addFreeText(0, [320, 430, 540, 470], "Serbest metin ığşİĞŞ", { fontsize: 12, fillColor: [1, 1, 0.8], borderWidth: 1 });
  png(0, "aciklamalar.png");
});
await check("damga", () => api.addStamp(1, [300, 450, 480, 500], 4));
await check("şapka", () => api.addCaret(1, [100, 460, 110, 470]));
await check("dosya eki", () => {
  const id = api.addFileAttachment(1, [520, 60], "ek.txt", new TextEncoder().encode("merhaba"));
  const d = api.attachmentData(1, id);
  expect(d.name === "ek.txt" && new TextDecoder().decode(d.bytes) === "merhaba", "ek okunamadı");
});
await check("bağlantılar", () => {
  api.addLink(2, [60, 60, 300, 90], { uri: "https://example.com" });
  api.addLink(2, [60, 95, 300, 120], { targetPage: 0 });
  const l = api.listLinks(2);
  expect(l.length === 2 && l[0].uri === "https://example.com" && l[1].page === 0, JSON.stringify(l));
  api.deleteLink(2, [60, 60, 300, 90]);
  expect(api.listLinks(2).length === 1, "silinmedi");
});
await check("açıklama seç/taşı/boyutlandır/düzenle", () => {
  const a = api.annotAt(0, [375, 650]);
  expect(a && a.type === "Square", "bulunamadı: " + (a && a.type));
  const moved = api.moveAnnot(0, a.id, 10, 5);
  expect(Math.abs(moved.rect[0] - a.rect[0] - 10) < 1, "taşınmadı");
  const r2 = api.resizeAnnot(0, a.id, [300, 600, 500, 720]);
  expect(Math.abs(r2.rect[2] - r2.rect[0] - 200) < 3, "boyutlanmadı: " + JSON.stringify(r2.rect));
  const ink = api.listAnnots(0).find((x) => x.type === "Ink");
  const inkMoved = api.moveAnnot(0, ink.id, 0, 20);
  expect(Math.abs(inkMoved.rect[1] - ink.rect[1] - 20) < 1, "mürekkep taşınmadı");
  const up = api.updateAnnot(0, a.id, { color: [0, 0, 1], opacity: 0.5, content: "içerik", author: "Yazar" });
  expect(up.content === "içerik" && up.author === "Yazar" && Math.abs(up.opacity - 0.5) < 0.01, JSON.stringify(up));
});
await check("açıklama sil", () => {
  const before = api.listAnnots(1).length;
  const a = api.listAnnots(1)[0];
  api.deleteAnnot(1, a.id);
  expect(api.listAnnots(1).length === before - 1, "silinmedi");
});
await check("sayfa döndür", () => {
  api.rotatePages([0], 90);
  expect(api.pageSizes()[0].rotation === 90 && api.pageSizes()[0].width === 842, JSON.stringify(api.pageSizes()[0]));
});
await check("döndürülmüş sayfaya metin", async () => {
  await api.insertTextBox(0, [60, 60, 400, 100], "Döndürülmüş sayfa metni", { size: 14 });
  const b = api.textBlocks(0).find((x) => x.text.includes("Döndürülmüş"));
  expect(b && b.bbox[0] > 50 && b.bbox[0] < 70 && b.bbox[1] > 55, "yanlış yer: " + JSON.stringify(b && b.bbox));
  png(0, "donmus.png");
});
await check("sayfa döndür (geri)", () => api.rotatePages([0], -90));
await check("sayfa ekle", () => { api.insertBlank(1, 595, 842); expect(api.state().pageCount === 4, "adet"); });
await check("sayfa çoğalt", () => {
  api.duplicatePages([0]);
  expect(api.state().pageCount === 5 && text(1).includes("DÜZENLENDİ"), "çoğaltılmadı");
  expect(api.listAnnots(1).length === api.listAnnots(0).length, "açıklamalar kopyalanmadı");
});
await check("sayfa sil", () => { api.deletePages([1, 2]); expect(api.state().pageCount === 3, "adet"); });
await check("sayfa taşı / ters çevir", () => {
  api.movePages([2], 0);
  expect(text(0).includes("Bölüm 3"), "taşınmadı");
  api.reversePages();
  expect(text(2).includes("Bölüm 3"), "ters çevrilmedi");
  api.movePages([2], 0);
});
await check("kırp / sıfırla", () => {
  api.cropPages([0], [50, 50, 545, 792]);
  expect(Math.round(api.pageSizes()[0].width) === 495, "kırpılmadı " + api.pageSizes()[0].width);
  api.resetCrop([0]);
  expect(Math.round(api.pageSizes()[0].width) === 595, "sıfırlanmadı");
});
await check("sayfa boyutu değiştir", () => {
  api.resizePages([2], 420, 595);
  const s = api.pageSizes()[2];
  expect(Math.round(s.width) === 420 && text(2).length > 20, JSON.stringify(s));
  png(2, "boyut.png");
});
await check("filigran (Türkçe)", async () => {
  await api.addTextWatermark("GİZLİ TASLAK", [0], { fontsize: 60, opacity: 0.3 });
  expect(text(0).includes("GİZLİ TASLAK"), "yok");
  png(0, "filigran.png");
});
await check("sayfa numarası", async () => {
  await api.addPageNumbers([0, 1, 2]);
  expect(text(2).includes("3 / 3"), "yok");
});
await check("üst/alt bilgi", async () => {
  await api.addHeaderFooter([0], { header: "Üst bilgi", footer: "Alt bilgi" });
  expect(text(0).includes("Üst bilgi") && text(0).includes("Alt bilgi"), "yok");
});
await check("görüntü ekle / listele / taşı / sil", () => {
  const img = api.renderImage(1, { dpi: 30 }).bytes;
  api.placeImage(1, [300, 550, 500, 750], img);
  let imgs = api.listImages(1);
  expect(imgs.length === 1, "liste: " + imgs.length);
  const pngBytes = api.extractImage(1, 0);
  expect(pngBytes[1] === 0x50 && pngBytes[2] === 0x4e, "PNG değil");
  api.moveResizeImage(1, imgs[0].rect, [100, 550, 200, 650]);
  imgs = api.listImages(1);
  expect(imgs.length === 1 && Math.abs(imgs[0].rect[0] - 100) < 15, "taşınmadı " + JSON.stringify(imgs.map((i) => i.rect)));
  api.replaceImage(1, imgs[0].rect, img);
  expect(api.listImages(1).length === 1, "değiştirilmedi");
  expect(api.extractAllImages().length >= 1, "toplu çıkarma");
  api.deleteImage(1, api.listImages(1)[0].rect);
  expect(api.listImages(1).length === 0, "silinmedi");
});
await check("form alanları", () => {
  api.addField(0, [60, 700, 300, 725], { name: "ad" });
  api.addField(0, [320, 700, 340, 720], { kind: "checkbox", name: "onay" });
  api.addField(0, [360, 700, 520, 725], { kind: "combobox", name: "sehir", options: ["Ankara", "İstanbul", "İzmir"] });
  const f = api.listFields();
  expect(f.length === 3, "alan sayısı " + f.length);
  expect(api.hasForm(), "form yok");
});
await check("form doldur / JSON", async () => {
  const n = await api.setValues({ ad: "Barış Çağrı", onay: true, sehir: "İzmir" });
  expect(n === 3, "doldurulan " + n);
  const v = api.exportValues();
  expect(v.ad === "Barış Çağrı" && v.onay === true && v.sehir === "İzmir", JSON.stringify(v));
  await api.importJson(JSON.stringify({ ad: "Ayşe" }));
  expect(api.exportValues().ad === "Ayşe", "içe aktarılmadı");
  const cb = api.listFields().find((x) => x.name === "onay");
  await api.setValue(cb.pno, cb.id, false);
  expect(api.exportValues().onay === false, "onay kaldırılamadı");
  png(0, "form.png");
});
await check("form alanı sil", () => {
  const f = api.listFields().find((x) => x.name === "sehir");
  api.deleteField(f.pno, f.id);
  expect(api.listFields().length === 2, "silinmedi");
});
await check("alanı sil (redaksiyon)", () => {
  api.deleteTextRegion(1, [55, 120, 540, 160]);
  expect(!/(^|\n)1\. satır/.test(text(1)) && /(^|\n)3\. satır/.test(text(1)), "silinmedi: " + JSON.stringify(text(1).slice(0, 120)));
});
await check("karartma", () => {
  // 2. sayfa küçültülmüş (form XObject içindeki) içerik: redaksiyon oraya da inmeli
  const W = { pages: [2], wholeWords: true };
  const hit = api.findAll("2. satır", W)[0];
  expect(hit, "hedef metin yok");
  api.redactAreas([{ pno: 2, rect: hit.rect }]);
  expect(!api.findAll("2. satır", W).length && api.findAll("3. satır", W).length, "içerik kaldı: " + JSON.stringify(text(2).slice(0, 120)));
  png(2, "karartma.png");
});
await check("meta veri", () => {
  api.setMetadata({ title: "Başlık ğüş", author: "Barış" });
  expect(api.getMetadata().title === "Başlık ğüş", "yazılmadı");
});
await check("belge raporu", () => expect(api.documentReport().length > 10, "rapor"));
await check("PNG / JPG dışa aktar", () => {
  const out = api.exportImages({ pages: [0], dpi: 72, format: "jpg" });
  expect(out[0].bytes[0] === 0xff && out[0].bytes[1] === 0xd8, "JPEG değil");
  const g = api.exportImages({ pages: [0], dpi: 36, format: "png", gray: true });
  expect(g[0].bytes[1] === 0x50, "PNG değil");
});
await check("metin / HTML / XML / JSON dışa aktar", () => {
  expect(api.exportText({ mode: "text" }).includes("----- Sayfa 1 -----"), "txt");
  expect(api.exportText({ mode: "html" }).includes("<html"), "html");
  expect(api.exportText({ mode: "xhtml" }).includes("xmlns"), "xhtml");
  expect(api.exportText({ mode: "xml" }).includes("<span font="), "xml");
  expect(JSON.parse(api.exportText({ mode: "json" })).length === 3, "json");
});
await check("sayfa çıkar / böl (zip)", () => {
  const sub = api.extractPages([0, 2]);
  const d = new mupdf.PDFDocument(sub);
  expect(d.countPages() === 2, "çıkarma");
  const parts = api.splitEvery(1, "b");
  expect(parts.length === 3 && parts[2].name === "b_03_3-3.pdf", parts.map((p) => p.name).join());
  const z = api.zip(parts);
  expect(z[0] === 0x50 && z[1] === 0x4b, "zip değil");
  dump("bolumler.zip", z);
});
await check("birleştir (PDF + görüntü)", () => {
  const n0 = api.state().pageCount;
  const added = api.mergeFiles([{ name: "k.pdf", bytes: saved }, { name: "g.png", bytes: api.renderImage(0, { dpi: 20 }).bytes }], n0);
  expect(added === 4 && api.state().pageCount === n0 + 4, "eklenen " + added);
  api.deletePages([n0, n0 + 1, n0 + 2, n0 + 3]);
});
await check("sıkıştır", () => {
  const img = api.renderImage(0, { dpi: 200 }).bytes;
  api.placeImage(1, [60, 400, 540, 800], img);
  const r = api.compress({ imageDpi: 72, jpegQuality: 60 });
  expect(r.after < r.before && r.images >= 1, `${r.before} -> ${r.after} (${r.images})`);
  dump("kucuk.pdf", r.bytes);
});
await check("OCR metin katmanı", async () => {
  const n = await api.applyOcr([{ pno: 1, width: 1000, height: 1000, words: [{ text: "Taranmış", bbox: [100, 900, 300, 930] }, { text: "sözcük", bbox: [320, 900, 450, 930] }] }]);
  expect(n === 2, "yazılan kelime " + n);
  expect(text(1).includes("Taranmış"), "katman metni yok: " + JSON.stringify(text(1).slice(-120)));
  expect(api.findAll("sözcük").length === 1, "aranamıyor: " + api.findAll("sözcük").length);
});
await check("düzleştir", () => {
  api.flatten();
  expect(api.listAnnots(0).length === 0 && api.listFields().length === 0, "düzleşmedi");
  expect(text(0).includes("Ayşe"), "form değeri kayboldu");
});
let enc;
await check("şifreli kaydet (AES-256)", () => {
  enc = api.saveEncrypted({ userPw: "1234", ownerPw: "sahip", allowed: ["print"] });
  const d = mupdf.Document.openDocument(enc, "application/pdf");
  expect(d.needsPassword(), "parola istemiyor");
  expect(d.authenticatePassword("1234") > 0, "parola kabul edilmedi");
  expect(d.hasPermission("print") && !d.hasPermission("copy"), "izinler yanlış");
  dump("gizli.pdf", enc);
});
await check("parolalı belgeyi aç", () => {
  let asked = false;
  try { api.open(enc, "gizli.pdf"); } catch (e) { asked = e.code === "password"; }
  expect(asked, "parola sorulmadı");
  api.open(enc, "gizli.pdf", "1234");
  expect(api.state().encrypted, "şifreli görünmüyor");
});
await check("şifreli belgede düzenle + geri al", async () => {
  await api.insertTextBox(0, [60, 300, 400, 340], "Şifreli belgeye ek", { size: 12 });
  api.undo();
  expect(!text(0).includes("Şifreli belgeye ek"), "geri alınmadı");
});
await check("şifre kaldır", () => {
  const plain = api.saveDecrypted();
  const d = mupdf.Document.openDocument(plain, "application/pdf");
  expect(!d.needsPassword(), "hâlâ şifreli");
});
await check("temizle", () => {
  api.sanitize({ metadata: true, js: true, attachments: true, links: true });
  expect(api.getMetadata().title === "", "meta kaldı");
});
await check("son kayıt", () => {
  const b = api.save();
  api.markSaved("sonuc.pdf");
  dump("sonuc.pdf", b);
  api.open(b, "sonuc.pdf", "1234");
  expect(api.state().pageCount === 3, "yeniden açılamadı");
});
await check("değişiklik bildirimi", async () => {
  takeChange(E);
  await api.insertTextBox(1, [60, 60, 300, 90], "x", {});
  const c = takeChange(E);
  expect(c.change && c.change.pages && c.change.pages[0] === 1 && c.state.dirty, JSON.stringify(c));
});

console.log();
if (failures.length) {
  console.log(`SONUÇ: ${failures.length} HATA (${passed} başarılı)`);
  for (const [name, e] of failures) console.log(`--- ${name}\n${e.stack}`);
  process.exit(1);
}
console.log(`SONUÇ: TÜM SINAMALAR BAŞARILI ✔ (${passed})`);
