// __tests__/dnd/slot-steps.test.tsx — the outstanding list, as screens (P5-7b).
//
// Two things are worth pinning here, and only one of them is arithmetic.
//
// THE ARITHMETIC: ids must be derived from what identifies a choice, not from its array position. The list
// SHRINKS every time a choice is answered, so a position-based id re-points at a different choice on the
// very next render — the player would answer the level-4 ASI and find themselves looking at the level-4
// Expertise screen with the ASI's half-typed draft still in it.
//
// THE BEHAVIOUR: `resolveSlotFocus` must fall back to the first remaining screen when the focused one is
// gone. That is not a defensive nicety — it is the normal path. Answering the screen you are on always
// deletes it, so the fallback runs on every single save, and if it returned null instead the walker would
// render nothing after each choice.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  slotStepId, shortSlotLabel, slotSteps, resolveSlotFocus, slotStepNav, slotStepsByLevel,
} from '@/lib/dnd/builder/slot-steps';
import SlotSteps from '@/app/dnd/_ui/builder/SlotSteps';

// A realistic 5e plan: two choices owed at one level, one at another. 5e appends "— level N" to its labels;
// PF2 and IG do not, and both shapes go through the same module.
const FIVE_E = [
  { level: 3, kind: 'subclass', label: 'Subclass — level 3' },
  { level: 4, kind: 'asi', label: 'Ability Score Improvement or feat — level 4' },
  { level: 4, kind: 'expertise', label: 'Expertise — level 4' },
];

describe('slot ids identify the CHOICE, not its place in the list', () => {
  it('an id is built from level + kind (+ track)', () => {
    expect(slotStepId({ level: 4, kind: 'asi', label: '' })).toBe('L4:asi');
    expect(slotStepId({ level: 2, kind: 'feat', track: 'class', label: '' })).toBe('L2:feat:class');
  });

  it('PF2 can owe two feats at one level and they are two different screens', () => {
    // The case that forces `track` into the id: a level-3 PF2 character owes a general feat AND a skill
    // feat. Without the track both collapse to `L3:feat`, and one of the two becomes unreachable.
    const steps = slotSteps([
      { level: 3, kind: 'feat', track: 'general', label: 'General feat' },
      { level: 3, kind: 'feat', track: 'skill', label: 'Skill feat' },
    ]);
    expect(new Set(steps.map((s) => s.id)).size).toBe(2);
  });

  it('an id survives the list shrinking around it', () => {
    const before = slotSteps(FIVE_E);
    const asi = before.find((s) => s.kind === 'asi')!;
    // The subclass gets answered and leaves the list. The ASI is now first rather than second.
    const after = slotSteps(FIVE_E.filter((c) => c.kind !== 'subclass'));
    expect(after.find((s) => s.id === asi.id)).toBeTruthy();
    expect(after[0].id).toBe(asi.id);
    expect(asi.position).toBe(2);          // it MOVED …
    expect(after[0].position).toBe(1);     // … and the id did not.
  });

  it('an identical triple twice over gets two ids rather than one shared one', () => {
    const steps = slotSteps([
      { level: 1, kind: 'cantrip', label: 'Cantrip — level 1' },
      { level: 1, kind: 'cantrip', label: 'Cantrip — level 1' },
    ]);
    expect(steps.map((s) => s.id)).toEqual(['L1:cantrip', 'L1:cantrip#2']);
  });
});

describe('labels', () => {
  it("strips 5e's trailing level, because the chip prints the level itself", () => {
    expect(shortSlotLabel('Ability Score Improvement or feat — level 4')).toBe('Ability Score Improvement or feat');
    expect(shortSlotLabel('Subclass — level 3')).toBe('Subclass');
  });

  it('leaves PF2 and IG labels alone — they never carried a level', () => {
    expect(shortSlotLabel('Class feat')).toBe('Class feat');
    expect(shortSlotLabel('Attribute boosts')).toBe('Attribute boosts');
  });

  it('a label that is ONLY a level suffix keeps its text rather than becoming empty', () => {
    // An empty chip is unclickable-looking and says nothing; the original is at least true.
    expect(shortSlotLabel('— level 7')).toBe('— level 7');
  });
});

