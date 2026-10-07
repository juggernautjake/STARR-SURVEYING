-- seeds/674_phone_taps.sql — a website visitor tapping the phone number, matched to the call that follows.
--
-- Owner, 2026-10-06: "I do not want separate numbers for each ad... we need one number for the
-- business." And: "Let's go ahead and set up the 2nd option, because it doesn't seem like it would
-- hurt anything and it would give us more analytics." (The first option — the receptionist asking
-- "how did you hear about us?" — was declined: "that is annoying to customers.")
--
-- So no call-tracking numbers. Instead: when a visitor taps a tel: link on the website, the browser
-- reports the tap with whatever it already knows about how the visitor arrived (the Google click id
-- and UTM tags captured on their first page — lib/leads/attribution.ts). When a call reaches the one
-- business number a minute or two later, lib/receptionist/call-source.ts matches the two by time.
-- A matched call carries the ad click into the lead it becomes, and from there into the existing
-- offline-conversion upload to Google Ads.
--
-- What is NOT stored: the visitor's IP address or phone number (the browser does not know the
-- number, and the IP is not needed). `visitor` is a random id kept in that browser's storage so two
-- taps from one visitor read as one person.
--
-- Additive; safe twice.

BEGIN;

CREATE TABLE IF NOT EXISTS public.phone_taps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tapped_at        timestamptz NOT NULL DEFAULT now(),
  path             text,
  device           text CHECK (device IS NULL OR device IN ('mobile', 'desktop')),
  visitor          text,
  gclid            text,
  gbraid           text,
  wbraid           text,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  utm_term         text,
  utm_content      text,
  landing_page     text,
  referrer         text,
  first_seen_at    timestamptz,
  -- Filled when a call is matched to this tap.
  call_id          uuid REFERENCES public.phone_calls(id) ON DELETE SET NULL,
  match_confidence text CHECK (match_confidence IS NULL OR match_confidence IN ('likely', 'possible')),
  matched_at       timestamptz,
  org_id           uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_taps_tapped ON public.phone_taps (tapped_at DESC);
CREATE INDEX IF NOT EXISTS idx_phone_taps_unmatched ON public.phone_taps (tapped_at DESC) WHERE call_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_phone_taps_call ON public.phone_taps (call_id);

ALTER TABLE public.phone_taps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON public.phone_taps;
CREATE POLICY service_role_all ON public.phone_taps FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.phone_taps IS
  'Website tel: taps, each with the ad click / UTM tags the visitor arrived with; matched by time to the call that followed (lib/receptionist/call-source.ts). One business number, no call-tracking numbers.';

-- Where a call came from. `source` is the coarse answer the pages group by; `source_detail` is the
-- sentence a person reads ("Tapped the number on /services 2 minutes before calling, from a Google
-- ad click").
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS tap_id uuid;
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS source_detail text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phone_calls_source_check') THEN
    ALTER TABLE public.phone_calls ADD CONSTRAINT phone_calls_source_check
      CHECK (source IS NULL OR source IN ('google_ads', 'website', 'unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phone_calls_tap_id_fkey') THEN
    ALTER TABLE public.phone_calls ADD CONSTRAINT phone_calls_tap_id_fkey
      FOREIGN KEY (tap_id) REFERENCES public.phone_taps(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_phone_calls_source ON public.phone_calls (source) WHERE source IS NOT NULL;

COMMIT;
