-- Industry classification on report
ALTER TABLE prospect_company_reports
  ADD COLUMN IF NOT EXISTS industry_normalized VARCHAR(60),
  ADD COLUMN IF NOT EXISTS industry_confidence NUMERIC(4,3);

CREATE INDEX IF NOT EXISTS idx_prospect_company_reports_industry_normalized
  ON prospect_company_reports(industry_normalized);

-- Bounce listener: parsed DSN records
CREATE TABLE IF NOT EXISTS bounces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_history_id UUID REFERENCES email_history(id) ON DELETE SET NULL,
  draft_id UUID REFERENCES drafts(id) ON DELETE SET NULL,
  prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
  bounce_type VARCHAR(20) NOT NULL,
  diagnostic_code TEXT,
  status_code VARCHAR(20),
  recipient VARCHAR(255),
  message_id_ref VARCHAR(512),
  imap_uid BIGINT,
  raw_dsn TEXT,
  parsed_payload JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  alerted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bounces_draft_received ON bounces(draft_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounces_recipient_received ON bounces(recipient, received_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bounces_message_id_recipient
  ON bounces(message_id_ref, recipient)
  WHERE message_id_ref IS NOT NULL AND recipient IS NOT NULL;

-- Track on email_history that delivery is bounced
ALTER TABLE email_history
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounce_type VARCHAR(20);

-- Suppression list (BR-20)
CREATE TABLE IF NOT EXISTS email_suppression (
  email VARCHAR(255) PRIMARY KEY,
  reason VARCHAR(40) NOT NULL,
  bounce_count INTEGER NOT NULL DEFAULT 1,
  last_bounce_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  suppressed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_suppression_suppressed_until
  ON email_suppression(suppressed_until);

-- IMAP cursor (track UIDVALIDITY + last UID per mailbox to resume across restarts)
CREATE TABLE IF NOT EXISTS imap_cursors (
  mailbox VARCHAR(120) PRIMARY KEY,
  uid_validity BIGINT,
  last_uid BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
