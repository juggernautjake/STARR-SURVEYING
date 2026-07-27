// __tests__/dnd/bespoke-edit-history-render.test.tsx — what the bespoke edit history actually RENDERS.
//
// Slice 44's live pass confirmed this panel's LOADING and EMPTY states on real IG and PF2 sheets, and then
// had to record a gap: **no IG or PF2 character has any audit rows yet** — the bespoke routes only began
// recording in slice 35 and nothing has been edited since — so the POPULATED state has never been rendered
// anywhere, and proving it live needs an edit the no-mutation rule forbids during an audit.
//
// That left the row list covered by source-greps alone, which is the weakest proof this repo accepts. Its
// own history says why: a build gate passed nine source-anchored tests while refusing every legal build,
// and a green 15k-test suite missed three rendering-condition bugs in one browser pass. **A grep proves a
// branch exists; only a render proves it puts the right thing on screen.**
//
// So the markup was split into `EditHistoryView` — exactly the split `CampaignsPanel` got from
// `CharacterCampaigns`, for exactly this reason — and these render the real component.
//
// This does NOT replace the browser: no effects run, no CSS applies, and nothing here proves the panel sits
// sensibly on the page or that its colours clear AA. Slice 44 records those as still owed.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditHistoryView, type Row } from '@/app/dnd/_ui/SheetEditHistory';

const row = (over: Partial<Row> = {}): Row => ({
  id: 'e1',
  field_path: 'ig:add_power',
  is_dm: false,
  old_value: null,
  new_value: null,
  summary: 'Learned the Arcane Spell power.',
  editor_name: 'Vashti',
  created_at: '2026-07-26T12:00:00.000Z',
  ...over,
});

const render = (rows: Row[], loaded = true) => renderToStaticMarkup(<EditHistoryView rows={rows} loaded={loaded} />);

describe('the three states are distinguishable on screen', () => {
  it('loading says so, and does not claim the sheet is unedited', () => {
    const html = render([], false);
    expect(html).toContain('Loading edit history');
    expect(html).not.toContain('No edits recorded yet');
  });

  it('empty makes the stronger claim only once loaded', () => {
    const html = render([], true);
    expect(html).toContain('No edits recorded yet');
    expect(html).not.toContain('Loading edit history');
  });

  it('the heading is always present, so the panel never renders as a blank box', () => {
    for (const html of [render([], false), render([], true), render([row()])]) {
      expect(html).toContain('Edit history');
    }
  });
});

describe('a populated row — the state that has never rendered anywhere', () => {
  const html = render([row()]);

  it('shows the SENTENCE, not the opcode', () => {
    // The whole point of slice 37, now proven through the component rather than through `describeEdit`
    // in isolation: the row's `summary` has to actually reach the markup.
    expect(html).toContain('Learned the Arcane Spell power.');
    expect(html).not.toContain('ig:add_power');
  });

  it('attributes the change to a person and a role', () => {
    expect(html).toContain('Vashti');
    expect(html).toContain('player');
  });

  it('marks a DM’s change as the DM’s', () => {
    expect(render([row({ is_dm: true })])).toContain('(DM)');
  });

  it('falls back to the bare role when the account is gone', () => {
    // `editor_user_id` is ON DELETE SET NULL, so a deleted account must not render "null (player)".
    const h = render([row({ editor_name: null })]);
    expect(h).toContain('player');
    expect(h).not.toContain('null');
  });

  it('carries no Revert control, on any row', () => {
    // A bespoke row cannot be reverted (slice 36); a button here could only ever fail. Asserted on the
    // rendered CONTROL rather than the word, since the source explains at length why there is none.
    expect(html).not.toContain('<button');
    expect(render([row(), row({ id: 'e2' })])).not.toContain('<button');
  });

  it('says what the entries are FOR, since there is nothing to click', () => {
    expect(html).toContain('record what happened, not how to put it back');
  });
});

describe('the revert-audit rows stay out of the list', () => {
  it('a `revert:` row is filtered, and its absence does not empty the panel', () => {
    const html = render([row(), row({ id: 'e2', field_path: 'revert:ig:add_power', summary: 'Undid a change' })]);
    expect(html).toContain('Learned the Arcane Spell power.');
    expect(html).not.toContain('Undid a change');
  });

  it('a list of ONLY revert rows reads as empty rather than as a heading with nothing under it', () => {
    // The bug `CampaignsPanel` hit: a section gated on the unfiltered count, showing a heading over an
    // empty list. Here the empty branch must win.
    const html = render([row({ field_path: 'revert:x', summary: 'Undid a change' })]);
    expect(html).toContain('No edits recorded yet');
    expect(html).not.toContain('Undid a change');
  });
});

describe('a 5e-shaped row still reads correctly', () => {
  it('renders the before → after diff when the row carries one', () => {
    // The panel is mounted only on bespoke sheets today, but it reads the same endpoint and the same
    // formatter — so it must not mangle a row shape it could legitimately be handed.
    const html = render([row({ field_path: 'spell.Fireball.damage', old_value: '8d6', new_value: '10d6', summary: 'Buffed Fireball' })]);
    expect(html).toContain('8d6');
    expect(html).toContain('10d6');
  });
});
