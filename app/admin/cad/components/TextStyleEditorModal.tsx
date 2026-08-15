'use client';
// app/admin/cad/components/TextStyleEditorModal.tsx
//
// C20 — the editor for the third style axis.
//
// Line types had `LineTypeEditor` reachable from `LineTypePicker`; text styles had a picker (C19)
// and no editor at all, so `document.customTextStyles` was a field nothing could write and the
// picker could only ever offer the 22 built-ins. This closes that, to the same shape as the line
// type editor — same modal frame, same "open a built-in to clone it" behaviour, same
// add-vs-update split — because C20's whole ask is that the three axes stop being scattered.
//
// Named `TextStyleEditorModal` rather than `TextStyleEditor`: that name is already taken by the
// per-layer, per-label-kind sub-component inside LayerPreferencesPanel, which edits ONE label's
// style. This edits a style in the drawing's library. Two very different things, and a shared name
// would make every future import a coin flip.

import { useEffect, useState } from 'react';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';

import { useDrawingStore } from '@/lib/cad/store';
import { generateId } from '@/lib/cad/types';
import {
  listTextStyles,
  validateTextStyleName,
  clampWidthFactor,
} from '@/lib/cad/styles/text-style-library';
import type { TextStyleDefinition } from '@/lib/cad/styles/types';

