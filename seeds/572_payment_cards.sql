-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 572 — The card registry: whose card paid for this.
--
-- FINANCE_TAX_AND_INTAKE plan F1. A row in `receipts` (seed 220 — note the FILE is named
-- 220_starr_field_receipts.sql but the TABLE is `receipts`) already carries `payment_method` and
-- `payment_last4` and nothing else about the card. Four digits with no owner cannot answer the
-- question the books actually turn on — not "what was bought" but **whose money was it** — and the
-- tax treatment turns entirely on that:
--
--   * a company card is a company expense;
--   * an owner's or an employee's personal card is a REIMBURSEMENT OWED TO A PERSON, and is not a
--     company expense until it is repaid;
--   * a client's card is not our transaction at all, and must never reach the books as either.
--
-- The same coffee, on three different cards, is three different rows in three different places.
-- Booking a reimbursement as a direct expense overstates deductions and leaves a real debt to a
-- person unrecorded; booking a client's charge as ours invents an expense that never existed.
--
-- ── WHY last4 IS NOT THE KEY, AND NOT UNIQUE ────────────────────────────────────────────────────
-- Four digits are not an identifier. Two cards sharing a last4 is ordinary in one wallet and
-- effectively certain across a company card, two owners' personal cards and a handful of employees'.
-- So there is deliberately NO unique constraint on `last4`: the matching logic
-- (lib/finance/payment-cards.ts) returns CANDIDATES and says how confident it is, and a single match
-- is still only a suggestion a human confirms. A unique index here would encode the opposite claim
-- and make the honest case — two cards, same digits — impossible to record.
--
-- ── WHY RETIRED CARDS ARE KEPT ──────────────────────────────────────────────────────────────────
-- `retired_at` rather than deletion. A receipt from March points at whatever card paid it, and
-- deleting a closed card would silently turn last year's filed receipts into "not on file" — a
-- change to history made by an action about the present.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_cards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- As printed on the receipt. TEXT, not an integer: leading zeros are real digits.
    last4           TEXT NOT NULL CHECK (last4 ~ '^[0-9]{4}$'),

    -- Free text on purpose — whatever the receipt actually said ('Visa', 'MC', 'AMEX'). Normalising
    -- it into an enum would mean discarding the one piece of corroborating evidence we have when
    -- two cards share a last4.
    brand           TEXT,

    -- What a person calls it: "Company Amex", "Dad's Chase", "Jacob personal". This is what appears
    -- in the pick-list when a match is ambiguous, so it is the field that has to be human.
    label           TEXT,

    -- The whole point of the table. Mirrors CardRole in lib/finance/payment-cards.ts.
    --   COMPANY           — owned by the business; charges are company expenses
    --   OWNER_PERSONAL    — an owner's personal card; reimbursement owed to that owner
    --   EMPLOYEE_PERSONAL — an employee's personal card; reimbursement owed to that employee
    --   CLIENT            — a client/customer card; NOT our transaction
    --   UNKNOWN           — on file, holder not yet established; nothing is filed until answered
    role            TEXT NOT NULL DEFAULT 'UNKNOWN'
                    CHECK (role IN ('COMPANY','OWNER_PERSONAL','EMPLOYEE_PERSONAL','CLIENT','UNKNOWN')),

    -- Who holds it. Free-text name so a client's card or a spouse can be recorded without an
    -- account, plus an optional link when the holder IS someone in the system — which is what lets a
    -- reimbursement be routed to a person rather than written on a note.
    holder_name     TEXT,
    holder_user_id  UUID REFERENCES registered_users(id) ON DELETE SET NULL,

    -- A personal card must say whose it is, or the reimbursement has no payee and the row is worse
    -- than UNKNOWN: it looks answered. Enforced here rather than in the UI because the API and any
    -- future import can write this table too.
    CONSTRAINT payment_cards_personal_needs_holder CHECK (
        role NOT IN ('OWNER_PERSONAL','EMPLOYEE_PERSONAL')
        OR holder_name IS NOT NULL
        OR holder_user_id IS NOT NULL
    ),

    notes           TEXT,

    -- Closed or replaced. Kept, never deleted — see the header.
    retired_at      TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES registered_users(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ
);

-- Every lookup starts from the digits on a receipt, and wants live cards first. Not unique, for the
-- reason in the header.
CREATE INDEX IF NOT EXISTS idx_payment_cards_last4
    ON payment_cards (last4);

-- "Which cards still need a holder?" is the bookkeeper's working queue, so it gets its own partial
-- index rather than a scan of every card ever held.
CREATE INDEX IF NOT EXISTS idx_payment_cards_unresolved
    ON payment_cards (created_at) WHERE role = 'UNKNOWN' AND retired_at IS NULL;

-- ── The link from a receipt to the card that paid it ────────────────────────────────────────────
-- Nullable, and separate from `payment_last4`, which stays exactly as captured. The two answer
-- different questions: `payment_last4` is *what the receipt said* and must never be rewritten, while
-- `payment_card_id` is *who we concluded that was* — a judgement, made by a person, that can be
-- corrected without touching the evidence.
ALTER TABLE receipts
    ADD COLUMN IF NOT EXISTS payment_card_id UUID REFERENCES payment_cards(id) ON DELETE SET NULL;

-- Who confirmed the match, and when. A suggestion the software made and a decision a human made
-- must not look the same afterwards; without this, an auto-suggested card is indistinguishable from
-- a confirmed one the moment the page reloads.
ALTER TABLE receipts
    ADD COLUMN IF NOT EXISTS payment_card_confirmed_by UUID REFERENCES registered_users(id) ON DELETE SET NULL;
ALTER TABLE receipts
    ADD COLUMN IF NOT EXISTS payment_card_confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_receipts_payment_card
    ON receipts (payment_card_id) WHERE payment_card_id IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────────────────
-- Deny-by-default, same floor as the rest of the admin schema. A card row names whose money pays for
-- what, across owners, employees and clients — every read and write goes through a service-role
-- route that has already checked the session and the role.
ALTER TABLE payment_cards ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payment_cards' AND policyname = 'payment_cards_no_direct_access'
  ) THEN
    -- A policy that grants nothing, stated explicitly. With RLS on and no policy the effect is
    -- identical, but "no policy" reads as an oversight and invites someone to add a permissive one;
    -- this records that the absence is the decision.
    CREATE POLICY payment_cards_no_direct_access ON payment_cards
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
END $$;
