-- seeds/657_offered_status.sql — the status the offer rows are written with.
--
-- Seed 656 added `vendor_ref`, `preview_path` and `offered_at` to `research_document_purchases` and
-- the worker began writing rows with `status: 'offered'`. It never widened the CHECK.
--
-- ── THIS IS THE SECOND TIME ─────────────────────────────────────────────────────────────────────
--
-- Seed 629's header describes the first, in almost these words: seed 531 allowed three statuses,
-- the worker started writing `paid_disabled`, every insert violated the CHECK, the writer does not
-- throw, and it became one warning line per run over a table that stayed empty — "the exact
-- condition the write was added to end."
--
-- `__tests__/research/purchase-status-check-matches-code.test.ts` was written that day to stop it
-- happening again, and it did not, because it checks four writers BY NAME: the purchase gate, the
-- app's `skipStatusFor`, the analyze route's filter, and the orchestrator's `budget_exceeded`.
-- `recordOffers` is a fifth. A guard that enumerates the callers it knows about cannot see a new
-- one, which is the failure mode of every hand-maintained list. That test now finds writers by
-- searching for inserts into this table instead, so the sixth writer is caught on the day it lands.
--
-- ── WHY 'offered' IS NOT A SKIP STATUS ──────────────────────────────────────────────────────────
--
-- The four seed 629 added all mean "we could not". `offered` means "we did not, on purpose, and it
-- is still available": the document exists, we know its price, we hold the vendor's own id for it,
-- and a person can buy it with one click whenever they want. Owner, 2026-09-21: "we will find all
-- of the relevant items that can be purchased, and we will list them when the research run is done,
-- and next to them we will have a purchase button."
--
-- Which is also why it must not join the uniqueness index. Seed 531 makes a COMPLETED purchase
-- unique firm-wide so the same deed is never bought twice; an offer is not a purchase and the same
-- document may be offered by every run that finds it. The partial index already says
-- `WHERE status = 'completed'`, so this needs no change — stated here because it is exactly the
-- thing a later reader would assume needs one.

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
    'budget_exceeded',
    -- Found, priced, shown, and waiting on a person. Seeds 656 + 657.
    'offered'
  ));

COMMENT ON COLUMN research_document_purchases.status IS
  'completed/failed/refunded = a purchase that happened (seed 531). paid_disabled / permission_unreadable / no_vendor_credentials / budget_exceeded = a document the run declined or was unable to buy (seed 629). offered = a document the run found and deliberately did not buy, waiting on the operator''s purchase button (seed 657).';
