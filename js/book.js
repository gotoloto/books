// Per-book page ("#book/<id>"): the cover and facts, how the reading went, the
// journal — Travis's own words from notes/<id>.md, stored verbatim and shown
// newest-first like the log table — and the vocabulary he collected on the way.
// The reading facts and sparkline come from the log (day-merged, like every
// chart); the journal is the one per-report surface: each note's heading
// carries the page range it was reported with, and several notes may share a
// date (Travis, 2026-09-14 — "same day doesn't mean same entry").

import {
  addDays, currentPosition, diffDays, effectiveToday, fmtLong, fmtShort, starFactor,
} from "./derive.js";
import { bookColor } from "./stats.js";
import { pagesStar, squareBar } from "./library.js";
import {
  isProse, cap, dateWord, durationWord, fractionWord, frequencyWord, lengthWord,
  paceWord, sessionWord, wppWord,
} from "./prose.js";

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ——— notes: a deliberately tiny Markdown subset ———
// A dated section opens with "## YYYY-MM-DD · pp. A–B" — the range is the
// note's own; a heading with no range borrows the day's merged range from the
// log. Inside: blank-line paragraphs, "> " quotes, *em*, **strong**.
// A "## Vocabulary" section holds one bullet per word, exactly as Travis gives
// them: `* Term, pp 892. "The sentence it lives in."` Any other heading is
// ignored. The journal is prose, not a document format — nothing else renders.
function inline(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function blocks(lines) {
  const out = [];
  let para = [];
  let quote = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    if (quote.length) out.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`);
    para = [];
    quote = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith(">")) {
      if (para.length) flush();
      quote.push(line.replace(/^>\s?/, ""));
    } else {
      if (quote.length) flush();
      para.push(line);
    }
  }
  flush();
  return out.join("");
}

const VOCAB_LINE = /^\*\s+(.+?),\s*pp?\.?\s*(\d+)\.?\s*(.*)$/;

export function parseNotes(md) {
  const sections = [];
  const vocab = [];
  let mode = null; // "entry" | "vocab" | null (anything under an unknown heading)
  let cur = null;
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      const d = h[1].match(/^(\d{4}-\d{2}-\d{2})\b(?:.*?pp?\.?\s*(\d+)\s*[–-]\s*(\d+))?/);
      if (d) {
        cur = { date: d[1], from: d[2] ? Number(d[2]) : null, to: d[3] ? Number(d[3]) : null, lines: [] };
        sections.push(cur);
        mode = "entry";
      } else {
        cur = null;
        mode = /^vocabulary\b/i.test(h[1]) ? "vocab" : null;
      }
      continue;
    }
    if (mode === "entry") {
      cur.lines.push(line);
    } else if (mode === "vocab") {
      const m = line.match(VOCAB_LINE);
      if (m) vocab.push({ term: m[1].trim(), page: Number(m[2]), quote: m[3].trim() });
    }
  }
  return {
    entries: sections
      .map((s) => ({ date: s.date, from: s.from, to: s.to, html: blocks(s.lines) }))
      .filter((s) => s.html),
    vocab,
  };
}

// Fetched on first visit, then kept for the session (data files are read once
// at boot too — a reload is the refresh everywhere). A missing file is simply
// an empty journal; a failed fetch is retried on the next visit.
const notesCache = new Map();
function loadNotes(id) {
  if (!notesCache.has(id)) {
    const p = fetch(`notes/${encodeURIComponent(id)}.md`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.text() : ""))
      .then(parseNotes)
      .catch(() => { notesCache.delete(id); return { entries: [], vocab: [] }; });
    notesCache.set(id, p);
  }
  return notesCache.get(id);
}

// ——— the page ———

function statusLine(b, state, pos) {
  const total = b.totalPages;
  const frac = Number.isFinite(total) ? pos / total : 0;
  if (b.status === "finished") {
    return isProse()
      ? `Finished ${dateWord(b.finishDate, state.today)}.`
      : `Finished <b>${fmtLong(b.finishDate)}</b>.`;
  }
  if (b.status === "dnf") {
    const when = b.dnfDate ? (isProse() ? `, ${dateWord(b.dnfDate, state.today)}` : `, ${fmtLong(b.dnfDate)}`) : "";
    return isProse()
      ? `Set aside ${fractionWord(frac)}${when}.`
      : `Set aside at page <strong>${pos}</strong> of ${total ?? "?"}${when}.`;
  }
  if (b.status === "planned") return "In the queue.";
  return isProse()
    ? `${cap(fractionWord(frac))}.`
    : `On page <strong>${pos}</strong> of ${total} · ${(frac * 100).toFixed(1)}%`;
}

function hero(b, state) {
  const pos = currentPosition(b, state.entries);
  const star = pagesStar(b, state.gWpp);
  const measured = Number.isFinite(b.wordsPerPage);
  const back = b.status === "planned" ? `<a href="#queue">← Queue</a>` : `<a href="#library">← Library</a>`;
  let facts;
  if (isProse()) {
    facts = [cap(lengthWord(star ?? b.totalPages ?? 300))];
    if (measured) facts.push(wppWord(starFactor(b, state.gWpp)));
    facts = facts.map((f) => `<span>${f}</span>`).join("");
  } else {
    facts = `<span><b>${measured ? "" : "~"}${b.totalPages ?? "—"}</b> pages</span>`;
    if (measured) {
      facts += `
        <span><b>${star ?? "—"}</b> pages<span title="normalized pages">*</span></span>
        <span><b>${b.wordsPerPage}</b> words/page</span>`;
    }
  }
  const pct = Number.isFinite(b.totalPages) ? (pos / b.totalPages) * 100 : 0;
  const bar = b.status === "reading"
    ? squareBar(pct, isProse() ? fractionWord(pos / b.totalPages) : pct.toFixed(1) + "% read")
    : "";
  return `
  <p class="crumb">${back}</p>
  <article class="book-hero">
    <div class="cover"><img src="${esc(b.cover)}" alt="Cover of ${esc(b.title)}"></div>
    <div class="body">
      <h1 class="book-title">${esc(b.title)}</h1>
      <p class="book-author">${esc(b.author)}</p>
      <p class="pos-line">${statusLine(b, state, pos)}</p>
      ${bar}
      <div class="fact-row">${facts}</div>
    </div>
  </article>`;
}

// One bar per calendar day from the first tracked page to the last (or to the
// last counted day for a book still on the go). No axes, no digits — the
// shape is the point; tooltips carry the numbers (words, in prose mode).
function sparkline(days, start, end, color, f, state) {
  const n = diffDays(start, end) + 1;
  if (n < 2) return "";
  const W = 600, H = 48, gap = 1;
  const bw = Math.max(0.8, (W - gap * (n - 1)) / n);
  let max = 1;
  for (const [d, info] of days) if (d >= start && d <= end) max = Math.max(max, info.pages);
  const bars = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(start, i);
    const info = days.get(date);
    const p = info ? info.pages : 0;
    const h = p ? Math.max(1.5, (p / max) * (H - 2)) : 0;
    const x = i * (bw + gap);
    let tip;
    if (isProse()) {
      tip = `${cap(dateWord(date, state.today))} — ${p ? sessionWord(p * f) : "a day off"}`;
    } else {
      tip = p
        ? `${fmtShort(date)} · pp. ${info.ranges[0][0]}–${info.ranges[info.ranges.length - 1][1]} · ${p} pages`
        : `${fmtShort(date)} · no pages`;
    }
    // A zero day still gets a hit target so the tooltip explains the gap.
    bars.push(
      `<rect x="${x.toFixed(2)}" y="0" width="${bw.toFixed(2)}" height="${H}" fill="transparent"><title>${esc(tip)}</title></rect>` +
      (h ? `<rect x="${x.toFixed(2)}" y="${(H - h).toFixed(2)}" width="${bw.toFixed(2)}" height="${h.toFixed(2)}" fill="${color}" pointer-events="none"/>` : "")
    );
  }
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Pages per day">
    <line x1="0" y1="${H - 0.5}" x2="${W}" y2="${H - 0.5}" stroke="var(--border)" stroke-width="1"/>
    ${bars.join("")}
  </svg>`;
}

function reading(b, state) {
  if (b.status === "planned" || !b.startDate) return "";
  const days = state.daily.get(b.id) || new Map();
  const ended = b.status === "finished" || b.status === "dnf";
  const end = b.finishDate || b.dnfDate || effectiveToday(state.entries, state.today);
  const span = Math.max(1, diffDays(b.startDate, end) + 1);
  let daysRead = 0, pagesRead = 0, best = null;
  for (const [date, info] of days) {
    if (info.pages <= 0) continue;
    daysRead += 1;
    pagesRead += info.pages;
    if (!best || info.pages > best.pages) best = { date, pages: info.pages };
  }
  const f = starFactor(b, state.gWpp);
  const pace = pagesRead / span;
  const color = bookColor(b, state);
  const fromPage = b.startPage > 0;

  let facts;
  if (isProse()) {
    facts = [
      `Started ${dateWord(b.startDate, state.today)}${fromPage ? ", partway in" : ""}`,
      b.status === "finished" ? `finished in ${durationWord(span)}`
        : b.status === "dnf" ? `${durationWord(span)} before setting it aside`
        : `${durationWord(span)} on the go`,
      daysRead ? `read ${frequencyWord(daysRead / span)}` : "no pages yet",
    ];
    if (daysRead && b.status !== "finished") facts.push(`${lengthWord(pagesRead * f)} covered so far`);
    if (daysRead) facts.push(`reading ${paceWord(pace)}`);
    if (best) facts.push(`best day: ${sessionWord(best.pages * f)}, ${dateWord(best.date, state.today)}`);
  } else {
    const d = (n) => `${n} ${n === 1 ? "day" : "days"}`;
    facts = [
      `Started <b>${fmtLong(b.startDate)}</b>${fromPage ? ` at page ${b.startPage}` : ""}`,
      b.status === "finished" ? `finished in <b>${d(span)}</b>`
        : b.status === "dnf" ? `<b>${d(span)}</b> before setting it aside`
        : `<b>${d(span)}</b> on the go`,
      `read on <b>${daysRead}</b> of them`,
      `<b>${pagesRead}</b> pages · <b>${Math.round(pagesRead * f)}</b> pp<span title="normalized pages">*</span>`,
      `<b>${pace.toFixed(1)}</b> pp/day across the span`,
    ];
    if (best) facts.push(`best day <b>${fmtShort(best.date)}</b> · <b>${best.pages}</b> pages`);
  }
  const items = facts.map((t) => `<li>${t}</li>`).join("");
  const cap_ = isProse()
    ? `Each bar is a day, from the first tracked page ${ended ? "to the last" : "to now"}.`
    : `One bar per day since the start${ended ? "" : " — through the last counted day"}; height is pages read.`;
  return `
  <h2>The reading</h2>
  <ul class="reading-facts">${items}</ul>
  ${sparkline(days, b.startDate, end, color, f, state)}
  <p class="spark-cap">${cap_}</p>`;
}

function journal(notes, b, state) {
  if (!notes.length) {
    const msg = b.status === "planned"
      ? "The journal opens with the first logged page."
      : "No notes yet. Tell Claude what happened in the book along with the pages, and it lands here — in your words.";
    return `<p class="empty-note">${msg}</p>`;
  }
  const days = state.daily.get(b.id) || new Map();
  const f = starFactor(b, state.gWpp);
  // Newest first, and within a day the later report first (file order is
  // chronological, so a higher index is the later session).
  return notes
    .map((n, i) => ({ ...n, i }))
    .sort((a, c) => (a.date < c.date ? 1 : a.date > c.date ? -1 : c.i - a.i))
    .map((n) => {
      const info = days.get(n.date);
      const own = n.from != null && n.to != null;
      const from = own ? n.from : info ? info.ranges[0][0] : null;
      const to = own ? n.to : info ? info.ranges[info.ranges.length - 1][1] : null;
      const pages = own ? n.to - n.from : info ? info.pages : 0;
      let head;
      if (isProse()) {
        head = cap(dateWord(n.date, state.today)) + (pages > 0 ? ` · ${sessionWord(pages * f)}` : "");
      } else {
        head = fmtLong(n.date) + (from != null ? ` · pp. ${from}–${to}` : "");
      }
      return `<article class="entry"><h3><time datetime="${n.date}">${head}</time></h3>${n.html}</article>`;
    })
    .join("");
}

// The word, the page it turned up on, and the sentence it lives in — with the
// word lit up inside its own sentence (first plain match; an inflected form
// that doesn't match simply goes unhighlighted). Alphabetical, like a glossary.
function highlight(quote, term) {
  const safe = esc(quote);
  const t = esc(term);
  const i = safe.toLowerCase().indexOf(t.toLowerCase());
  if (i < 0) return safe;
  return `${safe.slice(0, i)}<mark>${safe.slice(i, i + t.length)}</mark>${safe.slice(i + t.length)}`;
}

function vocabulary(vocab, b, state) {
  if (!vocab.length) return "";
  const items = [...vocab]
    .sort((x, y) => x.term.localeCompare(y.term, "en", { sensitivity: "base" }))
    .map((v) => {
      const where = isProse()
        ? (Number.isFinite(b.totalPages) ? fractionWord(v.page / b.totalPages) : "")
        : `p. ${v.page}`;
      const quote = v.quote.replace(/^["“]\s*/, "").replace(/\s*["”]$/, "");
      return `<div class="term"><dt>${esc(v.term)}${where ? ` <span class="pg">${where}</span>` : ""}</dt>` +
        (quote ? `<dd>“${highlight(quote, v.term)}”</dd>` : "") + `</div>`;
    })
    .join("");
  return `<h2>Vocabulary</h2><dl class="vocab">${items}</dl>`;
}

export async function renderBook(state, id) {
  const box = document.getElementById("book-page");
  const b = state.byId.get(id);
  if (!b) {
    box.innerHTML = `<p class="crumb"><a href="#library">← Library</a></p><p class="empty-note">No such book on these shelves.</p>`;
    return;
  }
  // Hash changes can outrun the notes fetch — only the latest render may land.
  const token = String(Date.now()) + Math.random();
  box.dataset.token = token;
  box.innerHTML = hero(b, state) + reading(b, state) +
    `<div class="notebook"><h2>Journal</h2><div class="journal"><p class="muted small">Opening the notebook…</p></div></div>`;
  const notes = await loadNotes(id);
  if (box.dataset.token !== token) return;
  box.querySelector(".notebook").innerHTML =
    `<h2>Journal</h2><div class="journal">${journal(notes.entries, b, state)}</div>` +
    vocabulary(notes.vocab, b, state);
}
