# -*- coding: utf-8 -*-
"""
为 Android 工程生成：
  1. 各密度启动图标（mipmap-*/ic_launcher.png、ic_launcher_round.png、ic_launcher_foreground.png）
  2. 自适应图标前景/背景色
  3. 启动屏 splash.png（各密度）
  4. 修正 strings.xml（避免中文乱码）
"""
import os
import re
import shutil

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANDROID = os.path.join(ROOT, "android", "app", "src", "main")
RES = os.path.join(ANDROID, "res")
SRC_ICON = os.path.join(ROOT, "public", "icon-512.png")

BRAND = (79, 124, 255)
BRAND2 = (138, 107, 255)

# Android 各密度对应的启动图标尺寸（48dp）
MIPMAPS = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

# 自适应图标前景（108dp 画布，内容占中间 72dp 安全区）
FOREGROUND = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}

# 启动屏尺寸（各密度，竖屏/横屏）
SPLASH = {
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
}


def load_font(size):
    for cand in (
        r"C:\Windows\Fonts\msyhbd.ttc",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
    ):
        if os.path.exists(cand):
            try:
                return ImageFont.truetype(cand, size)
            except Exception:
                continue
    return ImageFont.load_default()


def gradient_square(size, radius_ratio=0.22, rounded=True):
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(s):
        t = y / max(1, s - 1)
        r = int(BRAND[0] + (BRAND2[0] - BRAND[0]) * t)
        g = int(BRAND[1] + (BRAND2[1] - BRAND[1]) * t)
        b = int(BRAND[2] + (BRAND2[2] - BRAND[2]) * t)
        d.line([(0, y), (s, y)], fill=(r, g, b, 255))
    if rounded:
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, s - 1, s - 1], radius=int(s * radius_ratio), fill=255
        )
        img.putalpha(mask)
    return img.resize((size, size), Image.LANCZOS)


def draw_word(img, size, text="词", ratio=0.56):
    d = ImageDraw.Draw(img)
    font = load_font(int(size * ratio))
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(
        ((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1]),
        text,
        font=font,
        fill=(255, 255, 255, 255),
    )
    return img


def make_launcher_icons():
    for density, size in MIPMAPS.items():
        folder = os.path.join(RES, f"mipmap-{density}")
        os.makedirs(folder, exist_ok=True)

        # 普通图标
        icon = gradient_square(size)
        draw_word(icon, size, ratio=0.58)
        icon.save(os.path.join(folder, "ic_launcher.png"), "PNG", optimize=True)

        # 圆形图标
        s4 = size * 4
        base = gradient_square(size, rounded=False)
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
        round_icon = base.copy()
        round_icon.putalpha(mask)
        draw_word(round_icon, size, ratio=0.52)
        round_icon.save(os.path.join(folder, "ic_launcher_round.png"), "PNG", optimize=True)

        # 自适应图标前景（透明底 + 居中字）
        fg_size = FOREGROUND[density]
        fg = Image.new("RGBA", (fg_size, fg_size), (0, 0, 0, 0))
        # 前景内容限制在中间 60% 安全区
        inner = int(fg_size * 0.60)
        glyph = Image.new("RGBA", (inner, inner), (0, 0, 0, 0))
        draw_word(glyph, inner, ratio=0.82)
        fg.alpha_composite(glyph, ((fg_size - inner) // 2, (fg_size - inner) // 2))
        fg.save(os.path.join(folder, "ic_launcher_foreground.png"), "PNG", optimize=True)

        print(f"  图标 mipmap-{density} ({size}px / fg {fg_size}px)")


def make_adaptive_xml():
    """自适应图标 XML：背景色 + 前景图"""
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        p = os.path.join(RES, "mipmap-anydpi-v26", name)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(
                '<?xml version="1.0" encoding="utf-8"?>\n'
                '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                '    <background android:drawable="@color/ic_launcher_background" />\n'
                '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
                "</adaptive-icon>\n"
            )
        print("  ", p)


def make_colors():
    """品牌色 + 自适应图标背景色"""
    p = os.path.join(RES, "values", "colors.xml")
    content = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        '    <color name="colorPrimary">#4F7CFF</color>\n'
        '    <color name="colorPrimaryDark">#3B63D6</color>\n'
        '    <color name="colorAccent">#8A6BFF</color>\n'
        '    <color name="ic_launcher_background">#4F7CFF</color>\n'
        '    <color name="splash_background">#F5F7FB</color>\n'
        "</resources>\n"
    )
    with open(p, "w", encoding="utf-8") as f:
        f.write(content)
    print("  ", p)


def make_splash():
    """启动屏：浅色底 + 居中圆角图标"""
    for folder, (w, h) in SPLASH.items():
        d = os.path.join(RES, folder)
        os.makedirs(d, exist_ok=True)
        img = Image.new("RGB", (w, h), (245, 247, 251))
        # 图标边长取短边的 26%
        side = int(min(w, h) * 0.26)
        icon = gradient_square(side)
        draw_word(icon, side, ratio=0.58)
        img.paste(icon, ((w - side) // 2, (h - side) // 2), icon)
        img.save(os.path.join(d, "splash.png"), "PNG", optimize=True)
        print(f"  启动屏 {folder} {w}x{h}")


def fix_strings():
    """重写 strings.xml，确保中文以 UTF-8 正确写入"""
    p = os.path.join(RES, "values", "strings.xml")
    content = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        '    <string name="app_name">背单词</string>\n'
        '    <string name="title_activity_main">背单词</string>\n'
        '    <string name="package_name">io.github.xeycmd.word</string>\n'
        '    <string name="custom_url_scheme">io.github.xeycmd.word</string>\n'
        "</resources>\n"
    )
    with open(p, "w", encoding="utf-8") as f:
        f.write(content)
    print("  ", p)


def main():
    print("生成 Android 图标与启动屏…")
    make_launcher_icons()
    make_adaptive_xml()
    make_colors()
    make_splash()
    fix_strings()
    print("完成")


if __name__ == "__main__":
    main()
