-- ============================================================================
-- 267_saas_customer_portal_schema.sql
--
-- SaaS pivot — Phase D foundation: customer portal schema. Adds the
-- tables for invitations, in-app notifications, release acknowledgements,
-- and support tickets.
--
-- support_tickets is included here even though SUPPORT_DESK.md isn't yet
-- authored — the schema is small + already locked by referencing in
-- OPERATOR_CONSOLE.md §3.6 + CUSTOMER_PORTAL.md §3.7. Detailed flows
-- come in the sub-plan.
--
-- Spec: docs/planning/in-progress/CUSTOMER_PORTAL.md §5; SUPPORT_DESK.md
-- (pending) for ticket-specific protocols.
-- ============================================================================

BEGIN;

-- ── Organization invitations ────────────────────────────────────────────────
-- Pending invites; recipient clicks magic-link to accept.
CREATE TABLE IF NOT EXISTS public.org_invitations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  inviter_email     TEXT NOT NULL,
  invitee_email     TEXT NOT NULL,
  role              public.org_role_enum NOT NULL DEFAULT 'surveyor',
  bundle_overrides  TEXT[],                        -- null = inherit org default
  token             TEXT UNIQUE NOT NULL,           -- random URL-safe token
  status            TEXT NOT NULL DEFAULT 'pending', -- pending / accepted / expired / revoked
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at       TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token   ON public.org_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_pending ON public.org_invitations(invitee_email) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_invitations_org     ON public.org_invitations(org_id, status, created_at DESC);

-- ── In-app notifications (customer-side) ────────────────────────────────────
-- The bell icon in the rail's __tools section reads from here. Real-time
-- fan-out via the existing /api/ws/ticket WebSocket plumbing (extended in
-- Phase D-6 to a generic per-user channel).
CREATE TABLE IF NOT EXISTS public.org_notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_email    TEXT,                              -- null = visible to every user in org
  type          TEXT NOT NULL,                     -- release / billing / support / system / quota / security
  severity      TEXT DEFAULT 'info',
  title         TEXT NOT NULL,
  body          TEXT,                              -- Markdown
  action_url    TEXT,
  action_label  TEXT,
  payload       JSONB DEFAULT '{}',
  read_at       TIMESTAMPTZ,
  dismissed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.org_notifications IS 'Customer-side in-app notifications. Named org_notifications to avoid collision with the existing internal notifications table (which is per-Starr-user).';

CREATE INDEX IF NOT EXISTS idx_org_notif_user      ON public.org_notifications(user_email, created_at DESC) WHERE dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_org_notif_org       ON public.org_notifications(org_id, created_at DESC) WHERE dismissed_at IS NULL AND user_email IS NULL;
CREATE INDEX IF NOT EXISTS idx_org_notif_unread    ON public.org_notifications(user_email) WHERE read_at IS NULL AND dismissed_at IS NULL;

-- ── Release acknowledgements ────────────────────────────────────────────────
-- Per-user record of "I saw the v2.4 release notes". Drives the "What's
-- new" banner dismissal state on the Hub.
CREATE TABLE IF NOT EXISTS public.releases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version         TEXT UNIQUE NOT NULL,              -- "v2.4.0", "v2.4.1-hotfix"
  bundles         TEXT[] NOT NULL DEFAULT '{}',     -- which bundles this release touches
  release_type    TEXT NOT NULL DEFAULT 'feature',   -- feature / bugfix / breaking / security
  required        BOOLEAN DEFAULT false,             -- mobile force-update
  notes_markdown  TEXT,
  published_at    TIMESTAMPTZ,
  scheduled_for   TIMESTAMPTZ,
  rollout_strategy TEXT DEFAULT 'immediate',         -- immediate / canary_10 / canary_50 / scheduled / specific
  scheduled_tenants UUID[],                          -- when rollout_strategy = 'specific'
  published_by    TEXT REFERENCES public.operator_users(email),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_releases_published ON public.releases(published_at DESC) WHERE published_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.release_acks (
  user_email TEXT NOT NULL,
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  acked_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_email, release_id)
);

-- ── Support tickets ─────────────────────────────────────────────────────────
-- Customer ↔ operator support channel. Detailed protocols in
-- SUPPORT_DESK.md (sub-plan to be authored).
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number     TEXT UNIQUE NOT NULL,           -- T-0042 etc.; generated by app
  org_id            UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requester_email   TEXT NOT NULL,
  assigned_to       TEXT REFERENCES public.operator_users(email),
  subject           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open',
                    -- open / awaiting_reply / awaiting_customer / resolved / closed
  priority          TEXT NOT NULL DEFAULT 'normal', -- low / normal / high / urgent / critical
  category          TEXT,                            -- bug / question / billing / feature_request / etc.
  tags              TEXT[] DEFAULT '{}',
  first_response_at TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_org      ON public.support_tickets(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_open     ON public.support_tickets(status, created_at DESC) WHERE status NOT IN ('resolved', 'closed');
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON public.support_tickets(assigned_to, status, created_at DESC) WHERE assigned_to IS NOT NULL;

-- Ticket messages — replies, internal notes, attachments
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id         UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_email      TEXT NOT NULL,
  author_type       TEXT NOT NULL,                 -- customer / operator
  body              TEXT NOT NULL,
  is_internal_note  BOOLEAN DEFAULT false,         -- internal = visible to operators only
  attachments       JSONB DEFAULT '[]',            -- array of {url, name, mime_type, size_bytes}
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_msgs_ticket ON public.support_ticket_messages(ticket_id, created_at);

-- ── Ticket number generator ────────────────────────────────────────────────
-- Sequence + helper function so the app doesn't have to coordinate
-- ticket-number generation under load.
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_seq START 1;

CREATE OR REPLACE FUNCTION public.next_ticket_number() RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  n BIGINT;
BEGIN
  n := nextval('public.support_ticket_seq');
  RETURN 'T-' || LPAD(n::TEXT, 4, '0');
END $$;

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
--
--   SELECT count(*) FROM public.org_invitations;          -- 0
--   SELECT count(*) FROM public.org_notifications;        -- 0
--   SELECT count(*) FROM public.releases;                 -- 0
--   SELECT count(*) FROM public.support_tickets;          -- 0
--   SELECT public.next_ticket_number();                   -- 'T-0001'
