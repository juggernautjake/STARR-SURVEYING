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

  // MV4 back-compat: a legacy character predating multi-variant data has just its one active sheet and NO
  // variants map. listSheets must return exactly that one sheet — flagged active, correctly named, with the
  // `active:` slot marker — so the switcher shows a single real chip and never a phantom/broken slot.
  it('back-compat: a single-sheet character (empty variants) lists exactly its one active sheet', () => {
    const sheets = listSheets(active, readVariants(undefined), label); // readVariants(undefined) → {}
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toMatchObject({ system: 'dnd5e-2024', active: true, slotId: 'active:dnd5e-2024' });
    expect(sheets[0].name).toBe('D&D 5e (2024) · Vanilla'); // auto-named from the label + default kind
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

import { newSlotId, addSheetSlot, switchToSlot } from '@/lib/dnd/system-variants';

describe('slot operations — switch/add specific sheets (Area MV2)', () => {
  it('newSlotId keeps the bare system for the first sheet, then suffixes', () => {
    expect(newSlotId({}, 'dnd5e-2024')).toBe('dnd5e-2024');
    expect(newSlotId({ 'dnd5e-2024': { data: {}, sheet_type: 'default' } }, 'dnd5e-2024')).toBe('dnd5e-2024#2');
    expect(newSlotId({ 'dnd5e-2024': { data: {}, sheet_type: 'default' }, 'dnd5e-2024#2': { data: {}, sheet_type: 'default' } }, 'dnd5e-2024')).toBe('dnd5e-2024#3');
  });

  it('addSheetSlot adds a labelled sheet for a system without touching the active one', () => {
    const { variants, slotId } = addSheetSlot({}, { system: 'pathfinder2e', kind: 'custom', name: 'Homebrew Kael' });
    expect(slotId).toBe('pathfinder2e');
    expect(variants['pathfinder2e'].kind).toBe('custom');
    expect(variants['pathfinder2e'].name).toBe('Homebrew Kael');
    expect(variants['pathfinder2e'].system).toBe('pathfinder2e');
    // a second custom sheet for the same system gets a distinct slot
    const two = addSheetSlot(variants, { system: 'pathfinder2e', kind: 'vanilla' });
    expect(two.slotId).toBe('pathfinder2e#2');
    expect(Object.keys(two.variants).sort()).toEqual(['pathfinder2e', 'pathfinder2e#2']);
  });

  it('switchToSlot swaps to a specific slot, snapshotting the active back (round-trip)', () => {
    const a: ActiveSheet = { system: 'dnd5e-2024', slotId: 'dnd5e-2024', data: { v: 1 }, sheet_type: 'default', kind: 'vanilla' };
    // two dnd5e-2024 slots stored (a custom + the target)
    const variants = { 'dnd5e-2024#2': { data: { v: 2 }, sheet_type: 'lazzuh', kind: 'custom' as const, system: 'dnd5e-2024', name: 'Custom Kael' } };
    const out = switchToSlot(a, variants, 'dnd5e-2024#2');
    expect(out.active.slotId).toBe('dnd5e-2024#2');
    expect(out.active.kind).toBe('custom');
    expect(out.active.name).toBe('Custom Kael');
    expect((out.active.data as { v: number }).v).toBe(2);
    // the previously-active sheet is snapshotted back under its own slot id (no collision)
    expect(out.variants['dnd5e-2024']).toBeTruthy();
    expect('dnd5e-2024#2' in out.variants).toBe(false); // the loaded slot leaves the map
    // both sheets are the same system but distinct slots
    expect(out.variants['dnd5e-2024'].system).toBe('dnd5e-2024');
  });

  it('switchToSlot throws for an unknown slot', () => {
    expect(() => switchToSlot(active, {}, 'nope')).toThrow(/no sheet slot/i);
  });
});

import { ACTIVE_SLOT_META_KEY, readActiveSlotMeta, withActiveSlotMeta } from '@/lib/dnd/system-variants';

describe('active-slot metadata persistence (Area MV2b)', () => {
  it('readVariants skips the reserved active-slot key (it is not a sheet)', () => {
    const v = readVariants({ 'pathfinder2e': { data: {}, sheet_type: 'default' }, [ACTIVE_SLOT_META_KEY]: { slotId: 'x', kind: 'custom' } });
    expect(Object.keys(v)).toEqual(['pathfinder2e']);
    expect(ACTIVE_SLOT_META_KEY in v).toBe(false);
  });

  it('round-trips the active sheet slotId/kind/name through withActiveSlotMeta → readActiveSlotMeta', () => {
    const a: ActiveSheet = { system: 'dnd5e-2024', slotId: 'dnd5e-2024#2', data: {}, sheet_type: 'default', kind: 'custom', name: 'Homebrew Kael' };
    const persisted = withActiveSlotMeta({ 'pathfinder2e': { data: {}, sheet_type: 'default' } }, a);
    // the sheet variant survives alongside the reserved meta
    expect(persisted['pathfinder2e']).toBeTruthy();
    const meta = readActiveSlotMeta(persisted);
    expect(meta).toEqual({ slotId: 'dnd5e-2024#2', kind: 'custom', name: 'Homebrew Kael' });
  });

  it('returns empty when nothing is stored (legacy)', () => {
    expect(readActiveSlotMeta({})).toEqual({});
    expect(readActiveSlotMeta(null)).toEqual({});
  });
});

import { deleteVariant, renameVariant } from '@/lib/dnd/system-variants';

describe('rename + delete a stored sheet (Area MV)', () => {
  const v = { 'a': { data: {}, sheet_type: 'default', kind: 'vanilla' as const, name: 'One' }, 'b': { data: {}, sheet_type: 'default', kind: 'custom' as const } };
  it('deleteVariant removes only the target slot (no-op if absent)', () => {
    expect(Object.keys(deleteVariant(v, 'a'))).toEqual(['b']);
    expect(deleteVariant(v, 'nope')).toBe(v); // no-op returns same ref
  });
  it('renameVariant sets/clears the name', () => {
    expect(renameVariant(v, 'a', 'Renamed')['a'].name).toBe('Renamed');
    expect('name' in renameVariant(v, 'a', '  ')['a']).toBe(false); // empty → cleared to default
    expect(renameVariant(v, 'nope', 'x')).toBe(v);
  });
});

import { installTransposedNewSlot } from '@/lib/dnd/system-variants';

describe('installTransposedNewSlot — transpose that ADDS a sheet (Area MV)', () => {
  it('keeps the system’s existing sheet and makes the new transposed one active', () => {
    // The character already has a vanilla dnd5e-2024 sheet stored; active is pathfinder2e.
    const existing = { 'dnd5e-2024': { data: { meta: { name: 'V' } }, sheet_type: 'default', kind: 'vanilla' as const, system: 'dnd5e-2024', name: 'By the book' } };
    const act: ActiveSheet = { system: 'pathfinder2e', data: { meta: { name: 'Kael', level: 5 } }, sheet_type: 'default' };
    const out = installTransposedNewSlot(act, existing, 'dnd5e-2024', { meta: { name: 'Kael', level: 5 }, custom: true }, { kind: 'custom', name: 'Homebrew Kael' });
    // The new custom sheet is active…
    expect(out.active.system).toBe('dnd5e-2024');
    expect(out.active.kind).toBe('custom');
    expect(out.active.name).toBe('Homebrew Kael');
    expect((out.active.data as { custom?: boolean }).custom).toBe(true);
    // …the pre-existing vanilla dnd5e-2024 sheet is UNTOUCHED (not overwritten)…
    expect(out.variants['dnd5e-2024'].name).toBe('By the book');
    expect(out.variants['dnd5e-2024'].kind).toBe('vanilla');
    // …and the previously-active pathfinder2e sheet is snapshotted back into the map.
    expect(out.variants['pathfinder2e']).toBeTruthy();
    // Two dnd5e-2024 sheets now coexist (the stored vanilla + the active custom under its own slot).
    expect(out.active.slotId).not.toBe('dnd5e-2024');
  });
});
