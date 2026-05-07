CREATE TABLE IF NOT EXISTS prospect_company_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL UNIQUE REFERENCES prospects(id) ON DELETE CASCADE,
  search_job_id UUID REFERENCES search_jobs(id) ON DELETE CASCADE,
  company_name VARCHAR(255) NOT NULL,
  report_markdown TEXT NOT NULL,
  report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider VARCHAR(40) NOT NULL DEFAULT 'fallback',
  source_count INTEGER NOT NULL DEFAULT 0,
  confidence_score NUMERIC(5,2),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_company_reports_job_generated
  ON prospect_company_reports(search_job_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_prospect_company_reports_provider_generated
  ON prospect_company_reports(provider, generated_at DESC);
