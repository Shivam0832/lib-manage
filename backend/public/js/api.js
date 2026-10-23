/* Libra — shared client: auth, API calls, formatting, icons, covers, theme */
const API_BASE = "/api";

/* ---------- Theme (applied as early as this script loads) ---------- */
const Theme = {
  key: "libra_theme",
  get() { try { return localStorage.getItem(this.key) || "system"; } catch { return "system"; } },
  apply(mode) {
    if (mode === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = mode;
  },
  set(mode) {
    try { mode === "system" ? localStorage.removeItem(this.key) : localStorage.setItem(this.key, mode); } catch { /* ignore */ }
    this.apply(mode);
  },
  cycle() {
    const order = ["system", "light", "dark"];
    const next = order[(order.indexOf(this.get()) + 1) % order.length];
    this.set(next);
    return next;
  },
};
Theme.apply(Theme.get());

const Auth = {
  getToken() { return localStorage.getItem("libra_token"); },
  setToken(t) { localStorage.setItem("libra_token", t); },
  getUser() {
    try { return JSON.parse(localStorage.getItem("libra_user") || "null"); }
    catch { return null; }
  },
  setUser(u) { localStorage.setItem("libra_user", JSON.stringify(u)); },
  clear() { localStorage.removeItem("libra_token"); localStorage.removeItem("libra_user"); },
  requireAuth() {
    if (!this.getToken()) { window.location.href = "/login.html"; return false; }
    return true;
  },
  logout() { this.clear(); window.location.href = "/login.html"; },
};

async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const t = Auth.getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  let data = {};
  try { data = await res.json(); } catch { /* no body */ }

  if (res.status === 401 && auth) {
    Auth.clear();
    // Carry the reason (expired, suspended…) over to the login page.
    try { sessionStorage.setItem("libra_notice", data.error || "Please sign in again."); } catch { /* ignore */ }
    window.location.href = "/login.html";
    throw new Error(data.error || "Session expired.");
  }
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

/* ---------- Formatting ---------- */
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function shortDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
}
function initials(name) {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
}
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
/** Only ever put a real #rrggbb colour into a style attribute. */
function safeColor(c) {
  return /^#[0-9a-fA-F]{6}$/.test(c || "") ? c : "#1C2541";
}
function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}
/** Sentence-case labels for statuses and roles. */
const LABELS = { issued: "On loan", overdue: "Overdue", returned: "Returned", active: "Active", suspended: "Suspended", admin: "Admin", librarian: "Librarian", member: "Reader" };
const statusLabel = (s) => LABELS[s] || escapeHtml(s);
const badge = (s) => `<span class="status-badge ${escapeHtml(s)}">${statusLabel(s)}</span>`;

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Days until due (negative = overdue), counted in calendar days. */
function daysUntil(iso) {
  const d = new Date(iso); const now = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}
/** { text, cls } describing a due date, for open loans. */
function dueInfo(iso) {
  const n = daysUntil(iso);
  if (n < 0) return { text: `${plural(-n, "day")} overdue`, cls: "is-late" };
  if (n === 0) return { text: "Due today", cls: "is-soon" };
  if (n <= 3) return { text: `Due in ${plural(n, "day")}`, cls: "is-soon" };
  return { text: `Due in ${n} days`, cls: "is-ok" };
}

/* ---------- Covers ---------- */
function isLightColor(hex) {
  const c = safeColor(hex).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62;
}
/** A generated book cover: title in the serif face on the book's colour. */
function coverHtml(b, { call = true } = {}) {
  const c = safeColor(b.cover_color);
  return `<div class="cover${isLightColor(c) ? " is-light" : ""}" style="--c:${c}" aria-hidden="true">
    <div>
      <div class="cover-title">${escapeHtml(b.title)}</div>
      <div class="cover-rule"></div>
      <div class="cover-author">${escapeHtml(b.author)}</div>
    </div>
    ${call && b.call_number ? `<span class="cover-call">${escapeHtml(b.call_number)}</span>` : "<span></span>"}
  </div>`;
}
function miniCover(color) {
  return `<span class="mini-cover" style="--c:${safeColor(color)}" aria-hidden="true"></span>`;
}

/* ---------- Icons (paths from the Lucide set, ISC licence) ---------- */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  cash: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  bookPlus: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M12 7v6M9 10h6"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m2 2 20 20"/><path d="M6.7 6.7C3.9 8.4 2 12 2 12s3 7 10 7c2 0 3.8-.6 5.3-1.6"/><path d="M10.6 5.1C11.1 5 11.5 5 12 5c7 0 10 7 10 7s-.7 1.6-2.1 3.3"/><path d="M14.1 14.1A3 3 0 0 1 9.9 9.9"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
};
function icon(name, cls = "icon") {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

/* ---------- Modals & toasts ---------- */
/** Close a modal with Escape, focus its first field, and restore focus after. */
function wireModal(backdrop, close) {
  const opener = document.activeElement;
  const modal = backdrop.querySelector(".modal, .drawer");
  if (modal) {
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const h = modal.querySelector("h2, h3");
    if (h) { h.id = h.id || "modalTitle"; modal.setAttribute("aria-labelledby", h.id); }
  }
  const closeBtn = backdrop.querySelector(".modal-close");
  if (closeBtn) closeBtn.setAttribute("aria-label", "Close");
  const onKey = (e) => { if (e.key === "Escape") done(); };
  function done() {
    document.removeEventListener("keydown", onKey);
    close();
    if (opener && opener.focus) opener.focus();
  }
  document.addEventListener("keydown", onKey);
  const first = backdrop.querySelector("input:not([disabled]):not([type=hidden]), select, textarea") || backdrop.querySelector(".modal-close");
  if (first) setTimeout(() => first.focus(), 0);
  return done;
}

function showToast(message, type = "default") {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    stack.setAttribute("aria-live", "polite");
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), type === "error" ? 6500 : 4000);
}

/** Password field with a show/hide toggle; call after the input exists. */
function enhancePassword(input) {
  if (!input || input.parentElement.classList.contains("pw")) return;
  const wrap = document.createElement("div");
  wrap.className = "pw";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "Show password");
  btn.innerHTML = icon("eye");
  btn.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    btn.innerHTML = icon(show ? "eyeOff" : "eye");
  });
  wrap.appendChild(btn);
}
