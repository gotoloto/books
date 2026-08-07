// Hand-rolled SVG chart primitives. Fixed-pixel coordinates (1 svg unit = 1 css px),
// full re-render on every change — the data is tiny.

import { addDays, diffDays, fmtShort, fmtMonth, fmtMonthYear, fmtLong, fromUTCms, mondayOf } from "./derive.js";
import { dateWord, sessionWord, totalWord } from "./prose.js";

const NS = "http://www.w3.org/2000/svg";

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// Heckbert nice numbers: ticks 0…niceMax in steps of 1/2/5·10^n.
export function niceTicks(maxVal, target = 5) {
  const max = maxVal > 0 ? maxVal : 10;
  const raw = max / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return { ticks, top };
}

// Date tick positions for [start, end], decimated to fit innerW.
export function dateTicks(start, end, innerW) {
  const span = Math.max(1, diffDays(start, end));
  let dates = [];
  if (span <= 16) {
    const step = span <= 8 ? 1 : 2;
    for (let d = start; d <= end; d = addDays(d, step)) dates.push(d);
  } else if (span <= 95) {
    const step = span <= 42 ? 7 : 14;
    for (let d = start; d <= end; d = addDays(d, step)) dates.push(d);
  } else {
    // month starts (quarter starts past ~14 months)
    const everyN = span <= 420 ? 1 : 3;
    let [y, m] = start.split("-").map(Number);
    if (start.slice(8) !== "01") { m += 1; if (m > 12) { m = 1; y += 1; } }
    while (true) {
      const d = fromUTCms(Date.UTC(y, m - 1, 1));
      if (d > end) break;
      if ((m - 1) % everyN === 0) dates.push(d);
      m += 1; if (m > 12) { m = 1; y += 1; }
    }
    if (!dates.length) dates = [start, end];
  }
  const maxTicks = Math.max(3, Math.floor(innerW / 64));
  while (dates.length > maxTicks) dates = dates.filter((_, i) => i % 2 === 0);
  const fmt = span <= 95 ? fmtShort : fmtMonthYear;
  return { dates, fmt };
}

// ——— shared tooltip ———

let tt = null;
export function tooltipShow(wrap, html, clientX, clientY) {
  if (!tt) {
    tt = document.createElement("div");
    tt.className = "tooltip";
  }
  if (tt.parentElement !== wrap) wrap.appendChild(tt);
  tt.innerHTML = html;
  tt.hidden = false;
  const wr = wrap.getBoundingClientRect();
  const tw = tt.offsetWidth;
  let x = clientX - wr.left + 14;
  if (x + tw > wr.width - 4) x = clientX - wr.left - tw - 14;
  let y = clientY - wr.top - 12;
  y = Math.max(2, Math.min(y, wr.height - tt.offsetHeight - 2));
  tt.style.left = `${Math.max(2, x)}px`;
  tt.style.top = `${y}px`;
}
export function tooltipHide() {
  if (tt) tt.hidden = true;
}

// ——— scaffolding shared by both charts ———

const M = { top: 16, right: 20, bottom: 32, left: 52 };

