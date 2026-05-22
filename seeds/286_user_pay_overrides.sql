-- seeds/286_user_pay_overrides.sql
--
-- P-15 of PAY_PROGRESSION_OVERHAUL.md.
--
-- Per-user pay override table. Each row is an admin-applied exception
-- to the default pay system for a single employee. A user can have
-- multiple historical overrides (one per effective_date); the
-- "currently active" override is the most-recent row where
-- effective_date <= today AND (expires_at IS NULL OR expires_at > today).
--
-- Override semantics (per §3.1 of the plan):
--   fixed_rate            — if set, ignores the formula entirely
--   role_bonus_multiplier — scales the role bonus (1.0 = no change)
--   seniority_multiplier  — scales the seniority bonus (1.0 = no change)
--   flat_addition         — $/hr added on top (default 0)
--   reason                — required when any override field is non-default
--   approved_by           — admin email for audit
--
-- Idempotent: re-running drops nothing, only adds.

-- ─── Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_pay_overrides (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email            TEXT NOT NULL,
  fixed_rate            NUMERIC(10,2),
  role_bonus_multiplier NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  seniority_multiplier  NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  flat_addition         NUMERIC(10,2) NOT NULL DEFAULT 0,
  reason                TEXT,
  effective_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at            DATE,
  approved_by           TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A non-default override must explain itself.
  CONSTRAINT user_pay_overrides_reason_required CHECK (
    reason IS NOT NULL OR (
      fixed_rate IS NULL
      AND role_bonus_multiplier = 1.0
      AND seniority_multiplier  = 1.0
      AND flat_addition         = 0
    )
  ),
  -- Sanity on the multipliers (0 → strip the bonus, 2 → double it; cap at 2).
  CONSTRAINT user_pay_overrides_role_mult_range CHECK (role_bonus_multiplier BETWEEN 0 AND 2),
  CONSTRAINT user_pay_overrides_sen_mult_range  CHECK (seniority_multiplier  BETWEEN 0 AND 2),
  -- expires_at, if set, must be on or after effective_date.
  CONSTRAINT user_pay_overrides_date_order CHECK (expires_at IS NULL OR expires_at >= effective_date)
);

-- ─── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_pay_overrides_user
  ON public.user_pay_overrides(user_email);
CREATE INDEX IF NOT EXISTS idx_user_pay_overrides_effective
  ON public.user_pay_overrides(user_email, effective_date DESC);

-- ─── updated_at trigger (mirrors the convention used elsewhere) ─────────────
CREATE OR REPLACE FUNCTION public.user_pay_overrides_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_pay_overrides_updated_at ON public.user_pay_overrides;
CREATE TRIGGER trg_user_pay_overrides_updated_at
  BEFORE UPDATE ON public.user_pay_overrides
  FOR EACH ROW EXECUTE FUNCTION public.user_pay_overrides_set_updated_at();

-- ─── Helper view: currently-active override per user ────────────────────────
-- Lets the rate calculator do a single lookup instead of computing the
-- active row in app code. The DISTINCT ON picks the most recent
-- effective_date that's already in effect, ignoring expired rows.
CREATE OR REPLACE VIEW public.user_pay_overrides_current AS
SELECT DISTINCT ON (user_email)
  user_email,
  id,
  fixed_rate,
  role_bonus_multiplier,
  seniority_multiplier,
  flat_addition,
  reason,
  effective_date,
  expires_at,
  approved_by,
  created_at,
  updated_at
FROM public.user_pay_overrides
WHERE effective_date <= CURRENT_DATE
  AND (expires_at IS NULL OR expires_at > CURRENT_DATE)
ORDER BY user_email, effective_date DESC;

COMMENT ON VIEW public.user_pay_overrides_current IS
  'Currently-active per-user pay override (most recent effective_date that has not yet expired). Used by the effective-rate calculator in lib/payroll/effective-rate.ts (P-16) so the lookup is a single row read.';

-- ─── Verification ───────────────────────────────────────────────────────────
-- Run after applying:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'user_pay_overrides'
-- ORDER BY ordinal_position;
--
-- Expect: 11 columns including id (uuid), user_email (text), the 4 override
-- fields, reason, effective_date, expires_at, approved_by, created_at,
-- updated_at.
--
-- SELECT * FROM user_pay_overrides_current;
--
-- Expect: zero rows on first run (no overrides applied yet). The view
-- materializes the "currently active" row per user once admins start
-- using the override panel in P-17.
