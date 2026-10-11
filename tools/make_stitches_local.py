"""Build stitches-local.webp: cute Mochi with only the stitched mouth, cheek and blood mark
transplanted from stitches.webp (colour-matched, feathered), plus mask-stitches-local.png.
Run from the repo root before tools/make_wound_images.py: python3 tools/make_stitches_local.py
"""
import numpy as np, cv2
from PIL import Image
S=None  # set to a folder to write a comparison preview
a=np.array(Image.open('public/mochi/cute.webp').convert('RGBA')).astype(np.float32)
b=np.array(Image.open('public/mochi/stitches.webp').convert('RGBA')).astype(np.float32)
H,W=a.shape[:2]
R=np.zeros((H,W),np.float32)
# the wounds, in cute.webp's pixel space: stitched mouth, cheek stitches, a blood mark on the other cheek
cv2.ellipse(R,(388,466),(70,38),0,0,360,1,-1)
cv2.ellipse(R,(520,414),(62,34),-22,0,360,1,-1)
cv2.ellipse(R,(310,427),(15,15),0,0,360,1,-1)
R=cv2.GaussianBlur(R,(0,0),9)
R=np.clip(R*1.25,0,1)
# match the stitched patch's colour to cute Mochi (move low frequencies across, keep the wound detail)
lowA=cv2.GaussianBlur(a[...,:3],(0,0),11); lowB=cv2.GaussianBlur(b[...,:3],(0,0),11)
patch=np.clip(b[...,:3]+(lowA-lowB)*1.0,0,255)
out=a.copy()
out[...,:3]=a[...,:3]*(1-R[...,None])+patch*R[...,None]
Image.fromarray(out.astype(np.uint8),'RGBA').save('public/mochi/stitches-local.webp',quality=92,method=6)
# the reveal mask (R channel), same 256px layout as the other masks
m=cv2.resize(R,(256,256),interpolation=cv2.INTER_AREA)
mm=np.zeros((256,256,3),np.uint8); mm[...,0]=np.clip(m*255,0,255)
Image.fromarray(mm,'RGB').save('public/mochi/mask-stitches-local.png')
# previews
def on_pink(img):
    bg=np.zeros_like(img[...,:3]); bg[:]= (239,227,255)[::-1]; al=img[...,3:4]/255
    return (img[...,:3]*al+bg*(1-al))
crop=lambda x: x[300:600,220:620]
side=np.concatenate([crop(on_pink(a)),crop(on_pink(out)),crop(on_pink(b))],1)
S and cv2.imwrite(S+'local_compare.png', cv2.resize(side[...,::-1].astype(np.uint8),(1200,300)))
print("ok")
