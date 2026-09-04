import { describe, it, expect } from 'vitest';
import { planIdentityBackfill, type BackfillRow } from '../research/identity-backfill.js';
import { identityKey } from '../research/document-identity.js';
import { refFromRow } from '../research/project-library.js';

// ── D4: backfill identity_key on legacy rows, reconciling duplicates in the same plan ────────────
//
// The plan must produce the SAME key a fresh run would (refFromRow → identityKey), and — because of
// the partial unique index on (project, identity_key) WHERE duplicate_of IS NULL — must mark all but
// one row in a key group as duplicate_of the canonical, or the second UPDATE would be rejected.

const county = new Map([['p1', 'BELL']]);
const row = (id: string, over: Partial<BackfillRow> = {}): BackfillRow => ({
  id, research_project_id: 'p1', identity_key: null, duplicate_of: null,
  recording_info: 'Instrument No. 2004032468', created_at: '2026-01-01T00:00:00Z', ...over,
});

// The key the pipeline assigns for that instrument, computed the same way the plan does.
const KEY = identityKey(refFromRow({ recording_info: 'Instrument No. 2004032468' }, 'BELL'));

describe('planIdentityBackfill', () => {
  it('CONTROL: the instrument keys to a non-null, year-stamped identity', () => {
    expect(KEY).toBeTruthy();
    expect(KEY).toContain('2004032468');
  });

  it('keys a lone legacy row, with no duplicate_of', () => {
    const plan = planIdentityBackfill([row('a')], county);
    expect(plan.updates).toEqual([{ id: 'a', identity_key: KEY! }]);
    expect(plan.duplicateGroups).toBe(0);
  });

  it('a two-row key group: earliest is canonical, the later is marked duplicate_of it', () => {
    const plan = planIdentityBackfill([
      row('late', { created_at: '2026-03-01T00:00:00Z' }),
      row('early', { created_at: '2026-01-01T00:00:00Z' }),
    ], county);
    expect(plan.duplicateGroups).toBe(1);
    const canonical = plan.updates.find((u) => u.id === 'early')!;
    const dup = plan.updates.find((u) => u.id === 'late')!;
    expect(canonical).toEqual({ id: 'early', identity_key: KEY! });        // key only, stays canonical
    expect(dup.identity_key).toBe(KEY);
    expect(dup.duplicate_of).toBe('early');                                 // points at the canonical
    expect(dup.duplicate_reason).toContain('backfill');
  });

  it('an existing canonical keeps the slot; a new legacy copy becomes its duplicate', () => {
    const plan = planIdentityBackfill([
      row('existing', { identity_key: KEY!, created_at: '2026-05-01T00:00:00Z' }), // already keyed, dup_of null
      row('legacy', { created_at: '2026-01-01T00:00:00Z' }),                        // older, but not canonical
    ], county);
    // The existing keyed row is left alone even though the legacy row is older.
    expect(plan.updates.find((u) => u.id === 'existing')).toBeUndefined();
    expect(plan.alreadyCorrect).toBe(1);
    const dup = plan.updates.find((u) => u.id === 'legacy')!;
    expect(dup.duplicate_of).toBe('existing');
  });

  it('never repoints a row that already has a duplicate_of lineage', () => {
    const plan = planIdentityBackfill([
      row('canon', { created_at: '2026-01-01T00:00:00Z' }),
      row('olddup', { duplicate_of: 'somewhere-else', created_at: '2026-02-01T00:00:00Z' }),
    ], county);
    const dup = plan.updates.find((u) => u.id === 'olddup')!;
    expect(dup.identity_key).toBe(KEY);          // it still gets the key
    expect(dup.duplicate_of).toBeUndefined();    // but its existing lineage is untouched
  });

  it('a key group whose only rows are already duplicates gets keys, no forced canonical (idempotent)', () => {
    // The bug that shipped on 2026-09-04: a row already marked duplicate_of another document was
    // chosen as canonical and its key written without clearing duplicate_of, so the group never had
    // a canonical and the plan re-proposed the same write on every pass. Now such rows only get the
    // key filled in, and a second pass proposes nothing.
    const rows = [
      row('dupA', { duplicate_of: 'other-doc-1', created_at: '2026-01-01T00:00:00Z' }),
      row('dupB', { duplicate_of: 'other-doc-2', created_at: '2026-02-01T00:00:00Z' }),
    ];
    const first = planIdentityBackfill(rows, county);
    expect(first.updates).toHaveLength(2);
    expect(first.updates.every((u) => u.identity_key === KEY && u.duplicate_of === undefined)).toBe(true);
    // Apply the plan in memory, then re-plan: nothing left to do.
    for (const u of first.updates) { const r = rows.find((x) => x.id === u.id)!; r.identity_key = u.identity_key; }
    const second = planIdentityBackfill(rows, county);
    expect(second.updates).toHaveLength(0);
    expect(second.alreadyCorrect).toBe(2);
  });

  it('leaves an unkeyable row alone and counts it', () => {
    const plan = planIdentityBackfill([
      row('nokey', { recording_info: null, document_label: 'Aerial view', original_filename: 'aerial.png', harvest_metadata: null }),
    ], county);
    expect(plan.updates).toHaveLength(0);
    expect(plan.unkeyable).toBe(1);
  });

  it('is idempotent: rows already keyed and reconciled produce no updates', () => {
    const plan = planIdentityBackfill([
      row('c', { identity_key: KEY!, created_at: '2026-01-01T00:00:00Z' }),
      row('d', { identity_key: KEY!, duplicate_of: 'c', created_at: '2026-02-01T00:00:00Z' }),
    ], county);
    expect(plan.updates).toHaveLength(0);
    expect(plan.alreadyCorrect).toBe(2);
  });
});
