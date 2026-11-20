"""Draws the app icons in public/icons. Run with: npm run icons (needs Python 3 and Pillow)."""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
BLUE = (47, 95, 232, 255)
SOFT = (219, 229, 255, 255)
WHITE = (255, 255, 255, 255)
SCALE = 4  # draw large, then downsample for smooth edges


def mark(draw: ImageDraw.ImageDraw, size: int, inset: float) -> None:
    """A calendar page: two rings, a header line, and one marked day."""
    s = size * (1 - 2 * inset)  # the area the mark may use
    o = size * inset
    w = round(s * 0.07)
    left, right = o + s * 0.24, o + s * 0.76
    top, bottom = o + s * 0.27, o + s * 0.77
    draw.rounded_rectangle((left, top, right, bottom), radius=s * 0.09, outline=WHITE, width=w)
    line = o + s * 0.43
    draw.line((left, line, right, line), fill=WHITE, width=w)
    for x in (o + s * 0.38, o + s * 0.62):
        draw.line((x, o + s * 0.19, x, o + s * 0.33), fill=WHITE, width=w)
    r = s * 0.075
    cx, cy = o + s * 0.5, o + s * 0.6
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=SOFT)


def icon(px: int, *, rounded: bool, inset: float) -> Image.Image:
    size = px * SCALE
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if rounded:
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=size * 0.22, fill=BLUE)
    else:
        draw.rectangle((0, 0, size, size), fill=BLUE)
    mark(draw, size, inset)
    return img.resize((px, px), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    icon(192, rounded=True, inset=0.0).save(OUT / "icon-192.png")
    icon(512, rounded=True, inset=0.0).save(OUT / "icon-512.png")
    # Maskable icons are cropped by the OS, so keep the mark inside the central safe zone.
    icon(512, rounded=False, inset=0.1).save(OUT / "icon-maskable-512.png")
    # iOS adds its own rounded corners and ignores transparency.
    icon(180, rounded=False, inset=0.0).convert("RGB").save(OUT / "apple-touch-icon.png")
    (OUT / "favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        '<rect width="64" height="64" rx="14" fill="#2f5fe8"/>'
        '<g fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round">'
        '<rect x="15.4" y="17.3" width="33.2" height="32" rx="5.8"/>'
        '<path d="M15.4 27.5h33.2M24.3 12.2v8.9M39.7 12.2v8.9"/></g>'
        '<circle cx="32" cy="38.4" r="4.8" fill="#dbe5ff"/></svg>\n'
    )
    print(f"Wrote icons to {OUT}")


if __name__ == "__main__":
    main()
