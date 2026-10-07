-- seeds/671_schema_drift_repair.sql — columns the seeds declare but the live database never got.
--
-- Owner, 2026-10-06: "make sure the database is set up correctly and that all necessary migrations
-- have been applied and that our schema is set up correctly."
--
-- Every table, column, index, function, view and constraint the seeds declare was compared with the
-- live database. Everything is present except:
--   · 663_phone_calls_outcome.sql — never applied (applied alongside this file).
--   · user_flashcards.category / difficulty_level / deleted_at, user_flashcard_discovery.created_at,
--     fieldbook_entry_categories.created_at — the tables pre-date the seeds that describe them, so
--     CREATE TABLE IF NOT EXISTS skipped and the columns never arrived. The flashcards API filters
--     and inserts on `category`, so a user card saved with a category failed, and filtering by one
--     returned no user cards at all.
-- Deliberately left alone (documented where they live):
--   · employee_payouts.gross_cents / net_cents / items / updated_at — lib/payroll/payout-ledger.ts
--     repointed the code at the columns that do exist.
--   · job_time_entries_vehicle_id_fkey — 225 explains the column it guards never existed.
--
-- Additive, nullable or defaulted; safe to apply twice.

BEGIN;

ALTER TABLE public.user_flashcards ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.user_flashcards ADD COLUMN IF NOT EXISTS difficulty_level text;
ALTER TABLE public.user_flashcards ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.user_flashcard_discovery ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.fieldbook_entry_categories ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

COMMIT;
