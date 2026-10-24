const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

require("./db"); // initializes + seeds the database on first run

const authRoutes = require("./routes/auth");
const bookRoutes = require("./routes/books");
const memberRoutes = require("./routes/members");
const issueRoutes = require("./routes/issues");
const dashboardRoutes = require("./routes/dashboard");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // Render/Railway terminate TLS one hop in front

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        // Don't force https sub-requests: that breaks plain-HTTP setups (LAN, a VPS before TLS).
        "upgrade-insecure-requests": null,
      },
    },
  })
);

// The frontend is served from this same app, so CORS is only needed if you
// host the UI elsewhere — list those origins in CORS_ORIGIN.
const origins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
if (origins.length) app.use(cors({ origin: origins }));

app.use(express.json({ limit: "100kb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 20),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// --- API routes ---
app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/issues", issueRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

// --- Serve the frontend (static site) ---
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// Fallback: any non-API GET request that doesn't match a static file goes to index.html
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// --- Error handler ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Request body is not valid JSON." });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
    const field = /books\.isbn/.test(err.message) ? "ISBN" : /users\.email/.test(err.message) ? "email" : "value";
    return res.status(409).json({ error: `That ${field} is already in use.` });
  }
  if (err.code === "SQLITE_CONSTRAINT_CHECK") return res.status(400).json({ error: "One of the values is not allowed." });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

module.exports = app;
