-- ============================================================================
-- 316_messaging_org_id_default.sql
--
-- Why this exists:
--   The SaaS multi-tenancy pivot (seeds 260–264) added `org_id UUID NOT NULL`
--   to every public tenant table — including `messages`, `conversations`,
--   `conversation_participants`, `message_read_receipts`, `message_reactions`,
--   and `notifications`. The app's messenger send route does NOT write
--   org_id (it predates the pivot and is still single-tenant in code), so
--   every INSERT 500s with:
--
--     23502: null value in column "org_id" of relation "messages"
--           violates not-null constraint
--
--   This blocks the entire messenger flow.
--
-- What this seed does:
--   Sets `DEFAULT '00000000-0000-0000-0000-000000000001'` (the canonical
--   Starr tenant UUID seeded in 261) on `org_id` for every messaging-stack
--   table that has the column. Inserts that omit org_id now auto-fill to
--   Starr's tenant id.
--
--   This is intentionally a short-term shim. Once the API routes are
--   updated to be properly multi-tenant (passing org_id from the session),
--   the DEFAULT can be dropped without affecting historical rows.
--
-- Idempotent — `ALTER COLUMN SET DEFAULT` is safe to re-run; the column
-- existence checks wrap it in a DO so a missing org_id column on a fresh
-- table doesn't error out the migration.
-- ============================================================================

BEGIN;

-- Helper that sets the default + nothing else, gated on column existence.
-- Inlined as a DO block per table so a missing column doesn't abort the
-- transaction. The constant is Starr's canonical tenant id from seed 261.

DO $$
DECLARE
  starr UUID := '00000000-0000-0000-0000-000000000001';
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
    'messages',
    'conversations',
    'conversation_participants',
    'message_read_receipts',
    'message_reactions',
    'notifications'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t
        AND column_name = 'org_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN org_id SET DEFAULT %L::UUID',
        t, starr
      );
      -- Also backfill any NULL rows that pre-date the default + constraint,
      -- so a future ALTER COLUMN org_id SET NOT NULL (or re-validation) is
      -- guaranteed to pass.
      EXECUTE format(
        'UPDATE public.%I SET org_id = %L::UUID WHERE org_id IS NULL',
        t, starr
      );
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────
-- Confirm the default landed on every table that has org_id:
--   SELECT table_name, column_default
--   FROM information_schema.columns
--   WHERE table_schema='public' AND column_name='org_id'
--     AND table_name IN ('messages','conversations','conversation_participants',
--                        'message_read_receipts','message_reactions','notifications')
--   ORDER BY table_name;
--
-- All rows should show
--   column_default = '00000000-0000-0000-0000-000000000001'::uuid
--
-- Then run a test send from the messenger and verify:
--   SELECT count(*) FROM public.messages;  -- > 0
