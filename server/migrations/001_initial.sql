CREATE TABLE cases (
  id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  rm_name TEXT NOT NULL,
  days_open INTEGER NOT NULL CHECK (days_open >= 0),
  current_stage TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'Constitutional Documents',
    'Ownership and UBO',
    'Registry Extracts',
    'Authorised Signatories',
    'Other'
  )),
  status TEXT NOT NULL CHECK (status IN ('REQUESTED', 'RECEIVED', 'WAIVED')),
  owner TEXT NOT NULL CHECK (owner IN ('Client', 'Internal')),
  requested_at TEXT NOT NULL,
  chase_round INTEGER NOT NULL CHECK (chase_round BETWEEN 1 AND 3),
  received_at TEXT,
  waived_reason TEXT,
  CHECK (
    (status = 'RECEIVED' AND received_at IS NOT NULL) OR
    (status != 'RECEIVED' AND received_at IS NULL)
  ),
  CHECK (
    (status = 'WAIVED' AND length(trim(waived_reason)) > 0) OR
    (status != 'WAIVED' AND waived_reason IS NULL)
  )
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT NOT NULL REFERENCES cases(id),
  document_id TEXT REFERENCES documents(id),
  reminder_id TEXT,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  actor TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'SCHEDULED', 'SENT')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  schedule_at TEXT,
  sent_at TEXT,
  simulated INTEGER NOT NULL DEFAULT 1 CHECK (simulated = 1),
  CHECK (
    (approved_by IS NULL AND approved_at IS NULL) OR
    (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),
  CHECK (status != 'SCHEDULED' OR (approved_at IS NOT NULL AND schedule_at IS NOT NULL)),
  CHECK (status != 'SENT' OR (approved_at IS NOT NULL AND sent_at IS NOT NULL))
);

CREATE TABLE handoffs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  document_id TEXT NOT NULL REFERENCES documents(id),
  analyst_name TEXT NOT NULL,
  target_rm TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'CLOSED')),
  created_at TEXT NOT NULL
);

CREATE TABLE stage_durations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT NOT NULL REFERENCES cases(id),
  stage TEXT NOT NULL,
  duration_days INTEGER NOT NULL CHECK (duration_days >= 0),
  completed_at TEXT NOT NULL
);

CREATE INDEX documents_case_status_idx ON documents(case_id, status);
CREATE INDEX events_case_time_idx ON events(case_id, occurred_at DESC);
CREATE INDEX events_document_type_idx ON events(document_id, event_type, occurred_at DESC);
CREATE INDEX reminders_status_schedule_idx ON reminders(status, schedule_at);
CREATE INDEX handoffs_case_status_idx ON handoffs(case_id, status);
CREATE INDEX stage_durations_stage_idx ON stage_durations(stage, duration_days);

CREATE TRIGGER events_are_append_only_update
BEFORE UPDATE ON events
BEGIN
  SELECT RAISE(ABORT, 'case events are append-only');
END;

CREATE TRIGGER events_are_append_only_delete
BEFORE DELETE ON events
BEGIN
  SELECT RAISE(ABORT, 'case events are append-only');
END;

PRAGMA user_version = 1;
