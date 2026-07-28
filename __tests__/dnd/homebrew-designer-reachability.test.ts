// The homebrew designers must be REACHABLE (P0-4 / audit A-3).
//
// `/dnd/characters/[id]/build/{class,subclass,feat}` shipped complete, tested and working, and nothing in
// the codebase linked to them: a repo-wide search for those paths returned only the three files' own header
// comments. They were URL-only, which for a user means absent. Their unit tests all passed the whole time,
// which is the point — **a test that a thing works is not a test that a user can get to it.**
//
// So these assertions are deliberately about WIRING, not behaviour: that a link exists, that the component
// holding it is mounted, and that it is gated to the systems whose engine can actually resolve what the
// designers emit.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isSharedEngineSystem } from '@/lib/dnd/systems';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const DESIGNERS = ['class', 'subclass', 'feat'] as const;
const LINKS = 'app/dnd/_ui/HomebrewDesignerLinks.tsx';
const SHEET_PAGE = 'app/dnd/characters/[id]/page.tsx';

describe('the homebrew designers are reachable by clicking', () => {
  it('all three designer pages still exist', () => {
    for (const d of DESIGNERS) {
      expect(existsSync(join(process.cwd(), `app/dnd/characters/[id]/build/${d}/page.tsx`)), d).toBe(true);
    }
  });

  it('something links to each of them', () => {
    const src = read(LINKS);
    for (const d of DESIGNERS) {
      expect(src, `nothing links to /build/${d}`).toContain(`/build/${d}`);
    }
  });

  it('and that something is actually MOUNTED on the character sheet page', () => {
    // The half that A-3 was missing. A link component nobody renders is the same defect one level up.
    const page = read(SHEET_PAGE);
    expect(page).toContain('HomebrewDesignerLinks');
    expect(page, 'it must be rendered, not merely imported').toMatch(/<HomebrewDesignerLinks/);
  });

  it('is offered only to people who can edit the character', () => {
    const page = read(SHEET_PAGE);
    // Rendered inside a `canWrite &&` guard — authoring content onto someone else's sheet is not a thing.
    expect(page).toMatch(/canWrite && \(\s*<HomebrewDesignerLinks/);
  });
});

describe('the system gate is real, in both directions', () => {
  it('gates on isSharedEngineSystem rather than a hard-coded key list', () => {
    // Hard-coding 'dnd5e-2024' here is how a gate drifts from the registry it is supposed to mirror.
    const src = read(LINKS);
    expect(src).toContain('isSharedEngineSystem');
    expect(src, 'no hard-coded system keys in the gate').not.toMatch(/system === 'dnd5e/);
  });

  it('the two 5e editions get the designers', () => {
    for (const s of ['dnd5e-2014', 'dnd5e-2024']) expect(isSharedEngineSystem(s), s).toBe(true);
  });

  it('PF2 and IG do NOT — their engines cannot resolve a 5e ClassDefinition', () => {
    // This is the assertion that keeps the link from becoming a trap. `lib/dnd/classes/registry.ts`
    // resolves classes for the 5e keys only, so a PF2/IG character authoring one would save something
    // that never takes effect — worse than an absent button.
    for (const s of ['pathfinder2e', 'intuitive-games']) expect(isSharedEngineSystem(s), s).toBe(false);
  });

  it('and those systems are told WHY, plus where to go instead', () => {
    const src = read(LINKS);
    expect(src, 'a disabled affordance with no explanation reads as a bug').toMatch(/cannot resolve/i);
    expect(src, 'point at the escape hatch that DOES work there').toMatch(/Add a different/);
  });
});
