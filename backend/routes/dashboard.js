const express = require("express");
const db = require("../db");
const { authenticate } = require("../middleware/auth");
const { refreshOverdue } = require("../lib/circulation");

const router = express.Router();

router.get("/", authenticate, (req, res) => {
  refreshOverdue(); // so overdue counts and fines are current, not as of the last Circulation visit

  if (req.user.role === "member") {
    const activeLoans = db
      .prepare("SELECT COUNT(*) c FROM issues WHERE user_id=? AND status IN ('issued','overdue')")
      .get(req.user.id).c;
    const overdue = db.prepare("SELECT COUNT(*) c FROM issues WHERE user_id=? AND status='overdue'").get(req.user.id).c;
    const totalBorrowed = db.prepare("SELECT COUNT(*) c FROM issues WHERE user_id=?").get(req.user.id).c;
    const outstandingFines = db
      .prepare("SELECT COALESCE(SUM(fine_amount),0) s FROM issues WHERE user_id=? AND fine_paid=0 AND fine_amount>0")
      .get(req.user.id).s;

    const recentLoans = db
      .prepare(
        `SELECT issues.*, books.title AS book_title, books.author AS book_author, books.cover_color
         FROM issues JOIN books ON books.id = issues.book_id
         WHERE issues.user_id = ? ORDER BY issue_date DESC LIMIT 5`
      )
      .all(req.user.id);

    // Books currently out, soonest due first — the member's "shelf".
    const openLoans = db
      .prepare(
        `SELECT issues.*, books.title AS book_title, books.author AS book_author, books.cover_color, books.call_number
         FROM issues JOIN books ON books.id = issues.book_id
         WHERE issues.user_id = ? AND issues.status IN ('issued','overdue') ORDER BY due_date ASC`
      )
      .all(req.user.id);

    return res.json({
      role: "member",
      stats: { activeLoans, overdue, totalBorrowed, outstandingFines },
      recentLoans,
      openLoans,
    });
  }

  // admin / librarian view
  const totalBooks = db.prepare("SELECT COALESCE(SUM(total_copies),0) c FROM books").get().c;
  const availableBooks = db.prepare("SELECT COALESCE(SUM(available_copies),0) c FROM books").get().c;
  const totalMembers = db.prepare("SELECT COUNT(*) c FROM users WHERE role='member'").get().c;
  const activeLoans = db.prepare("SELECT COUNT(*) c FROM issues WHERE status IN ('issued','overdue')").get().c;
  const overdueLoans = db.prepare("SELECT COUNT(*) c FROM issues WHERE status='overdue'").get().c;
  const totalTitles = db.prepare("SELECT COUNT(*) c FROM books").get().c;
  const outstandingFines = db
    .prepare("SELECT COALESCE(SUM(fine_amount),0) s FROM issues WHERE fine_paid=0 AND fine_amount>0")
    .get().s;

  const recentIssues = db
    .prepare(
      `SELECT issues.*, books.title AS book_title, books.cover_color, users.name AS member_name
       FROM issues JOIN books ON books.id = issues.book_id JOIN users ON users.id = issues.user_id
       ORDER BY issue_date DESC LIMIT 6`
    )
    .all();

  const popularBooks = db
    .prepare(
      `SELECT books.id, books.title, books.author, books.cover_color, COUNT(issues.id) AS times_borrowed
       FROM books LEFT JOIN issues ON issues.book_id = books.id
       GROUP BY books.id ORDER BY times_borrowed DESC LIMIT 5`
    )
    .all();

  // Overdue loans to chase, most overdue first.
  const overdueList = db
    .prepare(
      `SELECT issues.id, issues.due_date, issues.fine_amount, books.title AS book_title, books.cover_color,
              users.name AS member_name, users.email AS member_email, users.phone AS member_phone
       FROM issues JOIN books ON books.id = issues.book_id JOIN users ON users.id = issues.user_id
       WHERE issues.status = 'overdue' ORDER BY issues.due_date ASC LIMIT 6`
    )
    .all();

  // Loans issued and returned per day over the last 14 days (UTC), oldest first.
  const DAYS = 14;
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (DAYS - 1));
  const since = start.toISOString();
  const activity = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), issued: 0, returned: 0 };
  });
  const bump = (iso, key) => {
    const day = activity.find((a) => a.date === String(iso).slice(0, 10));
    if (day) day[key] += 1;
  };
  db.prepare("SELECT issue_date FROM issues WHERE issue_date >= ?").all(since).forEach((r) => bump(r.issue_date, "issued"));
  db.prepare("SELECT return_date FROM issues WHERE return_date >= ?").all(since).forEach((r) => bump(r.return_date, "returned"));

  res.json({
    role: req.user.role,
    stats: { totalBooks, availableBooks, totalTitles, totalMembers, activeLoans, overdueLoans, outstandingFines },
    recentIssues,
    popularBooks,
    overdueList,
    activity,
  });
});

module.exports = router;
