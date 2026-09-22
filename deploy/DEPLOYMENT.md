# MMG-HR — VPS Deployment Guide

## Prerequisites

- Ubuntu 22.04+ VPS
- Node.js 20+, npm
- PostgreSQL 15+
- Nginx
- PM2 (`npm install -g pm2`)
- Certbot for SSL (`apt install certbot python3-certbot-nginx`)

---

## 1. Provision PostgreSQL

```bash
sudo -u postgres psql
CREATE USER mmg_hr_user WITH PASSWORD 'STRONG_PASSWORD_HERE';
CREATE DATABASE mmg_hr OWNER mmg_hr_user;
GRANT ALL PRIVILEGES ON DATABASE mmg_hr TO mmg_hr_user;
\q
```

---

## 2. Clone & configure

```bash
cd /srv
git clone https://github.com/your-org/mmg-hr.git
cd mmg-hr
cp .env.example .env
nano .env   # fill in all required values
```

---

## 3. Install dependencies & build

```bash
npm install
npm run build          # builds frontend → dist/
npm run server:build   # compiles backend → dist-server/
```

---

## 4. Run database migrations & bootstrap your first SuperAdmin

```bash
npm run db:migrate            # creates all tables, enums, indexes
npm run db:bootstrap-admin    # creates the first SuperAdmin from
                               # BOOTSTRAP_SUPERADMIN_EMAIL/NAME in .env
```

Do **not** run `npm run db:seed` here — that inserts fake demo employees
and leave history, and is only meant for local development.

---

## 5. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add **Authorized redirect URI**: `https://hr.martechlabs.io/api/auth/google/callback`
4. Copy `Client ID` and `Client Secret` into `.env`

---

## 6. Configure Nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/mmg-hr
# Edit the server_name and SSL paths to match your domain
sudo nano /etc/nginx/sites-available/mmg-hr
sudo ln -s /etc/nginx/sites-available/mmg-hr /etc/nginx/sites-enabled/mmg-hr
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. Obtain SSL certificate

```bash
sudo certbot --nginx -d hr.martechlabs.io
```

---

## 8. Start with PM2

```bash
npm run start:prod     # runs: pm2 start ecosystem.config.cjs --env production
pm2 save               # persist across reboots
pm2 startup            # print the systemd command and run it
```

---

## 9. Verify

```bash
pm2 status
pm2 logs mmg-hr-api --lines 50
curl https://hr.martechlabs.io/health
```

---

## Useful commands

| Task | Command |
|---|---|
| Rebuild & reload | `npm run build && npm run server:build && pm2 reload mmg-hr-api` |
| View live logs | `pm2 logs mmg-hr-api` |
| Monitor CPU/RAM | `pm2 monit` |
| Run accrual manually | `curl -X POST https://hr.martechlabs.io/api/admin/accrual/run -H "Authorization: Bearer <JWT>"` |
| PostgreSQL shell | `psql $DATABASE_URL` |
| Nginx reload | `sudo systemctl reload nginx` |

---

## Cron jobs (automatic via node-cron inside the API)

| Job | Schedule | Description |
|---|---|---|
| Monthly accrual | 1st of month 00:05 | +1.5 days to all active employees |
| Year-end carry-over | Jan 1st 00:10 | Truncate balances to max 7 days |

Both jobs have a **guard** that checks the `settings` table to prevent double-execution on server restarts.
