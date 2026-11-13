"""Cut the white studio background out of the portrait and emit a compact
alpha WebP + its base64, for embedding in the boot screen (no asset route).

    python3 tools/prepare-portrait.py <input.png> [output.webp]
"""
import base64
import sys
from io import BytesIO

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src = sys.argv[1]
dst = sys.argv[2] if len(sys.argv) > 2 else "lib/assets/portrait.webp"

im = Image.open(src).convert("RGBA")
w, h = im.size
rgb = np.asarray(im.convert("RGB")).astype(np.int16)

# Pure-ish white, as the key.
white = (rgb[:, :, 0] > 242) & (rgb[:, :, 1] > 242) & (rgb[:, :, 2] > 242)
key = Image.fromarray((white * 255).astype(np.uint8), "L")

# Flood from every corner so only background connected to the border is cut;
# enclosed white cloth (apron, frills) survives.
for xy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
    if key.getpixel(xy) == 255:
        ImageDraw.floodfill(key, xy, 128, thresh=0)

bg = np.asarray(key) == 128
keep = (~bg).astype(np.float32)

# Soften the cut by ~1px so edges do not look razor-cut.
keep = np.asarray(
    Image.fromarray((keep * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.1))
).astype(np.float32) / 255.0

alpha = np.asarray(im.split()[-1]).astype(np.float32) / 255.0
alpha = np.clip(alpha * keep, 0, 1)

rgba = np.dstack([np.asarray(im.convert("RGB")), (alpha * 255).astype(np.uint8)])
out = Image.fromarray(rgba, "RGBA")

# Trim to content, then scale to a sensible display height.
bbox = out.split()[-1].getbbox()
if bbox:
    out = out.crop(bbox)
print("trimmed:", out.size, "from", (w, h))

target_h = 1000
if out.size[1] > target_h:
    ratio = target_h / out.size[1]
    out = out.resize((round(out.size[0] * ratio), target_h), Image.LANCZOS)

buf = BytesIO()
out.save(buf, "WEBP", quality=84, method=6)
data = buf.getvalue()
with open(dst, "wb") as f:
    f.write(data)
b64 = base64.b64encode(data).decode("ascii")
with open(dst + ".b64", "w") as f:
    f.write(b64)
print("webp:", len(data), "bytes; base64:", len(b64), "chars; size:", out.size)
