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
    window.location.href = "/login.html";
    throw new Error("Session expired.");
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

function showToast(message, type = "default") {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}
