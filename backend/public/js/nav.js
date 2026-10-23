/* Libra — shared app shell (sidebar + topbar), injected into every logged-in page */

const NAV_ICONS = {
  dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>`,
  books: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  issues: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v16l4-4h13a2 2 0 0 0 2-2V9"/><path d="M18 2l3 3-8 8H10v-3z"/></svg>`,
  members: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  profile: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
};

function buildNavLinks(role) {
  const links = [{ key: "dashboard", label: "Dashboard", href: "/dashboard.html" }];
  links.push({ key: "books", label: "Catalog", href: "/books.html" });
  if (role === "admin" || role === "librarian") {
    links.push({ key: "issues", label: "Circulation", href: "/issues.html" });
    links.push({ key: "members", label: "Members", href: "/members.html" });
  } else {
    links.push({ key: "issues", label: "My Loans", href: "/issues.html" });
  }
  links.push({ key: "profile", label: "Profile", href: "/profile.html" });
  return links;
}

function renderShell(activeKey) {
  if (!Auth.requireAuth()) return;
  const user = Auth.getUser();
  const role = user?.role || "member";
  const links = buildNavLinks(role);

  const navHtml = links
    .map(
      (l) => `<a class="nav-link ${l.key === activeKey ? "active" : ""}" href="${l.href}"${l.key === activeKey ? ' aria-current="page"' : ""}>${NAV_ICONS[l.key]}<span>${l.label}</span></a>`
    )
    .join("");

  const shell = document.createElement("div");
  shell.className = "app-shell";
  shell.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="brand-mark">
        <div class="glyph">L</div>
        <div class="word">Libra</div>
      </div>
      <nav>
        <div class="nav-section-label">Menu</div>
        ${navHtml}
      </nav>
      <div class="sidebar-foot">
        <div class="mini-profile">
          <div class="avatar">${escapeHtml(initials(user?.name))}</div>
          <div class="who">
            <b>${escapeHtml(user?.name || "")}</b>
            <span>${escapeHtml(role)}</span>
          </div>
        </div>
        <button type="button" class="logout-link" id="logoutLink">Sign out</button>
      </div>
    </aside>
    <div class="main-area">
      <header class="topbar">
        <div style="display:flex; align-items:center; gap:12px;">
          <button class="icon-btn hamburger" id="hamburgerBtn" aria-label="Toggle menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div>
            <h1 id="pageTitle"></h1>
            <div class="sub" id="pageSub"></div>
          </div>
        </div>
        <div class="topbar-actions" id="topbarActions"></div>
      </header>
      <main class="content" id="pageContent"></main>
    </div>
  `;
  document.body.prepend(shell);

  document.getElementById("logoutLink").addEventListener("click", (e) => {
    e.preventDefault();
    Auth.logout();
  });

  // Mobile drawer: tap the scrim or press Escape to close.
  const hamburger = document.getElementById("hamburgerBtn");
  const sidebar = document.getElementById("sidebar");
  const scrim = document.createElement("div");
  scrim.className = "nav-scrim";
  shell.appendChild(scrim);
  const setOpen = (open) => {
    sidebar.classList.toggle("open", open);
    scrim.classList.toggle("show", open);
    if (hamburger) hamburger.setAttribute("aria-expanded", String(open));
  };
  if (hamburger) {
    hamburger.setAttribute("aria-expanded", "false");
    hamburger.setAttribute("aria-controls", "sidebar");
    hamburger.addEventListener("click", () => setOpen(!sidebar.classList.contains("open")));
  }
  scrim.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });

  return { content: document.getElementById("pageContent") };
}

function setPageHeader(title, sub) {
  const t = document.getElementById("pageTitle");
  const s = document.getElementById("pageSub");
  if (t) t.textContent = title;
  if (s) s.textContent = sub || "";
  document.title = `${title} · Libra`;
}
