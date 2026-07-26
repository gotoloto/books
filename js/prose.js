// Prose mode — the easter egg where every number goes to sleep.
// The site's premise is quantitative; fiction is qualitative. In prose mode the
// same information renders through relative, literary descriptors instead of
// digits (book titles like "2666" are the sole exemption). Buckets are editorial,
// tuned to this site's real scales — adjust freely, they are not sacred.

const KEY = "books:mode:v1";

let prose = false;
try { prose = localStorage.getItem(KEY) === "prose"; } catch { /* private mode */ }

export function isProse() {
  return prose;
}

export function toggleProse() {
  prose = !prose;
  try { localStorage.setItem(KEY, prose ? "prose" : "count"); } catch { /* private mode */ }
  return prose;
}

export function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pick(v, table, fallback) {
  for (const [limit, word] of table) if (v < limit) return word;
  return fallback;
}

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function yearSuffix(y, today) {
  if (!today) return "";
  const ty = Number(String(today).slice(0, 4));
  if (y === ty) return "";
  if (y === ty + 1) return ", next year";
  if (y === ty - 1) return ", last year";
  return y > ty ? ", years from now" : ", years back";
}

// "late July" · "mid-August" · "early September, next year"
export function dateWord(iso, today) {
  const [y, m, d] = iso.split("-").map(Number);
  const month = MONTHS_FULL[m - 1];
  const base = d <= 10 ? `early ${month}` : d <= 20 ? `mid-${month}` : `late ${month}`;
  return base + yearSuffix(y, today);
}

// "August" from "YYYY-MM"
export function monthName(ym, today) {
  const [y, m] = ym.split("-").map(Number);
  return MONTHS_FULL[m - 1] + yearSuffix(y, today);
}

// reading progress, 0..1
export function fractionWord(p) {
  if (p >= 1) return "finished";
  return pick(p, [
    [0.02, "just cracked open"],
    [0.09, "the opening pages"],
    [0.20, "well begun"],
    [0.30, "a quarter in, give or take"],
    [0.44, "about a third of the way"],
    [0.56, "about halfway through"],
    [0.69, "past the middle"],
    [0.82, "deep in the back half"],
    [0.93, "approaching the end"],
  ], "the final pages");
}

// book size, in pages (or pages*)
export function lengthWord(pages) {
  return pick(pages, [
    [120, "a mere slip of a book"],
    [200, "a slim volume"],
    [300, "a modest number of pages"],
    [450, "a sturdy paperback's worth"],
    [650, "a substantial read"],
    [950, "a hefty number of pages"],
  ], "a monumental undertaking");
}

export function durationWord(days) {
  return pick(days, [
    [1.5, "a day"],
    [3.5, "a couple of days"],
    [6.5, "most of a week"],
    [10.5, "about a week"],
    [17.5, "a couple of weeks"],
    [27.5, "a few weeks"],
    [48, "about a month"],
    [75, "a couple of months"],
    [135, "a season"],
    [240, "half a year, give or take"],
    [400, "about a year"],
  ], "years, at this rate");
}

// raw pages per day
export function paceWord(ppd) {
  return pick(ppd, [
    [3, "at a crawl"],
    [8, "at a gentle amble"],
    [18, "at an easy pace"],
    [32, "at a steady clip"],
    [55, "briskly"],
    [85, "at a gallop"],
  ], "devouring");
}

// pp* in a single day
export function sessionWord(v) {
  return pick(v, [
    [5, "a token appearance"],
    [15, "a modest sitting"],
    [30, "a solid session"],
    [50, "a good long stretch"],
    [80, "a deep dive"],
  ], "a heroic shift");
}

export function weekWord(v) {
  return pick(v, [
    [30, "a quiet week"],
    [90, "a decent week"],
    [180, "a strong week"],
    [300, "a banner week"],
  ], "a legendary week");
}

export function monthWord(v) {
  return pick(v, [
    [120, "a quiet month"],
    [350, "a steady month"],
    [700, "a strong month"],
    [1200, "a prodigious month"],
  ], "a mythic month");
}

// cumulative pp*
export function totalWord(v) {
  return pick(v, [
    [30, "the first steps"],
    [120, "a promising start"],
    [400, "a steady accumulation"],
    [1200, "a respectable pile"],
    [4000, "a great heap of pages"],
  ], "a life's habit, visible");
}

export function streakWord(n) {
  if (n === 0) return "no streak to speak of";
  if (n === 1) return "a single day — a seed";
  return pick(n, [
    [4, "a young streak"],
    [7, "most of a week running"],
    [14, "a week and change, unbroken"],
    [30, "weeks without missing a day"],
  ], "an institution");
}

// typesetting density: wordsPerPage / global mean
export function wppWord(factor) {
  if (factor < 0.85) return "airily set type";
  if (factor <= 1.15) return "typically set type";
  return "densely set type";
}

const ORDINALS = [
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth",
  "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth",
  "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth",
];

export function ordinalWord(rank) {
  return ORDINALS[rank - 1] || "further down";
}

export function countBooksWord(n) {
  if (n === 1) return "a single book";
  if (n === 2) return "a pair of books";
  return pick(n, [
    [5, "a small stack"],
    [9, "a healthy stack"],
    [14, "a tall stack"],
    [20, "a generous shelf"],
  ], "a private library");
}