function frame(container, height, winStart, winEnd, maxVal, unitLabel, prose) {
  container.innerHTML = "";
  const width = Math.max(320, container.clientWidth);
  const innerW = width - M.left - M.right;
  const innerH = height - M.top - M.bottom;
  const svg = el("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img" });
  container.appendChild(svg);

  const span = Math.max(1, diffDays(winStart, winEnd));
  const x = (iso) => M.left + (diffDays(winStart, iso) / span) * innerW;
  const { ticks, top } = niceTicks(maxVal);
  const y = (v) => M.top + innerH - (v / top) * innerH;

  const g = el("g", { "shape-rendering": "crispEdges" });
  svg.appendChild(g);
  for (const t of ticks) {
    const yy = Math.round(y(t)) + 0.5;
    g.appendChild(el("line", { x1: M.left, x2: width - M.right, y1: yy, y2: yy, stroke: "#D8CBAA", "stroke-width": 1 }));
    if (!prose) {
      const lbl = el("text", { x: M.left - 8, y: yy + 4, "text-anchor": "end", "font-size": 12.5 });
      lbl.textContent = String(t);
      svg.appendChild(lbl);
    }
  }
  // baseline
  g.appendChild(el("line", {
    x1: M.left, x2: width - M.right,
    y1: Math.round(y(0)) + 0.5, y2: Math.round(y(0)) + 0.5,
    stroke: "#4A523F", "stroke-width": 1,
  }));

  const { dates, fmt } = dateTicks(winStart, winEnd, innerW);
  let prevLabel = null;
  for (const d of dates) {
    const xx = Math.round(x(d)) + 0.5;
    g.appendChild(el("line", { x1: xx, x2: xx, y1: height - M.bottom, y2: height - M.bottom + 4, stroke: "#4A523F", "stroke-width": 1 }));
    const text = prose ? dateWord(d) : fmt(d);
    if (prose && text === prevLabel) continue; // "mid-July, mid-July" reads badly
    prevLabel = text;
    const lbl = el("text", { x: xx, y: height - M.bottom + 18, "text-anchor": "middle", "font-size": 12.5 });
    lbl.textContent = text;
    svg.appendChild(lbl);
  }

  if (!prose) {
    const unit = el("text", { x: M.left + 8, y: M.top + 14, "text-anchor": "start", "font-size": 12.5, "font-style": "italic" });
    unit.textContent = unitLabel;
    svg.appendChild(unit);
  }

  return { svg, width, height, x, y, top, innerW, innerH };
}

// ——— Chart A: layered cumulative areas ———
// series: [{title, color, points:[{date, v}], final}] ALREADY sorted final-desc
// (largest painted first, so smaller books land on top and stay visible).

