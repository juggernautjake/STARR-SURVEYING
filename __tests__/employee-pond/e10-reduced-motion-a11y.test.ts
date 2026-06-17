// __tests__/employee-pond/e10-reduced-motion-a11y.test.ts
//
// employee-pond Slice E10 — prefers-reduced-motion + a11y audit.
// Locks the reduced-motion detection, the hook's static-position
// fallback when the loop is disabled, the focus-return on dialogue
// close, and the pond surface's accessible name + role.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('EmployeePond.tsx — E10 reduced-motion detection', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('subscribes to the prefers-reduced-motion media query', () => {
    expect(SRC).toMatch(/window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  });

  it('updates state on change so a user toggling OS settings live propagates', () => {
    expect(SRC).toMatch(/mq\.addEventListener\('change', onChange\)/);
    expect(SRC).toMatch(/mq\.removeEventListener\('change', onChange\)/);
  });

  it('passes !reduceMotion as the physics hook enabled flag', () => {
    expect(SRC).toMatch(/enabled: !reduceMotion,/);
  });

  it('spawnParticles short-circuits when reduceMotion is true', () => {
    expect(SRC).toMatch(/if \(reduceMotion\) return;/);
  });
});

describe('useEmployeePondPhysics — E10 static fallback', () => {
  const SRC = read('app/admin/employees/useEmployeePondPhysics.ts');

  it('writes static transforms when enabled is false (orbs don\'t stack at center)', () => {
    expect(SRC).toMatch(/if \(args\.enabled\) return;[\s\S]*?for \(const orb of orbsRef\.current\)[\s\S]*?el\.style\.transform =/);
  });

  it('the static-fallback effect re-runs when visibleIds / pondRadius change', () => {
    expect(SRC).toMatch(/\}, \[args\.enabled, args\.visibleIds, args\.pondRadius, refs\]\);/);
  });
});

describe('EmployeePond.tsx — E10 focus return on dialogue close', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('captures the opener (orb or list row) on handleOrbClick', () => {
    expect(SRC).toMatch(/dialogueOpenerRef\.current =\s*\n?\s*opener \?\?/);
  });

  it('closeDialogue focuses the opener after the React close commits', () => {
    expect(SRC).toMatch(/setTimeout\(\(\) => \{[\s\S]*?opener\.focus\(\);/);
  });

  it("clears the opener ref after restoring focus so a stale element doesn't leak across closes", () => {
    expect(SRC).toMatch(/dialogueOpenerRef\.current = null;/);
  });

  it('orb onClick now passes the trigger element', () => {
    expect(SRC).toMatch(/handleOrbClick\(employee, orbRefsRef\.current\.get\(employee\.id\) \?\? null\)/);
  });

  it('orb Enter/Space passes the keyboard target as opener', () => {
    expect(SRC).toMatch(/handleOrbClick\(employee, e\.currentTarget\);/);
  });

  it("list row click passes its currentTarget so focus returns to the list row", () => {
    expect(SRC).toMatch(/onClick=\{\(ev\) => handleOrbClick\(e, ev\.currentTarget\)\}/);
  });
});

describe('EmployeePond.tsx — E10 pond surface a11y', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('pond gets role="region" + aria-roledescription so screen readers announce the interactive region', () => {
    expect(SRC).toMatch(/role="region"\s*\n\s*aria-roledescription="Interactive employee pond"/);
  });

  it("pond's aria-label includes a live count + a navigation hint", () => {
    expect(SRC).toMatch(
      /aria-label=\{`Employee pond — \$\{visibleEmployees\.length\} employee\$\{visibleEmployees\.length === 1 \? '' : 's'\} visible\. Use the list below or Tab to navigate\.`\}/,
    );
  });
});
