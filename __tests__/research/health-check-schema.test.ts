// __tests__/research/health-check-schema.test.ts
//
// Source-lock for seeds/371_research_health_check_tables.sql — §9.2 +
// §9.3 + §9.4 of
// docs/planning/completed/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'seeds', '371_research_health_check_tables.sql'),
  'utf8',
);

describe('seeds/371 — research_adapter_canaries (§9.2)', () => {
  it('creates the table', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.research_adapter_canaries/);
  });

  it('has the columns the canary-diff slice writes into', () => {
    for (const col of [
      'adapter_id',
      'query_input',
      'expected_fields',
      'baseline_dom_hash',
      'baseline_dom_skeleton',
      'baseline_screenshot_ref',
      'is_active',
      'captured_at',
    ]) {
      expect(SRC).toContain(col);
    }
  });

  it('FKs adapter_id → research_site_adapters with ON DELETE CASCADE', () => {
    expect(SRC).toMatch(
      /adapter_id\s+UUID NOT NULL REFERENCES public\.research_site_adapters\(id\) ON DELETE CASCADE/,
    );
  });

  it('has a partial index on the active baseline so lookups are O(1)', () => {
    expect(SRC).toMatch(/idx_research_adapter_canaries_adapter_active[\s\S]*?WHERE is_active = TRUE/);
  });
});

describe('seeds/371 — research_adapter_health_checks (§9.3)', () => {
  it('creates the table', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.research_adapter_health_checks/);
  });

  it('has the columns required to stamp a three-layer verdict', () => {
    for (const col of [
      'adapter_id',
      'canary_id',
      'ran_at',
      'triggered_by',
      'status',
      'layer_results',
      'diff_summary',
      'screenshot_ref',
      'http_status',
      'cost_tokens',
      'duration_ms',
    ]) {
      expect(SRC).toContain(col);
    }
  });

  it('declares the health-status enum with the five buckets', () => {
    for (const v of ["'healthy'", "'degraded'", "'broken'", "'no_record'", "'error'"]) {
      expect(SRC).toContain(v);
    }
  });

  it('has a partial index on failures so the §9.8 dashboard can list them cheaply', () => {
    expect(SRC).toMatch(
      /idx_research_adapter_health_checks_failures[\s\S]*?WHERE status IN \('degraded', 'broken', 'error'\)/,
    );
  });

  it('append-only (no updated_at trigger on health checks)', () => {
    // The trigger create block exists for canaries + proposals but
    // NOT for health_checks (audit trail integrity).
    expect(SRC).not.toMatch(
      /trg_research_adapter_health_checks_updated/,
    );
  });
});

describe('seeds/371 — research_adapter_change_proposals (§9.4)', () => {
  it('creates the table', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.research_adapter_change_proposals/);
  });

  it('has prior_config + prior_field_map so applies are reversible', () => {
    expect(SRC).toContain('prior_config');
    expect(SRC).toContain('prior_field_map');
  });

  it('has proposed_config + proposed_field_map for the AI repair output', () => {
    expect(SRC).toContain('proposed_config');
    expect(SRC).toContain('proposed_field_map');
  });

  it('carries rationale + confidence + canary_test_passed + status', () => {
    for (const col of ['rationale', 'confidence', 'canary_test_passed', 'canary_test_summary', 'status']) {
      expect(SRC).toContain(col);
    }
  });

  it('declares the proposal-status enum with the lifecycle states', () => {
    for (const v of ["'proposed'", "'approved'", "'rejected'", "'applied'", "'superseded'"]) {
      expect(SRC).toContain(v);
    }
  });

  it('has a partial index on pending proposals for the review queue', () => {
    expect(SRC).toMatch(
      /idx_research_adapter_change_proposals_pending[\s\S]*?WHERE status = 'proposed'/,
    );
  });
});

describe('seeds/371 — migration hygiene', () => {
  it('is wrapped in a transaction', () => {
    expect(SRC).toMatch(/^BEGIN;/m);
    expect(SRC).toMatch(/COMMIT;\s*$/m);
  });

  it('is idempotent — re-running the seed must not fail', () => {
    expect(SRC).toMatch(/IF NOT EXISTS/);
    expect(SRC).toMatch(/EXCEPTION WHEN duplicate_object THEN NULL/);
  });

  it('reuses the research_set_updated_at function from seed 370 (no duplicate definition)', () => {
    // The trigger references the function by name but does NOT
    // create it (it lives in seed 370). Re-creating it here would
    // silently shadow.
    expect(SRC).toMatch(/EXECUTE FUNCTION public\.research_set_updated_at/);
    expect(SRC).not.toMatch(/CREATE OR REPLACE FUNCTION public\.research_set_updated_at/);
  });
});
