// __tests__/dnd/under-construction-gating.test.ts — the six seeded-but-unbuilt game systems are offered
// HONESTLY until they are actually built (DND_SYSTEMS_UNDER_CONSTRUCTION).
//
// Those systems can't be built out yet — each needs its own source-verified rules model, which is a
// per-system project (see that doc). What CAN be guaranteed today, and is what this file locks, is that
// nothing lets a player start building one and discover halfway that it doesn't work. `system-integrity`
// already asserts the six carry `status: 'under-construction'`; this asserts every SURFACE honours that,
// including the server route a client can POST to directly.
//
// This is the standing safety net for the whole "under construction" period: when a system is genuinely
// finished and its status flips to 'available', these tests keep passing on their own — the lists here are
// derived from `GAME_SYSTEMS`, not hard-coded — so flipping the flag is all that's needed.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_SYSTEMS, isSystemAvailable } from '@/lib/dnd/systems';
import { searchLibrary } from '@/lib/dnd/library';
import { rulesForSystem } from '@/lib/dnd/system-rules';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const UNBUILT = GAME_SYSTEMS.filter((s) => s.status === 'under-construction').map((s) => s.key);
const BUILT = GAME_SYSTEMS.filter((s) => s.status === 'available').map((s) => s.key);

describe('the unbuilt systems are gated at every surface, not just labelled', () => {
  it('there are systems in both states — otherwise this whole file is vacuous', () => {
    expect(UNBUILT.length).toBeGreaterThan(0);
    expect(BUILT.length).toBeGreaterThan(0);
  });

  it('the SERVER refuses to switch a character onto an unbuilt system', () => {
    // The one that actually matters: every UI below can be bypassed with a direct POST. The route must
    // reject on its own rather than trusting that the picker never offered the option.
    const route = read('app/api/dnd/characters/[id]/system/route.ts');
    expect(route).toContain('isSystemAvailable');
    expect(route).toMatch(/if \(!isSystemAvailable\(target\)\) return NextResponse\.json\(\s*\{ error: '[^']+' \}, \{ status: 400 \}/);
  });

  it('the create-character picker offers only built systems', () => {
    const form = read('app/dnd/_ui/NewCharacterForm.tsx');
    expect(form).toContain('GAME_SYSTEMS.filter((s) => isSystemAvailable(s.key))');
  });

  it('the versions/system picker is never OFFERED an unbuilt system', () => {
    // RE-POINTED 2026-07-28 (P4-6b), and the reason matters. This read `SystemSwitcher.tsx` — retired from
    // the sheet page at consolidation C3 and rendered by nothing — so this assertion has been verifying a
    // client-side gate on **code that never runs**. The unbuilt-system guard looked complete and had a hole
    // exactly where an orphan sat, which is the audit's whole thesis in one test.
    //
    // The live picker is `VariantBrowser`'s transpose control, and the gate there is a better shape: the
    // page only ever passes it `availableSystems()`, so it cannot offer an unbuilt system even by mistake.
    // There is nothing to filter, because nothing unbuilt ever arrives.
    const page = read('app/dnd/characters/[id]/page.tsx');
    expect(page).toContain('const transposeSystems = availableSystems()');
    expect(page).toMatch(/transposeSystems=\{transposeSystems\}/);
    expect(page, 'the picker must not be handed the raw registry').not.toMatch(/transposeSystems = GAME_SYSTEMS/);
  });

  it('the public library hides an unbuilt system’s page (404, and not pre-rendered)', () => {
    const lib = read('app/dnd/library/[key]/page.tsx');
    expect(lib).toContain('GAME_SYSTEMS.filter((s) => isSystemAvailable(s.key)).map((s) => ({ key: s.key }))');
    expect(lib).toMatch(/if \(!page \|\| !isSystemAvailable\(params\.key\)\) notFound\(\)/);
  });

  it('the gate derives from the status flag, so finishing a system needs no code changes', () => {
    // The bar in the doc is "flip `status` to 'available' only when the system genuinely meets it". That
    // is only a one-line change if nothing anywhere hard-codes the six keys.
    for (const k of UNBUILT) expect(isSystemAvailable(k), `${k} should be gated`).toBe(false);
    for (const k of BUILT) expect(isSystemAvailable(k), `${k} should be open`).toBe(true);
    for (const f of [
      'app/dnd/_ui/NewCharacterForm.tsx',
      // Was SystemSwitcher.tsx until P4-6b — an orphan, so it proved nothing. The character page is where
      // the live picker is fed from.
      'app/dnd/characters/[id]/page.tsx',
      'app/dnd/library/[key]/page.tsx',
      'app/api/dnd/characters/[id]/system/route.ts',
      'app/dnd/_ui/LibrarySearch.tsx',
      'app/api/dnd/library/search/route.ts',
      // NOT `lib/dnd/library.ts`: it names these systems legitimately, for their own VOCABULARY — Blades
      // has Playbooks and Heritages, CoC has Occupations, PF1 still says Races. That is content, not a gate.
    ]) {
      const src = read(f);
      for (const k of UNBUILT) {
        expect(src.includes(`'${k}'`), `${f} hard-codes the unbuilt system "${k}" instead of reading its status`).toBe(false);
      }
    }
  });

  // ── The RULES are published; only the BUILDER is gated (found + fixed 2026-07-26) ────────────────
  //
  // This distinction is the whole point of the four tests below, and getting it wrong in either direction
  // is a real defect. The six have substantial authored rules in `system-rules-extra.ts`, and Slice 8b's
  // `library.test.ts` deliberately asserts they are *fully explained* by search ("a non-d20 system's own
  // vocabulary is fully explained"). But the owner hid their PAGES site-wide on 2026-07-18, so
  // `/dnd/library/[key]` `notFound()`s them — and search kept linking every hit there. Searching "sanity"
  // found Call of Cthulhu's article and clicking it 404'd.
  //
  // My first fix was to stop searching them, which broke those four Slice-8b tests — correctly, because it
  // was throwing away content we have. The defect was never the search; it was the LINK. A hit renders its
  // whole explanation inline, so unlinking costs the reader nothing.
  it('an unbuilt system\'s rules stay searchable — the content is real', () => {
    for (const key of UNBUILT) {
      expect(rulesForSystem(key), `${key} has authored rules`).toBeTruthy();
    }
    // The specific vocabulary Slice 8b pinned, asserted here too so the two intents stay visibly linked.
    expect(searchLibrary('sanity', 'coc7e').length).toBeGreaterThan(0);
    expect(searchLibrary('stress', 'blades').length).toBeGreaterThan(0);
  });

  it('but the search UI never LINKS a hit whose page is hidden', () => {
    const ui = read('app/dnd/_ui/LibrarySearch.tsx');
    // Both the per-system group header and each individual hit have to check — the header was a link to
    // `/dnd/library/{system}` too, which is the same 404.
    expect(ui.match(/isSystemAvailable\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(ui).toContain('isSystemAvailable(list[0].system)');
    expect(ui).toContain('isSystemAvailable(h.system)');
    // …and says why, rather than looking like a result that failed to render.
    expect(ui).toContain('builder in development');
  });

  it('the search API does not refuse an unbuilt system', () => {
    // Refusing would discard authored content. Only an UNKNOWN key is rejected.
    const route = read('app/api/dnd/library/search/route.ts');
    expect(route).toContain('Unknown system');
    expect(route).not.toContain('isSystemAvailable');
  });

  it('the librarian may still be pointed at one, because its grounding is authored', () => {
    // The unsafe version of this would be a focus with NO grounding, where the model would answer from its
    // own recall — Ground Rule 3's exact failure mode. That is not the case here: `systemGroundingBlock`
    // reads the same authored catalog the search hits come from.
    expect(read('app/dnd/_ui/LibraryChat.tsx')).toContain('GAME_SYSTEMS.map((s) => (');
    for (const key of UNBUILT) expect(rulesForSystem(key), `${key} grounding`).toBeTruthy();
  });

  it('every unbuilt system still carries the honest metadata a player is shown', () => {
    // CORRECTED 2026-07-26: this used to say "they ARE listed, so a blank row reads as a bug". They are
    // not listed any more — the owner hid them site-wide on 2026-07-18 behind one "more systems coming
    // soon" card. The metadata is still required, because it is what the pickers will render the moment a
    // `status` flips to 'available', and a system finished by someone who never read this doc should not
    // also have to discover it needs a publisher and a note.
    for (const s of GAME_SYSTEMS.filter((x) => x.status === 'under-construction')) {
      expect(s.name, `${s.key} name`).toBeTruthy();
      expect(s.publisher, `${s.key} publisher`).toBeTruthy();
      expect((s.notes ?? '').length, `${s.key} notes`).toBeGreaterThan(20);
    }
  });
});
