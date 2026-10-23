const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { authenticate, JWT_SECRET } = require("../middleware/auth");

const router = express.Router();
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

function toPublicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone,
    address: u.address,
    status: u.status,
    created_at: u.created_at,
  };
}

// Public self-registration is always created as a "member".
// Admin/Librarian accounts are provisioned by an admin via /api/members.
router.post("/register", (req, res) => {
  const { name, email, password, phone, address } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email and password are required." });
  }
  if (typeof email !== "string" || typeof password !== "string" || !/^\S+@\S+\.\S+$/.test(email.trim())) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(`INSERT INTO users (name, email, password_hash, role, phone, address) VALUES (?, ?, ?, 'member', ?, ?)`)
    .run(name.trim(), email.toLowerCase().trim(), hash, phone || null, address || null);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: EXPIRES_IN });

  res.status(201).json({ token, user: toPublicUser(user) });
});

router.post("/login", (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email).toLowerCase().trim());
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  if (user.status === "suspended") {
    return res.status(403).json({ error: "This account has been suspended. Contact the library admin." });
  }

  // Optional: the login page lets a person pick which portal they're entering.
  // If they picked a portal that doesn't match their actual role, reject with a clear message.
  if (role && role !== user.role) {
    return res.status(403).json({ error: `This account is registered as ${user.role}, not ${role}. Choose the correct portal.` });
  }

  const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: EXPIRES_IN });
  res.json({ token, user: toPublicUser(user) });
});

router.get("/me", authenticate, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ user: toPublicUser(user) });
});

router.put("/me", authenticate, (req, res) => {
  const { name, phone, address } = req.body;
  db.prepare("UPDATE users SET name = ?, phone = ?, address = ? WHERE id = ?").run(
    (name && String(name).trim()) || req.user.name,
    phone || null,
    address || null,
    req.user.id
  );
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  res.json({ user: toPublicUser(user) });
});

router.put("/me/password", authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);

  if (!bcrypt.compareSync(currentPassword || "", user.password_hash)) {
    return res.status(401).json({ error: "Current password is incorrect." });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, req.user.id);
  res.json({ message: "Password updated successfully." });
});

module.exports = router;
