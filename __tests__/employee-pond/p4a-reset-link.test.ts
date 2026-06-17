// __tests__/employee-pond/p4a-reset-link.test.ts
//
// Slice P4a (employee-pond-polish-2026-06-16) — user feedback:
//   "Right below the viewer window there should be small text that
//    says 'reset' which will return the viewer to the center and
//    refresh all of the employee icons/orbs."
//
// P4a ships the re-randomize half (the camera return-to-center
// will follow in P4b once the scroll ring exists; today the camera
// is always at (0,0) so the reset behavior is identical to the
// user's spec). Locks here cover:
//   - the seed folds in a `respawnNonce` so each Reset click yields
//     a new layout
//   - a `<button>.employee-pond__reset` renders below the pond, with
//     a stable testid
//   - the physics hook clears prior orb positions when the seed
//     changes (so Reset actually moves every visible orb)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('EmployeePond — seed bumps on Reset (P4a)', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('introduces a respawnNonce state that the user can bump', () => {
    expect(SRC).toMatch(/const \[respawnNonce, setRespawnNonce\] = useState<number>/);
  });

  it('the seed folds employees-hash XOR respawnNonce so Reset produces a new layout', () => {
    expect(SRC).toMatch(/\(buildPondSeed\(employees\) \^ respawnNonce\)\s*>>>\s*0/);
    expect(SRC).toMatch(/useMemo\(\s*\(\)\s*=>\s*\(buildPondSeed\(employees\) \^ respawnNonce\)[\s\S]*?,\s*\[employees, respawnNonce\]/);
  });

  it('handleReset bumps the nonce when invoked', () => {
    expect(SRC).toMatch(/const handleReset = useCallback\([\s\S]*?setRespawnNonce\(\(n\)/);
  });

  it('renders the Reset button below the pond surface with a stable testid', () => {
    expect(SRC).toMatch(/className="employee-pond__reset"[\s\S]*?onClick=\{handleReset\}/);
    expect(SRC).toMatch(/data-testid="employee-pond-reset"/);
  });
});

describe('useEmployeePondPhysics — seed change forces a full respawn (P4a)', () => {
  const HOOK = read('app/admin/employees/useEmployeePondPhysics.ts');

  it('tracks the last seed via a ref', () => {
    expect(HOOK).toMatch(/const lastSeedRef = useRef<number \| null>\(null\)/);
  });

  it("clears prior orb positions when the seed changes (`seedChanged` branch)", () => {
    expect(HOOK).toMatch(/const seedChanged = lastSeedRef\.current !== args\.seed/);
    expect(HOOK).toMatch(/existing = seedChanged \? new Map<string, OrbState>\(\) : orbByIdRef\.current/);
  });

  it('updates the lastSeedRef at the end of the sync-effect so subsequent runs compare correctly', () => {
    expect(HOOK).toMatch(/lastSeedRef\.current = args\.seed;/);
  });
});

describe('EmployeePond CSS — Reset link styling (P4a)', () => {
  const CSS = read('app/admin/styles/EmployeePond.css');

  it('declares a centered wrap + a subtle link-style button', () => {
    expect(CSS).toMatch(/\.employee-pond__reset-wrap\s*\{[\s\S]*?justify-content:\s*center/);
    expect(CSS).toMatch(/\.employee-pond__reset\s*\{[\s\S]*?text-decoration:\s*underline/);
  });

  it('paints the link in the brand navy on hover / focus-visible', () => {
    expect(CSS).toMatch(/\.employee-pond__reset:hover[\s\S]*?\.employee-pond__reset:focus-visible\s*\{[\s\S]*?color:\s*var\(--color-brand-navy/);
  });
});
