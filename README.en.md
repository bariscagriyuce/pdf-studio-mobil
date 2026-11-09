# YUCE PDF EDITOR — Mobile

[Türkçe](README.md) · **English** · [Português (Brasil)](README.pt-BR.md)

*YUCE PDF Düzenleyici*

An Adobe Acrobat Pro–style PDF editor for **Android** and **iOS / iPadOS**.
It uses the **same PDF engine** (MuPDF) and offers the same features as the
desktop version [YUCE PDF EDITOR](https://github.com/bariscagriyuce/pdf-studio)
(Windows / Linux), with an interface adapted for touch. It works completely
offline: no data ever leaves the device, and the app does not even request
Internet permission.

| | |
|---|---|
| **Engine** | MuPDF (official WebAssembly build, mupdf.js) — the same core as PyMuPDF on the desktop |
| **OCR** | Tesseract (tesseract.js), Turkish + English language data bundled with the app |
| **Interface** | Touch-first, dark/light theme, phone and tablet layouts; Türkçe, English, Português (Brasil) |
| **Platform** | Android 8.0+ · iOS / iPadOS 15+ |

> **Name change (1.1.0):** The app, formerly *PDF Studio*, is now *YUCE PDF
> EDITOR* (*YUCE PDF Düzenleyici* in Turkish). The package ID did not change,
> so it installs over 1.0.0 and keeps your settings and recent files.

> **Interface languages (1.2.0):** Turkish, English and Brazilian Portuguese.
> The device language is used by default; switch instantly with
> **Appearance → Language…** or **Tools → Settings… → Language** (the open
> document stays open). Number and percentage formats and the app name follow
> the selected language. On Android 13+, the choice is also applied to the
> system *App language* setting; on iOS, the app's system language is chosen
> under *Settings → YUCE PDF → Language*.

---

## Installation

From the [Releases](https://github.com/bariscagriyuce/pdf-studio-mobil/releases) page:

| Platform | File | How to install |
|---|---|---|
| **Android** | `YUCE-PDF-Editor-<version>.apk` | Download to your phone and open it (you may be asked to "allow installs from unknown sources") |
| **iOS / iPadOS** | `YUCE-PDF-Editor-<version>-unsigned.ipa` | Sign it with your own Apple ID and install using [AltStore](https://altstore.io) or [Sideloadly](https://sideloadly.io). If you have a Mac, you can install directly from Xcode (see [`IOS/README.md`](IOS/README.md)). |

---

## Features

Everything the desktop version can do:

- **Text editing** — tap a text block on the page; its content, font, size,
  color, alignment and line spacing are edited in a dialog with **live preview**.
  The old text is truly removed (redaction) and the new text is written into the
  page content. A Unicode font is embedded for Turkish characters (`ığşİĞŞ`).
- **Add text**, **find and replace** (original font and color preserved),
  **erase area**.
- **Annotations** — highlight, underline, strikeout, squiggly, sticky note, free
  text box, freehand pen drawing, rectangle, ellipse, line, arrow, polygon,
  stamp, link, file attachment; color, fill, width, opacity, author; move with
  your finger and resize from the corners.
- **Page management** — insert, delete, duplicate, rotate, reorder by dragging
  thumbnails, crop, resize, merge, split, extract, add images as pages, reverse;
  watermark, page numbers, header/footer, bookmarks.
- **Forms** — fill in, add fields (text, checkbox, list, combo box, signature
  field), JSON export/import, flatten.
- **Images** — insert, move/resize, replace, delete, export.
- **Signature** — draw with your finger/stylus, type it, or import a transparent
  PNG; it is saved for reuse.
- **Security** — AES-256/AES-128/RC4 encryption, permissions, password removal,
  **true redaction**, metadata and JavaScript cleanup.
- **Export** — PNG/JPG/WEBP images (36–1200 DPI), text/HTML/XHTML/XML/JSON,
  selected pages, embedded images, size reduction. Multiple files are saved or
  shared as a ZIP.
- **Print area** — draw a box on the page and only that region is printed:
  fit to paper / actual size / custom scale, centering, crop marks, printing
  the same area on multiple pages (labels, receipts, form sections); the paper
  turns landscape automatically for wide areas. **Save as PDF** exports the
  area at actual size in vector quality (text stays selectable, annotations
  included).
- **OCR** — adds a searchable text layer to scanned pages (on-device, offline).
- **Viewing** — continuous / single / two-page / two-page with cover layouts,
  8%–1200% zoom (pinch), panels (pages, bookmarks, annotations, search, forms,
  images), search (including Turkish case folding).
- **Mobile integration** — system file picker, "Save" overwrites the original
  file (iCloud, Google Drive…), recent files, PDFs received via "Open with" /
  "Share", system share sheet and printing, Android back button, tablet keyboard
  shortcuts (same as desktop).

---

## Project structure

```
MOBIL_ORTAK/   Shared PDF engine and touch interface (both platforms run this)
ANDROID/       Android app — Kotlin shell, Gradle
IOS/           iOS / iPadOS app — Swift shell, Xcode
.github/workflows/build.yml   Engine tests + APK + IPA build and release
```

Details (in Turkish): [`MOBIL_ORTAK/README.md`](MOBIL_ORTAK/README.md) ·
[`ANDROID/README.md`](ANDROID/README.md) · [`IOS/README.md`](IOS/README.md)

## Building it yourself

```bash
cd MOBIL_ORTAK && npm install && npm test
```

Android: `cd ANDROID && bash gradlew assembleRelease` (JDK 17+, Android SDK 35).
iOS: open `IOS/PDFStudio.xcodeproj` in Xcode.

### Automated builds and releases

- **Manual build:** *Actions* → *Mobil derleme* → *Run workflow*. Outputs are
  kept as artifacts for 90 days.
- **Publishing a release:** `git tag v1.2.3 && git push --tags`. The version
  number is read from the tag (`MOBIL_ORTAK/scripts/set_version.mjs`), and the
  APK and IPA are uploaded permanently to the *Releases* page with SHA256
  checksums.

Every build first passes the shared engine's 66-step test suite and the
translation check (missing translations, placeholder mismatches).

### Translations

The source language is Turkish: the Turkish text in the code is also the
translation key (`MOBIL_ORTAK/web/js/i18n.js`, the same gettext-style approach
as the desktop app). Translations live in `MOBIL_ORTAK/web/js/locales/en.js`
and `pt_BR.js`. After a change, `npm test` reports any missing translations;
`node test/i18n.test.mjs --missing missing.json` lists them as JSON.

## License

The code is free to use. Dependency licenses apply: MuPDF / mupdf.js
**AGPL-3.0** (distributing the app as a closed-source commercial product
requires a commercial license from Artifex), tesseract.js **Apache-2.0**,
Liberation fonts **OFL 1.1**, DejaVu fonts **Bitstream Vera** license.

> **Redaction is irreversible:** once applied and the document is saved, the
> content is truly deleted. Back up important documents.
