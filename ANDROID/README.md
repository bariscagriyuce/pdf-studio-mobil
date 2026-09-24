# PDF Studio — Android

Android 8.0 (API 26) ve üzeri telefon ve tabletler için. Arayüz ve PDF motoru
`../MOBIL_ORTAK` klasöründen gelir (bkz. oradaki README); bu klasör yalnızca
Android kabuğunu içerir.

| Dosya | İş |
|---|---|
| `MainActivity.kt` | WebView, kenardan kenara ekran, geri tuşu, "Birlikte aç" / "Paylaş" |
| `NativeBridge.kt` | dosya açma/kaydetme (Storage Access Framework, kalıcı izinler), paylaşım, yazdırma, pano |
| `WebAssets.kt` | ortak arayüzü `https://appassets.androidplatform.net/assets/www/` altında doğru MIME türleriyle sunar |
| `PdfPrintAdapter.kt` | sistem yazdırma hizmeti |

Uygulama **İnternet izni istemez**; tüm işlemler cihazda yapılır.

## Derleme

Gerekenler: JDK 17+, Android SDK (platform 35), Node.js 20+.

```bash
cd ../MOBIL_ORTAK && npm install
```

```bash
bash gradlew assembleRelease
```

Çıktı: `app/build/outputs/apk/release/PDFStudio-<sürüm>-release.apk`.
Derleme ortak arayüzü `app/src/main/assets/www` içine kendiliğinden kopyalar
(`node` yolda değilse `NODE=/yol/node` verin). Android Studio ile de açılabilir.

> NTFS/FAT disklerde çalıştırma biti tutulmadığı için `./gradlew` yerine
> `bash gradlew` kullanın.

### İmza

`keystore.properties` dosyası (ya da aynı adlı ortam değişkenleri) yoksa yayın
APK'sı Android hata ayıklama anahtarıyla imzalanır: telefona doğrudan kurulur,
ama Play Store'a yüklenemez. Kendi anahtarınız için:

```properties
# ANDROID/keystore.properties (depoya eklenmez)
storeFile=/tam/yol/anahtar.jks
storePassword=...
keyAlias=...
keyPassword=...
```

GitHub Actions'ta aynı değerler `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
depo sırlarıyla verilir.

## Kurulum (telefona)

APK'yı telefona indirip açın; ilk seferde "bilinmeyen kaynaklardan yüklemeye
izin ver" istenir. Ya da USB hata ayıklama açıkken:

```bash
adb install -r PDFStudio-1.0.0-release.apk
```

## Sürüm

Tek kaynak `../MOBIL_ORTAK/package.json` içindeki `version`dır; `versionCode`
buradan hesaplanır (1.2.3 → 10203). Değiştirmek için:

```bash
node ../MOBIL_ORTAK/scripts/set_version.mjs 1.2.3
```
