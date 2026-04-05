#!/usr/bin/env python3
"""
Generate Chrome Web Store graphics for MiStorePK Hide Sold Out.
  - img/promo_tile.png   440 x 280  (store listing tile)
  - img/screenshot1.png  1280 x 800 (store screenshot)
"""

import os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "img")
os.makedirs(OUT, exist_ok=True)

# ── Palette ────────────────────────────────────────────────────────────────
ORANGE_BRIGHT = (255, 155,  30)
ORANGE_DEEP   = (200,  55,   0)
ORANGE_DARK   = (140,  30,   0)
WHITE         = (255, 255, 255)
OFF_WHITE     = (255, 248, 240)
GREY_CARD     = (220, 215, 210)
GREY_TEXT     = (170, 160, 150)
DARK_BG       = ( 24,  20,  16)

def load_icon(size):
    path = os.path.join(OUT, f"icon{size}.png")
    if os.path.exists(path):
        return Image.open(path).convert("RGBA")
    return None

def orange_gradient(img, draw, x0, y0, x1, y1, steps=60):
    """Fill a rect with a top-left → bottom-right orange gradient."""
    w = x1 - x0
    h = y1 - y0
    for i in range(steps):
        t = i / (steps - 1)
        r = int(ORANGE_BRIGHT[0] * (1-t) + ORANGE_DEEP[0] * t)
        g = int(ORANGE_BRIGHT[1] * (1-t) + ORANGE_DEEP[1] * t)
        b = int(ORANGE_BRIGHT[2] * (1-t) + ORANGE_DEEP[2] * t)
        # Diagonal band
        bx0 = int(x0 + w * t * 0.6)
        bx1 = int(x0 + w * (t * 0.6 + 0.55))
        draw.rectangle([max(x0,bx0-2), y0, min(x1,bx1+2), y1], fill=(r,g,b,255))

def try_font(size, bold=False):
    candidates = [
        "arialbd.ttf" if bold else "arial.ttf",
        "Arial Bold.ttf" if bold else "Arial.ttf",
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
        "LiberationSans-Bold.ttf" if bold else "LiberationSans-Regular.ttf",
    ]
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass
    return ImageFont.load_default()

def centered_text(draw, text, font, y, width, color, shadow=None):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    x = (width - tw) // 2
    if shadow:
        draw.text((x+2, y+2), text, font=font, fill=shadow)
    draw.text((x, y), text, font=font, fill=color)


