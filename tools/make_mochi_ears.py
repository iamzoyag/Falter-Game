"""Mochi's ears as a layer for the living Mochi (src/mochi/MochiRig.js).

The ears are everything in cute.webp that cute-noears.webp doesn't have, i.e.
the parts sticking out above/around her head. The layer sits behind
cute-noears, so her head hides the roots; to stop a turned ear from showing
a gap or a hard edge, each ear is extended ~30px down into the head with its
own colours (hidden there until it turns).

    python3 tools/make_mochi_ears.py   ->   public/mochi/ears-rig.webp
"""
import os
import cv2
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "mochi")


def main():
    cute = np.array(Image.open(os.path.join(ROOT, "cute.webp")).convert("RGBA"))
    head = np.array(Image.open(os.path.join(ROOT, "cute-noears.webp")).convert("RGBA"))[..., 3]
    h, w = head.shape
    yy = np.arange(h)[:, None].repeat(w, 1)
    solid_head = (head > 200).astype(np.uint8)
    near_head = cv2.dilate((head > 20).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    ear = (cute[..., 3] > 8) & (near_head == 0) & (yy < 300)
    # drop specks: keep the two big pieces
    n, lab, stats, _ = cv2.connectedComponentsWithStats(ear.astype(np.uint8), 8)
    keep = np.zeros_like(ear)
    for i in np.argsort(-stats[1:, cv2.CC_STAT_AREA])[:2] + 1:
        keep |= lab == i
    # extend each ear down into the head (where it's hidden at rest)
    grow = cv2.dilate(keep.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61))) > 0
    # the thin band right at the head's edge is still ear in the original: take it as is
    keep |= grow & (cute[..., 3] > 8) & (head <= 20) & (yy < 300)
    under = grow & (head > 20) & (yy < 330) & ~keep
    rgb = cv2.cvtColor(cute[..., :3], cv2.COLOR_RGB2BGR)
    fill_mask = (~keep).astype(np.uint8) * 255
    filled = cv2.cvtColor(cv2.inpaint(rgb, fill_mask, 9, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB)
    out = np.zeros_like(cute)
    out[keep] = cute[keep]
    # no outline colours under the head: a peek of a dark line at the root looks like a crack
    dark = filled.mean(axis=2) < 200
    filled[dark] = (244, 226, 231)
    out[under, :3] = filled[under]
    out[under, 3] = 255
    Image.fromarray(out, "RGBA").save(os.path.join(ROOT, "ears-rig.webp"), "WEBP", quality=92, method=6)
    print("wrote ears-rig.webp")


if __name__ == "__main__":
    main()
