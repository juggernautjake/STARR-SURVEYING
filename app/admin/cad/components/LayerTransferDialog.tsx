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
  useTraverseStore,
  useTransferStore,
  useViewportStore,
} from '@/lib/cad/store';
import { featureBounds } from '@/lib/cad/geometry/bounds';
import { transferSelectionToLayer } from '@/lib/cad/operations';
import {
  buildPointNoIndex,
  parsePointRangeString,
  type ParsePointRangeResult,
} from '@/lib/cad/operations/parse-point-range';
import { generateId } from '@/lib/cad/types';
import Tooltip from './Tooltip';
import UnitInput from './UnitInput';
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
  const pointPickCount = pickStats.POINT ?? 0;

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
    // Roll the optional offset into the kernel options when
    // the surveyor enabled it AND a non-zero distance is set
    // (lets them keep a baseline value typed in but skip the
    // translation for one transfer).
    const offset = options.applyOffset && options.offsetDistanceFt > 0
      ? { distanceFt: options.offsetDistanceFt, bearingDeg: options.offsetBearingDeg }
      : null;
    const result = transferSelectionToLayer(
      Array.from(pickedIds),
      targetLayer.id,
      {
        keepOriginals: options.keepOriginals,
        renumberStart: options.renumberStart,
        stripUnknownCodes: options.stripUnknownCodes,
        targetTraverseId: options.targetTraverseId,
        offset,
        bringAlongLinkedGeometry: options.bringAlongLinkedGeometry,
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

            {/* Smart selection helpers — programmatic ways to
                add (or Alt-click subtract) batches of features.
                Composable: surveyors stack "By layer = BOUNDARY"
                + "By type = POLYLINE" + "In viewport" to land
                on "every visible boundary polyline." */}
            <SmartSelectionHelpers />

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

          {/* Traverse destination — surfaces only when at
              least one POINT is in the source set (since the
              traverse only takes points). Surveyor can route
              POINT duplicates into an existing traverse or
              spin up a new one inline. */}
          {options.operation === 'DUPLICATE' && pointPickCount > 0 && (
            <TraverseDestinationField pointPickCount={pointPickCount} />
          )}

          {/* Options block — offset + renumber. Only relevant
              for Duplicate; surfaced as a collapsible disclosure
              so the dialog stays compact for the common case. */}
          {options.operation === 'DUPLICATE' && <OptionsBlock />}
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

// ─── Traverse destination field ────────────────────────────
//
// Surveyor either picks an existing traverse from the list
// or creates a new one inline (name + closed flag). On
// confirm, every duplicated POINT is appended to the chosen
// traverse in the order it was picked.

function TraverseDestinationField({ pointPickCount }: { pointPickCount: number }) {
  const traverseStore = useTraverseStore();
  const setOptions = useTransferStore((s) => s.setOptions);
  const targetTraverseId = useTransferStore((s) => s.options.targetTraverseId);

  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftClosed, setDraftClosed] = useState(false);

  const traverses = Object.values(traverseStore.traverses);

  function createAndSelect() {
    const name = draftName.trim();
    if (!name) return;
    const newId = generateId();
    traverseStore.createTraverse({
      id: newId,
      name,
      pointIds: [],
      isClosed: draftClosed,
      legs: [],
      closure: null,
      adjustedPoints: null,
      adjustmentMethod: null,
      area: null,
    });
    setOptions({ targetTraverseId: newId });
    setCreating(false);
    setDraftName('');
    setDraftClosed(false);
  }

  return (
    <div>
      <label className="block text-[11px] text-gray-400 mb-1">
        Traverse <span className="text-gray-500">— {pointPickCount} point{pointPickCount === 1 ? '' : 's'} can be appended</span>
      </label>
      {!creating ? (
        <div className="flex gap-1.5">
          <select
            value={targetTraverseId ?? ''}
            onChange={(e) => setOptions({ targetTraverseId: e.target.value || null })}
            className="flex-1 bg-gray-700 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          >
            <option value="">— skip (no traverse change) —</option>
            {traverses.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.pointIds.length} pts{t.isClosed ? ', closed' : ''})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="px-2.5 py-1.5 text-[11px] rounded border bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
            title="Spin up a new traverse without leaving this dialog"
          >
            + New…
          </button>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-700 rounded p-2 space-y-2">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Traverse name (e.g. Lot 14 boundary)"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                createAndSelect();
              }
            }}
            className="w-full bg-gray-700 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          />
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={draftClosed}
                onChange={(e) => setDraftClosed(e.target.checked)}
                className="rounded"
              />
              Closed traverse
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => { setCreating(false); setDraftName(''); setDraftClosed(false); }}
                className="px-2 py-1 text-[11px] rounded bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createAndSelect}
                disabled={!draftName.trim()}
                className="px-2 py-1 text-[11px] rounded bg-blue-600 border border-blue-500 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
      {targetTraverseId && (
        <p className="text-[10px] text-gray-500 mt-1">
          {pointPickCount} duplicate{pointPickCount === 1 ? '' : 's'} will be appended to this traverse on Confirm.
        </p>
      )}
    </div>
  );
}


