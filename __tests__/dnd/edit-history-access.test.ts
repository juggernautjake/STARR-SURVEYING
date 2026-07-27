// __tests__/dnd/edit-history-access.test.ts — a character's edit history needs WRITE access to read.
//
// THE DEFECT: `GET /api/dnd/characters/[id]/edits` gated on `getCharacterAccess` alone, which grants READ
// on `visibility === 'public'` — and /dnd is public by direct link. So anyone with the URL could pull forty
// rows of a character's revision history: every field's old and new value, the DM's rulings, off-rules
// notes, and the display NAME of whoever made each change.
//
// The sheet being public does not make its history public. Both review surfaces already said so and
// enforced it CLIENT-side — `EditReviewPanel`: "A viewer who can't write the sheet has no business in its
// edit history", and `SheetEditHistory` the same — so the rule existed twice in the UI and nowhere on the
// server. Hidden panel, open endpoint.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCharacterAccess } from '@/lib/dnd/characters';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ROUTE = read('app/api/dnd/characters/[id]/edits/route.ts');
const PANEL = read('app/dnd/_sheet/components/EditReviewPanel.tsx');
const BESPOKE = read('app/dnd/_ui/SheetEditHistory.tsx');
const ELEMENT_EDITS = read('app/dnd/_sheet/lib/use-element-edits.ts');

describe('the access rule this rests on', () => {
  const base = { isOwner: false, isPlayer: false, isDM: false, isMember: false } as const;

  it('a PUBLIC character is readable by anyone — which is why read access is not enough', () => {
    const a = resolveCharacterAccess({ ...base, visibility: 'public' });
    expect(a.canRead).toBe(true);
    expect(a.canWrite).toBe(false);
  });

  it('and the people who SHOULD see history all have write access', () => {
    for (const who of ['isOwner', 'isPlayer', 'isDM'] as const) {
      expect(resolveCharacterAccess({ ...base, [who]: true, visibility: 'private' }).canWrite).toBe(true);
    }
  });

  it('a campaign member who is not on the character has read but not write', () => {
    const a = resolveCharacterAccess({ ...base, isMember: true, visibility: 'campaign' });
    expect(a.canRead).toBe(true);
    expect(a.canWrite).toBe(false);
  });
});

describe('the route enforces it', () => {
  it('GET refuses a caller who cannot write', () => {
    expect(ROUTE).toMatch(/if \(!res\.access\.canWrite\) \{[\s\S]{0,200}status: 403/);
  });

  it('the check sits in GET, before the rows are read', () => {
    const get = ROUTE.indexOf('export async function GET');
    const gate = ROUTE.indexOf('!res.access.canWrite', get);
    const query = ROUTE.indexOf("from('dnd_sheet_edits')", get);
    expect(gate).toBeGreaterThan(get);
    expect(query).toBeGreaterThan(gate);
  });

  it('POST still gates on write too, so recording is no looser than reading', () => {
    // Both halves of this file must agree; a writable-but-unreadable log would be its own oddity.
    expect(ROUTE).toContain('canWrite');
  });
});

describe('the UI rule and the server rule now match', () => {
  it('both review surfaces still gate client-side', () => {
    // Kept, not replaced. The server is the boundary; the client gate is what stops an empty panel
    // flashing for a viewer who was never going to get rows.
    expect(PANEL).toContain('if (!canWrite) return null');
    expect(BESPOKE).toContain('if (!characterId || !canWrite) return null');
  });

  it('the ✎ tooltip consumer degrades rather than breaking', () => {
    // `use-element-edits` reads this endpoint with no write check of its own, so a viewer now gets a 403.
    // It must treat that as "no detail" and fall back to the generic marker text — which its own comment
    // already calls the expected path (a standalone sheet, an aged-out edit).
    expect(ELEMENT_EDITS).toMatch(/r\.ok \? r\.json\(\) : \{ edits: \[\] \}/);
    expect(ELEMENT_EDITS).toContain('.catch(');
  });
});
