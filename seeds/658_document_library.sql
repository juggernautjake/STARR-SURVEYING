-- seeds/658_document_library.sql — one document, held once, findable by every part of the firm.
--
-- Owner, 2026-09-23: "I want it so that all files that get researched and downloaded and purchased
-- get saved to the database... if someone does a research run in bell county, it should search
-- through all of the saved files in the database that relate to bell county."
--
-- ── WHAT IS ALREADY TRUE, AND WHAT IS NOT ───────────────────────────────────────────────────────
--
-- `research_document_purchases` has been firm-wide since seed 531, and the guard is a partial
-- unique index in the DATABASE: UNIQUE (county_fips, instrument_key) WHERE status = 'completed'.
-- Its header says it plainly — "This is the ledger AND the library." So "we already BOUGHT this,
-- firm-wide" is a solved problem and has been for a year.
--
-- "We already HOLD this, firm-wide" is not, and the reason is one column that does not exist.
-- `research_documents` has `identity_key` and `content_sha256` (seed 623) — both firm-wide by
-- nature, neither ever queried across projects, because every reader scopes by
-- `research_project_id` first. And it could not scope by county instead: COUNTY IS NOT ON THIS
-- TABLE. It lives on `research_projects`, so "everything we hold for Bell" means a join or a
-- fan-out over project ids, and nobody writes that query twice.
--
-- ── SO: DENORMALISE THE COUNTY ──────────────────────────────────────────────────────────────────
--
-- `county_fips` on the document itself. It is denormalisation and it is the right kind: a document's
-- county is a fact about the DOCUMENT — Bell County records a plat in Bell County — not a fact about
-- the project that happened to fetch it. A document can also outlive its project, and under the
-- library it is meant to: the plat found for one survey is the same plat the next survey needs.
--
-- Normalised the way the purchase ledger already normalises it (`countyKey`): five-digit FIPS where
-- known, a stable lowercase name otherwise. Both tables must agree or the ledger and the library
-- answer differently about the same document, which is worse than neither answering.

alter table public.research_documents
  add column if not exists county_fips text;

comment on column public.research_documents.county_fips is
  'The county this document RECORDS, normalised like research_document_purchases.county_fips '
  '(5-digit FIPS where known, else a stable lowercase name). Denormalised from research_projects '
  'on purpose: it is a property of the document, the document outlives the project that fetched '
  'it, and without it "everything we hold for Bell County" is a fan-out over project ids.';

-- ── BACKFILL ────────────────────────────────────────────────────────────────────────────────────
--
-- From the owning project, lower-cased and trimmed, with the " County" suffix removed — the same
-- shapes `normaliseCounty()` handles in worker/src/research/document-identity.ts. Rows whose
-- project has no county stay null and are simply invisible to a county-scoped lookup, which is the
-- honest outcome: we do not know where they are from, so we must not claim they are from anywhere.
update public.research_documents d
   set county_fips = nullif(
         regexp_replace(lower(btrim(p.county)), '\s+county\s*$', '', 'i'),
         '')
  from public.research_projects p
 where p.id = d.research_project_id
   and d.county_fips is null
   and coalesce(p.county, '') <> '';

-- The two queries the library asks, and nothing else.
create index if not exists research_documents_county_identity_idx
  on public.research_documents (county_fips, identity_key)
  where identity_key is not null and superseded_at is null;

create index if not exists research_documents_county_sha_idx
  on public.research_documents (county_fips, content_sha256)
  where content_sha256 is not null and superseded_at is null;

-- "What plats do we hold for this county" — the early-pass question, asked before every run spends.
create index if not exists research_documents_county_type_idx
  on public.research_documents (county_fips, document_type)
  where superseded_at is null;


-- ── WHERE A DOCUMENT CAME FROM, AND WHAT WE MAY DO WITH IT ──────────────────────────────────────
--
-- Owner, 2026-09-23: "It will be in our terms and services that any files purchased through our
-- system will be saved to our database. We will not save anyone's personal files, only those that
-- are found through the research process."
--
-- That policy needs a column to be enforceable, because the two halves have genuinely different
-- answers. A county plat is a public record: the county gives it away, anyone may keep it, and
-- re-serving it to another customer is ordinary. A TexasFile purchase is a copy bought under a
-- vendor's terms, and whether it may be re-served to a DIFFERENT customer is the vendor's call,
-- not ours. A client's own survey, uploaded to their job, is neither and must never enter the
-- shared library at all.
--
-- The precedent is `SOURCE_LICENCE` in worker/src/services/imagery-plan.ts, which records a
-- redistribution posture per imagery source and is pinned by a test that "refuses to guess a
-- redistribution right". No equivalent existed for documents. This is it.
--
-- `shareable` is deliberately NOT defaulted to true. A document whose provenance nobody recorded
-- is a document whose licence nobody checked, and the safe reading of silence is "this one is not
-- shared". A library that fails open is a library that redistributes the first thing it should not.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'document_provenance') then
    create type public.document_provenance as enum (
      'public_record',   -- a county or state record we may keep and re-serve
      'vendor_purchase', -- bought from a vendor; sharing governed by that vendor's terms
      'customer_upload', -- the client's own file. NEVER enters the shared library.
      'derived',         -- something we produced: a capture, a render, an export
      'unknown'          -- provenance not recorded, therefore not shareable
    );
  end if;
end $$;

alter table public.research_documents
  add column if not exists provenance public.document_provenance not null default 'unknown',
  add column if not exists source_vendor text,
  add column if not exists shareable boolean not null default false;

comment on column public.research_documents.provenance is
  'Where this document came from, which decides what may be done with it. customer_upload never '
  'enters the shared library; unknown means nobody recorded it, so it is treated as not shareable.';
comment on column public.research_documents.shareable is
  'May this document be served to a customer other than the one it was fetched for? Defaults to '
  'FALSE on purpose: a document whose provenance nobody recorded is one whose licence nobody '
  'checked, and a library that fails open redistributes the first thing it should not.';
comment on column public.research_documents.source_vendor is
  'For vendor_purchase, which vendor — so a later change in one vendor''s terms can be applied to '
  'exactly the documents it governs rather than to everything.';

-- County records already in the library are public records and shareable. This is the one
-- backfill that can be made safely: the free-plat path only ever files documents the county
-- publishes for anyone to download.
update public.research_documents
   set provenance = 'public_record', shareable = true
 where provenance = 'unknown'
   and coalesce(source_url, '') ~* '(bellcountytx\.com|hayscad\.com|\.tx\.us/)'
   and document_type in ('plat', 'subdivision_plat');

-- The library's own lookup: shareable documents, by county, by identity.
create index if not exists research_documents_library_idx
  on public.research_documents (county_fips, document_type)
  where shareable = true and superseded_at is null and duplicate_of is null;
