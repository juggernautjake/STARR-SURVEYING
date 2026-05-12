'use client';
// app/admin/cad/components/CodeStylePanel.tsx — Phase 3 §15 code-to-style mapping panel
//
// Tabular editor for the per-code mapping that every drawn feature
// inherits in the absence of a per-feature override. Each row is one
// PointCodeDefinition; clicking any cell opens the right picker:
//   * Symbol cell → SymbolPicker
//   * Line Type cell → LineTypePicker
//   * Color cell → native <input type="color">
//   * Layer cell → <select> of every layer in the active drawing
// Modified cells show a small accent dot; a Reset button appears
// next to each modified row + a global "Reset all" in the footer.

import React, { useMemo, useState } from 'react';
import { Search, X, RotateCcw } from 'lucide-react';
import {
  useCodeStyleStore,
  useDrawingStore,
  getEffectiveCodeStyleMap,
} from '@/lib/cad/store';
import { getSymbolById } from '@/lib/cad/styles/symbol-library';
import { getLineTypeById } from '@/lib/cad/styles/linetype-library';
import { SymbolThumbnail } from './SymbolPicker';
import SymbolPicker from './SymbolPicker';
import LineTypePicker, { LineTypePreview } from './LineTypePicker';
import type { CodeStyleOverride } from '@/lib/cad/store';

interface CodeStylePanelProps {
  open: boolean;
  onClose: () => void;
}

