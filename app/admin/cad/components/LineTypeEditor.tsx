'use client';
// app/admin/cad/components/LineTypeEditor.tsx
// Create / edit a custom line type: dash-gap pattern (in feet),
// thickness, color, and an optional inline symbol (with spacing,
// size, rotation, side). Saves into document.customLineTypes.

import { useEffect, useMemo, useState } from 'react';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';
import type { InlineSymbolConfig, LineTypeDefinition } from '@/lib/cad/styles/types';
import { getSymbolsByCategory } from '@/lib/cad/styles/symbol-library';
import { useDrawingStore } from '@/lib/cad/store';
import { generateId } from '@/lib/cad/types';
import ColorSwatchInput from './ColorSwatchInput';

interface Props {
  open: boolean;
  /** Existing type to edit, or null to create a new one. A built-in
   *  type may be passed to clone it into a new editable custom type. */
  initial: LineTypeDefinition | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

const SYMBOL_OPTIONS = [
  ...getSymbolsByCategory('GENERIC'),
  ...getSymbolsByCategory('FENCE_INLINE'),
  ...getSymbolsByCategory('UTILITY'),
].map((s) => ({ id: s.id, name: s.name }));

type Mode = 'FIXED' | 'AT_VERTICES';
type Rot = 'FIXED' | 'ALONG_LINE' | 'PERPENDICULAR';
type Side = 'CENTER' | 'LEFT' | 'RIGHT' | 'BOTH';

export default function LineTypeEditor({ open, initial, onClose, onSaved }: Props) {
  const addCustom = useDrawingStore((s) => s.addCustomLineType);
  const updateCustom = useDrawingStore((s) => s.updateCustomLineType);

  const [name, setName] = useState('New Line Type');
  const [dashStr, setDashStr] = useState('10, 6');
  const [lineWeight, setLineWeight] = useState<string>('');
  const [color, setColor] = useState<string>('');
  const [useSymbol, setUseSymbol] = useState(false);
  const [symbolId, setSymbolId] = useState('GENERIC_CIRCLE_O');
  const [mode, setMode] = useState<Mode>('FIXED');
  const [interval, setIntervalFt] = useState(40);
  const [symbolSize, setSymbolSize] = useState(2.5);
  const [rotation, setRotation] = useState<Rot>('FIXED');
  const [side, setSide] = useState<Side>('CENTER');

  // Whether we're editing an existing *custom* type (vs cloning a builtin).
  const editingExisting = !!initial && !initial.isBuiltIn;

  useEffect(() => {
    if (!open) return;
    setName(initial ? (initial.isBuiltIn ? `${initial.name} (copy)` : initial.name) : 'New Line Type');
    setDashStr((initial?.dashPattern ?? [10, 6]).join(', '));
    setLineWeight(initial?.lineWeight != null ? String(initial.lineWeight) : '');
    setColor(initial?.color ?? '');
    const sym = initial?.inlineSymbols?.[0];
    setUseSymbol(!!sym);
    if (sym) {
      setSymbolId(sym.symbolId);
      setMode(sym.intervalMode === 'AT_VERTICES' ? 'AT_VERTICES' : 'FIXED');
      setIntervalFt(sym.interval || 40);
      setSymbolSize(sym.symbolSize || 2.5);
      setRotation((sym.symbolRotation as Rot) ?? 'FIXED');
      setSide((sym.side as Side) ?? 'CENTER');
    }
  }, [open, initial]);

  const dashPattern = useMemo(
    () =>
      dashStr
        .split(',')
        .map((s) => parseFloat(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
    [dashStr],
  );

  if (!open) return null;

  function save() {
    const id = editingExisting ? initial!.id : generateId();
    const inlineSymbols: InlineSymbolConfig[] = useSymbol
      ? [{
          symbolId,
          interval,
          intervalMode: mode,
          scaleReferenceInterval: interval,
          scaleReferenceScale: 50,
          symbolSize,
          symbolRotation: rotation,
          offset: 0,
          side,
        }]
      : [];
    const def: LineTypeDefinition = {
      id,
      name: name.trim() || 'Custom',
      category: 'CUSTOM',
      dashPattern,
      inlineSymbols,
      specialRenderer: 'NONE',
      isBuiltIn: false,
      isEditable: true,
      assignedCodes: editingExisting ? initial!.assignedCodes : [],
      lineWeight: lineWeight.trim() === '' ? null : Number(lineWeight),
      color: color || null,
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
      title={editingExisting ? 'Edit Line Type' : 'New Line Type'}
      initialWidth={460}
      initialHeight={620}
      minWidth={360}
      minHeight={420}
    >
      <div className="p-4 space-y-3 text-gray-200 overflow-y-auto">
        {/* Preview */}
        <PatternPreview
          dashPattern={dashPattern}
          color={color || '#111827'}
          lineWeight={lineWeight === '' ? 1.5 : Number(lineWeight)}
          symbol={useSymbol ? { mode, interval } : null}
        />

        <div>
          <label className={labelCls}>Name</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <label className={labelCls}>Dash pattern — dash, gap, dash, gap… (feet)</label>
          <input
            className={inputCls}
            value={dashStr}
            onChange={(e) => setDashStr(e.target.value)}
            placeholder="e.g. 10, 6  (leave empty for a solid line)"
          />
          <p className="text-[10px] text-gray-500 mt-1">
            First number is the dash length, second is the gap, and so on. Bigger
            gaps = more obvious dashes.
          </p>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className={labelCls}>Thickness (mm)</label>
            <input
              type="number" min={0} step={0.05} className={inputCls}
              value={lineWeight}
              onChange={(e) => setLineWeight(e.target.value)}
              placeholder="inherit"
            />
          </div>
          <div className="flex-1">
            <label className={labelCls}>Color</label>
            <div className="flex items-center gap-2">
              <ColorSwatchInput
                className="h-7 w-10"
                value={color || '#000000'}
                onChange={setColor}
              />
              {color && (
                <button
                  type="button"
                  className="text-[10px] text-gray-400 hover:text-white underline"
                  onClick={() => setColor('')}
                >
                  inherit
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Inline symbol */}
        <div className="border-t border-gray-700 pt-3">
          <label className="flex items-center gap-2 text-xs text-white mb-2">
            <input type="checkbox" checked={useSymbol} onChange={(e) => setUseSymbol(e.target.checked)} />
            Place a symbol along the line
          </label>

          {useSymbol && (
            <div className="space-y-3 pl-1">
              <div>
                <label className={labelCls}>Symbol</label>
                <select className={inputCls} value={symbolId} onChange={(e) => setSymbolId(e.target.value)}>
                  {SYMBOL_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>Placement</label>
                <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                  <option value="FIXED">Every N feet</option>
                  <option value="AT_VERTICES">At each shot / vertex</option>
                </select>
              </div>

              {mode === 'FIXED' && (
                <div>
                  <label className={labelCls}>Spacing between symbols (feet)</label>
                  <input
                    type="number" min={1} step={1} className={inputCls}
                    value={interval}
                    onChange={(e) => setIntervalFt(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
              )}

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelCls}>Symbol size (mm)</label>
                  <input
                    type="number" min={0.5} step={0.5} className={inputCls}
                    value={symbolSize}
                    onChange={(e) => setSymbolSize(Math.max(0.5, Number(e.target.value) || 0.5))}
                  />
                </div>
                <div className="flex-1">
                  <label className={labelCls}>Rotation</label>
                  <select className={inputCls} value={rotation} onChange={(e) => setRotation(e.target.value as Rot)}>
                    <option value="FIXED">Upright</option>
                    <option value="ALONG_LINE">Along line</option>
                    <option value="PERPENDICULAR">Perpendicular</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelCls}>Side</label>
                <select className={inputCls} value={side} onChange={(e) => setSide(e.target.value as Side)}>
                  <option value="CENTER">On the line</option>
                  <option value="LEFT">Left</option>
                  <option value="RIGHT">Right</option>
                  <option value="BOTH">Both sides</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded"
        >
          {editingExisting ? 'Save changes' : 'Create line type'}
        </button>
      </div>
    </ModalFrame>
  );
}

/** Lightweight SVG preview of the pattern (dashes + symbol marks). */
function PatternPreview({
  dashPattern,
  color,
  lineWeight,
  symbol,
}: {
  dashPattern: number[];
  color: string;
  lineWeight: number;
  symbol: { mode: 'FIXED' | 'AT_VERTICES'; interval: number } | null;
}) {
  const W = 412;
  const H = 44;
  const y = H / 2;
  const k = 4; // px per foot for the preview
  const dash = dashPattern.length > 0 ? dashPattern.map((v) => v * k).join(' ') : undefined;

  // Symbol marks: spacing in px (vertex mode shows a few evenly spaced).
  const marks: number[] = [];
  if (symbol) {
    const stepPx = symbol.mode === 'AT_VERTICES' ? W / 5 : Math.max(symbol.interval * k, 16);
    for (let x = stepPx / 2; x < W - 4; x += stepPx) marks.push(x);
  }

  return (
    <div className="rounded border border-gray-700 bg-white p-2">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} height={H}>
        <line
          x1={4} y1={y} x2={W - 4} y2={y}
          stroke={color} strokeWidth={Math.max(1, lineWeight)}
          strokeDasharray={dash} strokeLinecap="butt"
        />
        {marks.map((x, i) => (
          <circle key={i} cx={x} cy={y} r={5} fill="none" stroke={color} strokeWidth={1.2} />
        ))}
      </svg>
    </div>
  );
}
