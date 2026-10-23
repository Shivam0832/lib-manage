(function () {
  const shell = renderShell("profile");
  if (!shell) return;
  const { content } = shell;
  const user = Auth.getUser();

  setPageHeader("Profile", "Manage your account details and password.");

  content.innerHTML = `
    <div class="split-even">
      <div class="panel">
        <div class="panel-head"><h3>Account details</h3></div>
        <div class="panel-body">
          <div id="infoAlert"></div>
          <div class="field"><label>Full name</label><input id="f_name" value="${escapeHtml(user.name)}" /></div>
          <div class="field"><label>Email</label><input value="${escapeHtml(user.email)}" disabled /></div>
          <div class="field"><label>Role</label><input value="${escapeHtml(user.role)}" disabled style="text-transform:capitalize" /></div>
          <div class="field"><label>Phone</label><input id="f_phone" value="${escapeHtml(user.phone || "")}" /></div>
          <div class="field"><label>Address</label><input id="f_address" value="${escapeHtml(user.address || "")}" /></div>
          <button class="btn btn-primary" id="saveInfo">Save changes</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Change password</h3></div>
        <div class="panel-body">
          <div id="pwAlert"></div>
          <div class="field"><label>Current password</label><input id="f_current" type="password" /></div>
          <div class="field"><label>New password</label><input id="f_new" type="password" placeholder="At least 6 characters" /></div>
          <button class="btn btn-ghost" id="savePassword">Update password</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("saveInfo").addEventListener("click", async () => {
    const name = document.getElementById("f_name").value.trim();
    const phone = document.getElementById("f_phone").value.trim();
    const address = document.getElementById("f_address").value.trim();
    const alertBox = document.getElementById("infoAlert");
    try {
      const data = await api("/auth/me", { method: "PUT", body: { name, phone, address } });
      Auth.setUser(data.user);
      alertBox.innerHTML = `<div class="alert alert-success">Details updated.</div>`;
      showToast("Profile updated.", "success");
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  });

  document.getElementById("savePassword").addEventListener("click", async () => {
    const currentPassword = document.getElementById("f_current").value;
    const newPassword = document.getElementById("f_new").value;
    const alertBox = document.getElementById("pwAlert");
    try {
      await api("/auth/me/password", { method: "PUT", body: { currentPassword, newPassword } });
      alertBox.innerHTML = `<div class="alert alert-success">Password updated.</div>`;
      document.getElementById("f_current").value = "";
      document.getElementById("f_new").value = "";
      showToast("Password updated.", "success");
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  });
})();
