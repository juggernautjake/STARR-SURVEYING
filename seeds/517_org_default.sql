-- seeds/517_org_default.sql — who owns a row nobody was signed in to create (audit item 8g).
--
-- Seed 513 put a nullable `org_id` on the business tables and backfilled the existing rows. Item 8g
-- makes the app FILTER on that column: a signed-in session reads its own firm's rows and stamps its
-- firm onto the rows it writes.
--
-- That leaves one gap, and it is the kind that does not announce itself. Plenty of rows in this system
-- are written with no session at all:
--
--   · Stripe webhooks         → payments, payment_intents, invoices, balance_transactions
--   · cron jobs               → notifications, error_reports, research_batch_jobs
--   · the public pay portal   → payment_attempts, payment_receipts
--
-- None of those has a session, so none of them can be stamped by the application. Their rows would
-- land with `org_id IS NULL`, and a NULL row does not match `WHERE org_id = <firm>` — so the payment
-- a customer just made would be invisible on the very screen that exists to show it. The filter would
-- be working perfectly and the data would look lost.
--
-- ── SO THE DEFAULT LIVES IN THE DATABASE, WHERE THE SESSION-LESS WRITER STILL REACHES IT ─────────
--
-- Seed 513 argued against `NOT NULL DEFAULT <starr>`, and that argument still stands in full: a
-- literal default silently stamps every future row with Starr *including rows a second customer's
-- code inserts*, which is the exact bug multi-tenancy exists to prevent. What makes a default correct
-- here and wrong there is the guard, which is the same one 513 used for its backfill:
--
--   **A default is only applied while there is exactly ONE organisation.** With one firm, "which firm
--   does this row belong to" has one answer and it is not a guess. With two, it is a guess, and a
--   guess about which customer owns a row is the worst kind of wrong — silent, plausible, and
--   discovered by the other customer.
--
-- ── AND IT UNDOES ITSELF ────────────────────────────────────────────────────────────────────────
--
-- The failure mode of a guarded default is that nobody remembers to remove it. So this file does not
-- only skip when a second org exists — it **drops every default it previously set**. Re-running it at
-- any time leaves the database in the state its org count actually justifies, which turns "someone
-- must remember on onboarding day" into "run the seeds", a thing that already happens.
--
-- `scripts/verify-org-scoped-tables.mjs` fails loudly if the two ever disagree.
--
-- The column stays NULLABLE either way. A default answers "what if nobody said"; NOT NULL would
-- forbid ever saying "no firm", and platform-level rows legitimately need to.
--
-- ── AND THE ROWS THAT ARE ALREADY UNOWNED ───────────────────────────────────────────────────────
--
-- Seed 513's backfill iterated the 73 tables it had just ADDED the column to. The ~54 tables that
-- already carried `org_id` from the earlier SaaS work were never in that list and were never
-- backfilled — which nobody could see, because nothing filtered on the column yet.
--
-- Turning the filter on is what makes it visible, and it found two: `customers` (4 rows) and
-- `file_nodes` (6 rows — every row the File Explorer has). Both would have vanished from their own
-- pages the moment 8g shipped, with the app working perfectly and the data apparently gone. So the
-- backfill here covers **every** table carrying the column, under the same one-organisation guard.

BEGIN;

DO $$
DECLARE
  n_orgs int;
  only_org uuid;
  t text;
BEGIN
  SELECT count(*) INTO n_orgs FROM organizations;

  IF n_orgs = 1 THEN
    SELECT id INTO only_org FROM organizations LIMIT 1;
  END IF;

  -- Iterate the catalogue rather than a hard-coded list of 127 names. A table that gains `org_id`
  -- next month is covered by re-running this file; a hard-coded list would quietly leave it out, and
  -- "quietly left out" is the whole class of bug this seed exists to prevent.
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'org_id'
    ORDER BY 1
  LOOP
    IF n_orgs = 1 THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN org_id SET DEFAULT %L', t, only_org);
      -- The rows that predate the default. A no-op on the 73 tables seed 513 already backfilled, and
      -- the whole point on the ~54 it never touched.
      EXECUTE format('UPDATE %I SET org_id = $1 WHERE org_id IS NULL', t) USING only_org;
    ELSE
      EXECUTE format('ALTER TABLE %I ALTER COLUMN org_id DROP DEFAULT', t);
    END IF;
  END LOOP;

  IF n_orgs = 1 THEN
    RAISE NOTICE 'org_id DEFAULT set to the sole organisation (%) on every table carrying the column.', only_org;
  ELSE
    RAISE NOTICE 'org_id DEFAULT DROPPED everywhere: % organisations exist, so a default would be a guess about which customer owns a row.', n_orgs;
  END IF;
END $$;

COMMIT;
