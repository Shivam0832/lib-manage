const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");
const { HttpError } = require("../lib/httpError");

const router = express.Router();

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Validate and normalise book fields. Values like published_year and
 * cover_color end up in the page's HTML, so they must be exactly what we
 * expect — a number and a #rrggbb colour — never arbitrary text.
 */
function cleanBook(body, existing = {}) {
  const pick = (k) => (body[k] !== undefined ? body[k] : existing[k]);
  const text = (v) => (v === undefined || v === null ? null : String(v).trim() || null);

  const title = text(pick("title"));
  const author = text(pick("author"));
  if (!title || !author) throw new HttpError(400, "Title and author are required.");

  let year = pick("published_year");
  if (year === "" || year === undefined) year = null;
  if (year !== null) {
    year = Number(year);
    if (!Number.isInteger(year) || year < 0 || year > new Date().getFullYear() + 1) {
      throw new HttpError(400, "Published year must be a valid year.");
    }
  }

  const color = pick("cover_color") || "#1C2541";
  if (!HEX_COLOR.test(color)) throw new HttpError(400, "Spine colour must be a hex colour like #1C2541.");

  const copies = Number(pick("total_copies") ?? 1);
  if (!Number.isInteger(copies) || copies < 1 || copies > 10000) {
    throw new HttpError(400, "Total copies must be a whole number of at least 1.");
  }

  return {
    title,
    author,
    isbn: text(pick("isbn")),
    category: text(pick("category")) || "General",
    publisher: text(pick("publisher")),
    published_year: year,
    call_number: text(pick("call_number")),
    cover_color: color,
    total_copies: copies,
    description: text(pick("description")),
  };
}

// List + search + filter (everyone logged in can browse the catalog)
router.get("/", authenticate, (req, res) => {
  const { q, category, availability } = req.query;

  let sql = "SELECT * FROM books WHERE 1=1";
  const params = [];

  if (q) {
    sql += " AND (title LIKE ? OR author LIKE ? OR isbn LIKE ? OR call_number LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (category && category !== "all") {
    sql += " AND category = ?";
    params.push(category);
  }
  if (availability === "available") {
    sql += " AND available_copies > 0";
  } else if (availability === "unavailable") {
    sql += " AND available_copies = 0";
  }

  sql += " ORDER BY title ASC";
  const books = db.prepare(sql).all(...params);
  res.json({ books });
});

router.get("/categories", authenticate, (req, res) => {
  const rows = db.prepare("SELECT DISTINCT category FROM books ORDER BY category ASC").all();
  res.json({ categories: rows.map((r) => r.category) });
});

router.get("/:id", authenticate, (req, res) => {
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(req.params.id);
  if (!book) return res.status(404).json({ error: "Book not found." });
  res.json({ book });
});

// Only admin/librarian may add, edit, or remove catalog entries.
router.post("/", authenticate, authorize("admin", "librarian"), (req, res) => {
  const b = cleanBook(req.body);
  const info = db
    .prepare(`INSERT INTO books (title, author, isbn, category, publisher, published_year, call_number, cover_color, total_copies, available_copies, description)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(b.title, b.author, b.isbn, b.category, b.publisher, b.published_year, b.call_number, b.cover_color, b.total_copies, b.total_copies, b.description);

  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ book });
});

router.put("/:id", authenticate, authorize("admin", "librarian"), (req, res) => {
  const existing = db.prepare("SELECT * FROM books WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Book not found." });

  const b = cleanBook(req.body, existing);

  // Keep available_copies consistent if total_copies changes
  const onLoan = db.prepare("SELECT COUNT(*) c FROM issues WHERE book_id = ? AND status IN ('issued','overdue')").get(existing.id).c;
  if (b.total_copies < onLoan) {
    throw new HttpError(400, `${onLoan} cop${onLoan === 1 ? "y is" : "ies are"} on loan, so total copies can't be lower than that.`);
  }

  db.prepare(
    `UPDATE books SET title=?, author=?, isbn=?, category=?, publisher=?, published_year=?, call_number=?, cover_color=?, total_copies=?, available_copies=?, description=? WHERE id=?`
  ).run(b.title, b.author, b.isbn, b.category, b.publisher, b.published_year, b.call_number, b.cover_color, b.total_copies, b.total_copies - onLoan, b.description, existing.id);

  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(req.params.id);
  res.json({ book });
});

// Deleting a book also deletes its loan history (ON DELETE CASCADE), so refuse
// while copies are out (issued OR overdue) or fines on it are still unpaid.
router.delete("/:id", authenticate, authorize("admin", "librarian"), (req, res) => {
  const book = db.prepare("SELECT id FROM books WHERE id = ?").get(req.params.id);
  if (!book) throw new HttpError(404, "Book not found.");
  const activeIssue = db.prepare("SELECT id FROM issues WHERE book_id = ? AND status IN ('issued','overdue')").get(book.id);
  if (activeIssue) throw new HttpError(400, "This book has copies currently on loan and cannot be removed.");
  const unpaid = db.prepare("SELECT id FROM issues WHERE book_id = ? AND fine_amount > 0 AND fine_paid = 0").get(book.id);
  if (unpaid) throw new HttpError(400, "There are unpaid fines on this book's loans. Settle them before removing it.");
  db.prepare("DELETE FROM books WHERE id = ?").run(book.id);
  res.json({ message: "Book removed from catalog." });
});

module.exports = router;
