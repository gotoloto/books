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

export function fmtMonth(iso) {
  const m = Number(iso.split("-")[1]);
  return MONTHS[m - 1];
}

// Monday of the ISO week containing iso (weeks run Mon–Sun).
export function mondayOf(iso) {
  const dow = new Date(toUTCms(iso)).getUTCDay(); // 0 = Sun
  return addDays(iso, -((dow + 6) % 7));
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

// ——— per-day rollup (day is the display granularity everywhere) ———

// Map<date, {star, titles[]}> — total pages* and the books touched that day.
export function perDayTotals(byBook, books, gWpp) {
  const map = new Map();
  for (const [bookId, days] of byBook) {
    const book = books.find((b) => b.id === bookId);
    const f = book ? starFactor(book, gWpp) : 1;
    for (const [date, info] of days) {
      if (!map.has(date)) map.set(date, { star: 0, titles: [] });
      const d = map.get(date);
      d.star += info.pages * f;
      d.titles.push(book && book.title ? book.title : bookId);
    }
  }
  return map;
}

// ——— records ———

export function records(byBook, books, gWpp, today) {
  const perDay = perDayTotals(byBook, books, gWpp);
  let bestDay = null;
  let total = 0;
  const weeks = new Map();   // ISO-Monday -> pages*
  const months = new Map();  // "YYYY-MM"  -> pages*
  for (const [date, v] of perDay) {
    total += v.star;
    if (!bestDay || v.star > bestDay.value) bestDay = { date, value: v.star };
    const wk = mondayOf(date);
    weeks.set(wk, (weeks.get(wk) || 0) + v.star);
    const ym = date.slice(0, 7);
    months.set(ym, (months.get(ym) || 0) + v.star);
  }
  // Sorted iteration → deterministic tie-breaks (earliest wins).
  let bestWeek = null;
  for (const start of [...weeks.keys()].sort()) {
    const value = weeks.get(start);
    if (!bestWeek || value > bestWeek.value) bestWeek = { start, value };
  }
  let bestMonth = null;
  for (const ym of [...months.keys()].sort()) {
    const value = months.get(ym);
    if (!bestMonth || value > bestMonth.value) bestMonth = { ym, value };
  }

  // Current streak: consecutive days counting back from today
  // (today itself may still be unlogged — start from yesterday in that case).
  let streak = 0;
  let cursor = perDay.has(today) ? today : addDays(today, -1);
  while (perDay.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  // Longest streak ever, with its span for the sublabel.
  const dates = [...perDay.keys()].sort();
  let longestStreak = null;
  let run = 0;
  for (let i = 0; i < dates.length; i++) {
    run = i > 0 && diffDays(dates[i - 1], dates[i]) === 1 ? run + 1 : 1;
    if (!longestStreak || run > longestStreak.len) {
      longestStreak = { len: run, start: dates[i - run + 1], end: dates[i] };
    }
  }
  return { bestDay, bestWeek, bestMonth, streak, longestStreak, total, daysRead: perDay.size };
}

// An unstarted day doesn't count: today joins rate denominators only once pages
// are logged on it. Until then the last counted day is yesterday (which becomes
// a real zero-day on its own once the calendar moves past it).
export function effectiveToday(entries, today) {
  return entries.some((e) => e.date === today) ? today : addDays(today, -1);
}

// ——— recent pace (actual pages/day, all books) ———
// Trailing-14-day mean in raw pages; denominator shrinks while history is young
// (mirrors forecast()). Raw pages because queue estimates have no measured wpp.
export function recentPacePages(entries, today) {
  if (!entries.length) return 0;
  const end = effectiveToday(entries, today);
  let first = entries[0].date;
  for (const e of entries) if (e.date < first) first = e.date;
  const denom = Math.min(14, Math.max(1, diffDays(first, end) + 1));
  const cutoff = addDays(end, -(denom - 1));
  let pages = 0;
  for (const e of entries) {
    if (e.date >= cutoff && e.date <= end) pages += e.to - e.from;
  }
  return pages / denom;
}

// ——— finish forecast ———
// Rate = the book's actual pages over the trailing 14 calendar days (shorter if
// tracking just began), zeros included. Naive on purpose.
export function forecast(book, entries, today) {
  if (!Number.isFinite(book.totalPages) || !book.startDate) return { rate: 0, date: null };
  const end = effectiveToday(entries, today);
  const denom = Math.min(14, Math.max(1, diffDays(book.startDate, end) + 1));
  const cutoff = addDays(end, -(denom - 1));
  let pages = 0;
  for (const e of entries) {
    if (e.book === book.id && e.date >= cutoff && e.date <= end) pages += e.to - e.from;
  }
  const rate = pages / denom;
  if (rate <= 0) return { rate: 0, date: null, denom };
  const remaining = book.totalPages - currentPosition(book, entries);
  if (remaining <= 0) return { rate, date: today, done: true, denom };
  const daysLeft = Math.ceil(remaining / rate);
  return { rate, date: addDays(end, daysLeft), daysLeft, denom };
}
