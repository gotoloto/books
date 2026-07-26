import { currentPosition, fmtLong, forecast, starFactor } from "./derive.js";
import { bookColor } from "./stats.js";

const SQUARES = 30;

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function pagesStar(book, gWpp) {
  if (!Number.isFinite(book.totalPages)) return null;
  return Math.round(book.totalPages * starFactor(book, gWpp));
}

function squareBar(pct) {
  const filled = Math.floor((pct / 100) * SQUARES);
  const frac = (pct / 100) * SQUARES - filled;
  let html = '<div class="sq-bar" role="img" aria-label="' + pct.toFixed(1) + '% read">';
  for (let i = 0; i < SQUARES; i++) {
    const cls = i < filled ? "sq on" : i === filled && frac >= 0.5 ? "sq half" : "sq";
    html += `<div class="${cls}"></div>`;
  }
  return html + "</div>";
}

function forecastLine(book, state) {
  const fc = forecast(book, state.entries, state.today);
  if (fc.done) return `<p class="forecast">Final page logged — shelve it.</p>`;
  if (!fc.rate) return `<p class="forecast">Forecast paused — no reading in the last 14 days.</p>`;
  if (fc.daysLeft > 730) {
    return `<p class="forecast">Pace ${fc.rate.toFixed(1)} pages/day — finish is years out at this pace.</p>`;
  }
  const early = fc.denom < 14 ? ` — early estimate (${fc.denom}-day sample)` : "";
  return `<p class="forecast">Pace <b>${fc.rate.toFixed(1)}</b> pages/day · finish ≈ <b>${fmtLong(fc.date)}</b> (${fc.daysLeft} ${fc.daysLeft === 1 ? "day" : "days"})${early}</p>`;
}

function readingCard(book, state) {
  const pos = currentPosition(book, state.entries);
  const pct = (pos / book.totalPages) * 100;
  const star = pagesStar(book, state.gWpp);
  const sinceDay0 = state.entries
    .filter((e) => e.book === book.id)
    .reduce((a, e) => a + (e.to - e.from), 0);
  return `
  <article class="reading-card">
    <div class="cover"><img src="${esc(book.cover)}" alt="Cover of ${esc(book.title)}"></div>
    <div class="body">
      <h3 class="book-title">${esc(book.title)}</h3>
      <p class="book-author">${esc(book.author)}</p>
      <p class="pos-line">On page <strong>${pos}</strong> of ${book.totalPages} · ${pct.toFixed(1)}%</p>
      ${squareBar(pct)}
      ${forecastLine(book, state)}
      <div class="fact-row">
        <span><b>${book.totalPages}</b> pages</span>
        <span><b>${star ?? "—"}</b> pages<span title="normalized pages">*</span></span>
        <span><b>${book.wordsPerPage ?? "—"}</b> words/page</span>
        <span>tracking since <b>${fmtLong(book.startDate)}</b> (p. ${book.startPage})</span>
        <span><b>${sinceDay0}</b> pages logged</span>
      </div>
    </div>
  </article>`;
}

function shelfSlot(book, state) {
  const star = pagesStar(book, state.gWpp);
  const fin = book.finishDate ? fmtLong(book.finishDate) : "";
  return `
  <div class="slot">
    <div class="cover"><img src="${esc(book.cover)}" alt="Cover of ${esc(book.title)}" loading="lazy"></div>
    <div class="caption">
      <b>${esc(book.title)}</b>
      <span class="muted">${esc(book.author)}</span><br>
      <span class="muted">${book.totalPages ?? "—"} pp · ${star ?? "—"} pp*</span><br>
      <span class="muted">${fin}</span>
    </div>
  </div>`;
}

// ——— spine shelf: finished books as spines, width ∝ pages* ———

function luma(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) * 299 + (((n >> 8) & 255) * 587) + (n & 255) * 114) / 1000;
}

export function hashCode(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// Anchor: a 300-pp* book is an average 34px spine, ±1px per 20 pp*.
// Slivers clamp at 18px (early DNFs), doorstops at 88px.
// Exported with hashCode for the queue's shelf preview (same shelf rules).
export function spineWidth(star) {
  return Math.max(18, Math.min(88, Math.round(34 + 0.05 * (star - 300))));
}

// One shelf for both fates. mode "finished": width = the whole book (total pages*).
// mode "dnf": width = only the pages* actually reached before abandoning.
function spineShelf(books, state, mode) {
  const dateKey = mode === "dnf" ? "dnfDate" : "finishDate";
  const spines = [...books]
    .sort((a, b) => ((a[dateKey] || "") < (b[dateKey] || "") ? -1 : 1)) // shelf fills left → right
    .map((b) => {
      const pos = currentPosition(b, state.entries);
      const star = mode === "dnf"
        ? Math.round(pos * starFactor(b, state.gWpp))
        : pagesStar(b, state.gWpp) ?? b.totalPages ?? 320;
      const h = 150 + (hashCode(b.id) % 4) * 10;
      const color = bookColor(b, state);
      const ink = luma(color) > 125 ? "var(--ink)" : "var(--eggshell)";
      const when = b[dateKey] ? fmtLong(b[dateKey]) : "";
      const tip = mode === "dnf"
        ? `${b.title} — ${b.author}, DNF at p. ${pos} of ${b.totalPages ?? "?"}${when ? ", " + when : ""}`
        : `${b.title} — ${b.author}${when ? ", finished " + when : ""}`;
      return `<div class="spine" style="width:${spineWidth(star)}px;height:${h}px;background:${color};color:${ink}" title="${esc(tip)}"><span class="t">${esc(b.title)}</span></div>`;
    })
    .join("");
  return `<div class="spine-shelf"><div class="spine-inner"><div class="spine-row">${spines}</div><div class="shelf-board"></div></div></div>`;
}

export function renderLibrary(state) {
  const reading = state.books.filter((b) => b.status === "reading");
  const finished = state.books
    .filter((b) => b.status === "finished")
    .sort((a, b) => (a.finishDate < b.finishDate ? 1 : -1));

  document.getElementById("reading-cards").innerHTML = reading.length
    ? reading.map((b) => readingCard(b, state)).join("")
    : '<p class="empty-note">Nothing on the go. Pick something from the queue.</p>';

  document.getElementById("finished-shelf").innerHTML = finished.length
    ? spineShelf(finished, state, "finished") + `<div class="shelf">${finished.map((b) => shelfSlot(b, state)).join("")}</div>`
    : '<p class="empty-note">Nothing finished since Day 0 (July 26, 2026). The shelf awaits.</p>';

  // Did Not Finish: spines only (width = pages reached), section hidden entirely
  // until the first casualty.
  const dnf = state.books.filter((b) => b.status === "dnf");
  document.getElementById("dnf-section").innerHTML = dnf.length
    ? `<h2>Did Not Finish</h2>${spineShelf(dnf, state, "dnf")}`
    : "";
}
