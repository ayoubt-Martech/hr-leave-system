-- MartechR — Legacy Excel migration support
-- Run with: psql $DATABASE_URL -f server/db/migrations/0002_add_termination_date.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS termination_date TEXT;

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'legacy_import';
