-- Phase 2: track inbound replies on prospect outbound emails.
CREATE TABLE IF NOT EXISTS email_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_history_id UUID REFERENCES email_history(id) ON DELETE SET NULL,
  draft_id UUID REFERENCES drafts(id) ON DELETE SET NULL,
  prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
  from_email VARCHAR(255),
  from_name VARCHAR(255),
  to_email VARCHAR(255),
  subject TEXT,
  body_text TEXT,
  body_html_snippet TEXT,
  in_reply_to VARCHAR(512),
  references_header TEXT,
  imap_uid BIGINT,
  message_id VARCHAR(512),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  alerted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_replies_draft_received
  ON email_replies(draft_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_replies_prospect_received
  ON email_replies(prospect_id, received_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_replies_message_id
  ON email_replies(message_id)
  WHERE message_id IS NOT NULL;

-- Speed up reply lookup by sent Message-ID
CREATE INDEX IF NOT EXISTS idx_email_history_message_id_lookup
  ON email_history(message_id)
  WHERE message_id IS NOT NULL;
