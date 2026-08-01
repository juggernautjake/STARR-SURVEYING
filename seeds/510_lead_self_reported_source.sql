-- ============================================================================
-- 510_lead_self_reported_source.sql
--
-- A13 of docs/planning/in-progress/LEAD_TO_CASH_ATTRIBUTION_AND_GOOGLE_ADS_2026-07-31.md.
--
-- ── FINDING 6: THE PHONE IS THE BIGGEST HOLE AFTER gclid ────────────────────
--
-- `leads.source` defaults to 'Phone' at this business, and a phone lead carries
-- no click to key on. A12's coverage meter will therefore never read 100%, and
-- the honest response is not to pretend otherwise — it is to collect the weak
-- signal we already have and label it as weak.
--
-- ── how_heard WAS ALREADY BEING COLLECTED AND THROWN AWAY ───────────────────
--
-- `ContactForm.tsx` has asked "How Did You Hear About Us?" all along. The
-- contact route put it in the notification email and nowhere else. Every
-- submission since launch answered the attribution question and the answer was
-- deleted on arrival.
--
-- ── WHY TWO COLUMNS AND NOT ONE ─────────────────────────────────────────────
--
-- `how_heard` is what the CUSTOMER said, unedited, from a dropdown.
-- `mentioned_ad` is what STAFF recorded from a phone call.
--
-- Merging them would destroy the distinction that matters: one is a
-- self-report from a menu, the other is a human's recollection of a
-- conversation. They have different reliability and they get corrected by
-- different people. A single field would end up holding whichever was written
-- last.
--
-- ── NEITHER IS EVER UPLOADED TO GOOGLE ──────────────────────────────────────
--
-- These are internal dimensions. Google matches on click ids and hashed
-- identity; "she said she saw us on Facebook" is not a conversion signal and
-- sending it as one would be inventing attribution. It informs OUR reading of
-- the funnel, which is the honest use for it.
-- ============================================================================

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS how_heard TEXT;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS mentioned_ad TEXT;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS mentioned_ad_by TEXT;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS mentioned_ad_at TIMESTAMPTZ;

COMMENT ON COLUMN public.leads.how_heard IS
  'What the CUSTOMER selected on the public form. Self-reported and weak, but it is the only signal a phone/referral lead carries. Never uploaded to Google — it is not a conversion signal.';
COMMENT ON COLUMN public.leads.mentioned_ad IS
  'What STAFF recorded from a phone call ("which ad did they mention?"). Deliberately separate from how_heard: a human recollection of a conversation is not the same kind of evidence as a menu selection, and merging them would leave whichever was written last.';

-- Partial: most leads have neither, and the dashboard only ever asks for the
-- ones that do.
CREATE INDEX IF NOT EXISTS idx_leads_how_heard ON public.leads(how_heard) WHERE how_heard IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_mentioned_ad ON public.leads(mentioned_ad) WHERE mentioned_ad IS NOT NULL;

COMMIT;

-- Verification:
--   SELECT how_heard, count(*) FROM public.leads GROUP BY 1 ORDER BY 2 DESC;
--   -- all NULL before this ships; the answers were being emailed and discarded.
