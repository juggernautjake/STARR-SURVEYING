'use client';
// app/admin/cad/components/SymbolPicker.tsx — Phase 3 §11 SymbolPicker UI
//
// Modal picker that lets a surveyor browse + select from the built-in
// `BUILTIN_SYMBOLS` library (plus optional `customSymbols`). Renders
// each symbol as a 48 px SVG thumbnail grouped by category. The first
// piece of the Phase-3 SymbolEditor / CodeStylePanel surface — used
// by both the PropertyPanel (per-feature override) and the future
// CodeStylePanel (per-code defaults).
//
// Pure rendering: no Pixi, no canvas — every symbol path is mapped
// directly to an SVG <path> / <circle> / <rect> / <text>. Each symbol
// in the library exposes its primitives in `SymbolDefinition.paths`,
// which the renderer below walks once.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search } from 'lucide-react';
import type { SymbolDefinition, SymbolPath } from '@/lib/cad/styles/types';
import { BUILTIN_SYMBOLS } from '@/lib/cad/styles/symbol-library';

interface SymbolPickerProps {
  open: boolean;
  /** Currently selected symbol id (highlighted). Pass null for none. */
  selectedSymbolId: string | null;
  /** Called with the picked symbol's id when the surveyor confirms. */
  onSelect: (symbolId: string) => void;
  /** Modal close (Escape / × / backdrop). */
  onClose: () => void;
  /** Per-firm extensions to the library — added at the bottom under
   *  the CUSTOM category. */
  customSymbols?: SymbolDefinition[];
}

const CATEGORY_LABEL: Record<SymbolDefinition['category'], string> = {
  MONUMENT_FOUND: 'Monuments (Found)',
  MONUMENT_SET: 'Monuments (Set)',
  MONUMENT_CALC: 'Monuments (Calculated)',
  CONTROL: 'Control Points',
  UTILITY: 'Utilities',
  VEGETATION: 'Vegetation',
  STRUCTURE: 'Structures',
  FENCE_INLINE: 'Fence Inline Markers',
  CURVE: 'Curves',
  GENERIC: 'Generic',
  CUSTOM: 'Custom',
};

const CATEGORY_ORDER: SymbolDefinition['category'][] = [
  'MONUMENT_FOUND',
  'MONUMENT_SET',
  'MONUMENT_CALC',
  'CONTROL',
  'UTILITY',
  'VEGETATION',
  'STRUCTURE',
  'FENCE_INLINE',
  'CURVE',
  'GENERIC',
  'CUSTOM',
];

/** Render a single SymbolPath as the appropriate SVG primitive. */
function PathElement({ path, color }: { path: SymbolPath; color: string }) {
  const fill =
    path.fill === 'INHERIT' ? color : path.fill === 'NONE' ? 'none' : path.fill;
  const stroke =
    path.stroke === 'INHERIT' ? color : path.stroke === 'NONE' ? 'none' : path.stroke;
  const sw = path.strokeWidth;

  switch (path.type) {
    case 'PATH':
      return (
        <path d={path.d ?? ''} fill={fill} stroke={stroke} strokeWidth={sw} />
      );
    case 'CIRCLE':
      return (
        <circle
          cx={path.cx ?? 0}
          cy={path.cy ?? 0}
          r={path.r ?? 1}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
        />
      );
    case 'RECT':
      return (
        <rect
          x={path.x ?? 0}
          y={path.y ?? 0}
          width={path.width ?? 1}
          height={path.height ?? 1}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
        />
      );
    case 'TEXT':
      return (
        <text
          x={path.tx ?? 0}
          y={path.ty ?? 0}
          fontSize={path.fontSize ?? 3}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {path.text ?? ''}
        </text>
      );
    default:
      return null;
  }
}

/** 48 px thumbnail SVG. The symbol's natural units are roughly ± its
 *  defaultSize; pad the viewBox to ± maxSize so every primitive lands
 *  inside the frame without clipping. */
export function SymbolThumbnail({
  symbol,
  size = 48,
}: {
  symbol: SymbolDefinition;
  size?: number;
}) {
  const half = Math.max(symbol.maxSize, symbol.defaultSize * 1.5, 5);
  const color = symbol.colorMode === 'FIXED' && symbol.fixedColor
    ? symbol.fixedColor
    : '#1f2937'; // gray-800 for non-fixed colors in the picker
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`}
      style={{ background: '#fff', borderRadius: 4 }}
    >
      {symbol.paths.map((p, i) => (
        <PathElement key={i} path={p} color={color} />
      ))}
    </svg>
  );
}

export default function SymbolPicker(props: SymbolPickerProps) {
  const { open, selectedSymbolId, onSelect, onClose, customSymbols = [] } = props;
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the search input on open.
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [open]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const all = useMemo<SymbolDefinition[]>(
    () => [...BUILTIN_SYMBOLS, ...customSymbols],
    [customSymbols],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return all;
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.assignedCodes.some((c) => c.toLowerCase().includes(q)),
    );
  }, [all, query]);

  const grouped = useMemo(() => {
    const map = new Map<SymbolDefinition['category'], SymbolDefinition[]>();
    for (const s of filtered) {
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return map;
  }, [filtered]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Pick symbol"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700">
          <Search size={14} className="text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search by name, id, or assigned code"
            className="flex-1 bg-transparent text-white text-xs outline-none placeholder-gray-500"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {CATEGORY_ORDER.map((cat) => {
            const list = grouped.get(cat);
            if (!list || list.length === 0) return null;
            return (
              <section key={cat}>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                  {CATEGORY_LABEL[cat]}
                </h3>
                <div className="grid grid-cols-6 gap-2">
                  {list.map((s) => {
                    const isActive = s.id === selectedSymbolId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          onSelect(s.id);
                          onClose();
                        }}
                        className={
                          'flex flex-col items-center gap-1 p-2 rounded transition-colors ' +
                          (isActive
                            ? 'bg-blue-600 ring-2 ring-blue-400'
                            : 'bg-gray-700 hover:bg-gray-600')
                        }
                        title={s.assignedCodes.length > 0 ? `Codes: ${s.assignedCodes.join(', ')}` : s.id}
                      >
                        <SymbolThumbnail symbol={s} size={40} />
                        <span className="text-[10px] text-white text-center leading-tight line-clamp-2">
                          {s.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-gray-500 text-xs italic text-center py-12">
              No symbols match &quot;{query}&quot;.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-700 text-[10px] text-gray-500 flex items-center justify-between">
          <span>{filtered.length} symbol{filtered.length === 1 ? '' : 's'}</span>
          <span>Esc to close · Click a symbol to assign</span>
        </div>
      </div>
    </div>
  );
}
