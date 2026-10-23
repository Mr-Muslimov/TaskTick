"""Генерация иконок TaskTick (PNG + SVG) для PWA/APK."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
os.makedirs(OUT, exist_ok=True)

C1 = (71, 114, 250)    # #4772fa
C2 = (124, 92, 255)    # #7c5cff


def gradient(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x / (size - 1) + y / (size - 1)) / 2
            px[x, y] = (
                round(C1[0] + (C2[0] - C1[0]) * t),
                round(C1[1] + (C2[1] - C1[1]) * t),
                round(C1[2] + (C2[2] - C1[2]) * t),
            )
    return img


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def check(draw, size, width, inset=0.0):
    """Белая галочка."""
    s = size
    p = lambda fx, fy: (s * fx, s * fy)
    pts = [p(0.30 + inset, 0.52), p(0.44 + inset, 0.66), p(0.72 - inset, 0.34)]
    draw.line(pts, fill=(255, 255, 255, 255), width=width, joint="curve")
    # скруглённые концы
    r = width / 2
    for (x, y) in pts:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, 255))


def make_icon(size, radius_ratio=0.22, inset=0.0, maskable=False):
    base = gradient(size).convert("RGBA")
    if maskable:
        # для maskable: фон во весь квадрат, логотип меньше (safe zone 80%)
        mask = Image.new("L", (size, size), 255)
    else:
        mask = rounded_mask(size, int(size * radius_ratio))
    base.putalpha(mask)

    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    w = max(2, int(size * (0.085 if maskable else 0.095)))
    check(d, size, w, inset=inset)
    base = Image.alpha_composite(base, layer)
    return base


# обычная иконка
for size in (192, 512):
    make_icon(size).save(os.path.join(OUT, f"icon-{size}.png"))

# maskable (Android adaptive)
make_icon(512, maskable=True, inset=0.04).save(os.path.join(OUT, "maskable-512.png"))

# apple touch (без прозрачности)
make_icon(180).convert("RGB").save(os.path.join(OUT, "apple-touch-icon.png"))

svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4772fa"/>
      <stop offset="1" stop-color="#7c5cff"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <path d="M154 266 L 226 338 L 366 172" fill="none" stroke="#fff"
        stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
"""
with open(os.path.join(OUT, "icon.svg"), "w", encoding="utf-8") as f:
    f.write(svg)

print("готово:")
for name in sorted(os.listdir(OUT)):
    print("  icons/" + name, os.path.getsize(os.path.join(OUT, name)), "байт")

