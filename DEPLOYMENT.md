# Deploying PharmDetect for MVP testing

This gets you five real, HTTPS-reachable pieces testers can actually use: the two
backend services, the native mobile app (with an on-device QR scanner, not dependent
on the phone's own camera app), and the two browser-based database apps for
manufacturers and the Ministry of Health.

## Why HTTPS matters here specifically

Phone browsers refuse camera access (`getUserMedia`) on plain HTTP. Every host
recommended below gives you HTTPS automatically — don't test camera scanning over
plain `http://`, it will silently fail on real phones even though it may work on
`localhost` during development.

## Step 1 — Deploy the two backend servers

Two ways to do this — pick one:

### Option A: Render Blueprint (simplest)

This repo includes `render.yaml`, a Render Blueprint that deploys both
`pharma-server` and `counterfeit-server` as separate services in one step, each with
its own persistent disk so the SQLite databases survive restarts:

1. Push this whole `pharmdetect/` folder to a GitHub repo.
2. In Render, choose **New > Blueprint** and point it at the repo. It will read
   `render.yaml` and create both services.
3. **Use the paid Starter plan, not the free tier, for this.** Render's free web
   services spin down after 15 minutes of inactivity (slow first request for
   testers) and — more importantly — free services don't get a persistent disk, so
   your data would be wiped on every restart. Starter is ~$7/month per service
   (~$14/month total for both), which is cheap for what an MVP test needs.
4. Render will prompt you for the env vars marked `sync: false` in `render.yaml`:
   - On `pharmdetect-pharma-server`: `SUPERUSER_EMAIL` / `SUPERUSER_PASSWORD` (your
     own developer account — created automatically the first time the server boots,
     and never again after that, so get the password right the first time or plan
     to reset it via the database directly), plus `COUNTERFEIT_API_URL` — the public
     URL Render assigns to `pharmdetect-counterfeit-server` (e.g.
     `https://pharmdetect-counterfeit-server.onrender.com`) — and
     `COUNTERFEIT_API_KEY`, which must be set to the **same value** as the
     auto-generated `API_KEY` on the counterfeit service (copy it from that
     service's Environment tab).
   - On `pharmdetect-counterfeit-server`: its own `SUPERUSER_EMAIL` /
     `SUPERUSER_PASSWORD` (can reuse the same credentials as the pharma server, or
     use different ones — they're two independent accounts on two independent
     servers, same as everything else in this architecture), plus
     `MOH_AGENCY_EMAIL`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `REPORT_FROM`. For a
     quick real test, a Gmail account with an
     [app password](https://support.google.com/accounts/answer/185833) works fine
     as SMTP; for anything beyond a short pilot, use a transactional provider
     (Resend, SendGrid, Postmark all have workable free tiers).
5. Once both are live, hit `https://<your-pharma-service>.onrender.com/api/health`
   and the same for the counterfeit service — both should return `{"ok":true,...}`.

### Option B: Docker (portable to any host)

Each server now has a `Dockerfile`, so you can deploy them to any container host —
Fly.io, a VPS with Docker installed, AWS/GCP/Azure's container services, or your
institution's own infrastructure — not just Render. Build and run each
independently (again, on **separate** hosts for genuine independence):

```bash
cd pharma-server
docker build -t pharmdetect-pharma .
docker run -d -p 3000:3000 \
  -v pharma_data:/data \
  -e COUNTERFEIT_API_URL=https://your-counterfeit-host \
  -e COUNTERFEIT_API_KEY=your-shared-key \
  -e API_KEY=your-pharma-key \
  pharmdetect-pharma
```

```bash
cd counterfeit-server
docker build -t pharmdetect-counterfeit .
docker run -d -p 4000:4000 \
  -v counterfeit_data:/data \
  -e API_KEY=your-shared-key \
  -e MOH_AGENCY_EMAIL=agency@moh.example.gov \
  -e SMTP_HOST=smtp.example.com -e SMTP_USER=... -e SMTP_PASS=... \
  pharmdetect-counterfeit
```

The `-v pharma_data:/data` volume is what makes the SQLite database persist across
container restarts — don't skip it.

**For local testing of both together** (simulating the split architecture on one
machine before you actually split it across two hosts), there's also a
`docker-compose.yml` at the repo root:

```bash
cp pharma-server/.env.example pharma-server/.env      # not read by compose, but keep for reference
cp counterfeit-server/.env.example counterfeit-server/.env
PHARMA_API_KEY=devkey COUNTERFEIT_API_KEY=devkey MOH_AGENCY_EMAIL=you@example.com \
  SMTP_HOST=smtp.example.com SMTP_USER=... SMTP_PASS=... \
  docker compose up --build
```

Both `/api/health` endpoints should then respond on `localhost:3000` and
`localhost:4000`.

*(No Docker or GitHub/Render preference? Railway or Fly.io work too, but neither
currently has an ongoing free tier — expect a small monthly cost either way for
anything that needs to stay up and keep its data for more than a couple of hours.)*

## Step 2 — Build the mobile app

The `mobile-app/` folder is a real Capacitor project with a native ML Kit QR scanner
built in — see `mobile-app/README.md` for the full build guide. Short version:

```bash
cd mobile-app
npm install
# edit DEFAULT_API_BASE_URL near the top of src/main.js to your deployed pharma-server URL
npm run android   # opens Android Studio — needs it installed
npm run ios       # opens Xcode — needs a Mac with Xcode installed
```

This gets you an installable app for real device testing. Publishing it to the App
Store / Play Store is the separate process covered in the earlier mobile-packaging
guidance (developer accounts, signing, store listings) — ask if you want that
revisited now that there's an actual buildable project.

## Step 3 — Point every client at your live servers

Before deploying anything client-side, set where it should connect:

| File | Constant | Should point to |
|---|---|---|
| `mobile-app/src/main.js` | `DEFAULT_API_BASE_URL` | your `pharma-server` URL + `/api` (then run `npm run sync`) |
| `pharmaceutical_database.html` | `DEFAULT_API_BASE_URL` | your `pharma-server` URL + `/api` |
| `pharma_admin.html` | `DEFAULT_API_BASE_URL` | your `pharma-server` URL + `/api` |
| `counterfeit_database.html` | `DEFAULT_API_BASE_URL` | your `counterfeit-server` URL + `/api` |
| `counterfeit_admin.html` | `DEFAULT_API_BASE_URL` | your `counterfeit-server` URL + `/api` |
| `detector_app.html` (standalone browser version, if you're using it alongside the native app) | `DEFAULT_API_BASE_URL` | your `pharma-server` URL + `/api` |

Example: `const DEFAULT_API_BASE_URL = 'https://pharmdetect-pharma-server.onrender.com/api';`

## Step 4 — Host the browser-based apps

These are static files — no server needed. Netlify or Vercel are the fastest paths:

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop) (no account needed
   for a first test) and drag in each HTML file (as its own one-page drop, simplest
   for a quick MVP).
2. **Keep the two admin pages' links private** — `pharma_admin.html` and
   `counterfeit_admin.html` are for you and whoever you appoint as admins, not for
   manufacturers or regular staff. Netlify Drop URLs are unlisted but not
   password-protected, so don't post them anywhere public; share them directly with
   the people who need them.
3. Give the **Pharmaceutical Database** link to manufacturers registering test
   medications, and the **CEP Database** link to whoever's playing regular Ministry
   of Health staff in your pilot.
4. If you also want a quick browser-testable version of the scanner without waiting
   on an Android/iOS build, deploy `detector_app.html` the same way — it's the same
   scan logic as the mobile app's web fallback, just without the native ML Kit engine.

## Step 5 — Smoke-test before inviting real testers

This walks through the full approval chain, not just the scan logic — worth doing
once end to end so you're not debugging permissions live in front of testers.

1. **Log into `pharma_admin.html` with your `SUPERUSER_EMAIL`/`SUPERUSER_PASSWORD`.**
   Confirm the connection badge says "Connected" and the gold-highlighted superuser
   section is visible — that section only appears for the superuser, so seeing it
   confirms the role came through correctly.
2. In a different browser (or incognito window), open `pharmaceutical_database.html`
   and register a test manufacturer account. It should say "awaiting administrator
   approval" — it must **not** let you log in yet.
3. Back in `pharma_admin.html`, refresh the pending list, approve that manufacturer.
   Confirm the manufacturer can now log in on their side.
4. As the manufacturer, register a test medication and note its Product ID (or
   download its QR from the gallery).
5. Install the mobile app build on an actual phone (Step 2), scan that QR, confirm
   you get "ORIGINAL" with Buy/Don't buy, and confirm the small engine badge says
   "native ML Kit" (not "jsQR") — that tells you the on-device scanner is actually
   the one being exercised, not the browser fallback.
6. Tap Buy, then re-scan the same code — confirm it now shows "COUNTERFEIT — DO NOT
   BUY" with the clone message.
7. Log into `counterfeit_admin.html` with the counterfeit-server's superuser
   credentials, and separately open `counterfeit_database.html` — confirm the clone
   you just triggered shows up there. This is the step that proves the cross-server
   relay is actually working in production, not just locally.
8. Back in `counterfeit_admin.html`, appoint a regular admin (superuser-only
   action), then log out and log back in as that new admin — confirm the gold
   superuser section is now hidden for them, and that they can still approve
   pending staff accounts but can't deregister anyone.
9. Use the "Send report now" button in `counterfeit_database.html` to confirm your
   SMTP settings actually deliver an email, before waiting for the real
   weekly/monthly schedule to fire.


## What's genuinely production-ready vs. MVP-only here

Fine for an MVP pilot as-is: the detection logic, the split-server architecture, the
purchase-confirmation gate, the automatic reporting, and the approval-gated
manufacturer/staff registration with superuser oversight.

Worth hardening before a wider or longer-running pilot: set real (non-empty)
`API_KEY` values (the Blueprint auto-generates `API_KEY` but you must copy it across
manually as `COUNTERFEIT_API_KEY`); manufacturer self-registration is currently wide
open (anyone can submit a pending request, though they gain no access until an admin
approves it) — add email verification or an invite code if spam requests become a
problem; consider moving off SQLite to a managed Postgres if you expect meaningful
concurrent write volume; add basic request rate-limiting; and review
data-retention/privacy obligations for the GPS data given wherever your pilot
actually runs.
