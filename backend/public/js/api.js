/* Libra — shared API client */
const API_BASE = "/api";

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
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
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

  if (!res.ok) {
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

/** Close a modal with Escape, focus its first field, and restore focus after. */
function wireModal(backdrop, close) {
  const opener = document.activeElement;
  const modal = backdrop.querySelector(".modal");
  if (modal) {
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const h = modal.querySelector("h3");
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
  const first = backdrop.querySelector("input:not([disabled]), select, textarea");
  if (first) setTimeout(() => first.focus(), 0);
  return done;
}

function showToast(message, type = "default") {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}
