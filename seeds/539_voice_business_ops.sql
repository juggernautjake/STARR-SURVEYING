-- 539_voice_business_ops.sql — the parts of a business that are not the website.
--
-- 538 gave Andrew a portfolio, clients, contracts and invoices: everything on the *revenue* side. This
-- file is the rest of running a sole proprietorship from a phone — what he spent, what he has to keep,
-- and what he needs to be told about. The owner's requirement was explicit: "he can handle everything
-- business wise and financially on the website fully… keep his entire business in one place."
--
-- ── WHY EXPENSES ARE NOT JUST NEGATIVE INVOICES ─────────────────────────────────────────────────
--
-- The tempting shortcut is one `transactions` table with a sign. It breaks immediately, because the two
-- sides answer different questions. An invoice has a client, a due date, a partial-payment history and a
-- document a court would read. An expense has a vendor, a tax category, a receipt image and a
-- deductibility question. Merging them produces a table where two-thirds of the columns are null for
-- every row and where "what did I bill in March" and "what can I deduct" are both awkward.
--
-- ── TAX CATEGORY IS A FIRST-CLASS COLUMN, NOT A TAG ─────────────────────────────────────────────
--
-- Andrew graduated this summer and is filing self-employment income, probably for the first time. The
-- single most valuable thing this table can do is make January's Schedule C a query instead of an
-- afternoon with a shoebox. That only works if the category is constrained at write time — a free-text
-- tag will contain "mic", "microphone", "Mic." and "equipment" by March.

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- EXPENSES
-- ════════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS va_expenses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    description     TEXT NOT NULL,
    vendor          TEXT,
    amount_cents    INTEGER NOT NULL CHECK (amount_cents >= 0),
    spent_on        DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Schedule C-shaped categories, named the way a voice actor thinks rather than the way the form
    -- does, with the mapping held in lib/voice/expenses.ts. Constrained so the year-end report is a
    -- GROUP BY rather than a fuzzy match.
    category        TEXT NOT NULL DEFAULT 'other' CHECK (category IN (
                        'equipment',      -- mics, interfaces, headphones, treatment
                        'software',       -- DAW, plugins, subscriptions
                        'studio',         -- booth, room treatment, rent share
                        'training',       -- coaching, workshops, demo production
                        'marketing',      -- website, casting-site memberships, ads
                        'travel',         -- mileage, lodging, per diem
                        'supplies',       -- cables, stands, consumables
                        'fees',           -- payment processing, bank, licensing
                        'professional',   -- accountant, lawyer, insurance
                        'other')),

    payment_method  TEXT NOT NULL DEFAULT 'card' CHECK (payment_method IN
                        ('card', 'bank', 'cash', 'paypal', 'venmo', 'other')),

    -- Business-use percentage, 0–100. A microphone is 100; a laptop shared with personal use is not,
    -- and the difference is the whole reason an auditor asks. Stored as an integer percentage so the
    -- deductible amount is exact integer maths (see lib/voice/expenses.ts).
    business_pct    INTEGER NOT NULL DEFAULT 100 CHECK (business_pct BETWEEN 0 AND 100),

    -- Capital purchases are depreciated rather than deducted in-year. Flagging them at entry time is
    -- the only moment Andrew actually remembers which was which.
    is_capital      BOOLEAN NOT NULL DEFAULT FALSE,

    -- Billed back to a client (a session musician, a studio rental for one job). Reimbursable expense
    -- with no link to the job it belongs to is a reimbursement that never gets invoiced.
    client_id       UUID REFERENCES va_clients(id) ON DELETE SET NULL,
    invoice_id      UUID REFERENCES va_invoices(id) ON DELETE SET NULL,
    billable        BOOLEAN NOT NULL DEFAULT FALSE,

    -- The receipt image/PDF. NOT nullable in spirit: an expense without one is a deduction Andrew
    -- cannot defend. The UI nags; the schema allows it, because a nagged entry beats an unrecorded one.
    receipt_media_id UUID REFERENCES va_media(id) ON DELETE SET NULL,

    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_expenses_date ON va_expenses (spent_on DESC);
CREATE INDEX IF NOT EXISTS idx_va_expenses_category ON va_expenses (category, spent_on DESC);
CREATE INDEX IF NOT EXISTS idx_va_expenses_billable ON va_expenses (billable, invoice_id) WHERE billable AND invoice_id IS NULL;

-- Recurring costs Andrew has committed to — the subscriptions that quietly become the largest line on
-- the P&L. Separate from `va_expenses` because a subscription is a COMMITMENT (a monthly obligation
-- with a renewal date), while an expense is an EVENT. Charges get written into va_expenses as they
-- occur; this table is what tells him one is coming.
CREATE TABLE IF NOT EXISTS va_subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    vendor          TEXT,
    amount_cents    INTEGER NOT NULL DEFAULT 0,
    cadence         TEXT NOT NULL DEFAULT 'monthly' CHECK (cadence IN ('monthly', 'quarterly', 'yearly')),
    category        TEXT NOT NULL DEFAULT 'software',
    next_charge_on  DATE,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- DOCUMENT VAULT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- `va_media` (538) holds things that go ON the website: photos, demo audio, video. This holds things
