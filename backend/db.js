const path = require("path");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "library.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','librarian','member')) DEFAULT 'member',
  phone         TEXT,
  address       TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  author         TEXT NOT NULL,
  isbn           TEXT UNIQUE,
  category       TEXT NOT NULL DEFAULT 'General',
  publisher      TEXT,
  published_year INTEGER,
  call_number    TEXT,
  cover_color    TEXT DEFAULT '#1C2541',
  total_copies   INTEGER NOT NULL DEFAULT 1,
  available_copies INTEGER NOT NULL DEFAULT 1,
  description    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS issues (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id      INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_by    INTEGER REFERENCES users(id),
  issue_date   TEXT NOT NULL DEFAULT (datetime('now')),
  due_date     TEXT NOT NULL,
  return_date  TEXT,
  status       TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','returned','overdue')),
  fine_amount  REAL NOT NULL DEFAULT 0,
  fine_paid    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reservations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reserved_at TEXT NOT NULL DEFAULT (datetime('now')),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','cancelled'))
);
`);

// ---------------------------------------------------------------------------
// Seed data (only runs the very first time the DB is created empty)
// ---------------------------------------------------------------------------
const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;

if (userCount === 0) {
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, phone, address)
    VALUES (@name, @email, @password_hash, @role, @phone, @address)
  `);

  const demoUsers = [
    { name: "Ava Whitfield", email: "admin@libra.demo", role: "admin", phone: "+1 555-0101", address: "Head Office" },
    { name: "Marcus Reed", email: "librarian@libra.demo", role: "librarian", phone: "+1 555-0102", address: "Front Desk" },
    { name: "Priya Nair", email: "member@libra.demo", role: "member", phone: "+1 555-0103", address: "12 Elm Street" },
  ];

  const tx = db.transaction((users) => {
    for (const u of users) {
      insertUser.run({
        ...u,
        password_hash: bcrypt.hashSync("password123", 10),
      });
    }
  });
  tx(demoUsers);

  const insertBook = db.prepare(`
    INSERT INTO books (title, author, isbn, category, publisher, published_year, call_number, cover_color, total_copies, available_copies, description)
    VALUES (@title, @author, @isbn, @category, @publisher, @published_year, @call_number, @cover_color, @total_copies, @available_copies, @description)
  `);

  const demoBooks = [
    { title: "The Silent Cartographer", author: "Elena Voss", isbn: "978-1-0001", category: "Fiction", publisher: "Northwind Press", published_year: 2019, call_number: "FIC VOS", cover_color: "#1C2541", total_copies: 4, available_copies: 4, description: "A cartographer maps a city that keeps rearranging itself overnight." },
    { title: "Principles of Thermodynamics", author: "R. K. Sharma", isbn: "978-1-0002", category: "Science", publisher: "Academic House", published_year: 2021, call_number: "SCI SHA", cover_color: "#6B2737", total_copies: 3, available_copies: 3, description: "A rigorous undergraduate introduction to classical and statistical thermodynamics." },
    { title: "Empire of Rust", author: "Daniel Okafor", isbn: "978-1-0003", category: "History", publisher: "Meridian Books", published_year: 2016, call_number: "HIS OKA", cover_color: "#8A6D3B", total_copies: 2, available_copies: 2, description: "The industrial rise and fall of a forgotten steel town." },
    { title: "Gentle Algorithms", author: "Mei Lin", isbn: "978-1-0004", category: "Technology", publisher: "Byte & Bone", published_year: 2023, call_number: "TEC LIN", cover_color: "#2F5233", total_copies: 5, available_copies: 5, description: "An accessible walkthrough of everyday algorithms, without the jargon." },
    { title: "The Last Orchard", author: "Sofia Marchetti", isbn: "978-1-0005", category: "Fiction", publisher: "Northwind Press", published_year: 2020, call_number: "FIC MAR", cover_color: "#1C2541", total_copies: 3, available_copies: 3, description: "Three sisters return to their grandmother's orchard one final autumn." },
    { title: "Cognitive Currents", author: "Dr. Amara Osei", isbn: "978-1-0006", category: "Psychology", publisher: "Academic House", published_year: 2018, call_number: "PSY OSE", cover_color: "#6B2737", total_copies: 2, available_copies: 2, description: "How attention, memory, and emotion quietly steer daily decisions." },
    { title: "Marble and Monsoon", author: "Farah Iqbal", isbn: "978-1-0007", category: "Art", publisher: "Meridian Books", published_year: 2022, call_number: "ART IQB", cover_color: "#8A6D3B", total_copies: 2, available_copies: 2, description: "A photographic study of Mughal architecture through the rainy season." },
    { title: "Systems That Learn", author: "Tomas Nowak", isbn: "978-1-0008", category: "Technology", publisher: "Byte & Bone", published_year: 2024, call_number: "TEC NOW", cover_color: "#2F5233", total_copies: 4, available_copies: 4, description: "A practical tour of machine learning systems in production." },
  ];

  const tx2 = db.transaction((books) => {
    for (const b of books) insertBook.run(b);
  });
  tx2(demoBooks);

  console.log("Seeded database with demo users and books.");
  console.log("  admin@libra.demo / password123");
  console.log("  librarian@libra.demo / password123");
  console.log("  member@libra.demo / password123");
}

module.exports = db;
