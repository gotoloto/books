// Pure derivation helpers. No DOM. All dates are "YYYY-MM-DD" strings;
// never construct Date from an ISO string (UTC off-by-one) — parse manually.

const DAY_MS = 86400000;

export function toUTCms(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUTCms(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function addDays(iso, n) {
  return fromUTCms(toUTCms(iso) + n * DAY_MS);
}

export function diffDays(a, b) {
  return Math.round((toUTCms(b) - toUTCms(a)) / DAY_MS);
}

// Today in the reader's local calendar (reading days are local days).
export function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function fmtShort(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function fmtMonthYear(iso) {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ’${String(y).slice(2)}`;
}

export function fmtLong(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

// ——— pages* machinery ———

// Global words-per-page: mean over books with a measured wordsPerPage.
export function globalWpp(books) {
  const vals = books.filter((b) => Number.isFinite(b.wordsPerPage)).map((b) => b.wordsPerPage);
  if (!vals.length) return null;
  return vals.reduce((a, v) => a + v, 0) / vals.length;
}

// pages → pages* multiplier for one book. Books without a measured
// wordsPerPage fall back to 1 (a page is a page until measured).
export function starFactor(book, gWpp) {
  if (!gWpp || !Number.isFinite(book.wordsPerPage)) return 1;
  return book.wordsPerPage / gWpp;
}

// ——— log aggregation ———

// Map<bookId, Map<date, {pages, ranges: [[from,to], …]}>>
// pages = Σ (to − from) per (book, day); ranges kept in log order.
export function buildDaily(entries) {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const byBook = new Map();
  for (const e of sorted) {
    if (!byBook.has(e.book)) byBook.set(e.book, new Map());
    const days = byBook.get(e.book);
    if (!days.has(e.date)) days.set(e.date, { pages: 0, ranges: [] });
    const day = days.get(e.date);
    day.pages += e.to - e.from;
    day.ranges.push([e.from, e.to]);
  }
  return byBook;
}

// Latest bookmark position for a book (last entry's `to`), else startPage.
export function currentPosition(book, entries) {
  let pos = Number.isFinite(book.startPage) ? book.startPage : 0;
  let latest = null;
  for (const e of entries) {
    if (e.book !== book.id) continue;
    if (!latest || e.date > latest.date || (e.date === latest.date && e.to > latest.to)) latest = e;
  }
  if (latest) pos = Math.max(pos, latest.to);
  return pos;
}

// Cumulative series for one book inside [winStart, winEnd]:
// [{date, cum}] with one point per reading day, anchored at (winStart, 0).
// Counts only pages read inside the window.
export function cumulativeSeries(daysMap, winStart, winEnd) {
  const pts = [];
  let cum = 0;
  const dates = [...daysMap.keys()].filter((d) => d >= winStart && d <= winEnd).sort();
  for (const d of dates) {
    cum += daysMap.get(d).pages;
    pts.push({ date: d, cum });
  }
  return pts;
}

// All (book, date, pages, ranges) tuples inside a window.
export function dailyPoints(byBook, winStart, winEnd) {
  const out = [];
  for (const [bookId, days] of byBook) {
    for (const [date, info] of days) {
      if (date >= winStart && date <= winEnd && info.pages > 0) {
        out.push({ bookId, date, pages: info.pages, ranges: info.ranges });
      }
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

// ——— records ———

export function records(byBook, books, gWpp, today) {
  const perDay = new Map(); // date -> pages* total
  for (const [bookId, days] of byBook) {
    const book = books.find((b) => b.id === bookId);
    const f = book ? starFactor(book, gWpp) : 1;
    for (const [date, info] of days) {
      perDay.set(date, (perDay.get(date) || 0) + info.pages * f);
    }
  }
  let bestDay = null;
  let total = 0;
  for (const [date, v] of perDay) {
    total += v;
    if (!bestDay || v > bestDay.value) bestDay = { date, value: v };
  }
  // Streak: consecutive days with reading, counting back from today
  // (today itself may still be unlogged — start from yesterday in that case).
  let streak = 0;
  let cursor = perDay.has(today) ? today : addDays(today, -1);
  while (perDay.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return { bestDay, streak, total, daysRead: perDay.size };
}
