#!/usr/bin/env python3
"""Pick a book's color from its cover — the ACCENT, not the dominant field.

    python3 tools/cover_color.py                 # census for every cover in books.json
    python3 tools/cover_color.py 2666 trash      # just these book ids
    python3 tools/cover_color.py covers/x.jpg    # any image (e.g. a cover not yet in books.json)
    python3 tools/cover_color.py --write [ids…]  # also store the picks in data/books.json

One `color` per book paints the spine, the cumulative-chart series, the
scatter stems, the finish pennant and the book page's sparkline. Travis's call
(2026-09-25): it should be the cover's *accent* — the red of 2666's title, the
red "TRASH!", Remainder's cyan, the King in Yellow's yellow — not whatever
color covers the most area (which made 2666 near-black and Trash a mud brown).

The algorithm (needs Pillow + numpy: `pip install pillow numpy`):

1. Fit the cover inside 240×360 (area-averaged) and convert every pixel to
   OKLab, a perceptual space where chroma = sqrt(a²+b²) is how *vivid* a color
   looks, independent of how light it is.
2. Cluster: median cut to 14 boxes seeds a short k-means (deterministic); then
   clusters closer than ΔE 0.06 merge, so JPEG noise and antialiasing don't
   split one printed color into several.
3. Each cluster's *core* color is the mean of its more-vivid half (pixels at or
   above the cluster's median chroma) — that strips the halo of edge pixels a
   thin title picks up from its background.
4. Score = core chroma × share^0.3, over clusters holding ≥ 4% of the cover
   with core chroma ≥ 0.06. Chroma is the point and share only a soft
   tiebreaker: a vivid title on 5% of the cover beats a muted field on 50%.
   The two floors do the rest of the judging — a publisher's seal or a
   sticker (2–3%) never qualifies, and a cream title or a parchment field
   (chroma ≈ 0.05) is not a color. Highest score wins. A cover with no
   qualifying cluster (Notes from Underground, Vigil, The Savage Detectives)
   is achromatic: it takes the most-represented cluster that already clears
   the contrast floor — its black — or, failing that, the dominant one
   darkened to it.
5. Contrast floor: the color must read on the eggshell page (#F0EAD6) at
   WCAG ≥ 1.6:1. A pick that fails (a bright yellow, a sky blue) is darkened
   by scaling its RGB channels evenly until it clears — same hue, a little
   less chroma. That is how the King in Yellow's #F4FF36 lands on #BAC32A and
   Remainder's cyan on #2BD0C6, a shade from the #B7BF29 and #2CCBC2 Travis
   singled out as right. Spine text still picks ink vs eggshell by contrast
   in the browser (js/library.js `spineInk`).

The census printed for each cover lets Travis veto a pick; `--write` stores
them. Never store pages*-style derived numbers elsewhere — this one *is* a
stored fact, recomputed only when a cover lands or changes.
"""
import argparse
import json
import math
import os
import sys

try:
    import numpy as np
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("needs Pillow and numpy:  pip install pillow numpy")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOKS = os.path.join(ROOT, "data", "books.json")

FIT = (240, 360)          # working size: text strokes survive, resolution-independent
K = 14                    # initial clusters
MERGE = 0.06              # ΔE (OKLab) under which two clusters are one color
MIN_SHARE = 0.04          # below this a cluster is a sticker, a logo, noise
MIN_CHROMA = 0.06         # below this a cluster is grey (or cream), not a color
SHARE_EXP = 0.3           # score = chroma × share^SHARE_EXP
EGGSHELL = "#F0EAD6"      # css --eggshell, the page the color must read on
FLOOR = 1.6               # WCAG contrast the color must clear vs the page

# ——— color math ———————————————————————————————————————————————————————

def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def linear_to_srgb(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)

# Björn Ottosson's OKLab (https://bottosson.github.io/posts/oklab/)
_M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
                [0.2119034982, 0.6806995451, 0.1073969566],
                [0.0883024619, 0.2817188376, 0.6299787005]])
_M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
                [1.9779984951, -2.4285922050, 0.4505937099],
                [0.0259040371, 0.7827717662, -0.8086757660]])

