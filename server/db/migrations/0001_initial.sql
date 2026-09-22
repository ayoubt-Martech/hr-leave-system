-- MartechR HR Leave Management System — Initial Schema
-- Run with: psql $DATABASE_URL -f server/db/migrations/0001_initial.sql

-- ─── Extensions ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('SuperAdmin', 'Manager', 'Employee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE leave_type AS ENUM ('Vacation', 'Emergency', 'Sick Leave', 'Authorization');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE special_leave_type AS ENUM ('Maternity', 'Paternity', 'Bereavement', 'None');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE half_day_type AS ENUM ('AM', 'PM', 'None');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE leave_status AS ENUM (
    'Pending', 'Approved', 'Declined', 'CancellationRequested', 'Cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE holiday_category AS ENUM ('National', 'Religious');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM (
    'leave_submitted', 'leave_approved', 'leave_declined',
    'leave_cancelled', 'cancellation_requested', 'cancellation_approved',
    'cancellation_rejected', 'user_created', 'user_updated', 'user_deleted',
    'user_deactivated', 'user_activated', 'balance_adjusted',
    'settings_updated', 'holiday_added', 'holiday_deleted',
    'accrual_run', 'carry_over_run'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  full_name        TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  position         TEXT NOT NULL DEFAULT 'Team Member',
  role             user_role NOT NULL DEFAULT 'Employee',
  manager_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  initial_balance  NUMERIC(6,2) NOT NULL DEFAULT 18,
  current_balance  NUMERIC(6,2) NOT NULL DEFAULT 18,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  avatar_url       TEXT,
  google_id        TEXT UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

-- users.manager_id is replaced by the employee_managers join table in
-- 0003_multi_manager.sql, which drops the column on re-run. Guard this index
-- so 0001 stays safe to re-run against a database that's already migrated.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'manager_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS users_manager_idx ON users(manager_id);
  END IF;
END $$;

-- ─── auto-update updated_at ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Leave Requests ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS leave_requests (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date            TEXT NOT NULL,   -- YYYY-MM-DD
  end_date              TEXT NOT NULL,
  return_date           TEXT NOT NULL,
  days_count            NUMERIC(5,2) NOT NULL,
  type                  leave_type NOT NULL,
  is_special            BOOLEAN NOT NULL DEFAULT FALSE,
  special_type          special_leave_type DEFAULT 'None',
  half_day_type         half_day_type NOT NULL DEFAULT 'None',
  is_short_authorization BOOLEAN NOT NULL DEFAULT FALSE,
  note                  TEXT NOT NULL DEFAULT '',
  status                leave_status NOT NULL DEFAULT 'Pending',
  reviewed_at           TIMESTAMPTZ,
  reviewed_by           TEXT REFERENCES users(id) ON DELETE SET NULL,
  review_note           TEXT,
  action_reason         TEXT,
  is_legacy_backfill    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leave_requests_user_idx   ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS leave_requests_status_idx ON leave_requests(status);
CREATE INDEX IF NOT EXISTS leave_requests_dates_idx  ON leave_requests(start_date, end_date);

DO $$ BEGIN
  CREATE TRIGGER leave_requests_updated_at
    BEFORE UPDATE ON leave_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Holidays ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS holidays (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  date         TEXT NOT NULL,  -- YYYY-MM-DD
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  category     holiday_category NOT NULL DEFAULT 'National',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS holidays_date_idx ON holidays(date);

-- ─── Settings ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TRIGGER settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Email Alerts ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_alerts (
  id                TEXT PRIMARY KEY,
  recipient_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_email   TEXT NOT NULL,
  recipient_name    TEXT NOT NULL,
  subject           TEXT NOT NULL,
  preview           TEXT NOT NULL,
  leave_request_id  TEXT REFERENCES leave_requests(id) ON DELETE CASCADE,
  action_url        TEXT NOT NULL,
  read              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alerts_recipient_idx ON email_alerts(recipient_id);
CREATE INDEX IF NOT EXISTS alerts_read_idx      ON email_alerts(read);

-- ─── Audit Log ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  actor_id     TEXT,   -- NULL = system/cron job
  actor_email  TEXT,
  action       audit_action NOT NULL,
  target_id    TEXT,
  target_type  TEXT,
  details      TEXT,   -- JSON string
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_actor_idx   ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS audit_action_idx  ON audit_log(action);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at DESC);
