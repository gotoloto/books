# books — personal reading tracker

Static site for Travis's reading log. Live at **https://gotoloto.github.io/books/**
(GitHub Pages, repo `gotoloto/books`, `main` branch, root). No build step, no
dependencies — plain HTML/CSS/ES-modules. Day 0 of tracking is **2026-07-26**.

Travis updates progress conversationally ("2666 — read pages 410–455"). Your job
on those messages: update the JSON, commit, push. Details below — follow them
exactly; the semantics are easy to get wrong.

## The one rule people get wrong

Log entries store **bookmark positions, not inclusive page counts**.

```
{ "date": "2026-07-27", "book": "2666", "from": 410, "to": 455 }
```

- pages read = `to − from` (here: 45). "Read pages 410–455" means went FROM 410 TO 455.
- The reader's current position afterward = `to`.
- **Continuity rule**: a new entry's `from` must equal the book's last `to`
  (or `startPage` if the book has no entries). If the user's report doesn't line
  up (gap or overlap), point out the mismatch and ask before appending —
  they may have skipped front matter, re-read, or mistyped.

## Day granularity (display convention)

Storage is per-session and append-only — if Travis reports twice in a day, that's two
entries. But **every user-visible surface merges to (book, day)**: one scatter dot, one
tooltip range (first `from` → last `to`), one reading-log table row, day-based records
only. Never surface individual sessions in the UI. (Merged ranges lean on the
continuity rule; a deliberate re-read day would show a range narrower than its page
count — acceptable.) **The one exception is the journal** (see "Reading notes"):
a note belongs to the report it came with, so the book page lists notes per
report, each with its own page range (Travis, 2026-09-14).

## Daily update recipe

When Travis reports reading (any phrasing like "Book X — read pages A–B"):

0. `git pull --rebase` first. Travis also logs from his phone via claude.ai/code
   cloud sessions, so the local clone routinely lags origin.

