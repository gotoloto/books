import {
  addDays, cumulativeSeries, dailyPoints, diffDays,
  fmtLong, fmtMonthYear, fmtShort, perDayTotals, records, starFactor,
} from "./derive.js";
import { renderCumulative, renderDaily, renderHeatmap } from "./charts.js";

// Validated series palette — fixed assignment order, never shuffled.
const PALETTE = ["#3A7A33", "#C99414", "#4C74B8", "#C0552D", "#1B9488", "#A26320", "#A0538F", "#8A941F"];
const PRESETS = [["2w", 14], ["1m", 30], ["3m", 91], ["1y", 365], ["all", null]];
const DAY0 = "2026-07-26";

const ui = { preset: "1m", unit: "star", customStart: null, customEnd: null, built: false };

// Window-independent per-day pp* rollup; refreshed on each stats activation.
let perDay = new Map();

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Color follows the book, never its rank: explicit book.color wins; otherwise
// a stable slot by order of first tracking (startDate), which never reorders.
// Exported for the spine shelf (library.js).
export function bookColor(book, state) {
  if (book.color) return book.color;
  const tracked = state.books
    .filter((b) => b.status !== "planned")
    .sort((a, b) => ((a.startDate || "") < (b.startDate || "") ? -1 : 1));
  const idx = tracked.findIndex((b) => b.id === book.id);
  return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length];
}

function day0(state) {
  let d0 = DAY0;
  for (const b of state.books) if (b.startDate && b.startDate < d0) d0 = b.startDate;
  for (const e of state.entries) if (e.date < d0) d0 = e.date;
  return d0;
}

function windowRange(state) {
  if (ui.preset === "custom" && ui.customStart && ui.customEnd && ui.customStart <= ui.customEnd) {
    return [ui.customStart, ui.customEnd];
  }
  const end = state.today;
  if (ui.preset === "all") {
    let s = day0(state);
    if (diffDays(s, end) < 13) s = addDays(end, -13); // breathing room early on
    return [s, end];
  }
  const days = PRESETS.find((p) => p[0] === ui.preset)[1];
  return [addDays(end, -(days - 1)), end];
}

function buildControls(state) {
  if (ui.built) return;
  ui.built = true;
  const c = document.getElementById("controls");

  for (const [key] of PRESETS) {
    const b = document.createElement("button");
    b.className = "btn";
    b.dataset.preset = key;
    b.textContent = key.toUpperCase();
    b.addEventListener("click", () => {
      ui.preset = key;
      renderCharts(state);
    });
    c.appendChild(b);
  }

  const lbl = document.createElement("span");
  lbl.className = "lbl-sm";
  lbl.textContent = "or";
  c.appendChild(lbl);

  const mkDate = (which) => {
    const i = document.createElement("input");
    i.type = "date";
    i.setAttribute("aria-label", which === "start" ? "Window start" : "Window end");
    i.addEventListener("change", () => {
      ui[which === "start" ? "customStart" : "customEnd"] = i.value || null;
      if (ui.customStart && ui.customEnd) {
        ui.preset = "custom";
        renderCharts(state);
      }
    });
    return i;
  };
  c.appendChild(mkDate("start"));
  const dash = document.createElement("span");
  dash.className = "lbl-sm";
  dash.textContent = "–";
  c.appendChild(dash);
  c.appendChild(mkDate("end"));

  const gap = document.createElement("span");
  gap.className = "gap";
  c.appendChild(gap);

  const sw = document.createElement("span");
  sw.className = "unit-switch";
  for (const [key, text] of [["raw", "pages"], ["star", "pages*"]]) {
    const b = document.createElement("button");
    b.className = "btn";
    b.dataset.unit = key;
    b.setAttribute("role", "switch");
    b.textContent = text;
    b.addEventListener("click", () => {
      ui.unit = key;
      renderCharts(state);
    });
    sw.appendChild(b);
  }
  c.appendChild(sw);
}

function syncControls() {
  for (const b of document.querySelectorAll("#controls .btn[data-preset]")) {
    b.setAttribute("aria-pressed", String(b.dataset.preset === ui.preset));
  }
  for (const b of document.querySelectorAll("#controls .btn[data-unit]")) {
    b.setAttribute("aria-pressed", String(b.dataset.unit === ui.unit));
  }
}

function renderRecords(state) {
  const r = records(state.daily, state.books, state.gWpp, state.today);
  const days = (n) => `${n} <small>${n === 1 ? "day" : "days"}</small>`;
  const tiles = [
    {
      val: r.bestDay ? `${Math.round(r.bestDay.value)} <small>pp*</small>` : "—",
      lbl: r.bestDay ? `best day · ${fmtShort(r.bestDay.date)}` : "best day",
    },
    {
      val: r.bestWeek ? `${Math.round(r.bestWeek.value)} <small>pp*</small>` : "—",
      lbl: r.bestWeek ? `best week · wk of ${fmtShort(r.bestWeek.start)}` : "best week",
    },
    {
      val: r.bestMonth ? `${Math.round(r.bestMonth.value)} <small>pp*</small>` : "—",
      lbl: r.bestMonth ? `best month · ${fmtMonthYear(r.bestMonth.ym + "-01")}` : "best month",
    },
    {
      val: r.longestStreak ? days(r.longestStreak.len) : "—",
      lbl: r.longestStreak
        ? `longest streak · ${fmtShort(r.longestStreak.start)}–${fmtShort(r.longestStreak.end)}`
        : "longest streak",
    },
    {
      val: days(r.streak),
      lbl: "current streak",
    },
    {
      val: `${Math.round(r.total)} <small>pp*</small>`,
      lbl: `since day 0 · ${r.daysRead} ${r.daysRead === 1 ? "day" : "days"} read`,
    },
  ];
  document.getElementById("records").innerHTML = tiles
    .map((t) => `<div class="tile"><div class="checker" aria-hidden="true"></div><div class="val">${t.val}</div><div class="lbl">${t.lbl}</div></div>`)
    .join("");
}

