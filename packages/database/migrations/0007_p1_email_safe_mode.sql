CREATE TABLE IF NOT EXISTS feature_flags (
  key VARCHAR(120) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO feature_flags (key, value, description)
VALUES
  ('enable_external_send', 'false'::jsonb, 'P1 safe mode: false means always redirect outbound email to demo inbox'),
  ('outbound_redirect_target', '"tandtnt18@gmail.com"'::jsonb, 'P1 demo catch-all recipient'),
  ('smtp_allowlist_domains', '["gmail.com", "vnetwork.vn"]'::jsonb, 'Hard allowlist at sender pre-hook for P1')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_job_id UUID REFERENCES search_jobs(id) ON DELETE SET NULL,
  prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  key_person_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  owner_user_id VARCHAR(120),
  scenario_id VARCHAR(120),
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  channel VARCHAR(40) NOT NULL DEFAULT 'email',
  compose_mode VARCHAR(40) NOT NULL DEFAULT 'from_scratch',
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending_review',
  approved_as_is BOOLEAN NOT NULL DEFAULT FALSE,
  edit_count INTEGER NOT NULL DEFAULT 0,
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_drafts_status_created
  ON drafts(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_drafts_owner_status_created
  ON drafts(owner_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS draft_review_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  reviewer_type VARCHAR(40) NOT NULL,
  reviewer_id VARCHAR(120) NOT NULL,
  action VARCHAR(40) NOT NULL,
  old_status VARCHAR(40),
  new_status VARCHAR(40),
  note TEXT,
  patch_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_draft_review_logs_draft_created
  ON draft_review_logs(draft_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID REFERENCES drafts(id) ON DELETE SET NULL,
  sender VARCHAR(255) NOT NULL,
  intended_recipient VARCHAR(255) NOT NULL,
  actual_recipient VARCHAR(255) NOT NULL,
  redirected BOOLEAN NOT NULL DEFAULT TRUE,
  subject TEXT NOT NULL,
  body_html_snapshot TEXT,
  message_id VARCHAR(255),
  status VARCHAR(40) NOT NULL DEFAULT 'queued',
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_history_draft_created
  ON email_history(draft_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_history_message_id
  ON email_history(message_id);

CREATE INDEX IF NOT EXISTS idx_email_history_intended_recipient
  ON email_history(intended_recipient);

CREATE INDEX IF NOT EXISTS idx_email_history_actual_recipient
  ON email_history(actual_recipient);

ALTER TABLE IF EXISTS email_history
  ADD COLUMN IF NOT EXISTS intended_recipient VARCHAR(255),
  ADD COLUMN IF NOT EXISTS actual_recipient VARCHAR(255),
  ADD COLUMN IF NOT EXISTS redirected BOOLEAN DEFAULT TRUE;
