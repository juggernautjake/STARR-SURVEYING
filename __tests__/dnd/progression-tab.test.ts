import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Slice 7 — the Progression tab renders from the class DATA (via /levels → progressionRows), falling
// back to the stored array. Source-check (the mapper itself is unit-tested in progression-rows.test.ts).
const COMP = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/Progression.tsx'), 'utf8');
const ROUTE = fs.readFileSync(path.join(process.cwd(), 'app/api/dnd/characters/[id]/levels/route.ts'), 'utf8');

describe('Progression tab is class-data driven', () => {
  it('fetches the levels endpoint and prefers its table over the stored array', () => {
    expect(COMP).toContain('/levels')
    expect(COMP).toContain('table?.progression ?? char.progression') // class-data first, stored fallback
    expect(COMP).toContain('progressionColumns')                      // labels come from the class
  });
  it('the levels route returns the mapped progression table + columns', () => {
    expect(ROUTE).toContain('progressionRows(def, sub, level)')
    expect(ROUTE).toContain('progressionColumns(def)')
  });
});
