import sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
H = sys.argv[1]
photo = Image.open(f"{H}/pair.png").convert("RGB")
W, Ht = photo.size
s = W / 1200  # corners were read off the 1200px preview
quad = [(275, 243), (851, 236), (851, 612), (275, 615)]
quad = [(x * s, y * s) for x, y in quad]
shot = Image.open(f"{H}/dashboard-ref.png").convert("RGB")
sw, sh = shot.size
# Perspective coefficients mapping output (photo) coords to screenshot coords.
src = [(0, 0), (sw, 0), (sw, sh), (0, sh)]
A, b = [], []
for (x, y), (u, v) in zip(quad, src):
    A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
    b += [u, v]
coeffs = np.linalg.solve(np.array(A, float), np.array(b, float))
warped = shot.transform((W, Ht), Image.PERSPECTIVE, tuple(coeffs), Image.BICUBIC)
# A photographed screen: slightly soft, a touch less contrast, dimmer, warmer.
warped = warped.filter(ImageFilter.GaussianBlur(0.7))
warped = ImageEnhance.Contrast(warped).enhance(0.92)
warped = ImageEnhance.Brightness(warped).enhance(0.9)
r, g, bch = warped.split()
warped = Image.merge("RGB", (r.point(lambda p: min(255, p * 1.03)), g, bch.point(lambda p: p * 0.96)))
mask = Image.new("L", (W, Ht), 0)
ImageDraw.Draw(mask).polygon(quad, fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(1.2))
out = photo.copy()
out.paste(warped, (0, 0), mask)
# Faint glare: a soft diagonal light band across the screen.
glare = Image.new("L", (W, Ht), 0)
gd = ImageDraw.Draw(glare)
x0, y0 = quad[0]
gd.polygon([(x0 + 0.55 * (quad[1][0] - x0), y0), (quad[1][0], y0), (quad[1][0], y0 + 0.35 * (quad[2][1] - y0))], fill=18)
glare = glare.filter(ImageFilter.GaussianBlur(60))
out = Image.composite(Image.new("RGB", (W, Ht), (255, 240, 225)), out, glare)
people = Image.open(f"{H}/cutout.png").convert("RGBA").resize((W, Ht), Image.LANCZOS)
alpha = np.asarray(people)[..., 3]
# The cutout kept scraps of the old, model-drawn screen around her hand. The people are two large
# connected shapes and the scraps are small islands, so keep only the large shapes, then trim a
# couple of pixels off the edge to drop the blue halo from the screen's glow.
from scipy import ndimage
rgb = np.asarray(people)[..., :3].astype(np.int16)
inside = np.asarray(mask) > 0
xs = np.arange(W)[None, :].repeat(Ht, 0)
right = xs > quad[0][0] + 0.4 * (quad[1][0] - quad[0][0])
# Screen scraps and glow are neutral or bluish; her skin and sweater are warmer.
screenlike = rgb[..., 2] >= rgb[..., 0] - 4
solid = (alpha > 100) & ~(inside & right & screenlike)
labels, n = ndimage.label(solid)
sizes = ndimage.sum(solid, labels, range(1, n + 1))
keep = np.isin(labels, 1 + np.flatnonzero(sizes > 0.01 * W * Ht))
keep = ndimage.binary_fill_holes(keep)
keep = ndimage.binary_erosion(keep, iterations=2)
a_img = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
people.putalpha(Image.fromarray(np.minimum(np.asarray(a_img), alpha).astype(np.uint8)))
out.paste(people, (0, 0), people)
out.save(f"{H}/pair-composite.png")
out.resize((1200, int(1200 * Ht / W)), Image.LANCZOS).save(f"{H}/pair-composite-preview.jpg", quality=88)
out.crop((int(500 * s), int(380 * s), int(860 * s), int(620 * s))).save(f"{H}/pair-composite-zoom.jpg", quality=90)
print("ok", W, Ht)