// ─── Options block — apply-offset + renumber-from-N ─────────
//
// Surveyors who duplicate a fence-corner detail at a fixed
// distance or copy a monument cluster onto a new layer with
// fresh point numbers control both from this collapsible
// disclosure. Both fields use the §11.5 unit-aware inputs so
// the surveyor can type "10ft" / "0.5mi" / "N 45-30 E" /
// "45.3000" without thinking about format.

function OptionsBlock() {
  const options = useTransferStore((s) => s.options);
  const setOptions = useTransferStore((s) => s.setOptions);
  // Local boolean for the renumber checkbox; the kernel sees
  // null when off and a number when on. Default seed of 1000
  // matches the spec example.
  const renumberOn = options.renumberStart != null;

  return (
    <details className="bg-gray-900 border border-gray-700 rounded">
      <summary className="px-2 py-1.5 cursor-pointer text-[11px] text-gray-300 hover:text-white select-none">
        Options
        {(options.applyOffset || renumberOn || options.bringAlongLinkedGeometry) && (
          <span className="ml-1.5 text-[10px] text-blue-400">
            ({[
              options.applyOffset && 'offset',
              renumberOn && 'renumber',
              options.bringAlongLinkedGeometry && 'linked',
            ].filter(Boolean).join(', ')})
          </span>
        )}
      </summary>
      <div className="p-2 pt-0 space-y-2.5 border-t border-gray-700">
        {/* ── Apply offset ─────────────────────────────────── */}
        <div>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={options.applyOffset}
              onChange={(e) => setOptions({ applyOffset: e.target.checked })}
              className="rounded"
            />
            Apply offset
          </label>
          {options.applyOffset && (
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Distance</label>
                <UnitInput
                  kind="length"
                  compact
                  value={options.offsetDistanceFt}
                  onChange={(v) => setOptions({ offsetDistanceFt: Math.max(0, v) })}
                  defaultUnit="FT"
                  inputClassName="w-full h-7 bg-gray-700 text-white text-[11px] rounded px-2 outline-none font-mono border focus:border-blue-500"
                  description="Translation distance applied to every duplicate. Accepts unit suffixes (10ft / 0.5mi / 12in / 5m)."
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Bearing</label>
                <UnitInput
                  kind="angle"
                  compact
                  angleMode="AUTO"
                  value={options.offsetBearingDeg}
                  onChange={(v) => setOptions({ offsetBearingDeg: v })}
                  inputClassName="w-full h-7 bg-gray-700 text-white text-[11px] rounded px-2 outline-none font-mono border focus:border-blue-500"
                  description={'Translation bearing — accepts decimal degrees (45.5), DMS-packed (45.3000 = 45°30\'00"), DMS markers, hyphen-DMS (45-30-00), or quadrant bearing (N 45-30 E).'}
                />
              </div>
            </div>
          )}
          <p className="text-[10px] text-gray-500 mt-1">
            Translates every duplicate by distance + bearing (azimuth: 0° = North, clockwise).
          </p>
        </div>

        {/* ── Renumber duplicates ──────────────────────────── */}
        <div className="border-t border-gray-700 pt-2">
          <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={renumberOn}
              onChange={(e) => setOptions({ renumberStart: e.target.checked ? 1000 : null })}
              className="rounded"
            />
            Renumber duplicated points starting at
            <input
              type="number"
              min={0}
              step={1}
              value={options.renumberStart ?? 1000}
              disabled={!renumberOn}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v) && v >= 0) setOptions({ renumberStart: v });
              }}
              className="w-20 h-6 bg-gray-700 text-white text-[11px] px-1.5 rounded border border-gray-600 focus:outline-none focus:border-blue-500 font-mono text-center disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </label>
          <p className="text-[10px] text-gray-500 mt-1">
            When off, duplicates keep their source point numbers (which may collide with existing numbers on the target layer).
          </p>
        </div>

        {/* ── Bring-along linked geometry ──────────────────── */}
        <div className="border-t border-gray-700 pt-2">
          <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={options.bringAlongLinkedGeometry}
              onChange={(e) => setOptions({ bringAlongLinkedGeometry: e.target.checked })}
              className="rounded"
            />
            Bring along linked geometry
          </label>
          <p className="text-[10px] text-gray-500 mt-1">
            Auto-includes any polyline / polygon / arc / spline / line whose vertices are entirely defined by the picked POINTs. Pick all four corners of a building → the polygon comes along too.
          </p>
        </div>
      </div>
    </details>
  );
}