def rgb_to_oklab(rgb):
    """rgb: (..., 3) floats in 0..1 (sRGB) → (..., 3) OKLab."""
    lin = srgb_to_linear(rgb)
    lms = lin @ _M1.T
    lms = np.cbrt(lms)
    return lms @ _M2.T

def oklab_to_rgb(lab):
    lms = np.asarray(lab, dtype=np.float64) @ np.linalg.inv(_M2).T
    lms = lms ** 3
    lin = lms @ np.linalg.inv(_M1).T
    return linear_to_srgb(lin)

def rel_lum(rgb):
    r, g, b = srgb_to_linear(np.asarray(rgb, dtype=np.float64))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast(rgb_a, rgb_b):
    la, lb = rel_lum(rgb_a), rel_lum(rgb_b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)

def hex_to_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)]) / 255.0

def rgb_to_hex(rgb):
    r, g, b = (int(round(float(v) * 255)) for v in np.clip(rgb, 0, 1))
    return "#%02X%02X%02X" % (r, g, b)

PAGE = hex_to_rgb(EGGSHELL)

def darken_to_floor(rgb):
    """Scale the sRGB channels down evenly until the color clears FLOOR
    against the page — same hue, a little less chroma, like turning a lamp
    down. Returns (rgb, darkened?)."""
    rgb = np.clip(rgb, 0, 1)
    if contrast(rgb, PAGE) >= FLOOR:
        return rgb, False
    lo, hi = 0.0, 1.0            # contrast vs the (light) page rises as k falls
    best = rgb * 0.0
    for _ in range(40):
        k = (lo + hi) / 2
        cand = rgb * k
        if contrast(cand, PAGE) >= FLOOR:
            best, lo = cand, k
        else:
            hi = k
    return best, True

# ——— clustering ———————————————————————————————————————————————————————

def load_pixels(path):
    im = Image.open(path).convert("RGB")
    im.thumbnail(FIT, Image.Resampling.BOX)
    arr = np.asarray(im, dtype=np.float64).reshape(-1, 3) / 255.0
    return rgb_to_oklab(arr)

def median_cut(px, k):
    boxes = [np.arange(len(px))]
    while len(boxes) < k:
        # split the box with the largest spread along its widest axis
        i = max(range(len(boxes)), key=lambda j: np.ptp(px[boxes[j]], axis=0).max() if len(boxes[j]) > 1 else -1)
        idx = boxes[i]
        if len(idx) < 2:
            break
        axis = int(np.argmax(np.ptp(px[idx], axis=0)))
        order = idx[np.argsort(px[idx, axis], kind="stable")]
        half = len(order) // 2
        boxes[i:i + 1] = [order[:half], order[half:]]
    return np.array([px[b].mean(axis=0) for b in boxes])

