// __tests__/admin/hub-w9e-field-pulse.test.ts
//
// Slice W9e — consolidated field-pulse widget. Pure helpers +
// source-lock for the size-relative contract.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  fieldPulseLayoutForBucket,
  isLowConsumable,
  totalFieldPulseCount,
} from '@/lib/hub/widgets/field-pulse';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('totalFieldPulseCount (pure)', () => {
  it('sums positive counts across all four sources', () => {
    expect(totalFieldPulseCount({ team: 3, vehicles: 2, equipment: 5, consumables: 1 })).toBe(11);
  });

  it('clamps negative inputs to zero', () => {
    expect(totalFieldPulseCount({ team: -2, vehicles: 5, equipment: -1, consumables: 4 })).toBe(9);
  });

  it('returns 0 when all inputs are zero', () => {
    expect(totalFieldPulseCount({ team: 0, vehicles: 0, equipment: 0, consumables: 0 })).toBe(0);
  });
});

describe('fieldPulseLayoutForBucket (pure)', () => {
  it('returns tiny / small / medium / four for each bucket', () => {
    expect(fieldPulseLayoutForBucket('tiny')).toBe('tiny');
    expect(fieldPulseLayoutForBucket('small')).toBe('small');
    expect(fieldPulseLayoutForBucket('medium')).toBe('medium');
    expect(fieldPulseLayoutForBucket('large')).toBe('four');
    expect(fieldPulseLayoutForBucket('xlarge')).toBe('four');
  });
});

describe('isLowConsumable (pure)', () => {
  it('treats qty ≤ threshold as low', () => {
    expect(isLowConsumable({ currentQty: 2, threshold: 5 })).toBe(true);
    expect(isLowConsumable({ currentQty: 5, threshold: 5 })).toBe(true);
  });

  it('treats qty > threshold as healthy', () => {
    expect(isLowConsumable({ currentQty: 6, threshold: 5 })).toBe(false);
  });

  it('returns false when the threshold is zero / negative / NaN', () => {
    expect(isLowConsumable({ currentQty: 0, threshold: 0 })).toBe(false);
    expect(isLowConsumable({ currentQty: 0, threshold: -1 })).toBe(false);
    expect(isLowConsumable({ currentQty: 0, threshold: Number.NaN })).toBe(false);
  });
});

describe('field-pulse widget registration + render (W9e)', () => {
  const SRC = read('lib/hub/widgets/field-pulse/index.tsx');

  it('registers with id "field-pulse"', () => {
    expect(SRC).toMatch(/defineWidget<FieldPulseContent>\(\{\s*\n\s*id: 'field-pulse'/);
  });

  it("treats 401 / 403 as 'empty' (matches the W5 / W8 / W9a-d pattern)", () => {
    expect(SRC).toMatch(/res\.status === 401 \|\| res\.status === 403/);
  });

  it('size-relative testids: tiny / small / medium static + per-bucket dynamic at large / xlarge', () => {
    expect(SRC).toMatch(/data-testid="field-pulse-tiny"/);
    expect(SRC).toMatch(/data-testid="field-pulse-small"/);
    expect(SRC).toMatch(/data-testid="field-pulse-medium"/);
    expect(SRC).toMatch(/data-testid=\{`field-pulse-\$\{bucket\}`\}/);
  });

  it('large + xlarge render a 2x2 four-tile grid', () => {
    expect(SRC).toMatch(/fourTileStyle/);
    expect(SRC).toMatch(/gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr'/);
    expect(SRC).toMatch(/<TeamTile\s/);
    expect(SRC).toMatch(/<VehiclesTile\s/);
    expect(SRC).toMatch(/<EquipmentTile\s/);
    expect(SRC).toMatch(/<ConsumablesTile\s/);
  });

  it('per-tile "Open →" links route to team / vehicles / equipment / consumables', () => {
    expect(SRC).toMatch(/href="\/admin\/team"/);
    expect(SRC).toMatch(/href="\/admin\/equipment\/vehicles"/);
    expect(SRC).toMatch(/href="\/admin\/equipment"/);
    expect(SRC).toMatch(/href="\/admin\/equipment\/consumables"/);
  });

  it('xlarge bucket shows row lists under each tile (showLists=true)', () => {
    expect(SRC).toMatch(/const showLists = bucket === 'xlarge'/);
  });

  it('uses the operational category so the Add-Widget modal groups it correctly', () => {
    expect(SRC).toMatch(/category: 'operational'/);
  });
});

describe('register-all + widget-options wire field-pulse (W9e)', () => {
  it('imports the new widget', () => {
    const SRC = read('lib/hub/widgets/register-all.ts');
    expect(SRC).toMatch(/import '\.\/field-pulse'/);
  });

  it("the schema registry has a 'field-pulse' entry so the Slice-12 coverage spec passes", () => {
    const SRC = read('lib/hub/widget-options.ts');
    expect(SRC).toMatch(/'field-pulse':\s*\{\s*source:\s*'none'\s*\}/);
  });
});
