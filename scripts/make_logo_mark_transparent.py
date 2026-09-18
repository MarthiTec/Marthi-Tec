from PIL import Image
import os

src = r"C:\Marthi GIT\Logo\logo nova circulo sem fundo.png"
out = r"C:\Marthi GIT\MarthiProject\apps\web\public\brand\logo-mark.png"

im = Image.open(src).convert("RGBA")
print("size", im.size)
for p in [(0, 0), (im.width - 1, 0), (0, im.height - 1), (10, 10)]:
    print(p, im.getpixel(p))

pixels = im.load()
w, h = im.size
cx, cy = w / 2, h / 2
r = min(w, h) / 2 * 0.985

for y in range(h):
    for x in range(w):
        pr, pg, pb, pa = pixels[x, y]
        dx, dy = x - cx, y - cy
        dist2 = dx * dx + dy * dy
        if dist2 > r * r:
            pixels[x, y] = (0, 0, 0, 0)

im.save(out, "PNG")
print("saved", out, os.path.getsize(out))
im2 = Image.open(out).convert("RGBA")
print("corner after", im2.getpixel((0, 0)))
