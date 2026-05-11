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
  useUIStore,
  useViewportStore,
} from '@/lib/cad/store';
import { featureBounds } from '@/lib/cad/geometry/bounds';
import { transferSelectionToLayer } from '@/lib/cad/operations';
import {
  buildPointNoIndex,
  parsePointRangeString,
  type ParsePointRangeResult,
} from '@/lib/cad/operations/parse-point-range';
import { suggestCodeMapping } from '@/lib/cad/operations/suggest-code-mapping';
import { generateId } from '@/lib/cad/types';
import Tooltip from './Tooltip';
import UnitInput from './UnitInput';
import { confirmAction } from './ConfirmDialog';
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
  // Phase 8 §11.7 Slice 18 — right-click context menu on
  // source-list rows. `target` carries the feature id the
  // surveyor clicked (or null for an empty-area click), so
  // the menu knows whether to show single-row actions.
  const [sourceListMenu, setSourceListMenu] = useState<{
    x: number;
    y: number;
    targetFeatureId: string | null;
  } | null>(null);

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

  // Auto-load the default transfer preset on first open (if
  // the surveyor marked one as default). Only runs when the
  // dialog opens with options at the factory defaults, so a
  // right-click "Send to Layer…" entry that pre-set the
  // operation doesn't get its semantics stomped.
  useEffect(() => {
    const presets = useUIStore.getState().transferPresets;
    const def = presets.find((p) => p.isDefault);
    if (!def) return;
    // Same guard as the layer-fallback above: only fill in
    // when nothing has been customised yet.
    if (options.targetLayerId) return;
    setOptions(def.options);
    useTransferStore.getState().setActivePresetId(def.id);
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

  async function commit() {
    if (!canConfirm || !targetLayer) return;

    // ── Mistake-prevention: confirm bulk Moves ─────────────
    // Move > 5 features is the threshold the existing bulk-
    // delete confirm uses; keep behaviour consistent. Single-
    // feature and small Moves don't get a prompt.
    const sourceIds = Array.from(pickedIds);
    if (options.operation === 'MOVE' && sourceIds.length >= 5) {
      const ok = await confirmAction({
        title: 'Move features?',
        message: `Move ${sourceIds.length} feature${sourceIds.length === 1 ? '' : 's'} to "${targetLayer.name}"? Originals will be removed from their current layer.`,
        confirmLabel: 'Move',
        cancelLabel: 'Cancel',
        danger: true,
      });
      if (!ok) return;
    }

    // Capture source-layer ids BEFORE the kernel runs so a
    // post-Confirm lock can target only the layers the
    // duplicates actually came from.
    const sourceLayerIds = new Set<string>();
    if (options.operation === 'DUPLICATE' && options.lockSourceAfterCopy) {
      for (const id of sourceIds) {
        const f = drawingStore.getFeature(id);
        if (f) sourceLayerIds.add(f.layerId);
      }
    }

    // Roll the optional offset into the kernel options when
    // the surveyor enabled it AND a non-zero distance is set
    // (lets them keep a baseline value typed in but skip the
    // translation for one transfer).
    const offset = options.applyOffset && options.offsetDistanceFt > 0
      ? { distanceFt: options.offsetDistanceFt, bearingDeg: options.offsetBearingDeg }
      : null;
    const result = transferSelectionToLayer(
      sourceIds,
      targetLayer.id,
      {
        keepOriginals: options.keepOriginals,
        renumberStart: options.renumberStart,
        stripUnknownCodes: options.stripUnknownCodes,
        targetTraverseId: options.targetTraverseId,
        offset,
        bringAlongLinkedGeometry: options.bringAlongLinkedGeometry,
        codeMap: Object.keys(options.codeMap).length > 0 ? options.codeMap : null,
        transferOperationId: generateId(),
      },
    );
    if (result.written > 0 || result.removed > 0) {
      const verb = options.operation === 'MOVE' ? 'moved' : 'duplicated';
      window.dispatchEvent(new CustomEvent('cad:commandOutput', {
        detail: { text: `${result.written} feature${result.written === 1 ? '' : 's'} ${verb} to ${targetLayer.name}.` },
      }));
      // Bump preset stats so the dropdown surfaces popular
      // presets at the top on the next dialog open.
      const activeId = useTransferStore.getState().activePresetId;
      if (activeId) {
        useUIStore.getState().recordTransferPresetUse(activeId);
      }
      // Optional post-Confirm lock: every layer the
      // duplicates came from gets locked so the surveyor
      // can't accidentally edit the originals.
      if (sourceLayerIds.size > 0) {
        for (const lid of sourceLayerIds) {
          drawingStore.updateLayer(lid, { locked: true });
        }
        window.dispatchEvent(new CustomEvent('cad:commandOutput', {
          detail: { text: `Locked ${sourceLayerIds.size} source layer${sourceLayerIds.size === 1 ? '' : 's'}.` },
        }));
      }
      // Flash the green pulse on the result ids. Auto-clears
      // after 1500 ms so the canvas doesn't stay visually
      // noisy.
      useTransferStore.getState().flashRecentlyTransferred(result.resultIds);
      setTimeout(() => {
        useTransferStore.getState().clearRecentlyTransferred();
      }, 1500);
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

            <div
              className="bg-gray-900 border border-gray-700 rounded p-2 max-h-[160px] overflow-y-auto"
              onContextMenu={(e) => {
                // Container-level right-click — fires when the
                // surveyor right-clicks outside a row. Same
                // menu, no per-feature target.
                if (e.target === e.currentTarget && sourceCount > 0) {
                  e.preventDefault();
                  setSourceListMenu({ x: e.clientX, y: e.clientY, targetFeatureId: null });
                }
              }}
            >
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
                        <li
                          key={id}
                          className="flex items-center justify-between gap-2 group hover:bg-gray-800/60 rounded px-1"
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setSourceListMenu({ x: e.clientX, y: e.clientY, targetFeatureId: id });
                          }}
                        >
                          <span className="text-[11px] text-gray-300 truncate min-w-0">
                            <span className="font-mono text-gray-500">#{id.slice(0, 6)}</span>
                            <span className="ml-1.5">{f?.type ?? '—'}</span>
                            {layer && <span className="ml-1.5 text-gray-500">on {layer.name}</span>}
                          </span>
                          <button
                            onClick={() => removePick(id)}
                            className="text-gray-500 hover:text-red-400 opacity-50 group-hover:opacity-100 transition-opacity"
                            title="Remove from selection (right-click for more actions)"
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
                <CodeRemapTable
                  conflictCodes={codeConflicts}
                  targetAllowList={targetLayer?.autoAssignCodes ?? []}
                />
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

          {/* Preset save / load row — captures op + destination
              + options snapshot (NOT source set) so surveyor
              can re-run a "Working → Print copy" routing in
              one click. */}
          <TransferPresetsRow />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-600 bg-gray-900/40">
          <span className="text-[10px] text-gray-500">
            {pickModeActive ? 'Click features to add. Esc leaves Pick mode.' : 'Tip: save the current setup as a preset for one-click re-use.'}
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

      {/* Phase 8 §11.7 Slice 18 — source-list right-click
          context menu. Positioned at the click coords;
          dismissed by Escape, by clicking outside, or by
          picking an action. */}
      {sourceListMenu && (
        <SourceListContextMenu
          x={sourceListMenu.x}
          y={sourceListMenu.y}
          targetFeatureId={sourceListMenu.targetFeatureId}
          onClose={() => setSourceListMenu(null)}
        />
      )}
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
        {(options.applyOffset || renumberOn || options.bringAlongLinkedGeometry || options.lockSourceAfterCopy) && (
          <span className="ml-1.5 text-[10px] text-blue-400">
            ({[
              options.applyOffset && 'offset',
              renumberOn && 'renumber',
              options.bringAlongLinkedGeometry && 'linked',
              options.lockSourceAfterCopy && 'lock source',
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

        {/* ── Lock source after copy ──────────────────────── */}
        <div className="border-t border-gray-700 pt-2">
          <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={options.lockSourceAfterCopy}
              onChange={(e) => setOptions({ lockSourceAfterCopy: e.target.checked })}
              className="rounded"
            />
            Lock source layer after copy
          </label>
          <p className="text-[10px] text-gray-500 mt-1">
            After a successful Duplicate, every layer the source features came from gets locked so you can&apos;t accidentally edit the originals while working on the duplicate. Move never triggers this.
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

// ─── Transfer presets — save / load / set default ──────────
//
// Surveyor saves the current routing + options snapshot as
// a named preset; selecting one later fills the dialog so
// they can re-run the routing in one click. Source set is
// NEVER captured (it's per-job). Default preset auto-loads
// on dialog open. Dropdown sorts by lastUsedAt so recently
// popular presets bubble to the top.

function TransferPresetsRow() {
  const presets = useUIStore((s) => s.transferPresets);
  const addPreset = useUIStore((s) => s.addTransferPreset);
  const removePreset = useUIStore((s) => s.removeTransferPreset);
  const setDefaultPreset = useUIStore((s) => s.setDefaultTransferPreset);
  const options = useTransferStore((s) => s.options);
  const setOptions = useTransferStore((s) => s.setOptions);
  const activePresetId = useTransferStore((s) => s.activePresetId);
  const setActivePresetId = useTransferStore((s) => s.setActivePresetId);

  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDefault, setDraftDefault] = useState(false);

  // Sort: default first, then by last-used desc (null at bottom).
  const sorted = useMemo(() => {
    const list = [...presets];
    list.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      const at = a.lastUsedAt ? Date.parse(a.lastUsedAt) : 0;
      const bt = b.lastUsedAt ? Date.parse(b.lastUsedAt) : 0;
      return bt - at;
    });
    return list;
  }, [presets]);

  function applyPreset(id: string) {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    setOptions(preset.options);
    setActivePresetId(id);
  }

  function saveCurrent() {
    const name = draftName.trim();
    if (!name) return;
    const id = addPreset(name, options, draftDefault);
    if (id) setActivePresetId(id);
    setSaving(false);
    setDraftName('');
    setDraftDefault(false);
  }

  const active = activePresetId ? presets.find((p) => p.id === activePresetId) : null;

  return (
    <div className="border-t border-gray-700 pt-2">
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] text-gray-400">Preset</label>
        {presets.length > 0 && active && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDefaultPreset(active.isDefault ? null : active.id)}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                active.isDefault
                  ? 'bg-amber-900/40 border-amber-800/60 text-amber-300'
                  : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-amber-300'
              }`}
              title={active.isDefault ? 'Currently the default — click to unset' : 'Mark as default — auto-loads on dialog open'}
            >
              {active.isDefault ? '★ default' : '☆ set default'}
            </button>
            <button
              type="button"
              onClick={() => {
                removePreset(active.id);
                setActivePresetId(null);
              }}
              className="text-[10px] px-1.5 py-0.5 rounded border bg-gray-700 border-gray-600 text-gray-400 hover:bg-red-900/40 hover:border-red-800/60 hover:text-red-300 transition-colors"
              title="Delete the loaded preset"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {!saving ? (
        <div className="flex gap-1.5">
          <select
            value={activePresetId ?? ''}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) setActivePresetId(null);
              else applyPreset(id);
            }}
            className="flex-1 bg-gray-700 text-gray-200 text-xs px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          >
            <option value="">— no preset (manual settings) —</option>
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>
                {p.isDefault ? '★ ' : ''}
                {p.name}
                {p.useCount > 0 ? ` · used ${p.useCount}×` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { setSaving(true); setDraftName(''); setDraftDefault(false); }}
            className="px-2.5 py-1.5 text-[11px] rounded border bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
            title="Save the current operation + destination + options as a named preset"
          >
            Save…
          </button>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-700 rounded p-2 space-y-2">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Preset name (e.g. Working → Print copy)"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                saveCurrent();
              }
            }}
            className="w-full bg-gray-700 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          />
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={draftDefault}
                onChange={(e) => setDraftDefault(e.target.checked)}
                className="rounded"
              />
              Make this the default
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => { setSaving(false); setDraftName(''); setDraftDefault(false); }}
                className="px-2 py-1 text-[11px] rounded bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCurrent}
                disabled={!draftName.trim()}
                className="px-2 py-1 text-[11px] rounded bg-blue-600 border border-blue-500 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Save
              </button>
            </div>
          </div>
          <p className="text-[10px] text-gray-500 leading-relaxed">
            Captures operation, target layer / traverse, and all options. <strong className="text-gray-400">Not</strong> the source set — that&apos;s per-job.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Source-list right-click context menu ──────────────────
//
// Appears on right-click in the dialog's source list (either
// on a specific row or anywhere inside the container). Offers
// per-row actions when `targetFeatureId` is set, and bulk
// actions (filter to type, remove all of a type, remove all
// on a layer) regardless of the target.

function SourceListContextMenu(props: {
  x: number;
  y: number;
  targetFeatureId: string | null;
  onClose: () => void;
}) {
  const drawingStore = useDrawingStore();
  const pickedIds = useTransferStore((s) => s.pickedIds);
  const removePick = useTransferStore((s) => s.removePick);
  const removePicks = useTransferStore((s) => s.removePicks);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside click + Escape. Listeners use capture
  // phase so the dialog's focus trap doesn't eat the events.
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) props.onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        props.onClose();
      }
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [props]);

  const targetFeat = props.targetFeatureId ? drawingStore.getFeature(props.targetFeatureId) : null;
  const targetType = targetFeat?.type ?? null;
  const targetLayerId = targetFeat?.layerId ?? null;

  // Tally feature types present in the picked set so we can
  // surface a "filter to TYPE" entry per distinct type.
  const typesPresent = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of pickedIds) {
      const f = drawingStore.getFeature(id);
      if (!f) continue;
      counts[f.type] = (counts[f.type] ?? 0) + 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedIds]);

  function filterToType(keepType: string) {
    const toRemove: string[] = [];
    for (const id of pickedIds) {
      const f = drawingStore.getFeature(id);
      if (!f) continue;
      if (f.type !== keepType) toRemove.push(id);
    }
    if (toRemove.length > 0) removePicks(toRemove);
    props.onClose();
  }

  function removeAllOfType(type: string) {
    const toRemove: string[] = [];
    for (const id of pickedIds) {
      const f = drawingStore.getFeature(id);
      if (!f) continue;
      if (f.type === type) toRemove.push(id);
    }
    if (toRemove.length > 0) removePicks(toRemove);
    props.onClose();
  }

  function removeAllOnLayer(layerId: string) {
    const toRemove: string[] = [];
    for (const id of pickedIds) {
      const f = drawingStore.getFeature(id);
      if (!f) continue;
      if (f.layerId === layerId) toRemove.push(id);
    }
    if (toRemove.length > 0) removePicks(toRemove);
    props.onClose();
  }

  const layerName = targetLayerId
    ? drawingStore.document.layers[targetLayerId]?.name
    : null;

  // Position the menu so it doesn't run off the viewport edge.
  // Naive clamp: 200 px wide, ~280 px tall worst-case.
  const left = Math.min(props.x, window.innerWidth - 220);
  const top = Math.min(props.y, window.innerHeight - 300);

  const distinctTypes = Object.keys(typesPresent).sort();

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ left, top }}
      className="fixed z-[210] bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 min-w-[200px] text-xs text-gray-200 animate-[scaleIn_120ms_cubic-bezier(0.16,1,0.3,1)]"
    >
      {/* Per-row actions (only when a specific row was clicked) */}
      {props.targetFeatureId && (
        <>
          <button
            type="button"
            onClick={() => { if (props.targetFeatureId) removePick(props.targetFeatureId); props.onClose(); }}
            className="block w-full text-left px-3 py-1.5 hover:bg-gray-700 transition-colors"
          >
            Remove from selection
          </button>
          {targetType && (
            <button
              type="button"
              onClick={() => removeAllOfType(targetType)}
              className="block w-full text-left px-3 py-1.5 hover:bg-gray-700 transition-colors"
            >
              Remove all <span className="font-mono text-gray-400">{targetType}</span>s ({typesPresent[targetType] ?? 0})
            </button>
          )}
          {targetLayerId && layerName && (
            <button
              type="button"
              onClick={() => removeAllOnLayer(targetLayerId)}
              className="block w-full text-left px-3 py-1.5 hover:bg-gray-700 transition-colors"
            >
              Remove all on <span className="text-gray-400">{layerName}</span>
            </button>
          )}
          <div className="h-px bg-gray-700 my-1" />
        </>
      )}

      {/* Bulk filter actions */}
      <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500">Filter to type</div>
      {distinctTypes.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => filterToType(t)}
          className="block w-full text-left px-3 py-1.5 hover:bg-gray-700 transition-colors"
        >
          Keep only <span className="font-mono text-gray-400">{t}</span> ({typesPresent[t]})
        </button>
      ))}

      <div className="h-px bg-gray-700 my-1" />
      <button
        type="button"
        onClick={props.onClose}
        className="block w-full text-left px-3 py-1.5 hover:bg-gray-700 transition-colors text-gray-500"
      >
        Cancel <span className="text-[10px] text-gray-600">(Esc)</span>
      </button>
    </div>
  );
}

// ─── Code-remap table ─────────────────────────────────────
//
// Surfaces when the conflict pre-pass finds source codes
// outside the target layer's autoAssignCodes[]. Each row is
// "<source code> → <target code dropdown / freeform input>"
// with a per-code fuzzy auto-suggestion pre-filled when
// confidence ≥ 0.8. Surveyor can edit any cell, leave it
// empty (then Strip-codes / skip semantics apply), or pick
// a different target from the dropdown.
//
// The composed map writes through transfer-store.options.codeMap
// so the saved preset captures the surveyor's choices.

function CodeRemapTable(props: {
  conflictCodes: ReadonlySet<string>;
  targetAllowList: ReadonlyArray<string>;
}) {
  const options = useTransferStore((s) => s.options);
  const setOptions = useTransferStore((s) => s.setOptions);
  const codeMap = options.codeMap ?? {};

  // Pre-fill suggestions only for codes the surveyor hasn't
  // mapped yet, so editing one row doesn't get clobbered when
  // the pre-pass re-runs.
  useEffect(() => {
    const conflicts = Array.from(props.conflictCodes);
    const allow = props.targetAllowList;
    const next = { ...codeMap };
    let changed = false;
    for (const code of conflicts) {
      const key = code.toUpperCase();
      if (key in next) continue;
      const suggestion = suggestCodeMapping(code, allow);
      if (suggestion && suggestion.confidence >= 0.8) {
        next[key] = suggestion.target;
        changed = true;
      }
    }
    if (changed) setOptions({ codeMap: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.conflictCodes, props.targetAllowList]);

  function updateCell(sourceCode: string, target: string) {
    const next = { ...codeMap };
    const key = sourceCode.toUpperCase();
    const t = target.trim().toUpperCase();
    if (!t) {
      delete next[key];
    } else {
      next[key] = t;
    }
    setOptions({ codeMap: next });
  }

  const conflictList = Array.from(props.conflictCodes).sort();

  return (
    <div className="mt-1.5 p-2 bg-amber-950/30 border border-amber-900/60 rounded space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-amber-400">
          {conflictList.length} code{conflictList.length === 1 ? '' : 's'} not in target&apos;s allow-list — remap or strip:
        </span>
        <label className="inline-flex items-center gap-1 text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={options.stripUnknownCodes}
            onChange={(e) => setOptions({ stripUnknownCodes: e.target.checked })}
            className="rounded"
          />
          Strip unmapped
        </label>
      </div>
      <table className="w-full text-[10px] font-mono">
        <thead className="text-gray-500">
          <tr>
            <th className="text-left px-1 py-0.5 w-[40%]">Source code</th>
            <th className="text-left px-1 py-0.5">→ Target code</th>
            <th className="px-1 py-0.5 w-12"></th>
          </tr>
        </thead>
        <tbody>
          {conflictList.map((code) => {
            const key = code.toUpperCase();
            const mapped = codeMap[key] ?? '';
            const suggestion = !mapped ? suggestCodeMapping(code, props.targetAllowList) : null;
            return (
              <tr key={key} className="hover:bg-amber-950/40">
                <td className="px-1 py-0.5 text-gray-300">{code}</td>
                <td className="px-1 py-0.5">
                  <input
                    type="text"
                    list={`remap-options-${key}`}
                    value={mapped}
                    placeholder={suggestion ? `— skip (try ${suggestion.target}?) —` : '— skip —'}
                    onChange={(e) => updateCell(key, e.target.value)}
                    className="w-full bg-gray-700 text-white text-[10px] px-1 py-0.5 rounded border border-gray-600 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <datalist id={`remap-options-${key}`}>
                    {props.targetAllowList.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </td>
                <td className="px-1 py-0.5 text-right">
                  {suggestion && !mapped && (
                    <button
                      type="button"
                      onClick={() => updateCell(key, suggestion.target)}
                      title={`Auto-suggest (${suggestion.reason.toLowerCase().replace('_', ' ')}, ${Math.round(suggestion.confidence * 100)}% confidence)`}
                      className="text-blue-400 hover:text-blue-300 text-[10px] underline"
                    >
                      auto
                    </button>
                  )}
                  {mapped && (
                    <button
                      type="button"
                      onClick={() => updateCell(key, '')}
                      title="Clear mapping"
                      className="text-gray-500 hover:text-red-400 text-[10px]"
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-500 leading-snug">
        Mapped codes are rewritten before the strip step. Leave a row blank to either skip (default) or strip via the checkbox above.
      </p>
    </div>
  );
}
