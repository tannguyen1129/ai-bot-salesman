CREATE TABLE IF NOT EXISTS template_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  template_key VARCHAR(160) NOT NULL,
  industry VARCHAR(120),
  role_level VARCHAR(80),
  language VARCHAR(20) NOT NULL DEFAULT 'vi',
  tone VARCHAR(40) NOT NULL DEFAULT 'formal',
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  normalized_body TEXT NOT NULL,
  similarity_score NUMERIC(4,3),
  promoted BOOLEAN NOT NULL DEFAULT FALSE,
  promoted_template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  promoted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_template_candidates_key_created
  ON template_candidates(template_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_candidates_promoted
  ON template_candidates(promoted, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_template_candidates_draft
  ON template_candidates(draft_id);
