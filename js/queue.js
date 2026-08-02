// Planned-reads queue: drag-and-drop ranking persisted to localStorage only.
// books.json array order is the default rank; the saved order (ids) overrides.
// Merge is self-healing: vanished ids drop out, new planned books append.
// The override is written ONLY on an actual drag — merely viewing must never
// pin the current default, or books.json reorders (the cross-device sync
// mechanism) stop showing up on devices that just looked at the tab. The v1
// key did exactly that; bumping to v2 orphans every stale pinned snapshot.

import { currentPosition, recentPacePages } from "./derive.js";
import { spineWidth, hashCode } from "./library.js";
import {
  isProse, cap, countBooksWord, durationWord, lengthWord, ordinalWord, paceWord,
} from "./prose.js";

const KEY = "books:queue-order:v2";
try { localStorage.removeItem("books:queue-order:v1"); } catch { /* private mode */ }

// Queue spines stay undyed (alternating tans) — a book earns its palette color
// only when it starts. Same width/height rules as the Library shelves.
const QUEUE_TANS = ["#A68A64", "#B79B72"];

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function loadOrder(planned) {
  const ids = planned.map((b) => b.id);
  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch { /* corrupted — fall back to default */ }
  const kept = saved.filter((id) => ids.includes(id));
  return [...kept, ...ids.filter((id) => !kept.includes(id))];
}

function saveOrder(order) {
  try { localStorage.setItem(KEY, JSON.stringify(order)); } catch { /* private mode */ }
}

// A measured book was held in hand — its page count is the physical copy's,
// not a Goodreads estimate. Verified counts drop the "~".
const verified = (b) => Number.isFinite(b.wordsPerPage);

// Queue totals + time-to-clear at the reader's recent pace. Page counts on
// unmeasured planned books are Goodreads estimates (~), refined when measured.
function renderEta(planned, state, pace) {
  const box = document.getElementById("queue-eta");
  if (!box) return;
  const known = planned.filter((b) => Number.isFinite(b.totalPages));
  const total = known.reduce((a, b) => a + b.totalPages, 0);
  const unknown = planned.length - known.length;
  const anyEstimate = known.some((b) => !verified(b));
  const onTheGo = state.books
    .filter((b) => b.status === "reading" && Number.isFinite(b.totalPages))
    .reduce((a, b) => a + (b.totalPages - currentPosition(b, state.entries)), 0);

  if (isProse()) {
    let text = `<b>${cap(countBooksWord(planned.length))}</b>`;
    if (unknown) text += ` (some pages uncounted)`;
    if (pace > 0) {
      text += ` — ${durationWord(total / pace)} of reading ${paceWord(pace)}`;
      if (onTheGo > 0) text += `, waiting behind what's still on the go`;
    } else {
      text += ` — the clock starts with the first logged page`;
    }
    box.innerHTML = text + ".";
    return;
  }
  let text = `<b>${planned.length}</b> book${planned.length === 1 ? "" : "s"} · ${anyEstimate ? "~" : ""}<b>${total.toLocaleString()}</b> pages`;
  if (unknown) text += ` (${unknown} uncounted)`;
  if (pace > 0) {
    const days = Math.ceil(total / pace);
    const months = days / 30.44;
    const span = days < 90 ? `${days} days` : `~${Math.round(months)} months`;
    text += ` ≈ <b>${span}</b> at your current pace (${pace.toFixed(1)} pp/day)`;
    if (onTheGo > 0) text += ` — queued behind the ${onTheGo.toLocaleString()} pages still on the go`;
  } else {
    text += ` — log some reading to get a clearance forecast`;
  }
  box.innerHTML = text + ".";
}

