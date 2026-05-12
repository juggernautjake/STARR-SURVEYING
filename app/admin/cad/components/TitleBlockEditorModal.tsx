'use client';
// app/admin/cad/components/TitleBlockEditorModal.tsx
// Full-featured editor for all title block properties: field values, custom labels,
// per-element scale and rotation.

import { useState, useCallback, useEffect } from 'react';
import { RotateCw, ZoomIn, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import type { TitleBlockConfig } from '@/lib/cad/types';
import DialogCloseButton from './ui/DialogCloseButton';

/** Min/max scale factor for all survey-info elements. */
export const TB_ELEM_SCALE_MIN = 0.5;
export const TB_ELEM_SCALE_MAX = 2.5;

interface Props {
  /** Which element opened the editor (affects which section is expanded by default). */
  focusElement?: 'titleBlock' | 'signatureBlock' | 'northArrow';
  onClose: () => void;
}

function SectionHeader({
  title,
  open,
  onToggle,
  icon,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2 bg-gray-700/60 hover:bg-gray-700 rounded text-xs font-semibold text-gray-200 transition-colors"
    >
      <span className="flex items-center gap-1.5">
        {icon}
        {title}
      </span>
      {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
    </button>
  );
}

function FieldRow({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-0.5">
      <label className="block text-[10px] text-gray-400 font-medium uppercase tracking-wide">
        {label}
        {hint && <span className="ml-1 text-gray-600 normal-case">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-400 transition-colors';

function ScaleRotRow({
  scaleValue,
  rotationDeg,
  onScale,
  onRotation,
}: {
  scaleValue: number;
  rotationDeg: number;
  onScale: (v: number) => void;
  onRotation: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <FieldRow label="Scale" hint={`(${TB_ELEM_SCALE_MIN}–${TB_ELEM_SCALE_MAX})`}>
        <div className="flex items-center gap-1">
          <ZoomIn size={11} className="text-gray-500 shrink-0" />
          <input
            type="range"
            min={TB_ELEM_SCALE_MIN}
            max={TB_ELEM_SCALE_MAX}
            step={0.05}
            value={scaleValue}
            onChange={(e) => onScale(parseFloat(e.target.value))}
            className="flex-1 accent-blue-500"
          />
          <span className="text-[10px] text-gray-400 w-8 text-right">
            {scaleValue.toFixed(2)}×
          </span>
        </div>
      </FieldRow>
      <FieldRow label="Rotation" hint="(0–360°)">
        <div className="flex items-center gap-1">
          <RotateCw size={11} className="text-gray-500 shrink-0" />
          <input
            type="number"
            min={0}
            max={360}
            step={5}
            value={rotationDeg}
            onChange={(e) => onRotation(((parseFloat(e.target.value) || 0) % 360 + 360) % 360)}
            className={inputCls}
          />
        </div>
      </FieldRow>
    </div>
  );
}

export default function TitleBlockEditorModal({ focusElement, onClose }: Props) {
  const drawingStore = useDrawingStore();
  const tb = drawingStore.document.settings.titleBlock;

  const [showFields, setShowFields]     = useState(true);
  const [showLabels, setShowLabels]     = useState(false);
  const [showTBTransform, setShowTBTransform] = useState(focusElement === 'titleBlock');
  const [showSigTransform, setShowSigTransform] = useState(focusElement === 'signatureBlock');
  const [showNATransform, setShowNATransform]   = useState(focusElement === 'northArrow');

  function update(updates: Partial<TitleBlockConfig>) {
    drawingStore.updateTitleBlock(updates);
  }

  const fl = tb.fieldLabels ?? {};

  // Live-update helpers
  const setFL = useCallback(
    (key: keyof NonNullable<TitleBlockConfig['fieldLabels']>, val: string) => {
      update({ fieldLabels: { ...tb.fieldLabels, [key]: val } });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tb.fieldLabels],
  );

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const isInput = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
      if (e.key === 'Escape' && !isInput) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[540px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-blue-400" />
            <span className="text-sm font-semibold text-white">Title Block Editor</span>
          </div>
          <DialogCloseButton onClick={onClose} />
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* ── Survey Info Fields ─────────────────────────────── */}
          <div className="space-y-2">
            <SectionHeader
              title="Survey Information Fields"
              open={showFields}
              onToggle={() => setShowFields((v) => !v)}
            />
            {showFields && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 pl-1">
                <FieldRow label="Firm Name">
                  <input type="text" value={tb.firmName ?? ''} onChange={(e) => update({ firmName: e.target.value })} className={inputCls} placeholder="Company name…" />
                </FieldRow>
                <FieldRow label="Survey Type">
                  <input type="text" value={tb.surveyType ?? ''} onChange={(e) => update({ surveyType: e.target.value })} className={inputCls} placeholder="BOUNDARY SURVEY…" />
                </FieldRow>
                <FieldRow label={fl.project || 'Project'}>
                  <input type="text" value={tb.projectName ?? ''} onChange={(e) => update({ projectName: e.target.value })} className={inputCls} placeholder="Project name…" />
                </FieldRow>
                <FieldRow label={fl.jobNo || 'Job No.'}>
                  <input type="text" value={tb.projectNumber ?? ''} onChange={(e) => update({ projectNumber: e.target.value })} className={inputCls} placeholder="Job number…" />
                </FieldRow>
                <FieldRow label={fl.client || 'Client / Owner'}>
                  <input type="text" value={tb.clientName ?? ''} onChange={(e) => update({ clientName: e.target.value })} className={inputCls} placeholder="Client name…" />
                </FieldRow>
                <FieldRow label={fl.date || 'Date'}>
                  <input type="text" value={tb.surveyDate ?? ''} onChange={(e) => update({ surveyDate: e.target.value })} className={inputCls} placeholder="Survey date…" />
                </FieldRow>
                <FieldRow label={fl.preparedBy || 'Prepared By'}>
                  <input type="text" value={tb.surveyorName ?? ''} onChange={(e) => update({ surveyorName: e.target.value })} className={inputCls} placeholder="Surveyor name…" />
                </FieldRow>
                <FieldRow label={fl.licenseNo || 'License No.'}>
                  <input type="text" value={tb.surveyorLicense ?? ''} onChange={(e) => update({ surveyorLicense: e.target.value })} className={inputCls} placeholder="RPLS #…" />
                </FieldRow>
                <FieldRow label="Sheet #">
                  <input type="text" value={tb.sheetNumber ?? ''} onChange={(e) => update({ sheetNumber: e.target.value })} className={inputCls} placeholder="1" />
                </FieldRow>
                <FieldRow label="Total Sheets">
                  <input type="text" value={tb.totalSheets ?? ''} onChange={(e) => update({ totalSheets: e.target.value })} className={inputCls} placeholder="1" />
                </FieldRow>
                <div className="col-span-2">
                  <FieldRow label="Notes">
                    <textarea rows={2} value={tb.notes ?? ''} onChange={(e) => update({ notes: e.target.value })} className={`${inputCls} resize-none`} placeholder="Additional notes…" />
                  </FieldRow>
                </div>
              </div>
            )}
          </div>

          {/* ── Custom Field Label Names ───────────────────────── */}
          <div className="space-y-2">
            <SectionHeader
              title="Customize Field Label Names"
              open={showLabels}
              onToggle={() => setShowLabels((v) => !v)}
            />
            {showLabels && (
              <div className="pl-1 space-y-1.5">
                <p className="text-[10px] text-gray-500 mb-2">
                  Rename the header labels that appear above each data cell in the title block.
                  Leave blank to use the default.
                </p>
                {(
                  [
                    ['project',    'PROJECT',      'e.g. "SURVEY"'],
                    ['jobNo',      'JOB NO.',      'e.g. "FILE #"'],
                    ['client',     'CLIENT / OWNER','e.g. "OWNER"'],
                    ['date',       'DATE',          ''],
                    ['preparedBy', 'PREPARED BY',   'e.g. "SURVEYOR"'],
                    ['licenseNo',  'LICENSE NO.',   'e.g. "RPLS #"'],
                    ['scale',      'SCALE',         ''],
                    ['sheet',      'SHEET',         ''],
                  ] as [keyof NonNullable<TitleBlockConfig['fieldLabels']>, string, string][]
                ).map(([key, defaultLabel, hint]) => (
                  <div key={key} className="grid grid-cols-[140px_1fr] gap-2 items-center">
                    <span className="text-[10px] text-gray-500 truncate">
                      Default: <span className="text-gray-300">{defaultLabel}</span>
                    </span>
                    <input
                      type="text"
                      value={fl[key] ?? ''}
                      onChange={(e) => setFL(key, e.target.value)}
                      placeholder={hint || defaultLabel}
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Title Block Transform ──────────────────────────── */}
          <div className="space-y-2">
            <SectionHeader
              title="Title Block Scale & Rotation"
              open={showTBTransform}
              onToggle={() => setShowTBTransform((v) => !v)}
            />
            {showTBTransform && (
              <div className="pl-1 space-y-2">
                <ScaleRotRow
                  scaleValue={tb.titleBlockScale ?? 1.0}
                  rotationDeg={tb.titleBlockRotationDeg ?? 0}
                  onScale={(v) => update({ titleBlockScale: Math.max(TB_ELEM_SCALE_MIN, Math.min(TB_ELEM_SCALE_MAX, v)) })}
                  onRotation={(v) => update({ titleBlockRotationDeg: v })}
                />
              </div>
            )}
          </div>

          {/* ── Signature Block Transform ──────────────────────── */}
          <div className="space-y-2">
            <SectionHeader
              title="Signature / Seal Block Scale & Rotation"
              open={showSigTransform}
              onToggle={() => setShowSigTransform((v) => !v)}
            />
            {showSigTransform && (
              <div className="pl-1 space-y-2">
                <ScaleRotRow
                  scaleValue={tb.signatureBlockScale ?? 1.0}
                  rotationDeg={tb.signatureBlockRotationDeg ?? 0}
                  onScale={(v) => update({ signatureBlockScale: Math.max(TB_ELEM_SCALE_MIN, Math.min(TB_ELEM_SCALE_MAX, v)) })}
                  onRotation={(v) => update({ signatureBlockRotationDeg: v })}
                />
              </div>
            )}
          </div>

          {/* ── North Arrow Transform ──────────────────────────── */}
          <div className="space-y-2">
            <SectionHeader
              title="North Arrow Scale & Rotation Offset"
              open={showNATransform}
              onToggle={() => setShowNATransform((v) => !v)}
            />
            {showNATransform && (
              <div className="pl-1 space-y-2">
                <ScaleRotRow
                  scaleValue={tb.northArrowScale ?? 1.0}
                  rotationDeg={tb.northArrowRotationOffsetDeg ?? 0}
                  onScale={(v) => update({ northArrowScale: Math.max(TB_ELEM_SCALE_MIN, Math.min(TB_ELEM_SCALE_MAX, v)) })}
                  onRotation={(v) => update({ northArrowRotationOffsetDeg: v })}
                />
                <p className="text-[10px] text-gray-500">
                  Rotation offset is added on top of the drawing&apos;s overall rotation.
                </p>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
