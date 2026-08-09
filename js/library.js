import { currentPosition, fmtLong, forecast, starFactor } from "./derive.js";
import { bookColor } from "./stats.js";
import {
  isProse, cap, dateWord, fractionWord, lengthWord, paceWord, wppWord,
} from "./prose.js";

const SQUARES = 30;

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function pagesStar(book, gWpp) {
  if (!Number.isFinite(book.totalPages)) return null;
  return Math.round(book.totalPages * starFactor(book, gWpp));
}

function squareBar(pct, ariaLabel) {
  const filled = Math.floor((pct / 100) * SQUARES);
  const frac = (pct / 100) * SQUARES - filled;
  let html = '<div class="sq-bar" role="img" aria-label="' + esc(ariaLabel) + '">';
  for (let i = 0; i < SQUARES; i++) {
    const cls = i < filled ? "sq on" : i === filled && frac >= 0.5 ? "sq half" : "sq";
    html += `<div class="${cls}"></div>`;
  }
  return html + "</div>";
}

function forecastLine(book, state) {
  const fc = forecast(book, state.entries, state.books, state.gWpp, state.today);
  if (isProse()) {
    if (fc.done) return `<p class="forecast">The final page is logged — shelve it.</p>`;
    if (!fc.rate) return `<p class="forecast">Resting lately — nothing logged in a couple of weeks.</p>`;
    if (fc.daysLeft > 730) return `<p class="forecast">At this pace, the ending is a rumor.</p>`;
    const early = fc.denom < 14 ? " (early days yet)" : "";
    return `<p class="forecast">Reading ${paceWord(fc.rate)} — done by <b>${dateWord(fc.date, state.today)}</b>${early}.</p>`;
  }
  if (fc.done) return `<p class="forecast">Final page logged — shelve it.</p>`;
  if (!fc.rate) return `<p class="forecast">Forecast paused — no reading in the last 14 days.</p>`;
  // The card speaks this book's own pages: the universal pp*/day pace divided
  // by the book's factor. The finish date doesn't move — only the rate's unit.
  const bookRate = fc.rate / starFactor(book, state.gWpp);
  if (fc.daysLeft > 730) {
    return `<p class="forecast">Pace ${bookRate.toFixed(1)} pp/day — finish is years out at this pace.</p>`;
  }
  const early = fc.denom < 14 ? ` — early estimate (${fc.denom}-day sample)` : "";
  return `<p class="forecast">Pace <b>${bookRate.toFixed(1)}</b> pp/day · finish ≈ <b>${fmtLong(fc.date)}</b> (${fc.daysLeft} ${fc.daysLeft === 1 ? "day" : "days"})${early}</p>`;
}

function readingCard(book, state) {
  const pos = currentPosition(book, state.entries);
  const pct = (pos / book.totalPages) * 100;
  const star = pagesStar(book, state.gWpp);
  const frac = fractionWord(pos / book.totalPages);
  const posLine = isProse()
    ? `${cap(frac)}.`
    : `On page <strong>${pos}</strong> of ${book.totalPages} · ${pct.toFixed(1)}%`;
  const facts = isProse()
    ? [
        cap(lengthWord(book.totalPages)),
        wppWord(starFactor(book, state.gWpp)),
      ].map((f) => `<span>${f}</span>`).join("")
    : `
        <span><b>${book.totalPages}</b> pages</span>
        <span><b>${star ?? "—"}</b> pages<span title="normalized pages">*</span></span>
        <span><b>${book.wordsPerPage ?? "—"}</b> words/page</span>`;

  return `
  <article class="reading-card">
    <div class="cover"><img src="${esc(book.cover)}" alt="Cover of ${esc(book.title)}"></div>
    <div class="body">
      <h3 class="book-title">${esc(book.title)}</h3>
      <p class="book-author">${esc(book.author)}</p>
      <p class="pos-line">${posLine}</p>
      ${squareBar(pct, isProse() ? frac : pct.toFixed(1) + "% read")}
      ${forecastLine(book, state)}
      <div class="fact-row">${facts}
      </div>
    </div>
  </article>`;
}

