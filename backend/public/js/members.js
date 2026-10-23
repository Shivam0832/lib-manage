(function () {
  const shell = renderShell("members");
  if (!shell) return;
  const { content } = shell;
  const user = Auth.getUser();

  if (user.role === "member") {
    content.innerHTML = `<div class="alert alert-error">You don't have permission to view this page.</div>`;
    setPageHeader("Members", "");
    return;
  }
  const isAdmin = user.role === "admin";

  setPageHeader("Members", isAdmin ? "Manage member and staff accounts." : "Browse registered members.");

  let currentQuery = "";
  let currentRole = "all";
  let debounceTimer = null;

  content.innerHTML = `
    <div class="toolbar">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="searchInput" placeholder="Search by name or email…" />
      </div>
      <select class="select-pill" id="roleSelect">
        <option value="all">All roles</option>
        <option value="member">Members</option>
        <option value="librarian">Librarians</option>
        <option value="admin">Admins</option>
      </select>
      ${isAdmin ? `<button class="btn btn-brass btn-sm" id="addBtn">+ New account</button>` : ""}
    </div>
    <div class="panel">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th>${isAdmin ? "<th></th>" : ""}</tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById("searchInput").addEventListener("input", (e) => {
    currentQuery = e.target.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(load, 300);
  });
  document.getElementById("roleSelect").addEventListener("change", (e) => { currentRole = e.target.value; load(); });
  if (isAdmin) document.getElementById("addBtn").addEventListener("click", () => openModal());

  async function load() {
    const cols = isAdmin ? 6 : 5;
    const tbody = document.getElementById("rows");
    tbody.innerHTML = `<tr><td colspan="${cols}"><div class="skeleton" style="height:20px;margin:8px 0;"></div></td></tr>`;

    const params = new URLSearchParams();
    if (currentQuery) params.set("q", currentQuery);
    if (currentRole !== "all") params.set("role", currentRole);

    try {
      const data = await api(`/members?${params.toString()}`);
      renderRows(data.users, cols);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="${cols}"><div class="alert alert-error">${escapeHtml(err.message)}</div></td></tr>`;
    }
  }

  function renderRows(users, cols) {
    const tbody = document.getElementById("rows");
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="${cols}"><div class="empty-state"><h4>No members found</h4></div></td></tr>`;
      return;
    }
    tbody.innerHTML = users.map((u) => `
      <tr>
        <td><div style="display:flex;align-items:center;gap:10px;"><div class="avatar" style="width:30px;height:30px;font-size:11px;">${escapeHtml(initials(u.name))}</div><b>${escapeHtml(u.name)}</b></div></td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="status-badge ${escapeHtml(u.role)}">${escapeHtml(u.role)}</span></td>
        <td><span class="status-badge ${escapeHtml(u.status)}">${escapeHtml(u.status)}</span></td>
        <td>${fmtDate(u.created_at)}</td>
        ${isAdmin ? `<td>
          <div class="row-actions">
            <button class="text-link-btn" data-edit="${u.id}">Edit</button>
            <button class="text-link-btn danger" data-delete="${u.id}">Remove</button>
          </div>
        </td>` : ""}
      </tr>
    `).join("");

    if (isAdmin) {
      tbody.querySelectorAll("[data-edit]").forEach((btn) =>
        btn.addEventListener("click", () => openModal(users.find((u) => u.id == btn.dataset.edit)))
      );
      tbody.querySelectorAll("[data-delete]").forEach((btn) =>
        btn.addEventListener("click", () => removeUser(btn.dataset.delete))
      );
    }
  }

  async function removeUser(id) {
    if (!confirm("Remove this account and its loan history? This cannot be undone.")) return;
    try {
      await api(`/members/${id}`, { method: "DELETE" });
      showToast("Account removed.", "success");
      load();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function openModal(existing) {
    const isEdit = !!existing;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>${isEdit ? "Edit account" : "New account"}</h3><button class="modal-close" id="closeModal">&times;</button></div>
        <div class="modal-body">
          <div id="modalAlert"></div>
          <div class="field"><label for="f_name">Full name</label><input id="f_name" value="${escapeHtml(existing?.name || "")}" /></div>
          <div class="field"><label for="f_email">Email</label><input id="f_email" type="email" value="${escapeHtml(existing?.email || "")}" ${isEdit ? "disabled" : ""} /></div>
          ${!isEdit ? `<div class="field"><label for="f_password">Password</label><input id="f_password" type="password" placeholder="At least 6 characters" /></div>` : ""}
          <div class="grid-2">
            <div class="field"><label for="f_role">Role</label>
              <select id="f_role">
                <option value="member" ${existing?.role === "member" ? "selected" : ""}>Member</option>
                <option value="librarian" ${existing?.role === "librarian" ? "selected" : ""}>Librarian</option>
                <option value="admin" ${existing?.role === "admin" ? "selected" : ""}>Admin</option>
              </select>
            </div>
            ${isEdit ? `<div class="field"><label for="f_status">Status</label>
              <select id="f_status">
                <option value="active" ${existing?.status === "active" ? "selected" : ""}>Active</option>
                <option value="suspended" ${existing?.status === "suspended" ? "selected" : ""}>Suspended</option>
              </select>
            </div>` : ""}
          </div>
          <div class="grid-2">
            <div class="field"><label for="f_phone">Phone</label><input id="f_phone" value="${escapeHtml(existing?.phone || "")}" /></div>
            <div class="field"><label for="f_address">Address</label><input id="f_address" value="${escapeHtml(existing?.address || "")}" /></div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" id="cancelModal">Cancel</button>
          <button class="btn btn-primary" id="saveModal">${isEdit ? "Save changes" : "Create account"}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const close = wireModal(backdrop, () => backdrop.remove());
    backdrop.querySelector("#closeModal").addEventListener("click", close);
    backdrop.querySelector("#cancelModal").addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

    backdrop.querySelector("#saveModal").addEventListener("click", async () => {
      const name = document.getElementById("f_name").value.trim();
      const phone = document.getElementById("f_phone").value.trim();
      const address = document.getElementById("f_address").value.trim();
      const role = document.getElementById("f_role").value;

      if (!name) {
        document.getElementById("modalAlert").innerHTML = `<div class="alert alert-error">Name is required.</div>`;
        return;
      }

      try {
        if (isEdit) {
          const status = document.getElementById("f_status").value;
          await api(`/members/${existing.id}`, { method: "PUT", body: { name, phone, address, role, status } });
          showToast("Account updated.", "success");
        } else {
          const email = document.getElementById("f_email").value.trim();
          const password = document.getElementById("f_password").value;
          if (!email || !password) {
            document.getElementById("modalAlert").innerHTML = `<div class="alert alert-error">Email and password are required.</div>`;
            return;
          }
          await api("/members", { method: "POST", body: { name, email, password, role, phone, address } });
          showToast("Account created.", "success");
        }
        close();
        load();
      } catch (err) {
        document.getElementById("modalAlert").innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
      }
    });
  }

  load();
})();