export function renderCumulative(container, series, opts) {
  const { winStart, winEnd, today, unitLabel, prose } = opts;
  if (!series.length) {
    container.innerHTML = `<div class="chart-empty">No reading logged in this window.</div>`;
    return;
  }
  const maxVal = Math.max(...series.map((s) => s.final));
  const f = frame(container, 340, winStart, winEnd, maxVal, unitLabel, prose);

  const drawEnd = winEnd < today ? winEnd : today; // never draw into the future

  for (const s of series) {
    // Zero-anchor the day before the first reading day (clamped to the window)
    // so a book that enters mid-window stays flat at 0 until it actually starts.
    const dayBefore = addDays(s.points[0].date, -1);
    const anchor = dayBefore > winStart ? dayBefore : winStart;
    const pts = [{ date: anchor, v: 0 }, ...s.points];
    const last = pts[pts.length - 1];
    // A book that ended (finished/DNF) inside the view stops at flag day with a
    // straight drop to the baseline; only living books extend flat to "now".
    const endedInView = s.ended && s.endDate && s.endDate <= winEnd;
    if (!endedInView && last.date < drawEnd) pts.push({ date: drawEnd, v: last.v });

    const base = pts.map((p, i) => `${i ? "L" : "M"}${f.x(p.date).toFixed(1)},${f.y(p.v).toFixed(1)}`).join("");
    const lastX = f.x(pts[pts.length - 1].date).toFixed(1);
    const y0 = f.y(0).toFixed(1);
    const line = endedInView ? `${base}L${lastX},${y0}` : base;
    const area = `${base}L${lastX},${y0}L${f.x(winStart).toFixed(1)},${y0}Z`;

    const g = el("g");
    g.appendChild(el("path", { d: area, fill: s.color, "fill-opacity": 0.18, stroke: "none" }));
    g.appendChild(el("path", { d: line, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "miter" }));
    f.svg.appendChild(g);
  }

  // End-of-book pennants — drawn after every area so no series paints over a
  // flag. Finished: checkered 2×2 in the book's color (triumph). DNF: a solid
  // white flag (surrender). Both on a pole at the summit, clamped to the top.
  for (const s of series) {
    if (!(s.ended && s.endDate && s.endDate >= winStart && s.endDate <= winEnd)) continue;
    const last = s.points[s.points.length - 1];
    if (!last || last.v <= 0) continue;
    const px = f.x(last.date);
    const py = f.y(last.v);
    const fy = Math.max(2, py - 26);
    const flag = el("g", { "shape-rendering": "crispEdges" });
    flag.appendChild(el("line", { x1: px.toFixed(1), x2: px.toFixed(1), y1: py.toFixed(1), y2: (fy + 10).toFixed(1), stroke: "#1E2A1E", "stroke-width": 1.5 }));
    const qx = px.toFixed(1);
    if (s.finished) {
      flag.appendChild(el("rect", { x: qx, y: fy, width: 5, height: 5, fill: s.color }));
      flag.appendChild(el("rect", { x: (px + 5).toFixed(1), y: fy + 5, width: 5, height: 5, fill: s.color }));
      flag.appendChild(el("rect", { x: (px + 5).toFixed(1), y: fy, width: 5, height: 5, fill: "#F0EAD6" }));
      flag.appendChild(el("rect", { x: qx, y: fy + 5, width: 5, height: 5, fill: "#F0EAD6" }));
      flag.appendChild(el("rect", { x: qx, y: fy, width: 10, height: 10, fill: "none", stroke: "#1E2A1E", "stroke-width": 1 }));
    } else {
      flag.appendChild(el("rect", { x: qx, y: fy, width: 10, height: 10, fill: "#FFFFFF", stroke: "#1E2A1E", "stroke-width": 1 }));
    }
    const t = el("title");
    const verb = s.finished ? "finished" : "abandoned";
    t.textContent = `${s.title} — ${verb} ${prose ? dateWord(s.endDate) : fmtLong(s.endDate)}`;
    flag.appendChild(t);
    f.svg.appendChild(flag);
  }

  // hover: crosshair snapped to the nearest date carrying any data point
  const hoverDates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const cross = el("line", { y1: M.top, y2: f.height - M.bottom, stroke: "#4A523F", "stroke-width": 1, "stroke-dasharray": "3,3", visibility: "hidden" });
  f.svg.appendChild(cross);

  f.svg.addEventListener("mousemove", (e) => {
    if (!hoverDates.length) return;
    const rect = f.svg.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = hoverDates[0], bd = Infinity;
    for (const d of hoverDates) {
      const dd = Math.abs(f.x(d) - px);
      if (dd < bd) { bd = dd; best = d; }
    }
    if (bd > 60) { cross.setAttribute("visibility", "hidden"); tooltipHide(); return; }
    const xx = f.x(best).toFixed(1);
    cross.setAttribute("x1", xx); cross.setAttribute("x2", xx);
    cross.setAttribute("visibility", "visible");
    const rows = series
      .map((s) => {
        // An ended book leaves the tooltip after its last reading day.
        const lastDate = s.points[s.points.length - 1].date;
        if (s.ended && best > lastDate) return { v: 0 };
        let v = 0;
        for (const p of s.points) { if (p.date <= best) v = p.v; else break; }
        const endedHere = s.ended && s.endDate === best;
        return { title: s.title, color: s.color, v, endNote: endedHere ? (s.finished ? "&nbsp;· finished" : "&nbsp;· abandoned") : "" };
      })
      .filter((r) => r.v > 0)
      .sort((a, b) => b.v - a.v)
      .map((r) => prose
        ? `<span style="color:${r.color}">■</span> ${esc(r.title)} — ${totalWord(r.v)}${r.endNote}`
        : `<span style="color:${r.color}">■</span> ${esc(r.title)} — <b>${Math.round(r.v)}</b>${r.endNote}`)
      .join("<br>");
    tooltipShow(container, `<span class="tt-date">${prose ? dateWord(best) : fmtLong(best)}</span>${rows || "—"}`, e.clientX, e.clientY);
  });
  f.svg.addEventListener("mouseleave", () => { cross.setAttribute("visibility", "hidden"); tooltipHide(); });
}

// ——— Chart B: daily lollipops ———
// days: [{date, total, segments: [{title, color, ranges, v}]}] — ONE lollipop
// per day (day granularity). Multi-book days stack their stem in book colors,
// bottom-up in stable book order, with a hairline eggshell cut at each joint;
// the dot wears the top segment's color. opts.pace = [{date, v}] draws the
// 7-day rolling mean as a dashed line.

