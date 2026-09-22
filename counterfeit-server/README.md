# PharmDetect — Counterfeit and Fake Medication Database Server

An independently hosted service for the Ministry of Health monitoring agency. It has
no knowledge of the Pharmaceutical Database's medication registry — it only receives
findings relayed to it by the Pharmaceutical Database server (`../pharma-server`)
whenever a scan resolves to Counterfeit or Expired, and it emails a periodic report to
the monitoring agency automatically.

**Deploy this on a different host from `pharma-server`.** That separation — not just a
different database file, but a different server under different operational control —
is the point: the agency's counterfeit intelligence should not depend on, or be
reachable through, the manufacturer-facing system.

## Setup

```bash
npm install
cp .env.example .env   # set MOH_AGENCY_EMAIL, SMTP credentials, and API_KEY
npm start
```

Listens on `http://localhost:4000` by default. Data lives in
`data/counterfeit_and_fake_medications.db` (SQLite), created automatically.

Give the `API_KEY` you set here to whoever operates the Pharmaceutical Database server,
so it can authenticate when it relays findings — this is the only credential shared
between the two systems.

## Roles

Three roles, in a strict hierarchy:

- **viewer** — Ministry of Health staff; self-registers via `POST /api/auth/register`, starts `pending`. Once approved, can read the CEP Database and reporting status.
- **admin** — appointed directly by the superuser (not self-registered). Approves/rejects pending staff registrations; can clear the database and trigger an out-of-cycle report.
- **superuser** — exactly one, seeded from `SUPERUSER_EMAIL`/`SUPERUSER_PASSWORD` in `.env` on first boot. This is the developer's own account. Does everything admins can do, plus: appoints new admins, and can deregister (permanently delete) any staff or admin account. A superuser cannot delete another superuser through the API, as a safeguard.

**Admin page**: `counterfeit_admin.html` is the dedicated interface for admins and the superuser. Regular staff should never log into it; `counterfeit_database.html` is theirs.

## Authentication

Two separate authentication mechanisms, for two very different callers:

- **The Pharmaceutical server's relay** (`POST /api/counterfeit-reports`) — a
  service-to-service call, authenticated with the shared `x-api-key` set in `.env`.
  This is the only thing that key protects; it has nothing to do with human logins.
- **Human agency users** (everything else) — real accounts with email/password
  (bcrypt-hashed) and JWT sessions, per the role hierarchy above.

Set `JWT_SECRET` in `.env` to a long random string (`openssl rand -hex 32`). Also set
`SUPERUSER_EMAIL` / `SUPERUSER_PASSWORD` before the very first start — the superuser
account is created automatically once, on first boot, and never again.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | none | Staff self-registers, starts `pending` |
| POST | `/api/auth/login` | none | Log in (any role); blocked unless account is `approved` |
| GET | `/api/auth/me` | Bearer token | Confirms a token is valid, returns the account |
| GET | `/api/admin/pending-accounts` | admin+ | Staff accounts awaiting approval |
| GET | `/api/admin/accounts` | admin+ | Every staff account, any status |
| POST | `/api/admin/accounts/:id/approve` | admin+ | Approve a pending staff account |
| POST | `/api/admin/accounts/:id/reject` | admin+ | Reject a pending staff account |
| GET | `/api/superuser/accounts` | superuser | Every account, any role |
| POST | `/api/superuser/admins` | superuser | Appoint a new admin (pre-approved) |
| DELETE | `/api/superuser/accounts/:id` | superuser | Deregister any staff or admin account |

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/counterfeit-reports` | Service `x-api-key` | Log a finding. Called only by the Pharmaceutical Database server's relay. |
| GET | `/api/counterfeit-reports` | Any agency user | List every flagged medication — the Ministry of Health agency's read view |
| GET | `/api/counterfeit-reports/export.csv` | Any agency user | Download the full log as CSV |
| GET | `/api/counterfeit-reports/status` | Any agency user | Reporting configuration and last-sent status |
| POST | `/api/counterfeit-reports/send-now` | Admin only | Manually trigger a report (for testing) |
| DELETE | `/api/counterfeit-reports` | Admin only | Wipe the database (demo/admin use) |

## Automatic reporting to the Ministry of Health

`services/emailReport.js` runs a daily check via `node-cron`, on the server itself —
independent of any app, browser tab, or the Pharmaceutical Database server being
online. Set `REPORT_FREQUENCY=weekly` (sends every Monday) or `monthly` (sends on the
1st) in `.env`, along with `MOH_AGENCY_EMAIL` and SMTP credentials
(`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`). A `report_log` table prevents the
same period from being reported twice. Until SMTP is configured,
`/api/counterfeit-reports/send-now` still works and returns a preview of the report
body instead of sending it.
