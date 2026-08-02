// Every registered route's icon actually resolves (audit pattern 12 — one line-icon set).
//
// Measured before this test: 41 of the registry's 100 distinct `iconName` values were not in
// `lib/admin/route-icons.tsx`'s map — Upload, DollarSign, CloudSun, HardHat, Camera, Sparkles,
// PenTool, Library, Workflow, History, Timer, Plus and 29 more. Every one of them is a real
// lucide-react export; they had simply never been added to the resolver. So the rail, the ⌘K
// palette and the mobile drawer rendered an identical neutral Circle for two fifths of the app
// while looking deliberate.
//
// The fallback is right — a typo must not crash navigation — which is exactly why it needs a test.
// A silent default cannot be noticed by using the product; you have to compare two lists.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_ROUTES } from '@/lib/admin/route-registry';
import { isKnownIconName, iconForName, knownIconNames } from '@/lib/admin/route-icons';

const named = <T extends { href: string; iconName?: string }>(rs: readonly T[]) =>
  rs.filter((r) => r.iconName);

/** The palette's own action entries are a module-private const inside a 'use client' component, so
 *  they are read as source rather than imported — the alternative is exporting a list purely to
 *  satisfy a test, which makes the test the reason the code has a seam. */
/** Every .tsx under the given roots. Plain recursion rather than a glob dependency, and node_modules
 *  is excluded by only ever descending from the two source roots. */
function tsxFiles(roots: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.next') walk(full); }
      else if (e.name.endsWith('.tsx')) out.push(full);
    }
  };
  for (const r of roots) walk(path.join(process.cwd(), r));
  return out;
}

function paletteActionIcons(): string[] {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/components/nav/CommandPalette.tsx'),
    'utf8',
  );
  const actions = src.split('const ACTIONS')[1]?.split('];')[0] ?? '';
  return [...actions.matchAll(/iconName: '([A-Za-z0-9]+)'/g)].map((m) => m[1]!);
}

describe('the icon map keeps up with the registry', () => {
  it('resolves every route’s icon instead of falling back to a grey Circle', () => {
    const unresolved = named(ADMIN_ROUTES)
      .filter((r) => !isKnownIconName(r.iconName))
      .map((r) => `${r.href} → ${r.iconName}`);
    expect(unresolved, `unmapped icon names:\n  ${unresolved.join('\n  ')}`).toEqual([]);
  });

  it('resolves the palette’s action icons too', () => {
    // The palette carries its own entries (New job, Clock in / out …) that are not routes.
    const icons = paletteActionIcons();
    expect(icons.length, 'the ACTIONS list could not be read — has it moved?').toBeGreaterThan(3);
    expect(icons.filter((n) => !isKnownIconName(n))).toEqual([]);
  });

  it('still falls back rather than throwing on a name nobody defined', () => {
    expect(() => iconForName('NotAnIcon')).not.toThrow();
    expect(isKnownIconName('NotAnIcon')).toBe(false);
    expect(isKnownIconName(undefined)).toBe(false);
  });

  it('resolves every literal <RouteIcon name="…"> in the app', () => {
    // The third caller of the same map: components that hand it a name directly rather than reading
    // one off a route (the equipment hub's tile row, the top bar's menu). Same silent fallback.
    const unresolved = new Set<string>();
    for (const file of tsxFiles(['app', 'lib'])) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/<RouteIcon\s+name="([A-Za-z0-9]+)"/g)) {
        if (!isKnownIconName(m[1])) unresolved.add(`${m[1]} (${path.relative(process.cwd(), file)})`);
      }
    }
    expect([...unresolved]).toEqual([]);
  });

  it('exposes its names, so the map can be audited without parsing the file', () => {
    expect(knownIconNames().length).toBeGreaterThan(80);
    expect(knownIconNames()).toContain('Circle');
  });
});
