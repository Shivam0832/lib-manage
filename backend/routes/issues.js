const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

const LOAN_DAYS = 14;
const FINE_PER_DAY = 5; // currency units per day overdue

function daysBetween(a, b) {
  return Math.ceil((b - a) / (1000 * 60 * 60 * 24));
}

function refreshOverdueStatuses() {
  const now = new Date();
  const openIssues = db.prepare("SELECT * FROM issues WHERE status IN ('issued','overdue')").all();
  const update = db.prepare("UPDATE issues SET status = ?, fine_amount = ? WHERE id = ?");
  for (const iss of openIssues) {
    const due = new Date(iss.due_date);
    if (now > due) {
      const overdueDays = daysBetween(due, now);
      const fine = overdueDays * FINE_PER_DAY;
      update.run("overdue", fine, iss.id);
    }
  }
}

// List issues — members see only their own; staff see everyone's.
router.get("/", authenticate, (req, res) => {
  refreshOverdueStatuses();
  const { status } = req.query;

  let sql = `
    SELECT issues.*, books.title AS book_title, books.author AS book_author, books.cover_color,
           users.name AS member_name, users.email AS member_email
    FROM issues
    JOIN books ON books.id = issues.book_id
    JOIN users ON users.id = issues.user_id
    WHERE 1=1`;
  const params = [];

  if (req.user.role === "member") {
    sql += " AND issues.user_id = ?";
    params.push(req.user.id);
  }
  if (status && status !== "all") {
    sql += " AND issues.status = ?";
    params.push(status);
  }

  sql += " ORDER BY issues.issue_date DESC";
  const issues = db.prepare(sql).all(...params);
  res.json({ issues });
});

// Issue a book to a member (staff only)
router.post("/", authenticate, authorize("admin", "librarian"), (req, res) => {
  const { book_id, user_id } = req.body;
  if (!book_id || !user_id) {
    return res.status(400).json({ error: "book_id and user_id are required." });
  }

  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(book_id);
  if (!book) return res.status(404).json({ error: "Book not found." });
  if (book.available_copies < 1) {
    return res.status(400).json({ error: "No copies of this book are currently available." });
  }

  const member = db.prepare("SELECT * FROM users WHERE id = ?").get(user_id);
  if (!member) return res.status(404).json({ error: "Member not found." });

  const already = db
    .prepare("SELECT id FROM issues WHERE book_id = ? AND user_id = ? AND status IN ('issued','overdue')")
    .get(book_id, user_id);
  if (already) {
    return res.status(400).json({ error: "This member already has this book on loan." });
  }

  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + LOAN_DAYS * 24 * 60 * 60 * 1000);

  const tx = db.transaction(() => {
    db.prepare("UPDATE books SET available_copies = available_copies - 1 WHERE id = ?").run(book_id);
    return db
      .prepare("INSERT INTO issues (book_id, user_id, issued_by, issue_date, due_date, status) VALUES (?, ?, ?, ?, ?, 'issued')")
      .run(book_id, user_id, req.user.id, issueDate.toISOString(), dueDate.toISOString());
  });

  const info = tx();
  const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ issue });
});

// Return a book (staff only)
router.put("/:id/return", authenticate, authorize("admin", "librarian"), (req, res) => {
  const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(req.params.id);
  if (!issue) return res.status(404).json({ error: "Loan record not found." });
  if (issue.status === "returned") return res.status(400).json({ error: "This book has already been returned." });

  const now = new Date();
  const due = new Date(issue.due_date);
  const overdueDays = now > due ? daysBetween(due, now) : 0;
  const fine = overdueDays * FINE_PER_DAY;

  const tx = db.transaction(() => {
    db.prepare("UPDATE issues SET status='returned', return_date=?, fine_amount=? WHERE id=?").run(now.toISOString(), fine, issue.id);
    db.prepare("UPDATE books SET available_copies = available_copies + 1 WHERE id = ?").run(issue.book_id);
  });
  tx();

  const updated = db.prepare("SELECT * FROM issues WHERE id = ?").get(issue.id);
  res.json({ issue: updated });
});

router.put("/:id/pay-fine", authenticate, authorize("admin", "librarian"), (req, res) => {
  const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(req.params.id);
  if (!issue) return res.status(404).json({ error: "Loan record not found." });
  db.prepare("UPDATE issues SET fine_paid = 1 WHERE id = ?").run(issue.id);
  res.json({ message: "Fine marked as paid." });
});

module.exports = router;
