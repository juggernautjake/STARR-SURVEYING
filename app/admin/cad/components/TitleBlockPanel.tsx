'use client';
// app/admin/cad/components/TitleBlockPanel.tsx
// Panel for configuring the survey title block (north arrow + info box + signature line + scale bar).

import { useState } from 'react';
import { X, ChevronDown, ChevronUp, Eye, EyeOff, Compass, FileText, PenLine, Ruler } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import type { NorthArrowStyle, InfoBoxStyle } from '@/lib/cad/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const NORTH_ARROW_STYLES: { value: NorthArrowStyle; label: string; desc: string }[] = [
  { value: 'STARR',        label: 'STARR ★',      desc: '8-pointed star compass (STARR style)' },
  { value: 'SIMPLE',       label: 'Simple',        desc: 'Single needle arrow with N label' },
  { value: 'DETAILED',     label: 'Detailed',      desc: 'Double-headed arrow with styled N' },
  { value: 'TRADITIONAL',  label: 'Traditional',   desc: 'Classic surveying north arrow' },
  { value: 'COMPASS_ROSE', label: 'Compass Rose',  desc: 'Full N/S/E/W rose graphic' },
];

const INFO_BOX_STYLES: { value: InfoBoxStyle; label: string; desc: string }[] = [
  { value: 'STANDARD', label: 'Standard', desc: 'Professional survey info block (default)' },
  { value: 'DETAILED', label: 'Detailed',  desc: 'Expanded block with extra metadata rows' },
  { value: 'MINIMAL',  label: 'Minimal',  desc: 'Compact single-column layout' },
];

