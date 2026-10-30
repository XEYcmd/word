# -*- coding: utf-8 -*-
"""生成 Tauri 打包所需的图标集（含 Windows .ico）。"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "icon-512.png")
DST = os.path.join(ROOT, "src-tauri", "icons")
os.makedirs(DST, exist_ok=True)

base = Image.open(SRC).convert("RGBA")

for size in (32, 128, 256, 512):
    p = os.path.join(DST, f"{size}x{size}.png")
    base.resize((size, size), Image.LANCZOS).save(p, "PNG", optimize=True)
    print(" ", p)

# Windows .ico：多尺寸打包
ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
ico_path = os.path.join(DST, "icon.ico")
base.save(ico_path, format="ICO", sizes=ico_sizes)
print(" ", ico_path, f"{os.path.getsize(ico_path)/1024:.1f} KB")

# macOS .icns 需要额外工具，这里用 512 PNG 兜底（CI 在 mac 上会用 icon.png）
p = os.path.join(DST, "icon.png")
base.save(p, "PNG", optimize=True)
print(" ", p)
