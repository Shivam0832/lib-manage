const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

function toPublicUser(u) {
  const { password_hash, ...rest } = u;
  return rest;
}

// Librarians can view members (to issue books to them); only admins manage accounts.
router.get("/", authenticate, authorize("admin", "librarian"), (req, res) => {
  const { q, role } = req.query;
  let sql = "SELECT * FROM users WHERE 1=1";
  const params = [];

  if (q) {
    sql += " AND (name LIKE ? OR email LIKE ?)";
    params.push(`%${q}%`, `%${q}%`);
  }
  if (role && role !== "all") {
    sql += " AND role = ?";
    params.push(role);
  }
  sql += " ORDER BY created_at DESC";

  const users = db.prepare(sql).all(...params).map(toPublicUser);
  res.json({ users });
});

router.get("/:id", authenticate, authorize("admin", "librarian"), (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Member not found." });
  res.json({ user: toPublicUser(user) });
});

// Admins can create staff (librarian) or member accounts directly.
router.post("/", authenticate, authorize("admin"), (req, res) => {
  const { name, email, password, role, phone, address } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "Name, email, password and role are required." });
  }
  if (!["admin", "librarian", "member"].includes(role)) {
    return res.status(400).json({ error: "Role must be admin, librarian, or member." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: "An account with this email already exists." });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (name, email, password_hash, role, phone, address) VALUES (?, ?, ?, ?, ?, ?)")
    .run(name.trim(), email.toLowerCase().trim(), hash, role, phone || null, address || null);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ user: toPublicUser(user) });
});

router.put("/:id", authenticate, authorize("admin"), (req, res) => {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Member not found." });

  const { name = existing.name, phone = existing.phone, address = existing.address, role = existing.role, status = existing.status } = req.body;

  db.prepare("UPDATE users SET name=?, phone=?, address=?, role=?, status=? WHERE id=?").run(
    name, phone, address, role, status, req.params.id
  );

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  res.json({ user: toPublicUser(user) });
});

router.delete("/:id", authenticate, authorize("admin"), (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: "You cannot delete your own account." });
  }
  const activeLoan = db.prepare("SELECT id FROM issues WHERE user_id = ? AND status IN ('issued','overdue')").get(req.params.id);
  if (activeLoan) {
    return res.status(400).json({ error: "This member still has books on loan and cannot be removed." });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ message: "Member removed." });
});

module.exports = router;