function renderCharts(state) {
  syncControls();
  const [ws, we] = windowRange(state);
  const useStar = ui.unit === "star";
  const unitLabel = useStar ? "pages*" : "pages";

  const series = [];
  for (const b of state.books) {
    if (b.status === "planned") continue;
    const days = state.daily.get(b.id);
    if (!days) continue;
    const pts = cumulativeSeries(days, ws, we);
    if (!pts.length) continue; // no reading in window → omitted entirely
    const f = useStar ? starFactor(b, state.gWpp) : 1;
    const points = pts.map((p) => ({ date: p.date, v: p.cum * f }));
    series.push({
      title: b.title,
      color: bookColor(b, state),
      points,
      final: points[points.length - 1].v,
      finished: b.status === "finished",
      finishDate: b.finishDate || null,
    });
  }
  // Big books painted first (behind); small books stay visible on top.
  series.sort((a, b) => b.final - a.final);

  document.getElementById("legend-a").innerHTML = series
    .map((s) => `<span class="key"><span class="swatch" style="background:${s.color}"></span>${esc(s.title)}</span>`)
    .join("");

  renderCumulative(document.getElementById("chart-a"), series, {
    winStart: ws, winEnd: we, today: state.today, unitLabel,
  });

  const pts = dailyPoints(state.daily, ws, we).map((p) => {
    const b = state.byId.get(p.bookId);
    return {
      date: p.date,
      title: b ? b.title : p.bookId,
      ranges: p.ranges,
      v: p.pages * (b ? starFactor(b, state.gWpp) : 1),
    };
  });
  // 7-day rolling mean of total pp*/day (zeros count; may look back before the
  // window via the full perDay map). Chart B is always pp* — toggle never applies.
  const paceEnd = we < state.today ? we : state.today;
  const pace = [];
  for (let d = ws; d <= paceEnd; d = addDays(d, 1)) {
    let sum = 0;
    for (let k = 0; k < 7; k++) {
      const v = perDay.get(addDays(d, -k));
      if (v) sum += v.star;
    }
    pace.push({ date: d, v: sum / 7 });
  }
  renderDaily(document.getElementById("chart-b"), pts, {
    winStart: ws, winEnd: we, unitLabel: "pages*", pace,
  });
}

function renderNormNote(state) {
  const measured = state.books.filter((b) => Number.isFinite(b.wordsPerPage));
  const el = document.getElementById("norm-note");
  if (!state.gWpp) {
    el.textContent = "";
    return;
  }
  const one = measured.length === 1 ? " With a single measured book, pages = pages*." : "";
  el.textContent =
    `* pages* are typesetting-normalized: 1 page* = ${Math.round(state.gWpp)} words, ` +
    `the average across ${measured.length} measured book${measured.length === 1 ? "" : "s"}.` + one;
}

function renderLogTable(state) {
  const box = document.getElementById("log-table");
  if (!state.entries.length) {
    box.innerHTML = '<p class="empty-note">No entries yet.</p>';
    return;
  }
  // Day granularity: one row per (book, day); same-day sessions merge into one range.
  const rows = [];
  for (const [bookId, days] of state.daily) {
    const b = state.byId.get(bookId);
    const f = b ? starFactor(b, state.gWpp) : 1;
    for (const [date, info] of days) {
      rows.push({
        date,
        title: b ? b.title : bookId,
        from: info.ranges[0][0],
        to: info.ranges[info.ranges.length - 1][1],
        pages: info.pages,
        star: Math.round(info.pages * f),
      });
    }
  }
  rows.sort((a, b) => (a.date === b.date ? (a.title < b.title ? -1 : 1) : a.date < b.date ? 1 : -1));
  const html = rows
    .map((r) => `<tr>
        <td>${fmtLong(r.date)}</td>
        <td>${esc(r.title)}</td>
        <td class="num">${r.from} → ${r.to}</td>
        <td class="num">${r.pages}</td>
        <td class="num">${r.star}</td>
      </tr>`)
    .join("");
  box.innerHTML = `<table class="log">
    <thead><tr><th>Date</th><th>Book</th><th class="num">Range</th><th class="num">pp</th><th class="num">pp*</th></tr></thead>
    <tbody>${html}</tbody>
  </table>`;
}

export function renderStats(state) {
  perDay = perDayTotals(state.daily, state.books, state.gWpp);
  buildControls(state);
  renderRecords(state);
  renderHeatmap(document.getElementById("heatmap"), perDay, { today: state.today });
  renderCharts(state);
  renderNormNote(state);
  renderLogTable(state);
}
