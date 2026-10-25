#!/usr/bin/env python3
"""Measure a book's wordsPerPage from photos of its pages.

    python3 tools/wpp.py "Page Scans/Mating Pages"                  # per-page counts + the mean
    python3 tools/wpp.py "Page Scans/Mating Pages" --write mating   # …and store it in data/books.json
    python3 tools/wpp.py a.png b.png --debug                        # also list the lines the filter dropped

macOS only: the text comes from Apple's Vision framework via tools/wpp_ocr.swift, which this
script compiles on first run with swiftc (Xcode Command Line Tools) into tools/.build/
(gitignored). About a second per photo. Cloud sessions run Linux and cannot use it — there,
count by hand from the photos Travis attaches (see CLAUDE.md).

What it measures: the words actually printed on each supplied page, averaged and rounded.
NOT lines × words-per-full-line. Calibrated 2026-10-24 against the six books that had been
measured by eye before this tool existed: raw word counts sat within 2.5% of every stored
value, while the lines × wpl shortcut ran 2–13% high (paragraph-ending lines, dialogue).
So numbers made either way are comparable, and the shortcut is the one to avoid.

How a page is read:
1. Vision returns one box per printed line (normalized, origin bottom-left) with its text.
2. The body column comes from the wide lines: its left edge, and — from full-width lines
   only — its right edge, each fitted as a straight line in y so a photo shot at an angle
   still works. (Fitting the right edge on every line lets short lines tilt it and drops
   half a page.)
3. Kept: lines inside the column, indents allowed. Dropped: narrow fragments of the facing
   page outside it; a block of short lines above a big gap at the top (running head,
   dateline, clipping title); a ≤3-word line below a big gap at the bottom (folio).
   Footnotes stay — he reads them.
4. Words = whitespace tokens holding a letter or digit; "ex-" + "periences" across a line
   break counts once.

A page whose words fall under 85% of lines × full-line words is flagged "airy": dialogue, a
section break, a chapter end, a clipping. It counts like any other — the pages Travis supplies
are representative by his choice (a book of short chapters has many chapter ends), so the flag
is information for the report, never a reason to leave a photo out.
"""
import argparse
import json
import os
import re
import statistics as st
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "tools" / "wpp_ocr.swift"
BIN = REPO / "tools" / ".build" / "wpp_ocr"
BOOKS = REPO / "data" / "books.json"
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".heic", ".tif", ".tiff"}
ALNUM = re.compile(r"[A-Za-z0-9]")


def words(s):
    return [t for t in s.split() if ALNUM.search(t)]


def ensure_binary():
    if sys.platform != "darwin":
        sys.exit("wpp.py needs macOS (Apple's Vision framework). In a cloud session, count by hand — see CLAUDE.md.")
    if BIN.exists() and BIN.stat().st_mtime >= SRC.stat().st_mtime:
        return
    BIN.parent.mkdir(exist_ok=True)
    print(f"compiling {SRC.relative_to(REPO)} → {BIN.relative_to(REPO)} …", file=sys.stderr)
    r = subprocess.run(["swiftc", "-O", "-o", str(BIN), str(SRC)], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"swiftc failed (is Xcode Command Line Tools installed? `xcode-select --install`):\n{r.stderr}")


def collect(paths):
    files = []
    for p in paths:
        p = Path(p)
        if p.is_dir():
            files += sorted(f for f in p.iterdir() if f.suffix.lower() in IMAGE_EXTS and not f.name.startswith("."))
        elif p.is_file():
            files.append(p)
        else:
            sys.exit(f"not found: {p}")
    if not files:
        sys.exit("no images found")
    return files


def ocr(files):
    r = subprocess.run([str(BIN), *map(str, files)], capture_output=True, text=True)
    if r.stderr.strip():
        print(r.stderr.strip(), file=sys.stderr)
    by = defaultdict(list)
    for line in r.stdout.splitlines():
        p = line.split("\t")
        if len(p) < 7:
            continue
        x, y, w, h, c = map(float, p[1:6])
        by[p[0]].append((x, y, w, h, c, "\t".join(p[6:])))
    return by


def fit(pts):
    """least squares x = a + b·y over (y, x) points; perspective is close to linear"""
    n = len(pts)
    my = sum(y for y, _ in pts) / n
    mx = sum(x for _, x in pts) / n
    sxy = sum((y - my) * (x - mx) for y, x in pts)
    syy = sum((y - my) ** 2 for y, _ in pts)
    b = sxy / syy if syy > 1e-9 else 0.0
    a = mx - b * my
    return lambda y: a + b * y