1. Identify the book id in `data/books.json` (match by title, case-insensitive).
2. Check continuity: last entry's `to` for that book (or `startPage`). Mismatch → ask.
3. Append `{date, book, from, to}` to `entries` in `data/log.json`.
   - `date` = today's local date unless the user says otherwise ("yesterday I…").
   - "Local" means **Travis's** date, not the machine's. Cloud containers run UTC,
     which flips to tomorrow during his evening — if the system clock disagrees with
     him or with same-day entries, trust Travis (ask if unsure), and never redate
     existing entries to match a clock.
   - **Morning reports are usually last night's reading.** If a dateless report
     arrives early in the day and yesterday has no entry yet, ask ("last night, or
     this morning?") instead of defaulting to the clock — he's had to correct this.
   - Multiple sessions in one day = multiple entries; never merge or edit old entries
     (append-only, unless the user corrects a mistake).
   - **Keep each entry on one line** (`{ "date": …, "book": …, "from": …, "to": … }`)
     so every log commit is a one-line diff. Don't let a JSON formatter explode them.
   - **If the report says what he read** (a summary, a reaction, a question), it
     goes into `notes/<book-id>.md` — see "Reading notes" below. His words, verbatim.
4. Validate both files parse: `python3 -c "import json; json.load(open('data/books.json')); json.load(open('data/log.json'))"`
5. Commit + push (Travis pre-authorized auto-push for log updates):
   `git add data/ && git commit -m "log: 2666 pp. 410–455" && git push`
6. Pages redeploys in ~30–90 s. Data is fetched with `cache:'no-cache'`, so a
   reload shows it immediately after deploy; CSS/JS changes can lag up to 10 min (CDN).

If the entry lands them on the last page (`to == totalPages`), congratulate them and
also do the "finishing a book" steps.

**The Hall of Fame shows only three tiles — best day, total since day 0, longest
streak** (current-streak, best-week, and best-month tiles removed 2026-08-29 at
Travis's request; `records()` still computes everything). Only announce records
for the three surfaced tiles.

**Announcing records ("new best day!"): recompute from the data first** — run
`records()` (js/derive.js) against the current log, never trust the conversation's
memory of what the record was. Records can change hands *between* logging events
(a wpp recalibration rescales history), and a chat-cached "current record" goes
stale exactly then. This has caused a wrong announcement once.

### From the phone

Travis logs from his iPhone with **Claude Code sessions at claude.ai/code (or the
Claude mobile app)** pointed at the `gotoloto/books` GitHub repo. Those sessions read
this file and follow the exact same recipe — nothing else is configured, and nothing
else should be built (he explicitly declined GitHub Actions / Shortcuts automation).
The only consequence for local sessions is step 0 above: always pull first.

## Reading notes (the journal)

Travis often adds a few sentences about what he read ("Yesterday in 2666 was
about…"). Those live in **`notes/<book-id>.md`**, one file per book, and render on
the book's page — `#book/<id>`, reached from any cover, title, or spine on the
Library and Queue tabs (js/book.js).

- One section per report: a `## YYYY-MM-DD · pp. A–B` heading carrying **that
  report's own range** (the pages it arrived with — not the day's merged range),
  a blank line, then the note. Append at the end of the file, chronological like
  the log; the site shows newest first, later report first within a day.
- **His words, verbatim.** Never edit, tighten, correct, or "improve" a note —
  not spelling, not phrasing, not a "Yesterday" sitting under a dated heading.
  Fix a typo only when he asks. The journal is his voice; only the structure
  is ours. (Agreed 2026-09-13.)
- Same commit as the day's log entry (`log: 2666 pp. 842–880` covers both). A
  note on a day with no log entry is fine — the heading just carries the date
  and the page shows no range for it.
- **Same day doesn't mean same entry** (Travis, 2026-09-14): a second report on
  a day gets its own `## YYYY-MM-DD · pp. A–B` section with its own range. Never
  fold a new note into an earlier section, even on the same date.
- The renderer understands paragraphs, `> ` quotes (for lines worth keeping),
  `*em*` and `**strong**`. Nothing else renders — keep the files plain.
- **Vocabulary** lives in the same file, in a `## Vocabulary` block directly
  under the title, above the dated entries (journal entries always append to
  the END of the file; vocabulary bullets append to the end of that block —
  create the block if the book has none). One bullet per word, exactly as
  Travis gives them: `* Vicissitudes, pp 892. "Of course, my forebear…"` —
  term, comma, page, period, the sentence in quotes. The book page renders
  the block as a glossary at the back: alphabetical, page shown, the word lit
  up inside its own sentence. The sentences are the book's words — keep them
  exactly as he typed them, trailing quirks included.
- **Quotes** work the same way (2026-09-15): a `## Quotes` block under the title
  beside Vocabulary (either order, both above the dated entries), one bullet per
  passage: `* pp 20. "The passage."` — page, period, the passage in quotes,
  verbatim. Rendered between the journal and the vocabulary, in page order,
  each with its page. He may say "Quotes." and then `pp20 "…"` — the bullet
  shape is ours, the passage is his.
- The book page shows each note under its heading's own range (the one thing
  the heading is trusted for; the count comes from it too). A heading with no
  range falls back to the day's merged range from the log. In prose mode the
  headings turn into words like everything else; the note text itself is
  already prose.
- The repo and site are public and Travis is fine with that — notes may carry
  spoilers, and they are not veiled.
- Never write a note on his behalf. If a report has pages but no summary, log
  the pages and leave the journal alone.

## Finishing a book

In `data/books.json`: set `status: "finished"`, `finishDate: "YYYY-MM-DD"`.
It moves to the Finished shelf; its series stays in the charts. `finishDate` also
drives the finish pennant on the cumulative chart and the book's spine on the
spine shelf, and `color` paints both — so a finished book must have both fields.

## DNF-ing a book (did not finish)

Only when Travis explicitly declares it — never infer a DNF from silence. In
`data/books.json`: set `status: "dnf"` and add `dnfDate: "YYYY-MM-DD"`. Leave the
log entries alone: the reading happened, so it keeps counting in every stat (series,
dots, heatmap, records). The book appears on the Library's **"Did Not Finish"**
shelf (heading always spelled out; "DNF" shorthand only in compact spots like spine
tooltips) as a spine whose width reflects only the position reached, not the whole
book. A DNF book never has `finishDate` (and gets no chart pennant).

Un-DNF (he picks it back up): `status: "reading"`, delete `dnfDate`; logging resumes
from the last position as usual.

Spine widths on both shelves come from `spineWidth()` in js/library.js: linear in
pages* through zero (star × 34/300 — 300 pp* keeps its 34px), NO min/max clamps —
widths stay honest to word count (Travis, 2026-08-08). Label font shrinks with the
spine via `spineFont()`, legibility be damned; tooltips carry the title.

## Starting a new book

Collect/derive, then fill the book's entry (planned books already exist with nulls):

1. `totalPages` — the physical copy's last numbered page (ask Travis). Planned
   entries already carry a **Goodreads estimate** (for the queue ETA) — always
   re-confirm against the physical copy when the book starts; they often differ.
   The queue marks estimates with `~`; a measured `wordsPerPage` is the proxy for
   "physical copy confirmed", which drops the tilde (js/queue.js `verified`).
2. `startPage` — 0 unless starting mid-book, `startDate` — first tracked day.
3. `wordsPerPage` — ask Travis for photos of ~5 representative pages. On his laptop
   they live under `Page Scans/` (which now also holds the old `<book> pages/`
   folders; both patterns are gitignored — **page scans must never be committed;
   the repo is public**). Gitignored folders never reach GitHub, so cloud/mobile
   sessions cannot see them — there, ask Travis to attach the photos in chat
   instead (or measure from a laptop session that has the folder). OCR each photo:
   count text lines exactly, sample several full lines for words-per-line, estimate
   words per page; average across photos; round to an integer. Show the per-page
   numbers so Travis can sanity-check. (2666's five pages gave 440/440/436/482/486 → 457.)
4. `color` — the cover's **accent** color (Travis's call, 2026-09-25: the red
   of 2666's title, the red "TRASH!", Remainder's cyan, the King in Yellow's
   yellow — not whatever color covers the most area, which had made 2666
   near-black and Trash a mud brown), already computed and stored for every
   book with a cover; nothing to do at start time. Recompute only when a cover
   lands or changes (also for new planned books, right after fetching the
   cover): `python3 tools/cover_color.py <id>` prints the cluster census and
   the pick, `--write` stores it. Needs Pillow + numpy (`pip install pillow
   numpy`). The algorithm is spelled out in that script's docstring — in short:
   cluster the cover in OKLab, score each cluster by chroma × share^0.3 over
   clusters holding ≥ 4% of the cover with chroma ≥ 0.06 (a sticker, a seal,
   a cream title never qualify), take the highest; an achromatic cover takes
   its largest cluster that clears 1.6:1 vs the eggshell page (#F0EAD6); any
   pick failing that floor is darkened by scaling its channels evenly. Show
   the census so Travis can veto a pick. Spine text picks ink vs eggshell by
   WCAG contrast (js/library.js `relLum`). `PALETTE` in js/stats.js remains
   only as the fallback for books with no stored color.
5. `status: "reading"`.
6. Cover if missing or wrong edition: Goodreads autocomplete API
   (`goodreads.com/book/auto_complete?format=json&q=…`, strip the `._SY75_`/`._SX50_`
   suffix from `imageUrl` for full size) or Amazon by ISBN-10
   (`images.amazon.com/images/P/<ISBN10>.01.LZZZZZZZ.jpg`). Save to
   `covers/<id>.jpg` — **lowercase** (Pages is case-sensitive), real JPEG, ≤900px tall
   (`sips -Z 900 -s format jpeg`). Prefer the edition Travis owns.

Adding a brand-new planned book: append to `books` with `status:"planned"`, fetch its
cover the same way, and set `totalPages` to the Goodreads record's page count (the
autocomplete response's `numPages`) so the queue ETA stays honest; other fields null. Array order of planned books = default queue rank
(browser drag-and-drop order overrides locally via localStorage).

**Forthcoming releases** (unpublished books Travis is waiting on) live in a separate
`forthcoming` array in books.json — `{id, title, author, totalPages, cover,
releaseDate}` — rendered beneath the queue as thumbnail + release date only,
chronological. They are NOT queue entries: excluded from ETA, ranking, shelves, and
every stat. When one is released and Travis has it, move it into `books` as
`status:"planned"` (drop `releaseDate`, keep the cover) and it joins the queue.

Queue order does NOT sync between devices (localStorage is per-browser). When Travis
asks to persist a ranking — by listing it, screenshotting his queue, or "move X to
#2" — reorder the planned entries in books.json to match and push. That commit is
the sync mechanism. The local override is only written when he actually drags on
that device — merely viewing the tab must never pin the default (that was the v1
bug that hid books.json reorders). A device he never dragged on tracks books.json;
one he dragged on keeps its own order by design.

## pages vs pages* (the whole point of the site)

- **pages** (no asterisk) = the book's actual page numbers. Used in user reports,
  log ranges, tooltips' page ranges, and each book's "N pages" fact.
- **pages\*** = typesetting-normalized unit. `global_wpp` = mean `wordsPerPage`
  across measured books; a book's factor = `wordsPerPage / global_wpp`;
  `pages* = pages × factor`. Books with `wordsPerPage: null` get factor 1 and are
  excluded from the mean.
- pages* is **always computed at render time** in the browser (js/derive.js) from raw
  facts. Never store a pages* number in the data files — the global average drifts
  whenever a new book is measured, retroactively (and intentionally) rescaling history.
- Anything displayed in pages* carries the asterisk (`pp*`). Keep that convention.

## Prose mode (easter egg)

Tapping the header checkerboard strip five times within ~2.5 s toggles **prose
mode**: every digit on the site goes to sleep and the same information renders as
qualitative descriptors ("On page 424 of 893" → "About halfway through"; book
titles like "2666" are the only exemption). The lexicon and mode store live in
`js/prose.js` (localStorage `books:mode:v1`); every renderer branches on
`isProse()`. The footer whispers the way back while prose mode is on.
**Rule: any new UI must include a prose branch — no digits may render in prose
mode.** Bucket thresholds in prose.js are editorial and tunable.

## Files

```
index.html        tabs: #library #queue #stats (hash-routed, single page)
css/style.css     palette tokens, chessboard motif, hard edges, serif stack
js/derive.js      pure math: dates (UTC-safe), wpp, aggregation — has no DOM
js/main.js        fetch (no-cache), router, error banner
js/library.js     reading cards + finished shelf
js/queue.js       drag-drop ranking, localStorage `books:queue-order:v2` (drag-only writes)
js/charts.js      hand-rolled SVG primitives + tooltip
js/prose.js       prose-mode store + the number→word lexicon
js/stats.js       records strip, cumulative charts (by book + total), daily scatter, log table, PALETTE
js/book.js        per-book page (#book/<id>): hero, how the reading went, the journal
data/books.json   one entry per book (see fields above)
data/log.json     append-only reading log
notes/<id>.md     reading journal, one file per book — Travis's words, verbatim
tools/cover_color.py  cover → accent color census (Pillow + numpy; `--write` stores it)
covers/*.jpg      local cover images, lowercase filenames
manifest.webmanifest + icons/   iOS/Android home-screen install (standalone PWA,
                  checkerboard icon; deliberately NO service worker — data must
                  always be network-fresh)
```

## Conventions & gotchas

- Dates are `YYYY-MM-DD` strings; in JS never `new Date("YYYY-MM-DD")` (UTC
  off-by-one) — use helpers in `js/derive.js`.
- All repo filenames lowercase; all URLs relative (site lives under `/books/`).
- 2666 baseline: tracking started at p. 410 of 893 on Day 0 — pages 1–410
  intentionally never appear in stats; the library card still shows true position.
- Local preview: `python3 -m http.server 8123` (or the `books-site` launch config) —
  `fetch()` and ES modules don't work over `file://`.
- Cumulative chart layering: series sort by final value descending so big books
  paint behind small ones. Colors come from `book.color` — since 2026-08-06 a
  color taken from the cover (its accent since 2026-09-25; see "Starting a new
  book" step 4), no longer the fixed palette, so series distinctness rides on
  the covers themselves — two red-titled books get two reds, by design; the
  PALETTE fallback (for colorless books) keeps its CVD-validated order — don't
  reorder it.
- Stats definitions: week = Mon–Sun (records + heatmap columns); month = calendar
  month; heatmap shades continuously with the darkest green pinned to the best
  recorded day in the active unit (auto-re-anchors when records fall; legendless
  by Travis's call, 2026-08-07 — js/charts.js `heatColor`);
  forecast & queue ETA = the **all-books universal pace in pages*/day**
  (typesetting-normalized, trailing 14 calendar days, shorter denominator until
  day 14, zeros included) applied to each book's remaining pages* — i.e., "done by
  X assuming all subsequent reading goes to this book". Normalized by Travis's call
  (2026-08-02): a day of dense reading buys more airy pages than raw math implies.
  Display exception (Travis, 2026-08-02): the **library card** shows that same pace
  divided by the book's factor — the rate in the book's own pages ("pp/day"), since
  a card answers "my rate in this book"; the finish date is identical either way.
  Book-agnostic by Travis's call (2026-07-27); "paused" appears only when nothing
  at all was logged in the window, never per-book.
- **Unstarted-today rule** (`effectiveToday` in js/derive.js): a day with no logged
  pages joins rate denominators (forecast, queue ETA, rolling pace) only once pages
  are logged on it or the calendar moves past it. A quiet morning must not halve
  the pace; a truly skipped day still counts as zero afterward. The same rule
  governs display: chart windows, the cumulative plateau, and the heatmap all end
  at the last counted day — an unstarted today never appears as a zero on any chart.
- "Cumulative, total" (chart-c, 2026-09-12) is the by-book areas summed — built
  from the same per-day rollup and window-relative like them, so the two charts
  agree at every hovered date; in ALL (the default) it is the running total since
  Day 0. Single forest-green line, no legend.
- Keep this file updated when workflows change.
