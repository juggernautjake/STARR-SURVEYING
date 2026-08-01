-- seeds/525_ai_usage_log.sql — what the AI actually costs (audit §5, Phase 3 item 13).
--
-- §5 asks for *"one cost/usage log"*, and Q52 asks the owner for an acceptable monthly AI spend.
-- Neither is answerable today: six surfaces call the Anthropic client directly and none of them
-- records anything, so the only figure anybody has is the invoice, a month late, with no breakdown.
--
-- One row per call. Deliberately not aggregated: an hourly rollup answers "how much" and never
-- answers "which page", "which user", or "why did Tuesday cost triple" — and those are the questions
-- somebody actually has when the bill arrives.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid REFERENCES organizations(id),

  -- What was asked for, and what answered. `role` is the caller's intent ('reasoning', 'guard'…);
  -- `model` is what that resolved to. Both, because the mapping changes and a report that only kept
  -- the model cannot answer "did moving guard to Haiku help".
  role                 text NOT NULL,
  model                text NOT NULL,
  -- Which part of the app called. The only way a cost report names a culprit.
  surface              text NOT NULL,

  input_tokens         integer NOT NULL DEFAULT 0,
  output_tokens        integer NOT NULL DEFAULT 0,
  -- Kept separate from input so a caching win is visible. Folded into the input total it is
  -- indistinguishable from simply sending less.
  cache_read_tokens    integer NOT NULL DEFAULT 0,
  cache_write_tokens   integer NOT NULL DEFAULT 0,

  -- Approximate, from a local price table. Nullable on purpose: an unknown model records NULL rather
  -- than a guess, because a made-up number in a cost report is worse than a gap — nobody questions a
  -- number.
  estimated_cost_cents numeric(12,4),

  latency_ms           integer,
  -- Null on success. Failures are recorded too: a month where half the calls timed out still spent
  -- the tokens, and a log of successes alone cannot explain the bill.
  error                text,
  user_email           text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_time ON ai_usage_log (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_surface ON ai_usage_log (surface, created_at DESC);
-- The failure-rate query. Partial, because errors are the small minority and indexing the rest is
-- dead weight on a table that takes a write on every AI call.
CREATE INDEX IF NOT EXISTS idx_ai_usage_errors ON ai_usage_log (created_at DESC) WHERE error IS NOT NULL;

COMMENT ON TABLE ai_usage_log IS
  'One row per AI call. Not aggregated: a rollup answers "how much" and never answers "which page", '
  '"which user", or "why did Tuesday cost triple" — which are the questions somebody has when the '
  'bill arrives.';

COMMENT ON COLUMN ai_usage_log.estimated_cost_cents IS
  'Approximate, from a local price table in lib/ai/usage.ts. NULL for a model the table does not '
  'know — a gap is safer than a fabricated figure nobody questions. The invoice is authoritative.';

-- ── What it costs, by surface, this month ──
CREATE OR REPLACE VIEW ai_spend_by_surface AS
  SELECT
    org_id,
    surface,
    role,
    model,
    count(*)                                        AS calls,
    count(*) FILTER (WHERE error IS NOT NULL)       AS failures,
    sum(input_tokens)                               AS input_tokens,
    sum(output_tokens)                              AS output_tokens,
    sum(cache_read_tokens)                          AS cache_read_tokens,
    sum(estimated_cost_cents)                       AS estimated_cost_cents,
    -- Median rather than mean: one 5-minute vision call drags an average until it describes nothing.
    percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS median_latency_ms,
    max(created_at)                                 AS last_call_at
  FROM ai_usage_log
  WHERE created_at >= date_trunc('month', now())
  GROUP BY org_id, surface, role, model;

COMMENT ON VIEW ai_spend_by_surface IS
  'This calendar month''s AI spend, grouped by the surface that spent it. Answers Q52 ("what is an '
  'acceptable monthly AI spend") with a number that can be acted on rather than one that can only be '
  'observed.';
