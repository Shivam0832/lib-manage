/* Libra — shared app shell (sidebar + topbar), injected into every signed-in page */

function buildNavLinks(role) {
  const staff = role === "admin" || role === "librarian";
  const links = [
    { key: "dashboard", label: staff ? "Front desk" : "My shelf", href: "/dashboard.html", icon: "dashboard" },
    { key: "books", label: "Catalog", href: "/books.html", icon: "library" },
    { key: "issues", label: staff ? "Loans & returns" : "My loans", href: "/issues.html", icon: "repeat" },
  ];
  if (staff) links.push({ key: "members", label: "Members", href: "/members.html", icon: "users" });
  links.push({ key: "profile", label: "Account", href: "/profile.html", icon: "user" });
  return links;
}

const THEME_ICON = { system: "monitor", light: "sun", dark: "moon" };
const THEME_LABEL = { system: "Theme: match system", light: "Theme: light", dark: "Theme: dark" };

function renderShell(activeKey) {
  if (!Auth.requireAuth()) return;
  const user = Auth.getUser();
  const role = user?.role || "member";
  const links = buildNavLinks(role);

  const navHtml = links
    .map((l) => `<a class="nav-link ${l.key === activeKey ? "active" : ""}" href="${l.href}"${l.key === activeKey ? ' aria-current="page"' : ""}>${icon(l.icon)}<span>${l.label}</span></a>`)
    .join("");

  const shell = document.createElement("div");
  shell.className = "app-shell";
  shell.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <a class="brand-mark" href="/dashboard.html" aria-label="Libra home">
        <span class="glyph">${icon("book")}</span>
        <span class="word">Libra</span>
      </a>
      <nav aria-label="Main">${navHtml}</nav>
      <div class="sidebar-foot">
        <div class="avatar" aria-hidden="true">${escapeHtml(initials(user?.name))}</div>
        <div class="who">
          <b title="${escapeHtml(user?.email || "")}">${escapeHtml(user?.name || "")}</b>
          <span>${statusLabel(role)}</span>
        </div>
        <button type="button" class="chrome-btn" id="logoutLink" aria-label="Sign out" title="Sign out">${icon("logout")}</button>
      </div>
    </aside>
    <div class="main-area">
      <header class="topbar">
        <button class="icon-btn hamburger" id="hamburgerBtn" aria-label="Open menu">${icon("menu")}</button>
        <div style="min-width:0">
          <h1 id="pageTitle"></h1>
          <div class="sub" id="pageSub"></div>
        </div>
        <div class="topbar-actions" id="topbarActions">
          <button class="icon-btn" id="themeBtn"></button>
        </div>
      </header>
      <main class="content" id="pageContent"></main>
    </div>
  `;
  document.body.prepend(shell);

  document.getElementById("logoutLink").addEventListener("click", () => Auth.logout());

  const themeBtn = document.getElementById("themeBtn");
  const paintTheme = () => {
    const mode = Theme.get();
    themeBtn.innerHTML = icon(THEME_ICON[mode]);
    themeBtn.setAttribute("aria-label", THEME_LABEL[mode]);
    themeBtn.title = THEME_LABEL[mode];
  };
  paintTheme();
  themeBtn.addEventListener("click", () => { Theme.cycle(); paintTheme(); });

  // Mobile drawer: tap the scrim or press Escape to close.
  const hamburger = document.getElementById("hamburgerBtn");
  const sidebar = document.getElementById("sidebar");
  const scrim = document.createElement("div");
  scrim.className = "nav-scrim";
  shell.appendChild(scrim);
  const setOpen = (open) => {
    sidebar.classList.toggle("open", open);
    scrim.classList.toggle("show", open);
    hamburger.setAttribute("aria-expanded", String(open));
  };
  hamburger.setAttribute("aria-expanded", "false");
  hamburger.setAttribute("aria-controls", "sidebar");
  hamburger.addEventListener("click", () => setOpen(!sidebar.classList.contains("open")));
  scrim.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });

  return { content: document.getElementById("pageContent") };
}

/** Title, subtitle and optional action buttons (HTML) for the topbar. */
function setPageHeader(title, sub, actionsHtml) {
  const t = document.getElementById("pageTitle");
  const s = document.getElementById("pageSub");
  if (t) t.textContent = title;
  if (s) s.textContent = sub || "";
  if (actionsHtml) document.getElementById("topbarActions").insertAdjacentHTML("afterbegin", actionsHtml);
  document.title = `${title} · Libra`;
}
