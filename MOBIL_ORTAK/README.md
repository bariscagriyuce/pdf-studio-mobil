# YUCE PDF Düzenleyici — mobil ortak kod

Android (`../ANDROID`) ve iOS (`../IOS`) uygulamalarının **ortak PDF motoru ve
arayüzü**. İki platform da bu klasördeki `web/` içeriğini derleme sırasında
kendine kopyalar ve bir WebView içinde çalıştırır. Böylece:

- [masaüstü sürümle](https://github.com/bariscagriyuce/pdf-studio) **aynı PDF motoru** (MuPDF; burada resmi WebAssembly sürümü
  [mupdf.js](https://mupdf.readthedocs.io/)) kullanılır,
- tüm özellikler iki platformda **birebir aynıdır**,
- hata bir yerde düzeltilir.

Yerel kabuklar (Kotlin / Swift) yalnızca dosya açma-kaydetme, paylaşım,
yazdırma ve "Birlikte aç" işlerini yapar.

## Klasör yapısı

```
MOBIL_ORTAK/
├── package.json            mupdf.js, tesseract.js (+ Türkçe/İngilizce OCR verisi)
├── scripts/
│   ├── vendor.mjs          node_modules → web/vendor (motor ve OCR dosyaları)
│   ├── sync.mjs            web/ → ANDROID/.../assets/www ve IOS/PDFStudio/www
│   ├── serve.mjs           tarayıcıda deneme sunucusu (http://localhost:8765)
│   ├── set_version.mjs     sürüm numarasını package.json + iOS projesine işler
│   └── make_icons.py       web/img/icon.png'den Android/iOS ikonları
├── test/engine.test.mjs    motorun kendi kendini sınaması (masaüstü --self-test karşılığı)
├── test/i18n.test.mjs      çeviri denetimi (masaüstü check_translations.py karşılığı)
└── web/
    ├── index.html, css/    dokunmatik arayüz (koyu/açık tema, telefon + tablet)
    ├── fonts/              Liberation (Arial/Times/Courier ölçüleri) + DejaVu Sans
    └── js/
        ├── engine/         PDF motoru — masaüstündeki pdfstudio/core karşılığı
        │   ├── engine.js     belge modeli, anlık görüntülü geri al/yinele, görüntüleme
        │   ├── writer.js     sayfa içeriğine metin/görüntü yazma (insert_textbox vb.)
        │   ├── textedit.js   blok tespiti, yerinde metin düzenleme, bul-değiştir, karartma
        │   ├── fonts.js      yazı tipi yöneticisi (Türkçe karakter desteği)
        │   ├── annots.js     açıklamalar      ├── forms.js     formlar
        │   ├── pageops.js    sayfa işlemleri  ├── images.js    görüntüler
        │   ├── security.js   şifreleme        ├── exporting.js dışa aktarma, sıkıştırma, OCR katmanı
        │   └── areaprint.js  seçili alanı yazdırma / PDF olarak kaydetme
        ├── worker.js       motor arka plan iş parçacığında çalışır
        ├── bridge.js       yerel köprü sözleşmesi (Android + iOS + tarayıcı yedeği)
        └── ui/             arayüz — masaüstündeki pdfstudio/ui karşılığı
```

## Geliştirme

Node.js 20+ gerekir.

```bash
npm install
```

```bash
npm run vendor
```

```bash
npm test
```

```bash
npm run serve
```

`npm test` gerçek bir belge üzerinde 66 sınama çalıştırır: Türkçe metin
düzenleme, geri al/yinele, arama (İ/ı katlaması dahil), bul-değiştir, tüm
açıklama türleri, sayfa işlemleri, form doldurma, gerçek karartma, AES-256
şifreleme, sıkıştırma, OCR katmanı, seçili alanı yazdırma ve dışa aktarma.
Ardından çeviri denetimi koddaki tüm `t()` / `tn()` / `N_()` metinlerinin
`web/js/locales/en.js` ve `pt_BR.js` içinde çevrildiğini ve `{yer tutucu}`
adlarının tuttuğunu doğrular.

### Çeviri

Kaynak dil Türkçedir; koddaki Türkçe metin aynı zamanda çeviri anahtarıdır
(`web/js/i18n.js`, masaüstündeki gettext yaklaşımıyla aynı). Yeni bir metin
eklendiğinde iki katalog dosyasına da karşılığı yazılmalıdır;
`node test/i18n.test.mjs --missing eksik.json` eksikleri listeler.

`npm run serve` sonrasında arayüz tarayıcıda telefona kurmadan denenebilir
(geliştirici araçlarında telefon görünümü önerilir).

## Yerel köprü sözleşmesi

`web/js/bridge.js` başındaki açıklamada tanımlıdır. Kısaca:

| JS → yerel komut | İş |
|---|---|
| `openFiles {kind, multiple}` | sistem dosya seçicisi → `[{name, url, handle, mime}]` |
| `openHandle {handle}` | son kullanılan dosyayı yeniden aç |
| `writeBegin` / `writeChunk` / `writeEnd {mode}` | baytları yerele aktar; `mode`: `save` (üzerine yaz), `saveAs`, `share`, `print` |
| `openUrl`, `copyText`, `setTheme`, `appInfo`, `setDirty`, `backResult` | yardımcılar |

Yerelden JS'e olaylar: `openFile` ("Birlikte aç" / "Paylaş"), `back` (Android geri tuşu).
Dosya içerikleri JS'e köprüden değil, yerel tarafın sunduğu bir URL'den akar
(`…/native/file/<belirteç>`); büyük PDF'ler base64'e çevrilmez.

## Lisans

MuPDF / mupdf.js **AGPL-3.0**'dır (masaüstündeki PyMuPDF ile aynı koşullar).
tesseract.js Apache-2.0, Liberation yazı tipleri OFL 1.1, DejaVu Bitstream Vera
lisanslıdır; lisans metinleri `web/fonts/` ve `web/vendor/*/` içindedir.
