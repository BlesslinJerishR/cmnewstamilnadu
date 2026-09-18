"""Generates the mobile app icons/splash using only pure black (#000) and white (#FFF) pixels.

Run from the repository root:  python3 infrastructure/scripts/generate-mobile-icons.py
Requires Pillow and the DejaVu Sans Bold font. Shapes are rendered at 4x and thresholded, so
no anti-aliased grey pixels are ever written.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
OUT = Path(__file__).resolve().parents[2] / 'apps' / 'mobile' / 'assets'
BLACK, WHITE = 0, 255


def mark(size: int, fg: int, frame: bool, scale: float = 1.0) -> Image.Image:
    """1-bit image: 'CM' monogram with a rule underneath, optionally inside a square frame."""
    big = size * 4
    im = Image.new('L', (big, big), 255 - fg)
    d = ImageDraw.Draw(im)
    s = big * scale
    off = (big - s) / 2
    if frame:
        w = s * 0.045
        d.rectangle([off + s * 0.12, off + s * 0.12, off + s * 0.88, off + s * 0.88], outline=fg, width=int(w))
    font = ImageFont.truetype(FONT, int(s * 0.34))
    text = 'CM'
    box = d.textbbox((0, 0), text, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    x = (big - tw) / 2 - box[0]
    y = off + s * 0.40 - th / 2 - box[1]
    d.text((x, y), text, font=font, fill=fg)
    d.rectangle([off + s * 0.26, off + s * 0.64, off + s * 0.74, off + s * 0.675], fill=fg)
    im = im.resize((size, size), Image.LANCZOS)
    return im.point(lambda v: 255 if v >= 128 else 0)


def rgb(img_l: Image.Image) -> Image.Image:
    return Image.merge('RGB', [img_l] * 3)


def transparent(img_l: Image.Image, fg: int) -> Image.Image:
    """Foreground pixels become opaque `fg`, everything else fully transparent."""
    alpha = img_l.point(lambda v: 255 if v == fg else 0)
    colour = Image.new('L', img_l.size, fg)
    return Image.merge('RGBA', [colour, colour, colour, alpha])


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rgb(mark(1024, WHITE, frame=True)).save(OUT / 'icon.png')
    rgb(mark(48, WHITE, frame=False, scale=1.3)).save(OUT / 'favicon.png')
    transparent(mark(1024, WHITE, frame=False, scale=0.62), WHITE).save(OUT / 'android-icon-foreground.png')
    transparent(mark(1024, WHITE, frame=False, scale=0.62), WHITE).save(OUT / 'android-icon-monochrome.png')
    Image.new('RGB', (1024, 1024), (0, 0, 0)).save(OUT / 'android-icon-background.png')
    transparent(mark(1024, BLACK, frame=True), BLACK).save(OUT / 'splash-icon.png')
    transparent(mark(1024, WHITE, frame=True), WHITE).save(OUT / 'splash-icon-dark.png')
    for f in sorted(OUT.glob('*.png')):
        im = Image.open(f).convert('RGBA')
        colours = {c[:3] for a, c in im.getcolors(1 << 24) if c[3] > 0}
        assert colours <= {(0, 0, 0), (255, 255, 255)}, f'{f.name} has non black/white pixels: {colours}'
        print(f'{f.name}: {im.size[0]}x{im.size[1]} colours={sorted(colours)}')


if __name__ == '__main__':
    main()
