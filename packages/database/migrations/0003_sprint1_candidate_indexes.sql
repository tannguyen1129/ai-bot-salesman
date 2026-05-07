CREATE INDEX IF NOT EXISTS idx_company_candidates_job_created
  ON company_candidates(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_candidates_job_status
  ON company_candidates(job_id, status, created_at DESC);