export function renderDaily(container, days, opts) {
  const { winStart, winEnd, unitLabel, pace = [], prose } = opts;
  if (!days.length) {
    container.innerHTML = `<div class="chart-empty">No reading logged in this window.</div>`;
    return;
  }
  const maxVal = Math.max(...days.map((d) => d.total), ...pace.map((p) => p.v));
  const f = frame(container, 280, winStart, winEnd, maxVal, unitLabel, prose);

  const meta = [];
  const stems = el("g");
  const paceG = el("g");
  const dots = el("g");
  f.svg.appendChild(stems);
  f.svg.appendChild(paceG);
  f.svg.appendChild(dots);

  if (pace.length > 1) {
    const d = pace.map((p, i) => `${i ? "L" : "M"}${f.x(p.date).toFixed(1)},${f.y(p.v).toFixed(1)}`).join("");
    paceG.appendChild(el("path", {
      d, fill: "none", stroke: "#4A523F", "stroke-width": 1.5, "stroke-dasharray": "5,4",
      "pointer-events": "none",
    }));
    const cap = document.createElement("p");
    cap.className = "footnote";
    cap.textContent = prose
      ? "– – the shape of the week"
      : `– – 7-day rolling pace (${unitLabel === "pages" ? "pp" : "pp*"}/day)`;
    container.appendChild(cap);
  }

  for (const day of days) {
    const cx = f.x(day.date).toFixed(1);
    let cum = 0;
    for (const seg of day.segments) {
      const yBot = f.y(cum).toFixed(1);
      const yTop = f.y(cum + seg.v).toFixed(1);
      stems.appendChild(el("line", {
        x1: cx, x2: cx, y1: yBot, y2: yTop,
        stroke: seg.color, "stroke-width": 2, "stroke-opacity": 0.85,
      }));
      cum += seg.v;
      // chessboard cut where the next book takes over
      if (cum < day.total - 1e-9) {
        stems.appendChild(el("line", {
          x1: (f.x(day.date) - 2.5).toFixed(1), x2: (f.x(day.date) + 2.5).toFixed(1),
          y1: f.y(cum).toFixed(1), y2: f.y(cum).toFixed(1),
          stroke: "#F0EAD6", "stroke-width": 1.5,
        }));
      }
    }
    const topColor = day.segments[day.segments.length - 1].color;
    const cy = f.y(day.total).toFixed(1);
    dots.appendChild(el("circle", { cx, cy, r: 4.5, fill: topColor, "fill-opacity": 0.9, stroke: "#F0EAD6", "stroke-width": 1 }));
    // one hit zone per lollipop: the whole stem plus the dot
    dots.appendChild(el("rect", {
      x: (f.x(day.date) - 8).toFixed(1), width: 16,
      y: (f.y(day.total) - 12).toFixed(1),
      height: (f.y(0) - f.y(day.total) + 12).toFixed(1),
      fill: "transparent", "data-i": meta.length,
    }));
    meta.push(day);
  }

  const showDay = (day, e) => {
    if (prose) {
      const names = day.segments.map((s) => `<span style="color:${s.color}">■</span> ${esc(s.title)}`).join("<br>");
      tooltipShow(
        container,
        `<span class="tt-date">${dateWord(day.date)}</span><b>${sessionWord(day.total)}</b><br>${names}`,
        e.clientX, e.clientY
      );
      return;
    }
    // Day granularity: each book's sessions merge into one contiguous range.
    const rows = day.segments
      .map((s) => {
        const range = `pp.&nbsp;${s.ranges[0][0]}–${s.ranges[s.ranges.length - 1][1]}`;
        return `<span style="color:${s.color}">■</span> ${esc(s.title)} — ${range} · ${Math.round(s.v)}`;
      })
      .join("<br>");
    const head = day.segments.length > 1
      ? `<b>${Math.round(day.total)} ${unitLabel}</b><br>`
      : "";
    tooltipShow(
      container,
      `<span class="tt-date">${fmtLong(day.date)}</span>${head}${rows}${day.segments.length > 1 ? "" : ` ${unitLabel}`}`,
      e.clientX, e.clientY
    );
  };
  const onPointer = (e) => {
    const hit = e.target.closest("[data-i]");
    if (!hit) { tooltipHide(); return; }
    showDay(meta[Number(hit.getAttribute("data-i"))], e);
  };
  f.svg.addEventListener("mousemove", onPointer);
  f.svg.addEventListener("click", onPointer); // tap-to-show for touch
  f.svg.addEventListener("mouseleave", tooltipHide);
}

// ——— Heatmap: trailing-year calendar, one cell per day ———
// perDay: Map<date, {star, titles[]}> (pages* totals). Chessboard of the reading year.

