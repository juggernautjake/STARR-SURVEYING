// __tests__/dnd/edit-history-row-render.test.tsx — the DM queue's two row states, rendered.
//
// The last unrendered branch this session created. Slice 36 replaced a Revert button that could only ever
// fail — on rows carrying no `new_value` — with a "record only" marker, and slice 55's rule says: when a
// slice adds a branch that only appears in a state the tests construct, render that state.
//
// It mattered here for the same reason it mattered for the pickers. `revert-affordance.test.ts` proves the
// PREDICATE and greps the file for `isRevertableEditRow(row) ? (`. Neither shows what a DM sees, and the
// failure mode is a swapped ternary — Revert on the rows that cannot revert, "record only" on the ones that
// can — which is invisible to both and inverts the whole fix.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditHistoryRow, type EditRow } from '@/app/dnd/_sheet/components/EditReviewPanel';

const noop = () => {};
const row = (over: Partial<EditRow> = {}): EditRow => ({
  id: 'e1',
  field_path: 'ability.str',
  editor_user_id: 'u1',
  is_dm: false,
  old_value: 14,
  new_value: { op: 'set_ability', ability: 'str', value: 16 },
  created_at: '2026-07-26T12:00:00.000Z',
  editor_name: 'Vashti',
  ...over,
});

const render = (r: EditRow, busy = false) =>
  renderToStaticMarkup(<EditHistoryRow row={r} busy={busy} onRevert={noop} />);

describe('a REVERTABLE row', () => {
  const html = render(row());

  it('offers Revert', () => {
    expect(html).toContain('⟲ Revert');
    expect(html).toContain('<button');
  });

  it('and not the record-only marker', () => {
    expect(html).not.toContain('record only');
  });

  it('shows the diff, the person, and their role', () => {
    expect(html).toContain('14');
    expect(html).toContain('16');
    expect(html).toContain('Vashti');
    expect(html).toContain('player');
  });

  it('disables the button while that row is busy, without losing it', () => {
    const busy = render(row(), true);
    expect(busy).toContain('<button');
    expect(busy).toContain('disabled');
  });
});

describe('a NON-revertable row — the bespoke-sheet case', () => {
  // `ig:add_power` carries no new_value: its change lives in a sidecar the 5e Character shape cannot
  // express, so the revert route refuses it by design.
  const html = render(row({ field_path: 'ig:add_power', old_value: null, new_value: null, summary: 'Learned the Arcane Spell power.' }));

  it('offers NO Revert button — the dead control slice 36 removed', () => {
    expect(html).not.toContain('⟲ Revert');
    expect(html).not.toContain('<button');
  });

  it('says "record only" instead of leaving a blank gap', () => {
    expect(html).toContain('record only');
  });

  it('explains why, on hover, rather than only omitting the control', () => {
    expect(html).toContain('not enough to put it back');
  });

  it('STILL SHOWS the change itself — hiding it would be the worse trade', () => {
    // The row is real history. Filtering these out to avoid an awkward button was the fix slice 36
    // explicitly rejected, and this is what would catch someone re-attempting it.
    expect(html).toContain('Learned the Arcane Spell power.');
  });
});

describe('the two states are not swapped', () => {
  // The failure a grep cannot see: `isRevertableEditRow(row) ? recordOnly : button` passes every existing
  // assertion in `revert-affordance.test.ts` — the predicate is called, the branch exists, no `disabled`
  // is added — while offering Revert on exactly the rows that cannot revert.
  it('the button and the marker land on opposite rows', () => {
    const revertable = render(row());
    const bespoke = render(row({ new_value: null }));
    expect(revertable.includes('⟲ Revert')).toBe(true);
    expect(revertable.includes('record only')).toBe(false);
    expect(bespoke.includes('⟲ Revert')).toBe(false);
    expect(bespoke.includes('record only')).toBe(true);
  });
});

describe('attribution falls back safely', () => {
  it('a deleted account renders the bare role, never "null (player)"', () => {
    // `editor_user_id` is ON DELETE SET NULL, so this is a real state, not a hypothetical.
    const html = render(row({ editor_name: null, is_dm: true }));
    expect(html).toContain('DM');
    expect(html).not.toContain('null');
  });
});
