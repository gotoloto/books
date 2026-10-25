// Wishlist: books Travis wants but doesn't own yet — a cover grid to pull up
// in a bookstore. Out already: cover only, books.json order. Not out yet: cover
// + release date, chronological, after the rest. A release date that has
// passed stops being shown (and the book sorts with the released ones). Not
// queue entries: no ETA, no ranking, no stats. A title graduates into books[]
// as planned once he owns it.

import { fmtLong } from "./derive.js";
import { isProse, dateWord } from "./prose.js";

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function renderWishlist(state) {
  const box = document.getElementById("wishlist-grid");
  const upcoming = (w) => Boolean(w.releaseDate) && w.releaseDate > state.today;
  const out = state.wishlist.filter((w) => !upcoming(w));
  const soon = state.wishlist.filter(upcoming).sort((a, b) => (a.releaseDate < b.releaseDate ? -1 : 1));
  if (!out.length && !soon.length) {
    box.innerHTML = '<p class="empty-note">Wishlist is empty. Tell Claude a title to add it here.</p>';
    return;
  }
  const card = (w) => {
    const when = upcoming(w) ? (isProse() ? dateWord(w.releaseDate, state.today) : fmtLong(w.releaseDate)) : "";
    const tip = `${w.title} — ${w.author}${when ? `, ${isProse() ? "due" : "releases"} ${when}` : ""}`;
    return `
    <div class="wl-card" title="${esc(tip)}">
      <div class="cover"><img src="${esc(w.cover)}" alt="Cover of ${esc(w.title)} by ${esc(w.author)}" loading="lazy"></div>
      ${when ? `<span class="wl-date">${when}</span>` : ""}
    </div>`;
  };
  box.innerHTML = [...out, ...soon].map(card).join("");
}
