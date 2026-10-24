const db = require("../db");

const LOAN_DAYS = Number(process.env.LOAN_DAYS || 14);
const FINE_PER_DAY = Number(process.env.FINE_PER_DAY || 5); // currency units per day overdue
const DAY_MS = 24 * 60 * 60 * 1000;

const utcDay = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/**
 * Days late = calendar days between the due date and now (minimum 1 once it
 * is late at all). The old formula counted every *started* 24 hours, so a
 * book 3 days and 1 minute late was charged for 4 days.
 */
function fineFor(dueDateIso, at = new Date()) {
  const due = new Date(dueDateIso);
  if (!(at > due)) return 0;
  const daysLate = Math.max(1, Math.round((utcDay(at) - utcDay(due)) / DAY_MS));
  return daysLate * FINE_PER_DAY;
}

const openLoans = db.prepare("SELECT id, due_date, fine_amount, fine_paid FROM issues WHERE status IN ('issued','overdue')");
const markOverdue = db.prepare("UPDATE issues SET status = 'overdue', fine_amount = ?, fine_paid = ? WHERE id = ?");

/**
 * Bring overdue status and running fines up to date. Previously this only ran
 * when someone opened the Circulation page, so dashboards showed stale
 * overdue counts and fines. Call it before anything that reports on loans.
 */
const refreshOverdue = db.transaction(() => {
  const now = new Date();
  for (const loan of openLoans.all()) {
    const fine = fineFor(loan.due_date, now);
    if (fine > 0 && fine !== loan.fine_amount) {
      // A fine that has grown is not paid, whatever an earlier payment said.
      markOverdue.run(fine, fine > loan.fine_amount ? 0 : loan.fine_paid, loan.id);
    }
  }
});

module.exports = { LOAN_DAYS, FINE_PER_DAY, DAY_MS, fineFor, refreshOverdue };
