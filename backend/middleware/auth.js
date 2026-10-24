const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../db");

/**
 * The old code fell back to a hard-coded secret, so any deployment that
 * forgot JWT_SECRET accepted tokens anyone could forge (including admin).
 * Now: production refuses to start without a real secret; local dev gets a
 * random one per boot (you'll just need to sign in again after a restart).
 */
const WEAK = ["", "change-this-to-a-long-random-secret-before-deploying", "dev-secret-change-me"];
let JWT_SECRET = process.env.JWT_SECRET || "";
if (WEAK.includes(JWT_SECRET) || JWT_SECRET.length < 16) {
  if (process.env.NODE_ENV === "production") {
    console.error("JWT_SECRET is missing or weak. Set a long random value (openssl rand -hex 32) and restart.");
    process.exit(1);
  }
  console.warn("[WARN] JWT_SECRET missing or the example value — using a random per-boot secret (dev only).");
  JWT_SECRET = crypto.randomBytes(32).toString("hex");
}

const findUser = db.prepare("SELECT id, name, email, role, status FROM users WHERE id = ?");

/**
 * Verifies the token, then re-reads the user so that suspending an account,
 * changing its role or deleting it takes effect immediately — not when the
 * 7-day token expires.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required. Please log in." });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: "Your session has expired. Please log in again." });
  }

  const user = findUser.get(payload.id);
  if (!user) return res.status(401).json({ error: "This account no longer exists." });
  if (user.status !== "active") {
    return res.status(401).json({ error: "This account has been suspended. Contact the library admin." });
  }
  req.user = { id: user.id, role: user.role, name: user.name, email: user.email };
  next();
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to perform this action." });
    }
    next();
  };
}

module.exports = { authenticate, authorize, JWT_SECRET };
