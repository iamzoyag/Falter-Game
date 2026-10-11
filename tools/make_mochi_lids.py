"""Mochi's eyelids: overlays for public/mochi/cute.webp (768x768).

  lids-closed.webp  her eyes shut (a blink): soft lower-lid curves with lashes
  lids-happy.webp   happy ^^ eyes

Each is transparent except over her eyes: the eyes are painted out with
the fur around them (OpenCV inpainting), then the closed eye is drawn on top
in the same mauve as her outlines. The game flashes them over her image for
a blink or a smile (src/mochi/MochiRig.js).

    python3 tools/make_mochi_lids.py
"""
import os
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "mochi")
SS = 4  # supersampling for the drawn lines

# eye boxes (x0, y0, x1, y1) and the corners used for the drawn lids
EYES = [
    dict(box=(274, 298, 360, 404), inner=(352, 366), outer=(288, 362), side=-1),  # her right (screen left)
    dict(box=(424, 302, 530, 404), inner=(436, 366), outer=(510, 362), side=1),   # her left (screen right)
]
LINE = (92, 56, 72, 255)


def eye_mask(rgb):
    h, w, _ = rgb.shape
    lum = rgb.mean(axis=2)
    mask = np.zeros((h, w), np.uint8)
    for e in EYES:
        x0, y0, x1, y1 = e["box"]
        sub = (lum[y0:y1, x0:x1] < 175).astype(np.uint8) * 255
        # fill the highlights and the iris (holes inside the dark outline)
        sub = cv2.morphologyEx(sub, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
        cnts, _ = cv2.findContours(sub, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        filled = np.zeros_like(sub)
        cv2.drawContours(filled, [c for c in cnts if cv2.contourArea(c) > 12], -1, 255, -1)
        mask[y0:y1, x0:x1] = np.maximum(mask[y0:y1, x0:x1], filled)
    return cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))


def curve(p0, p1, bend, n=40):
    """Quadratic curve from p0 to p1, its middle pushed down by `bend` px (negative = up)."""
    (x0, y0), (x1, y1) = p0, p1
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 + bend * 2
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 2 * np.array(p0) + 2 * (1 - t) * t * np.array([cx, cy]) + t ** 2 * np.array(p1)


def draw_lids(size, happy):
    layer = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for e in EYES:
        ox, oy = e["outer"]
        ix, iy = e["inner"]
        if happy:
            pts = curve((ox, oy + 4), (ix, iy + 2), -13)        # ^ ^
            width = 6.5
        else:
            pts = curve((ox, oy), (ix, iy), 9)                   # a sleepy closed eye
            width = 6
        d.line([(x * SS, y * SS) for x, y in pts], fill=LINE, width=int(width * SS), joint="curve")
        for (x, y) in (pts[0], pts[-1]):
            r = width * SS / 2
            d.ellipse([x * SS - r, y * SS - r, x * SS + r, y * SS + r], fill=LINE)
        # lashes: little flicks hanging off the outer part of the lid, pointing outwards
        s = e["side"]
        outer_first = pts if (s < 0) == (pts[0][0] < pts[-1][0]) else pts[::-1]
        # (step along the lid, direction pointing outwards for the screen-left eye, length)
        lashes = [(0, (-1, 0.1), 13), (4, (-0.85, 0.55), 12), (9, (-0.55, 0.85), 10)] if not happy \
            else [(0, (-1, -0.15), 12), (4, (-0.9, 0.4), 10)]
        for i, (ux, uy), length in lashes:
            x, y = outer_first[i]
            n = (ux * ux + uy * uy) ** 0.5
            dx, dy = ux / n * length, uy / n * length
            if s > 0:
                dx = -dx
            d.line([(x * SS, y * SS), ((x + dx) * SS, (y + dy) * SS)], fill=LINE, width=int(3.6 * SS))
            r = 1.8 * SS
            d.ellipse([(x + dx) * SS - r, (y + dy) * SS - r, (x + dx) * SS + r, (y + dy) * SS + r], fill=LINE)
    return layer.resize((size, size), Image.LANCZOS)


def main():
    src = Image.open(os.path.join(ROOT, "cute.webp")).convert("RGBA")
    rgba = np.array(src)
    rgb = rgba[..., :3].copy()
    mask = eye_mask(rgb)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    filled = cv2.cvtColor(cv2.inpaint(bgr, mask, 14, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB)
    # a whisper of texture so the patch isn't flatter than the fur around it
    blur = cv2.GaussianBlur(filled, (0, 0), 2.2)
    alpha = cv2.GaussianBlur(cv2.dilate(mask, np.ones((5, 5), np.uint8)), (0, 0), 2.5)
    patch = np.dstack([blur, alpha]).astype(np.uint8)
    base = Image.fromarray(patch, "RGBA")
    for name, happy in (("lids-closed.webp", False), ("lids-happy.webp", True)):
        out = base.copy()
        out.alpha_composite(draw_lids(src.width, happy))
        out.save(os.path.join(ROOT, name), "WEBP", quality=92, method=6)
        # a preview over the original, for checking by eye
        prev = src.copy()
        prev.alpha_composite(out)
        prev.crop((230, 250, 570, 450)).resize((680, 400)).save(os.path.join("/tmp", "preview-" + name.replace(".webp", ".png")))
    print("wrote lids-closed.webp, lids-happy.webp")


if __name__ == "__main__":
    main()
