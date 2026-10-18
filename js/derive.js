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

// Map<date, {v, titles[]}> — the day's total in the chosen unit (pages* when
// useStar, raw pages otherwise) and the books touched that day.
export function perDayTotals(byBook, books, gWpp, useStar = true) {
  const map = new Map();
  for (const [bookId, days] of byBook) {
    const book = books.find((b) => b.id === bookId);
    const f = useStar && book ? starFactor(book, gWpp) : 1;
    for (const [date, info] of days) {
      if (!map.has(date)) map.set(date, { v: 0, titles: [] });
      const d = map.get(date);
      d.v += info.pages * f;
      d.titles.push(book && book.title ? book.title : bookId);
    }
  }
  return map;
}

// ——— records ———

export function records(byBook, books, gWpp, today, useStar = true) {
  const perDay = perDayTotals(byBook, books, gWpp, useStar);
  let bestDay = null;
  let total = 0;
  const weeks = new Map();   // ISO-Monday -> unit total
  const months = new Map();  // "YYYY-MM"  -> unit total
  for (const [date, v] of perDay) {
    total += v.v;
    if (!bestDay || v.v > bestDay.value) bestDay = { date, value: v.v };
    const wk = mondayOf(date);
    weeks.set(wk, (weeks.get(wk) || 0) + v.v);
    const ym = date.slice(0, 7);
    months.set(ym, (months.get(ym) || 0) + v.v);
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

// ——— recent pace (pages* per day, ALL books — the one true pace) ———
// Exponentially weighted mean in typesetting-normalized pages*: every day
// since the first logged one counts (unlogged days as zero), day d weighing
// 0.5^((end − d) / PACE_HALF_LIFE). Replaced the trailing-14-day mean on
// 2026-10-18 after a walk-forward back-test of the log: the finish-date miss
// on a 250–500 pp* remainder fell by about a quarter, and a big day now fades
// out instead of dropping off a window edge. Book-agnostic by design:
// forecasts everywhere read as "if all subsequent reading went here".
// Normalized so that time estimates stay honest when the current book's
// density differs from a target book's: a day of dense Bolaño buys more airy
// Chambers than raw page math implies.
export const PACE_HALF_LIFE = 14;

// "Paused": nothing at all logged in the last PAUSE_AFTER days through end.
// The weighted pace never reaches zero by itself, so this is the one hard edge
// that keeps a long gap from pushing finish dates into fiction.
export const PAUSE_AFTER = 14;

// Earliest logged day, or null for an empty log.
export function firstLogged(entries) {
  let first = null;
  for (const e of entries) if (!first || e.date < first) first = e.date;
  return first;
}

// The weighted pace at the close of every day from first to end, in whatever
// unit valueOf(date) returns (0 for a day with nothing logged): [{date, v}].
// One forward pass; the last point is the forecast's pace in that unit, and
// the stats chart draws the whole series, so the two can never disagree.
export function paceSeries(valueOf, first, end, halfLife = PACE_HALF_LIFE) {
  const decay = Math.pow(0.5, 1 / halfLife);
  const out = [];
  let num = 0;
  let den = 0;
  for (let d = first; d <= end; d = addDays(d, 1)) {
    num = num * decay + valueOf(d);
    den = den * decay + 1;
    out.push({ date: d, v: num / den });
  }
  return out;
}

// {rate, days, end}: rate in pages*/day; days = length of the log so far (the
// card calls the estimate "early" while that is shorter than a half-life).
export function recentPaceDetail(entries, books, gWpp, today) {
  if (!entries.length) return { rate: 0, days: 0, end: today };
  const factorOf = new Map(books.map((b) => [b.id, starFactor(b, gWpp)]));
  const end = effectiveToday(entries, today);
  const first = firstLogged(entries);
  const star = new Map(); // date → pages* logged that day
  let lastLogged = null;
  for (const e of entries) {
    if (e.date > end) continue;
    star.set(e.date, (star.get(e.date) || 0) + (e.to - e.from) * (factorOf.get(e.book) ?? 1));
    if (!lastLogged || e.date > lastLogged) lastLogged = e.date;
  }
  if (!lastLogged) return { rate: 0, days: 0, end };
  const days = diffDays(first, end) + 1;
  if (diffDays(lastLogged, end) >= PAUSE_AFTER) return { rate: 0, days, end };
  const series = paceSeries((d) => star.get(d) || 0, first, end);
  return { rate: series[series.length - 1].v, days, end };
}

// ——— finish forecast ———
// Universal-pace forecast (Travis's call): the book's remaining pages* at the
// ALL-books pages*/day pace — "done by X, assuming all subsequent reading goes
// here." A book idle for weeks still gets a date (the refocus hypothetical);
// "paused" only means no reading at all in the last PAUSE_AFTER days.
export function forecast(book, entries, books, gWpp, today) {
  if (!Number.isFinite(book.totalPages) || !book.startDate) return { rate: 0, date: null };
  const { rate, days, end } = recentPaceDetail(entries, books, gWpp, today);
  if (rate <= 0) return { rate: 0, date: null, days };
  const remaining = book.totalPages - currentPosition(book, entries);
  if (remaining <= 0) return { rate, date: today, done: true, days };
  const daysLeft = Math.ceil((remaining * starFactor(book, gWpp)) / rate);
  return { rate, date: addDays(end, daysLeft), daysLeft, days };
}
