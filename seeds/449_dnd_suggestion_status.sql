-- seeds/449_dnd_suggestion_status.sql — request-management state for the /dnd suggestions board.
--
-- The board (seeds/418) is the owner's queue of work. This adds:
--   * status  — the lifecycle the owner sorts by: untouched → pending → complete.
--   * user_key — the submitter's synthetic pseudo-login key (e.g. `quick:jacob`), so the owner can
--     see WHO asked (the account handle) alongside author_name, without a real email.
-- Idempotent (safe to re-run). Existing rows default to 'untouched'.
ALTER TABLE dnd_suggestions ADD COLUMN IF NOT EXISTS status   text NOT NULL DEFAULT 'untouched';
ALTER TABLE dnd_suggestions ADD COLUMN IF NOT EXISTS user_key text;

-- Constrain status to the three known states. Dropped-then-added so a re-run picks up any change.
ALTER TABLE dnd_suggestions DROP CONSTRAINT IF EXISTS dnd_suggestions_status_chk;
ALTER TABLE dnd_suggestions ADD  CONSTRAINT dnd_suggestions_status_chk
  CHECK (status IN ('untouched', 'pending', 'complete'));

-- Backfill any legacy NULLs (defensive; the DEFAULT already covers existing rows on add).
UPDATE dnd_suggestions SET status = 'untouched' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_dnd_suggestions_status ON dnd_suggestions (status, created_at DESC);
