'use client';
// app/admin/cad/components/LayerTransferDialog.tsx
//
// Phase 8 §11.7 — cross-layer copy / move / duplicate dialog.
// Slice 1+2 implementation: source set comes from either
// `useSelectionStore` (initial) or live click-to-pick on the
// canvas (Pick mode), destination is a single target layer,
// confirm calls `transferSelectionToLayer`.
//
// Future slices add: type-IDs source mode, traverse routing,
// offset, renumber, code-remap, multi-target paste,
// transfer presets, selection blocks.

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Layers, MousePointerClick, ListChecks, Trash2, Hash, AlertTriangle } from 'lucide-react';
import {
  useDrawingStore,
  useSelectionStore,
  useTransferStore,
} from '@/lib/cad/store';
import { transferSelectionToLayer } from '@/lib/cad/operations';
import {
  buildPointNoIndex,
  parsePointRangeString,
  type ParsePointRangeResult,
} from '@/lib/cad/operations/parse-point-range';
import { generateId } from '@/lib/cad/types';
import Tooltip from './Tooltip';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface Props {
  onClose: () => void;
}

export default function LayerTransferDialog({ onClose }: Props) {
  useEscapeToClose(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const drawingStore = useDrawingStore();
  const layers = drawingStore.document.layers;
  const layerOrder = drawingStore.document.layerOrder;
  // Source mode — picks vs. type-ids tabs. Local because
  // switching is purely a UI affordance that preserves the
  // picked set. Defaults to PICK.
  const [sourceMode, setSourceMode] = useState<'PICK' | 'TYPE'>('PICK');

  const pickedIds = useTransferStore((s) => s.pickedIds);
  const pickModeActive = useTransferStore((s) => s.pickModeActive);
  const options = useTransferStore((s) => s.options);
  const setOptions = useTransferStore((s) => s.setOptions);
  const setPickModeActive = useTransferStore((s) => s.setPickModeActive);
  const clearPicks = useTransferStore((s) => s.clearPicks);
  const removePick = useTransferStore((s) => s.removePick);

  // Default the layer dropdown to the active layer (skip the
  // source layer when every picked feature shares one) so
  // common workflows are one-click.
  useEffect(() => {
    if (options.targetLayerId) return;
    const active = drawingStore.activeLayerId;
    // If every picked feature lives on the same layer, prefer
    // a different one as the default (so the surveyor isn't
    // duplicating onto the same layer unintentionally).
    const firstId = pickedIds.size > 0 ? Array.from(pickedIds)[0] : null;
    const firstFeat = firstId ? drawingStore.getFeature(firstId) : null;
    const sourceLayerId = firstFeat?.layerId ?? null;
    let allSameLayer = true;
    for (const id of pickedIds) {
      const f = drawingStore.getFeature(id);
      if (!f || f.layerId !== sourceLayerId) { allSameLayer = false; break; }
    }
    let targetLayerId = active;
    if (allSameLayer && sourceLayerId === active) {
      // Pick the next layer in order that isn't this one.
      targetLayerId = layerOrder.find((id) => id !== sourceLayerId) ?? active;
    }
    setOptions({ targetLayerId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep keepOriginals in sync with operation.
  useEffect(() => {
    if (options.operation === 'DUPLICATE') {
      if (!options.keepOriginals) setOptions({ keepOriginals: true });
    } else if (options.operation === 'MOVE') {
      if (options.keepOriginals) setOptions({ keepOriginals: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.operation]);

  // Pick-mode keyboard shortcuts. Active only while Pick mode
  // is on so the dialog's Esc-to-close path stays untouched
  // (Esc here just leaves Pick mode; closing the dialog is
  // a separate action via Cancel or X).
  useEffect(() => {
    if (!pickModeActive) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Capture before useEscapeToClose so we leave Pick
        // mode without closing the whole dialog.
        event.preventDefault();
        event.stopPropagation();
        setPickModeActive(false);
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          useTransferStore.getState().clearPicks();
        } else {
          useTransferStore.getState().popLastPick();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pickModeActive, setPickModeActive]);

  // Tally picked features by type so the surveyor sees what's
  // actually queued without scrolling the source list.
  const pickStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of pickedIds) {
      const f = drawingStore.getFeature(id);
      if (!f) continue;
      counts[f.type] = (counts[f.type] ?? 0) + 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedIds]);

  // Conflict pre-pass — Slice 1 covers the two highest-impact
  // ones (locked target, codes outside autoAssignCodes).
  const targetLayer = options.targetLayerId ? layers[options.targetLayerId] : null;
  const targetLocked = targetLayer?.locked === true;
  const codeConflicts = useMemo(() => {
    if (!targetLayer) return new Set<string>();
    const allow = (targetLayer.autoAssignCodes ?? []).map((c) => c.toUpperCase());
    if (allow.length === 0) return new Set<string>();
    const out = new Set<string>();
    for (const id of pickedIds) {
      const f = drawingStore.getFeature(id);
      if (!f) continue;
      const code = typeof f.properties.code === 'string' ? f.properties.code.toUpperCase() : '';
      if (code && !allow.includes(code)) out.add(code);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetLayer, pickedIds]);

  const sourceCount = pickedIds.size;
  const canConfirm =
    sourceCount > 0 &&
    targetLayer != null &&
    !targetLocked;

  function commit() {
    if (!canConfirm || !targetLayer) return;
    const result = transferSelectionToLayer(
      Array.from(pickedIds),
      targetLayer.id,
      {
        keepOriginals: options.keepOriginals,
        renumberStart: options.renumberStart,
        stripUnknownCodes: options.stripUnknownCodes,
        targetTraverseId: options.targetTraverseId,
        transferOperationId: generateId(),
      },
    );
    if (result.written > 0 || result.removed > 0) {
      const verb = options.operation === 'MOVE' ? 'moved' : 'duplicated';
      window.dispatchEvent(new CustomEvent('cad:commandOutput', {
        detail: { text: `${result.written} feature${result.written === 1 ? '' : 's'} ${verb} to ${targetLayer.name}.` },
      }));
    }
    onClose();
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:justify-center pointer-events-none"
    >
      {/* Floating panel — non-modal so the surveyor can pan /
          zoom / pick on the canvas while it stays open. */}
      <div
        className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-[440px] m-4 text-sm text-gray-200 overflow-hidden pointer-events-auto animate-[scaleIn_180ms_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-600 bg-gray-750">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-blue-400" />
            <h2 className="font-semibold text-white">Send to Layer</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Operation picker */}
          <div>
            <label className="block text-[11px] text-gray-400 mb-1">Operation</label>
            <div className="grid grid-cols-3 gap-1">
              {(['DUPLICATE', 'MOVE', 'COPY_TO_CLIPBOARD'] as const).map((op) => (
                <button
                  key={op}
                  onClick={() => setOptions({ operation: op })}
                  className={`px-2 py-1.5 text-xs rounded border transition-colors ${
                    options.operation === op
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white'
                  }`}
                >
                  {op === 'DUPLICATE' ? 'Duplicate' : op === 'MOVE' ? 'Move' : 'Copy'}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 mt-1">
              {options.operation === 'DUPLICATE' && 'Originals stay; copies land on the target.'}
              {options.operation === 'MOVE' && 'Originals are reassigned to the target layer.'}
              {options.operation === 'COPY_TO_CLIPBOARD' && 'Hold for paste in another drawing — no immediate write.'}
            </p>
          </div>

          {/* Source */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-gray-400">Source</label>
              {/* Pick / Type-IDs source-mode toggle. Switching
                  preserves the picked set so surveyors can mix
                  approaches without losing their work. */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setSourceMode('PICK'); setPickModeActive(false); }}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded border transition-colors ${
                    sourceMode === 'PICK'
                      ? 'bg-gray-600 border-gray-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-gray-200'
                  }`}
                  title="Click features on the canvas to add to the source set"
                >
                  <MousePointerClick size={12} />
                  Pick
                </button>
                <button
                  onClick={() => { setSourceMode('TYPE'); setPickModeActive(false); }}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded border transition-colors ${
                    sourceMode === 'TYPE'
                      ? 'bg-gray-600 border-gray-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-gray-200'
                  }`}
                  title="Type or paste point numbers (12, 14-19, 22)"
                >
                  <Hash size={12} />
                  Type IDs
                </button>
              </div>
            </div>

            {sourceMode === 'PICK' && (
              <div className="flex items-center justify-end mb-1">
                <Tooltip
                  label="Pick mode"
                  description="Click features on the canvas to add to the source set. Click a glowing feature again (or Alt+click) to remove. Backspace pops the most recent pick."
                  side="left"
                  delay={400}
                >
                  <button
                    onClick={() => setPickModeActive(!pickModeActive)}
                    className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded border transition-colors ${
                      pickModeActive
                        ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_0_2px_rgba(59,130,246,0.3)]'
                        : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white'
                    }`}
                  >
                    <MousePointerClick size={12} />
                    {pickModeActive ? 'Pick mode ON' : 'Pick on canvas'}
                  </button>
                </Tooltip>
              </div>
            )}

            {sourceMode === 'TYPE' && <TypeIdsField />}


            <div className="bg-gray-900 border border-gray-700 rounded p-2 max-h-[160px] overflow-y-auto">
              {sourceCount === 0 ? (
                <p className="text-[11px] text-gray-500 text-center py-3">
                  {pickModeActive
                    ? 'Click features on the canvas to add them.'
                    : 'No features picked. Toggle Pick on canvas, or use the active selection.'}
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-1 flex-wrap mb-2">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">{sourceCount} picked:</span>
                    {Object.entries(pickStats).map(([type, n]) => (
                      <span key={type} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300">
                        {n} {type}
                      </span>
                    ))}
                  </div>
                  <ul className="space-y-0.5">
                    {Array.from(pickedIds).slice(0, 12).map((id) => {
                      const f = drawingStore.getFeature(id);
                      const layer = f ? layers[f.layerId] : null;
                      return (
                        <li key={id} className="flex items-center justify-between gap-2 group">
                          <span className="text-[11px] text-gray-300 truncate min-w-0">
                            <span className="font-mono text-gray-500">#{id.slice(0, 6)}</span>
                            <span className="ml-1.5">{f?.type ?? '—'}</span>
                            {layer && <span className="ml-1.5 text-gray-500">on {layer.name}</span>}
                          </span>
                          <button
                            onClick={() => removePick(id)}
                            className="text-gray-500 hover:text-red-400 opacity-50 group-hover:opacity-100 transition-opacity"
                            title="Remove from selection"
                            aria-label={`Remove ${id.slice(0, 6)} from selection`}
                          >
                            <X size={11} />
                          </button>
                        </li>
                      );
                    })}
                    {sourceCount > 12 && (
                      <li className="text-[10px] text-gray-500 italic px-1">
                        … and {sourceCount - 12} more
                      </li>
                    )}
                  </ul>
                </>
              )}
            </div>

            <div className="flex items-center justify-between mt-1.5 text-[10px]">
              <button
                onClick={() => {
                  const ids = Array.from(useSelectionStore.getState().selectedIds);
                  if (ids.length > 0) useTransferStore.getState().addPicks(ids);
                }}
                className="flex items-center gap-1 text-gray-400 hover:text-blue-400 transition-colors"
              >
                <ListChecks size={11} />
                Add active selection
              </button>
              {sourceCount > 0 && (
                <button
                  onClick={clearPicks}
                  className="flex items-center gap-1 text-gray-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={11} />
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Destination */}
          {options.operation !== 'COPY_TO_CLIPBOARD' && (
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">Target layer</label>
              <select
                value={options.targetLayerId ?? ''}
                onChange={(e) => setOptions({ targetLayerId: e.target.value || null })}
                className="w-full bg-gray-700 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
              >
                <option value="">— select a layer —</option>
                {layerOrder.map((lid) => {
                  const lyr = layers[lid];
                  if (!lyr) return null;
                  return (
                    <option key={lid} value={lid}>
                      {lyr.name}{lyr.locked ? ' (🔒 locked)' : ''}
                    </option>
                  );
                })}
              </select>
              {targetLocked && (
                <p className="text-[10px] text-amber-400 mt-1">
                  Target layer is locked — unlock it from the Layers panel before confirming.
                </p>
              )}
              {codeConflicts.size > 0 && (
                <p className="text-[10px] text-amber-400 mt-1">
                  {codeConflicts.size} code{codeConflicts.size === 1 ? '' : 's'} not in the target layer&apos;s allow-list:
                  <span className="ml-1 font-mono text-gray-300">{Array.from(codeConflicts).slice(0, 5).join(', ')}</span>
                  <label className="ml-2 inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.stripUnknownCodes}
                      onChange={(e) => setOptions({ stripUnknownCodes: e.target.checked })}
                      className="rounded"
                    />
                    Strip those codes
                  </label>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-600 bg-gray-900/40">
          <span className="text-[10px] text-gray-500">
            {pickModeActive ? 'Click features to add. Esc leaves Pick mode.' : 'Slice 1 — multi-target paste, traverse routing, presets land later.'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={commit}
              disabled={!canConfirm}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Type-IDs source-mode field ────────────────────────────
//
// Surveyor types or pastes a comma / hyphen-range string;
// every parsed token is rendered as a chip with a colour
// keyed off its resolution status:
//
//   green  — exactly one POINT matches (resolved)
//   amber  — two-or-more POINTs match (ambiguous, surveyor
//            picks the right one via a popover)
//   red    — no POINT matches that number
//   slate  — token didn't parse as a number / range
//
// Pressing Enter (or clicking Add) appends every resolved
// feature id to the dialog's pickedIds set. Ambiguous tokens
// are skipped so the surveyor consciously disambiguates.

function TypeIdsField() {
  const drawingStore = useDrawingStore();
  const addPicks = useTransferStore((s) => s.addPicks);
  const addPick = useTransferStore((s) => s.addPick);
  const [raw, setRaw] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Index built per-render: cheap (single linear pass) and we
  // need it fresh in case features were added between dialog
  // opens. For very large drawings (10k+ POINTs) we'd memoise
  // off `document.features` reference, but skip the
  // optimisation until the canvas profile shows it.
  const index = useMemo(
    () => buildPointNoIndex(Object.values(drawingStore.document.features)),
    [drawingStore.document.features],
  );

  const parsed: ParsePointRangeResult | null = useMemo(() => {
    if (!raw.trim()) return null;
    return parsePointRangeString(raw, index);
  }, [raw, index]);

  function commit() {
    if (!parsed) return;
    if (parsed.resolvedFeatureIds.length === 0) return;
    addPicks(parsed.resolvedFeatureIds);
    setRaw('');
    inputRef.current?.focus();
  }

  function pickAmbiguous(featureId: string) {
    addPick(featureId);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="e.g. 12, 14-19, 22"
          className="flex-1 bg-gray-700 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-blue-500 font-mono"
        />
        <button
          onClick={commit}
          disabled={!parsed || parsed.resolvedFeatureIds.length === 0}
          className="px-2.5 py-1.5 text-[11px] rounded border bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Add every resolved point to the source set"
        >
          Add{parsed && parsed.resolvedFeatureIds.length > 0 ? ` (${parsed.resolvedFeatureIds.length})` : ''}
        </button>
      </div>
      {parsed && (
        <div className="flex flex-wrap gap-1">
          {parsed.tokens.map((tok, ti) =>
            tok.resolutions.map((res, ri) => {
              const key = `${ti}-${ri}-${res.pointNo}`;
              if (res.status === 'RESOLVED') {
                return (
                  <span
                    key={key}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/40 border border-green-800/60 text-green-300 font-mono"
                    title={`Point #${res.pointNo} → ${res.featureId.slice(0, 8)}`}
                  >
                    #{res.pointNo}
                  </span>
                );
              }
              if (res.status === 'MISSING') {
                return (
                  <span
                    key={key}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 border border-red-800/60 text-red-300 font-mono"
                    title={`#${res.pointNo} not found in this drawing`}
                  >
                    #{res.pointNo} ✕
                  </span>
                );
              }
              // AMBIGUOUS — render a clickable chip per matching feature.
              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-800/60 text-amber-300 font-mono"
                  title={`#${res.pointNo} appears on multiple layers — pick which one to add`}
                >
                  <AlertTriangle size={9} />
                  #{res.pointNo}
                  {res.featureIds.map((fid) => {
                    const feat = drawingStore.getFeature(fid);
                    const layerName = feat ? drawingStore.document.layers[feat.layerId]?.name ?? '?' : '?';
                    return (
                      <button
                        key={fid}
                        onClick={() => pickAmbiguous(fid)}
                        className="ml-1 px-1 rounded bg-amber-800/60 text-amber-100 hover:bg-amber-700 transition-colors text-[9px]"
                        title={`Add the #${res.pointNo} on ${layerName}`}
                      >
                        {layerName}
                      </button>
                    );
                  })}
                </span>
              );
            }),
          )}
          {parsed.invalidTokens.map((t) => (
            <span
              key={`inv-${t}`}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-500 font-mono italic"
              title="Couldn't parse as a number or range"
            >
              {t} ?
            </span>
          ))}
        </div>
      )}
      <p className="text-[10px] text-gray-500">
        Comma + hyphen ranges. <span className="font-mono">12, 14-19, 22</span> resolves to 8 points.
        Reverse ranges work too. Press <kbd className="font-mono px-1 rounded bg-gray-800 border border-gray-700">Enter</kbd> to add.
      </p>
    </div>
  );
}
