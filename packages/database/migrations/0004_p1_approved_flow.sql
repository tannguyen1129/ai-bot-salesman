CREATE TABLE IF NOT EXISTS search_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  industry VARCHAR(120),
  region VARCHAR(120),
  target_role VARCHAR(120),
  source VARCHAR(80) NOT NULL DEFAULT 'manual',
  status VARCHAR(40) NOT NULL DEFAULT 'queued',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_prospects INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_by VARCHAR(120) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw_data_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES search_jobs(id) ON DELETE CASCADE,
  source VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(255),
  raw_json JSONB,
  raw_text TEXT,
  content_hash VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_job_id UUID REFERENCES search_jobs(id) ON DELETE CASCADE,
  company VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  person_name VARCHAR(255) NOT NULL,
  position VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(80),
  industry VARCHAR(120),
  source VARCHAR(80) NOT NULL DEFAULT 'seed',
  confidence NUMERIC(5,2),
  status VARCHAR(40) NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS google_sheet_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id VARCHAR(255),
  row_number INTEGER,
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  sync_status VARCHAR(40) NOT NULL,
  message TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor VARCHAR(120) NOT NULL DEFAULT 'system',
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry VARCHAR(120) NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(industry, version)
);

CREATE INDEX IF NOT EXISTS idx_search_jobs_status_created
  ON search_jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_jobs_keyword
  ON search_jobs USING gin (to_tsvector('simple', keyword));

CREATE INDEX IF NOT EXISTS idx_prospects_job_created
  ON prospects(search_job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prospects_status_created
  ON prospects(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prospects_email
  ON prospects(email);

CREATE INDEX IF NOT EXISTS idx_sync_logs_prospect_created
  ON google_sheet_sync_logs(prospect_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created
  ON audit_logs(entity_type, entity_id, created_at DESC);
