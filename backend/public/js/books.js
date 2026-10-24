(function () {
  const shell = renderShell("books");
  if (!shell) return;
  const { content } = shell;
  const user = Auth.getUser();
  const isStaff = user.role === "admin" || user.role === "librarian";

  setPageHeader("Catalog", isStaff ? "Every title in the collection." : "Find something to read. Ask at the desk to borrow it.",
    isStaff ? `<button class="btn btn-primary btn-sm" id="addBookBtn">${icon("bookPlus")}<span class="hide-sm">Add a book</span></button>` : "");

  const SWATCHES = ["#1C2541", "#6B2737", "#8A6D3B", "#2F5233", "#264653", "#7A4E9C", "#B5552B", "#E9C46A", "#D8DCD3"];
  let view = (() => { try { return localStorage.getItem("libra_view") || "grid"; } catch { return "grid"; } })();
  let books = [];
  let q = "", category = "all", availability = "all", sort = "title";
  let timer = null;

  content.innerHTML = `
    <div class="toolbar" role="search">
      <div class="search-box">
        ${icon("search")}
        <label for="searchInput" class="sr-only">Search the catalog</label>
        <input type="search" id="searchInput" placeholder="Title, author, ISBN or call number" autocomplete="off" />
        <kbd aria-hidden="true">/</kbd>
      </div>
      <select class="select-pill" id="categorySelect" aria-label="Category"><option value="all">All subjects</option></select>
      <select class="select-pill" id="availSelect" aria-label="Availability">
        <option value="all">Any availability</option>
        <option value="available">On the shelf</option>
        <option value="unavailable">All copies out</option>
      </select>
      <select class="select-pill" id="sortSelect" aria-label="Sort by">
        <option value="title">Title A–Z</option>
        <option value="author">Author A–Z</option>
        <option value="newest">Newest first</option>
        <option value="available">Most available</option>
      </select>
      <div class="seg" role="group" aria-label="Layout">
        <button type="button" data-view="grid" aria-pressed="${view === "grid"}" aria-label="Covers">${icon("grid")}</button>
        <button type="button" data-view="list" aria-pressed="${view === "list"}" aria-label="List">${icon("list")}</button>
      </div>
    </div>
    <p class="result-count" id="resultCount" aria-live="polite"></p>
    <div id="shelf"></div>
  `;

  const $ = (id) => document.getElementById(id);
  $("searchInput").addEventListener("input", (e) => { q = e.target.value; clearTimeout(timer); timer = setTimeout(load, 250); });
  $("categorySelect").addEventListener("change", (e) => { category = e.target.value; load(); });
  $("availSelect").addEventListener("change", (e) => { availability = e.target.value; load(); });
  $("sortSelect").addEventListener("change", (e) => { sort = e.target.value; render(); });
  content.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
    view = b.dataset.view;
    try { localStorage.setItem("libra_view", view); } catch { /* ignore */ }
    content.querySelectorAll("[data-view]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    render();
  }));
  // "/" jumps to search, like most catalogs.
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); $("searchInput").focus(); }
  });
  if (isStaff) $("addBookBtn").addEventListener("click", () => openBookModal());

  async function loadCategories() {
    try {
      const data = await api("/books/categories");
      const sel = $("categorySelect");
      sel.querySelectorAll("option:not([value=all])").forEach((o) => o.remove());
      data.categories.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c; opt.textContent = c;
        sel.appendChild(opt);
      });
      sel.value = category;
    } catch { /* non-fatal */ }
  }

  async function load() {
    $("shelf").innerHTML = `<div class="book-grid">${Array.from({ length: 8 }).map(() => `<div><div class="skeleton" style="aspect-ratio:2/3;border-radius:4px 10px 10px 4px"></div><div class="skeleton" style="height:12px;margin-top:10px;width:80%"></div></div>`).join("")}</div>`;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category !== "all") params.set("category", category);
    if (availability !== "all") params.set("availability", availability);
    try {
      books = (await api(`/books?${params}`)).books;
      render();
    } catch (err) {
      $("shelf").innerHTML = `<div class="alert alert-error">${icon("alert")}${escapeHtml(err.message)}</div>`;
    }
  }

  function sorted() {
    const list = [...books];
    const by = {
      title: (a, b) => a.title.localeCompare(b.title),
      author: (a, b) => a.author.localeCompare(b.author),
      newest: (a, b) => (b.published_year || 0) - (a.published_year || 0),
      available: (a, b) => b.available_copies - a.available_copies,
    }[sort];
    return list.sort(by);
  }

  function availText(b) {
    return b.available_copies > 0
      ? `<span class="avail-pill yes">${b.available_copies} of ${b.total_copies} on the shelf</span>`
      : `<span class="avail-pill no">All ${b.total_copies} out</span>`;
  }

  function render() {
    const shelf = $("shelf");
    $("resultCount").textContent = books.length ? `${plural(books.length, "title")}${q || category !== "all" || availability !== "all" ? " match" : ""}` : "";
    if (!books.length) {
      shelf.innerHTML = `<div class="panel"><div class="empty-state"><div class="glyph">${icon("search")}</div><h4>No books match</h4><p>Try another word, or clear the subject and availability filters.</p></div></div>`;
      return;
    }
    const list = sorted();
    shelf.innerHTML = view === "grid"
      ? `<div class="book-grid">${list.map((b) => `
          <button type="button" class="book-card" data-id="${b.id}" aria-label="${escapeHtml(b.title)} by ${escapeHtml(b.author)}">
            ${coverHtml(b)}
            <div class="book-meta"><div class="t">${escapeHtml(b.title)}</div><div class="a">${escapeHtml(b.author)}</div>${availText(b)}</div>
          </button>`).join("")}</div>`
      : `<div class="book-list">${list.map((b) => `
          <button type="button" class="book-row" data-id="${b.id}">
            ${miniCover(b.cover_color)}
            <div style="min-width:0"><div class="cell-main">${escapeHtml(b.title)}</div><div class="cell-sub">${escapeHtml(b.author)}${b.published_year ? `, ${escapeHtml(b.published_year)}` : ""}, ${escapeHtml(b.category)}</div></div>
            ${availText(b)}
          </button>`).join("")}</div>`;
    shelf.querySelectorAll("[data-id]").forEach((el) => el.addEventListener("click", () => openDrawer(books.find((b) => b.id == el.dataset.id))));
  }

  /* ---------- Book drawer ---------- */
  function openDrawer(b) {
    const copies = Array.from({ length: Math.min(b.total_copies, 40) }, (_, i) => `<span class="${i < b.available_copies ? "" : "out"}"></span>`).join("");
    const backdrop = document.createElement("div");
    backdrop.className = "drawer-backdrop";
    backdrop.innerHTML = `
      <aside class="drawer">
        <div class="drawer-hero">
          ${coverHtml(b)}
          <div>
            <button class="modal-close" style="float:right;margin:-8px -8px 0 0">&times;</button>
            <h2>${escapeHtml(b.title)}</h2>
            <p class="muted" style="margin-top:6px">${escapeHtml(b.author)}</p>
            <div style="margin-top:12px">${availText(b)}</div>
          </div>
        </div>
        <div class="drawer-body">
          ${b.description ? `<p style="max-width:60ch">${escapeHtml(b.description)}</p>` : `<p class="muted">No description yet.</p>`}
          <dl class="facts">
            <div><dt>Subject</dt><dd>${escapeHtml(b.category)}</dd></div>
            <div><dt>Published</dt><dd>${escapeHtml(b.published_year || "—")}${b.publisher ? `, ${escapeHtml(b.publisher)}` : ""}</dd></div>
            <div><dt>Call number</dt><dd class="code">${escapeHtml(b.call_number || "—")}</dd></div>
            <div><dt>ISBN</dt><dd class="code">${escapeHtml(b.isbn || "—")}</dd></div>
          </dl>
          <div style="margin-top:18px">
            <div class="label">Copies (${b.available_copies} of ${b.total_copies} on the shelf)</div>
            <div class="copies" aria-hidden="true">${copies}</div>
          </div>
          ${isStaff ? `
          <div class="row" style="margin-top:24px;flex-wrap:wrap">
            ${b.available_copies > 0 ? `<a class="btn btn-primary" href="/issues.html?new=1&book=${b.id}">${icon("repeat")}Lend this book</a>` : ""}
            <button class="btn btn-ghost" data-act="edit">${icon("edit")}Edit</button>
            <button class="btn btn-quiet" data-act="delete" style="color:var(--stamp)">${icon("trash")}Remove</button>
          </div>` : `<p class="muted" style="margin-top:24px;font-size:13.5px">${b.available_copies > 0 ? "Ask at the front desk to borrow this book." : "All copies are out right now. Check back soon."}</p>`}
        </div>
      </aside>`;
    document.body.appendChild(backdrop);
    const close = wireModal(backdrop, () => backdrop.remove());
    backdrop.querySelector(".modal-close").addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    if (isStaff) {
      backdrop.querySelector('[data-act="edit"]').addEventListener("click", () => { close(); openBookModal(b); });
      backdrop.querySelector('[data-act="delete"]').addEventListener("click", async () => {
        if (!confirm(`Remove "${b.title}" from the catalog? Its loan history goes with it.`)) return;
        try {
          await api(`/books/${b.id}`, { method: "DELETE" });
          showToast(`Removed "${b.title}".`, "success");
          close(); load(); loadCategories();
        } catch (err) { showToast(err.message, "error"); }
      });
    }
  }

  /* ---------- Add / edit ---------- */
  function openBookModal(book) {
    const isEdit = !!book;
    const color = safeColor(book?.cover_color || SWATCHES[Math.floor(Math.random() * SWATCHES.length)]);
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <form class="modal" novalidate>
        <div class="modal-head"><h3>${isEdit ? "Edit book" : "Add a book"}</h3><button type="button" class="modal-close">&times;</button></div>
        <div class="modal-body">
          <div id="modalAlert"></div>
          <div class="cover-preview">
            <div id="previewCover"></div>
            <div>
              <div class="field"><label for="f_title">Title</label><input id="f_title" value="${escapeHtml(book?.title || "")}" required /></div>
              <div class="field" style="margin-bottom:0"><label for="f_author">Author</label><input id="f_author" value="${escapeHtml(book?.author || "")}" required /></div>
            </div>
          </div>
          <div class="field">
            <span class="label">Cover colour</span>
            <div class="row" style="flex-wrap:wrap">
              <div class="swatches" role="group" aria-label="Cover colour">${SWATCHES.map((c) => `<button type="button" style="--c:${c}" data-c="${c}" aria-label="${c}" aria-pressed="${c.toLowerCase() === color.toLowerCase()}"></button>`).join("")}</div>
              <input id="f_color" type="color" value="${color}" aria-label="Custom colour" style="width:44px;height:30px;border:0;background:none;padding:0" />
            </div>
          </div>
          <div class="grid-2">
            <div class="field"><label for="f_category">Subject</label><input id="f_category" value="${escapeHtml(book?.category || "")}" placeholder="Fiction, Science…" list="catList" /></div>
            <div class="field"><label for="f_call">Call number</label><input id="f_call" class="code" value="${escapeHtml(book?.call_number || "")}" placeholder="FIC SMI" /></div>
            <div class="field"><label for="f_isbn">ISBN</label><input id="f_isbn" class="code" value="${escapeHtml(book?.isbn || "")}" /></div>
            <div class="field"><label for="f_publisher">Publisher</label><input id="f_publisher" value="${escapeHtml(book?.publisher || "")}" /></div>
            <div class="field"><label for="f_year">Year published</label><input id="f_year" type="number" inputmode="numeric" min="0" max="${new Date().getFullYear() + 1}" value="${escapeHtml(book?.published_year || "")}" /></div>
            <div class="field"><label for="f_copies">Copies</label><input id="f_copies" type="number" inputmode="numeric" min="1" value="${escapeHtml(book?.total_copies || 1)}" /></div>
          </div>
          <div class="field"><label for="f_desc">Description</label><textarea id="f_desc" rows="3">${escapeHtml(book?.description || "")}</textarea></div>
          <datalist id="catList">${[...$("categorySelect").options].filter((o) => o.value !== "all").map((o) => `<option value="${escapeHtml(o.value)}">`).join("")}</datalist>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" id="cancelModal">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? "Save changes" : "Add to catalog"}</button>
        </div>
      </form>`;
    document.body.appendChild(backdrop);
    const close = wireModal(backdrop, () => backdrop.remove());
    backdrop.querySelector(".modal-close").addEventListener("click", close);
    backdrop.querySelector("#cancelModal").addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

    const val = (id) => backdrop.querySelector(`#${id}`).value.trim();
    const preview = () => {
      backdrop.querySelector("#previewCover").innerHTML = coverHtml({ title: val("f_title") || "Title", author: val("f_author") || "Author", cover_color: val("f_color"), call_number: val("f_call") });
    };
    preview();
    ["f_title", "f_author", "f_call", "f_color"].forEach((id) => backdrop.querySelector(`#${id}`).addEventListener("input", preview));
    backdrop.querySelectorAll(".swatches button").forEach((sw) => sw.addEventListener("click", () => {
      backdrop.querySelector("#f_color").value = sw.dataset.c;
      backdrop.querySelectorAll(".swatches button").forEach((x) => x.setAttribute("aria-pressed", String(x === sw)));
      preview();
    }));

    backdrop.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = {
        title: val("f_title"),
        author: val("f_author"),
        isbn: val("f_isbn") || null,
        category: val("f_category") || "General",
        call_number: val("f_call"),
        publisher: val("f_publisher"),
        published_year: val("f_year") ? Number(val("f_year")) : null,
        total_copies: Number(val("f_copies")) || 1,
        cover_color: val("f_color"),
        description: val("f_desc"),
      };
      if (!body.title || !body.author) {
        backdrop.querySelector("#modalAlert").innerHTML = `<div class="alert alert-error">${icon("alert")}Title and author are required.</div>`;
        return;
      }
      try {
        if (isEdit) await api(`/books/${book.id}`, { method: "PUT", body });
        else await api("/books", { method: "POST", body });
        showToast(isEdit ? `Saved "${body.title}".` : `Added "${body.title}" to the catalog.`, "success");
        close(); load(); loadCategories();
      } catch (err) {
        backdrop.querySelector("#modalAlert").innerHTML = `<div class="alert alert-error">${icon("alert")}${escapeHtml(err.message)}</div>`;
      }
    });
  }

  loadCategories();
  load();
})();
