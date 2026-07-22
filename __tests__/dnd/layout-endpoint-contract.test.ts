// The /layout endpoint's data-safety contract. `sheetLayout` lives INSIDE the `data` blob (not a
// column), so setting it is a read-modify-write: the endpoint must MERGE the one field onto the
// existing blob, never replace the blob. For a PF2 or IG character the blob also holds `data.pf2e`
// / `data.ig` — the character's entire sheet — so a regression that replaced the blob with just
// `{ sheetLayout }` would silently destroy the character on a layout switch. This is high-consequence
// and was unguarded; these are source-level guards (the route pulls in supabase/auth and is awkward
// to invoke in jsdom), matching the existing endpoint tests' style.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routeSrc = () =>
  readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/layout/route.ts'), 'utf8');

describe('layout endpoint — data-safety contract', () => {
  it('merges sheetLayout onto the existing data blob rather than replacing it', () => {
    const src = routeSrc().replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // The write payload must spread the current data before setting the field, so sibling keys
    // (data.pf2e, data.ig, resources, currencies, …) survive a format switch. Accept either the
    // current `row.data` source or a `character.data` alias, with the null-guard.
    expect(src).toMatch(/\{\s*\.\.\.\(\s*\w+(?:\.\w+)*\s*\?\?\s*\{\}\s*\)\s*,\s*sheetLayout/);
    // And the field it sets is the validated body layout — not a hardcoded value.
    expect(src).toMatch(/sheetLayout:\s*body\.layout/);
    // Guard against the data-loss regression: the update must not pass a fresh object literal that
    // contains ONLY sheetLayout (i.e. `update({ data: { sheetLayout ... } })` with no spread).
    expect(src).not.toMatch(/update\(\s*\{\s*data:\s*\{\s*sheetLayout[^.]*\}\s*\}\s*\)/);
  });

  it('stays owner/DM-gated and validates the layout against the character system', () => {
    const src = routeSrc();
    expect(src).toContain('requireCharacterWrite');
    // isTemplateBuiltFor is checked BEFORE the update — a request can never park a character on a
    // format its system has no shell for.
    const gateAt = src.indexOf('isTemplateBuiltFor');
    const writeAt = src.indexOf('.update(');
    expect(gateAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(writeAt);
  });
});
