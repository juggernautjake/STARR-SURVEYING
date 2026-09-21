-- seeds/656_purchase_offers.sql — found, priced, shown, and NOT bought until somebody asks.
--
-- Owner, 2026-09-21: "let's make it so that we find the documents that can be purchased, but we
-- will not purchase them... we will list them when the research run is done, and next to them we
-- will have a purchase button... if the researcher clicks the purchase button, the worker will go
-- and purchase the document, download it, and add it to the list of viewable documents."
--
-- ── WHAT THIS REPLACES ──────────────────────────────────────────────────────────────────────────
--
-- Today a run decides and spends in the same breath. On job 26144 it found the 1979 VILLAGE GREEN
-- plat, bought it for $10, and — because that $10 was charged against a $2 run ceiling — the
-- watchdog killed the run before the free clerk index was ever searched. The purchase was correct.
-- Nobody had asked for it.
--
-- An OFFER separates the two halves that were always different decisions: "this document exists,
-- here is what it costs, here is its first page" is research, and research should be free and
-- exhaustive. "Buy it" is spending, and spending should be a click by a person who can see what
-- they are getting.
--
-- ── THE THREE COLUMNS ───────────────────────────────────────────────────────────────────────────
--
-- `vendor_ref` is the whole reason a purchase button can work later. TexasFile's search returns a
-- GUID per document and the buy step needs it; without it, clicking "purchase" a day later means
-- re-running the search and hoping the same document comes back first. `live-source-adapters.ts`
-- has carried this as `previewRef` all along and nothing has ever stored it.
--
-- `preview_path` is the first page, which TexasFile gives away — "the index and image previews are
-- free; a downloadable PDF is charged per page". A thumbnail is what makes an offer honest: a
-- surveyor can see whether it is the plat they want before spending, instead of buying a line of
-- text that says DEED and finding out afterwards.
--
-- `offered_at` separates an offer that is waiting from the rows this table already holds, which are
-- all post-mortems of something that did not happen.
--
-- ── ON REUSING THIS TABLE ───────────────────────────────────────────────────────────────────────
--
-- `research_document_purchases` already records what was bought, what was skipped and why. An offer
-- is the same document at an earlier point in the same life, and splitting it into a second table
-- would mean two places to look for "what happened to this document" and a join to answer it.
-- `status` already distinguishes them.

alter table public.research_document_purchases
  add column if not exists vendor_ref   text,
  add column if not exists preview_path text,
  add column if not exists offered_at   timestamptz;

comment on column public.research_document_purchases.vendor_ref is
  'The vendor''s own id for this document — TexasFile''s search GUID. What lets a purchase button '
  'bought a day later buy THIS document rather than re-running the search and taking the first hit.';

comment on column public.research_document_purchases.preview_path is
  'Storage path of the free first-page preview, used as the thumbnail beside the purchase button. '
  'TexasFile gives previews away; only the downloadable PDF is charged.';

comment on column public.research_document_purchases.offered_at is
  'When this document was offered to the operator. Distinguishes an offer awaiting a decision from '
  'the skip/failure rows this table already held, which are all records of something that did not happen.';

-- The run panel asks one question of this table: "what is on offer for this project?" Everything
-- else here is read by primary key or not at all.
create index if not exists research_document_purchases_offered_idx
  on public.research_document_purchases (research_project_id, status)
  where offered_at is not null;
