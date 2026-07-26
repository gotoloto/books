import { buildDaily, globalWpp, todayISO } from "./derive.js";
import { renderLibrary } from "./library.js";
import { renderQueue } from "./queue.js";
import { renderStats } from "./stats.js";

const VIEWS = ["library", "queue", "stats"];
const state = {};

function showBanner(html) {
  const el = document.getElementById("banner");
  el.innerHTML = html;
  el.hidden = false;
}

function currentView() {
  const h = location.hash.replace("#", "");
  return VIEWS.includes(h) ? h : "library";
}

function route() {
  const view = currentView();
  for (const v of VIEWS) {
    document.getElementById(`view-${v}`).hidden = v !== view;
    document.getElementById(`tab-${v}`).setAttribute("aria-selected", String(v === view));
  }
  // Charts measure their container — only render while visible.
  if (view === "stats" && state.ready) renderStats(state);
}

async function boot() {
  try {
    const [booksRes, logRes] = await Promise.all([
      fetch("data/books.json", { cache: "no-cache" }),
      fetch("data/log.json", { cache: "no-cache" }),
    ]);
    if (!booksRes.ok || !logRes.ok) throw new Error(`HTTP ${booksRes.status}/${logRes.status}`);
    state.books = (await booksRes.json()).books;
    state.entries = (await logRes.json()).entries;
  } catch (err) {
    showBanner(
      `<b>Couldn’t load the reading data.</b> If you opened this file directly, ` +
      `serve it over HTTP instead: <code>python3 -m http.server 8000</code> in the ` +
      `project folder, then visit <code>http://localhost:8000</code>. (${err.message})`
    );
    return;
  }

  state.byId = new Map(state.books.map((b) => [b.id, b]));
  state.daily = buildDaily(state.entries);
  state.gWpp = globalWpp(state.books);
  state.today = todayISO();
  state.ready = true;

  renderLibrary(state);
  renderQueue(state);
  route();

  window.addEventListener("hashchange", route);

  let t = null;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (currentView() === "stats") renderStats(state);
    }, 150);
  });
}

boot();
