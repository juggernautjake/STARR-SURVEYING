// __tests__/dnd/statblock-uses-is-displayed.test.ts
//
// P14-7 — a statblock's `uses` ("3/Day", "Recharge 5–6") reaches the screen.
//
// ── WHAT SHIPPED, AND WHAT THE NOTE CLAIMED ─────────────────────────────────────────────────────
//
// The Shipped list records P14-7 as *"Statblock `uses` … **so legendary resistance is a resource**"*.
// Verified 2026-08-04: `uses` is modelled (`homebrew/statblock.ts`), parsed on import, and RENDERED
// on the creature page. That much is real and is pinned below.
//
// **It is not a resource.** Nothing spends it. The only use-tracking in this codebase is
// `combat.abilityUses` on the 5e PLAYER sheet; a creature's `uses` is a string shown in brackets.
// Tracking a legendary resistance down from 3 needs encounter state, which is P7-12 (the session
// shell) and is unchecked.
//
// The distinction matters because "legendary resistance is a resource" is the sentence a DM would
// act on: it says the app will remember that two are left. It will not.
//
// This test pins the half that IS true, because it is one JSX conditional and the only place the
// field surfaces — a refactor could drop it and no other test would notice.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const statblock = readFileSync(join(REPO, 'lib/dnd/homebrew/statblock.ts'), 'utf8');
const page = readFileSync(join(REPO, 'app/dnd/content/[id]/page.tsx'), 'utf8');

describe('P14-7 — statblock uses', () => {
  it('is modelled on the statblock type', () => {
    expect(statblock).toMatch(/uses\?:\s*string/);
  });

  it('survives the import parse rather than being dropped', () => {
    // The field is optional, so a parser that forgot it would produce statblocks that simply never
    // have `uses` — invisible, and indistinguishable from creatures that have none.
    expect(statblock).toMatch(/str\(e\.uses\)/);
  });

  it('is rendered on the creature page', () => {
    // One conditional, one file. If it goes, the field is modelled, parsed, stored and invisible.
    expect(page).toMatch(/\{e\.uses &&/);
  });

  it('is NOT tracked as a spendable resource, and the note above says so', () => {
    // Asserted deliberately. If creature use-tracking is ever built, this fails and the Shipped
    // list's "so legendary resistance is a resource" finally becomes true — at which point both this
    // test and that line need updating together.
    const sheetState = readFileSync(join(REPO, 'app/dnd/_sheet/state/store.tsx'), 'utf8');
    expect(
      /creatureUses|statblockUses/.test(sheetState),
      'creature use-tracking appears to exist now — update P14-7 in TABLETOP_AUDIT and delete this ' +
        'assertion; the "resource" claim would finally be accurate',
    ).toBe(false);
  });
});
