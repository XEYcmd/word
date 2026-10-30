# -*- coding: utf-8 -*-
"""生成站点图标（SVG 手写 + PNG 由 Pillow 渲染）。"""
import io
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
os.makedirs(PUB, exist_ok=True)

BRAND = (79, 124, 255)
BRAND2 = (138, 107, 255)


def make_png(size: int, path: str, maskable: bool = False) -> None:
    """渐变底 + 白色「词」字。maskable 时留安全边距。"""
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 渐变背景
    for y in range(s):
        t = y / max(1, s - 1)
        r = int(BRAND[0] + (BRAND2[0] - BRAND[0]) * t)
        g = int(BRAND[1] + (BRAND2[1] - BRAND[1]) * t)
        b = int(BRAND[2] + (BRAND2[2] - BRAND[2]) * t)
        d.line([(0, y), (s, y)], fill=(r, g, b, 255))

    # 圆角（maskable 保持方形）
    if not maskable:
        radius = int(s * 0.22)
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=255)
        img.putalpha(mask)

    # 「词」字
    font = None
    for cand in (
        r"C:\Windows\Fonts\msyhbd.ttc",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
    ):
        if os.path.exists(cand):
            try:
                font = ImageFont.truetype(cand, int(s * (0.44 if maskable else 0.56)))
                break
            except Exception:
                continue

    if font is None:
        # 兜底：画字母 W
        font = ImageFont.load_default()

    text = "词"
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((s - tw) / 2 - bbox[0], (s - th) / 2 - bbox[1]), text, font=font, fill=(255, 255, 255, 255))

    img = img.resize((size, size), Image.LANCZOS)
    img.save(path, "PNG", optimize=True)
    print(f"  {path}  {os.path.getsize(path)/1024:.1f} KB")


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="背单词">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4f7cff"/>
      <stop offset="1" stop-color="#8a6bff"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>
  <text x="32" y="33" font-family="'PingFang SC','Microsoft YaHei',sans-serif"
        font-size="34" font-weight="700" fill="#fff" text-anchor="middle"
        dominant-baseline="central">词</text>
</svg>
"""

with io.open(os.path.join(PUB, "favicon.svg"), "w", encoding="utf-8") as f:
    f.write(SVG)
print("  public/favicon.svg")

make_png(192, os.path.join(PUB, "icon-192.png"))
make_png(512, os.path.join(PUB, "icon-512.png"))
make_png(512, os.path.join(PUB, "icon-maskable-512.png"), maskable=True)
make_png(180, os.path.join(PUB, "apple-touch-icon.png"), maskable=True)
