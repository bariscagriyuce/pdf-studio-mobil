"""Uygulama ikonundan (MOBIL_ORTAK/web/img/icon.png — masaüstü sürümle aynı
ikon) mobil ikonları üretir.

- Android: klasik mipmap PNG'leri + uyarlanabilir (adaptive) ikon katmanları
- iOS: 1024x1024, saydamlıksız AppIcon

Kullanım: python3 MOBIL_ORTAK/scripts/make_icons.py   (Pillow gerekir)
Üretilen dosyalar depoya işlenir; yalnızca ikon değişince yeniden çalıştırılır.
"""
from __future__ import annotations

import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(REPO, "MOBIL_ORTAK", "web", "img", "icon.png")
ANDROID_RES = os.path.join(REPO, "ANDROID", "app", "src", "main", "res")
IOS_ICON = os.path.join(REPO, "IOS", "PDFStudio", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-1024.png")

TOP_LEFT = (0x42, 0x7F, 0xF1)
BOTTOM_RIGHT = (0x2C, 0x52, 0xD3)

DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def gradient(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(TOP_LEFT, BOTTOM_RIGHT))
    return img


def foreground(src: Image.Image) -> Image.Image:
    """Mavi zemini saydam yapıp yalnızca belge + kalemi bırakır."""
    img = src.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and b > r + 60 and b > g + 30:
                px[x, y] = (r, g, b, 0)
    return img


def compose(size: int, fg: Image.Image, scale: float, bg: bool = True) -> Image.Image:
    base = gradient(size).convert("RGBA") if bg else Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = round(size * scale)
    f = fg.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    base.alpha_composite(f, (off, off))
    return base


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    fg = foreground(src)
    for name, k in DENSITIES.items():
        d = os.path.join(ANDROID_RES, f"mipmap-{name}")
        os.makedirs(d, exist_ok=True)
        legacy = round(48 * k)
        src.resize((legacy, legacy), Image.LANCZOS).save(os.path.join(d, "ic_launcher.png"))
        # yuvarlak klasik ikon
        rnd = compose(legacy, fg, 0.78)
        mask = Image.new("L", (legacy, legacy), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, legacy - 1, legacy - 1), fill=255)
        rnd.putalpha(mask)
        rnd.save(os.path.join(d, "ic_launcher_round.png"))
        # uyarlanabilir katmanlar (108 dp; güvenli alan 66 dp)
        full = round(108 * k)
        gradient(full).save(os.path.join(d, "ic_launcher_background.png"))
        compose(full, fg, 80 / 108, bg=False).save(os.path.join(d, "ic_launcher_foreground.png"))
    os.makedirs(os.path.dirname(IOS_ICON), exist_ok=True)
    compose(1024, fg, 0.86).convert("RGB").save(IOS_ICON)
    print("ikonlar üretildi")


if __name__ == "__main__":
    main()
