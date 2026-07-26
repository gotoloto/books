import { currentPosition, fmtLong, starFactor } from "./derive.js";

const SQUARES = 36;

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

export function renderLibrary(state) {
  const reading = state.books.filter((b) => b.status === "reading");
  const finished = state.books
    .filter((b) => b.status === "finished")
    .sort((a, b) => (a.finishDate < b.finishDate ? 1 : -1));

  document.getElementById("reading-cards").innerHTML = reading.length
    ? reading.map((b) => readingCard(b, state)).join("")
    : '<p class="empty-note">Nothing on the go. Pick something from the queue.</p>';

  document.getElementById("finished-shelf").innerHTML = finished.length
    ? `<div class="shelf">${finished.map((b) => shelfSlot(b, state)).join("")}</div>`
    : '<p class="empty-note">Nothing finished since Day 0 (July 26, 2026). The shelf awaits.</p>';
}
