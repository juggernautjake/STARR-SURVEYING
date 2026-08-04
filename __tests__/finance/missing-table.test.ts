// __tests__/finance/missing-table.test.ts
//
// FINANCE_TAX_AND_INTAKE F2b — the detection that F1b got wrong.
//
// F1b's route checked `error.code === '42P01'` on the reasonable belief that Postgres answers a
// query against a missing relation with that code. It does. **We do not talk to Postgres.** Every
// read goes through PostgREST, which rejects the name against its schema cache before generating any
// SQL and answers 404/`PGRST205`. The branch was unreachable and the carefully-worded message it
// guarded would never have rendered — the screen would have shown a raw schema-cache string as a
// 500, which is the failure the whole design existed to avoid.
//
// The literal live response is pinned below, because that is the fact the module depends on, and it
// is not one that can be derived by reading our own code.

import { describe, it, expect } from 'vitest';
import { isMissingTable, missingTableMessage } from '@/lib/finance/missing-table';

/** Verbatim from the live project, 2026-08-04, GET /rest/v1/payment_cards → 404. */
const LIVE_POSTGREST_RESPONSE = {
  code: 'PGRST205',
  details: null,
  hint: "Perhaps you meant the table 'public.payment_receipts'",
  message: "Could not find the table 'public.payment_cards' in the schema cache",
};

describe('isMissingTable', () => {
  it('recognises what the live database ACTUALLY returns for a missing table', () => {
    // The regression. This exact object reached F1b's `42P01` check and fell straight through it.
    expect(isMissingTable(LIVE_POSTGREST_RESPONSE)).toBe(true);
  });

  it('still recognises Postgres 42P01, for the paths that reach Postgres directly', () => {
    // apply-seeds.mjs and anything using node-pg with SUPABASE_DB_URL. A helper that is right in one
    // caller and wrong in the next is worse than no helper.
    expect(isMissingTable({ code: '42P01', message: 'relation "cost_recoveries" does not exist' }))
      .toBe(true);
  });

  it('does NOT treat other failures as a missing table', () => {
    // The dangerous direction. Reporting a permission failure or a dropped connection as "run the
    // seeds" sends someone to fix a thing that is not broken, and leaves the real fault unreported.
    expect(isMissingTable({ code: '42501', message: 'permission denied for table receipts' })).toBe(false);
    expect(isMissingTable({ code: 'PGRST116', message: 'no rows returned' })).toBe(false);
    expect(isMissingTable({ code: 'ECONNREFUSED' })).toBe(false);
    expect(isMissingTable(new Error('boom'))).toBe(false);
  });

  it('survives the shapes an error can arrive as without throwing', () => {
    // This runs inside a catch-adjacent branch; a helper that throws there replaces a clear message
    // with a 500 at the exact moment the clear message mattered.
    expect(isMissingTable(null)).toBe(false);
    expect(isMissingTable(undefined)).toBe(false);
    expect(isMissingTable('42P01')).toBe(false); // a bare string is not a coded error
    expect(isMissingTable({})).toBe(false);
  });
});

describe('missingTableMessage', () => {
  it('names the command that fixes it, since the reader did not cause this', () => {
    expect(missingTableMessage('card registry', 'It comes from seed 572'))
      .toContain('node scripts/apply-seeds.mjs');
  });

  it('says explicitly that this is not a claim about there being nothing to show', () => {
    // The sentence is the entire reason the distinction exists: an empty list would read as "nothing
    // is on file", which nobody checked, and would invite recording something that cannot be saved.
    expect(missingTableMessage('pass-through cost', 'It comes from seed 573')).toContain('NOT');
  });
});
