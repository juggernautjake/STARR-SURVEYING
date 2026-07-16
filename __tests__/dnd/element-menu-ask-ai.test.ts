// __tests__/dnd/element-menu-ask-ai.test.ts — the ⋯ menu's "Ask AI about this" (Slice 27).
//
// The menu extras the slice named were "Change art / Add effect / Ask AI about this". This ships the
// last one as a built-in on the shared ElementMenu, so it appears on every element (attacks, items,
// spells, features, resources) from one place — reusing the Slice-3 librarian, pre-filled with the
// element, and only when the sheet has a system to ask against.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MENU = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/ui/ElementMenu.tsx'), 'utf8');
const COMBAT = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/CombatPanel.tsx'), 'utf8');

describe('ElementMenu offers "Ask AI about this" built-in', () => {
  it('synthesises the item from the element label, opening the librarian pre-filled', () => {
    expect(MENU).toContain('Ask AI about this');
    expect(MENU).toContain('/dnd/library/');
    expect(MENU).toContain('#chat');
    expect(MENU).toContain('askUrl(system, subject)');
  });

  it('defaults the subject to the element label, opt-out via askAiAbout={null}', () => {
    expect(MENU).toContain('askAiAbout === null ? null : (askAiAbout ?? label)');
  });

  it('is hidden when the sheet has no system (no rulebook to ask against)', () => {
    // A librarian with no rulebook can only guess — the one thing this platform refuses to do.
    expect(MENU).toContain('system !== SYSTEM_AMBIGUOUS');
  });

  it('is not offered on a generic-labelled trait row', () => {
    expect(COMBAT).toContain('askAiAbout={null}');
  });
});