export default function CodeStylePanel({ open, onClose }: CodeStylePanelProps) {
  const overrides = useCodeStyleStore((s) => s.overrides);
  const setOverride = useCodeStyleStore((s) => s.setOverride);
  const resetCode = useCodeStyleStore((s) => s.resetCode);
  const resetAll = useCodeStyleStore((s) => s.resetAll);
  const layers = useDrawingStore((s) => s.document.layerOrder);
  const layerById = useDrawingStore((s) => s.document.layers);

  const [query, setQuery] = useState('');
  const [symbolPickerFor, setSymbolPickerFor] = useState<string | null>(null);
  const [lineTypePickerFor, setLineTypePickerFor] = useState<string | null>(null);

  const rows = useMemo(() => {
    const all = getEffectiveCodeStyleMap(overrides);
    const q = query.trim().toLowerCase();
    if (q.length === 0) return all;
    return all.filter(
      (m) =>
        m.codeAlpha.toLowerCase().includes(q) ||
        m.codeNumeric.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q),
    );
  }, [overrides, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Code style mapping"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700">
          <h2 className="text-white text-sm font-semibold">Code-to-Style Mapping</h2>
          <div className="flex-1 flex items-center gap-2">
            <Search size={14} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search by code, description, or category"
              className="flex-1 bg-transparent text-white text-xs outline-none placeholder-gray-500"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-[11px] text-gray-200">
            <thead className="sticky top-0 bg-gray-800 border-b border-gray-700">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold w-24">Code</th>
                <th className="px-3 py-2 font-semibold">Description</th>
                <th className="px-3 py-2 font-semibold w-28">Category</th>
                <th className="px-3 py-2 font-semibold w-20">Symbol</th>
                <th className="px-3 py-2 font-semibold w-32">Line Type</th>
                <th className="px-3 py-2 font-semibold w-16">Color</th>
                <th className="px-3 py-2 font-semibold w-32">Layer</th>
                <th className="px-3 py-2 font-semibold w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const sym = getSymbolById(m.symbolId);
                const lt = getLineTypeById(m.lineTypeId);
                const fieldsModified = (field: keyof CodeStyleOverride) =>
                  overrides[m.codeAlpha]?.[field] !== undefined;
                return (
                  <tr
                    key={m.codeAlpha}
                    className="border-b border-gray-700 hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-3 py-1.5 font-mono text-amber-300">
                      {m.codeAlpha}
                      <span className="text-gray-500 ml-1">({m.codeNumeric})</span>
                    </td>
                    <td className="px-3 py-1.5 truncate max-w-xs" title={m.description}>
                      {m.description}
                    </td>
                    <td className="px-3 py-1.5 text-gray-400 text-[10px] uppercase">
                      {m.category}
                    </td>
                    {/* Symbol */}
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => setSymbolPickerFor(m.codeAlpha)}
                        className="flex items-center gap-1.5 px-1 py-0.5 bg-gray-700 hover:bg-gray-600 rounded transition-colors w-full"
                        title={sym?.name ?? m.symbolId}
                      >
                        {sym ? <SymbolThumbnail symbol={sym} size={20} /> : <span className="w-5 h-5" />}
                        {fieldsModified('symbolId') && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        )}
                      </button>
                    </td>
                    {/* Line type */}
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => setLineTypePickerFor(m.codeAlpha)}
                        className="flex items-center gap-1.5 px-1 py-0.5 bg-gray-700 hover:bg-gray-600 rounded transition-colors w-full"
                        title={lt?.name ?? m.lineTypeId}
                      >
                        {lt ? (
                          <LineTypePreview lineType={lt} width={80} height={12} color="#e5e7eb" />
                        ) : (
                          <span className="w-20 h-3" />
                        )}
                        {fieldsModified('lineTypeId') && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        )}
                      </button>
                    </td>
                    {/* Color */}
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <input
                          type="color"
                          className="w-7 h-5 rounded border border-gray-600 bg-transparent p-0.5 cursor-pointer"
                          value={m.lineColor}
                          onChange={(e) =>
                            setOverride(m.codeAlpha, 'lineColor', e.target.value)
                          }
                        />
                        {fieldsModified('lineColor') && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        )}
                      </div>
                    </td>
                    {/* Layer */}
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <select
                          className="bg-gray-700 text-white rounded px-1 py-0.5 text-[10px] outline-none border border-gray-600 focus:border-blue-500 max-w-full"
                          value={m.layerId}
                          onChange={(e) =>
                            setOverride(m.codeAlpha, 'layerId', e.target.value)
                          }
                        >
                          {!layers.includes(m.layerId) && (
                            <option value={m.layerId}>{m.layerId} (missing)</option>
                          )}
                          {layers.map((lid) => (
                            <option key={lid} value={lid}>
                              {layerById[lid]?.name ?? lid}
                            </option>
                          ))}
                        </select>
                        {fieldsModified('layerId') && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        )}
                      </div>
                    </td>
                    {/* Reset */}
                    <td className="px-3 py-1.5 text-right">
                      {m.isUserModified && (
                        <button
                          type="button"
                          onClick={() => resetCode(m.codeAlpha)}
                          className="text-gray-400 hover:text-white transition-colors"
                          title="Reset this code to library defaults"
                        >
                          <RotateCcw size={11} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-gray-500 italic">
                    No codes match &quot;{query}&quot;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-700 text-[10px] text-gray-500 flex items-center justify-between">
          <span>
            {rows.length} of {Object.keys(overrides).length > 0 ? rows.length : '...'} codes
            · {Object.keys(overrides).length} modified
          </span>
          <button
            type="button"
            onClick={resetAll}
            disabled={Object.keys(overrides).length === 0}
            className="px-2 py-0.5 text-[11px] rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Reset all overrides
          </button>
        </div>
      </div>

      {/* Pickers — single pair for the whole panel, opened via the
          per-cell buttons by setting the target code alpha. */}
      <SymbolPicker
        open={symbolPickerFor !== null}
        selectedSymbolId={
          symbolPickerFor !== null
            ? (rows.find((r) => r.codeAlpha === symbolPickerFor)?.symbolId ?? null)
            : null
        }
        onSelect={(symbolId) => {
          if (symbolPickerFor) setOverride(symbolPickerFor, 'symbolId', symbolId);
        }}
        onClose={() => setSymbolPickerFor(null)}
      />
      <LineTypePicker
        open={lineTypePickerFor !== null}
        selectedLineTypeId={
          lineTypePickerFor !== null
            ? (rows.find((r) => r.codeAlpha === lineTypePickerFor)?.lineTypeId ?? null)
            : null
        }
        onSelect={(lineTypeId) => {
          if (lineTypePickerFor) setOverride(lineTypePickerFor, 'lineTypeId', lineTypeId);
        }}
        onClose={() => setLineTypePickerFor(null)}
      />
    </div>
  );
}
