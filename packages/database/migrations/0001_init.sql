CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN undefined_file THEN
    RAISE NOTICE 'pgvector extension is unavailable; continuing without vector extension in this environment.';
END
$$;

CREATE TABLE IF NOT EXISTS icp_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  industries JSONB NOT NULL DEFAULT '[]'::jsonb,
  countries JSONB NOT NULL DEFAULT '[]'::jsonb,
  revenue_min NUMERIC(18,2),
  employee_min INTEGER,
  target_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  pain_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  product_focus JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discovery_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  icp_id UUID NOT NULL REFERENCES icp_profiles(id) ON DELETE CASCADE,
  source VARCHAR(80) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'queued',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  total_found INTEGER NOT NULL DEFAULT 0,
  total_scored INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS external_api_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(80) NOT NULL,
  endpoint TEXT NOT NULL,
  request_hash VARCHAR(128) NOT NULL,
  status_code INTEGER,
  latency_ms INTEGER,
  cost_estimate NUMERIC(12,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, endpoint, request_hash)
);

CREATE TABLE IF NOT EXISTS raw_external_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(80) NOT NULL,
  record_type VARCHAR(80) NOT NULL,
  external_id TEXT,
  request_id UUID REFERENCES external_api_requests(id) ON DELETE SET NULL,
  raw_json JSONB NOT NULL,
  pii_level VARCHAR(30) NOT NULL DEFAULT 'business_contact',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES discovery_jobs(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  linkedin_url TEXT,
  industry VARCHAR(255),
  employee_estimate INTEGER,
  revenue_estimate NUMERIC(18,2),
  score NUMERIC(5,2),
  status VARCHAR(40) NOT NULL DEFAULT 'new',
  source_confidence NUMERIC(5,2),
  source_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  linkedin_url TEXT,
  industry VARCHAR(255),
  revenue_estimate NUMERIC(18,2),
  employee_estimate INTEGER,
  tier VARCHAR(20) DEFAULT 'unclassified',
  owner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(domain),
  UNIQUE(linkedin_url)
);

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  role_category VARCHAR(80),
  linkedin_url TEXT,
  email VARCHAR(255),
  phone VARCHAR(50),
  source VARCHAR(80),
  confidence NUMERIC(5,2),
  consent_status VARCHAR(40) NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, linkedin_url)
);

CREATE TABLE IF NOT EXISTS lead_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES company_candidates(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL,
  score_version VARCHAR(40) NOT NULL DEFAULT 'mvp-v1',
  breakdown_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  channel VARCHAR(40) NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  stage VARCHAR(60) NOT NULL DEFAULT 'new',
  expected_value NUMERIC(18,2),
  probability NUMERIC(5,2),
  close_date DATE,
  owner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_candidates_status_score
  ON company_candidates(status, score DESC);

CREATE INDEX IF NOT EXISTS idx_company_candidates_domain
  ON company_candidates(domain);

CREATE INDEX IF NOT EXISTS idx_contacts_company_role
  ON contacts(company_id, role_category);

CREATE INDEX IF NOT EXISTS idx_lead_scores_candidate
  ON lead_scores(candidate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outreach_status
  ON outreach_messages(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deals_company_stage
  ON deals(company_id, stage);
