-- seeds/288_user_calculator_state.sql
--
-- C-1 of EXAM_CALCULATORS.md.
--
-- Per-user-per-calculator save state for the approved-exam-calculator
-- modal. Each row holds a JSONB blob of the calculator engine's state
-- (display buffer, memory slots, stack registers, mode flags, scrollback)
-- plus a schema_version field so the engine can migrate older shapes.
--
-- Composite PK on (user_email, model_key) — each user has at most one
-- row per calculator they've used.

CREATE TABLE IF NOT EXISTS public.user_calculator_state (
  user_email   TEXT        NOT NULL,
  model_key    TEXT        NOT NULL,
  state        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_email, model_key)
);

COMMENT ON TABLE public.user_calculator_state IS
  'Saved state for each in-app calculator emulator (Casio fx-115/991, HP 33s/35s, TI-30X/36X). The state JSONB shape is owned by the engine for that model_key; engines include schema_version so older shapes can be migrated on load. Cleared by the user only by clicking "Clear state" in the modal — there is no auto-prune.';

COMMENT ON COLUMN public.user_calculator_state.model_key IS
  'Canonical key per calculator: "casio-fx-991", "casio-fx-115", "hp-33s", "hp-35s", "ti-36x-pro", "ti-30xs-multiview", etc.';

-- ─── updated_at trigger (mirrors the convention used elsewhere) ─────────────
CREATE OR REPLACE FUNCTION public.user_calculator_state_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_calculator_state_updated_at ON public.user_calculator_state;
CREATE TRIGGER trg_user_calculator_state_updated_at
  BEFORE UPDATE ON public.user_calculator_state
  FOR EACH ROW EXECUTE FUNCTION public.user_calculator_state_set_updated_at();

-- ─── Index for "list calculators this user has touched" lookups ────────────
CREATE INDEX IF NOT EXISTS idx_user_calculator_state_user
  ON public.user_calculator_state(user_email);

-- ─── Verification ───────────────────────────────────────────────────────────
-- After applying:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'user_calculator_state'
-- ORDER BY ordinal_position;
--
-- Expect: user_email TEXT NOT NULL, model_key TEXT NOT NULL,
-- state JSONB NOT NULL DEFAULT '{}', updated_at + created_at TIMESTAMPTZ.
--
-- SELECT COUNT(*) FROM user_calculator_state;
-- Expect: 0 on first apply.