# ══════════════════════════════════════════════════════════════════════════════
# 1. PROMO TILE  440 × 280
# ══════════════════════════════════════════════════════════════════════════════
def make_promo_tile():
    W, H = 440, 280
    img = Image.new("RGBA", (W, H), DARK_BG)
    draw = ImageDraw.Draw(img)

    # Gradient background
    orange_gradient(img, draw, 0, 0, W, H)

    # Subtle diagonal light sweep
    sweep = Image.new("RGBA", (W, H), (0,0,0,0))
    sd = ImageDraw.Draw(sweep)
    sd.polygon([(0,0),(W*0.55,0),(W*0.35,H),(0,H)], fill=(255,255,255,22))
    sweep = sweep.filter(ImageFilter.GaussianBlur(12))
    img = Image.alpha_composite(img, sweep)
    draw = ImageDraw.Draw(img)

    # Icon (128px scaled to 80px, left side)
    icon = load_icon(128)
    if icon:
        icon = icon.resize((80, 80), Image.LANCZOS)
        img.paste(icon, (36, (H - 80) // 2), icon)

    # Title
    f_title = try_font(32, bold=True)
    f_sub   = try_font(17)
    f_tag   = try_font(14)

    tx = 36 + 80 + 22
    title_y = H // 2 - 52

    draw.text((tx+2, title_y+2), "MiStorePK", font=f_title, fill=(0,0,0,80))
    draw.text((tx,   title_y),   "MiStorePK", font=f_title, fill=WHITE)

    draw.text((tx+2, title_y+42), "Hide Sold Out", font=f_sub, fill=(0,0,0,80))
    draw.text((tx,   title_y+42), "Hide Sold Out", font=f_sub, fill=OFF_WHITE)

    # Divider line
    draw.rectangle([tx, title_y+70, tx+210, title_y+72], fill=(255,255,255,80))

    # Tagline
    tag = "Only see what you can actually buy."
    draw.text((tx+1, title_y+82), tag, font=f_tag, fill=(0,0,0,60))
    draw.text((tx,   title_y+80), tag, font=f_tag, fill=(255, 235, 200))

    # Bottom "FREE · No data collected" badge
    badge_w, badge_h = 200, 28
    bx = (W - badge_w) // 2
    by = H - 42
    draw.rounded_rectangle([bx, by, bx+badge_w, by+badge_h],
                            radius=14, fill=(0,0,0,60))
    f_badge = try_font(12)
    centered_text(draw, "FREE  ·  No data collected  ·  by TechNerdXp",
                  f_badge, by+7, W, (255,230,180))

    img = img.convert("RGB")
    path = os.path.join(OUT, "promo_tile.png")
    img.save(path, "PNG")
    print(f"  promo_tile.png  (440×280)")


# ══════════════════════════════════════════════════════════════════════════════
# 2. SCREENSHOT  1280 × 800
# ══════════════════════════════════════════════════════════════════════════════
def mock_product_card(draw, img, x, y, w, h, sold_out=False, label="Product"):
    """Draw a minimal product card mockup."""
    r = 10
    # Card shadow
    shadow = Image.new("RGBA", img.size, (0,0,0,0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([x+4, y+4, x+w+4, y+h+4], radius=r, fill=(0,0,0,30))
    shadow = shadow.filter(ImageFilter.GaussianBlur(6))
    img_ref = Image.alpha_composite(img.convert("RGBA"), shadow)
    img.paste(img_ref.convert("RGB"))
    draw = ImageDraw.Draw(img)

    if sold_out:
        # Dimmed card
        draw.rounded_rectangle([x, y, x+w, y+h], radius=r, fill=(235,228,220))
        # Image placeholder (grey)
        draw.rounded_rectangle([x+12, y+12, x+w-12, y+h-60], radius=6,
                                fill=(210,203,195))
        # Diagonal lines (sold-out pattern)
        for i in range(-h, w, 18):
            draw.line([(x+12+i, y+12), (x+12+i+h, y+h-60)],
                      fill=(195,188,180), width=1)
        # "SOLD OUT" badge
        bw = 74
        draw.rounded_rectangle([x+w//2-bw//2, y+h//2-52, x+w//2+bw//2, y+h//2-34],
                                radius=4, fill=(200,80,0))
        f_so = try_font(10, bold=True)
        centered_text(draw, "SOLD OUT", f_so, y+h//2-50, x*2+w, WHITE)
        # Name placeholder (greyed)
        draw.rounded_rectangle([x+16, y+h-52, x+w-16, y+h-40], radius=3,
                                fill=GREY_TEXT)
        draw.rounded_rectangle([x+24, y+h-36, x+w-40, y+h-26], radius=3,
                                fill=(190,183,175))
    else:
        # Normal card
        draw.rounded_rectangle([x, y, x+w, y+h], radius=r, fill=WHITE)
        # Image area (warm white)
        draw.rounded_rectangle([x+12, y+12, x+w-12, y+h-60], radius=6,
                                fill=(245,240,235))
        # Simple phone silhouette placeholder
        pw, ph = 28, 48
        px = x + (w - pw) // 2
        py_c = y + 12 + ((h - 72 - 24) - ph) // 2
        draw.rounded_rectangle([px, py_c, px+pw, py_c+ph], radius=5,
                                fill=(200,195,190))
        # Name
        f_nm = try_font(11)
        draw.rounded_rectangle([x+16, y+h-52, x+w-16, y+h-40], radius=3,
                                fill=(60,50,40))
        # Price
        draw.rounded_rectangle([x+16, y+h-34, x+w//2, y+h-24], radius=3,
                                fill=ORANGE_DEEP)

    return draw


def make_screenshot():
    W, H = 1280, 800
    img = Image.new("RGB", (W, H), (245, 241, 236))
    draw = ImageDraw.Draw(img)

    # ── Browser chrome bar ──
    draw.rectangle([0, 0, W, 52], fill=(245,245,245))
    draw.rectangle([0, 52, W, 54], fill=(210,210,210))
    # Traffic lights
    for i, col in enumerate([(255,95,87),(255,189,46),(39,201,63)]):
        draw.ellipse([14+i*22, 18, 28+i*22, 32], fill=col)
    # URL bar
    draw.rounded_rectangle([200, 12, 900, 40], radius=6, fill=WHITE)
    f_url = try_font(13)
    draw.text((214, 18), "https://mistore.pk/collections/all", font=f_url,
              fill=(100,100,100))
    # Extension icon in toolbar
    icon = load_icon(48)
    if icon:
        ico_sm = icon.resize((24, 24), Image.LANCZOS)
        img.paste(ico_sm, (W - 90, 14), ico_sm)

    # ── Page header ──
    draw.rectangle([0, 54, W, 110], fill=(255,255,255))
    f_site = try_font(22, bold=True)
    f_head = try_font(14)
    draw.text((50, 68), "mistore.pk", font=f_site, fill=ORANGE_DEEP)
    draw.text((50 + 160, 78), "— All Products", font=f_head, fill=(150,140,130))

    # ── Collection grid ──
    cols, rows = 4, 2
    card_w, card_h = 220, 280
    grid_x = (W - (cols * card_w + (cols-1) * 20)) // 2
    grid_y = 130
    gap = 20

    # Sold-out pattern: positions 1, 3, 5 (0-indexed) are sold out
    sold_pattern = [False, True, False, True, False, True, False, False]

    for row in range(rows):
        for col in range(cols):
            idx = row * cols + col
            x = grid_x + col * (card_w + gap)
            y = grid_y + row * (card_h + gap)
            draw = mock_product_card(draw, img, x, y, card_w, card_h,
                                     sold_out=sold_pattern[idx])

    draw = ImageDraw.Draw(img)

    # ── Annotation: "Extension hides these" arrow on sold-out card ──
    # Point to the first sold-out card (index 1, col=1, row=0)
    target_x = grid_x + 1*(card_w+gap) + card_w//2
    target_y = grid_y + card_h//2

    ann_x, ann_y = target_x - 130, grid_y - 56
    f_ann = try_font(13, bold=True)

    # Callout bubble
    draw.rounded_rectangle([ann_x-10, ann_y-10, ann_x+230, ann_y+30],
                            radius=8, fill=ORANGE_DEEP)
    draw.text((ann_x, ann_y+2), "Hidden by extension", font=f_ann, fill=WHITE)
    # Arrow
    draw.line([(ann_x+95, ann_y+20), (target_x-10, target_y-40)],
              fill=ORANGE_DEEP, width=2)
    draw.polygon([
        (target_x-10, target_y-30),
        (target_x-18, target_y-48),
        (target_x-2,  target_y-48),
    ], fill=ORANGE_DEEP)

    # ── Bottom banner ──
    banner_h = 72
    banner = Image.new("RGBA", (W, banner_h), (0,0,0,0))
    bd = ImageDraw.Draw(banner)
    orange_gradient(img=banner, draw=bd, x0=0, y0=0, x1=W, y1=banner_h)
    bd.rectangle([0,0,W,banner_h], fill=(0,0,0,0))  # let gradient show
    img.paste(banner.convert("RGB"), (0, H - banner_h))
    draw = ImageDraw.Draw(img)
    # Re-draw gradient properly
    for i in range(banner_h):
        t = i / banner_h
        r = int(ORANGE_DEEP[0]*(1-t) + ORANGE_DARK[0]*t)
        g = int(ORANGE_DEEP[1]*(1-t) + ORANGE_DARK[1]*t)
        b = int(ORANGE_DEEP[2]*(1-t) + ORANGE_DARK[2]*t)
        draw.rectangle([0, H-banner_h+i, W, H-banner_h+i+1], fill=(r,g,b))

    f_ban = try_font(18, bold=True)
    f_sub = try_font(13)
    centered_text(draw, "MiStorePK Hide Sold Out",
                  f_ban, H - banner_h + 10, W, WHITE,
                  shadow=(0,0,0,60))
    centered_text(draw, "Automatically hides sold-out listings · Works on all pages · by TechNerdXp",
                  f_sub, H - banner_h + 40, W, (255, 225, 185))

    path = os.path.join(OUT, "screenshot1.png")
    img.save(path, "PNG")
    print(f"  screenshot1.png  (1280×800)")


# ── Run ───────────────────────────────────────────────────────────────────────
print("Generating store graphics...")
make_promo_tile()
make_screenshot()
print("\nDone! Files saved to /img/")
