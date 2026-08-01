-- seeds/526_help_generated.sql — the 150 empty help drawers, cached (audit §5, Phase 3 item 15).
--
-- §5: *"150 of 158 pages show 'No help curated for this page yet.'"* The fix generates an entry from
-- the route registry — but a help drawer is opened constantly, and regenerating on every press is an
-- LLM call per keystroke of curiosity. This is the cache.
--
-- ── SHARED, NOT PER-USER, AND NOT PER-TENANT ────────────────────────────────────────────────────
--
-- Help text describes a PAGE of the software, not a firm's data. Two firms on the same deploy see
-- the same `/admin/receipts` and it does the same thing for both. Scoping this per tenant would
-- generate the same paragraph once per customer and bill for each — §1.2 classified exactly this
-- shape as `reference`, and the same argument applies.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS help_generated (
  path         text PRIMARY KEY,
  title        text NOT NULL,
  blurb        text NOT NULL,
  tips         text[] NOT NULL DEFAULT '{}',
  -- Which role generated it, so a model change can be traced when the text reads differently.
  model_role   text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  -- Set when somebody flags the text as wrong. Kept rather than deleted: a page whose generated help
  -- has been rejected twice is a page that needs a human to write it, and that signal is only
  -- visible if the rejections accumulate.
  flagged_at   timestamptz,
  flagged_by   text,
  flag_note    text
);

COMMENT ON TABLE help_generated IS
  'AI-generated help, cached by page path. Deliberately NOT tenant-scoped: help describes a page of '
  'the software, not a firm''s data, so a per-tenant copy would regenerate the same paragraph for '
  'every customer and bill for each.';

COMMENT ON COLUMN help_generated.flagged_at IS
  'Set when a reader reports the generated text as wrong. Kept rather than deleted — a page flagged '
  'repeatedly is a page that needs a human to write its help, and that only shows up if the flags '
  'accumulate.';

CREATE INDEX IF NOT EXISTS idx_help_generated_flagged ON help_generated (flagged_at) WHERE flagged_at IS NOT NULL;