function shelfSlot(book, state) {
  const star = pagesStar(book, state.gWpp);
  if (isProse()) {
    return `
  <div class="slot">
    <div class="cover"><img src="${esc(book.cover)}" alt="Cover of ${esc(book.title)}" loading="lazy"></div>
    <div class="caption">
      <b>${esc(book.title)}</b>
      <span class="muted">${esc(book.author)}</span><br>
      <span class="muted">${lengthWord(book.totalPages ?? 300)}</span><br>
      <span class="muted">${book.finishDate ? "finished " + dateWord(book.finishDate, state.today) : ""}</span>
    </div>
  </div>`;
  }
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

// WCAG relative luminance — spine text picks whichever of ink/eggshell
// contrasts harder against the spine color (colors now come from covers,
// so any hue can show up here).
function relLum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const INK_LUM = relLum("#1E2A1E"), EGG_LUM = relLum("#F0EAD6"); // CSS --ink / --eggshell

// Shared by every painted spine (Library shelves + Queue preview).
export function spineInk(color) {
  const lum = relLum(color);
  return ratio(lum, INK_LUM) >= ratio(lum, EGG_LUM) ? "var(--ink)" : "var(--eggshell)";
}

export function hashCode(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// Width is LINEAR in pages* through zero — ∝ total word count, no floor, no
// cap (Travis's call, 2026-08-08: footprints honest to word count; legibility
// yields). 300 pp* keeps the familiar 34px; a doorstop earns its whole slab,
// a novella its sliver. The 1px min is render sanity, not a legibility floor.
// Exported with hashCode for the queue's shelf preview (same shelf rules).
export function spineWidth(star) {
  return Math.max(1, Math.round(star * (34 / 300)));
}

// Label size follows the spine down: whatever fits between the borders,
// however small — tooltips carry the full title when the type gives out.
export function spineFont(width) {
  return Math.max(3, Math.min(13, width - 7));
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
      const ink = spineInk(color);
      const when = b[dateKey] ? (isProse() ? dateWord(b[dateKey], state.today) : fmtLong(b[dateKey])) : "";
      const tip = mode === "dnf"
        ? (isProse()
            ? `${b.title} — ${b.author}, abandoned (${Number.isFinite(b.totalPages) ? fractionWord(pos / b.totalPages) : "partway"})${when ? ", " + when : ""}`
            : `${b.title} — ${b.author}, DNF at p. ${pos} of ${b.totalPages ?? "?"}${when ? ", " + when : ""}`)
        : `${b.title} — ${b.author}${when ? ", finished " + when : ""}`;
      const w = spineWidth(star);
      return `<div class="spine" style="width:${w}px;height:${h}px;background:${color};color:${ink}" title="${esc(tip)}"><span class="t" style="font-size:${spineFont(w)}px">${esc(b.title)}</span></div>`;
    })
    .join("");
  return `<div class="spine-shelf"><div class="spine-inner"><div class="spine-row">${spines}</div><div class="shelf-board"></div></div></div>`;
}

export function renderLibrary(state) {
  // Most recently fed book first: the append-only log makes the index of a
  // book's last entry a perfect recency key (same-day sessions included).
  const lastActivity = (b) => {
    for (let i = state.entries.length - 1; i >= 0; i--) {
      if (state.entries[i].book === b.id) return i;
    }
    return -1; // just started, nothing logged yet
  };
  const reading = state.books
    .filter((b) => b.status === "reading")
    .sort((a, b) => lastActivity(b) - lastActivity(a));
  const finished = state.books
    .filter((b) => b.status === "finished")
    .sort((a, b) => (a.finishDate < b.finishDate ? 1 : -1));

  document.getElementById("reading-cards").innerHTML = reading.length
    ? reading.map((b) => readingCard(b, state)).join("")
    : '<p class="empty-note">Nothing on the go. Pick something from the queue.</p>';

  document.getElementById("finished-shelf").innerHTML = finished.length
    ? spineShelf(finished, state, "finished") + `<div class="shelf">${finished.map((b) => shelfSlot(b, state)).join("")}</div>`
    : `<p class="empty-note">${isProse() ? "Nothing finished yet. The shelf waits." : "Nothing finished since Day 0 (July 26, 2026). The shelf awaits."}</p>`;

  // Did Not Finish: spines only (width = pages reached), section hidden entirely
  // until the first casualty.
  const dnf = state.books.filter((b) => b.status === "dnf");
  document.getElementById("dnf-section").innerHTML = dnf.length
    ? `<h2>Did Not Finish</h2>${spineShelf(dnf, state, "dnf")}`
    : "";
}
