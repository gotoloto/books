// Hand-rolled SVG chart primitives. Fixed-pixel coordinates (1 svg unit = 1 css px),
// full re-render on every change — the data is tiny.

import { addDays, diffDays, fmtShort, fmtMonthYear, fmtLong, fromUTCms } from "./derive.js";

const NS = "http://www.w3.org/2000/svg";

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

function frame(container, height, winStart, winEnd, maxVal, unitLabel) {
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
    const lbl = el("text", { x: M.left - 8, y: yy + 4, "text-anchor": "end", "font-size": 12.5 });
    lbl.textContent = String(t);
    svg.appendChild(lbl);
  }
  // baseline
  g.appendChild(el("line", {
    x1: M.left, x2: width - M.right,
    y1: Math.round(y(0)) + 0.5, y2: Math.round(y(0)) + 0.5,
    stroke: "#4A523F", "stroke-width": 1,
  }));

  const { dates, fmt } = dateTicks(winStart, winEnd, innerW);
  for (const d of dates) {
    const xx = Math.round(x(d)) + 0.5;
    g.appendChild(el("line", { x1: xx, x2: xx, y1: height - M.bottom, y2: height - M.bottom + 4, stroke: "#4A523F", "stroke-width": 1 }));
    const lbl = el("text", { x: xx, y: height - M.bottom + 18, "text-anchor": "middle", "font-size": 12.5 });
    lbl.textContent = fmt(d);
    svg.appendChild(lbl);
  }

  const unit = el("text", { x: M.left - 8, y: M.top - 4, "text-anchor": "end", "font-size": 12.5, "font-style": "italic" });
  unit.textContent = unitLabel;
  svg.appendChild(unit);

  return { svg, width, height, x, y, top, innerW, innerH };
}

// ——— Chart A: layered cumulative areas ———
// series: [{title, color, points:[{date, v}], final}] ALREADY sorted final-desc
// (largest painted first, so smaller books land on top and stay visible).

export function renderCumulative(container, series, opts) {
  const { winStart, winEnd, today, unitLabel } = opts;
  if (!series.length) {
    container.innerHTML = `<div class="chart-empty">No reading logged in this window.</div>`;
    return;
  }
  const maxVal = Math.max(...series.map((s) => s.final));
  const f = frame(container, 340, winStart, winEnd, maxVal, unitLabel);

  const drawEnd = winEnd < today ? winEnd : today; // never draw into the future

  for (const s of series) {
    const pts = [{ date: winStart, v: 0 }, ...s.points];
    const last = pts[pts.length - 1];
    if (last.date < drawEnd) pts.push({ date: drawEnd, v: last.v }); // flat to "now"

    const line = pts.map((p, i) => `${i ? "L" : "M"}${f.x(p.date).toFixed(1)},${f.y(p.v).toFixed(1)}`).join("");
    const area = `${line}L${f.x(pts[pts.length - 1].date).toFixed(1)},${f.y(0).toFixed(1)}L${f.x(winStart).toFixed(1)},${f.y(0).toFixed(1)}Z`;

    const g = el("g");
    g.appendChild(el("path", { d: area, fill: s.color, "fill-opacity": 0.18, stroke: "none" }));
    g.appendChild(el("path", { d: line, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "miter" }));
    f.svg.appendChild(g);
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
        let v = 0;
        for (const p of s.points) { if (p.date <= best) v = p.v; else break; }
        return { title: s.title, color: s.color, v };
      })
      .filter((r) => r.v > 0)
      .sort((a, b) => b.v - a.v)
      .map((r) => `<span style="color:${r.color}">■</span> ${r.title} — <b>${Math.round(r.v)}</b>`)
      .join("<br>");
    tooltipShow(container, `<span class="tt-date">${fmtLong(best)}</span>${rows || "—"}`, e.clientX, e.clientY);
  });
  f.svg.addEventListener("mouseleave", () => { cross.setAttribute("visibility", "hidden"); tooltipHide(); });
}

// ——— Chart B: daily scatter ———
// points: [{date, title, ranges, v}] — v in pages*; tooltip shows real page ranges.

export function renderDaily(container, points, opts) {
  const { winStart, winEnd, unitLabel } = opts;
  if (!points.length) {
    container.innerHTML = `<div class="chart-empty">No reading logged in this window.</div>`;
    return;
  }
  const maxVal = Math.max(...points.map((p) => p.v));
  const f = frame(container, 280, winStart, winEnd, maxVal, unitLabel);

  const meta = [];
  for (const p of points) {
    const cx = f.x(p.date).toFixed(1);
    const cy = f.y(p.v).toFixed(1);
    f.svg.appendChild(el("circle", { cx, cy, r: 4.5, fill: "#3A7A33", "fill-opacity": 0.78, stroke: "#F0EAD6", "stroke-width": 1 }));
    const hit = el("circle", { cx, cy, r: 12, fill: "transparent", "data-i": meta.length });
    f.svg.appendChild(hit);
    meta.push(p);
  }

  const showPoint = (p, e) => {
    const ranges = p.ranges.map(([a, b]) => `pp.&nbsp;${a}–${b}`).join(", ");
    tooltipShow(
      container,
      `<span class="tt-date">${fmtLong(p.date)}</span><b>${p.title}</b><br>${ranges}<br>${Math.round(p.v)} ${unitLabel}`,
      e.clientX, e.clientY
    );
  };
  const onPointer = (e) => {
    const hit = e.target.closest("[data-i]");
    if (!hit) { tooltipHide(); return; }
    showPoint(meta[Number(hit.getAttribute("data-i"))], e);
  };
  f.svg.addEventListener("mousemove", onPointer);
  f.svg.addEventListener("click", onPointer); // tap-to-show for touch
  f.svg.addEventListener("mouseleave", tooltipHide);
}
