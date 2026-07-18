// __tests__/dnd/system-variants.test.ts — per-character multi-system variants:
// switch preserves each system's sheet; transpose installs a new one (Phase V, Slice 13).
import { describe, it, expect } from 'vitest';
import {
  readVariants, snapshotActive, builtSystems, hasVariant, switchActive, installTransposed, type ActiveSheet,
} from '@/lib/dnd/system-variants';

const active: ActiveSheet = { system: 'dnd5e-2024', data: { meta: { name: 'Kael', level: 5 } }, sheet_type: 'default', custom_layout: { blocks: [] }, custom_css: '' };

describe('system variants (Slice 13)', () => {
  it('reads a variants map defensively', () => {
    expect(readVariants(null)).toEqual({});
    expect(readVariants('junk')).toEqual({});
    const v = readVariants({ 'dnd5e-2014': { data: { x: 1 }, sheet_type: 'lazzuh' }, bad: 5 });
    expect(v['dnd5e-2014'].sheet_type).toBe('lazzuh');
    expect('bad' in v).toBe(false);
  });

  it('lists the systems a character has sheets for', () => {
    const variants = readVariants({ 'dnd5e-2014': { data: {}, sheet_type: 'default' }, pathfinder2e: { data: {}, sheet_type: 'default' } });
    const built = builtSystems(active, variants);
    expect(built).toContain('dnd5e-2024'); // active
    expect(built).toContain('dnd5e-2014');
    expect(built).toContain('pathfinder2e');
    expect(hasVariant(active, variants, 'dnd5e-2014')).toBe(true);
    expect(hasVariant(active, variants, 'pathfinder2e')).toBe(true);
    expect(hasVariant(active, variants, 'ambiguous')).toBe(false);
  });

  it('switch snapshots the current active and loads the target, losslessly and reversibly', () => {
    const variants = readVariants({ 'dnd5e-2014': { data: { meta: { name: 'Kael', level: 4 } }, sheet_type: 'lazzuh', custom_css: '.x{}' } });
    const afterSwitch = switchActive(active, variants, 'dnd5e-2014');
    // Now active is 2014 (its stored sheet), and 2024 is snapshotted into the map.
    expect(afterSwitch.active.system).toBe('dnd5e-2014');
    expect(afterSwitch.active.sheet_type).toBe('lazzuh');
    expect(afterSwitch.variants['dnd5e-2024']).toBeTruthy();
    expect('dnd5e-2014' in afterSwitch.variants).toBe(false); // the loaded one leaves the map
    // Switching back restores the original 2024 sheet unchanged.
    const back = switchActive(afterSwitch.active, afterSwitch.variants, 'dnd5e-2024');
    expect(back.active.system).toBe('dnd5e-2024');
    expect(back.active.data).toEqual(active.data);
    expect(back.active.sheet_type).toBe('default');
  });

  it('refuses to switch to a system with no variant', () => {
    expect(() => switchActive(active, {}, 'pathfinder2e')).toThrow(/transpose/i);
  });

  it('installTransposed makes the new system active and keeps the old as a variant', () => {
    const out = installTransposed(active, {}, 'pathfinder2e', { meta: { name: 'Kael', level: 5 }, pf: true });
    expect(out.active.system).toBe('pathfinder2e');
    expect((out.active.data as { pf?: boolean }).pf).toBe(true);
    expect(out.active.sheet_type).toBe('default');
    expect(out.variants['dnd5e-2024']).toBeTruthy(); // source preserved
  });

  it('snapshotActive mirrors the live sheet columns', () => {
    const snap = snapshotActive(active);
    expect(snap.data).toEqual(active.data);
    expect(snap.sheet_type).toBe('default');
  });
});

import { variantKind, variantKindLabel, defaultVariantName } from '@/lib/dnd/system-variants';

