// __tests__/dnd/hidden-systems.test.ts — Area HIDE. Only the four playable systems (D&D 2024/2014, PF2,
// Intuitive Games) may be surfaced anywhere; every other system is hidden site-wide (kept in the registry).
// This locks the data invariant + that the system-listing surfaces filter to available.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_SYSTEMS, availableSystems, isSystemAvailable } from '@/lib/dnd/systems';
import { allLibraryPages } from '@/lib/dnd/library';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('exactly the four playable systems are available', () => {
  it('the available set is the four ready systems', () => {
    expect(availableSystems().map((s) => s.key).sort()).toEqual(
      ['dnd5e-2014', 'dnd5e-2024', 'intuitive-games', 'pathfinder2e'].sort(),
    );
    // the others exist in the registry but are NOT available (kept, hidden)
    for (const k of ['pathfinder1e', 'starfinder1e', 'coc7e', 'blades', 'cyberpunk-red', 'shadowrun6e']) {
      expect(GAME_SYSTEMS.some((s) => s.key === k)).toBe(true); // still registered
      expect(isSystemAvailable(k)).toBe(false); // but hidden
    }
  });

  it('the library only builds pages for available systems', () => {
    expect(allLibraryPages().every((p) => isSystemAvailable(p.key))).toBe(true);
  });
});

describe('the system-listing surfaces filter to available (no hidden system offered)', () => {
  it('the character builder + new-campaign pickers only map available systems', () => {
    expect(read('app/dnd/_ui/NewCharacterForm.tsx')).toContain('GAME_SYSTEMS.filter((s) => isSystemAvailable(s.key))');
    const camp = read('app/dnd/_ui/NewCampaignButton.tsx');
    expect(camp).toContain("GAME_SYSTEMS.filter((s) => s.status === 'available')");
    expect(camp).not.toContain('under construction'); // the disabled "coming later" group is gone
  });

  it('the system switcher only lists available systems (+ ambiguous / the active one)', () => {
    expect(read('app/dnd/_ui/SystemSwitcher.tsx')).toContain('GAME_SYSTEMS.filter((s) => isSystemAvailable(s.key) || s.key === active)');
  });

  it('the per-system library page 404s a hidden system', () => {
    expect(read('app/dnd/library/[key]/page.tsx')).toContain('!isSystemAvailable(params.key)');
  });
});
