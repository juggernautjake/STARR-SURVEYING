-- 569_vendor_accounts.sql — do we have an account, and how much is in it (plan S-1/S-2).
--
-- The owner's requirement: hold account info so we know we HAVE an account with a vendor, track the
-- money in each one so documents can be paid for, keep a card on file, and top up automatically when
-- a balance falls below a threshold.
--
-- ── WHAT THIS TABLE DELIBERATELY DOES NOT HOLD ──────────────────────────────────────────────────
--
-- **No passwords. No card numbers. No API keys.**
--
-- Vendor logins are secrets, not configuration. They belong in the environment/secret store the
-- worker already uses for ANTHROPIC_API_KEY and the Supabase service key. This table is queried,
-- logged, exported and seeded into version control — every property that makes it useful is a
-- property that makes it the wrong place for a credential.
--
-- What it holds is the NON-SECRET half, which is the half that is actually hard to remember: which
-- vendor, which counties it unlocks, whether an account exists, when we last verified that, and what
-- the balance was. A row saying "TexasFile: account exists, verified 2026-08-03, balance $41.20" is
-- useful. A row containing the password is a breach waiting to happen.
--
-- Card data likewise: `stripe_payment_method_id` is a TOKEN, and `card_last4` is four digits printed
-- so a human can tell which card it is. Storing a PAN here would put this whole system in PCI scope,
-- and there is no version of that worth doing for a document-fee wallet.
--
-- ── THE COLUMN THIS TABLE EXISTS FOR: balance_source ────────────────────────────────────────────
--
-- **An inferred balance and a confirmed balance are different facts**, and this is the project's
-- recurring defect — an unknown rendered as an answer — showing up where it costs money.
--
-- If we have not read the vendor's own page since three purchases ago, the number we hold is an
-- ESTIMATE derived from our purchase ledger. It is usually close. It is not the balance. A top-up
-- decision made on an estimate can either overspend, or fail a purchase mid-run twenty minutes into
-- a job — and the failure would be reported as "the vendor declined" rather than "we were working
-- from a guess".
--
-- Two columns keep that distinction impossible to lose:
--
--   balance_source     'confirmed'  read from the vendor's own page
--                      'inferred'   computed from our ledger since the last confirmation
--                      'unknown'    never established — NOT zero, and not spendable
--   balance_checked_at when the CONFIRMED reading was taken (null while unknown)
--
-- `balance_usd` is NULLABLE on purpose. A NULL balance means "we do not know", and every consumer
-- has to handle it. A DEFAULT 0 would have meant "this account is empty", which reads as a fact,
-- would block purchases that should have gone through, and would look identical to a genuinely
-- drained account. NULL is the honest value and the schema enforces asking.
--
-- ── AUTO TOP-UP GUARD RAILS LIVE HERE, NOT ONLY IN CODE ─────────────────────────────────────────
--
-- An automatic payment loop that goes wrong is expensive and quiet, so the limits are columns rather
-- than constants: a low-water threshold, a target, a monthly ceiling, and a minimum interval between
-- top-ups. Two top-ups within a few minutes means something is wrong — a mis-read balance, a retry
-- storm — and the second should be refused rather than honoured.
--
-- `auto_topup_enabled` defaults to FALSE. Nothing charges a card because a row was created; the
-- owner turns it on per vendor, after setting the numbers, which are still an open decision.

