// __tests__/dnd/element-menu-ask-ai.test.ts — the ⋯ menu's "Ask AI about this" (Slice 27).
//
// The menu extras the slice named were "Change art / Add effect / Ask AI about this". This ships the
// last one as a built-in on the shared ElementMenu, so it appears on every element (attacks, items,
// spells, features, resources) from one place — reusing the Slice-3 librarian, pre-filled with the
// element, and only when the sheet has a system to ask against.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { askUrl } from '@/app/dnd/_sheet/components/ui/ElementMenu';

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

describe('askUrl — the librarian deep-link is encoded safely', () => {
  it('targets the system library with the subject pre-filled in the ?ask query', () => {
    const url = askUrl('dnd5e-2024', 'Fireball');
    expect(url.startsWith('/dnd/library/dnd5e-2024?ask=')).toBe(true);
    // The subject rides inside the decoded query text.
    const q = decodeURIComponent(new URL(url, 'https://x').searchParams.get('ask')!);
    expect(q).toContain('Fireball');
  });

  it('puts the #chat fragment OUTSIDE the query (a deep-link that focuses the chat, not a literal ?ask=…%23chat)', () => {
    const url = askUrl('dnd5e-2024', 'Fireball');
    expect(url.endsWith('#chat')).toBe(true);
    // the encoded query must NOT swallow the fragment
    expect(url.split('#chat')[0]).not.toContain('#');
    expect(new URL(url, 'https://x').hash).toBe('#chat');
  });

  it('encodes a subject with ampersands / spaces so the link never breaks', () => {
    const url = askUrl('pathfinder2e', "Melf's Acid Arrow & Co");
    // spaces and the query-splitting ampersand must be encoded (an apostrophe is URL-safe and left literal
    // by encodeURIComponent — harmless, not a delimiter).
    expect(url).not.toContain(' ');
    expect(url).not.toContain('Arrow & Co'); // the raw ampersand did not survive
    // the ampersand is encoded, so it can't be read as a second query param.
    const parsed = new URL(url, 'https://x');
    expect([...parsed.searchParams.keys()]).toEqual(['ask']); // exactly one param, not split on the &
    expect(decodeURIComponent(parsed.searchParams.get('ask')!)).toContain("Melf's Acid Arrow & Co");
  });

  it('encodes the system segment too (a system id is path-safe)', () => {
    expect(askUrl('a/b system', 'X')).toContain('/dnd/library/a%2Fb%20system?ask=');
  });
});