def kmeans(px, centers, iters=25):
    for _ in range(iters):
        d = ((px[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
        lab = d.argmin(axis=1)
        new = centers.copy()
        for j in range(len(centers)):
            m = lab == j
            if m.any():
                new[j] = px[m].mean(axis=0)
        if np.allclose(new, centers, atol=1e-6):
            break
        centers = new
    d = ((px[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
    return centers, d.argmin(axis=1)

def merge_close(px, labels, centers):
    groups = {j: [j] for j in range(len(centers))}
    cents = {j: centers[j] for j in range(len(centers))}
    sizes = {j: int((labels == j).sum()) for j in range(len(centers))}
    while True:
        keys = [j for j in groups if sizes[j] > 0]
        best, bd = None, MERGE
        for x in range(len(keys)):
            for y in range(x + 1, len(keys)):
                a, b = keys[x], keys[y]
                d = float(np.linalg.norm(cents[a] - cents[b]))
                if d < bd:
                    best, bd = (a, b), d
        if best is None:
            break
        a, b = best
        n = sizes[a] + sizes[b]
        cents[a] = (cents[a] * sizes[a] + cents[b] * sizes[b]) / n
        sizes[a] = n
        groups[a] += groups[b]
        sizes[b] = 0
        del groups[b]
    out = []
    for j, members in groups.items():
        m = np.isin(labels, members)
        out.append(px[m])
    return out

def census(path):
    px = load_pixels(path)
    centers, labels = kmeans(px, median_cut(px, K))
    clusters = []
    total = len(px)
    for pts in merge_close(px, labels, centers):
        share = len(pts) / total
        chroma = np.hypot(pts[:, 1], pts[:, 2])
        core = pts[chroma >= np.median(chroma)].mean(axis=0)
        mean = pts.mean(axis=0)
        cL, ca, cb = core
        cC = math.hypot(ca, cb)
        hue = (math.degrees(math.atan2(cb, ca)) + 360) % 360
        clusters.append({
            "share": share, "mean": mean, "core": core,
            "L": cL, "C": cC, "hue": hue,
            "rgb": np.clip(oklab_to_rgb(core), 0, 1),
            "score": (cC * share ** SHARE_EXP) if (share >= MIN_SHARE and cC >= MIN_CHROMA) else 0.0,
        })
    clusters.sort(key=lambda c: -c["share"])
    return clusters

def pick(clusters):
    """→ (cluster, why) — the accent, or the achromatic fallback."""
    scored = [c for c in clusters if c["score"] > 0]
    if scored:
        return max(scored, key=lambda c: c["score"]), "accent"
    for c in clusters:  # largest first
        if contrast(np.clip(oklab_to_rgb(c["mean"]), 0, 1), PAGE) >= FLOOR:
            return c, "achromatic: largest cluster that clears the floor"
    return clusters[0], "achromatic: dominant cluster, darkened"

def choose(path):
    clusters = census(path)
    c, why = pick(clusters)
    rgb = c["rgb"] if why == "accent" else np.clip(oklab_to_rgb(c["mean"]), 0, 1)
    final, darkened = darken_to_floor(rgb)
    return clusters, c, why, rgb, final, darkened

# ——— cli ———————————————————————————————————————————————————————————————

def report(label, path, clusters, c, why, raw, final, darkened, old=None):
    print(f"\n{label}  ({os.path.relpath(path, ROOT)})")
    print(f"  {'share':>6}  {'hex':<8} {'L':>5} {'C':>6} {'hue':>4}  {'score':>6}")
    for k in clusters:
        mark = " ◀" if k is c else ""
        sc = f"{k['score']:.3f}" if k["score"] > 0 else "  —  "
        print(f"  {k['share'] * 100:5.1f}%  {rgb_to_hex(k['rgb']):<8} {k['L']:5.2f} {k['C']:6.3f} {k['hue']:4.0f}  {sc:>6}{mark}")
    line = f"  pick: {rgb_to_hex(raw)} ({why})"
    if darkened:
        line += f" → {rgb_to_hex(final)} darkened to {FLOOR}:1 on the page"
    if old and old.upper() != rgb_to_hex(final):
        line += f"   [was {old.upper()}]"
    print(line)

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("targets", nargs="*", help="book ids from books.json and/or image paths (default: every book with a cover)")
    ap.add_argument("--write", action="store_true", help="store the picks in data/books.json")
    args = ap.parse_args()

    with open(BOOKS, encoding="utf-8") as f:
        data = json.load(f)
    by_id = {b["id"]: b for b in data["books"]}

    jobs = []  # (label, path, book-or-None)
    if not args.targets:
        jobs = [(b["id"], os.path.join(ROOT, b["cover"]), b) for b in data["books"] if b.get("cover")]
    else:
        for t in args.targets:
            if t in by_id and by_id[t].get("cover"):
                jobs.append((t, os.path.join(ROOT, by_id[t]["cover"]), by_id[t]))
            elif os.path.exists(t):
                jobs.append((os.path.basename(t), os.path.abspath(t), None))
            else:
                sys.exit(f"unknown book id or missing file: {t}")

    changed = 0
    for label, path, book in jobs:
        clusters, c, why, raw, final, darkened = choose(path)
        report(label, path, clusters, c, why, raw, final, darkened, old=book.get("color") if book else None)
        if args.write and book is not None:
            new = rgb_to_hex(final)
            if book.get("color") != new:
                book["color"] = new
                changed += 1

    if args.write:
        with open(BOOKS, "w", encoding="utf-8") as f:
            f.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {BOOKS}: {changed} color(s) changed")

if __name__ == "__main__":
    main()
