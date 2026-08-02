-- 538_voice_platform.sql — the whole of Andrew Ash's voice business, as tables.
--
-- Andrew is a voice actor and vocal coach. He needs one place to show his work and one place to run
-- the business behind it: inquiries in, contracts signed, invoices paid, students tracked. Everything
-- below is namespaced `va_` (voice artist) so it never collides with the surveying schema it shares a
-- database with, and so the entire platform can be lifted out to its own Squarespace/Supabase project
-- later by copying fourteen tables and nothing else.
--
-- ── WHY THE PAGE BUILDER STORES BLOCKS AS JSONB, NOT ROWS ───────────────────────────────────────
--
-- The obvious schema is `va_blocks (page_id, position, type, config)`. It is the wrong one here.
--
-- The builder Andrew uses is a drag-to-reorder editor with a live preview. Every reorder rewrites the
-- position of every block after the drop point. As rows that is N UPDATEs inside a transaction, a
-- unique (page_id, position) constraint that has to be deferred to survive the shuffle, and a real
-- possibility of a half-applied reorder if the request dies midway — which shows up to Andrew as a
-- page whose blocks silently swapped places. As a JSONB array it is one UPDATE of one column: the
-- array order IS the block order, so "saved" and "in the order I left it" cannot disagree.
--
-- The cost of JSONB is that you cannot cheaply query "every page containing a video widget". That
-- query does not exist in this product, and if it ever does, a GIN index on `blocks` answers it.
--
-- ── WHY DRAFTS ARE A SEPARATE COLUMN, NOT A SEPARATE ROW ────────────────────────────────────────
--
-- `blocks` is what the public sees; `draft_blocks` is what Andrew is editing. Keeping the draft on the
-- same row means publishing is a column copy and reverting is a column copy the other way — no id
-- swap, no dangling references from `va_media` or the nav order, and no way to end up with a
-- published page pointing at a draft that was deleted. `draft_blocks IS NULL` means "no unpublished
-- changes", which is also exactly the flag the editor needs to show an "unsaved changes" badge.
--
-- ── MONEY IS CENTS, EVERYWHERE ──────────────────────────────────────────────────────────────────
--
-- Every amount in this file is an INTEGER of cents. NUMERIC would also be correct, but the app layer
-- talks to Stripe, and Stripe speaks cents; converting at one boundary (the formatter) instead of at
-- every arithmetic site is what stops a $1,250.00 invoice from being charged as $12.50.

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SITE IDENTITY + THEME
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- Single-row table. `id` is pinned to a CHECK so a second row cannot exist — the site has one
-- identity, and a settings table that can hold two of them is a settings table that will eventually
-- serve the wrong one.
CREATE TABLE IF NOT EXISTS va_settings (
    id                  INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),

    -- Identity
    artist_name         TEXT NOT NULL DEFAULT 'Andrew Ash',
    tagline             TEXT NOT NULL DEFAULT 'Voice Actor & Vocal Coach',
    -- The one-paragraph pitch reused in meta descriptions, OG cards and the footer.
    short_bio           TEXT,
    long_bio            TEXT,

    -- Contact + booking
    email               TEXT,
    phone               TEXT,
    location            TEXT DEFAULT 'Central Texas',
    booking_url         TEXT,
    -- Social links as {label, url, icon} objects so adding a platform is a data change.
    social_links        JSONB NOT NULL DEFAULT '[]'::JSONB,

    -- Theme. A flat token bag ({"ink":"#0B0E14","gold":"#C9A227",...}) rendered into CSS custom
    -- properties on the site root. Stored rather than hardcoded because the owner's requirement was
    -- explicitly "he can change the colors and styles of things" — including the site-wide palette,
    -- not just per-widget overrides.
    theme               JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- Named preset currently applied ('ink-and-gold', 'bone', 'ember', 'custom').
    theme_preset        TEXT NOT NULL DEFAULT 'ink-and-gold',

    -- Which photo backs the home hero, and which is the portrait card.
    hero_photo_id       TEXT DEFAULT 'recital-expressive',
    portrait_photo_id   TEXT DEFAULT 'portrait-formal',

    -- Navigation order for the public header: [{label, href, external}].
    nav_items           JSONB NOT NULL DEFAULT '[]'::JSONB,

    -- SEO / sharing
    meta_title          TEXT,
    meta_description    TEXT,
    og_image_url        TEXT,

    -- Business details that appear on invoices and contracts.
    business_name       TEXT DEFAULT 'Andrew Ash Voice',
    business_address    TEXT,
    invoice_prefix      TEXT NOT NULL DEFAULT 'AAV',
    invoice_terms_days  INTEGER NOT NULL DEFAULT 14,
    invoice_footer      TEXT,
    -- Legal boilerplate appended to every generated contract unless overridden.
    contract_terms      TEXT,

    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO va_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- AUTH — Andrew's login
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- Deliberately its own table rather than a role on the surveying `users` table. This platform is
-- meant to be extracted whole; an account that lives in someone else's auth system does not travel.
-- Password is bcrypt, verified server-side; the session is an HMAC-signed cookie (lib/voice/auth.ts),
-- the same pattern /dnd already uses, so there is no new auth dependency.
CREATE TABLE IF NOT EXISTS va_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    -- 'owner' can edit everything. 'assistant' is reserved for later (view + reply to inquiries).
    role            TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'assistant')),
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- MEDIA LIBRARY
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- Every uploaded asset, whatever it is. Widgets reference media by id, so replacing a demo track
-- (re-record the same spot, upload a better take) updates every page that embeds it — instead of
-- Andrew hunting for the four pages that pasted the old URL.
CREATE TABLE IF NOT EXISTS va_media (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind            TEXT NOT NULL CHECK (kind IN ('image', 'audio', 'video', 'document')),
    title           TEXT NOT NULL,
    -- Alt text for images, transcript summary for audio. Not optional in spirit: a portfolio that is
    -- unreadable to a screen reader is a portfolio that loses the accessibility-conscious client.
    alt_text        TEXT,
    description     TEXT,

    -- Where the bytes are. Either a Supabase Storage path (bucket-relative) or an absolute URL for
    -- assets that live in /public or on a CDN. `url` is always the thing you can put in a src.
    url             TEXT NOT NULL,
    storage_path    TEXT,
    mime_type       TEXT,
    size_bytes      BIGINT,

    -- Media-specific metadata: {width,height} for images, {duration_seconds} for audio/video.
    meta            JSONB NOT NULL DEFAULT '{}'::JSONB,

    -- Free-form tags for filtering the library ('commercial', 'character', 'headshot').
    tags            TEXT[] NOT NULL DEFAULT '{}',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_media_kind ON va_media (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_va_media_tags ON va_media USING GIN (tags);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PAGES + PROJECTS (the widget system)
-- ════════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS va_pages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- URL segment. 'project' pages live at /AndrewAsh/work/<slug>; 'page' pages at /AndrewAsh/p/<slug>.
    slug            TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'project' CHECK (kind IN ('project', 'page')),
    UNIQUE (kind, slug),

    title           TEXT NOT NULL,
    subtitle        TEXT,
    summary         TEXT,

    -- Card art for the work index.
    cover_media_id  UUID REFERENCES va_media(id) ON DELETE SET NULL,
    cover_photo_id  TEXT,  -- or one of the bundled /public/andrew photos, by manifest id

    -- 'draft'    — invisible to the public, editable
    -- 'live'     — published
    -- 'archived' — was live, taken down, kept for the record
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'archived')),

    -- Current-work vs past-work, which is the distinction the owner actually asked for
    -- ("past work or projects he is working on currently").
    work_state      TEXT NOT NULL DEFAULT 'completed' CHECK (work_state IN ('in_progress', 'completed')),

    -- Editorial metadata shown on project cards.
    client_name     TEXT,
    role_label      TEXT,          -- 'Lead Voice', 'IVR & On-Hold', 'Ensemble'
    project_type    TEXT,          -- 'commercial' | 'telephony' | 'character' | 'narration' | 'stage' | 'music'
    year            INTEGER,
    tags            TEXT[] NOT NULL DEFAULT '{}',

    -- THE CONTENT. See the header note on why this is an array column.
    blocks          JSONB NOT NULL DEFAULT '[]'::JSONB,
    -- NULL when there is nothing unpublished. Non-null shadows `blocks` in the editor only.
    draft_blocks    JSONB,

    -- Per-page style overrides layered on top of the site theme (background, max width, accent).
    page_style      JSONB NOT NULL DEFAULT '{}'::JSONB,

    -- Hand-ordered on the work index. Lower sorts first; ties break on `year DESC`.
    sort_order      INTEGER NOT NULL DEFAULT 0,
    featured        BOOLEAN NOT NULL DEFAULT FALSE,

    seo_title       TEXT,
    seo_description TEXT,

    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_pages_live ON va_pages (kind, status, sort_order) WHERE status = 'live';