describe('sheet kind + name labels (Area MV1)', () => {
  it('variantKind defaults to vanilla for legacy/unlabelled variants', () => {
    expect(variantKind(undefined)).toBe('vanilla');
    expect(variantKind({})).toBe('vanilla');
    expect(variantKind({ kind: 'custom' })).toBe('custom');
    expect(variantKind({ kind: 'weird' })).toBe('vanilla'); // unknown → vanilla
  });

  it('labels + default names identify a sheet', () => {
    expect(variantKindLabel('vanilla')).toBe('Vanilla');
    expect(variantKindLabel('custom')).toBe('Custom-built');
    expect(defaultVariantName('Pathfinder 2e', 'custom')).toBe('Pathfinder 2e · Custom-built');
    expect(defaultVariantName('D&D 5e (2024)', 'vanilla')).toBe('D&D 5e (2024) · Vanilla');
  });

  it('readVariants carries kind (default vanilla) + a trimmed name; snapshotActive round-trips them', () => {
    const raw = {
      'pathfinder2e': { data: {}, sheet_type: 'default' }, // legacy, unlabelled
      'dnd5e-2024': { data: {}, sheet_type: 'default', kind: 'custom', name: '  My Homebrew Build  ' },
    };
    const v = readVariants(raw);
    expect(v['pathfinder2e'].kind).toBe('vanilla');
    expect(v['pathfinder2e'].name).toBeUndefined();
    expect(v['dnd5e-2024'].kind).toBe('custom');
    expect(v['dnd5e-2024'].name).toBe('My Homebrew Build'); // trimmed
    // snapshotActive preserves kind + name
    const snap = snapshotActive({ system: 'dnd5e-2024', data: {}, sheet_type: 'default', kind: 'custom', name: 'X' });
    expect(snap.kind).toBe('custom');
    expect(snap.name).toBe('X');
  });
});

import { listSheets, variantSystemOf } from '@/lib/dnd/system-variants';

describe('multi-slot listing (Area MV1b)', () => {
  const label = (s: string) => ({ 'dnd5e-2024': 'D&D 5e (2024)', 'pathfinder2e': 'Pathfinder 2e' }[s] ?? s);

  it('variantSystemOf uses the explicit system, else the key (legacy)', () => {
    expect(variantSystemOf({ data: {}, sheet_type: 'default' }, 'pathfinder2e')).toBe('pathfinder2e'); // legacy key
    expect(variantSystemOf({ data: {}, sheet_type: 'default', system: 'dnd5e-2024' }, 'dnd5e-2024#custom')).toBe('dnd5e-2024');
  });

  it('readVariants + listSheets support TWO sheets for the same system (slot-keyed)', () => {
    // a slot-keyed map: two dnd5e-2024 sheets (vanilla + custom) under distinct slot ids
    const raw = {
      'dnd5e-2024': { data: {}, sheet_type: 'default', kind: 'vanilla', system: 'dnd5e-2024', name: 'By the book' },
      'dnd5e-2024#custom': { data: {}, sheet_type: 'default', kind: 'custom', system: 'dnd5e-2024' },
    };
    const v = readVariants(raw);
    expect(Object.keys(v).sort()).toEqual(['dnd5e-2024', 'dnd5e-2024#custom']); // both slots kept
    const sheets = listSheets({ system: 'pathfinder2e', data: {}, sheet_type: 'default' }, v, label);
    // active + the two dnd5e-2024 slots = 3
    expect(sheets).toHaveLength(3);
    const dnd = sheets.filter((s) => s.system === 'dnd5e-2024');
    expect(dnd.map((s) => s.kind).sort()).toEqual(['custom', 'vanilla']);
    expect(dnd.find((s) => s.kind === 'vanilla')!.name).toBe('By the book'); // explicit name
    expect(dnd.find((s) => s.kind === 'custom')!.name).toBe('D&D 5e (2024) · Custom-built'); // default name
    // the active sheet is flagged + auto-named
    const act = sheets.find((s) => s.active)!;
    expect(act.system).toBe('pathfinder2e');
    expect(act.name).toBe('Pathfinder 2e · Vanilla');
  });
});
