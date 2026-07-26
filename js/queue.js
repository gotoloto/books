// Planned-reads queue: drag-and-drop ranking persisted to localStorage only.
// books.json array order is the default rank; the saved order (ids) overrides.
// Merge is self-healing: vanished ids drop out, new planned books append.

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

export function renderQueue(state) {
  const planned = state.books.filter((b) => b.status === "planned");
  const list = document.getElementById("queue-list");

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
        <span class="meta"><b>${esc(b.title)}</b><span>${esc(b.author)}</span></span>
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
