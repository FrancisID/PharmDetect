# PharmDetect — Pharmaceutical Database Server

Registers medications, generates the numeric Product ID that becomes each item's QR
code, and enforces the scan/purchase detection logic. This service holds **no**
counterfeit data itself — whenever it determines a scan is Counterfeit or Expired, it
reports that finding over HTTP to the separately hosted Counterfeit and Fake
Medication Database (see `../counterfeit-server`). The two services are designed to
be deployed on different hosts, under different operators.

## Setup

```bash
npm install
cp .env.example .env   # set COUNTERFEIT_API_URL to wherever the counterfeit-server is deployed
npm start
```

Listens on `http://localhost:3000` by default. Data lives in `data/pharmaceutical.db`
(SQLite), created automatically on first run.

## Roles

Three roles, in a strict hierarchy — each level can do everything the one below it can:

- **manufacturer** — self-registers via `POST /api/auth/register`, starts `pending`. Once approved, sees and manages only their own medications.
- **admin** — appointed directly by the superuser (not self-registered). Approves/rejects pending manufacturer registrations, and can view/edit/delete **any** medication entry across all manufacturers via `/api/admin/*`.
- **superuser** — exactly one, seeded from `SUPERUSER_EMAIL`/`SUPERUSER_PASSWORD` in `.env` on first boot. This is the developer's own account. Does everything admins can do, plus: appoints new admins, and can deregister (permanently delete) any manufacturer or admin account via `/api/superuser/*`. A superuser cannot delete another superuser through the API, as a safeguard.

**Admin page**: `pharma_admin.html` is the dedicated interface for admins and the superuser — approving registrations, editing/deleting medication entries, and (superuser only) appointing/deregistering admins. Manufacturers should never log into this page; `pharmaceutical_database.html` is theirs.

## Authentication

Set `JWT_SECRET` in `.env` to a long random string (`openssl rand -hex 32`) — this
signs and verifies sessions; changing it invalidates all logged-in sessions. Also set
`SUPERUSER_EMAIL` / `SUPERUSER_PASSWORD` before the very first start — the superuser
account is created automatically once, on first boot, and never again (to change the
credentials later, edit the database directly, or delete that row and restart).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | none | Manufacturer self-registers, starts `pending` |
| POST | `/api/auth/login` | none | Log in (any role); blocked unless account is `approved` |
| GET | `/api/auth/me` | Bearer token | Confirms a token is valid, returns the account |
| GET | `/api/admin/pending-accounts` | admin+ | Manufacturers awaiting approval |
| GET | `/api/admin/accounts` | admin+ | Every manufacturer account, any status |
| POST | `/api/admin/accounts/:id/approve` | admin+ | Approve a pending manufacturer |
| POST | `/api/admin/accounts/:id/reject` | admin+ | Reject a pending manufacturer |
| GET | `/api/admin/medications` | admin+ | Every medication, across all manufacturers |
| PUT | `/api/admin/medications/:productId` | admin+ | Correct any field on any entry |
| DELETE | `/api/admin/medications/:productId` | admin+ | Remove a single erroneous entry |
| GET | `/api/superuser/accounts` | superuser | Every account, any role |
| POST | `/api/superuser/admins` | superuser | Appoint a new admin (pre-approved) |
| DELETE | `/api/superuser/accounts/:id` | superuser | Deregister any manufacturer or admin account |

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/medications` | A pharmaceutical manufacturer registers a medication; generates the unique Product ID |
| GET | `/api/medications` | List **only the logged-in manufacturer's own** medications |
| GET | `/api/medications/:productId` | Look up one medication (public, no auth — used for display lookups) |
| POST | `/api/scan` | Check a scanned Product ID. Returns `COUNTERFEIT`, `EXPIRED`, or `PENDING_PURCHASE`. Relays `COUNTERFEIT`/`EXPIRED` findings to the Counterfeit server automatically. Public — the Detector App has no login. |
| POST | `/api/purchase` | Call only after the buyer confirms. Marks the medication Sold and locks in the first-sale record used for clone detection. Public, same as `/api/scan`. |
| DELETE | `/api/medications` | Clears only the logged-in manufacturer's own medications |

`/api/scan` and `/api/purchase` are intentionally public — the mobile Detector App is
a consumer-facing tool and was never meant to require a manufacturer login. Only the
registration/management endpoints are behind manufacturer authentication.

## Cloned-QR rule

The first confirmed purchase of a Product ID is treated as the authentic sale. Any
later scan of that same ID — a physically cloned QR sticker on a counterfeit bottle —
is reported as Counterfeit, citing the original sale's date and GPS location.

## Connecting to the Counterfeit server

Set `COUNTERFEIT_API_URL` (and `COUNTERFEIT_API_KEY` if that server requires one) in
`.env`. If it's left unset, counterfeit/expired findings are logged to this server's
console but **not** reported anywhere — the app will still tell the user "Do Not Buy",
but the Ministry of Health won't see it. Don't run this in production without it set.
