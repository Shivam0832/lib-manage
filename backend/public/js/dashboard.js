(function () {
  const shell = renderShell("dashboard");
  if (!shell) return;
  const { content } = shell;
  const user = Auth.getUser();
  const first = (user.name || "").split(" ")[0];
  const staff = user.role !== "member";

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  setPageHeader(`${greet}, ${first}`, staff ? "Today at the front desk." : "Your books and what's due.",
    staff ? `<a class="btn btn-primary btn-sm" href="/issues.html?new=1">${icon("plus")}<span class="hide-sm">Lend a book</span></a>` : `<a class="btn btn-primary btn-sm" href="/books.html">${icon("search")}<span class="hide-sm">Find a book</span></a>`);

  content.innerHTML = `<div class="stat-grid">${Array.from({ length: 4 }).map(() => `<div class="stat-card"><div class="skeleton" style="height:66px"></div></div>`).join("")}</div><div id="belowFold"></div>`;

  async function load() {
    try {
      const data = await api("/dashboard");
      data.role === "member" ? renderMember(data) : renderStaff(data);
    } catch (err) {
      content.innerHTML = `<div class="alert alert-error">${icon("alert")}${escapeHtml(err.message)}</div>`;
    }
  }

  function tile(label, iconName, value, delta, alert) {
    return `<div class="stat-card${alert ? " is-alert" : ""}"><div class="label">${icon(iconName)}${label}</div><div class="value">${value}</div><div class="delta">${delta}</div></div>`;
  }

  /* ---------- Member ---------- */
  function renderMember(data) {
    const s = data.stats;
    const overdueNote = s.overdue > 0
      ? `<div class="alert alert-error">${icon("alert")}<span>${plural(s.overdue, "book")} overdue. Fines grow by the day until it's back at the desk.</span></div>`
      : "";
    content.innerHTML = `
      ${overdueNote}
      <div class="stat-grid">
        ${tile("On loan", "book", s.activeLoans, s.activeLoans ? "Books you have now" : "Nothing borrowed")}
        ${tile("Overdue", "clock", s.overdue, s.overdue ? "Please return soon" : "All on time", s.overdue > 0)}
        ${tile("Borrowed in total", "library", s.totalBorrowed, "Since you joined")}
        ${tile("Fines owed", "cash", money(s.outstandingFines), s.outstandingFines > 0 ? "Pay at the front desk" : "Nothing owed", s.outstandingFines > 0)}
      </div>

      <section class="section">
        <div class="section-head"><h2>On your shelf</h2><a href="/issues.html">All my loans</a></div>
        ${data.openLoans.length ? `<div class="slips">${data.openLoans.map(slip).join("")}</div>` : `
          <div class="panel"><div class="empty-state"><div class="glyph">${icon("book")}</div><h4>No books on loan</h4><p>Browse the catalog, then ask at the desk to borrow.</p><a class="btn btn-primary" style="margin-top:10px" href="/books.html">Browse the catalog</a></div></div>`}
      </section>

      ${data.recentLoans.length ? `
      <section class="section">
        <div class="section-head"><h2>Recently borrowed</h2></div>
        <div class="panel"><div class="table-wrap"><table class="data-table">
          <thead><tr><th>Book</th><th>Borrowed</th><th>Returned</th><th>Status</th></tr></thead>
          <tbody>${data.recentLoans.map((l) => `<tr>
            <td><div class="book-cell">${miniCover(l.cover_color)}<div><div class="cell-main">${escapeHtml(l.book_title)}</div><div class="cell-sub">${escapeHtml(l.book_author)}</div></div></div></td>
            <td>${fmtDate(l.issue_date)}</td>
            <td>${l.return_date ? fmtDate(l.return_date) : "—"}</td>
            <td>${badge(l.status)}</td>
          </tr>`).join("")}</tbody>
        </table></div></div>
      </section>` : ""}
    `;
  }

  function slip(l) {
    const d = dueInfo(l.due_date);
    return `<article class="slip">
      ${miniCover(l.cover_color)}
      <div style="min-width:0">
        <div class="t">${escapeHtml(l.book_title)}</div>
        <div class="a">${escapeHtml(l.book_author)}</div>
        <div class="stamp ${d.cls}"><small>${d.text}</small><b>${escapeHtml(fmtDate(l.due_date))}</b></div>
        ${l.fine_amount > 0 ? `<div class="due is-late" style="margin-top:8px">Fine so far: ${money(l.fine_amount)}</div>` : ""}
      </div>
    </article>`;
  }

  /* ---------- Staff ---------- */
  function renderStaff(data) {
    const s = data.stats;
    const out = s.totalBooks - s.availableBooks;
    content.innerHTML = `
      ${s.overdueLoans > 0 ? `<div class="alert alert-error">${icon("alert")}<span>${plural(s.overdueLoans, "loan")} overdue, ${money(s.outstandingFines)} in unpaid fines.</span><a href="/issues.html?status=overdue">See overdue</a></div>` : ""}
      <div class="stat-grid">
        ${tile("Titles", "library", s.totalTitles, `${s.totalBooks} ${s.totalBooks === 1 ? "copy" : "copies"} in the collection`)}
        ${tile("On the shelves", "book", s.availableBooks, `${out} out on loan`)}
        ${tile("On loan", "repeat", s.activeLoans, s.overdueLoans ? `${s.overdueLoans} overdue` : "None overdue", s.overdueLoans > 0)}
        ${tile("Members", "users", s.totalMembers, `${money(s.outstandingFines)} fines unpaid`)}
      </div>

      <div class="split-2 section">
        <section class="panel">
          <div class="panel-head"><h3>Loans and returns</h3>
            <div class="legend"><span><i style="background:var(--green)"></i>Lent</span><span><i style="background:var(--brass)"></i>Returned</span></div>
          </div>
          <div class="panel-body">${activityChart(data.activity)}</div>
        </section>
        <section class="panel">
          <div class="panel-head"><h3>Most borrowed</h3><a href="/books.html" style="font-size:13px">Catalog</a></div>
          <div class="panel-body">
            <ol class="rank">${data.popularBooks.map((b, i) => `<li>
              <span class="n">${i + 1}</span>${miniCover(b.cover_color)}
              <span class="t">${escapeHtml(b.title)}</span>
              <span class="c">${plural(b.times_borrowed, "loan")}</span>
            </li>`).join("")}</ol>
          </div>
        </section>
      </div>

      ${data.overdueList.length ? `
      <section class="section">
        <div class="section-head"><h2>Overdue to chase</h2><a href="/issues.html?status=overdue">All overdue</a></div>
        <div class="panel"><div class="table-wrap"><table class="data-table">
          <thead><tr><th>Book</th><th>Member</th><th>Late</th><th>Fine</th><th></th></tr></thead>
          <tbody>${data.overdueList.map((o) => `<tr>
            <td><div class="book-cell">${miniCover(o.cover_color)}<span class="cell-main">${escapeHtml(o.book_title)}</span></div></td>
            <td><div class="cell-main">${escapeHtml(o.member_name)}</div><div class="cell-sub">${escapeHtml(o.member_email)}</div></td>
            <td><span class="due is-late">${dueInfo(o.due_date).text.replace(" overdue", "")}</span></td>
            <td>${money(o.fine_amount)}</td>
            <td><div class="row-actions"><a class="btn btn-ghost btn-sm" href="mailto:${encodeURIComponent(o.member_email)}?subject=${encodeURIComponent(`Overdue: ${o.book_title}`)}">${icon("mail")}Remind</a></div></td>
          </tr>`).join("")}</tbody>
        </table></div></div>
      </section>` : ""}

      <section class="section">
        <div class="section-head"><h2>Latest activity</h2><a href="/issues.html">All loans</a></div>
        <div class="panel"><div class="table-wrap"><table class="data-table">
          <thead><tr><th>Book</th><th>Member</th><th>Lent</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>${data.recentIssues.length ? data.recentIssues.map((i) => `<tr>
            <td><div class="book-cell">${miniCover(i.cover_color)}<span class="cell-main">${escapeHtml(i.book_title)}</span></div></td>
            <td>${escapeHtml(i.member_name)}</td>
            <td>${fmtDate(i.issue_date)}</td>
            <td>${fmtDate(i.due_date)}</td>
            <td>${badge(i.status)}</td>
          </tr>`).join("") : `<tr><td colspan="5"><div class="empty-state"><h4>No loans yet</h4><p>Lend a book and it shows up here.</p></div></td></tr>`}</tbody>
        </table></div></div>
      </section>
    `;
  }

  /** Grouped bars: lent vs returned per day for the last 14 days. */
  function activityChart(days) {
    const W = 560, H = 190, B = 22, T = 8;
    const max = Math.max(2, ...days.map((d) => Math.max(d.issued, d.returned)));
    const step = W / days.length;
    const bw = Math.min(11, step * 0.3);
    const y = (v) => H - B - ((H - B - T) * v) / max;
    const label = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", day: "numeric" });
    const total = days.reduce((n, d) => n + d.issued, 0);
    const bars = days.map((d, i) => {
      const x = i * step + step / 2;
      const tip = `${new Date(`${d.date}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric" })}: ${d.issued} lent, ${d.returned} returned`;
      return `<g><title>${tip}</title>
        <rect class="b-issued" x="${x - bw - 1}" y="${y(d.issued)}" width="${bw}" height="${Math.max(1.5, H - B - y(d.issued))}" rx="3"/>
        <rect class="b-returned" x="${x + 1}" y="${y(d.returned)}" width="${bw}" height="${Math.max(1.5, H - B - y(d.returned))}" rx="3"/>
        ${i % 2 === 1 || i === days.length - 1 ? `<text class="axis" x="${x}" y="${H - 6}" text-anchor="middle">${label(d.date)}</text>` : ""}
      </g>`;
    }).join("");
    const grid = [0, Math.ceil(max / 2), max].map((v) => `<line class="grid" x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}"/>`).join("");
    return `<p class="muted" style="font-size:13px;margin-bottom:8px">${plural(total, "loan")} in the last 14 days</p>
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Books lent and returned per day, last 14 days">${grid}${bars}</svg>`;
  }

  load();
})();
