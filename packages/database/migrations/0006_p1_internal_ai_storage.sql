CREATE TABLE IF NOT EXISTS prospect_ai_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL UNIQUE REFERENCES prospects(id) ON DELETE CASCADE,
  search_job_id UUID REFERENCES search_jobs(id) ON DELETE CASCADE,
  company_name VARCHAR(255) NOT NULL,
  company_domain VARCHAR(255),
  company_industry VARCHAR(120),
  company_region VARCHAR(120),
  company_summary TEXT,
  key_person_name VARCHAR(255) NOT NULL,
  key_person_title VARCHAR(255),
  key_person_email VARCHAR(255),
  key_person_phone VARCHAR(80),
  key_person_linkedin TEXT,
  confidence_score NUMERIC(5,2),
  source_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshots_count INTEGER NOT NULL DEFAULT 0,
  clean_status VARCHAR(40) NOT NULL DEFAULT 'stored',
  cleaner_mode VARCHAR(40) NOT NULL DEFAULT 'fallback',
  notes TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_ai_profiles_job_updated
  ON prospect_ai_profiles(search_job_id, updated_at DESC);
