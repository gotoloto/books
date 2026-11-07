"""Placeholder cover for a wishlist book with no art yet, in the site's dress:
eggshell page, ink frame, the forest/tan checkerboard top and bottom, Iowan Old
Style small caps. Usage: python3 tools/placeholder_cover.py "Lambing|Season" \
"August Lamm" covers/lambing-season.jpg  (| breaks the title line; needs Pillow).
Replace the file with the real cover when it lands; the json entry stays put."""
import sys
from PIL import Image, ImageDraw, ImageFont

TITLE_LINES, AUTHOR, OUT = sys.argv[1].split("|"), sys.argv[2], sys.argv[3]

W, H = 600, 900
EGG, INK, SOFT, FOREST, TAN, BORDER = "#F0EAD6", "#1E2A1E", "#4A523F", "#2E4B2E", "#A68A64", "#C7B58F"
FONT = "/System/Library/Fonts/Supplemental/Iowan Old Style.ttc"

def face(size, index=0):
    return ImageFont.truetype(FONT, size, index=index)

img = Image.new("RGB", (W, H), EGG)
d = ImageDraw.Draw(img)

# hard-edged frame, like a Hall of Fame tile
M = 22
d.rectangle([M, M, W - M - 1, H - M - 1], outline=INK, width=2)

def checker(y0, h, sq):
    x = M + 2
    i = 0
    while x < W - M - 2:
        x1 = min(x + sq, W - M - 2)
        d.rectangle([x, y0, x1 - 1, y0 + h - 1], fill=FOREST if i % 2 == 0 else TAN)
        # two rows offset, as repeating-conic-gradient draws it
        if h > sq:
            d.rectangle([x, y0 + sq, x1 - 1, y0 + h - 1], fill=TAN if i % 2 == 0 else FOREST)
        x = x1
        i += 1

checker(M + 2, 24, 24)          # header strip: two rows of 24px squares... one row tall
checker(H - M - 2 - 16, 16, 16) # footer strip, thin

def small_caps(text, y, big, small, fill, track):
    """Fake small caps: initials at `big`, the rest uppercase at `small`, tracked."""
    fb, fs = face(big), face(small)
    glyphs = []
    for i, ch in enumerate(text):
        if ch == " ":
            glyphs.append((" ", fs, small * 0.35))
            continue
        f = fb if (i == 0 or text[i - 1] == " ") else fs
        glyphs.append((ch.upper(), f, d.textlength(ch.upper(), font=f) + track))
    total = sum(w for _, _, w in glyphs) - track
    x = (W - total) / 2
    for ch, f, w in glyphs:
        if ch != " ":
            d.text((x, y), ch, font=f, fill=fill, anchor="ls")
        x += w

# title block, centred a touch above the middle
y = 400
for line in TITLE_LINES:
    small_caps(line, y, 64, 50, INK, 5)
    y += 76

# a tan rule, then the author
rule_y = y - 30
d.rectangle([W / 2 - 60, rule_y, W / 2 + 60, rule_y + 1], fill=TAN)
small_caps(AUTHOR, rule_y + 58, 30, 24, SOFT, 4)

# the caption the wishlist puts under a dated cover, in the same voice
small_caps("Forthcoming", H - M - 2 - 16 - 34, 17, 14, TAN, 3)

img.save(OUT, "JPEG", quality=92)
print(OUT)
