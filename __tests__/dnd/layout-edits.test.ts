// __tests__/dnd/layout-edits.test.ts — real-time layout/style edits to the custom sheet
// add/remove/move/restyle blocks and set CSS, staying character-scoped (Phase V, Slice 12).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applyLayoutEdits, LAYOUT_EDIT_TOOL, type LayoutEdit } from '@/lib/dnd/layout-edits';
import { SHEET_EDIT_TOOL } from '@/lib/dnd/sheet-edits';
import { assertCharacterScopedOps } from '@/lib/dnd/ai-scope';

const opEnumOf = (tool: typeof LAYOUT_EDIT_TOOL): string[] =>
  (tool.input_schema as { properties?: { edits?: { items?: { properties?: { op?: { enum?: string[] } } } } } })
    .properties?.edits?.items?.properties?.op?.enum ?? [];

const START = {
  title: 'Kael',
  blocks: [
    { type: 'heading', text: 'Fighter 5' },
    { type: 'stats', title: 'Abilities', items: [{ label: 'STR', value: 18 }] },
    { type: 'text', text: 'A defender.' },
  ],
};

describe('layout edits (Slice 12)', () => {
  it('adds a block at a position', () => {
    const { layout } = applyLayoutEdits(START, '', [{ op: 'add_block', index: 1, block: { type: 'note', text: 'Watch AoO' } }]);
    expect(layout.blocks[1].type).toBe('note');
    expect(layout.blocks).toHaveLength(4);
  });

  it('removes and moves (reflows) blocks', () => {
    const removed = applyLayoutEdits(START, '', [{ op: 'remove_block', index: 2 }]).layout;
    expect(removed.blocks).toHaveLength(2);
    const moved = applyLayoutEdits(START, '', [{ op: 'move_block', from: 0, to: 2 }]).layout;
    expect(moved.blocks[2].type).toBe('heading'); // heading moved to the end
  });

  it('replaces a block (resize/restyle) and sets a title', () => {
    const { layout } = applyLayoutEdits(START, '', [
      { op: 'update_block', index: 2, block: { type: 'counter', key: 'focus', label: 'Focus' } },
      { op: 'set_title', value: 'Kael the Bold' },
    ]);
    expect(layout.blocks[2].type).toBe('counter');
    expect(layout.title).toBe('Kael the Bold');
  });

  it('sets and appends CSS', () => {
    const set = applyLayoutEdits(START, 'old', [{ op: 'set_css', value: '.cs-card{border-color:gold}' }]).css;
    expect(set).toBe('.cs-card{border-color:gold}');
    const appended = applyLayoutEdits(START, 'a{}', [{ op: 'append_css', value: 'b{}' }]).css;
    expect(appended).toContain('a{}');
    expect(appended).toContain('b{}');
  });

  it('drops a malformed block instead of injecting it', () => {
    const { layout } = applyLayoutEdits({ blocks: [] }, '', [{ op: 'add_block', block: { type: 'evil_script' } }]);
    expect(layout.blocks).toHaveLength(0);
  });

  it('ignores out-of-range indices safely', () => {
    const { layout } = applyLayoutEdits(START, '', [{ op: 'remove_block', index: 99 } as LayoutEdit, { op: 'move_block', from: 50, to: 0 } as LayoutEdit]);
    expect(layout.blocks).toHaveLength(3);
  });

  it('every layout op is character-scoped (boundary — Slice 8b)', () => {
    const schema = LAYOUT_EDIT_TOOL.input_schema as { properties?: { edits?: { items?: { properties?: { op?: { enum?: string[] } } } } } };
    const ops = schema.properties?.edits?.items?.properties?.op?.enum ?? [];
    expect(ops.length).toBeGreaterThan(0);
    expect(() => assertCharacterScopedOps(ops)).not.toThrow();
  });

  it('applyLayoutEdits has a case for EVERY op the tool schema offers (no silent no-op restyle)', () => {
    // The AI restyles/reformats the sheet through this vocabulary ("edit the html/css and save it"). An op
    // the tool offers but applyLayoutEdits doesn't handle would report success while the layout is
    // unchanged. The `never` guard in applyLayoutEdits covers the LayoutEdit union↔handler; this covers the
    // tool-schema op enum↔handler — mirrors the edit_sheet / edit_ig_sheet apply-path guards.
    const schema = LAYOUT_EDIT_TOOL.input_schema as { properties?: { edits?: { items?: { properties?: { op?: { enum?: string[] } } } } } };
    const ops = schema.properties?.edits?.items?.properties?.op?.enum ?? [];
    const src = fs.readFileSync(path.join(process.cwd(), 'lib/dnd/layout-edits.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function applyLayoutEdits'), src.indexOf('export const LAYOUT_EDIT_TOOL'));
    for (const op of ops) {
      expect(body.includes(`case '${op}'`), `applyLayoutEdits has no case for "${op}" — the AI's restyle would silently do nothing`).toBe(true);
    }
  });

  it('is DISJOINT from the mechanical edit_sheet vocabulary — the "no mechanic through CSS" guarantee', () => {
    // Slice 24's rule: layout/CSS edits (customize_layout) and mechanical edits (edit_sheet) are two SEPARATE
    // vocabularies. If any op appeared in BOTH, a mechanic could ride in on a presentation edit; and a damage
    // die written as CSS/layout would be invisible to the ledger, the digest, and the DM. This pins both:
    // no shared op, and the layout vocabulary carries no mechanical op family.
    const layoutOps = new Set(opEnumOf(LAYOUT_EDIT_TOOL));
    const sheetOps = opEnumOf(SHEET_EDIT_TOOL);
    expect(layoutOps.size).toBeGreaterThan(0);
    expect(sheetOps.length).toBeGreaterThan(0);
    const overlap = sheetOps.filter((op) => layoutOps.has(op));
    expect(overlap, 'ops in BOTH vocabularies would let a mechanic ride in as a layout edit').toEqual([]);
    const MECHANICAL = /^(set_ability|set_combat|set_skill|set_save|set_level|add_attack|update_attack|add_item|update_item|add_feature|add_spell|add_resource|add_condition|equip_item)/;
    expect([...layoutOps].filter((op) => MECHANICAL.test(op)), 'the layout vocabulary must be presentation-only').toEqual([]);
  });
});
