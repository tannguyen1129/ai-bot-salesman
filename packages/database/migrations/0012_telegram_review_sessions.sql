-- Track which Telegram message holds the active draft review card,
-- so we can edit/disable the keyboard after an action.
ALTER TABLE drafts
  ADD COLUMN IF NOT EXISTS tg_review_chat_id VARCHAR(60),
  ADD COLUMN IF NOT EXISTS tg_review_message_id BIGINT,
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;

-- Stateful sessions for multi-step actions (edit / reject_reason / approve_confirm)
CREATE TABLE IF NOT EXISTS telegram_review_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  tg_chat_id VARCHAR(60) NOT NULL,
  tg_card_message_id BIGINT,
  tg_prompt_message_id BIGINT,
  intent VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  metadata JSONB,
  created_by VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_telegram_review_sessions_prompt_active
  ON telegram_review_sessions(tg_prompt_message_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_telegram_review_sessions_draft_created
  ON telegram_review_sessions(draft_id, created_at DESC);
