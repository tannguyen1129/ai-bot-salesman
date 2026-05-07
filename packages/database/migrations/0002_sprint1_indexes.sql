CREATE INDEX IF NOT EXISTS idx_icp_profiles_active_created
  ON icp_profiles(is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_jobs_status_created
  ON discovery_jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_jobs_icp_created
  ON discovery_jobs(icp_id, created_at DESC);
