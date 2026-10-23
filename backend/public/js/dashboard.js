(function () {
  const shell = renderShell("dashboard");
  if (!shell) return;
  const { content } = shell;
  const user = Auth.getUser();

  setPageHeader(`Welcome back, ${user.name.split(" ")[0]}`, "Here's what's happening in the library today.");

  content.innerHTML = `<div class="stat-grid" id="statGrid">${skeletonCards(4)}</div><div id="belowFold"></div>`;

  function skeletonCards(n) {
    return Array.from({ length: n }).map(() => `<div class="stat-card"><div class="skeleton" style="height:14px;width:60%;margin-bottom:12px;"></div><div class="skeleton" style="height:28px;width:40%;"></div></div>`).join("");
  }

  async function load() {
    try {
      const data = await api("/dashboard");
      if (data.role === "member") renderMember(data);
      else renderStaff(data);
    } catch (err) {
      content.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderMember(data) {
    const s = data.stats;
    document.getElementById("statGrid").innerHTML = `
      <div class="stat-card" style="--accent: var(--ink-800)"><div class="label">Active Loans</div><div class="value">${s.activeLoans}</div><div class="delta">Books currently checked out</div></div>
      <div class="stat-card" style="--accent: var(--danger)"><div class="label">Overdue</div><div class="value">${s.overdue}</div><div class="delta">${s.overdue > 0 ? "Please return soon" : "You're all caught up"}</div></div>
      <div class="stat-card" style="--accent: var(--sage)"><div class="label">Total Borrowed</div><div class="value">${s.totalBorrowed}</div><div class="delta">All-time loans</div></div>
      <div class="stat-card" style="--accent: var(--maroon)"><div class="label">Outstanding Fines</div><div class="value">${money(s.outstandingFines)}</div><div class="delta">${s.outstandingFines > 0 ? "Settle at the front desk" : "Nothing owed"}</div></div>
    `;

    const rows = data.recentLoans.length
      ? data.recentLoans.map(rowForLoan).join("")
      : `<tr><td colspan="4"><div class="empty-state"><div class="glyph">${bookIcon()}</div><h4>No loans yet</h4><p>Browse the catalog to borrow your first book.</p></div></td></tr>`;

    document.getElementById("belowFold").innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>Recent loans</h3><a href="/issues.html" class="text-link-btn">View all →</a></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Book</th><th>Issued</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      <div style="margin-top:20px; text-align:center;">
        <a href="/books.html" class="btn btn-brass">Browse the catalog</a>
      </div>
    `;
  }

  function rowForLoan(l) {
    return `<tr>
      <td><b>${escapeHtml(l.book_title)}</b><br><span class="muted" style="font-size:12px">${escapeHtml(l.book_author)}</span></td>
      <td>${fmtDate(l.issue_date)}</td>
      <td>${fmtDate(l.due_date)}</td>
      <td><span class="status-badge ${escapeHtml(l.status)}">${escapeHtml(l.status)}</span></td>
    </tr>`;
  }

  function renderStaff(data) {
    const s = data.stats;
    document.getElementById("statGrid").innerHTML = `
      <div class="stat-card" style="--accent: var(--ink-800)"><div class="label">Total Titles</div><div class="value">${s.totalTitles}</div><div class="delta">${s.totalBooks} copies in collection</div></div>
      <div class="stat-card" style="--accent: var(--sage)"><div class="label">Available Copies</div><div class="value">${s.availableBooks}</div><div class="delta">Ready to be issued</div></div>
      <div class="stat-card" style="--accent: var(--brass)"><div class="label">Active Loans</div><div class="value">${s.activeLoans}</div><div class="delta">${s.overdueLoans} overdue</div></div>
      <div class="stat-card" style="--accent: var(--maroon)"><div class="label">Registered Members</div><div class="value">${s.totalMembers}</div><div class="delta">Outstanding fines: ${money(s.outstandingFines)}</div></div>
    `;

    const issueRows = data.recentIssues.length
      ? data.recentIssues.map((i) => `<tr>
          <td><b>${escapeHtml(i.book_title)}</b></td>
          <td>${escapeHtml(i.member_name)}</td>
          <td>${fmtDate(i.issue_date)}</td>
          <td>${fmtDate(i.due_date)}</td>
          <td><span class="status-badge ${escapeHtml(i.status)}">${escapeHtml(i.status)}</span></td>
        </tr>`).join("")
      : `<tr><td colspan="5"><div class="empty-state"><h4>No circulation activity yet</h4></div></td></tr>`;

    const popularRows = data.popularBooks.map((b) => `
      <div style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--line);">
        <div style="width:34px;height:34px;border-radius:7px;background:${safeColor(b.cover_color)};flex-shrink:0;"></div>
        <div style="min-width:0; flex:1;">
          <div style="font-weight:600; font-size:13.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(b.title)}</div>
          <div class="muted" style="font-size:12px;">${escapeHtml(b.author)}</div>
        </div>
        <div class="eyebrow" style="color:var(--slate)">${b.times_borrowed}× borrowed</div>
      </div>
    `).join("");

    document.getElementById("belowFold").innerHTML = `
      <div class="split-2">
        <div class="panel">
          <div class="panel-head"><h3>Recent circulation</h3><a href="/issues.html" class="text-link-btn">View all →</a></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Book</th><th>Member</th><th>Issued</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>${issueRows}</tbody>
            </table>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Most borrowed</h3></div>
          <div class="panel-body" style="padding-top:6px;">${popularRows || '<p class="muted">No data yet.</p>'}</div>
        </div>
      </div>
    `;
  }

  function bookIcon() {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
  }

  load();
})();
