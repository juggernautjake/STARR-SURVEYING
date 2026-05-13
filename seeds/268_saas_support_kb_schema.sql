-- ============================================================================
-- 268_saas_support_kb_schema.sql
--
-- SaaS pivot — Phase E foundation: support knowledge base + ticket
-- subscribers + ticket-article links. Extends the support_tickets
-- + support_ticket_messages schema shipped in seeds/267.
--
-- Spec: docs/planning/in-progress/SUPPORT_DESK.md §4.
-- ============================================================================

BEGIN;

-- ── Knowledge base articles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kb_articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,            -- /docs/<category>/<slug>
  category        TEXT NOT NULL,                   -- 'getting-started', 'cad', 'billing', etc.
  title           TEXT NOT NULL,
  body_markdown   TEXT NOT NULL,
  bundle_scope    TEXT[],                          -- which bundles this is relevant to; null = all
  internal_only   BOOLEAN DEFAULT false,           -- operator-runbook articles
  author_email    TEXT,
  helpful_count   INT DEFAULT 0,
  unhelpful_count INT DEFAULT 0,
  view_count      INT DEFAULT 0,
  published_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE  public.kb_articles IS 'Public knowledge base + internal operator runbooks. internal_only=true gates to /platform/support/knowledge-base.';

CREATE INDEX IF NOT EXISTS idx_kb_published ON public.kb_articles(published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kb_category  ON public.kb_articles(category, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_kb_internal  ON public.kb_articles(internal_only, published_at DESC);

-- Full-text search column + GIN index. Postgres tsvector handles English
-- stemming + stop-word filtering. Generated column keeps it in sync with
-- title + body_markdown.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kb_articles' AND column_name = 'search_tsv'
  ) THEN
    ALTER TABLE public.kb_articles
      ADD COLUMN search_tsv tsvector
      GENERATED ALWAYS AS (
        to_tsvector('english',
          coalesce(title, '') || ' ' || coalesce(body_markdown, '')
        )
      ) STORED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_kb_search ON public.kb_articles USING GIN(search_tsv);

-- Voting on article helpfulness (anonymous; just increments a counter).
-- For abuse-resistance use a per-IP throttle in the API layer.

-- ── Ticket subscribers ─────────────────────────────────────────────────────
-- Customer admin can CC another teammate onto a ticket so both see
-- operator replies. Anyone in the org with admin role can add subscribers
-- to any open ticket in their org.
CREATE TABLE IF NOT EXISTS public.ticket_subscribers (
  ticket_id  UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  added_by   TEXT NOT NULL,
  added_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (ticket_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_ticket_subs_user ON public.ticket_subscribers(user_email);

-- ── Ticket ↔ article links ─────────────────────────────────────────────────
-- Operator can attach a KB article to a ticket reply ("here's the article
-- that covers this"). Surfaces on both the ticket thread (link) + on the
-- article ("12 customers found this useful via tickets").
CREATE TABLE IF NOT EXISTS public.ticket_kb_links (
  ticket_id  UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.kb_articles(id) ON DELETE CASCADE,
  linked_by  TEXT NOT NULL,
  linked_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (ticket_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_kb_article ON public.ticket_kb_links(article_id);

-- ── Email templates (per CUSTOMER_MESSAGING_PLAN.md §4) ─────────────────────
-- Operator-editable copies override the file-system defaults.
CREATE TABLE IF NOT EXISTS public.email_templates (
  event_type   TEXT PRIMARY KEY,                   -- matches NotificationEvent union
  subject_tpl  TEXT NOT NULL,                      -- Handlebars
  body_tpl     TEXT NOT NULL,                      -- Handlebars HTML
  updated_by   TEXT REFERENCES public.operator_users(email),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ── Broadcasts (per CUSTOMER_MESSAGING_PLAN.md §5) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composer_email  TEXT NOT NULL REFERENCES public.operator_users(email),
  subject         TEXT NOT NULL,
  body_markdown   TEXT NOT NULL,
  audience_filter JSONB NOT NULL,                  -- {plans, bundles, orgs, tag}
  channels        TEXT[] NOT NULL,                 -- {'email','in_app'}
  status          TEXT NOT NULL DEFAULT 'draft',   -- draft / scheduled / sent / canceled
  scheduled_for   TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  audience_count_snapshot INT,
  delivery_counts JSONB DEFAULT '{}',              -- {sent, opened, clicked, bounced}
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON public.broadcasts(status, created_at DESC);

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
--
--   SELECT count(*) FROM public.kb_articles;            -- 0
--   SELECT count(*) FROM public.ticket_subscribers;     -- 0
--   SELECT count(*) FROM public.ticket_kb_links;        -- 0
--   SELECT count(*) FROM public.email_templates;        -- 0
--   SELECT count(*) FROM public.broadcasts;             -- 0
--
--   -- KB search smoke-test:
--   INSERT INTO public.kb_articles (slug, category, title, body_markdown, published_at)
--   VALUES ('test-1', 'getting-started', 'How do I sign in?',
--           'Visit your firm''s subdomain and click "Sign in".', now());
--   SELECT title FROM public.kb_articles
--    WHERE search_tsv @@ to_tsquery('english', 'sign');
--   -- expected: 1 row
