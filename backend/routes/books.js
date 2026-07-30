const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

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
  const { title, author, isbn, category, publisher, published_year, call_number, cover_color, total_copies, description } = req.body;

  if (!title || !author) {
    return res.status(400).json({ error: "Title and author are required." });
  }

  const copies = Number(total_copies) > 0 ? Number(total_copies) : 1;

  const info = db
    .prepare(`INSERT INTO books (title, author, isbn, category, publisher, published_year, call_number, cover_color, total_copies, available_copies, description)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      title.trim(),
      author.trim(),
      isbn || null,
      category || "General",
      publisher || null,
      published_year || null,
      call_number || null,
      cover_color || "#1C2541",
      copies,
      copies,
      description || null
    );

  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ book });
});

router.put("/:id", authenticate, authorize("admin", "librarian"), (req, res) => {
  const existing = db.prepare("SELECT * FROM books WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Book not found." });

  const {
    title = existing.title,
    author = existing.author,
    isbn = existing.isbn,
    category = existing.category,
    publisher = existing.publisher,
    published_year = existing.published_year,
    call_number = existing.call_number,
    cover_color = existing.cover_color,
    total_copies = existing.total_copies,
    description = existing.description,
  } = req.body;

  // Keep available_copies consistent if total_copies changes
  const issuedOut = existing.total_copies - existing.available_copies;
  const newAvailable = Math.max(0, Number(total_copies) - issuedOut);

  db.prepare(
    `UPDATE books SET title=?, author=?, isbn=?, category=?, publisher=?, published_year=?, call_number=?, cover_color=?, total_copies=?, available_copies=?, description=? WHERE id=?`
  ).run(title, author, isbn, category, publisher, published_year, call_number, cover_color, total_copies, newAvailable, description, req.params.id);

  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(req.params.id);
  res.json({ book });
});

router.delete("/:id", authenticate, authorize("admin", "librarian"), (req, res) => {
  const activeIssue = db.prepare("SELECT id FROM issues WHERE book_id = ? AND status = 'issued'").get(req.params.id);
  if (activeIssue) {
    return res.status(400).json({ error: "This book has copies currently on loan and cannot be removed." });
  }
  db.prepare("DELETE FROM books WHERE id = ?").run(req.params.id);
  res.json({ message: "Book removed from catalog." });
});

module.exports = router;
