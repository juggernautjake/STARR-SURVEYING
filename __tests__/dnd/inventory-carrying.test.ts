// __tests__/dnd/inventory-carrying.test.ts — Slice 11 follow-on: the Inventory tab surfaces the
// size-scaled carrying capacity / encumbrance (equipment.ts had no UI caller before this), and items
// can carry a per-unit weight. The math lives in equipment.test.ts; this locks the wiring.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const INV = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/Inventory.tsx'), 'utf8');
const BUILDER = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/ItemBuilder.tsx'), 'utf8');
const TYPES = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/types.ts'), 'utf8');

describe('Inventory carrying-capacity display', () => {
  it('reads the ledger-effective STR + size and renders the capacity line', () => {
    expect(INV).toContain("carryingCapacity");
    expect(INV).toContain("encumbranceLevel");
    expect(INV).toContain("ledger.value('ability_str'");   // effective STR, not raw
    expect(INV).toContain("ledger.identity('size')");      // size is mechanical here
    expect(INV).toContain('Carrying');
  });
  it('sums per-unit item weight × qty', () => {
    expect(INV).toContain('(it.weight ?? 0) * Math.max(0, it.qty)');
  });
});

describe('items carry an editable per-unit weight', () => {
  it('InvItem has an optional weight', () => {
    expect(TYPES).toMatch(/weight\?: number/);
  });
  it('the item builder exposes a weight input', () => {
    expect(BUILDER).toContain('Weight (lb)');
    expect(BUILDER).toContain('patch({ weight:');
  });
});
