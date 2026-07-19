// __tests__/dnd/sheet-visibility-toggle.test.ts — the owner's Private/Public control + its placement.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const toggle = readFileSync(join(process.cwd(), 'app/dnd/_ui/SheetVisibilityToggle.tsx'), 'utf8');
const page = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/page.tsx'), 'utf8');

describe('SheetVisibilityToggle', () => {
  it('is a client control that PATCHes the character visibility', () => {
    expect(toggle).toContain("'use client'");
    expect(toggle).toContain('/api/dnd/characters/${characterId}');
    expect(toggle).toContain("method: 'PATCH'");
    expect(toggle).toContain("JSON.stringify({ visibility: next })");
  });

  it('offers Private and Public with clear meaning', () => {
    expect(toggle).toContain('Private');
    expect(toggle).toContain('Public');
    expect(toggle).toMatch(/only you and (your|the) DM/i);
  });

  it('is shown ONLY to the owner on the sheet page (the creator sets visibility)', () => {
    expect(page).toContain('const { character, isDM, canWrite, isOwner } = res.access');
    expect(page).toContain('{isOwner && <SheetVisibilityToggle');
  });
});
