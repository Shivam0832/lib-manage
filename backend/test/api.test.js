// Run with: npm test   (uses a throwaway SQLite file, never your library.db)
const path = require("path");
const os = require("os");
const fs = require("fs");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const DB_FILE = path.join(os.tmpdir(), `libra-test-${process.pid}.db`);
process.env.DB_PATH = DB_FILE;
process.env.JWT_SECRET = "test-secret-that-is-long-enough-123";
process.env.AUTH_RATE_LIMIT = "1000";

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const db = require("../db");

const api = request(app);
const t = {};
const as = (who) => ({ Authorization: `Bearer ${t[who]}` });
const ids = {};

async function login(email) {
  const res = await api.post("/api/auth/login").send({ email, password: "password123" });
  assert.equal(res.status, 200, res.text);
  return res.body;
}

function backdateLoan(id, daysLate) {
  db.prepare("UPDATE issues SET due_date = ? WHERE id = ?").run(new Date(Date.now() - daysLate * 864e5 - 1000).toISOString(), id);
}

before(async () => {
  for (const who of ["admin", "librarian", "member"]) {
    const { token, user } = await login(`${who}@libra.demo`);
    t[who] = token;
    ids[who] = user.id;
  }
});

after(() => {
  db.close();
  for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) fs.rmSync(f, { force: true });
});

test("tokens signed with the old hard-coded secret are rejected", async () => {
  const forged = jwt.sign({ id: 1, role: "admin" }, "dev-secret-change-me");
  assert.equal((await api.get("/api/members").set({ Authorization: `Bearer ${forged}` })).status, 401);
});

test("book fields that reach the page HTML are validated", async () => {
  const bad = [
    { published_year: "<img src=x onerror=alert(1)>" },
    { cover_color: 'red"><img src=x onerror=alert(1)>' },
    { total_copies: "abc" },
  ];
  for (const extra of bad) {
    const r = await api.post("/api/books").set(as("librarian")).send({ title: "T", author: "A", ...extra });
    assert.equal(r.status, 400, JSON.stringify(extra));
  }
});

test("duplicate ISBN is a 409, not a 500", async () => {
  const r = await api.post("/api/books").set(as("librarian")).send({ title: "Dup", author: "A", isbn: "978-1-0001" });
  assert.equal(r.status, 409);
});

test("suspension takes effect immediately and blocks new loans", async () => {
  const reader = await api.post("/api/members").set(as("admin")).send({ name: "Sam", email: "sam@x.com", password: "secret1", role: "member" });
  const samId = reader.body.user.id;
  const { token } = (await api.post("/api/auth/login").send({ email: "sam@x.com", password: "secret1" })).body;

  await api.put(`/api/members/${samId}`).set(as("admin")).send({ status: "suspended" });
  assert.equal((await api.get("/api/books").set({ Authorization: `Bearer ${token}` })).status, 401);
  const issue = await api.post("/api/issues").set(as("librarian")).send({ book_id: 1, user_id: samId });
  assert.equal(issue.status, 400);
});

test("member updates reject bad role/status and protect the last admin", async () => {
  assert.equal((await api.put(`/api/members/${ids.member}`).set(as("admin")).send({ role: "superuser" })).status, 400);
  assert.equal((await api.put(`/api/members/${ids.member}`).set(as("admin")).send({ status: "frozen" })).status, 400);
  assert.equal((await api.put(`/api/members/${ids.admin}`).set(as("admin")).send({ role: "member" })).status, 400);
});

test("total copies can't drop below copies on loan", async () => {
  const r = await api.post("/api/issues").set(as("librarian")).send({ book_id: 2, user_id: ids.member });
  assert.equal(r.status, 201);
  assert.equal((await api.put("/api/books/2").set(as("librarian")).send({ total_copies: 0 })).status, 400);
});

test("dashboard shows overdue loans without visiting Circulation first", async () => {
  const r = await api.post("/api/issues").set(as("librarian")).send({ book_id: 3, user_id: ids.member });
  backdateLoan(r.body.issue.id, 3);
  const dash = await api.get("/api/dashboard").set(as("librarian"));
  assert.ok(dash.body.stats.overdueLoans >= 1);
  assert.ok(dash.body.stats.outstandingFines >= 15);
});

test("fines can only be paid once final, and overdue books can't be deleted", async () => {
  const r = await api.post("/api/issues").set(as("librarian")).send({ book_id: 4, user_id: ids.member });
  const loanId = r.body.issue.id;
  backdateLoan(loanId, 2);
  await api.get("/api/issues").set(as("librarian"));

  assert.equal((await api.put(`/api/issues/${loanId}/pay-fine`).set(as("librarian"))).status, 400, "can't pay while book is out");
  assert.equal((await api.delete("/api/books/4").set(as("librarian"))).status, 400, "overdue book can't be deleted");

  const ret = await api.put(`/api/issues/${loanId}/return`).set(as("librarian"));
  assert.equal(ret.body.issue.fine_amount, 10, "2 days late = 2 × $5");
  assert.equal(ret.body.issue.fine_paid, 0);
  assert.equal((await api.delete("/api/books/4").set(as("librarian"))).status, 400, "unpaid fine blocks delete");
  assert.equal((await api.put(`/api/issues/${loanId}/pay-fine`).set(as("librarian"))).status, 200);
  assert.equal((await api.delete("/api/books/4").set(as("librarian"))).status, 200);
});

test("fine counts calendar days late, not started 24h periods", () => {
  const { fineFor } = require("../lib/circulation");
  const now = new Date("2026-10-23T12:00:00Z");
  assert.equal(fineFor("2026-10-20T11:59:00Z", now), 15, "3 days + 1 minute late = 3 days");
  assert.equal(fineFor("2026-10-23T09:00:00Z", now), 5, "a few hours late = 1 day");
  assert.equal(fineFor("2026-10-24T09:00:00Z", now), 0, "not due yet");
});

test("members see only their own loans", async () => {
  const r = await api.get("/api/issues").set(as("member"));
  assert.ok(r.body.issues.every((i) => i.user_id === ids.member));
  assert.equal((await api.post("/api/issues").set(as("member")).send({ book_id: 1, user_id: ids.member })).status, 403);
});

test("dashboard includes 14-day activity and the overdue list", async () => {
  const staff = await api.get("/api/dashboard").set(as("librarian"));
  assert.equal(staff.body.activity.length, 14);
  assert.ok(staff.body.activity.at(-1).issued >= 1);
  assert.ok(Array.isArray(staff.body.overdueList));
  const member = await api.get("/api/dashboard").set(as("member"));
  assert.ok(Array.isArray(member.body.openLoans));
});
