# YUCE PDF Düzenleyici — Mobil

*YUCE PDF EDITOR*

**Android** ve **iOS / iPadOS** için Adobe Acrobat Pro benzeri PDF düzenleyici.
Masaüstü sürüm [YUCE PDF Düzenleyici](https://github.com/bariscagriyuce/pdf-studio)
(Windows / Linux) ile **aynı PDF motorunu** (MuPDF) ve aynı özellikleri
dokunmatik kullanıma uyarlanmış bir arayüzle sunar. Tamamen çevrimdışı
çalışır; hiçbir veri dışarı gönderilmez, uygulama İnternet izni bile istemez.

| | |
|---|---|
| **Motor** | MuPDF (resmi WebAssembly sürümü mupdf.js) — masaüstündeki PyMuPDF ile aynı çekirdek |
| **OCR** | Tesseract (tesseract.js), Türkçe + İngilizce dil verisi uygulamanın içinde |
| **Arayüz** | Dokunmatik, koyu/açık tema, telefon ve tablet düzeni; Türkçe, English, Português (Brasil) |
| **Platform** | Android 8.0+ · iOS / iPadOS 15+ |

> **Ad değişikliği (1.1.0):** Uygulamanın adı *PDF Studio* iken *YUCE PDF
> Düzenleyici* oldu; Türkçe dışındaki dillerde *YUCE PDF EDITOR* görünür.
> Paket kimliği değişmediği için 1.0.0'ın üzerine güncellenir, ayarlar ve son
> kullanılanlar korunur.

> **Arayüz dilleri (1.2.0):** Türkçe, İngilizce ve Brezilya Portekizcesi.
> Varsayılan olarak cihaz dili kullanılır; **Görünüm → Dil…** veya
> **Tercihler → Dil** ile anında değiştirilir (belge açık kalır). Sayı ve
> yüzde biçimleri ile uygulama adı seçilen dili izler. Android 13+ sürümünde
> seçim sistemin *Uygulama dili* ayarına da işlenir; iOS'ta uygulamanın
> sistem dili *Ayarlar → YUCE PDF → Dil* bölümünden seçilir.

---

## Kurulum

[Releases](https://github.com/bariscagriyuce/pdf-studio-mobil/releases) sayfasından:

| Platform | Dosya | Kurulum |
|---|---|---|
| **Android** | `YUCE-PDF-Editor-<sürüm>.apk` | Telefona indirip açın ("bilinmeyen kaynaklardan yüklemeye izin ver" istenebilir) |
| **iOS / iPadOS** | `YUCE-PDF-Editor-<sürüm>-unsigned.ipa` | [AltStore](https://altstore.io) ya da [Sideloadly](https://sideloadly.io) ile kendi Apple kimliğinizle imzalayıp yükleyin. Mac'iniz varsa Xcode ile doğrudan kurabilirsiniz (bkz. [`IOS/README.md`](IOS/README.md)). |

---

## Yetenekler

Masaüstü sürümün tüm özellikleri:

- **Metin düzenleme** — sayfadaki bir metin bloğuna dokunun; içerik, yazı tipi,
  punto, renk, hizalama ve satır aralığı **canlı önizlemeli** pencerede düzenlenir.
  Eski metin gerçekten kaldırılır (redaksiyon), yenisi sayfa içeriğine yazılır.
  Türkçe karakterler (`ığşİĞŞ`) için Unicode yazı tipi gömülür.
- **Metin ekle**, **bul ve değiştir** (özgün yazı tipi ve renk korunur),
  **alanı sil**.
- **Açıklamalar** — vurgu, altı/üstü çizili, dalgalı, yapışkan not, serbest metin
  kutusu, kalemle serbest çizim, dikdörtgen, elips, çizgi, ok, çokgen, damga,
  bağlantı, dosya eki; renk, dolgu, kalınlık, saydamlık, yazar; parmakla taşıma
  ve köşelerden boyutlandırma.
- **Sayfa yönetimi** — ekleme, silme, çoğaltma, döndürme, küçük resimlerden
  sürükleyerek sıralama, kırpma, boyut değiştirme, birleştirme, bölme, çıkarma,
  görüntüleri sayfa olarak ekleme, ters çevirme; filigran, sayfa numarası,
  üst/alt bilgi, yer imleri.
- **Formlar** — doldurma, alan ekleme (metin, onay kutusu, liste, açılır liste,
  imza alanı), JSON dışa/içe aktarma, düzleştirme.
- **Görüntüler** — ekleme, taşıma/boyutlandırma, değiştirme, silme, dışa aktarma.
- **İmza** — parmakla/kalemle çizin, yazın ya da saydam PNG içe aktarın; saklanır.
- **Güvenlik** — AES-256/AES-128/RC4 şifreleme, izinler, şifre kaldırma, **gerçek
  karartma**, meta veri ve JavaScript temizliği.
- **Dışa aktarma** — PNG/JPG/WEBP görüntü (36–1200 DPI), metin/HTML/XHTML/XML/JSON,
  seçili sayfalar, gömülü görüntüler, boyut küçültme. Birden çok dosya ZIP olarak
  kaydedilir ya da paylaşılır.
- **Seçili alanı yazdırma** — sayfada bir kutu çizin, yalnızca o bölge basılır:
  kâğıda sığdır / gerçek boyut / özel ölçek, ortalama, kesim işaretleri, aynı
  alanı birden çok sayfada basma (etiket, fiş, form kesiti); geniş alanlarda kâğıt
  kendiliğinden yatay. **PDF olarak kaydet** alanı gerçek boyutta, vektör
  kalitesinde çıkarır (metin seçilebilir, açıklamalar dahil).
- **OCR** — taranmış sayfalara aranabilir metin katmanı (cihazda, çevrimdışı).
- **Görüntüleme** — sürekli / tek / çift / kapaklı çift sayfa düzeni, %8–%1200
  yakınlaştırma (iki parmakla), paneller (sayfalar, yer imleri, açıklamalar, arama,
  formlar, görüntüler), arama (Türkçe büyük/küçük harf katlaması dahil).
- **Mobil tümleşme** — sistem dosya seçicisi, "Kaydet" ile özgün dosyanın
  üzerine yazma (iCloud, Google Drive…), son kullanılanlar, "Birlikte aç" /
  "Paylaş" ile gelen PDF'ler, sistem paylaşımı ve yazdırma, Android geri tuşu,
  tablet klavyesi kısayolları (masaüstüyle aynı).

---

## Proje yapısı

```
MOBIL_ORTAK/   Ortak PDF motoru ve dokunmatik arayüz (iki platform da bunu çalıştırır)
ANDROID/       Android uygulaması — Kotlin kabuğu, Gradle
IOS/           iOS / iPadOS uygulaması — Swift kabuğu, Xcode
.github/workflows/build.yml   Motor sınaması + APK + IPA derlemesi ve yayımlama
```

Ayrıntılar: [`MOBIL_ORTAK/README.md`](MOBIL_ORTAK/README.md) ·
[`ANDROID/README.md`](ANDROID/README.md) · [`IOS/README.md`](IOS/README.md)

## Kendiniz derlemek

```bash
cd MOBIL_ORTAK && npm install && npm test
```

Android: `cd ANDROID && bash gradlew assembleRelease` (JDK 17+, Android SDK 35).
iOS: `IOS/PDFStudio.xcodeproj`'u Xcode'da açın.

### Otomatik derleme ve sürüm yayımlama

- **Elle derleme:** *Actions* → *Mobil derleme* → *Run workflow*. Çıktılar 90 gün
  artefakt olarak saklanır.
- **Sürüm yayımlama:** `git tag v1.2.3 && git push --tags`. Sürüm numarası
  etiketten okunur (`MOBIL_ORTAK/scripts/set_version.mjs`), APK ve IPA
  *Releases* sayfasına SHA256 toplamlarıyla kalıcı olarak yüklenir.

Her derleme önce ortak motorun 66 adımlık sınamasından ve çeviri denetiminden
(eksik çeviri, yer tutucu uyumsuzluğu) geçer.

## Lisans

Kod serbestçe kullanılabilir. Bağımlılıkların lisansları geçerlidir:
MuPDF / mupdf.js **AGPL-3.0** (uygulamayı kapalı kaynak ticari bir ürün olarak
dağıtmak için Artifex'ten ticari lisans gerekir), tesseract.js **Apache-2.0**,
Liberation yazı tipleri **OFL 1.1**, DejaVu yazı tipleri **Bitstream Vera** lisansı.

> **Karartma geri alınamaz bir kayıttır:** uygulandıktan sonra belge kaydedilirse
> içerik gerçekten silinmiştir. Önemli belgelerin yedeğini alın.
