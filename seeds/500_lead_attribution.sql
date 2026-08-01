-- ============================================================================
-- 500_lead_attribution.sql
--
-- G1-3 of docs/planning/in-progress/GOOGLE_INTEGRATION_2026-07-31.md.
--
-- WHY THIS EXISTS. Google Ads can see a click and, at best, a form submit. It
-- cannot see that the submit on 12 March became a boundary survey that invoiced
-- $4,800 in April, or that another was a tyre-kicker who never replied. Feeding
-- that back is what lets Smart Bidding chase revenue instead of form fills — and
-- it is only possible if the click's identity is captured at intake and carried
-- alongside the lead the office already works.
--
-- EVERY COLUMN IS NULLABLE, AND THAT IS THE DESIGN, NOT LAZINESS. A phone lead,
-- a referral and a walk-in have none of these, and at a surveying firm those are
-- the MAJORITY of leads. An attribution column that is NOT NULL would either
-- reject the most common kind of lead or be filled with a lie.
--
-- THREE CLICK IDENTIFIERS, NOT ONE:
--   gclid   the classic Google Click ID.
--   gbraid  iOS app→web journeys, where gclid is often absent.
--   wbraid  web→app journeys, same reason.
-- Storing only `gclid` — the one every tutorial names — silently drops the
-- traffic that privacy changes made hardest to attribute in the first place.
--
-- `client_ip_hash`, NOT the IP. Enhanced Conversions never needs a raw address,
-- and an IP is personal data under GDPR/CCPA. A salted hash is enough to spot
-- duplicate submissions, which is the only thing we would use it for.
-- ============================================================================

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS gclid             TEXT,
  ADD COLUMN IF NOT EXISTS gbraid            TEXT,
  ADD COLUMN IF NOT EXISTS wbraid            TEXT,
  ADD COLUMN IF NOT EXISTS utm_source        TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium        TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign      TEXT,
  ADD COLUMN IF NOT EXISTS utm_term          TEXT,
  ADD COLUMN IF NOT EXISTS utm_content       TEXT,
  -- The page the visitor FIRST landed on, not the page they submitted from.
  -- Someone arrives on /services from an ad and converts from /contact; the
  -- landing page is the one the ad actually paid for.
  ADD COLUMN IF NOT EXISTS landing_page      TEXT,
  ADD COLUMN IF NOT EXISTS referrer          TEXT,
  -- When the click identifiers were first seen. Google requires a conversion
  -- time and will reject a click older than its lookback window, so this is
  -- what tells us a conversion is too old to upload — a fact worth having
  -- BEFORE the upload is attempted and rejected.
  ADD COLUMN IF NOT EXISTS first_seen_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS client_ip_hash    TEXT;

COMMENT ON COLUMN public.leads.gclid IS
  'Google Click ID captured on the visitor''s FIRST page of the session. Null for phone/referral/walk-in leads, which is normal.';
COMMENT ON COLUMN public.leads.gbraid IS
  'Google click identifier for iOS app-to-web journeys, where gclid is often absent.';
COMMENT ON COLUMN public.leads.wbraid IS
  'Google click identifier for web-to-app journeys.';
COMMENT ON COLUMN public.leads.first_seen_at IS
  'When the click identifiers were first seen. Used to tell whether a conversion is still inside Google''s click lookback window before we try to upload it.';
COMMENT ON COLUMN public.leads.client_ip_hash IS
  'Salted SHA-256 of the submitting IP. Never the raw address — an IP is personal data and Enhanced Conversions does not need it.';

-- Partial index: the ONLY query this table gets for Google purposes is "leads
-- that came from an ad", which is a small minority of rows. A full index would
-- be mostly NULLs, i.e. mostly waste.
CREATE INDEX IF NOT EXISTS idx_leads_gclid ON public.leads(gclid) WHERE gclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign ON public.leads(utm_campaign) WHERE utm_campaign IS NOT NULL;

COMMIT;

-- Verification:
--   SELECT column_name, is_nullable FROM information_schema.columns
--     WHERE table_name = 'leads' AND column_name IN
--       ('gclid','gbraid','wbraid','utm_source','landing_page','first_seen_at','client_ip_hash');
--   -- expect 7 rows, every one is_nullable = YES
--
--   SELECT count(*) FROM public.leads WHERE gclid IS NOT NULL;  -- 0 until the first ad click converts
