// __tests__/research/relevance-columns-schema.test.ts
//
// Source-lock for seeds/373_research_relevance_columns.sql — §10.3 of
// docs/planning/completed/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'seeds', '373_research_relevance_columns.sql'),
  'utf8',
);

describe('seeds/373 — relevance columns on extracted_data_points', () => {
  it('adds the three §10.3 columns (relevance, parcel_ref, relevance_classification)', () => {
    expect(SRC).toMatch(/ADD COLUMN IF NOT EXISTS relevance TEXT/);
    expect(SRC).toMatch(/ADD COLUMN IF NOT EXISTS parcel_ref TEXT/);
    expect(SRC).toMatch(/ADD COLUMN IF NOT EXISTS relevance_classification JSONB/);
  });

  it('targets the existing extracted_data_points table from seeds/090', () => {
    expect(SRC).toMatch(/public\.extracted_data_points/);
  });

  it('enforces RelevanceTag membership with a CHECK constraint', () => {
    expect(SRC).toMatch(/extracted_data_points_relevance_chk/);
    // The union must match canonical-schema.ts exactly.
    expect(SRC).toMatch(
      /relevance IN \('subject', 'adjoiner', 'unrelated', 'unknown'\)/,
    );
  });
});

describe('seeds/373 — partial indexes for the §10.3 filter patterns', () => {
  it('has a partial index on (project_id, relevance) for subject + adjoiner reads', () => {
    expect(SRC).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_extracted_data_points_subject_adjoiner[\s\S]*?WHERE relevance IN \('subject', 'adjoiner'\)/,
    );
  });

  it('has a partial index for the audit view of dropped/unrelated data', () => {
    expect(SRC).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_extracted_data_points_unrelated_audit[\s\S]*?WHERE relevance = 'unrelated'/,
    );
  });
});

describe('seeds/373 — migration hygiene', () => {
  it('is wrapped in a transaction', () => {
    expect(SRC).toMatch(/^BEGIN;/m);
    expect(SRC).toMatch(/COMMIT;\s*$/m);
  });

  it('is idempotent — re-running the seed must not fail or duplicate', () => {
    expect(SRC).toMatch(/IF NOT EXISTS/);
    expect(SRC).toMatch(/EXCEPTION WHEN duplicate_object THEN NULL/);
  });

  it('documents each new column with a COMMENT for future readers', () => {
    expect(SRC).toMatch(/COMMENT ON COLUMN public\.extracted_data_points\.relevance IS/);
    expect(SRC).toMatch(/COMMENT ON COLUMN public\.extracted_data_points\.parcel_ref IS/);
    expect(SRC).toMatch(/COMMENT ON COLUMN public\.extracted_data_points\.relevance_classification IS/);
  });
});
