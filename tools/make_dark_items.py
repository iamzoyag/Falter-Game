"""Act VI (Lights Out) falling things for the midnight catch.

Writes, from the existing Mochi art (deterministic, no randomness):
  public/mochi/fall-ear-l.webp  her left ear, cut off, a little blood at the base
  public/mochi/fall-ear-r.webp  her right ear
  public/mochi/fall-eye.webp    one of her eyes, on its own

Run from the repo root:  python3 tools/make_dark_items.py
"""
import math
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

SRC = "public/mochi/"
BLOOD = (138, 6, 18)
BLOOD_HI = (196, 22, 34)


def bleed(img):
    """A wet band along the cut (the bottom edge of the ear) and a couple of drips."""
    a = np.array(img)
    alpha = a[:, :, 3]
    h, w = alpha.shape
    cols = [x for x in range(w) if alpha[:, x].max() > 200]
    bottoms = {x: int(np.where(alpha[:, x] > 200)[0].max()) for x in cols}
    lowest = max(bottoms.values())
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # only the bit of the outline that is the cut: near the lowest point
    cut = [x for x in cols if bottoms[x] > lowest - 38]
    for x in cut:
        y = bottoms[x]
        d.line([(x, y - 16), (x, y + 2)], fill=BLOOD + (255,))
    # drips, at fixed fractions along the cut
    for f, length in ((0.22, 26), (0.55, 40), (0.8, 18)):
        x = cut[int(f * (len(cut) - 1))]
        y = bottoms[x]
        d.line([(x, y), (x, y + length)], fill=BLOOD + (255,), width=5)
        d.ellipse([x - 5, y + length - 4, x + 5, y + length + 6], fill=BLOOD + (255,))
    layer = layer.filter(ImageFilter.GaussianBlur(1.2))
    # keep the band on the ear (or hanging off it), not floating outside it
    out = img.copy()
    out.alpha_composite(layer)
    # a highlight so it reads as wet
    hl = Image.new("RGBA", img.size, (0, 0, 0, 0))
    dh = ImageDraw.Draw(hl)
    for x in cut[len(cut) // 4: len(cut) // 2]:
        dh.point((x, bottoms[x] - 9), fill=BLOOD_HI + (200,))
    out.alpha_composite(hl.filter(ImageFilter.GaussianBlur(0.8)))
    return out


def crop(img):
    box = img.getbbox()
    pad = 50
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(img.width, box[2] + pad), min(img.height, box[3] + pad))
    return img.crop(box)


def ears():
    sprite = Image.open(SRC + "ear-sprite.webp").convert("RGBA")
    a = np.array(sprite)[:, :, 3]
    occ = a.max(0) > 0
    split = next(i for i in range(1, sprite.width) if occ[i - 1] and not occ[i])
    left = sprite.copy()
    ImageDraw.Draw(left).rectangle([split, 0, sprite.width, sprite.height], fill=(0, 0, 0, 0))
    right = sprite.copy()
    ImageDraw.Draw(right).rectangle([0, 0, split, sprite.height], fill=(0, 0, 0, 0))
    for name, im in (("l", left), ("r", right)):
        # extra room below for the drips
        canvas = Image.new("RGBA", (im.width, im.height + 80), (0, 0, 0, 0))
        canvas.alpha_composite(im)
        crop(bleed(canvas)).save(SRC + f"fall-ear-{name}.webp", quality=90)