// ─── Smart selection helpers ───────────────────────────────
//
// Programmatic ways to extend (or Alt-click subtract from)
// the picked set without clicking each feature individually.
// Composable: stacking helpers builds an intersection-or-
// difference set incrementally. The Alt modifier inverts a
// helper from "add these" → "remove these from picks."

function SmartSelectionHelpers() {
  const drawingStore = useDrawingStore();
  const docFeatures = drawingStore.document.features;
  const layers = drawingStore.document.layers;
  const layerOrder = drawingStore.document.layerOrder;
  const addPicks = useTransferStore((s) => s.addPicks);
  const removePicks = useTransferStore((s) => s.removePicks);

  const [byCode, setByCode] = useState('');
  const [subtractMode, setSubtractMode] = useState(false);

  // Helper closures share the Alt-key semantic: when alt is
  // true the matched ids are subtracted from the picked set
  // rather than added. The store dedupes adds so the surveyor
  // can mash a helper twice without consequence.
  function applyHelper(ids: string[], alt: boolean) {
    if (ids.length === 0) return;
    if (alt) removePicks(ids);
    else addPicks(ids);
  }

  function helperByLayer(layerId: string, alt: boolean) {
    const ids: string[] = [];
    for (const f of Object.values(docFeatures)) {
      if (f.layerId === layerId && !f.hidden) ids.push(f.id);
    }
    applyHelper(ids, alt);
  }

  function helperByType(type: string, alt: boolean) {
    const ids: string[] = [];
    for (const f of Object.values(docFeatures)) {
      if (f.type === type && !f.hidden) ids.push(f.id);
    }
    applyHelper(ids, alt);
  }

  function helperByCode(rawCode: string, alt: boolean) {
    const codes = rawCode
      .split(/[,;]/)
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    if (codes.length === 0) return;
    const ids: string[] = [];
    for (const f of Object.values(docFeatures)) {
      if (f.hidden) continue;
      const raw = f.properties?.code;
      const code = typeof raw === 'string' ? raw.toUpperCase() : '';
      if (!code) continue;
      // Match either the full code or its base (strips trailing
      // line-control suffix like B / E / BA / EA — surveyors
      // type "BC" to capture every BC* monument).
      for (const target of codes) {
        if (code === target || code.startsWith(target)) {
          ids.push(f.id);
          break;
        }
      }
    }
    applyHelper(ids, alt);
  }

  function helperInViewport(alt: boolean) {
    const vp = useViewportStore.getState();
    if (vp.screenWidth <= 0 || vp.screenHeight <= 0 || vp.zoom <= 0) return;
    const halfW = vp.screenWidth / 2 / vp.zoom;
    const halfH = vp.screenHeight / 2 / vp.zoom;
    const minX = vp.centerX - halfW;
    const maxX = vp.centerX + halfW;
    const minY = vp.centerY - halfH;
    const maxY = vp.centerY + halfH;
    const ids: string[] = [];
    for (const f of Object.values(docFeatures)) {
      if (f.hidden) continue;
      const bb = featureBounds(f);
      if (!Number.isFinite(bb.minX)) continue;
      // AABB-overlap test: feature is "in viewport" when its
      // bbox intersects the visible rect.
      if (bb.maxX < minX || bb.minX > maxX) continue;
      if (bb.maxY < minY || bb.minY > maxY) continue;
      ids.push(f.id);
    }
    applyHelper(ids, alt);
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded p-1.5 mb-1.5 space-y-1.5">
      <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
        Quick {subtractMode ? 'remove' : 'add'}
        <span className="text-gray-600 normal-case font-normal tracking-normal text-[9px]">
          (toggle mode, or Alt-click a button)
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {/* Subtract-mode toggle. Dropdowns can't read the Alt
            key reliably on change (the native event doesn't
            carry modifier state), so we expose a sticky
            toggle: when ON, every helper subtracts from the
            picked set instead of adding. Sits in the helper
            row so it's adjacent to the actions it modifies. */}
        <button
          type="button"
          onClick={() => setSubtractMode((m) => !m)}
          className={`px-2 h-6 text-[11px] rounded border transition-colors ${
            subtractMode
              ? 'bg-red-900/40 border-red-800/60 text-red-300'
              : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-gray-200'
          }`}
          title="When on, helpers below SUBTRACT from the picked set instead of adding. Buttons also honour Alt-click as a one-shot subtract."
        >
          {subtractMode ? 'Mode: subtract −' : 'Mode: add +'}
        </button>

        {/* By layer — dropdown so the surveyor doesn't see a
            10-button row for a 10-layer drawing. */}
        <select
          className="bg-gray-700 text-gray-200 text-[11px] px-1.5 h-6 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          defaultValue=""
          onChange={(e) => {
            const lid = e.target.value;
            if (!lid) return;
            helperByLayer(lid, subtractMode);
            e.target.value = '';
          }}
        >
          <option value="">By layer ▾</option>
          {layerOrder.map((lid) => {
            const lyr = layers[lid];
            if (!lyr) return null;
            return <option key={lid} value={lid}>{lyr.name}</option>;
          })}
        </select>

        {/* By feature type — fixed list. */}
        <select
          className="bg-gray-700 text-gray-200 text-[11px] px-1.5 h-6 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          defaultValue=""
          onChange={(e) => {
            const t = e.target.value;
            if (!t) return;
            helperByType(t, subtractMode);
            e.target.value = '';
          }}
        >
          <option value="">By type ▾</option>
          {['POINT', 'LINE', 'POLYLINE', 'POLYGON', 'CIRCLE', 'ELLIPSE', 'ARC', 'SPLINE', 'TEXT'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* In viewport — single button. Honors both the
            subtract mode toggle and a one-shot Alt-click. */}
        <button
          type="button"
          onClick={(e) => helperInViewport(subtractMode || e.altKey)}
          className="px-2 h-6 text-[11px] rounded border bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600 hover:text-white transition-colors"
          title="Add every visible feature inside the current screen extents. Hold Alt (or toggle subtract mode) to remove instead."
        >
          In viewport
        </button>
      </div>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={byCode}
          onChange={(e) => setByCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              helperByCode(byCode, subtractMode || e.altKey);
              setByCode('');
            }
          }}
          placeholder="By code… (e.g. IRS, BC, MON)"
          className="flex-1 bg-gray-700 text-gray-200 text-[11px] px-2 h-6 rounded border border-gray-600 focus:outline-none focus:border-blue-500 font-mono"
        />
        <button
          type="button"
          onClick={(e) => { helperByCode(byCode, subtractMode || e.altKey); setByCode(''); }}
          disabled={!byCode.trim()}
          className="px-2 h-6 text-[11px] rounded border bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}