// Shelf preview above the list — same shelf rules as Library, redrawn on every
// reorder so the spines track the ranking live.
function renderShelf(order, byId) {
  const box = document.getElementById("queue-shelf");
  if (!box) return;
  const spines = order
    .map((id, i) => {
      const b = byId.get(id);
      const star = Number.isFinite(b.totalPages) ? b.totalPages : 300;
      const h = 150 + (hashCode(b.id) % 4) * 10;
      const tip = isProse()
        ? `${b.title} — ${b.author}, ${lengthWord(star)}`
        : `${b.title} — ${b.author}${Number.isFinite(b.totalPages) ? `, ${verified(b) ? "" : "~"}${b.totalPages} pp` : ""}`;
      return `<div class="spine" style="width:${spineWidth(star)}px;height:${h}px;background:${QUEUE_TANS[i % 2]};color:var(--ink)" title="${esc(tip)}"><span class="t">${esc(b.title)}</span></div>`;
    })
    .join("");
  box.innerHTML = spines
    ? `<div class="spine-shelf"><div class="spine-inner"><div class="spine-row">${spines}</div><div class="shelf-board"></div></div></div>`
    : "";
}

export function renderQueue(state) {
  const planned = state.books.filter((b) => b.status === "planned");
  const list = document.getElementById("queue-list");
  const pace = recentPacePages(state.entries, state.today);

  renderEta(planned, state, pace);

  if (!planned.length) {
    const shelf = document.getElementById("queue-shelf");
    if (shelf) shelf.innerHTML = "";
    list.innerHTML = "";
    list.insertAdjacentHTML(
      "beforebegin",
      '<p class="empty-note">Queue is empty. Tell Claude a title to add it here.</p>'
    );
    return;
  }

  const byId = new Map(planned.map((b) => [b.id, b]));
  let order = loadOrder(planned);

  function draw() {
    renderShelf(order, byId);
    list.innerHTML = order
      .map((id, i) => {
        const b = byId.get(id);
        return `
      <li class="q-row" draggable="true" data-id="${esc(id)}">
        <span class="rank">${isProse() ? ordinalWord(i + 1) : String(i + 1).padStart(2, "0")}</span>
        <span class="thumb"><img src="${esc(b.cover)}" alt="" loading="lazy"></span>
        <span class="meta"><b>${esc(b.title)}</b><span>${esc(b.author)}${
          isProse()
            ? `${Number.isFinite(b.totalPages) ? ` · ${lengthWord(b.totalPages)}` : ""}${Number.isFinite(b.totalPages) && pace > 0 ? ` · ${durationWord(b.totalPages / pace)}` : ""}`
            : `${Number.isFinite(b.totalPages) ? ` · ${verified(b) ? "" : "~"}${b.totalPages} pp` : ""}${Number.isFinite(b.totalPages) && pace > 0 ? ` · ≈ ${Math.ceil(b.totalPages / pace)} days` : ""}`
        }</span></span>
        <span class="grip" aria-hidden="true">::::</span>
      </li>`;
      })
      .join("");
  }

  let dragId = null;

  // renderQueue re-runs on prose-mode toggles — never wire the listeners twice.
  if (list.dataset.wired) {
    draw();
    return;
  }
  list.dataset.wired = "1";

  list.addEventListener("dragstart", (e) => {
    const row = e.target.closest(".q-row");
    if (!row) return;
    dragId = row.dataset.id;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
  });

  list.addEventListener("dragend", () => {
    dragId = null;
    list.querySelectorAll(".q-row").forEach((r) =>
      r.classList.remove("dragging", "drop-above", "drop-below"));
  });

  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    const row = e.target.closest(".q-row");
    list.querySelectorAll(".q-row").forEach((r) => r.classList.remove("drop-above", "drop-below"));
    if (!row || row.dataset.id === dragId) return;
    const rect = row.getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    row.classList.add(above ? "drop-above" : "drop-below");
  });

  list.addEventListener("drop", (e) => {
    e.preventDefault();
    const row = e.target.closest(".q-row");
    if (!row || !dragId || row.dataset.id === dragId) return;
    const rect = row.getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    const from = order.indexOf(dragId);
    order.splice(from, 1);
    let to = order.indexOf(row.dataset.id);
    if (!above) to += 1;
    order.splice(to, 0, dragId);
    saveOrder(order);
    draw();
  });

  draw();
}
