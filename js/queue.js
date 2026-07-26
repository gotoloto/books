// Planned-reads queue: drag-and-drop ranking persisted to localStorage only.
// books.json array order is the default rank; the saved order (ids) overrides.
// Merge is self-healing: vanished ids drop out, new planned books append.

import { currentPosition, recentPacePages } from "./derive.js";

const KEY = "books:queue-order:v1";

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
  const merged = [...kept, ...ids.filter((id) => !kept.includes(id))];
  try { localStorage.setItem(KEY, JSON.stringify(merged)); } catch { /* private mode */ }
  return merged;
}

function saveOrder(order) {
  try { localStorage.setItem(KEY, JSON.stringify(order)); } catch { /* private mode */ }
}

// Queue totals + time-to-clear at the reader's recent pace. Page counts on
// planned books are Goodreads estimates (~), refined when a book starts.
function renderEta(planned, state) {
  const box = document.getElementById("queue-eta");
  if (!box) return;
  const known = planned.filter((b) => Number.isFinite(b.totalPages));
  const total = known.reduce((a, b) => a + b.totalPages, 0);
  const unknown = planned.length - known.length;
  const pace = recentPacePages(state.entries, state.today);
  const onTheGo = state.books
    .filter((b) => b.status === "reading" && Number.isFinite(b.totalPages))
    .reduce((a, b) => a + (b.totalPages - currentPosition(b, state.entries)), 0);

  let text = `<b>${planned.length}</b> book${planned.length === 1 ? "" : "s"} · ~<b>${total.toLocaleString()}</b> pages`;
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

export function renderQueue(state) {
  const planned = state.books.filter((b) => b.status === "planned");
  const list = document.getElementById("queue-list");

  renderEta(planned, state);

  if (!planned.length) {
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
    list.innerHTML = order
      .map((id, i) => {
        const b = byId.get(id);
        return `
      <li class="q-row" draggable="true" data-id="${esc(id)}">
        <span class="rank">${String(i + 1).padStart(2, "0")}</span>
        <span class="thumb"><img src="${esc(b.cover)}" alt="" loading="lazy"></span>
        <span class="meta"><b>${esc(b.title)}</b><span>${esc(b.author)}${Number.isFinite(b.totalPages) ? ` · ~${b.totalPages} pp` : ""}</span></span>
        <span class="grip" aria-hidden="true">::::</span>
      </li>`;
      })
      .join("");
  }

  let dragId = null;

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
