import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Slice 5 UI — the /build/class page wires the prompt to the homebrew-class endpoint and renders the
// engine's review (errors vs warnings). Source-check (it's a client page; the logic it calls is tested
// in custom-class-ai.test.ts).
const PAGE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/characters/[id]/build/class/page.tsx'), 'utf8');
const ROUTE = fs.readFileSync(path.join(process.cwd(), 'app/api/dnd/characters/[id]/homebrew-class/route.ts'), 'utf8');
const SAVE = fs.readFileSync(path.join(process.cwd(), 'app/api/dnd/characters/[id]/homebrew-class/save/route.ts'), 'utf8');

describe('homebrew class designer page', () => {
  it('posts the prompt to the homebrew-class endpoint', () => {
    expect(PAGE).toContain('/homebrew-class');
    expect(PAGE).toContain("method: 'POST'");
  });
  it('renders the built definition + splits errors from warnings', () => {
    expect(PAGE).toContain('review.errors');
    expect(PAGE).toContain('review.warnings');
    // Was `def.features` — the read-only render of the AI's built definition. 2026-07-26 made the draft
    // EDITABLE, so features are a bound repeater over `draft.features`. See homebrew-class-editable.test.tsx.
    expect(PAGE).toContain('draft.features.map');
  });
  it('links back to the sheet and can Save (gated on a clean review)', () => {
    expect(PAGE).toContain('Back to sheet');
    expect(PAGE).toContain('/homebrew-class/save');
    // The gate is unchanged in intent; `savable` now folds the engine's verdict together with the page's own
    // completeness guard (a blank draft reviews CLEAN because parse fills defaults — see the editable test).
    expect(PAGE).toContain('!savable');
    expect(PAGE).toContain('!!built?.review.ok');
  });
});

describe('homebrew-class DRAFT endpoint is write-gated + propose-only', () => {
  it('requires write access and uses the existing engine, no persist', () => {
    expect(ROUTE).toContain('requireCharacterWrite');
    expect(ROUTE).toContain('buildCustomClass');
    expect(ROUTE).toContain('reviewCustomClass');
    expect(ROUTE).not.toContain("from('dnd_characters').update"); // proposes; does not write
  });
});

describe('homebrew-class SAVE endpoint rebuilds server-side, rejects errors, persists', () => {
  it('re-reviews and only writes when the review is clean', () => {
    expect(SAVE).toContain('requireCharacterWrite');
    expect(SAVE).toContain('buildCustomClass');       // never trusts the client definition
    expect(SAVE).toContain('if (!review.ok)');         // rejects a class with errors
    expect(SAVE).toContain('upsertHomebrewClass');     // dedupes by key
    expect(SAVE).toContain("from('dnd_characters').update"); // persists
  });
});
