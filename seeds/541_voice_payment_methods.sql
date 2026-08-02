-- seeds/541_voice_payment_methods.sql
--
-- How Andrew wants to be paid, on the invoice page.
--
-- Stored rather than hardcoded because these change: he opens a business Zelle when the bank account
-- lands, drops Venmo when a client's finance department will only do ACH, adds a mailing address for
-- cheques the first time a production company insists on one. Every one of those is a Tuesday-evening
-- edit in Settings, not a deploy.
--
-- Shape: [{ id, label, handle, instructions, enabled }]
--   id           — must match the `method` CHECK on va_payments, so a recorded payment can name it
--   handle       — what the client sends to; empty means "configured but not usable", and the portal
--                  filters it out rather than showing an instruction with a blank destination
--   instructions — free text, e.g. the postal address for a cheque
--   enabled      — off by default; see the empty default below
--
-- The default is an EMPTY array. A portal that advertises a Venmo handle Andrew does not have is worse
-- than one that advertises nothing at all: the client sends money into the void and both of them spend
-- a week finding out.
--
-- Stripe is deliberately NOT in this list. Card payment is env-gated on Andrew's own keys
-- (VOICE_STRIPE_SECRET_KEY / NEXT_PUBLIC_VOICE_STRIPE_PUBLISHABLE_KEY / VOICE_PAYMENTS_LIVE) and never
-- falls back to this repo's existing Starr Surveying keys — see lib/voice/payments.ts for why that
-- distinction is load-bearing rather than tidy.

ALTER TABLE va_settings
    ADD COLUMN IF NOT EXISTS payment_methods JSONB NOT NULL DEFAULT '[]'::JSONB;

-- What the client sees above the payment options. Andrew's words, not ours.
ALTER TABLE va_settings
    ADD COLUMN IF NOT EXISTS payment_note TEXT;

-- Client-declared payments arrive as va_payments rows with status='pending' — "I sent the transfer" —
-- and only become 'succeeded' when Andrew confirms the money landed. Finding those quickly is the
-- whole point of the state, so it gets an index.
CREATE INDEX IF NOT EXISTS va_payments_pending_idx
    ON va_payments (status, received_at DESC)
    WHERE status = 'pending';

-- Where a client-declared payment came from. NULL for anything Andrew recorded himself in the studio.
ALTER TABLE va_payments
    ADD COLUMN IF NOT EXISTS declared_by_client BOOLEAN NOT NULL DEFAULT FALSE;
