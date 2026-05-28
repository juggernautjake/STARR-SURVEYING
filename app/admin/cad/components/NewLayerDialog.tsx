'use client';
// app/admin/cad/components/NewLayerDialog.tsx
//
// Modal shown when creating a new layer (plan §11): name the layer,
// give it a color + description, and optionally move existing points
// into it on creation.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md §11

import { useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import { buildPointRows } from '@/lib/cad/points/point-rows';
import { useExitTransition } from '../hooks/useExitTransition';

export interface NewLayerResult {
  name: string;
  color: string;
  description: string;
  pointIds: string[];
}

export default function NewLayerDialog({
  defaultName,
  defaultColor,
  onCreate,
  onClose,
}: {
  defaultName: string;
  defaultColor: string;
  onCreate: (result: NewLayerResult) => void;
  onClose: () => void;
}) {
  const doc = useDrawingStore((s) => s.document);
  const { closing, requestClose } = useExitTransition(onClose);
  const [name, setName] = useState(defaultName);
  const [color, setColor] = useState(defaultColor);
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [searchBy, setSearchBy] = useState<'NAME' | 'CODE'>('NAME');

  const points = useMemo(() => buildPointRows(doc), [doc]);

  // Live filter — strictly by the selected field (NAME or CODE) so the
  // results always pertain to the chosen filter. Previously NAME mode fell
  // through to code+description, which let a code-only match (e.g. "308" in
  // the description) sneak into the name results.
  const visiblePoints = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return points;
    if (searchBy === 'CODE') {
      return points.filter((p) => (p.code || '').toLowerCase().includes(q));
    }
    return points.filter((p) => (p.name || '').toLowerCase().includes(q));
  }, [points, search, searchBy]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function submit() {
    const finalName = name.trim() || defaultName;
    onCreate({ name: finalName, color, description: description.trim(), pointIds: [...selected] });
  }

  return (
    <div className={`fixed inset-0 z-[120] flex items-center justify-center bg-black/60 ${closing ? 'opacity-0 transition-opacity duration-150' : 'animate-[fadeIn_150ms_ease-out] motion-reduce:animate-none'}`}>
      <div className={`bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-full max-w-md text-sm text-gray-200 ${closing ? 'opacity-0 scale-95 transition-all duration-150' : 'animate-[scaleIn_180ms_cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none'}`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <h2 className="font-semibold text-white">New layer</h2>
          <button type="button" onClick={requestClose} className="p-1 hover:bg-gray-700 rounded" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <label className="block">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Name</span>
            <input
              autoFocus
              aria-label="Layer name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              className="mt-1 w-full bg-gray-900 text-gray-100 placeholder-gray-500 border border-gray-600 rounded px-2 py-1 outline-none focus:border-blue-500"
            />
          </label>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Color</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-7 w-10 bg-transparent border border-gray-600 rounded cursor-pointer"
                aria-label="Layer color"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Description (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What goes on this layer?"
              className="mt-1 w-full bg-gray-900 text-gray-100 placeholder-gray-500 border border-gray-600 rounded px-2 py-1 outline-none focus:border-blue-500 resize-none"
            />
          </label>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 uppercase tracking-wide">
                Move points into this layer ({selected.size})
              </span>
              {points.length > 0 && (
                <div className="flex gap-2 text-xs">
                  <button type="button" className="text-blue-400 hover:underline" onClick={() => setSelected((prev) => new Set([...prev, ...visiblePoints.map((p) => p.id)]))}>All</button>
                  <button type="button" className="text-blue-400 hover:underline" onClick={() => setSelected(new Set())}>None</button>
                </div>
              )}
            </div>

            {points.length > 0 && (
              <div className="flex items-center gap-1 mb-1">
                <div className="flex h-7 rounded border border-gray-600 overflow-hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => setSearchBy('NAME')}
                    className={`h-full px-2 text-[11px] leading-none ${searchBy === 'NAME' ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'}`}
                  >
                    Name
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchBy('CODE')}
                    className={`h-full px-2 text-[11px] leading-none border-l border-gray-600 ${searchBy === 'CODE' ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'}`}
                  >
                    Code
                  </button>
                </div>
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={searchBy === 'CODE' ? 'Search by code… (e.g. BC, IRF)' : 'Search by name… (e.g. 8, 87fnd)'}
                    className="w-full h-7 pl-8 pr-7 bg-gray-900 text-gray-100 placeholder-gray-500 border border-gray-600 rounded text-[11px] outline-none focus:border-blue-500"
                  />
                  {search && (
                    <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300" aria-label="Clear search"><X size={11} /></button>
                  )}
                </div>
              </div>
            )}

            <div className="max-h-40 overflow-auto border border-gray-700 rounded">
              {visiblePoints.map((p) => (
                <div
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className="flex items-center gap-2 px-2 py-1 hover:bg-gray-700/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="accent-blue-500"
                    style={{ width: 14, height: 14, flex: '0 0 auto' }}
                  />
                  <span className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="font-mono text-gray-100 shrink-0">{p.name || '(unnamed)'}</span>
                    {p.code && <span className="text-[10px] text-amber-400 shrink-0">{p.code}</span>}
                    {p.description && <span className="text-[10px] text-gray-400 truncate min-w-0">{p.description}</span>}
                    <span className="text-gray-500 text-[10px] shrink-0 ml-auto">N {p.northing.toFixed(1)} E {p.easting.toFixed(1)}</span>
                  </span>
                </div>
              ))}
              {points.length === 0 && (
                <div className="px-2 py-3 text-gray-500 text-xs">No points yet — you can add them later.</div>
              )}
              {points.length > 0 && visiblePoints.length === 0 && (
                <div className="px-2 py-3 text-gray-500 text-xs">No points match &ldquo;{search}&rdquo;.</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-700">
          <button type="button" onClick={requestClose} className="px-3 py-1.5 text-gray-300 hover:bg-gray-700 rounded">Cancel</button>
          <button type="button" onClick={submit} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium">
            Create layer
          </button>
        </div>
      </div>
    </div>
  );
}
