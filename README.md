# Libra — Library Management System

A complete, deployment-ready library management system with role-based
login (**Admin**, **Librarian**, **Member**), a full book catalog,
circulation (issue/return) tracking with automatic overdue fines, and
member management — all in a single Node.js app with no external
database server required.

---

## ✨ Features

| Area | What it does |
|---|---|
| **Authentication** | JWT-based login/register, password hashing (bcrypt), portal-aware login (pick Admin / Librarian / Member) |
| **Role-based access** | Admin, Librarian, and Member each see a tailored dashboard and navigation; permissions enforced server-side, not just hidden in the UI |
| **Catalog** | Search & filter by title/author/ISBN/call number, category, and availability; add/edit/remove books (staff only) |
| **Circulation** | Issue a book to a member, mark returns, automatic 14-day loan period, automatic overdue detection and fine calculation ($5/day), fine payment tracking |
| **Members** | Admins can create/edit/suspend/remove member and staff accounts; librarians can view members to issue books |
| **Dashboards** | Role-specific stats: collection size, active/overdue loans, outstanding fines, most-borrowed titles, recent activity |
| **Profile** | Every user can update their own details and change their password |
| **Design** | Custom "index card" library aesthetic — ink navy + brass palette, Lora/Public Sans typography, fully responsive down to mobile |

---

## 🗂 Project structure

```
library-system/
└── backend/
    ├── server.js            # Express app entry point (serves API + frontend)
    ├── db.js                # SQLite schema + first-run demo data seed
    ├── package.json
    ├── .env.example         # Copy to .env and edit before deploying
    ├── middleware/
    │   └── auth.js          # JWT verification + role guard
    ├── routes/
    │   ├── auth.js          # register / login / me / password
    │   ├── books.js         # catalog CRUD + search
    │   ├── issues.js        # issue / return / fines
    │   ├── members.js       # member & staff account management
    │   └── dashboard.js     # role-aware stats
    └── public/               # static frontend (plain HTML/CSS/JS, no build step)
        ├── login.html / register.html / dashboard.html / books.html
        ├── issues.html / members.html / profile.html
        ├── css/style.css
        └── js/ (api.js, nav.js, and one file per page)
```

The frontend is plain HTML/CSS/JS on purpose: it needs **no build step**,
which makes deployment trivial — one Node process serves both the API
and the static site.

---

## 🚀 Run it locally

Requires **Node.js 18+**.

```bash
cd backend
npm install
cp .env.example .env      # then edit JWT_SECRET to something random
npm start
```

The app will be running at **http://localhost:4000**.

On first run, the SQLite database (`library.db`) is created automatically
and seeded with demo accounts and a starter catalog:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@libra.demo` | `password123` |
| Librarian | `librarian@libra.demo` | `password123` |
| Member | `member@libra.demo` | `password123` |

**Change or remove these before going to production** — see below.

---

## 🔐 Before you deploy: security checklist

1. **Set a real `JWT_SECRET`** in `.env` — a long random string (e.g. `openssl rand -hex 32`). Never use the example value.
2. **Remove or change the demo accounts.** Log in as admin → Members → edit/remove the seeded users, or delete `library.db` before first boot on your production host so it seeds fresh (then immediately change the admin password).
3. Serve over **HTTPS** (any of the platforms below handle this for you automatically).
4. Consider lowering `JWT_EXPIRES_IN` in `.env` if you want shorter login sessions.

---

## 🌍 Deployment options

The app is a single Node process (`npm start`) with a file-based SQLite
database, so it fits almost any Node host. Three easy options:

### Option A — Render.com (free tier available)
1. Push this project to a GitHub repo.
2. On Render: **New → Web Service** → connect the repo, set **Root Directory** to `backend`.
3. Build command: `npm install`  ·  Start command: `npm start`.
4. Add environment variables `JWT_SECRET` and `JWT_EXPIRES_IN` in the Render dashboard.
5. ⚠️ Render's free tier has an ephemeral filesystem — for persistent data across deploys, add a **Render Disk** mounted at `backend/` (or upgrade to a paid plan with a persistent disk) so `library.db` isn't wiped on redeploy.

### Option B — Railway.app
1. Push to GitHub, then **New Project → Deploy from GitHub repo**.
2. Set the root/start directory to `backend`, start command `npm start`.
3. Add a **Volume** mounted at `/app/backend` (or wherever your working directory resolves to) so the SQLite file persists.
4. Set `JWT_SECRET` in the Variables tab.

### Option C — Any VPS (DigitalOcean, EC2, etc.) with PM2
```bash
git clone <your-repo>
cd library-system/backend
npm install --production
cp .env.example .env   # edit JWT_SECRET
npm install -g pm2
pm2 start server.js --name libra
pm2 save
pm2 startup            # follow the printed instructions to run on boot
```
Put Nginx or Caddy in front for HTTPS + a domain name.

> **Note on SQLite in production:** `better-sqlite3` is fast and simple, but it's a single-file database — great for small-to-medium libraries and single-instance deployments. If you outgrow it, the `db.js` file is the only place that would need to change to swap in Postgres/MySQL; every route just calls `db.prepare(...)`, so the migration surface is small.

---

## 🧩 API overview

All endpoints are under `/api` and (except `/api/auth/register` and
`/api/auth/login`) require `Authorization: Bearer <token>`.

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/auth/register` | public — creates a Member account |
| POST | `/api/auth/login` | public |
| GET/PUT | `/api/auth/me` | any logged-in user |
| PUT | `/api/auth/me/password` | any logged-in user |
| GET | `/api/books` | any logged-in user (search via `?q=&category=&availability=`) |
| POST/PUT/DELETE | `/api/books/:id` | admin, librarian |
| GET | `/api/issues` | any (members see only their own) |
| POST | `/api/issues` | admin, librarian — issue a book |
| PUT | `/api/issues/:id/return` | admin, librarian |
| PUT | `/api/issues/:id/pay-fine` | admin, librarian |
| GET | `/api/members` | admin, librarian |
| POST/PUT/DELETE | `/api/members/:id` | admin only |
| GET | `/api/dashboard` | any logged-in user (role-aware payload) |

---

## 🎨 Design notes

The visual identity leans into the subject: an **index-card / card
catalog** motif for book records, an ink-navy + brass/maroon academic
palette (not the generic "cream + terracotta" AI-default look), **Lora**
for display type and **Public Sans** for UI text, with **IBM Plex Mono**
for call numbers and ISBNs to evoke stamped catalog labels.

---

## 🛠 Extending it

- **Reservations table** already exists in the schema (`reservations`) — wire up routes/UI if you want hold-and-notify functionality.
- **Email notifications** for due dates: hook into the `issues` table with a scheduled job (e.g. `node-cron`) and an email provider.
- **Barcode scanning**: the `isbn` and `call_number` fields are ready to be matched against a barcode-scanner input in the Issue modal.
