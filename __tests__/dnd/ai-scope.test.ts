// __tests__/dnd/ai-scope.test.ts — the AI permission boundary (Phase V, Slice 8b):
// the agent's only mutation tool can never target anything but the character's own sheet.
import { describe, it, expect } from 'vitest';
import { assertCharacterScopedOps } from '@/lib/dnd/ai-scope';
import { SHEET_EDIT_TOOL, applySheetEdits } from '@/lib/dnd/sheet-edits';
import { LAYOUT_EDIT_TOOL } from '@/lib/dnd/layout-edits';
import { IG_EDIT_OPS } from '@/lib/dnd/systems/intuitive-games/edit';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

/** Pull the `op` enum out of a Claude tool whose edits are a `{ op }[]`. */
function toolOps(tool: typeof SHEET_EDIT_TOOL): string[] {
  const schema = tool.input_schema as {
    properties?: { edits?: { items?: { properties?: { op?: { enum?: string[] } } } } };
  };
  return schema.properties?.edits?.items?.properties?.op?.enum ?? [];
}

describe('AI permission boundary (Slice 8b)', () => {
  it('every edit_sheet op is strictly character-sheet-scoped', () => {
    const ops = toolOps(SHEET_EDIT_TOOL);
    expect(ops.length).toBeGreaterThan(0);
    // The real vocabulary passes the boundary check.
    expect(() => assertCharacterScopedOps(ops)).not.toThrow();
  });

  it('EVERY AI mutation vocabulary is character-scoped — not just edit_sheet', () => {
    // There are three tools the AI can mutate a sheet with: edit_sheet (mechanics), edit_ig_sheet (IG
    // mechanics), and customize_layout (HTML/CSS). Each must pass the same scoping boundary — a new op in
    // ANY of them that reached outside the target character's own sheet fails here. (edit_sheet is covered
    // above; this pins the other two so the boundary can't lapse for the IG or layout vocabulary.)
    const vocabularies: Record<string, string[]> = {
      edit_ig_sheet: [...IG_EDIT_OPS],
      customize_layout: toolOps(LAYOUT_EDIT_TOOL),
    };
    for (const [tool, ops] of Object.entries(vocabularies)) {
      expect(ops.length, `${tool} has no ops`).toBeGreaterThan(0);
      expect(() => assertCharacterScopedOps(ops), `${tool} has an op that reaches outside the sheet`).not.toThrow();
    }
  });

  it('rejects any op that would reach outside the character sheet', () => {
    expect(() => assertCharacterScopedOps(['edit_other_character'])).toThrow();
    expect(() => assertCharacterScopedOps(['set_campaign_name'])).toThrow();
    expect(() => assertCharacterScopedOps(['delete_map'])).toThrow();
    expect(() => assertCharacterScopedOps(['navigate_page'])).toThrow();
    expect(() => assertCharacterScopedOps(['ban_user'])).toThrow();
    // A legitimate sheet op still passes.
    expect(() => assertCharacterScopedOps(['add_feature'])).not.toThrow();
  });

  it('applying edits only ever yields a Character (never a foreign resource)', () => {
    const base = blankCharacter('Test');
    const out = applySheetEdits(base, [
      { op: 'set_name', value: 'Renamed' } as never,
      { op: 'set_level', value: 5 } as never,
    ]);
    // The output's top-level keys never exceed the Character's own keys — the edit path
    // cannot introduce a campaign/map/user/other-character field.
    const baseKeys = new Set(Object.keys(base));
    for (const k of Object.keys(out)) expect(baseKeys.has(k)).toBe(true);
    expect(out.meta.name).toBe('Renamed');
    expect(out.meta.level).toBe(5);
  });
});