CREATE TABLE IF NOT EXISTS research_vendor_accounts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ── Which vendor, and what it unlocks ───────────────────────────────────────────────────────
    -- `vendor_id` matches the platform ids already used by the purchase ledger and the paid-platform
    -- registry ('texasfile', 'kofile_pay', …), so a purchase can be attributed to an account without
    -- a second mapping table to keep in sync.
    vendor_id               TEXT NOT NULL,
    display_name            TEXT NOT NULL,

    -- Counties this account actually unlocks. Empty array is meaningful and different from NULL:
    -- [] means "unlocks nothing extra", statewide=true means "all 254 regardless of this list".
    covered_fips            JSONB NOT NULL DEFAULT '[]',
    statewide               BOOLEAN NOT NULL DEFAULT FALSE,

    -- ── Does an account exist at all? ───────────────────────────────────────────────────────────
    -- Separate from the balance. "We have no account" and "we have an account with no money" lead to
    -- completely different actions, and collapsing them into a zero balance loses that.
    account_status          TEXT NOT NULL DEFAULT 'none'
                            CHECK (account_status IN ('none','pending','active','suspended','closed')),
    -- The vendor's own identifier for us (username, customer number). NOT the password.
    account_identifier      TEXT,
    -- Which env var holds the secret. The NAME is safe to store and makes a missing credential
    -- diagnosable; the VALUE never comes near this table.
    credential_env_var      TEXT,
    account_verified_at     TIMESTAMPTZ,

    -- ── Money ───────────────────────────────────────────────────────────────────────────────────
    -- NULL means unknown. See the header: a defaulted 0 would be a claim we cannot support.
    balance_usd             DECIMAL(10,2),
    currency                TEXT NOT NULL DEFAULT 'USD',
    balance_source          TEXT NOT NULL DEFAULT 'unknown'
                            CHECK (balance_source IN ('confirmed','inferred','unknown')),
    -- When the balance was last CONFIRMED against the vendor. Deliberately not touched by an
    -- inferred update — otherwise an estimate would age like a reading.
    balance_checked_at      TIMESTAMPTZ,

    -- A confirmed balance cannot be unknown, and an unknown balance cannot carry a number. Enforced
    -- here because this is exactly the pair that drifts apart when only application code guards it.
    CONSTRAINT vendor_accounts_balance_coherent CHECK (
        (balance_source = 'unknown' AND balance_usd IS NULL AND balance_checked_at IS NULL)
        OR (balance_source = 'inferred' AND balance_usd IS NOT NULL)
        OR (balance_source = 'confirmed' AND balance_usd IS NOT NULL AND balance_checked_at IS NOT NULL)
    ),

    -- ── Auto top-up ─────────────────────────────────────────────────────────────────────────────
    auto_topup_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    low_water_usd           DECIMAL(10,2),
    topup_to_usd            DECIMAL(10,2),
    monthly_ceiling_usd     DECIMAL(10,2),
    min_topup_interval_mins INTEGER NOT NULL DEFAULT 60,
    last_topup_at           TIMESTAMPTZ,

    -- Topping up TO less than the trigger point would charge the card and leave the account still
    -- below its own threshold — an infinite, billable loop.
    CONSTRAINT vendor_accounts_topup_target_above_trigger CHECK (
        low_water_usd IS NULL OR topup_to_usd IS NULL OR topup_to_usd > low_water_usd
    ),
    -- Auto top-up without limits is the thing the guard rails exist to prevent, so the database
    -- refuses to enable it until all three numbers are set. The owner has not supplied them yet;
    -- until then every row stays FALSE and nothing can charge a card.
    CONSTRAINT vendor_accounts_topup_needs_limits CHECK (
        auto_topup_enabled = FALSE
        OR (low_water_usd IS NOT NULL AND topup_to_usd IS NOT NULL AND monthly_ceiling_usd IS NOT NULL)
    ),

    -- ── Card on file — a TOKEN and four digits, nothing else (plan S-3) ─────────────────────────
    stripe_customer_id        TEXT,
    stripe_payment_method_id  TEXT,
    card_last4                TEXT CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
    card_brand                TEXT,

    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One account row per vendor. Two rows for TexasFile would let one run read a stale balance while
-- another writes a fresh one, and the top-up decision would depend on which was read first.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_accounts_vendor
    ON research_vendor_accounts (vendor_id);

CREATE INDEX IF NOT EXISTS idx_vendor_accounts_active
    ON research_vendor_accounts (account_status)
    WHERE account_status = 'active';

-- ── Top-up ledger ───────────────────────────────────────────────────────────────────────────────
--
-- Every charge is recorded BEFORE it is attempted, so a crash mid-charge leaves evidence rather than
-- a silent double-spend. That ordering is the whole design: a row written after a successful charge
-- tells you nothing about the charge that killed the process.
--
-- It is also what makes the monthly ceiling and the minimum interval enforceable, since both are
-- questions about history rather than about the current balance.

CREATE TABLE IF NOT EXISTS research_vendor_topups (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id           TEXT NOT NULL,

    amount_usd          DECIMAL(10,2) NOT NULL CHECK (amount_usd > 0),
    -- What we believed the balance was when we decided to top up, and how well we knew it. A top-up
    -- triggered by an INFERRED balance that turns out to have been wrong is traceable only if the
    -- basis of the decision was written down at the time.
    balance_before_usd  DECIMAL(10,2),
    balance_source      TEXT NOT NULL DEFAULT 'unknown'
                        CHECK (balance_source IN ('confirmed','inferred','unknown')),

    -- 'attempted' is written first and updated in place. A row still sitting at 'attempted' long
    -- after its timestamp is the crash-mid-charge case, and it is meant to be visible.
    status              TEXT NOT NULL DEFAULT 'attempted'
                        CHECK (status IN ('attempted','succeeded','failed','refunded')),
    failure_reason      TEXT,

    stripe_payment_intent_id TEXT,
    triggered_by        TEXT NOT NULL DEFAULT 'auto'
                        CHECK (triggered_by IN ('auto','manual')),

    attempted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vendor_topups_vendor ON research_vendor_topups(vendor_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_topups_month  ON research_vendor_topups(attempted_at DESC);
-- Finds rows stuck at 'attempted' — the crash-mid-charge case worth surfacing rather than counting.
CREATE INDEX IF NOT EXISTS idx_vendor_topups_unsettled
    ON research_vendor_topups (attempted_at DESC)
    WHERE status = 'attempted';
