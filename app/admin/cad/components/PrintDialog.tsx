'use client';
// app/admin/cad/components/PrintDialog.tsx — Print / export settings modal

import { useRef } from 'react';
import { useTemplateStore } from '@/lib/cad/store/template-store';
import type { PaperSize } from '@/lib/cad/templates/types';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface Props {
  onClose: () => void;
}

const PAPER_SIZES: PaperSize[] = ['LETTER', 'TABLOID', 'ARCH_C', 'ARCH_D', 'ARCH_E'];
const PAPER_SIZE_LABELS: Record<PaperSize, string> = {
  LETTER:  'Letter (8.5 × 11)',
  TABLOID: 'Tabloid (11 × 17)',
  ARCH_C:  'Arch C (18 × 24)',
  ARCH_D:  'Arch D (24 × 36)',
  ARCH_E:  'Arch E (36 × 48)',
};

export default function PrintDialog({ onClose }: Props) {
  useEscapeToClose(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  const store = useTemplateStore();
  const cfg = store.printConfig;

  function update(patch: Partial<typeof cfg>) {
    store.updatePrintConfig(patch);
  }

  const labelClass = 'block text-xs text-gray-300 mb-0.5';
  const inputClass =
    'w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500';
  const radioClass = 'flex items-center gap-2 cursor-pointer';
  const checkClass = 'flex items-center gap-2 cursor-pointer';

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Print Settings"
    >
      <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="font-semibold text-sm">Print / Export</span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-lg leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Paper size */}
          <div>
            <label className={labelClass}>Paper Size</label>
            <select
              value={cfg.paperSize}
              onChange={(e) => update({ paperSize: e.target.value as PaperSize })}
              className={inputClass}
            >
              {PAPER_SIZES.map((s) => (
                <option key={s} value={s}>{PAPER_SIZE_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Orientation */}
          <div>
            <label className={labelClass}>Orientation</label>
            <div className="flex gap-4">
              {(['PORTRAIT', 'LANDSCAPE'] as const).map((o) => (
                <label key={o} className={radioClass}>
                  <input
                    type="radio"
                    name="orientation"
                    value={o}
                    checked={cfg.orientation === o}
                    onChange={() => update({ orientation: o })}
                    className="accent-blue-500"
                  />
                  <span className="text-xs text-gray-200">{o === 'PORTRAIT' ? 'Portrait' : 'Landscape'}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Scale */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Scale (1&quot; = __ ft)</label>
              <input
                type="number"
                min={1}
                value={cfg.scale}
                onChange={(e) => update({ scale: parseFloat(e.target.value) || 50 })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Scale Mode</label>
              <div className="flex gap-4 mt-1">
                {(['FIXED', 'FIT_TO_PAGE'] as const).map((m) => (
                  <label key={m} className={radioClass}>
                    <input
                      type="radio"
                      name="scaleMode"
                      value={m}
                      checked={cfg.scaleMode === m}
                      onChange={() => update({ scaleMode: m })}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-gray-200">{m === 'FIXED' ? 'Fixed' : 'Fit to Page'}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Print area */}
          <div>
            <label className={labelClass}>Print Area</label>
            <div className="flex gap-4">
              {(['EXTENTS', 'DISPLAY'] as const).map((a) => (
                <label key={a} className={radioClass}>
                  <input
                    type="radio"
                    name="printArea"
                    value={a}
                    checked={cfg.printArea === a}
                    onChange={() => update({ printArea: a })}
                    className="accent-blue-500"
                  />
                  <span className="text-xs text-gray-200">{a === 'EXTENTS' ? 'Extents' : 'Display'}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Center on page */}
          <label className={checkClass}>
            <input
              type="checkbox"
              checked={cfg.centerOnPage}
              onChange={(e) => update({ centerOnPage: e.target.checked })}
              className="accent-blue-500"
            />
            <span className="text-xs text-gray-200">Center on Page</span>
          </label>

          {/* Plot style */}
          <div>
            <label className={labelClass}>Plot Style</label>
            <select
              value={cfg.plotStyle}
              onChange={(e) =>
                update({ plotStyle: e.target.value as typeof cfg.plotStyle })
              }
              className={inputClass}
            >
              <option value="AS_DISPLAYED">As Displayed</option>
              <option value="MONOCHROME">Monochrome</option>
              <option value="GRAYSCALE">Grayscale</option>
            </select>
          </div>

          {/* Print elements */}
          <div>
            <label className={`${labelClass} mb-2`}>Print Elements</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ['printBorder',        'Border'],
                  ['printTitleBlock',    'Title Block'],
                  ['printNorthArrow',    'North Arrow'],
                  ['printScaleBar',      'Scale Bar'],
                  ['printLegend',        'Legend'],
                  ['printCertification', 'Certification'],
                  ['printNotes',         'Notes'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className={checkClass}>
                  <input
                    type="checkbox"
                    checked={cfg[key]}
                    onChange={(e) => update({ [key]: e.target.checked })}
                    className="accent-blue-500"
                  />
                  <span className="text-xs text-gray-200">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => window.alert('PDF export coming soon')}
            className="px-4 py-1.5 text-xs rounded bg-blue-700 hover:bg-blue-600 transition-colors"
          >
            Export PDF
          </button>
          <button
            onClick={() => window.alert('PNG export coming soon')}
            className="px-4 py-1.5 text-xs rounded bg-green-700 hover:bg-green-600 transition-colors"
          >
            Export PNG
          </button>
        </div>
      </div>
    </div>
  );
}
