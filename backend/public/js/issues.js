(function () {
  const shell = renderShell("issues");
  if (!shell) return;
  const { content } = shell;
  const user = Auth.getUser();
  const isStaff = user.role === "admin" || user.role === "librarian";
  const params = new URLSearchParams(location.search);

  setPageHeader(isStaff ? "Loans & returns" : "My loans",
    isStaff ? "Lend books, take returns and settle fines." : "Everything you've borrowed and when it's due.",
    isStaff ? `<button class="btn btn-primary btn-sm" id="newIssueBtn">${icon("plus")}<span class="hide-sm">Lend a book</span></button>` : "");

  let policy = { loanDays: 14, finePerDay: 5 };
  api("/issues/policy").then((p) => { policy = p; }).catch(() => {});

  const TABS = [
    { key: "open", label: isStaff ? "On loan" : "Borrowed now", test: (i) => i.status !== "returned" },
    { key: "overdue", label: "Overdue", test: (i) => i.status === "overdue" },
    { key: "fines", label: "Fines due", test: (i) => i.status === "returned" && i.fine_amount > 0 && !i.fine_paid },
    { key: "returned", label: "Returned", test: (i) => i.status === "returned" },
    { key: "all", label: "All", test: () => true },
  ];
  let tab = { overdue: "overdue", returned: "returned" }[params.get("status")] || "open";
  let issues = [];
  let q = "";

  content.innerHTML = `
    <div class="toolbar">
      <div class="tabs" role="group" aria-label="Filter loans" id="tabs"></div>
      ${isStaff ? `<div class="search-box" style="flex:0 1 300px;margin-left:auto">${icon("search")}<label for="loanSearch" class="sr-only">Search loans</label><input type="search" id="loanSearch" placeholder="Book or member" /></div>` : ""}
    </div>
    <div class="panel">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Book</th>${isStaff ? "<th>Member</th>" : ""}<th>Lent</th><th>Due</th><th>Fine</th>${isStaff ? "<th></th>" : ""}</tr></thead>
          <tbody id="issueRows"></tbody>
        </table>
      </div>
    </div>`;
  const cols = isStaff ? 6 : 4;
  if (isStaff) {
    document.getElementById("newIssueBtn").addEventListener("click", () => openIssueModal());
    document.getElementById("loanSearch").addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); render(); });
  }

  async function load() {
    document.getElementById("issueRows").innerHTML = `<tr><td colspan="${cols}"><div class="skeleton" style="height:22px;margin:8px 0"></div></td></tr>`;
    try {
      issues = (await api("/issues")).issues;
      render();
    } catch (err) {
      document.getElementById("issueRows").innerHTML = `<tr><td colspan="${cols}"><div class="alert alert-error">${icon("alert")}${escapeHtml(err.message)}</div></td></tr>`;
    }
  }

  function render() {
    const tabsEl = document.getElementById("tabs");
    tabsEl.innerHTML = TABS.filter((t) => isStaff || t.key !== "fines").map((t) => {
      const n = issues.filter(t.test).length;
      return `<button class="tab-btn ${t.key === tab ? "active" : ""}" data-tab="${t.key}" aria-pressed="${t.key === tab}">${t.label}<span class="n">${n}</span></button>`;
    }).join("");
    tabsEl.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; render(); }));

    const t = TABS.find((x) => x.key === tab);
    const rows = issues.filter(t.test).filter((i) => !q || `${i.book_title} ${i.book_author} ${i.member_name} ${i.member_email}`.toLowerCase().includes(q));
    // Open loans: soonest due first. History: newest first.
    if (tab === "open" || tab === "overdue") rows.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    const tbody = document.getElementById("issueRows");
    if (!rows.length) {
      const msg = { open: ["Nothing on loan", isStaff ? "Lend a book and it appears here." : "Browse the catalog and ask at the desk to borrow."], overdue: ["Nothing overdue", "Every book is back or still in time."], fines: ["No fines waiting", "Fines appear here once a late book is returned."], returned: ["No returns yet", ""], all: ["No loans yet", ""] }[tab];
      tbody.innerHTML = `<tr><td colspan="${cols}"><div class="empty-state"><div class="glyph">${icon(tab === "overdue" || tab === "fines" ? "check" : "book")}</div><h4>${msg[0]}</h4>${msg[1] ? `<p>${msg[1]}</p>` : ""}</div></td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((i) => {
      const open = i.status !== "returned";
      const d = open ? dueInfo(i.due_date) : null;
      const fine = !(i.fine_amount > 0) ? `<span class="muted">—</span>`
        : open ? `<span class="due is-late">${money(i.fine_amount)}</span><div class="cell-sub">still growing</div>`
        : `<span class="cell-main">${money(i.fine_amount)}</span><div class="cell-sub">${i.fine_paid ? "paid" : "to pay"}</div>`;
      return `<tr>
        <td><div class="book-cell">${miniCover(i.cover_color)}<div><div class="cell-main">${escapeHtml(i.book_title)}</div><div class="cell-sub">${escapeHtml(i.book_author)}</div></div></div></td>
        ${isStaff ? `<td><div class="cell-main">${escapeHtml(i.member_name)}</div><div class="cell-sub">${escapeHtml(i.member_email)}</div></td>` : ""}
        <td>${fmtDate(i.issue_date)}</td>
        <td>${open ? `<div>${fmtDate(i.due_date)}</div><span class="due ${d.cls}">${d.text}</span>` : `<div>${fmtDate(i.due_date)}</div><span class="cell-sub">Returned ${shortDate(i.return_date)}</span>`}</td>
        <td>${fine}</td>
        ${isStaff ? `<td><div class="row-actions">
          ${open ? `<button class="btn btn-ghost btn-sm" data-return="${i.id}">${icon("undo")}Take return</button>` : ""}
          ${!open && i.fine_amount > 0 && !i.fine_paid ? `<button class="btn btn-ghost btn-sm" data-payfine="${i.id}">${icon("cash")}Record payment</button>` : ""}
        </div></td>` : ""}
      </tr>`;
    }).join("");

    tbody.querySelectorAll("[data-return]").forEach((b) => b.addEventListener("click", () => returnBook(rows.find((r) => r.id == b.dataset.return))));
    tbody.querySelectorAll("[data-payfine]").forEach((b) => b.addEventListener("click", () => payFine(rows.find((r) => r.id == b.dataset.payfine))));
  }

  async function returnBook(i) {
    try {
      const { issue } = await api(`/issues/${i.id}/return`, { method: "PUT" });
      showToast(issue.fine_amount > 0 ? `"${i.book_title}" returned late. Fine to pay: ${money(issue.fine_amount)}.` : `"${i.book_title}" returned on time.`, "success");
      if (issue.fine_amount > 0) tab = "fines";
      load();
    } catch (err) { showToast(err.message, "error"); }
  }

  async function payFine(i) {
    if (!confirm(`Record that ${i.member_name} paid ${money(i.fine_amount)} for "${i.book_title}"?`)) return;
    try {
      await api(`/issues/${i.id}/pay-fine`, { method: "PUT" });
      showToast(`Payment of ${money(i.fine_amount)} recorded.`, "success");
      load();
    } catch (err) { showToast(err.message, "error"); }
  }

  /* ---------- Lend a book ---------- */
  async function openIssueModal(preselectBook) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <form class="modal">
        <div class="modal-head"><h3>Lend a book</h3><button type="button" class="modal-close">&times;</button></div>
        <div class="modal-body">
          <div id="modalAlert"></div>
          <div class="field">
            <label for="f_book">Book</label>
            <input type="search" id="f_book_q" class="input" placeholder="Filter books by title or author" aria-label="Filter books" style="margin-bottom:6px" />
            <select id="f_book" size="5" style="height:auto;padding:4px"><option value="">Loading…</option></select>
          </div>
          <div class="field">
            <label for="f_member">Member</label>
            <input type="search" id="f_member_q" class="input" placeholder="Filter members by name or email" aria-label="Filter members" style="margin-bottom:6px" />
            <select id="f_member" size="5" style="height:auto;padding:4px"><option value="">Loading…</option></select>
          </div>
          <div class="alert alert-info" id="dueNote">${icon("calendar")}<span></span></div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" id="cancelModal">Cancel</button>
          <button type="submit" class="btn btn-primary">Lend book</button>
        </div>
      </form>`;
    document.body.appendChild(backdrop);
    const close = wireModal(backdrop, () => backdrop.remove());
    backdrop.querySelector(".modal-close").addEventListener("click", close);
    backdrop.querySelector("#cancelModal").addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

    const due = new Date(Date.now() + policy.loanDays * 86400000);
    backdrop.querySelector("#dueNote span").textContent = `Due back ${fmtDate(due)} (${policy.loanDays} days). Late returns cost ${money(policy.finePerDay)} a day.`;

    let bookList = [], memberList = [];
    const fill = (sel, items, label, keep) => {
      sel.innerHTML = items.length ? items.map((x) => `<option value="${x.id}">${label(x)}</option>`).join("") : `<option value="" disabled>No matches</option>`;
      if (keep && items.some((x) => x.id == keep)) sel.value = keep;
      else if (items.length) sel.value = items[0].id;
    };
    const bookLabel = (b) => `${escapeHtml(b.title)}, ${escapeHtml(b.author)} (${b.available_copies} on shelf)`;
    const memberLabel = (m) => `${escapeHtml(m.name)}, ${escapeHtml(m.email)}`;

    try {
      const [booksData, membersData] = await Promise.all([api("/books?availability=available"), api("/members?role=member")]);
      bookList = booksData.books;
      memberList = membersData.users.filter((m) => m.status === "active");
      fill(backdrop.querySelector("#f_book"), bookList, bookLabel, preselectBook);
      fill(backdrop.querySelector("#f_member"), memberList, memberLabel);
    } catch (err) {
      backdrop.querySelector("#modalAlert").innerHTML = `<div class="alert alert-error">${icon("alert")}${escapeHtml(err.message)}</div>`;
    }
    const filter = (inputId, selId, list, label, fields) => backdrop.querySelector(`#${inputId}`).addEventListener("input", (e) => {
      const t = e.target.value.trim().toLowerCase();
      const sel = backdrop.querySelector(`#${selId}`);
      fill(sel, list.filter((x) => fields.some((f) => String(x[f] || "").toLowerCase().includes(t))), label, sel.value);
    });
    filter("f_book_q", "f_book", bookList, bookLabel, ["title", "author", "isbn", "call_number"]);
    filter("f_member_q", "f_member", memberList, memberLabel, ["name", "email"]);

    backdrop.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const book_id = backdrop.querySelector("#f_book").value;
      const user_id = backdrop.querySelector("#f_member").value;
      if (!book_id || !user_id) {
        backdrop.querySelector("#modalAlert").innerHTML = `<div class="alert alert-error">${icon("alert")}Choose a book and a member.</div>`;
        return;
      }
      try {
        const { issue } = await api("/issues", { method: "POST", body: { book_id, user_id } });
        const b = bookList.find((x) => x.id == book_id); const m = memberList.find((x) => x.id == user_id);
        showToast(`Lent "${b?.title}" to ${m?.name}. Due back ${fmtDate(issue.due_date)}.`, "success");
        close(); tab = "open"; load();
      } catch (err) {
        backdrop.querySelector("#modalAlert").innerHTML = `<div class="alert alert-error">${icon("alert")}${escapeHtml(err.message)}</div>`;
      }
    });
  }

  load();
  if (isStaff && params.get("new")) {
    openIssueModal(params.get("book"));
    history.replaceState(null, "", "/issues.html");
  }
})();
