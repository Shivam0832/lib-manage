(function () {
  const shell = renderShell("books");
  if (!shell) return;
  const { content } = shell;
  const user = Auth.getUser();
  const isStaff = user.role === "admin" || user.role === "librarian";

  setPageHeader("Catalog", isStaff ? "Manage the collection and view availability." : "Browse the full collection.");

  let allCategories = [];
  let currentQuery = "";
  let currentCategory = "all";
  let currentAvailability = "all";
  let debounceTimer = null;

  content.innerHTML = `
    <div class="topbar-actions" id="headerActions" style="display:none;"></div>
    <div class="toolbar">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" id="searchInput" aria-label="Search the catalog" placeholder="Search by title, author, ISBN, or call number…" />
      </div>
      <select class="select-pill" id="categorySelect" aria-label="Category"><option value="all">All categories</option></select>
      <select class="select-pill" id="availSelect" aria-label="Availability">
        <option value="all">All copies</option>
        <option value="available">Available only</option>
        <option value="unavailable">Unavailable</option>
      </select>
      ${isStaff ? `<button class="btn btn-brass btn-sm" id="addBookBtn">+ Add book</button>` : ""}
    </div>
    <div class="book-grid" id="bookGrid"></div>
  `;

  document.getElementById("searchInput").addEventListener("input", (e) => {
    currentQuery = e.target.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadBooks, 300);
  });
  document.getElementById("categorySelect").addEventListener("change", (e) => { currentCategory = e.target.value; loadBooks(); });
  document.getElementById("availSelect").addEventListener("change", (e) => { currentAvailability = e.target.value; loadBooks(); });

  if (isStaff) {
    document.getElementById("addBookBtn").addEventListener("click", () => openBookModal());
  }

  async function loadCategories() {
    try {
      const data = await api("/books/categories");
      allCategories = data.categories;
      const sel = document.getElementById("categorySelect");
      allCategories.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c; opt.textContent = c;
        sel.appendChild(opt);
      });
    } catch { /* non-fatal */ }
  }

  async function loadBooks() {
    const grid = document.getElementById("bookGrid");
    grid.innerHTML = Array.from({ length: 6 }).map(() => `<div class="book-card"><div class="skeleton" style="height:84px;"></div><div class="body"><div class="skeleton" style="height:12px;width:40%;margin-bottom:8px;"></div><div class="skeleton" style="height:16px;width:80%;margin-bottom:6px;"></div><div class="skeleton" style="height:12px;width:50%;"></div></div></div>`).join("");

    const params = new URLSearchParams();
    if (currentQuery) params.set("q", currentQuery);
    if (currentCategory !== "all") params.set("category", currentCategory);
    if (currentAvailability !== "all") params.set("availability", currentAvailability);

    try {
      const data = await api(`/books?${params.toString()}`);
      renderGrid(data.books);
    } catch (err) {
      grid.innerHTML = `<div class="alert alert-error" style="grid-column:1/-1">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderGrid(books) {
    const grid = document.getElementById("bookGrid");
    if (!books.length) {
      grid.innerHTML = `<div style="grid-column:1/-1" class="empty-state">
        <div class="glyph"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
        <h4>No books match your search</h4><p>Try a different keyword or clear your filters.</p>
      </div>`;
      return;
    }

    grid.innerHTML = books.map((b) => `
      <div class="book-card">
        <div class="book-spine" style="--spine:${safeColor(b.cover_color)}">
          <span class="eyebrow" style="color:rgba(255,255,255,0.75)">${escapeHtml(b.category)}</span>
          ${b.call_number ? `<span class="call-no">${escapeHtml(b.call_number)}</span>` : ""}
        </div>
        <div class="body">
          <div class="cat-tag">${escapeHtml(b.published_year || "")}</div>
          <h4>${escapeHtml(b.title)}</h4>
          <div class="author">by ${escapeHtml(b.author)}</div>
          <div class="foot">
            <span class="avail-pill ${b.available_copies > 0 ? "yes" : "no"}">${b.available_copies}/${b.total_copies} available</span>
            ${isStaff ? `<div class="actions">
              <button class="icon-btn" title="Edit" aria-label="Edit ${escapeHtml(b.title)}" data-edit="${b.id}">${editIcon()}</button>
              <button class="icon-btn" title="Delete" aria-label="Delete ${escapeHtml(b.title)}" data-delete="${b.id}">${trashIcon()}</button>
            </div>` : ""}
          </div>
        </div>
      </div>
    `).join("");

    if (isStaff) {
      grid.querySelectorAll("[data-edit]").forEach((btn) =>
        btn.addEventListener("click", () => openBookModal(books.find((b) => b.id == btn.dataset.edit)))
      );
      grid.querySelectorAll("[data-delete]").forEach((btn) =>
        btn.addEventListener("click", () => deleteBook(btn.dataset.delete))
      );
    }
  }

  function editIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  }
  function trashIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`;
  }

  async function deleteBook(id) {
    if (!confirm("Remove this book from the catalog? This cannot be undone.")) return;
    try {
      await api(`/books/${id}`, { method: "DELETE" });
      showToast("Book removed from catalog.", "success");
      loadBooks();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function openBookModal(book) {
    const isEdit = !!book;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>${isEdit ? "Edit book" : "Add a new book"}</h3><button class="modal-close" id="closeModal">&times;</button></div>
        <div class="modal-body">
          <div id="modalAlert"></div>
          <div class="field"><label for="f_title">Title</label><input id="f_title" value="${escapeHtml(book?.title || "")}" /></div>
          <div class="grid-2">
            <div class="field"><label for="f_author">Author</label><input id="f_author" value="${escapeHtml(book?.author || "")}" /></div>
            <div class="field"><label for="f_isbn">ISBN</label><input id="f_isbn" value="${escapeHtml(book?.isbn || "")}" /></div>
          </div>
          <div class="grid-2">
            <div class="field"><label for="f_category">Category</label><input id="f_category" value="${escapeHtml(book?.category || "")}" placeholder="Fiction, Science…" /></div>
            <div class="field"><label for="f_call">Call number</label><input id="f_call" value="${escapeHtml(book?.call_number || "")}" /></div>
          </div>
          <div class="grid-2">
            <div class="field"><label for="f_publisher">Publisher</label><input id="f_publisher" value="${escapeHtml(book?.publisher || "")}" /></div>
            <div class="field"><label for="f_year">Published year</label><input id="f_year" type="number" min="0" max="${new Date().getFullYear() + 1}" value="${escapeHtml(book?.published_year || "")}" /></div>
          </div>
          <div class="grid-2">
            <div class="field"><label for="f_copies">Total copies</label><input id="f_copies" type="number" min="1" value="${book?.total_copies || 1}" /></div>
            <div class="field"><label for="f_color">Spine color</label><input id="f_color" type="color" value="${safeColor(book?.cover_color)}" style="height:44px;padding:4px;" /></div>
          </div>
          <div class="field"><label for="f_desc">Description</label><textarea id="f_desc" rows="3">${escapeHtml(book?.description || "")}</textarea></div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" id="cancelModal">Cancel</button>
          <button class="btn btn-primary" id="saveModal">${isEdit ? "Save changes" : "Add book"}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const close = wireModal(backdrop, () => backdrop.remove());
    backdrop.querySelector("#closeModal").addEventListener("click", close);
    backdrop.querySelector("#cancelModal").addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

    backdrop.querySelector("#saveModal").addEventListener("click", async () => {
      const body = {
        title: document.getElementById("f_title").value.trim(),
        author: document.getElementById("f_author").value.trim(),
        isbn: document.getElementById("f_isbn").value.trim() || null,
        category: document.getElementById("f_category").value.trim() || "General",
        call_number: document.getElementById("f_call").value.trim(),
        publisher: document.getElementById("f_publisher").value.trim(),
        published_year: document.getElementById("f_year").value ? Number(document.getElementById("f_year").value) : null,
        total_copies: Number(document.getElementById("f_copies").value) || 1,
        cover_color: document.getElementById("f_color").value,
        description: document.getElementById("f_desc").value.trim(),
      };
      if (!body.title || !body.author) {
        document.getElementById("modalAlert").innerHTML = `<div class="alert alert-error">Title and author are required.</div>`;
        return;
      }
      try {
        if (isEdit) await api(`/books/${book.id}`, { method: "PUT", body });
        else await api("/books", { method: "POST", body });
        showToast(isEdit ? "Book updated." : "Book added to catalog.", "success");
        close();
        loadBooks();
        loadCategories();
      } catch (err) {
        document.getElementById("modalAlert").innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
      }
    });
  }

  loadCategories();
  loadBooks();
})();
