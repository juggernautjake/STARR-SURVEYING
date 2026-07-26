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

  it('the versions/system switcher will not let you select an unbuilt system', () => {
    // …except the character's OWN current system, so a legacy character already on one still renders
    // rather than showing an empty picker.
    const sw = read('app/dnd/_ui/SystemSwitcher.tsx');
    expect(sw).toMatch(/const selectable = \(system: string\) => system === SYSTEM_AMBIGUOUS \|\| system === active \|\| isSystemAvailable\(system\)/);
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
      'app/dnd/_ui/SystemSwitcher.tsx',
      'app/dnd/library/[key]/page.tsx',
      'app/api/dnd/characters/[id]/system/route.ts',
    ]) {
      const src = read(f);
      for (const k of UNBUILT) {
        expect(src.includes(`'${k}'`), `${f} hard-codes the unbuilt system "${k}" instead of reading its status`).toBe(false);
      }
    }
  });

  it('every unbuilt system still carries the honest metadata a player is shown', () => {
    // They ARE listed (deliberately — the owner wants them visible as coming later), so each needs a real
    // name, publisher and a note saying what the system actually is. A blank row reads as a bug.
    for (const s of GAME_SYSTEMS.filter((x) => x.status === 'under-construction')) {
      expect(s.name, `${s.key} name`).toBeTruthy();
      expect(s.publisher, `${s.key} publisher`).toBeTruthy();
      expect((s.notes ?? '').length, `${s.key} notes`).toBeGreaterThan(20);
    }
  });
});