// Ramp anchored on brand tokens (eggshell-2 → --s1 → forest-deep), monotonic lightness.
const HEAT_BINS = ["#E4DCC3", "#B9C9A0", "#7FA860", "#3A7A33", "#22381F"];
const HEAT_LABELS = ["0", "1–14", "15–29", "30–49", "50+"];
const heatBin = (v) => (v <= 0 ? 0 : v < 15 ? 1 : v < 30 ? 2 : v < 50 ? 3 : 4);

export function renderHeatmap(container, perDay, opts) {
  const { today, prose, unit = "pp*" } = opts;
  container.innerHTML = "";
  const CELL = 13, PITCH = 16, LEFT = 34, TOP = 18;
  const start = mondayOf(addDays(today, -364)); // Monday on/before one year ago
  const weeks = Math.floor(diffDays(start, today) / 7) + 1;
  const width = LEFT + weeks * PITCH - 3 + 2;
  const height = TOP + 7 * PITCH - 3 + 2;

  const scroll = document.createElement("div");
  scroll.className = "heat-scroll";
  container.appendChild(scroll);
  const svg = el("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img" });
  scroll.appendChild(svg);

  // Month labels: every month change; drop the col-0 label if the next one crowds it.
  const labelCols = [];
  let prevMonth = "";
  for (let w = 0; w < weeks; w++) {
    const ym = addDays(start, w * 7).slice(0, 7);
    if (ym !== prevMonth) {
      labelCols.push(w);
      prevMonth = ym;
    }
  }
  if (labelCols.length > 1 && labelCols[1] - labelCols[0] < 3) labelCols.shift();
  for (const w of labelCols) {
    const t = el("text", { x: LEFT + w * PITCH, y: 11, "font-size": 11 });
    t.textContent = fmtMonth(addDays(start, w * 7));
    svg.appendChild(t);
  }

  const meta = [];
  for (let w = 0; w < weeks; w++) {
    const colMonday = addDays(start, w * 7);
    for (let r = 0; r < 7; r++) {
      const d = addDays(colMonday, r);
      if (d > today) break;
      const info = perDay.get(d);
      const v = info ? info.v : 0;
      const bin = heatBin(v);
      const rect = el("rect", {
        x: LEFT + w * PITCH, y: TOP + r * PITCH, width: CELL, height: CELL, fill: HEAT_BINS[bin],
      });
      if (bin === 0) {
        rect.setAttribute("stroke", "#C7B58F");
        rect.setAttribute("stroke-width", 1);
      } else {
        rect.setAttribute("data-i", meta.length);
        meta.push({ date: d, v, titles: info.titles });
      }
      svg.appendChild(rect);
    }
  }
  for (const [row, lbl] of [[0, "Mon"], [2, "Wed"], [4, "Fri"]]) {
    const t = el("text", { x: LEFT - 6, y: TOP + row * PITCH + 10, "text-anchor": "end", "font-size": 11 });
    t.textContent = lbl;
    svg.appendChild(t);
  }

  const show = (e) => {
    const hit = e.target.closest("[data-i]");
    if (!hit) { tooltipHide(); return; }
    const m = meta[Number(hit.getAttribute("data-i"))];
    tooltipShow(
      container,
      prose
        ? `<span class="tt-date">${dateWord(m.date)}</span><b>${sessionWord(m.v)}</b> · ${esc(m.titles.join(", "))}`
        : `<span class="tt-date">${fmtLong(m.date)}</span><b>${Math.round(m.v)} ${unit}</b> · ${esc(m.titles.join(", "))}`,
      e.clientX, e.clientY
    );
  };
  svg.addEventListener("mousemove", show);
  svg.addEventListener("click", show);
  svg.addEventListener("mouseleave", tooltipHide);

  const legend = document.createElement("div");
  legend.className = "heat-legend";
  legend.innerHTML = prose
    ? "quiet " +
      HEAT_BINS.map((c, i) =>
        `<span class="cell" style="background:${c}${i === 0 ? ";border:1px solid #C7B58F" : ""}"></span>`
      ).join("") +
      " devoted"
    : HEAT_BINS.map((c, i) =>
        `<span class="cell" style="background:${c}${i === 0 ? ";border:1px solid #C7B58F" : ""}"></span>${HEAT_LABELS[i]}`
      ).join(" ") + ` ${unit}`;
  container.appendChild(legend);

  // Open scrolled to today (the right edge) on narrow screens.
  scroll.scrollLeft = scroll.scrollWidth;
}
