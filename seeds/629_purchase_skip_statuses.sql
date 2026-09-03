-- 629_purchase_skip_statuses.sql
-- The purchase ledger can record a document that was NOT bought.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────────────────────
--
-- Seed 531 created `research_document_purchases` with
--
--     CHECK (status IN ('completed','failed','refunded'))
--
-- i.e. three ways a purchase can END. On 2026-09-02 the worker started writing rows for documents a
-- run DECLINED to buy — `paid_disabled` (the operator said no) and `permission_unreadable` (the run
-- could not find out whether the operator had said yes) — because the app's analyze route counts
-- those rows to build the "N documents behind a paywall were not retrieved" notice, and for months
-- there had been none to count.
--
-- Every one of those inserts violated this CHECK. `recordSkippedPurchases` never throws, so the
-- failure came back as a warning line in the run log and the row count stayed at zero — which is
-- exactly the state the 2026-09-02 fix was written to end. Confirmed against the live database on
-- 2026-09-03: constraint unchanged since 531, table at 0 rows. Both plan items that claimed the
-- notice was reachable (this repository's "B3" of 2026-09-02, and R13's cheapest-first ledger) had
-- shipped code that could not execute, and a completed plan says otherwise.
--
-- A table at zero rows is usually a write that cannot execute. This is the fourth one found in the
-- research schema (after 42P10 on adjoiners, the capture CHECK, and the health parser).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────────────────────
--
-- Widen the CHECK to every status the code writes or counts:
--
--   completed / failed / refunded   — seed 531, a purchase that happened
--   paid_disabled                   — worker purchase-gate.ts, app paid-documents.ts skipStatusFor
--   permission_unreadable           — worker purchase-gate.ts
--   no_vendor_credentials           — app paid-documents.ts skipStatusFor; the analyze route counts it
--   budget_exceeded                 — worker document-purchase-orchestrator.ts:245 / types/purchase.ts
--
-- The partial unique index from 531 (`WHERE status = 'completed'`) is untouched: a skipped document
-- may be skipped by any number of runs, and only a completed purchase is firm-wide unique.
--
-- Guarded by __tests__/research/purchase-status-check-matches-code.test.ts, which reads THIS
-- file's list and every writer's literals and fails when they drift — the schema guards that
-- existed before could not see a CHECK's values, which is how 531 and the writer disagreed for a
-- day without anything noticing.

ALTER TABLE research_document_purchases
  DROP CONSTRAINT IF EXISTS research_document_purchases_status_check;

ALTER TABLE research_document_purchases
  ADD CONSTRAINT research_document_purchases_status_check
  CHECK (status IN (
    'completed',
    'failed',
    'refunded',
    'paid_disabled',
    'permission_unreadable',
    'no_vendor_credentials',
    'budget_exceeded'
  ));

COMMENT ON COLUMN research_document_purchases.status IS
  'completed/failed/refunded = a purchase that happened (seed 531). paid_disabled / permission_unreadable / no_vendor_credentials / budget_exceeded = a document the run declined or was unable to buy, recorded so the report can say how much is missing (seed 629).';
