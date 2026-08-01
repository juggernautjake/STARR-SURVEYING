-- ============================================================================
-- 502_rate_limits.sql
--
-- A1-1 of docs/planning/in-progress/SURVEYING_BACKEND_ANALYSIS_2026-08-01.md.
--
-- The counter table for the WHOLE app, not just the hobby project living inside
-- it. `dnd_rate_limits` (seed 456) has been throttling 27 D&D routes since
-- 2026-07-28 while the business side — including a public contact form that
-- sends three emails and uploads files per submission — had no limit at all.
--
-- WHY A NEW TABLE RATHER THAN RENAMING THE OLD ONE. Two reasons, and the second
-- is the one that decided it:
--
--   1. Counter rows are EPHEMERAL by construction. Every row belongs to a
--      fixed window that expires, and the sweep deletes anything older than
--      twice the longest window. So there is no data to migrate: the new table
--      simply starts counting, and the old one empties itself. A rename would
--      be a lock on a hot table to preserve rows that are worthless by tomorrow.
--   2. A rename is not reversible in one step if something goes wrong mid-
--      deploy, whereas two tables coexisting for a day is harmless — the worst
--      case is that a caller briefly gets a fresh allowance, which is exactly
--      what the fail-open policy already accepts.
--
-- `dnd_rate_limits` is intentionally left in place. It should be dropped in a
-- later, separate change once nothing references it — dropping it in the same
-- commit that stops writing to it removes the ability to roll back.
--
-- SHAPE IS IDENTICAL to 456 on purpose: the module that reads it is the same
-- module, and a schema that differs "slightly" between two tables one function
-- can address is how a subtle bug gets a home.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.rate_limits (
  -- What is being limited: 'ai', 'write', 'login', 'contact-form', … The set
  -- lives in `lib/rate-limit.ts`; it is deliberately NOT a CHECK constraint,
  -- because adding a bucket should be a code change, not a migration. A typo'd
  -- bucket name costs an unused counter row, which is cheap and self-cleaning.
  bucket        TEXT        NOT NULL,
  -- Who: `user:<uuid>` when signed in, `ip:<addr>` before there is a user.
  subject       TEXT        NOT NULL,
  -- The fixed window this count belongs to.
  window_start  TIMESTAMPTZ NOT NULL,
  count         INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, subject, window_start)
);

COMMENT ON TABLE public.rate_limits IS
  'Fixed-window request counters for the whole app. Rows are ephemeral: each belongs to a window that expires, and lib/rate-limit.ts sweeps anything older than twice the longest window. Supersedes dnd_rate_limits (seed 456).';
COMMENT ON COLUMN public.rate_limits.bucket IS
  'No CHECK constraint on purpose — adding a bucket is a code change, not a migration. A typo costs one unused, self-cleaning row.';

-- The sweep's query. The PK already serves the hot-path lookup.
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits(window_start);

COMMIT;

-- Verification:
--   SELECT count(*) FROM public.rate_limits;   -- 0 until the first request lands
--   -- the PK is what makes the upsert idempotent; prove it:
--   INSERT INTO public.rate_limits (bucket, subject, window_start, count)
--     VALUES ('write','ip:probe', now(), 1);
--   INSERT INTO public.rate_limits (bucket, subject, window_start, count)
--     VALUES ('write','ip:probe', now(), 1);   -- expect: duplicate key violation
--   DELETE FROM public.rate_limits WHERE subject = 'ip:probe';
