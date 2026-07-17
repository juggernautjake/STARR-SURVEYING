import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Slice 5 UI — the /build/feat page + endpoint (the feat logic is unit-tested in custom-class-ai.test.ts).
const PAGE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/characters/[id]/build/feat/page.tsx'), 'utf8');
const ROUTE = fs.readFileSync(path.join(process.cwd(), 'app/api/dnd/characters/[id]/homebrew-feat/route.ts'), 'utf8');
const SAVE = fs.readFileSync(path.join(process.cwd(), 'app/api/dnd/characters/[id]/homebrew-feat/save/route.ts'), 'utf8');

describe('homebrew feat designer', () => {
  it('page posts the prompt to the homebrew-feat endpoint + renders the review', () => {
    expect(PAGE).toContain('/homebrew-feat');
    expect(PAGE).toContain("method: 'POST'");
    expect(PAGE).toContain('review.errors');
    expect(PAGE).toContain('review.warnings');
    expect(PAGE).toContain('feat.body');
  });
  it('draft endpoint is write-gated + uses the existing engine, propose-only', () => {
    expect(ROUTE).toContain('requireCharacterWrite');
    expect(ROUTE).toContain('buildCustomFeat');
    expect(ROUTE).toContain('reviewCustomFeat');
    expect(ROUTE).not.toContain("from('dnd_characters').update");
  });
  it('save endpoint rebuilds server-side, rejects errors, persists', () => {
    expect(SAVE).toContain('requireCharacterWrite');
    expect(SAVE).toContain('buildCustomFeat');
    expect(SAVE).toContain('if (!review.ok)');
    expect(SAVE).toContain('upsertHomebrewFeat');
    expect(SAVE).toContain("from('dnd_characters').update");
  });
  it('page has a Save button gated on a clean review', () => {
    expect(PAGE).toContain('/homebrew-feat/save');
    expect(PAGE).toContain('!result.review.ok');
  });
});
