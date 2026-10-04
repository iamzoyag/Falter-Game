"""Build Mochi's cumulative wound images, so each injury stays on her in later scenes.

Every wound image is "cute Mochi + only that wound", transplanted from the
original gore art (colour-matched, feathered), then stacked in story order:

  stitches (IV) -> ears (V) -> eyes (VI) -> unzip (IX)

Outputs (public/mochi/):
  wounds-stitches.webp     cute + stitches                (end of the stitches scene)
  wounds-noears.webp       cute-noears + stitches         (start of the ears scene; the ears are a sprite)
  wounds-ears.webp         + ear stumps and their blood   (end of ears / start of eyes)
  wounds-eyes.webp         + eyes                         (end of eyes / start of unzip)
  wounds-unzip.webp        + the belly                    (end of unzip)
  mask-*-local.png         the scene masks again, with B = where that scene may change (feathered)

Run from the repo root: python3 tools/make_wound_images.py
Needs numpy, opencv-python, pillow. Re-run it if any of the source art changes.
"""
import numpy as np, cv2
from PIL import Image

D = "public/mochi/"
load = lambda n: np.array(Image.open(D + n).convert("RGBA")).astype(np.float32)
cute, noears = load("cute.webp"), load("cute-noears.webp")
st_local = load("stitches-local.webp")
ears_src, eyes_src, unzip_src = load("ears.webp"), load("eyes.webp"), load("unzip.webp")
H, W = cute.shape[:2]


def feather(m, grow, soft):
    m = (m > 0.5).astype(np.uint8)
    if grow: m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (grow * 2 + 1, grow * 2 + 1)))
    m = cv2.GaussianBlur(m.astype(np.float32), (0, 0), soft)
    return np.clip(m * 1.15, 0, 1)


def mask_from(png, ch=0):
    m = np.array(Image.open(D + png).convert("RGB")).astype(np.float32)[..., ch] / 255
    return cv2.resize(m, (W, H), interpolation=cv2.INTER_LINEAR)


def blood(img):
    """Dark-to-bright blood red; excludes the pink of her ears and blush."""
    r, g, b, a = img[..., 0], img[..., 1], img[..., 2], img[..., 3]
    return ((r > 70) & (r - g > 80) & (r - b > 60) & (g < 130) & (a > 30)).astype(np.float32)


def transplant(base, src, R, keep, prev=None, prev_R=None, sigma=11):
    """base everywhere, src inside R.

    Outside the wound core (`keep`) src's low frequencies are moved onto base's,
    so the fur around the wound matches; the wound itself keeps its own colour.
    Earlier wounds (prev_R) come back wherever this one doesn't cover them.
    """
    lowB = cv2.GaussianBlur(base[..., :3], (0, 0), sigma)
    lowS = cv2.GaussianBlur(src[..., :3], (0, 0), sigma)
    k = keep[..., None]
    patch = (src[..., :3] + (lowB - lowS)) * (1 - k) + src[..., :3] * k
    out = base.copy()
    out[..., :3] = base[..., :3] * (1 - R[..., None]) + np.clip(patch, 0, 255) * R[..., None]
    out[..., 3] = np.maximum(base[..., 3] * (1 - R), src[..., 3] * R)
    if prev is not None:
        m = (prev_R * (1 - keep))[..., None]
        out[..., :3] = out[..., :3] * (1 - m) + prev[..., :3] * m
    return out


# the stitches region, from the stitches-local mask
R_st = mask_from("mask-stitches-local.png")

# 1. start of the ears scene: no ears, but the stitches stay
noears_st = noears.copy()
noears_st[..., :3] = noears[..., :3] * (1 - R_st[..., None]) + st_local[..., :3] * R_st[..., None]

# 2. ears: the stumps on top of her head, and wherever their blood runs
stumps = (np.abs(ears_src[..., :3] - noears[..., :3]).mean(-1) > 28).astype(np.float32)
stumps[int(H * 0.33):] = 0          # only the head-top counts as "stump"
bl_e = blood(ears_src)
core_e = np.maximum(feather(bl_e, 1, 1.2), feather(stumps, 1, 1.5))
R_ears = feather(np.maximum(stumps, bl_e), 3, 2.5)
ears_end = transplant(noears_st, ears_src, R_ears, core_e, prev=noears_st, prev_R=R_st)

# after the ears scene she has no ears: later wounds must not bring ear pixels (or specks around them) back
ear_zone = ((cute[..., 3] > 128) & (noears[..., 3] < 64)).astype(np.uint8)
ear_zone = cv2.dilate(ear_zone, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))).astype(np.float32)
ear_zone[int(H * 0.36):] = 0
no_ears = 1 - cv2.GaussianBlur(ear_zone, (0, 0), 4)

# 3. eyes: the sockets and what runs from them
wound_y = mask_from("mask-eyes.png") > 0.08
bl_y = blood(eyes_src)
core_y = feather(np.maximum(wound_y, bl_y), 1, 1.5)
R_eyes = feather(np.maximum(wound_y, bl_y), 4, 3) * no_ears
R_prev = np.maximum(R_st, R_ears)
eyes_end = transplant(ears_end, eyes_src, R_eyes, core_y, prev=ears_end, prev_R=R_prev)

# 4. unzip: the belly
wound_u = mask_from("mask-unzip.png") > 0.08
bl_u = blood(unzip_src)
core_u = feather(np.maximum(wound_u, bl_u), 1, 1.5)
R_unzip = feather(np.maximum(wound_u, bl_u), 4, 3) * no_ears
R_prev = np.maximum(R_prev, R_eyes)
unzip_end = transplant(eyes_end, unzip_src, R_unzip, core_u, prev=eyes_end, prev_R=R_prev)

save = lambda a, n: Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA").save(D + n, quality=92, method=6)
save(st_local, "wounds-stitches.webp")
save(noears_st, "wounds-noears.webp")
save(ears_end, "wounds-ears.webp")
save(eyes_end, "wounds-eyes.webp")
save(unzip_end, "wounds-unzip.webp")

# masks: keep R/G from the originals, B = where this scene is allowed to change
for src_png, R, out in [("mask-ears.png", R_ears, "mask-ears-local.png"),
                        ("mask-eyes.png", R_eyes, "mask-eyes-local.png"),
                        ("mask-unzip.png", R_unzip, "mask-unzip-local.png")]:
    m = np.array(Image.open(D + src_png).convert("RGB"))
    b = cv2.resize(R, (m.shape[1], m.shape[0]), interpolation=cv2.INTER_AREA)
    m[..., 2] = np.clip(b * 255, 0, 255).astype(np.uint8)
    Image.fromarray(m, "RGB").save(D + out)
print("ok")
