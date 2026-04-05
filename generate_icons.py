#!/usr/bin/env python3
"""
Generate elegant orange icons for MiStorePK Hide Sold Out extension.
Icon concept: a hidden eye (eye + diagonal slash) on a rich orange gradient.
"""

import os, math
from PIL import Image, ImageDraw, ImageFilter

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "img")
SIZES = [16, 48, 128]

# --- Palette ---
ORANGE_TOP    = (255, 160,  30)   # warm amber
ORANGE_BOTTOM = (210,  60,   0)   # deep burnt orange
WHITE         = (255, 255, 255)
SHADOW        = (160,  40,   0)   # subtle depth color

def make_icon(size: int) -> Image.Image:
    S = size
    scale = S / 128          # everything designed at 128, then scaled
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # ── 1. Background: orange radial gradient rounded-rect ──────────────────
    radius = int(S * 0.22)
    pad    = max(1, int(S * 0.04))

    # Build a radial gradient by stacking semi-transparent ellipses
    gradient_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gradient_layer)

    steps = 48
    for i in range(steps, -1, -1):
        t = i / steps
        r = int(ORANGE_TOP[0] * (1-t) + ORANGE_BOTTOM[0] * t)
        g = int(ORANGE_TOP[1] * (1-t) + ORANGE_BOTTOM[1] * t)
        b = int(ORANGE_TOP[2] * (1-t) + ORANGE_BOTTOM[2] * t)
        shrink = int(t * S * 0.45)
        x0 = pad + shrink
        y0 = pad + shrink
        x1 = S - pad - shrink
        y1 = S - pad - shrink
        r_c = max(2, radius - shrink)
        if x1 > x0 and y1 > y0:
            gd.rounded_rectangle([x0, y0, x1, y1], radius=r_c, fill=(r, g, b, 255))

    # Soft outer shadow behind background
    shadow_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    sp = max(1, int(S * 0.06))
    sd.rounded_rectangle([pad+sp, pad+sp, S-pad+sp, S-pad+sp],
                         radius=radius, fill=(100, 20, 0, 80))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=int(S*0.04)+1))
    img = Image.alpha_composite(img, shadow_layer)
    img = Image.alpha_composite(img, gradient_layer)
    draw = ImageDraw.Draw(img)

    # Specular highlight (top-left arc)
    hi = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hi)
    hd.ellipse([int(S*0.08), int(S*0.06), int(S*0.72), int(S*0.52)],
               fill=(255, 255, 255, 28))
    hi = hi.filter(ImageFilter.GaussianBlur(radius=max(1, int(S*0.06))))
    img = Image.alpha_composite(img, hi)
    draw = ImageDraw.Draw(img)

    # ── 2. Icon: hidden eye (eye + diagonal slash) ───────────────────────────
    if S >= 24:
        cx  = S * 0.50
        cy  = S * 0.50
        ew  = S * 0.58   # eye total width
        eh  = S * 0.26   # eye total height
        lw  = max(1, int(S * 0.07))   # line width

        # Eye outline — two arcs forming a lens
        # Top arc (upper eyelid)
        arc_pad = int(S * 0.005)
        bbox_top = [
            cx - ew/2 - arc_pad,
            cy - eh * 1.05,
            cx + ew/2 + arc_pad,
            cy + eh * 0.35,
        ]
        bbox_bot = [
            cx - ew/2 - arc_pad,
            cy - eh * 0.35,
            cx + ew/2 + arc_pad,
            cy + eh * 1.05,
        ]
        draw.arc(bbox_top, start=20, end=160, fill=WHITE, width=lw)
        draw.arc(bbox_bot, start=200, end=340, fill=WHITE, width=lw)

        # Pupil circle
        pr = S * 0.085
        draw.ellipse([cx - pr, cy - pr, cx + pr, cy + pr], fill=WHITE)

        # Diagonal slash from bottom-left to top-right
        sx0 = int(cx - ew * 0.36)
        sy0 = int(cy + S * 0.22)
        sx1 = int(cx + ew * 0.36)
        sy1 = int(cy - S * 0.22)
        slw = max(2, int(S * 0.085))

        # Thin dark shadow behind slash for contrast
        draw.line([(sx0+1, sy0+1), (sx1+1, sy1+1)], fill=(160, 40, 0, 200), width=slw+2)
        # White slash
        draw.line([(sx0, sy0), (sx1, sy1)], fill=WHITE, width=slw)

        # Small round caps on slash ends
        cap_r = slw // 2
        draw.ellipse([sx0-cap_r, sy0-cap_r, sx0+cap_r, sy0+cap_r], fill=WHITE)
        draw.ellipse([sx1-cap_r, sy1-cap_r, sx1+cap_r, sy1+cap_r], fill=WHITE)

    else:
        # 16×16: just a bold "×" mark (hidden symbol)
        lw = max(1, int(S * 0.14))
        m  = int(S * 0.25)
        draw.line([(m, m), (S-m, S-m)], fill=WHITE, width=lw)
        draw.line([(S-m, m), (m, S-m)], fill=WHITE, width=lw)

    # ── 3. Mild anti-alias pass ──────────────────────────────────────────────
    img = img.filter(ImageFilter.SMOOTH_MORE)
    return img


os.makedirs(OUTPUT_DIR, exist_ok=True)

for size in SIZES:
    icon = make_icon(size)
    path = os.path.join(OUTPUT_DIR, f"icon{size}.png")
    icon.save(path, "PNG")
    print(f"  icon{size}.png  ({size}×{size})")

print("\nAll icons saved to /img/")
