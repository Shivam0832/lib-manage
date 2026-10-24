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

  setPageHeader("Members", isAdmin ? "Readers and staff accounts." : "Registered readers.",
    isAdmin ? `<button class="btn btn-primary btn-sm" id="addBtn">${icon("userPlus")}<span class="hide-sm">New account</span></button>` : "");

  let currentQuery = "";
  let currentRole = "all";
  let debounceTimer = null;

  content.innerHTML = `
    <div class="toolbar">
      <div class="search-box">
        ${icon("search")}
        <label for="searchInput" class="sr-only">Search members</label>
        <input type="search" id="searchInput" placeholder="Name or email" />
      </div>
      <select class="select-pill" id="roleSelect" aria-label="Role">
        <option value="all">All roles</option>
        <option value="member">Readers</option>
        <option value="librarian">Librarians</option>
        <option value="admin">Admins</option>
      </select>
    </div>
    <div class="panel">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Name</th><th class="hide-sm">Phone</th><th>Role</th><th>Status</th><th class="hide-sm">Joined</th>${isAdmin ? "<th></th>" : ""}</tr>
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
      tbody.innerHTML = `<tr><td colspan="${cols}"><div class="empty-state"><div class="glyph">${icon("users")}</div><h4>No one matches</h4><p>Try a different name, or show all roles.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = users.map((u) => `
      <tr>
        <td><div class="book-cell"><div class="avatar" style="background:var(--green-soft);color:var(--green)">${escapeHtml(initials(u.name))}</div><div><div class="cell-main">${escapeHtml(u.name)}</div><div class="cell-sub">${escapeHtml(u.email)}</div></div></div></td>
        <td class="hide-sm">${escapeHtml(u.phone || "—")}</td>
        <td>${badge(u.role)}</td>
        <td>${badge(u.status)}</td>
        <td class="hide-sm">${fmtDate(u.created_at)}</td>
        ${isAdmin ? `<td>
          <div class="row-actions">
            <button class="btn btn-quiet btn-sm btn-icon" data-edit="${u.id}" aria-label="Edit ${escapeHtml(u.name)}" title="Edit">${icon("edit")}</button>
            ${u.id !== user.id ? `<button class="btn btn-quiet btn-sm btn-icon" data-delete="${u.id}" aria-label="Remove ${escapeHtml(u.name)}" title="Remove" style="color:var(--stamp)">${icon("trash")}</button>` : ""}
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
          ${!isEdit ? `<div class="field"><label for="f_password">Temporary password</label><input id="f_password" type="password" autocomplete="new-password" /><span class="hint">At least 6 characters. Share it privately.</span></div>` : ""}
          <div class="grid-2">
            <div class="field"><label for="f_role">Role</label>
              <select id="f_role">
                <option value="member" ${existing?.role === "member" ? "selected" : ""}>Reader</option>
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
    enhancePassword(backdrop.querySelector("#f_password"));
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
          showToast(`Saved ${name}'s account.`, "success");
        } else {
          const email = document.getElementById("f_email").value.trim();
          const password = document.getElementById("f_password").value;
          if (!email || !password) {
            document.getElementById("modalAlert").innerHTML = `<div class="alert alert-error">Email and password are required.</div>`;
            return;
          }
          await api("/members", { method: "POST", body: { name, email, password, role, phone, address } });
          showToast(`${name} can now sign in.`, "success");
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