def eye():
    """Her left eye: an eyeball the size of the drawn eye, with the drawn iris on it."""
    cute = Image.open(SRC + "cute.webp").convert("RGBA")
    # the drawn eye (lashes and all) sits at about this box in the 768px art
    ex0, ey0, ex1, ey1 = 289, 315, 350, 397
    cx, cy = (ex0 + ex1) / 2, (ey0 + ey1) / 2
    S = 4  # supersample
    R = 70 * S
    size = 2 * R + 60 * S
    ball = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    o = size // 2
    # a shaded white ball
    yy, xx = np.mgrid[0:size, 0:size]
    dx, dy = (xx - o) / R, (yy - o) / R
    r2 = dx * dx + dy * dy
    inside = r2 <= 1
    z = np.sqrt(np.clip(1 - r2, 0, 1))
    light = np.clip(0.55 + 0.45 * (z * 0.8 - dx * 0.25 - dy * 0.35), 0, 1)
    col = np.zeros((size, size, 4), np.uint8)
    col[..., 0] = (250 * light + 5).clip(0, 255)
    col[..., 1] = (236 * light).clip(0, 255)
    col[..., 2] = (238 * light).clip(0, 255)
    col[..., 3] = np.where(inside, 255, 0)
    # a pink edge, like it's been... out a while
    edge = np.clip((r2 - 0.62) / 0.38, 0, 1) * inside
    col[..., 1] = (col[..., 1] * (1 - 0.45 * edge)).astype(np.uint8)
    col[..., 2] = (col[..., 2] * (1 - 0.4 * edge)).astype(np.uint8)
    ball = Image.fromarray(col, "RGBA")
    d = ImageDraw.Draw(ball)
    # veins, fixed
    for ang, ln, bend in ((200, 0.55, 0.2), (235, 0.4, -0.25), (320, 0.5, 0.15), (20, 0.35, -0.2), (150, 0.45, 0.25), (95, 0.3, 0.1)):
        a = math.radians(ang)
        pts = []
        for k in range(9):
            t = k / 8
            rr = R * (1 - t * ln)
            aa = a + bend * t
            pts.append((o + rr * math.cos(aa), o + rr * math.sin(aa)))
        d.line(pts, fill=(176, 30, 44, 170), width=int(1.6 * S))
    # the iris: the drawn eye, cut into an oval, centred a little off (it's looking at you)
    iw, ih = int((ex1 - ex0) * S * 1.08), int((ey1 - ey0) * S * 1.08)
    iris = cute.crop((ex0, ey0, ex1, ey1)).resize((iw, ih), Image.LANCZOS)
    mask = Image.new("L", (iw, ih), 0)
    ImageDraw.Draw(mask).ellipse([iw * 0.12, ih * 0.08, iw * 0.88, ih * 0.94], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(2 * S))
    iris.putalpha(Image.fromarray(np.minimum(np.array(iris)[:, :, 3], np.array(mask))))
    ball.alpha_composite(iris, (int(o - iw / 2 + 4 * S), int(o - ih / 2 - 2 * S)))
    # trim anything that stuck out past the ball
    bm = Image.fromarray((inside * 255).astype(np.uint8), "L")
    ball.putalpha(Image.fromarray(np.minimum(np.array(ball)[:, :, 3], np.array(bm))))
    # the stalk at the back, trailing off down-right
    stalk = Image.new("RGBA", ball.size, (0, 0, 0, 0))
    ds = ImageDraw.Draw(stalk)
    pts = [(o + R * 0.55, o + R * 0.6), (o + R * 0.9, o + R * 0.95), (o + R * 1.05, o + R * 1.25), (o + R * 1.2, o + R * 1.38)]
    ds.line(pts, fill=BLOOD + (255,), width=int(9 * S), joint="curve")
    ds.ellipse([pts[-1][0] - 6 * S, pts[-1][1] - 6 * S, pts[-1][0] + 6 * S, pts[-1][1] + 6 * S], fill=BLOOD + (255,))
    stalk = stalk.filter(ImageFilter.GaussianBlur(S))
    out = Image.new("RGBA", ball.size, (0, 0, 0, 0))
    out.alpha_composite(stalk)
    out.alpha_composite(ball)
    out = out.resize((size // S * 2, size // S * 2), Image.LANCZOS)
    crop(out).save(SRC + "fall-eye.webp", quality=90)


if __name__ == "__main__":
    ears()
    eye()
    print("wrote fall-ear-l, fall-ear-r, fall-eye")
