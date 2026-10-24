(function () {
  const shell = renderShell("profile");
  if (!shell) return;
  const { content } = shell;
  const user = Auth.getUser();

  setPageHeader("Account", "Your details and password.");

  content.innerHTML = `
    <div class="split-even">
      <div class="panel">
        <div class="panel-head"><h3>Your details</h3></div>
        <div class="panel-body">
          <div id="infoAlert"></div>
          <div class="row" style="gap:14px;margin-bottom:18px">
            <div class="avatar" style="width:52px;height:52px;font-size:18px;background:var(--green-soft);color:var(--green)">${escapeHtml(initials(user.name))}</div>
            <div><div class="cell-main">${escapeHtml(user.email)}</div><div style="margin-top:4px">${badge(user.role)}</div></div>
          </div>
          <div class="field"><label for="f_name">Full name</label><input id="f_name" autocomplete="name" value="${escapeHtml(user.name)}" /></div>
          <div class="field"><label for="f_phone">Phone</label><input id="f_phone" type="tel" autocomplete="tel" value="${escapeHtml(user.phone || "")}" /></div>
          <div class="field"><label for="f_address">Address</label><input id="f_address" autocomplete="street-address" value="${escapeHtml(user.address || "")}" /></div>
          <button class="btn btn-primary" id="saveInfo">Save changes</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Change password</h3></div>
        <div class="panel-body">
          <div id="pwAlert"></div>
          <div class="field"><label for="f_current">Current password</label><input id="f_current" type="password" autocomplete="current-password" /></div>
          <div class="field"><label for="f_new">New password</label><input id="f_new" type="password" autocomplete="new-password" /><span class="hint">At least 6 characters.</span></div>
          <button class="btn btn-ghost" id="savePassword">Change password</button>
        </div>
      </div>
    </div>
  `;

  enhancePassword(document.getElementById("f_current"));
  enhancePassword(document.getElementById("f_new"));

  document.getElementById("saveInfo").addEventListener("click", async () => {
    const name = document.getElementById("f_name").value.trim();
    const phone = document.getElementById("f_phone").value.trim();
    const address = document.getElementById("f_address").value.trim();
    const alertBox = document.getElementById("infoAlert");
    try {
      const data = await api("/auth/me", { method: "PUT", body: { name, phone, address } });
      Auth.setUser(data.user);
      alertBox.innerHTML = "";
      showToast("Your details are saved.", "success");
      const who = document.querySelector(".who b"); if (who) who.textContent = data.user.name;
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
      alertBox.innerHTML = "";
      document.getElementById("f_current").value = "";
      document.getElementById("f_new").value = "";
      showToast("Password changed.", "success");
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  });
})();
