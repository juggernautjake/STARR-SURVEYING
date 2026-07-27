// __tests__/dnd/walker-picker-render.test.tsx — the escape-hatch groups actually reach the DOM.
//
// S6g's whole point is that an out-of-reach pick must be OFFERED — visible, grouped, and **selectable** —
// because the server's refusal is what raises "+ Take it anyway". Until now that was proven by
// `walker-options.test.ts` (the option lists) plus source-greps for "no `disabled`". Slice 54 tried to
// confirm it in a browser and could not: the group renders only on a feat/power choice, and no live
// character offers one as its first outstanding choice — reaching one means recording a choice, which the
// no-mutation rule forbids during an audit.
//
// So the pickers are rendered directly instead. Both are pure components — no fetch, no store, no router —
// so this needs an export, not the markup split `SheetEditHistory` required.
//
// WHY A RENDER AND NOT MORE GREPS: a grep proves an `<optgroup>` is written in the file. Only a render
// proves it comes out with the right label, the right entries, and — the load-bearing part — **without
// `disabled`**, since a disabled option would look like a correct fix while leaving the hatch exactly as
// unreachable as the filter S6g removed.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeatInput, type Outstanding } from '@/app/dnd/_ui/PF2LevelBuilder';
import { PickOne } from '@/app/dnd/_ui/IGLevelBuilder';

const noop = () => {};

describe('PF2: out-of-level feats are offered, grouped, and selectable', () => {
  // A level-2 CLASS slot on a class the catalog covers well: plenty legal, plenty above.
  const choice: Outstanding = { level: 2, kind: 'feat', track: 'class', label: 'Class feat', detail: '' };
  const html = renderToStaticMarkup(<FeatInput choice={choice} className="Fighter" busy={false} onPick={noop} />);

  it('renders the out-of-reach group with its reason in the label', () => {
    expect(html).toContain('<optgroup');
    expect(html).toContain('Above your level — needs an exception');
  });

  it('the group carries feats, each labelled with the level that puts it out of reach', () => {
    // e.g. "Power Attack (level 4)" — the number is what makes the refusal legible before it happens.
    expect(html).toMatch(/\(level \d+\)/);
  });

  it('NOTHING in the group is disabled — the hatch depends on it being sendable', () => {
    const group = html.slice(html.indexOf('<optgroup'), html.indexOf('</optgroup>'));
    expect(group.length).toBeGreaterThan(0);
    expect(group).not.toContain('disabled');
  });

  it('legal feats still render outside the group, so the ordinary path is unchanged', () => {
    const before = html.slice(html.indexOf('</option>'), html.indexOf('<optgroup'));
    expect(before).toContain('<option');
  });

  it('a level-20 slot renders no group at all, rather than an empty one', () => {
    const maxed: Outstanding = { level: 20, kind: 'feat', track: 'class', label: 'Class feat', detail: '' };
    const h = renderToStaticMarkup(<FeatInput choice={maxed} className="Fighter" busy={false} onPick={noop} />);
    expect(h).not.toContain('<optgroup');
  });

  it('the ancestry track shows its cap note, since that group is truncated', () => {
    // The one track that exceeds MAX_OUT_OF_REACH. A silent truncation would read as "that's all there is".
    const anc: Outstanding = { level: 3, kind: 'feat', track: 'ancestry', label: 'Ancestry feat', detail: '' };
    const h = renderToStaticMarkup(<FeatInput choice={anc} className="Fighter" busy={false} onPick={noop} />);
    expect(h).toMatch(/further out-of-level ancestry feats aren’t listed/);
  });
});

describe('IG: other subclasses’ powers are offered the same way', () => {
  const html = renderToStaticMarkup(
    <PickOne
      options={['Arcane Spell', 'Magic Trick']}
      others={['Aspect', 'Flurry']}
      othersLabel="⊘ Not on Arcanist’s list — needs an exception"
      placeholder="— choose —"
      busy={false}
      onPick={noop}
    />,
  );

  it('renders the group with the subclass named in its label', () => {
    expect(html).toContain('<optgroup');
    expect(html).toContain('Not on Arcanist’s list — needs an exception');
  });

  it('the subclass’s OWN powers stay outside the group', () => {
    const before = html.slice(0, html.indexOf('<optgroup'));
    expect(before).toContain('Arcane Spell');
    expect(before).toContain('Magic Trick');
  });

  it('and the other subclasses’ powers are inside it, undisabled', () => {
    const group = html.slice(html.indexOf('<optgroup'), html.indexOf('</optgroup>'));
    expect(group).toContain('Aspect');
    expect(group).toContain('Flurry');
    expect(group).not.toContain('disabled');
  });

  it('no group renders when there is nothing out of scope', () => {
    const h = renderToStaticMarkup(
      <PickOne options={['Arcane Spell']} others={[]} placeholder="— choose —" busy={false} onPick={noop} />,
    );
    expect(h).not.toContain('<optgroup');
  });

  it('the missing-data path still shows free text, not the exception group', () => {
    // Champion has no catalogued powers: its own power is UNKNOWN, not an exception. Offering the group
    // there would push a player to flag a legal pick as altered vanilla to get past a gap in our data.
    const h = renderToStaticMarkup(
      <PickOne options={[]} others={['Aspect']} placeholder="— choose —" busy={false} onPick={noop} kindLabel="Subclass Power" />,
    );
    expect(h).toContain('Type your choice…');
    expect(h).not.toContain('<optgroup');
  });
});