CREATE INDEX IF NOT EXISTS idx_va_pages_featured ON va_pages (featured, sort_order) WHERE status = 'live' AND featured;

-- Point-in-time snapshots taken on every publish. The owner's brief was that Andrew has full control
-- over his own site, and full control includes being able to undo an afternoon of experimenting.
CREATE TABLE IF NOT EXISTS va_page_revisions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id         UUID NOT NULL REFERENCES va_pages(id) ON DELETE CASCADE,
    blocks          JSONB NOT NULL,
    title           TEXT,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_revisions_page ON va_page_revisions (page_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- DEMOS, CREDITS, TESTIMONIALS — the three things a casting director scans for
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- Demo reels are their own table rather than a widget because they appear in four places (home hero,
-- the voice-over page, the floating player, the OG audio card) and must be the same list in all four.
CREATE TABLE IF NOT EXISTS va_demos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    -- The industry's standard reel categories. A casting director filters by exactly these.
    category        TEXT NOT NULL DEFAULT 'commercial'
                    CHECK (category IN ('commercial', 'character', 'narration', 'telephony', 'promo', 'singing')),
    description     TEXT,
    media_id        UUID REFERENCES va_media(id) ON DELETE SET NULL,
    -- Direct URL escape hatch, so a demo hosted on SoundCloud/Dropbox works before anything is uploaded.
    audio_url       TEXT,
    duration_seconds INTEGER,
    -- Shown under the player: the styles/traits in this reel ('warm', 'authoritative', 'gravelly').
    traits          TEXT[] NOT NULL DEFAULT '{}',
    featured        BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_demos_order ON va_demos (category, sort_order);

-- Résumé rows: shows, roles, recitals, ensembles, contracts.
CREATE TABLE IF NOT EXISTS va_credits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production      TEXT NOT NULL,
    role_name       TEXT,
    company         TEXT,
    year            INTEGER,
    credit_type     TEXT NOT NULL DEFAULT 'stage'
                    CHECK (credit_type IN ('stage', 'voice', 'music', 'education', 'award')),
    detail          TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS va_testimonials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote           TEXT NOT NULL,
    author_name     TEXT NOT NULL,
    author_role     TEXT,
    author_company  TEXT,
    -- 'voice' testimonials show on the VO page, 'coaching' on the coaching page, 'both' everywhere.
    context         TEXT NOT NULL DEFAULT 'both' CHECK (context IN ('voice', 'coaching', 'both')),
    featured        BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- INQUIRIES — the quote/sample request form
-- ════════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS va_inquiries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    phone           TEXT,
    company         TEXT,

    -- Which door they came in: a voice-over job, coaching, or something else. This is the single
    -- most useful field on the form, because the two businesses need completely different replies.
    intent          TEXT NOT NULL DEFAULT 'voiceover'
                    CHECK (intent IN ('voiceover', 'coaching', 'booking', 'other')),

    -- Voice-over specifics. All nullable — a coaching inquiry fills none of them.
    project_type    TEXT,
    script_words    INTEGER,
    budget_cents    INTEGER,
    deadline        DATE,
    usage_terms     TEXT,           -- 'web only, 1 year', 'national broadcast'

    -- Coaching specifics.
    experience_level TEXT,
    coaching_goals  TEXT,

    message         TEXT,
    -- Where they came from, for Andrew's own marketing sense.
    referral_source TEXT,

    status          TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'read', 'quoted', 'won', 'lost', 'spam')),
    -- Andrew's private notes. Never rendered publicly.
    internal_notes  TEXT,
    -- Set when a client record is created from this inquiry, so the thread stays connected.
    client_id       UUID,

    responded_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_inquiries_status ON va_inquiries (status, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CLIENTS, CONTRACTS, INVOICES
-- ════════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS va_clients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    phone           TEXT,
    company         TEXT,
    address         TEXT,
    -- 'voiceover' | 'coaching' | 'both' — decides what their portal shows.
    relationship    TEXT NOT NULL DEFAULT 'voiceover'
                    CHECK (relationship IN ('voiceover', 'coaching', 'both')),

    -- THE PORTAL KEY. A client never logs in — they follow a link. This token is the whole of their
    -- authorisation, so it is long, random, and revocable by regenerating it. Unique so a lookup by
    -- token cannot ambiguously match two clients.
    portal_token    TEXT NOT NULL UNIQUE,
    portal_revoked_at TIMESTAMPTZ,

    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_clients_token ON va_clients (portal_token) WHERE portal_revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_va_clients_email ON va_clients (lower(email));

CREATE TABLE IF NOT EXISTS va_contracts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL REFERENCES va_clients(id) ON DELETE CASCADE,
    page_id         UUID REFERENCES va_pages(id) ON DELETE SET NULL,

    contract_number TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    -- The agreement itself, as markdown. Stored as text, not a generated PDF, because the PDF is a
    -- rendering of the agreement and the agreement is the thing that has to be amendable.
    body_markdown   TEXT NOT NULL,

    -- Commercial terms, denormalised out of the body so they can be displayed and summed without
    -- parsing prose. The body remains authoritative if they ever disagree — it is what gets signed.
    fee_cents       INTEGER NOT NULL DEFAULT 0,
    usage_terms     TEXT,
    delivery_date   DATE,
    revisions_included INTEGER NOT NULL DEFAULT 1,

    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent', 'signed', 'countersigned', 'void')),

    -- ── E-SIGNATURE ──
    -- A typed-name signature with the surrounding evidence. This is an ESIGN/UETA-style simple
    -- electronic signature: it is legally usable for freelance service agreements precisely because
    -- the evidence is captured — WHO typed WHAT, from WHERE, WHEN, against WHICH version of the text.
    -- `body_hash` is the one that matters: it pins the signature to the exact bytes that were on
    -- screen, so an edit after signing is detectable rather than silent.
    signer_name     TEXT,
    signer_email    TEXT,
    signed_at       TIMESTAMPTZ,
    signature_ip    TEXT,
    signature_user_agent TEXT,
    body_hash       TEXT,

    -- Andrew's side.
    countersigned_by TEXT,
    countersigned_at TIMESTAMPTZ,

    -- Direct-link token, independent of the client's portal token, so a single contract can be sent
    -- to a signatory who is not the billing contact without exposing the client's other documents.
    access_token    TEXT NOT NULL UNIQUE,

    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_contracts_client ON va_contracts (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_va_contracts_token ON va_contracts (access_token);

CREATE TABLE IF NOT EXISTS va_invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL REFERENCES va_clients(id) ON DELETE CASCADE,
    contract_id     UUID REFERENCES va_contracts(id) ON DELETE SET NULL,

    invoice_number  TEXT NOT NULL UNIQUE,
    title           TEXT,

    -- [{description, quantity, unit_cents, amount_cents}]. An array because an invoice's lines are
    -- meaningless outside their invoice and are never queried across invoices.
    line_items      JSONB NOT NULL DEFAULT '[]'::JSONB,

    subtotal_cents  INTEGER NOT NULL DEFAULT 0,
    tax_cents       INTEGER NOT NULL DEFAULT 0,
    discount_cents  INTEGER NOT NULL DEFAULT 0,
    total_cents     INTEGER NOT NULL DEFAULT 0,
    -- Maintained by the app on every payment. Stored rather than computed so the "what do I owe"
    -- number on the portal is one read, and so a partial payment is visible without a join.
    paid_cents      INTEGER NOT NULL DEFAULT 0,

    currency        TEXT NOT NULL DEFAULT 'usd',

    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent', 'partial', 'paid', 'overdue', 'void')),

    issue_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date        DATE,
    notes           TEXT,

    -- Public payment link token. Same reasoning as the contract token.
    access_token    TEXT NOT NULL UNIQUE,

    sent_at         TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_invoices_client ON va_invoices (client_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_va_invoices_open ON va_invoices (status, due_date) WHERE status IN ('sent', 'partial', 'overdue');
CREATE INDEX IF NOT EXISTS idx_va_invoices_token ON va_invoices (access_token);

CREATE TABLE IF NOT EXISTS va_payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      UUID NOT NULL REFERENCES va_invoices(id) ON DELETE CASCADE,
    amount_cents    INTEGER NOT NULL CHECK (amount_cents > 0),
    method          TEXT NOT NULL DEFAULT 'stripe'
                    CHECK (method IN ('stripe', 'venmo', 'cashapp', 'zelle', 'paypal', 'check', 'cash', 'other')),
    -- Stripe PaymentIntent id, a check number, a Venmo note — whatever identifies this money.
    reference       TEXT,
    -- 'pending' exists because offline methods are recorded when the client SAYS they paid and
    -- confirmed when the money lands. Treating those two as the same state is how a freelancer
    -- delivers work against a payment that never arrived.
    status          TEXT NOT NULL DEFAULT 'succeeded'
                    CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
    note            TEXT,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_payments_invoice ON va_payments (invoice_id, received_at DESC);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- COACHING
-- ════════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS va_coaching_packages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    blurb           TEXT,
    -- What the student actually gets, as a bullet list.
    inclusions      JSONB NOT NULL DEFAULT '[]'::JSONB,
    session_count   INTEGER NOT NULL DEFAULT 1,
    session_minutes INTEGER NOT NULL DEFAULT 45,
    price_cents     INTEGER NOT NULL DEFAULT 0,
    -- The package Andrew wants people to pick. Exactly one should be true; the UI highlights it.
    highlighted     BOOLEAN NOT NULL DEFAULT FALSE,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS va_coaching_students (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL REFERENCES va_clients(id) ON DELETE CASCADE,
    package_id      UUID REFERENCES va_coaching_packages(id) ON DELETE SET NULL,

    -- What they're working on, in Andrew's words. The reason a coach re-reads notes before a lesson.
    goals           TEXT,
    voice_type      TEXT,           -- 'baritone', 'mezzo', 'untrained'
    -- Sessions bought vs used. Kept as plain counters because the log below is the audit trail and
    -- these two are the numbers the dashboard shows.
    sessions_purchased INTEGER NOT NULL DEFAULT 0,
    sessions_used   INTEGER NOT NULL DEFAULT 0,

    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('prospective', 'active', 'paused', 'completed')),
    started_on      DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_students_status ON va_coaching_students (status, created_at DESC);

CREATE TABLE IF NOT EXISTS va_coaching_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL REFERENCES va_coaching_students(id) ON DELETE CASCADE,
    scheduled_at    TIMESTAMPTZ,
    duration_minutes INTEGER NOT NULL DEFAULT 45,
    status          TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
    -- Lesson notes and the homework assigned. Private to Andrew.
    notes           TEXT,
    assignment      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_sessions_student ON va_coaching_sessions (student_id, scheduled_at DESC);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Every one of these tables is reached exclusively through server-side routes holding the service
-- role, which bypasses RLS. Enabling RLS with no permissive policy is therefore not a restriction on
-- the app — it is a deny-by-default floor under it, so that if the anon key is ever used against
-- these tables (a client component importing the wrong Supabase client, a leaked anon key) the
-- answer is zero rows rather than Andrew's client list and unpaid invoices.

ALTER TABLE va_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_media              ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_pages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_page_revisions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_demos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_credits            ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_testimonials       ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_inquiries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_contracts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_coaching_packages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_coaching_students  ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_coaching_sessions  ENABLE ROW LEVEL SECURITY;
