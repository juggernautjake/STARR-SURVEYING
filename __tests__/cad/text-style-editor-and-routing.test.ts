// C20 — one editor per axis, and selected geometry routes to the right one.
//
// ── WHAT WAS SCATTERED ──────────────────────────────────────────────────────────────────────────
//
// Line types:  `LineTypePicker` → `LineTypeEditor`, plus add/update/remove store actions. Complete.
// Symbols:     `SymbolPicker`, reached from PropertyPanel and CodeStylePanel.
// Text styles: a picker (C19) and NO editor, so `document.customTextStyles` was a field nothing
//              could write and the picker could only ever offer the 22 built-ins — the same
//              "authored but not reachable" shape C19 had just fixed one level up.
//
// And the ROUTING half: PropertyPanel sent a selected feature to the line-type and symbol pickers,
// but a selected TEXT feature had no style control at all. Its font lives in the untyped
// `properties` bag (`fontFamily`, `fontSize`, `fontWeight`, `fontStyle`) — a THIRD place fonts
// live, beside `TextLabelStyle` and the per-layer label preferences. So "give this the Plat Title
// style" worked on a bearing label and not on the plat's actual title.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { useDrawingStore } from '@/lib/cad/store';
import {
  resolveTextFeatureStyle,
  countLabelsUsingTextStyle,
  clampWidthFactor,
  getTextStyle,
} from '@/lib/cad/styles/text-style-library';
import type { TextStyleDefinition } from '@/lib/cad/styles/types';

const style = (over: Partial<TextStyleDefinition> = {}): TextStyleDefinition => ({
  id: 'S1', name: 'Firm Standard', category: 'CUSTOM',
  fontFamily: 'Helvetica', fontSize: 13, fontWeight: 'bold', fontStyle: 'italic',
  widthFactor: 0.8, obliqueAngle: 20,
  isBuiltIn: false, isEditable: true, assignedCodes: [],
  ...over,
});

describe('the store can hold a drawing’s own text styles', () => {
  beforeEach(() => {
    useDrawingStore.setState((s) => ({
      document: { ...s.document, customTextStyles: undefined },
    }));
  });

  it('adds one to a document that has no such key yet', () => {
    // C18 left `customTextStyles` optional so drawings saved before it still load — and the FIRST
    // WRITE is exactly where a missing key would throw.
    expect(useDrawingStore.getState().document.customTextStyles).toBeUndefined();
    useDrawingStore.getState().addCustomTextStyle(style());
    expect(useDrawingStore.getState().document.customTextStyles).toHaveLength(1);
  });

  it('normalises whatever it was cloned from', () => {
    // Duplicating a built-in must not produce a copy that still claims to BE the built-in: it
    // would be uneditable and undeletable, sitting in the drawing forever.
    useDrawingStore.getState().addCustomTextStyle(
      style({ id: 'STANDARD', category: 'TITLE', isBuiltIn: true, isEditable: false }),
    );
    const saved = useDrawingStore.getState().document.customTextStyles![0];
    expect(saved.category).toBe('CUSTOM');
    expect(saved.isBuiltIn).toBe(false);
    expect(saved.isEditable).toBe(true);
  });

  it('replaces rather than duplicates on the same id', () => {
    useDrawingStore.getState().addCustomTextStyle(style());
    useDrawingStore.getState().addCustomTextStyle(style({ name: 'Renamed' }));
    const list = useDrawingStore.getState().document.customTextStyles!;
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Renamed');
  });

  it('updates without letting the id or built-in flag be rewritten', () => {
    useDrawingStore.getState().addCustomTextStyle(style());
    useDrawingStore.getState().updateCustomTextStyle('S1', {
      fontSize: 20, id: 'HIJACKED', isBuiltIn: true,
    } as Partial<TextStyleDefinition>);
    const saved = useDrawingStore.getState().document.customTextStyles![0];
    expect(saved.id).toBe('S1');
    expect(saved.isBuiltIn).toBe(false);
    expect(saved.fontSize).toBe(20);
  });

  it('removes, and tolerates a missing key while doing it', () => {
    useDrawingStore.getState().addCustomTextStyle(style());
    useDrawingStore.getState().removeCustomTextStyle('S1');
    expect(useDrawingStore.getState().document.customTextStyles).toEqual([]);
    useDrawingStore.setState((s) => ({ document: { ...s.document, customTextStyles: undefined } }));
    expect(() => useDrawingStore.getState().removeCustomTextStyle('S1')).not.toThrow();
  });

  it('marks the drawing dirty, so the style survives a save', () => {
    useDrawingStore.setState({ isDirty: false });
    useDrawingStore.getState().addCustomTextStyle(style());
    expect(useDrawingStore.getState().isDirty).toBe(true);
  });
});

