(function () {
  const shell = renderShell("issues");
  if (!shell) return;
  const { content } = shell;
  const user = Auth.getUser();
  const isStaff = user.role === "admin" || user.role === "librarian";

  setPageHeader(isStaff ? "Circulation" : "My Loans", isStaff ? "Issue books, process returns, and track fines." : "Everything you currently have borrowed.");

  let currentStatus = "all";

  content.innerHTML = `
    <div class="toolbar">
      <div class="tabs" style="border:none; margin:0;">
        <button class="tab-btn active" data-status="all">All</button>
        <button class="tab-btn" data-status="issued">Issued</button>
        <button class="tab-btn" data-status="overdue">Overdue</button>
        <button class="tab-btn" data-status="returned">Returned</button>
      </div>
      ${isStaff ? `<button class="btn btn-brass btn-sm" id="newIssueBtn" style="margin-left:auto;">+ Issue a book</button>` : ""}
    </div>
    <div class="panel">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Book</th>
              ${isStaff ? "<th>Member</th>" : ""}
              <th>Issued</th>
              <th>Due</th>
              <th>Status</th>
              <th>Fine</th>
              ${isStaff ? "<th></th>" : ""}
            </tr>
          </thead>
          <tbody id="issueRows"></tbody>
        </table>
      </div>
    </div>
  `;

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentStatus = btn.dataset.status;
      load();
    });
  });

  if (isStaff) {
    document.getElementById("newIssueBtn").addEventListener("click", openIssueModal);
  }

  async function load() {
    const tbody = document.getElementById("issueRows");
    const cols = isStaff ? 7 : 5;
    tbody.innerHTML = `<tr><td colspan="${cols}"><div class="skeleton" style="height:20px;margin:8px 0;"></div></td></tr>`;

    try {
      const params = currentStatus !== "all" ? `?status=${currentStatus}` : "";
      const data = await api(`/issues${params}`);
      renderRows(data.issues, cols);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="${cols}"><div class="alert alert-error">${escapeHtml(err.message)}</div></td></tr>`;
    }
  }

  function renderRows(issues, cols) {
    const tbody = document.getElementById("issueRows");
    if (!issues.length) {
      tbody.innerHTML = `<tr><td colspan="${cols}"><div class="empty-state"><h4>No records here</h4><p>Nothing matches this filter yet.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = issues.map((i) => `
      <tr>
        <td><b>${escapeHtml(i.book_title)}</b><br><span class="muted" style="font-size:12px">${escapeHtml(i.book_author)}</span></td>
        ${isStaff ? `<td>${escapeHtml(i.member_name)}<br><span class="muted" style="font-size:12px">${escapeHtml(i.member_email)}</span></td>` : ""}
        <td>${fmtDate(i.issue_date)}</td>
        <td>${fmtDate(i.due_date)}</td>
        <td><span class="status-badge ${i.status}">${i.status}</span></td>
        <td>${i.fine_amount > 0 ? `$${i.fine_amount.toFixed(2)} ${i.fine_paid ? '<span class="muted" style="font-size:11px">(paid)</span>' : ''}` : "—"}</td>
        ${isStaff ? `<td>
          <div class="row-actions">
            ${i.status !== "returned" ? `<button class="text-link-btn" data-return="${i.id}">Mark returned</button>` : ""}
            ${i.fine_amount > 0 && !i.fine_paid ? `<button class="text-link-btn danger" data-payfine="${i.id}">Pay fine</button>` : ""}
          </div>
        </td>` : ""}
      </tr>
    `).join("");

    if (isStaff) {
      tbody.querySelectorAll("[data-return]").forEach((btn) =>
        btn.addEventListener("click", () => returnBook(btn.dataset.return))
      );
      tbody.querySelectorAll("[data-payfine]").forEach((btn) =>
        btn.addEventListener("click", () => payFine(btn.dataset.payfine))
      );
    }
  }

  async function returnBook(id) {
    try {
      await api(`/issues/${id}/return`, { method: "PUT" });
      showToast("Book marked as returned.", "success");
      load();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function payFine(id) {
    try {
      await api(`/issues/${id}/pay-fine`, { method: "PUT" });
      showToast("Fine marked as paid.", "success");
      load();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function openIssueModal() {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>Issue a book</h3><button class="modal-close" id="closeModal">&times;</button></div>
        <div class="modal-body">
          <div id="modalAlert"></div>
          <div class="field">
            <label>Book</label>
            <select id="f_book"><option value="">Loading books…</option></select>
          </div>
          <div class="field">
            <label>Member</label>
            <select id="f_member"><option value="">Loading members…</option></select>
          </div>
          <p class="muted" style="font-size:12.5px;">Loan period is 14 days from today. Late returns accrue a $5/day fine.</p>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" id="cancelModal">Cancel</button>
          <button class="btn btn-primary" id="saveModal">Issue book</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.querySelector("#closeModal").addEventListener("click", close);
    backdrop.querySelector("#cancelModal").addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

    try {
      const [booksData, membersData] = await Promise.all([
        api("/books?availability=available"),
        api("/members?role=member"),
      ]);
      const bookSel = document.getElementById("f_book");
      bookSel.innerHTML = booksData.books.length
        ? booksData.books.map((b) => `<option value="${b.id}">${escapeHtml(b.title)} — ${escapeHtml(b.author)} (${b.available_copies} left)</option>`).join("")
        : `<option value="">No available copies</option>`;

      const memberSel = document.getElementById("f_member");
      memberSel.innerHTML = membersData.users.length
        ? membersData.users.map((m) => `<option value="${m.id}">${escapeHtml(m.name)} — ${escapeHtml(m.email)}</option>`).join("")
        : `<option value="">No members registered</option>`;
    } catch (err) {
      document.getElementById("modalAlert").innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }

    backdrop.querySelector("#saveModal").addEventListener("click", async () => {
      const book_id = document.getElementById("f_book").value;
      const user_id = document.getElementById("f_member").value;
      if (!book_id || !user_id) {
        document.getElementById("modalAlert").innerHTML = `<div class="alert alert-error">Please select both a book and a member.</div>`;
        return;
      }
      try {
        await api("/issues", { method: "POST", body: { book_id, user_id } });
        showToast("Book issued successfully.", "success");
        close();
        load();
      } catch (err) {
        document.getElementById("modalAlert").innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
      }
    });
  }

  load();
})();