function SectionHeader({
  icon,
  title,
  open,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2 bg-gray-700/60 hover:bg-gray-700 rounded text-xs font-medium text-gray-200 transition-colors"
    >
      <span className="flex items-center gap-2">
        {icon}
        {title}
      </span>
      {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
    </button>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 items-center">
      <label className="text-xs text-gray-400 truncate">{label}</label>
      {children}
    </div>
  );
}

export default function TitleBlockPanel({ open, onClose }: Props) {
  const drawingStore = useDrawingStore();
  const tb = drawingStore.document.settings.titleBlock;
  const [showNorthArrow, setShowNorthArrow] = useState(true);
  const [showScaleBarSection, setShowScaleBarSection]   = useState(true);
  const [showMetaFields, setShowMetaFields] = useState(true);

  if (!open) return null;

  function update(updates: Parameters<typeof drawingStore.updateTitleBlock>[0]) {
    drawingStore.updateTitleBlock(updates);
  }

  const inputCls =
    'w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-400';

  return (
    <div className="absolute top-0 right-0 h-full w-72 bg-gray-800 border-l border-gray-600 flex flex-col z-20 shadow-2xl animate-[slideInRight_200ms_cubic-bezier(0.16,1,0.3,1)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-600 shrink-0">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-blue-400" />
          <span className="text-sm font-semibold text-white">Title Block</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => update({ visible: !tb.visible })}
            className={`p-1 rounded transition-colors ${tb.visible ? 'text-blue-400 hover:text-blue-300' : 'text-gray-500 hover:text-gray-400'}`}
            title={tb.visible ? 'Hide title block' : 'Show title block'}
          >
            {tb.visible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        {/* North Arrow */}
        <div className="space-y-2">
          <SectionHeader
            icon={<Compass size={13} className="text-blue-400" />}
            title="North Arrow"
            open={showNorthArrow}
            onToggle={() => setShowNorthArrow((v) => !v)}
          />
          {showNorthArrow && (
            <div className="pl-1 space-y-2">
              <FieldRow label="Style">
                <select
                  value={tb.northArrowStyle}
                  onChange={(e) => update({ northArrowStyle: e.target.value as NorthArrowStyle })}
                  className={inputCls}
                >
                  {NORTH_ARROW_STYLES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </FieldRow>
              <FieldRow label="Size (inches)">
                <input
                  type="number"
                  min={0.5}
                  max={4}
                  step={0.25}
                  value={tb.northArrowSizeIn}
                  onChange={(e) => update({ northArrowSizeIn: parseFloat(e.target.value) || 1.5 })}
                  className={inputCls}
                />
              </FieldRow>
              <p className="text-xs text-gray-500 leading-relaxed">
                The north arrow is placed in the top-right of the page. Hover &amp; drag to reposition it.
              </p>
            </div>
          )}
        </div>

        {/* Graphic Scale Bar */}
        <div className="space-y-2">
          <SectionHeader
            icon={<Ruler size={13} className="text-blue-400" />}
            title="Graphic Scale Bar"
            open={showScaleBarSection}
            onToggle={() => setShowScaleBarSection((v) => !v)}
          />
          {showScaleBarSection && (
            <div className="pl-1 space-y-2">
              <FieldRow label="Show bar">
                <button
                  onClick={() => update({ scaleBarVisible: !(tb.scaleBarVisible ?? true) })}
                  className={`w-full text-left px-2 py-1 rounded text-xs border transition-colors ${
                    (tb.scaleBarVisible ?? true)
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                      : 'bg-gray-700 border-gray-600 text-gray-400'
                  }`}
                >
                  {(tb.scaleBarVisible ?? true) ? 'Visible' : 'Hidden'}
                </button>
              </FieldRow>
              <FieldRow label="Length (inches)">
                <input
                  type="number"
                  min={0.5}
                  max={6}
                  step={0.25}
                  value={tb.scaleBarLengthIn ?? 2.0}
                  onChange={(e) => update({ scaleBarLengthIn: parseFloat(e.target.value) || 2.0 })}
                  className={inputCls}
                />
              </FieldRow>
              <p className="text-xs text-gray-500 leading-relaxed">
                The checkered scale bar updates automatically when the drawing scale changes. Hover &amp; drag to reposition.
              </p>
            </div>
          )}
        </div>

        {/* Survey Metadata */}
        <div className="space-y-2">
          <SectionHeader
            icon={<PenLine size={13} className="text-blue-400" />}
            title="Survey Metadata"
            open={showMetaFields}
            onToggle={() => setShowMetaFields((v) => !v)}
          />
          {showMetaFields && (
            <div className="pl-1 space-y-2">
              {(
                [
                  ['firmName',         'Firm Name'],
                  ['surveyType',       'Survey Type'],
                  ['surveyorName',     'Surveyor'],
                  ['surveyorLicense',  'License #'],
                  ['projectName',      'Project'],
                  ['projectNumber',    'Job #'],
                  ['clientName',       'Client'],
                  ['surveyDate',       'Date'],
                  ['scaleLabel',       'Scale (label)'],
                  ['sheetNumber',      'Sheet #'],
                  ['totalSheets',      'Total Sheets'],
                ] as [keyof typeof tb, string][]
              ).map(([key, label]) => (
                <FieldRow key={key} label={label}>
                  <input
                    type="text"
                    value={(tb[key] as string) ?? ''}
                    onChange={(e) => update({ [key]: e.target.value })}
                    className={inputCls}
                    placeholder={`Enter ${label.toLowerCase()}…`}
                  />
                </FieldRow>
              ))}
              <FieldRow label="Notes">
                <textarea
                  rows={2}
                  value={tb.notes ?? ''}
                  onChange={(e) => update({ notes: e.target.value })}
                  className={`${inputCls} resize-none`}
                  placeholder="Additional notes…"
                />
              </FieldRow>
            </div>
          )}
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-gray-700 shrink-0">
        <p className="text-xs text-gray-500 leading-relaxed">
          Hover over any title block element to highlight it, then drag to reposition. Title block and signature block are at the bottom of the page.
        </p>
      </div>
    </div>
  );
}