describe('resolving which screen to show', () => {
  const steps = slotSteps(FIVE_E);

  it('no selection yet ⇒ the first screen, which is what the walker did before it had screens', () => {
    expect(resolveSlotFocus(steps, null)!.kind).toBe('subclass');
  });

  it('a selection is honoured', () => {
    expect(resolveSlotFocus(steps, 'L4:expertise')!.kind).toBe('expertise');
  });

  it('THE NORMAL PATH: the focused screen is answered and vanishes ⇒ fall to the first remaining', () => {
    const after = slotSteps(FIVE_E.filter((c) => c.kind !== 'expertise'));
    const shown = resolveSlotFocus(after, 'L4:expertise');
    expect(shown).not.toBeNull();
    expect(shown!.kind).toBe('subclass');
  });

  it('nothing outstanding ⇒ null, so the walker shows its "ready to advance" state instead', () => {
    expect(resolveSlotFocus([], 'L4:asi')).toBeNull();
    expect(resolveSlotFocus(slotSteps([]), null)).toBeNull();
  });
});

describe('previous / next', () => {
  const steps = slotSteps(FIVE_E);

  it('reports position and total against the list, not against the original plan', () => {
    expect(slotStepNav(steps, 'L4:asi')).toMatchObject({ position: 2, total: 3 });
  });

  it('does not wrap at either end — a wrap would make "next" look like progress', () => {
    expect(slotStepNav(steps, 'L3:subclass').prev).toBeNull();
    expect(slotStepNav(steps, 'L4:expertise').next).toBeNull();
  });

  it('walks forward through every screen', () => {
    expect(slotStepNav(steps, 'L3:subclass').next!.id).toBe('L4:asi');
    expect(slotStepNav(steps, 'L4:asi').next!.id).toBe('L4:expertise');
  });

  it('an empty list has no neighbours and position 0', () => {
    expect(slotStepNav([], null)).toEqual({ prev: null, next: null, position: 0, total: 0 });
  });
});

describe('grouping by level', () => {
  it('keeps first-seen level order and puts a level’s choices together', () => {
    const groups = slotStepsByLevel(slotSteps(FIVE_E));
    expect(groups.map((g) => g.level)).toEqual([3, 4]);
    expect(groups[1].steps.map((s) => s.kind)).toEqual(['asi', 'expertise']);
  });
});

describe('the strip renders as navigation, not as decoration', () => {
  const steps = slotSteps(FIVE_E);
  const html = renderToStaticMarkup(
    <SlotSteps steps={steps} activeId="L4:asi" onSelect={() => {}} targetLevel={4} />,
  );

  it('every outstanding choice gets a chip, so the shape of what is left is visible', () => {
    expect(html).toContain('Subclass');
    expect(html).toContain('Ability Score Improvement or feat');
    expect(html).toContain('Expertise');
  });

  it('groups them under their level', () => {
    expect(html).toContain('Level 3');
    expect(html).toContain('Level 4');
  });

  it('NO CHIP IS DISABLED — reaching a choice that is not first is the entire point', () => {
    // The plausible non-fix: render every chip, disable all but the current one. That looks like per-slot
    // screens and leaves the player exactly as stuck as the `outstanding[0]` walker did.
    const strip = html.slice(html.indexOf('Level 3'));
    expect(strip).not.toContain('disabled');
  });

  it('marks the active chip for a screen reader, not only with colour', () => {
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('aria-label="Outstanding choices"');
  });

  it('counts what REMAINS, and says which level it is counting towards', () => {
    expect(html).toContain('3 choices left');
    expect(html).toContain('before level 4');
  });

  it('a single outstanding choice drops the navigation instead of showing two dead arrows', () => {
    const one = renderToStaticMarkup(
      <SlotSteps steps={slotSteps([FIVE_E[0]])} activeId={null} onSelect={() => {}} targetLevel={3} />,
    );
    expect(one).toContain('Last choice');
    expect(one).not.toContain('Previous choice');
    expect(one).not.toContain('Next choice');
  });

  it('nothing outstanding renders nothing at all', () => {
    expect(renderToStaticMarkup(<SlotSteps steps={[]} activeId={null} onSelect={() => {}} />)).toBe('');
  });

  it('while a save is in flight the chips ARE disabled — a jump mid-save lands the response elsewhere', () => {
    const busy = renderToStaticMarkup(
      <SlotSteps steps={steps} activeId="L4:asi" onSelect={() => {}} disabled targetLevel={4} />,
    );
    expect(busy).toContain('disabled');
  });
});