describe('a TEXT feature can follow a named style', () => {
  it('resolves all five axes from the style', () => {
    const r = resolveTextFeatureStyle({ textStyleId: 'S1', fontFamily: 'Arial' }, [style()]);
    expect(r.fontFamily).toBe('Helvetica');
    expect(r.fontSize).toBe(13);
    expect(r.fontWeight).toBe('bold');
    expect(r.fontStyle).toBe('italic');
    expect(r.widthFactor).toBe(0.8);
    expect(r.obliqueAngle).toBe(20);
  });

  it('falls back to the exact defaults the three call sites already used', () => {
    // Changing ANY of these would re-font every existing TEXT feature in every drawing the next
    // time it was opened.
    const r = resolveTextFeatureStyle({});
    expect(r.fontFamily).toBe('Arial');
    expect(r.fontSize).toBe(12);
    expect(r.fontWeight).toBe('normal');
    expect(r.fontStyle).toBe('normal');
    expect(r.widthFactor).toBe(1);
    expect(r.obliqueAngle).toBe(0);
  });

  it('reads the raw bag when the style is dangling', () => {
    const r = resolveTextFeatureStyle({ textStyleId: 'GONE', fontFamily: 'Georgia', fontSize: 30 });
    expect(r.fontFamily).toBe('Georgia');
    expect(r.fontSize).toBe(30);
  });

  it('ignores a non-string style id rather than coercing it', () => {
    // The bag is `Record<string, string | number | boolean>`; a stray `true` must not become the
    // id "true" and then resolve to nothing in a way that looks like a deleted style.
    expect(resolveTextFeatureStyle({ textStyleId: true, fontFamily: 'Georgia' }).fontFamily)
      .toBe('Georgia');
  });

  it('clamps a hostile width factor from the bag', () => {
    expect(resolveTextFeatureStyle({ widthFactor: 0 }).widthFactor).toBeGreaterThan(0);
    expect(clampWidthFactor(undefined)).toBe(1);
  });
});

describe('counting before deleting', () => {
  const lbl = (id: string | null) => ({ style: { textStyleId: id } as never });

  it('counts labels, not features', () => {
    // One feature commonly carries a bearing label and a distance label following two different
    // styles, so a feature count would understate it.
    const features = [
      { textLabels: [lbl('S1'), lbl('S1'), lbl('OTHER')] },
      { textLabels: [lbl('S1')] },
      { textLabels: undefined },
      {},
    ];
    expect(countLabelsUsingTextStyle(features, 'S1')).toBe(3);
    expect(countLabelsUsingTextStyle(features, 'NOBODY')).toBe(0);
  });
});