def analyze(rows):
    """rows: (minX, minY, w, h, conf, text) → (stats dict or None, dropped rows)"""
    wide = [r for r in rows if r[2] >= 0.30]
    if len(wide) < 5:
        return None, rows
    bins = defaultdict(int)
    for r in wide:
        bins[round(r[0], 2)] += 1
    mode = max(bins, key=bins.get)
    col = [r for r in wide if abs(r[0] - mode) <= 0.08]
    left = fit([(r[1], r[0]) for r in col])
    cw = sorted(r[2] for r in col)
    p90 = cw[int(0.9 * (len(cw) - 1))]
    fullcol = [r for r in col if r[2] >= 0.9 * p90] or col
    right = fit([(r[1], r[0] + r[2]) for r in fullcol])

    body, dropped = [], []
    for r in rows:
        dl = r[0] - left(r[1])
        dr = (r[0] + r[2]) - right(r[1])
        if r[2] < 0.04:
            dropped.append(r)
        elif r[2] < 0.25 and (dl < -0.06 or dr > 0.06):   # facing-page fragments
            dropped.append(r)
        elif -0.08 <= dl <= 0.16 and dr <= 0.08:
            body.append(r)
        else:
            dropped.append(r)
    body.sort(key=lambda r: -r[1])  # top first
    ys = [r[1] for r in body]
    pitches = [ys[i] - ys[i + 1] for i in range(len(ys) - 1) if ys[i] - ys[i + 1] > 0.004]
    pitch = st.median(pitches) if pitches else 0.02
    # running head / dateline / clipping title: short lines at the top, then a big gap
    for k in range(min(3, len(body) - 1), 0, -1):
        if body[k - 1][1] - body[k][1] > 1.7 * pitch and all(len(words(r[5])) <= 7 for r in body[:k]):
            dropped += body[:k]
            body = body[k:]
            break
    # folio: a very short line below a big gap (footnotes have more words and stay)
    while len(body) > 2 and (body[-2][1] - body[-1][1]) > 1.7 * pitch and len(words(body[-1][5])) <= 3:
        dropped.append(body.pop())

    n = len(body)
    actual = sum(len(words(r[5])) for r in body)
    for i in range(n - 1):
        a, b = body[i][5].rstrip(), body[i + 1][5].lstrip()
        if a.endswith("-") and b and b[0].islower():
            actual -= 1
    widths = sorted(r[2] for r in body)
    ref = widths[int(0.9 * (len(widths) - 1))] if widths else 0
    full = [len(words(r[5])) for r in body if r[2] >= 0.92 * ref]
    wpl = st.mean(full) if full else 0
    return dict(lines=n, words=actual, wpl=wpl, capacity=n * wpl), dropped


def main():
    ap = argparse.ArgumentParser(description="page photos → wordsPerPage")
    ap.add_argument("paths", nargs="+", help="image files or folders of them")
    ap.add_argument("--write", metavar="BOOK_ID", help="store the result as this book's wordsPerPage")
    ap.add_argument("--debug", action="store_true", help="list the multi-word lines the filter dropped")
    args = ap.parse_args()

    ensure_binary()
    files = collect(args.paths)
    by = ocr(files)
    counts = []
    for f in files:
        r, dropped = analyze(by.get(str(f), []))
        if args.debug:
            for d in dropped:
                if len(words(d[5])) >= 4:
                    print(f"    dropped  x={d[0]:.2f} w={d[2]:.2f}  {d[5][:60]}")
        if not r:
            print(f"  {f.name}: too little text — skipped")
            continue
        flag = "   airy" if r["capacity"] and r["words"] / r["capacity"] < 0.85 else ""
        print(f"  {f.name}: {r['lines']:3d} lines · {r['words']:4d} words  (full line ≈ {r['wpl']:.1f}){flag}")
        counts.append(r["words"])
    if not counts:
        sys.exit("nothing measured")
    mean = st.mean(counts)
    print(f"  => {len(counts)} pages, {min(counts)}–{max(counts)} words → wordsPerPage {round(mean)}")

    if args.write:
        data = json.loads(BOOKS.read_text(encoding="utf-8"))
        book = next((b for b in data["books"] if b["id"] == args.write), None)
        if not book:
            sys.exit(f"no book with id {args.write!r} in {BOOKS.relative_to(REPO)}")
        old = book.get("wordsPerPage")
        book["wordsPerPage"] = round(mean)
        BOOKS.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"  wrote {BOOKS.relative_to(REPO)}: {args.write} wordsPerPage {old} → {round(mean)}")


if __name__ == "__main__":
    main()
