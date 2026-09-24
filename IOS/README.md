# PDF Studio — iOS / iPadOS

iOS 15 ve üzeri iPhone ve iPad için. Arayüz ve PDF motoru `../MOBIL_ORTAK`
klasöründen gelir (bkz. oradaki README); bu klasör yalnızca iOS kabuğunu içerir.

| Dosya | İş |
|---|---|
| `AppDelegate.swift` | uygulama ve sahne; Dosyalar'dan "Birlikte aç" |
| `WebViewController.swift` | WKWebView, tema, dış bağlantılar |
| `SchemeHandler.swift` | ortak arayüzü `pdfstudio://app/` şemasından doğru MIME türleriyle sunar; açılan belgeleri akıtır |
| `NativeBridge.swift` | dosya açma/kaydetme (belge seçici, güvenlik kapsamlı yer imleri), paylaşım, yazdırma, pano |

"Kaydet" özgün dosyanın (iCloud Drive, Dosyalar, harici sağlayıcılar) üzerine
yazar; uygulama yeniden açıldığında son kullanılan belgelere yer imleriyle ulaşır.

## Derleme (macOS + Xcode 15+)

```bash
brew install node
```

```bash
cd ../MOBIL_ORTAK && npm install
```

Sonra `PDFStudio.xcodeproj`'u Xcode'da açın, *Signing & Capabilities*
sekmesinde kendi ekibinizi (Apple kimliği) seçin ve çalıştırın. "Ortak arayüzü
kopyala" derleme adımı `MOBIL_ORTAK/web` içeriğini `PDFStudio/www` klasörüne
kendiliğinden kopyalar.

## Mac olmadan

Deponun GitHub Actions iş akışı (`.github/workflows/build.yml`, **iOS** işi) projeyi
macOS makinesinde derler ve **imzasız IPA** üretir. Bu dosyayı
[AltStore](https://altstore.io) ya da [Sideloadly](https://sideloadly.io) ile
kendi Apple kimliğinizle imzalayıp cihaza yükleyebilirsiniz (ücretsiz Apple
kimliğiyle imza 7 gün geçerlidir; App Store dağıtımı için ücretli geliştirici
hesabı gerekir).

## Sürüm

`MARKETING_VERSION`, `node ../MOBIL_ORTAK/scripts/set_version.mjs 1.2.3` ile
(`MOBIL_ORTAK/package.json` ile birlikte) güncellenir.
