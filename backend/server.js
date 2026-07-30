require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

require("./db"); // initializes + seeds the database on first run

const authRoutes = require("./routes/auth");
const bookRoutes = require("./routes/books");
const memberRoutes = require("./routes/members");
const issueRoutes = require("./routes/issues");
const dashboardRoutes = require("./routes/dashboard");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// --- API routes ---
app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/issues", issueRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// --- Serve the frontend (static site) ---
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// Fallback: any non-API GET request that doesn't match a static file goes to index.html
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// --- Error handler ---
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(PORT, () => {
  console.log(`Libra Library Management System running on http://localhost:${PORT}`);
});
