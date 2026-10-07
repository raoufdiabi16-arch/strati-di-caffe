#!/usr/bin/env python3
"""Turns your REAL product photos into fast web images (WebP).

    pip install pillow
    python3 tools/optimize_images.py  ~/Desktop/photos  site/assets  [width]

- every .jpg / .jpeg / .png in the first folder is resized to `width` pixels wide (default 900, never enlarged)
- saved as WebP quality 80 with a content hash in the name, e.g. hoodie-front.3fa9c2d1.webp
  (the hash makes the 1-year browser cache safe: a new photo = a new file name)
- then put the printed file name in index.html (replace the old src="assets/hoodie-1....webp")
Tips for shooting: 4:5 portrait, 2000 px or more on the long side, soft daylight, same background on every shot.
"""
import hashlib, io, os, sys
from PIL import Image, ImageOps

src, dst = sys.argv[1], sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 900
os.makedirs(dst, exist_ok=True)
total_in = total_out = 0
for fn in sorted(os.listdir(src)):
    if not fn.lower().endswith(('.jpg', '.jpeg', '.png')):
        continue
    raw = open(os.path.join(src, fn), 'rb').read()
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw)))
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im = im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P') else 'RGB')
    buf = io.BytesIO(); im.save(buf, 'WEBP', quality=80, method=6)
    data = buf.getvalue()
    name = f"{os.path.splitext(fn)[0].lower().replace(' ', '-')}.{hashlib.sha1(data).hexdigest()[:8]}.webp"
    open(os.path.join(dst, name), 'wb').write(data)
    total_in += len(raw); total_out += len(data)
    print(f'{fn:30s} {len(raw)//1024:6d} KB -> assets/{name}  ({len(data)//1024} KB, {im.width}x{im.height})')
print(f'total {total_in//1024} KB -> {total_out//1024} KB')
