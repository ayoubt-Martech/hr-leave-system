-- Sick leave proof documents (uploaded by the employee after the leave is approved).
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'leave_attachment_uploaded';

CREATE TABLE IF NOT EXISTS leave_attachments (
  id TEXT PRIMARY KEY,
  leave_request_id TEXT NOT NULL UNIQUE REFERENCES leave_requests(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leave_attachments_request_idx ON leave_attachments(leave_request_id);