// ── The reachability half ──────────────────────────────────────────────────────────────────────
describe('every axis has an editor, reachable from its picker', () => {
  const read = (p: string) =>
    readFileSync(join(process.cwd(), p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  const picker = read('app/admin/cad/components/TextStylePicker.tsx');
  const editor = read('app/admin/cad/components/TextStyleEditorModal.tsx');
  const linePicker = read('app/admin/cad/components/LineTypePicker.tsx');

  it('line types still reach theirs', () => {
    // The shape being mirrored. If this ever stopped being true, the symmetry argument below would
    // be mirroring nothing.
    expect(linePicker).toMatch(/LineTypeEditor/);
  });

  it('text styles now reach theirs from the same control', () => {
    expect(picker).toMatch(/<TextStyleEditorModal/);
    expect(picker).toMatch(/setEditing\(\{ initial: null \}\)/);   // new
    expect(picker).toMatch(/setEditing\(\{ initial: active \}\)/); // edit
  });

  it('selects the style it just created', () => {
    // Otherwise the surveyor makes a style and has to go find it in the list they just came from.
    expect(picker).toMatch(/onSaved=\{\(id\) => onChange\(\{ \.\.\.value, textStyleId: id \}\)\}/);
  });

  it('refuses to delete a built-in', () => {
    // Built-ins are `isEditable: false` so a drawing you send out looks the same on the machine
    // that opens it.
    expect(picker).toMatch(/const canDelete = !!active && !active\.isBuiltIn/);
    expect(picker).toMatch(/disabled=\{!canDelete\}/);
  });

  it('says how many labels a delete affects', () => {
    expect(picker).toMatch(/countLabelsUsingTextStyle/);
    expect(picker).toMatch(/follow this style/);
  });

  it('the editor clones a built-in instead of editing it', () => {
    expect(editor).toMatch(/const editingExisting = !!initial && !initial\.isBuiltIn/);
    expect(editor).toMatch(/\(copy\)/);
  });

  it('the editor validates the name against everything the picker will show', () => {
    // Two styles called "Standard" in one menu is a menu the surveyor cannot choose from.
    expect(editor).toMatch(/validateTextStyleName\(\s*name,\s*listTextStyles\(customStyles\)/);
    expect(editor).toMatch(/disabled=\{!!nameError\}/);
  });

  it('the editor keeps assigned codes when re-saving', () => {
    // C22 maps field codes to styles; re-saving from this editor must not quietly drop them.
    expect(editor).toMatch(/assignedCodes: editingExisting \? initial!\.assignedCodes : \[\]/);
  });
});

describe('selected geometry routes to the right editor', () => {
  const read = (p: string) =>
    readFileSync(join(process.cwd(), p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  const panel = read('app/admin/cad/components/PropertyPanel.tsx');

  it('line type and symbol already did', () => {
    expect(panel).toMatch(/<LineTypePicker/);
    expect(panel).toMatch(/<SymbolPicker/);
  });

  it('and now TEXT does too, through the SAME picker the labels use', () => {
    // A second, separate text-style control would drift from the first, which is the whole thing
    // naming styles is meant to prevent.
    expect(panel).toMatch(/<TextStylePicker/);
    expect(panel).toMatch(/resolveTextFeatureStyle\(feature\.properties, customTextStyles\)/);
  });

  it('detaching removes the key rather than writing an empty one', () => {
    // The properties bag is `Record<string, string | number | boolean>` — there is no slot for
    // "explicitly no style", and a leftover '' would resolve as a DANGLING reference that the
    // picker would then report as missing.
    expect(panel).toMatch(/delete next\.textStyleId/);
  });

  it('detaching bakes the typography in, same as it does for a label', () => {
    expect(panel).toMatch(/next\.fontFamily = s\.fontFamily/);
    expect(panel).toMatch(/next\.fontSize = s\.fontSize/);
  });

  it('governed controls are disabled and show the resolved value', () => {
    expect((panel.match(/disabled=\{textFeatureStyleGoverned\}/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(panel).toMatch(/value=\{resolvedTextFeature\.fontSize\}/);
    expect(panel).toMatch(/value=\{resolvedTextFeature\.fontFamily\}/);
  });
});

describe('the TEXT feature style reaches the canvas and the plot', () => {
  const read = (p: string) =>
    readFileSync(join(process.cwd(), p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it('the canvas resolves instead of reading the bag directly', () => {
    const v = read('app/admin/cad/components/CanvasViewport.tsx');
    expect(v).toMatch(/resolveTextFeatureStyle\(feature\.properties, doc\.customTextStyles \?\? \[\]\)/);
    expect(v).not.toMatch(/feature\.properties\.fontFamily \?\? 'Arial'/);
  });

  it('and applies width factor and slant to the TEXT object too', () => {
    const v = read('app/admin/cad/components/CanvasViewport.tsx');
    expect(v).toMatch(/textObj\.scale\.set\(tf\.widthFactor, 1\)/);
  });

  it('the PDF writer resolves before plotting', () => {
    // A plot that does not match the screen is the export bug that looks fine until it is on
    // paper in front of a client.
    const p = read('lib/cad/delivery/pdf-writer.ts');
    expect(p).toMatch(/resolveTextFeatureStyle\(f\.properties, doc\.customTextStyles \?\? \[\]\)/);
    expect(p).not.toMatch(/f\.properties\.fontFamily \?\? 'Arial'/);
  });
});

describe('sanity', () => {
  it('the built-in library is still reachable by id', () => {
    // A guard against the store work above accidentally shadowing the built-ins.
    expect(getTextStyle('PLAT_TITLE')?.name).toBe('Plat Title');
  });
});