-- that must never go on the website: tax forms, signed agreements, session masters, W-9s, insurance.
-- The separation is the access rule made structural — nothing in `va_media` is secret and nothing here
-- is public, so a bug that leaks one table does not leak the other.

CREATE TABLE IF NOT EXISTS va_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    title           TEXT NOT NULL,
    -- Virtual folder path, e.g. 'Taxes/2026' or 'Sessions/Acme Dental'. A path string rather than a
    -- self-referencing folder table: there is one user, folders are for HIS memory, and a tree of rows
    -- buys nothing here except the ability to orphan a subtree.
    folder          TEXT NOT NULL DEFAULT 'Unfiled',

    category        TEXT NOT NULL DEFAULT 'other' CHECK (category IN (
                        'contract', 'invoice', 'tax', 'insurance', 'license',
                        'session_master', 'raw_recording', 'script', 'reference', 'other')),

    -- Storage location. Same shape as va_media so one upload helper serves both.
    url             TEXT NOT NULL,
    storage_path    TEXT,
    mime_type       TEXT,
    size_bytes      BIGINT,

    -- What it relates to, when it relates to something.
    client_id       UUID REFERENCES va_clients(id) ON DELETE SET NULL,
    contract_id     UUID REFERENCES va_contracts(id) ON DELETE SET NULL,
    invoice_id      UUID REFERENCES va_invoices(id) ON DELETE SET NULL,
    page_id         UUID REFERENCES va_pages(id) ON DELETE SET NULL,

    -- Retention. A signed contract for a 3-year usage term matters until 2029; a raw take does not
    -- outlive the delivery. Surfacing this makes the vault prunable instead of infinitely growing.
    keep_until      DATE,

    tags            TEXT[] NOT NULL DEFAULT '{}',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_documents_folder ON va_documents (folder, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_va_documents_category ON va_documents (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_va_documents_client ON va_documents (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_va_documents_tags ON va_documents USING GIN (tags);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- The owner wants the site installed on Andrew's phone so "he can get notifications and manage the
-- business". Two layers, and the DB row is the one that matters:
--
--   va_notifications      — the durable record. Survives a denied push permission, a dead battery, a
--                           phone he did not have on him. This is the inbox.
--   va_push_subscriptions — the optional delivery channel. Best-effort. A push that fails to send
--                           must never lose the notification, which is exactly why it is a separate
--                           table and not a column on the row above.

CREATE TABLE IF NOT EXISTS va_notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES va_users(id) ON DELETE CASCADE,

    kind            TEXT NOT NULL CHECK (kind IN (
                        'inquiry_received',    -- someone asked for a quote
                        'invoice_paid',
                        'invoice_overdue',
                        'contract_signed',
                        'session_upcoming',
                        'subscription_due',
                        'system')),

    title           TEXT NOT NULL,
    body            TEXT,
    -- Where tapping it goes, e.g. '/AndrewAsh/studio/inquiries/<id>'.
    href            TEXT,

    -- Loose reference to whatever this is about. Not a FK: notifications outlive the rows that caused
    -- them (an invoice can be deleted; "you got paid" still happened), and a cascade would erase the
    -- history that makes the inbox worth reading.
    subject_type    TEXT,
    subject_id      UUID,

    read_at         TIMESTAMPTZ,
    -- Set once a push was actually accepted by a push service. Null means "in the inbox only".
    pushed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_notifications_unread ON va_notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_va_notifications_feed ON va_notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS va_push_subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES va_users(id) ON DELETE CASCADE,

    -- The Web Push endpoint URL is unique per browser install, and re-subscribing on the same device
    -- returns the same endpoint — so UNIQUE here is what stops a phone accumulating a subscription per
    -- app launch and Andrew getting eleven copies of every notification.
    endpoint        TEXT NOT NULL UNIQUE,
    p256dh          TEXT NOT NULL,
    auth            TEXT NOT NULL,

    -- For "you are signed in on: iPhone, MacBook" in settings.
    device_label    TEXT,
    user_agent      TEXT,

    -- Push services return 404/410 for a subscription the browser has discarded. Recording the
    -- failure rather than deleting on the first error means a transient outage does not silently
    -- unsubscribe every device.
    failure_count   INTEGER NOT NULL DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    disabled_at     TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_va_push_user ON va_push_subscriptions (user_id) WHERE disabled_at IS NULL;

-- Per-kind delivery preferences. Defaults live in code; a row here is an override, so adding a new
-- notification kind does not require backfilling a preference for it.
CREATE TABLE IF NOT EXISTS va_notification_prefs (
    user_id         UUID NOT NULL REFERENCES va_users(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL,
    push_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (user_id, kind)
);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- RLS — same deny-by-default floor as 538. Every read goes through a service-role route.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE va_expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_push_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_notification_prefs  ENABLE ROW LEVEL SECURITY;
