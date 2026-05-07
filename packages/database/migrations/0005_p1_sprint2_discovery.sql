ALTER TABLE IF EXISTS companies
  ADD COLUMN IF NOT EXISTS search_job_id UUID REFERENCES search_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source VARCHAR(80) NOT NULL DEFAULT 'rapidapi-linkedin',
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS region VARCHAR(120),
  ADD COLUMN IF NOT EXISTS raw_ref_id UUID;

ALTER TABLE IF EXISTS contacts
  ADD COLUMN IF NOT EXISTS search_job_id UUID REFERENCES search_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_status VARCHAR(40) NOT NULL DEFAULT 'unknown';

ALTER TABLE IF EXISTS prospects
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS external_api_requests
  ADD COLUMN IF NOT EXISTS search_job_id UUID REFERENCES search_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_companies_search_job_created
  ON companies(search_job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_search_job_created
  ON contacts(search_job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_api_requests_search_job_created
  ON external_api_requests(search_job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prospects_job_status_created
  ON prospects(search_job_id, status, created_at DESC);