interface Props {
  open: boolean;
  /** Existing style to edit, or null to create one. A BUILT-IN may be passed to clone it into a
   *  new editable custom style — the fastest honest way to make "Bearing & Distance, but 8pt". */
  initial: TextStyleDefinition | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

const FONT_OPTIONS = [
  'Arial', 'Arial Narrow', 'Helvetica', 'Times New Roman', 'Georgia',
  'Verdana', 'Courier New', 'serif', 'sans-serif', 'monospace',
];

export default function TextStyleEditorModal({ open, initial, onClose, onSaved }: Props) {
  const addCustom = useDrawingStore((s) => s.addCustomTextStyle);
  const updateCustom = useDrawingStore((s) => s.updateCustomTextStyle);
  const customStyles = useDrawingStore((s) => s.document.customTextStyles) ?? [];

  const [name, setName] = useState('New Text Style');
  const [fontFamily, setFontFamily] = useState('Arial');
  const [fontSize, setFontSize] = useState(10);
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [widthFactor, setWidthFactor] = useState(1);
  const [obliqueAngle, setObliqueAngle] = useState(0);

  // Editing an existing CUSTOM style, as opposed to cloning a built-in. Built-ins are
  // `isEditable: false` for a reason — a drawing that silently redefined "Standard" would open
  // differently on someone else's machine.
  const editingExisting = !!initial && !initial.isBuiltIn;

  useEffect(() => {
    if (!open) return;
    setName(initial ? (initial.isBuiltIn ? `${initial.name} (copy)` : initial.name) : 'New Text Style');
    setFontFamily(initial?.fontFamily ?? 'Arial');
    setFontSize(initial?.fontSize ?? 10);
    setBold((initial?.fontWeight ?? 'normal') === 'bold');
    setItalic((initial?.fontStyle ?? 'normal') === 'italic');
    setWidthFactor(initial?.widthFactor ?? 1);
    setObliqueAngle(initial?.obliqueAngle ?? 0);
  }, [open, initial]);

  if (!open) return null;

  // Validated against every style the drawing can see, built-ins included: two styles called
  // "Standard" in one picker is a menu the surveyor cannot choose from.
  const nameError = validateTextStyleName(
    name,
    listTextStyles(customStyles),
    editingExisting ? initial!.id : undefined,
  );

  function handleSave() {
    if (nameError) return;
    const id = editingExisting ? initial!.id : generateId();
    const def: TextStyleDefinition = {
      id,
      name: name.trim(),
      category: 'CUSTOM',
      fontFamily,
      fontSize,
      fontWeight: bold ? 'bold' : 'normal',
      fontStyle: italic ? 'italic' : 'normal',
      widthFactor,
      obliqueAngle,
      isBuiltIn: false,
      isEditable: true,
      // Kept when editing: C22 will assign field codes to styles, and re-saving a style from this
      // editor must not quietly drop the codes already mapped to it.
      assignedCodes: editingExisting ? initial!.assignedCodes : [],
    };
    if (editingExisting) updateCustom(id, def);
    else addCustom(def);
    onSaved?.(id);
    onClose();
  }

  const labelCls = 'block text-[11px] font-semibold text-gray-400 mb-1';
  const inputCls =
    'w-full bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1 outline-none focus:border-blue-500';

  return (
    <ModalFrame
      open
      onClose={onClose}
      title={editingExisting ? 'Edit Text Style' : 'New Text Style'}
      initialWidth={440}
      initialHeight={560}
      minWidth={360}
      minHeight={420}
    >
      <div className="p-3 space-y-3" data-testid="text-style-editor">
        {/* Live sample first: it is what the surveyor is actually deciding about. */}
        <div className="rounded border border-gray-700 bg-white px-3 py-4 overflow-hidden">
          <div
            className="truncate text-black"
            style={{
              fontFamily,
              fontSize: `${Math.min(28, Math.max(10, fontSize * 1.6))}px`,
              fontWeight: bold ? 'bold' : 'normal',
              fontStyle: italic ? 'italic' : 'normal',
              // Negated for the same reason the canvas and the picker negate theirs: y grows
              // downward here too, so a positive skew would lean the glyph the wrong way.
              transform: `scaleX(${clampWidthFactor(widthFactor)}) skewX(${-obliqueAngle}deg)`,
              transformOrigin: 'left center',
            }}
            data-testid="text-style-editor-sample"
          >
            N 45°30′12″ E  132.48′
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="ts-name">Name</label>
          <input
            id="ts-name"
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bearing & Distance (8pt)"
          />
          {nameError && (
            <p className="mt-1 text-[11px] text-amber-300" data-testid="text-style-name-error">
              {nameError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ts-font">Font</label>
            <select
              id="ts-font"
              className={inputCls}
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
            >
              {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="ts-size">Size (pt on paper)</label>
            <input
              id="ts-size"
              type="number" min={4} max={144} step={0.5}
              className={inputCls}
              value={fontSize}
              onChange={(e) => setFontSize(Math.max(4, Math.min(144, parseFloat(e.target.value) || 10)))}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className={`px-3 h-7 rounded border text-xs font-bold ${bold ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-300'}`}
            onClick={() => setBold(!bold)}
            aria-pressed={bold}
          >B</button>
          <button
            className={`px-3 h-7 rounded border text-xs italic ${italic ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-300'}`}
            onClick={() => setItalic(!italic)}
            aria-pressed={italic}
          >I</button>
          <span className="text-[11px] text-gray-500 leading-snug">
            Italic swaps in a different typeface. To lean the upright one, use Slant below.
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ts-width">Width factor</label>
            <input
              id="ts-width"
              type="number" min={0.1} max={4} step={0.05}
              className={inputCls}
              value={widthFactor}
              onChange={(e) => setWidthFactor(Math.max(0.1, Math.min(4, parseFloat(e.target.value) || 1)))}
            />
            <p className="mt-1 text-[10px] text-gray-500 leading-snug">
              Condense to fit a call along a short line without dropping the point size.
            </p>
          </div>
          <div>
            <label className={labelCls} htmlFor="ts-oblique">Slant (°)</label>
            <input
              id="ts-oblique"
              type="number" min={-60} max={60} step={1}
              className={inputCls}
              value={obliqueAngle}
              onChange={(e) => setObliqueAngle(Math.max(-60, Math.min(60, parseFloat(e.target.value) || 0)))}
            />
            <p className="mt-1 text-[10px] text-gray-500 leading-snug">
              Positive leans right. 15° is the usual lean for hydrography.
            </p>
          </div>
        </div>

        {initial?.isBuiltIn && (
          <p className="text-[11px] text-gray-500 leading-snug">
            Built-in styles cannot be changed — saving creates a copy in this drawing. That keeps a
            drawing you send out looking the same on the machine that opens it.
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            className="flex-1 h-8 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium"
            onClick={handleSave}
            disabled={!!nameError}
            title={nameError ?? 'Save this text style into the drawing'}
          >
            {editingExisting ? 'Save Changes' : 'Create Style'}
          </button>
          <button
            className="px-3 h-8 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
