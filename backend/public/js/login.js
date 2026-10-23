(function () {
  // Already logged in? go straight to dashboard.
  if (Auth.getToken()) {
    window.location.href = "/dashboard.html";
    return;
  }

  let selectedRole = "member";
  const tabs = document.querySelectorAll(".role-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      selectedRole = tab.dataset.role;
    });
  });

  const form = document.getElementById("loginForm");
  const alertBox = document.getElementById("alertBox");
  const submitBtn = document.getElementById("submitBtn");

  // Why were we sent here? (session expired, account suspended…)
  try {
    const notice = sessionStorage.getItem("libra_notice");
    if (notice) {
      alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(notice)}</div>`;
      sessionStorage.removeItem("libra_notice");
    }
  } catch { /* ignore */ }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertBox.innerHTML = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      const data = await api("/auth/login", {
        method: "POST",
        auth: false,
        body: { email, password, role: selectedRole },
      });
      Auth.setToken(data.token);
      Auth.setUser(data.user);
      window.location.href = "/dashboard.html";
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign in";
    }
  });
})();
