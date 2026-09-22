# MMG-HR

Leave management and time-off portal for Momentum Marketing Group — leave
requests, approvals, an accrual/carry-over policy engine, a team calendar,
Excel migration from a legacy spreadsheet, and sick-leave proof uploads.

**Stack:** React 19 + Vite frontend, Express + Drizzle ORM + PostgreSQL
backend, JWT auth with Google OAuth (SuperAdmin / Manager / Employee roles).

## Local development

Requires Node.js 20+ and a local PostgreSQL instance.

```bash
npm install
cp .env.local.example .env.local   # fill in your local DB URL, etc.
npm run db:migrate
npm run db:seed                    # optional: demo employees + holidays
npm run dev:all                    # runs API (:4000) + Vite (:3000)
```

`.env.local` sets `VITE_DEV_LOGIN=true`, which enables an email-only login
form in the UI so you don't need real Google OAuth credentials locally.

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev:all` | Runs the API and Vite dev server together |
| `npm run lint` | Type-checks the whole project (`tsc --noEmit`) |
| `npm run build` / `npm run server:build` | Production builds (frontend / backend) |
| `npm run db:migrate` | Applies pending migrations (idempotent, safe to re-run) |
| `npm run db:seed` | Inserts demo employees, holidays, and leave history — **dev only** |
| `npm run db:bootstrap-admin` | Creates the first SuperAdmin from `BOOTSTRAP_SUPERADMIN_EMAIL`/`NAME` in `.env` |

## Production

Two supported paths — pick one:

- **Docker** (recommended): `docker compose up -d --build`. Bundles the app
  with a Postgres container, runs migrations and the SuperAdmin bootstrap
  automatically on every start. See `.env.example` for required variables
  (copy it to `.env` and fill in real values first).
- **VPS with pm2 + Nginx**: see [`deploy/DEPLOYMENT.md`](deploy/DEPLOYMENT.md)
  for the full step-by-step guide (Postgres setup, Nginx config, SSL via
  Certbot, pm2 process management).

Either way, `.env.example` documents every environment variable the app
needs: database connection, JWT secret, Google OAuth credentials, SMTP,
and the first-SuperAdmin bootstrap.
