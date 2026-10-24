const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");
const { HttpError } = require("../lib/httpError");
const { LOAN_DAYS, FINE_PER_DAY, DAY_MS, fineFor, refreshOverdue } = require("../lib/circulation");

const router = express.Router();

// Loan settings, so the UI doesn't hard-code them.
router.get("/policy", authenticate, (req, res) => {
  res.json({ loanDays: LOAN_DAYS, finePerDay: FINE_PER_DAY });
});

// List issues — members see only their own; staff see everyone's.
router.get("/", authenticate, (req, res) => {
  refreshOverdue();
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
  if (!book_id || !user_id) throw new HttpError(400, "book_id and user_id are required.");

  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(book_id);
  if (!book) throw new HttpError(404, "Book not found.");
  if (book.available_copies < 1) throw new HttpError(400, "No copies of this book are currently available.");

  const member = db.prepare("SELECT * FROM users WHERE id = ?").get(user_id);
  if (!member) throw new HttpError(404, "Member not found.");
  if (member.status !== "active") throw new HttpError(400, `${member.name}'s account is suspended, so books can't be issued to them.`);

  const already = db
    .prepare("SELECT id FROM issues WHERE book_id = ? AND user_id = ? AND status IN ('issued','overdue')")
    .get(book_id, user_id);
  if (already) throw new HttpError(400, "This member already has this book on loan.");

  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + LOAN_DAYS * DAY_MS);

  const info = db.transaction(() => {
    db.prepare("UPDATE books SET available_copies = available_copies - 1 WHERE id = ?").run(book_id);
    return db
      .prepare("INSERT INTO issues (book_id, user_id, issued_by, issue_date, due_date, status) VALUES (?, ?, ?, ?, ?, 'issued')")
      .run(book_id, user_id, req.user.id, issueDate.toISOString(), dueDate.toISOString());
  })();

  const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ issue });
});

// Return a book (staff only). The fine is final once the book is back.
router.put("/:id/return", authenticate, authorize("admin", "librarian"), (req, res) => {
  const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(req.params.id);
  if (!issue) throw new HttpError(404, "Loan record not found.");
  if (issue.status === "returned") throw new HttpError(400, "This book has already been returned.");

  const now = new Date();
  const fine = fineFor(issue.due_date, now);

  db.transaction(() => {
    db.prepare("UPDATE issues SET status='returned', return_date=?, fine_amount=?, fine_paid=? WHERE id=?").run(
      now.toISOString(),
      fine,
      fine > 0 ? 0 : issue.fine_paid,
      issue.id
    );
    db.prepare("UPDATE books SET available_copies = MIN(total_copies, available_copies + 1) WHERE id = ?").run(issue.book_id);
  })();

  const updated = db.prepare("SELECT * FROM issues WHERE id = ?").get(issue.id);
  res.json({ issue: updated });
});

// Settle a fine. Only once the book is returned: while it's still out the
// fine keeps growing, and marking it paid used to hide every later day.
router.put("/:id/pay-fine", authenticate, authorize("admin", "librarian"), (req, res) => {
  const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(req.params.id);
  if (!issue) throw new HttpError(404, "Loan record not found.");
  if (issue.status !== "returned") throw new HttpError(400, "Return the book first — the fine is final only once it's back.");
  if (!(issue.fine_amount > 0)) throw new HttpError(400, "There is no fine on this loan.");
  if (issue.fine_paid) throw new HttpError(400, "This fine has already been paid.");
  db.prepare("UPDATE issues SET fine_paid = 1 WHERE id = ?").run(issue.id);
  res.json({ message: "Fine marked as paid." });
});

module.exports = router;
