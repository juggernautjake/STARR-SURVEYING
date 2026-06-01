'use client';
// app/admin/cad/components/LineTypePicker.tsx — Phase 3 §11 LineTypePicker
//
// Modal picker for line types. Each row renders a 100 px SVG preview
// of the dash pattern + a "FENCE/UTIL/SPEC" badge so the surveyor can
// scan the list visually rather than guessing from name. Mirrors the
// SymbolPicker shape so PropertyPanel can mount both with the same
// surface.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Pencil, Trash2 } from 'lucide-react';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';
import { confirmAction } from './ConfirmDialog';
import type { LineTypeDefinition } from '@/lib/cad/styles/types';
import { BUILTIN_LINE_TYPES } from '@/lib/cad/styles/linetype-library';
import { useDrawingStore } from '@/lib/cad/store';
import LineTypeEditor from './LineTypeEditor';

interface LineTypePickerProps {
  open: boolean;
  selectedLineTypeId: string | null;
  onSelect: (lineTypeId: string) => void;
  onClose: () => void;
  customLineTypes?: LineTypeDefinition[];
}

const CATEGORY_LABEL: Record<LineTypeDefinition['category'], string> = {
  BASIC: 'Basic Patterns',
  PATTERN: 'Symbol Patterns',
  FENCE: 'Fences',
  UTILITY: 'Utilities',
  SPECIALTY: 'Specialty',
  CUSTOM: 'Custom',
};

const CATEGORY_ORDER: LineTypeDefinition['category'][] = [
  'BASIC',
  'PATTERN',
  'FENCE',
  'UTILITY',
  'SPECIALTY',
  'CUSTOM',
];

/** Render the dashPattern as an SVG line preview. Solid (empty dash
 *  array) renders as a continuous stroke; non-empty patterns use
 *  stroke-dasharray. Inline symbols (e.g. barbed-wire X marks) aren't
 *  rendered in the preview — the picker shows the underlying line
 *  shape; the FENCE / UTILITY categories tell the surveyor the symbols
 *  are along the stroke. */
export function LineTypePreview({
  lineType,
  width = 100,
  height = 16,
  color = '#1f2937',
}: {
  lineType: LineTypeDefinition;
  width?: number;
  height?: number;
  color?: string;
}) {
  const dash = lineType.dashPattern.length > 0
    ? lineType.dashPattern.join(' ')
    : undefined;
  const y = height / 2;
  return (
    <svg width={width} height={height} style={{ background: '#fff', borderRadius: 2 }}>
      <line
        x1={2}
        y1={y}
        x2={width - 2}
        y2={y}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={dash}
        strokeLinecap="butt"
      />
    </svg>
  );
}

export default function LineTypePicker(props: LineTypePickerProps) {
  const { open, selectedLineTypeId, onSelect, onClose, customLineTypes = [] } = props;
  const [query, setQuery] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitial, setEditorInitial] = useState<LineTypeDefinition | null>(null);
  const removeCustomLineType = useDrawingStore((s) => s.removeCustomLineType);
  const inputRef = useRef<HTMLInputElement>(null);

  function openEditor(initial: LineTypeDefinition | null) {
    setEditorInitial(initial);
    setEditorOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [open]);

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

  const all = useMemo<LineTypeDefinition[]>(
    () => [...BUILTIN_LINE_TYPES, ...customLineTypes],
    [customLineTypes],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return all;
    return all.filter(
      (lt) =>
        lt.name.toLowerCase().includes(q) ||
        lt.id.toLowerCase().includes(q) ||
        lt.assignedCodes.some((c) => c.toLowerCase().includes(q)),
    );
  }, [all, query]);

  const grouped = useMemo(() => {
    const map = new Map<LineTypeDefinition['category'], LineTypeDefinition[]>();
    for (const lt of filtered) {
      const list = map.get(lt.category) ?? [];
      list.push(lt);
      map.set(lt.category, list);
    }
    return map;
  }, [filtered]);

  if (!open) return null;

  return (
    <ModalFrame
      open
      onClose={onClose}
      scrollBody={false}
      title="Line Types"
      initialWidth={680}
      initialHeight={560}
      minWidth={420}
      minHeight={320}
    >
      <div className="flex flex-col h-full min-h-0">
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
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {CATEGORY_ORDER.map((cat) => {
            const list = grouped.get(cat);
            if (!list || list.length === 0) return null;
            return (
              <section key={cat}>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                  {CATEGORY_LABEL[cat]}
                </h3>
                <div className="space-y-1">
                  {list.map((lt) => {
                    const isActive = lt.id === selectedLineTypeId;
                    const hasInline = lt.inlineSymbols.length > 0;
                    return (
                      <div
                        key={lt.id}
                        className={
                          'group w-full flex items-center gap-2 pl-2 pr-1 py-1.5 rounded transition-colors ' +
                          (isActive
                            ? 'bg-blue-600 ring-1 ring-blue-400'
                            : 'bg-gray-700 hover:bg-gray-600')
                        }
                      >
                        <button
                          type="button"
                          onClick={() => { onSelect(lt.id); onClose(); }}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                          title={lt.assignedCodes.length > 0 ? `Codes: ${lt.assignedCodes.join(', ')}` : lt.id}
                        >
                          <LineTypePreview lineType={lt} />
                          <span className="flex-1 text-[11px] text-white truncate">{lt.name}</span>
                          {hasInline && (
                            <span className="text-[9px] text-amber-300 uppercase">inline</span>
                          )}
                          {lt.specialRenderer !== 'NONE' && (
                            <span className="text-[9px] text-purple-300 uppercase">{lt.specialRenderer}</span>
                          )}
                        </button>
                        {/* Edit (custom) or duplicate-to-edit (built-in) */}
                        <button
                          type="button"
                          title={lt.isBuiltIn ? 'Duplicate & edit' : 'Edit'}
                          onClick={(e) => { e.stopPropagation(); openEditor(lt); }}
                          className="p-1 rounded text-gray-300 hover:text-white hover:bg-gray-500/40 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Pencil size={12} />
                        </button>
                        {!lt.isBuiltIn && (
                          <button
                            type="button"
                            title="Delete"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const ok = await confirmAction({
                                title: 'Delete line type?',
                                message: `Delete custom line type "${lt.name}"?`,
                                confirmLabel: 'Delete',
                                cancelLabel: 'Cancel',
                                danger: true,
                              });
                              if (ok) removeCustomLineType(lt.id);
                            }}
                            className="p-1 rounded text-gray-300 hover:text-white hover:bg-red-600/60 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-gray-500 text-xs italic text-center py-12">
              No line types match &quot;{query}&quot;.
            </p>
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-700 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => openEditor(null)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[11px] rounded transition-colors"
          >
            <Plus size={13} /> New custom line type
          </button>
          <span className="text-[10px] text-gray-500">
            {filtered.length} type{filtered.length === 1 ? '' : 's'} · hover a row to edit
          </span>
        </div>
      </div>

      <LineTypeEditor
        open={editorOpen}
        initial={editorInitial}
        onClose={() => setEditorOpen(false)}
        onSaved={(id) => { setEditorOpen(false); onSelect(id); }}
      />
    </ModalFrame>
  );
}
