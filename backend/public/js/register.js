(function () {
  if (Auth.getToken()) {
    window.location.href = "/dashboard.html";
    return;
  }

  const form = document.getElementById("registerForm");
  const alertBox = document.getElementById("alertBox");
  const submitBtn = document.getElementById("submitBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertBox.innerHTML = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account…";

    const body = {
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value,
      phone: document.getElementById("phone").value.trim(),
      address: document.getElementById("address").value.trim(),
    };

    try {
      const data = await api("/auth/register", { method: "POST", auth: false, body });
      Auth.setToken(data.token);
      Auth.setUser(data.user);
      window.location.href = "/dashboard.html";
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
      submitBtn.disabled = false;
      submitBtn.textContent = "Create account";
    }
  });
})();
