'use client';
// app/admin/cad/components/PrintDialog.tsx — Print / export settings modal
//
// cad-survey-print-pdf Slice 9 — the dialog now drives the VECTOR writer
// (`exportToPdf` / `downloadPdf` / `printPdf`) as the primary, crisp
// deliverable: a live preview reflects every setting (sheet size +
// orientation, plot scale + mode, plot style, element toggles), a real
// Print button opens the browser print dialog for the PDF, and Export PDF
// downloads it. The legacy raster canvas-capture stays as the Export PNG
// path and as a fallback if the vector render ever throws.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useTemplateStore } from '@/lib/cad/store/template-store';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import type { PaperSize } from '@/lib/cad/templates/types';
import type { DrawingTemplate, PrintConfig } from '@/lib/cad/templates/types';
import { STANDARD_NOTES } from '@/lib/cad/templates/standard-notes';
import {
  exportToPdf,
  downloadPdf,
  printPdf,
  type PdfExportOptions,
  type PdfCertificationContent,
  type PdfNotesContent,
} from '@/lib/cad/delivery/pdf-writer';
import type { DrawingDocument } from '@/lib/cad/types';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';

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

/** Project the active template's certification config into the writer's
 *  plain-data shape (null when nothing to print). */
function buildCertification(tpl: DrawingTemplate): PdfCertificationContent | null {
  const c = tpl.certification;
  const text = c?.certificationText?.trim();
  if (!c || !text) return null;
  return {
    text,
    surveyorName: c.surveyorName,
    licenseNumber: c.licenseNumber,
    licenseState: c.licenseState,
    firmName: c.firmName || tpl.company?.name || '',
  };
}

/** Resolve the active template's selected standard notes + custom notes
 *  into the writer's plain-data shape (null when empty). */
function buildNotes(tpl: DrawingTemplate): PdfNotesContent | null {
  const sn = tpl.standardNotes;
  if (!sn) return null;
  const lines: string[] = [];
  for (const id of sn.selectedNoteIds ?? []) {
    const note = STANDARD_NOTES.find((n) => n.id === id);
    if (note) lines.push(note.text);
  }
  lines.push(...(sn.customNotes ?? []));
  if (lines.length === 0) return null;
  return { title: sn.title || 'GENERAL NOTES', lines };
}

/** Build the vector-writer doc + options from the current print config. */
function buildExport(
  baseDoc: DrawingDocument,
  cfg: PrintConfig,
  tpl: DrawingTemplate,
): { doc: DrawingDocument; options: PdfExportOptions } {
  // Override only the paper framing — the survey data is untouched.
  const doc: DrawingDocument = {
    ...baseDoc,
    settings: { ...baseDoc.settings, paperSize: cfg.paperSize, paperOrientation: cfg.orientation },
  };
  const options: PdfExportOptions = {
    scaleMode: cfg.scaleMode,
    scale: cfg.scale,
    plotStyle: cfg.plotStyle,
    showBorder: cfg.printBorder,
    showTitleBlock: cfg.printTitleBlock,
    showNorthArrow: cfg.printNorthArrow,
    showScaleBar: cfg.printScaleBar,
    showLegend: cfg.printLegend,
    certification: cfg.printCertification ? buildCertification(tpl) : null,
    notes: cfg.printNotes ? buildNotes(tpl) : null,
  };
  return { doc, options };
}

export default function PrintDialog({ onClose }: Props) {
  const store = useTemplateStore();
  const cfg = store.printConfig;
  const tpl = store.activeTemplate;

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  function update(patch: Partial<typeof cfg>) {
    store.updatePrintConfig(patch);
  }

  // A stable signature of every setting that affects the rendered PDF,
  // so the preview only regenerates when something visible changes.
  const sig = useMemo(
    () =>
      JSON.stringify([
        cfg.paperSize, cfg.orientation, cfg.scale, cfg.scaleMode, cfg.plotStyle,
        cfg.printBorder, cfg.printTitleBlock, cfg.printNorthArrow, cfg.printScaleBar,
        cfg.printLegend, cfg.printCertification, cfg.printNotes,
      ]),
    [cfg.paperSize, cfg.orientation, cfg.scale, cfg.scaleMode, cfg.plotStyle,
      cfg.printBorder, cfg.printTitleBlock, cfg.printNorthArrow, cfg.printScaleBar,
      cfg.printLegend, cfg.printCertification, cfg.printNotes],
  );

  // Regenerate the live preview (debounced) whenever a setting changes.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        const baseDoc = useDrawingStore.getState().document;
        const { doc, options } = buildExport(baseDoc, cfg, tpl);
        const { blob } = exportToPdf(doc, options);
        const url = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setPreviewError(null);
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : 'Preview unavailable');
      }
    }, 350);
    return () => window.clearTimeout(handle);
    // `cfg`/`tpl` are read fresh inside; `sig` is the change trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // Revoke the last preview blob URL on unmount.
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  /** Fire the legacy raster canvas-capture (Export PNG + vector fallback). */
  const rasterExport = useCallback((format: 'pdf' | 'png') => {
    window.dispatchEvent(new CustomEvent('cad:exportImage', {
      detail: {
        format, paperSize: cfg.paperSize, orientation: cfg.orientation,
        plotStyle: cfg.plotStyle, centerOnPage: cfg.centerOnPage,
        elements: {
          titleBlock: cfg.printTitleBlock, northArrow: cfg.printNorthArrow,
          scaleBar: cfg.printScaleBar, border: cfg.printBorder, legend: cfg.printLegend,
          certification: cfg.printCertification, notes: cfg.printNotes,
        },
      },
    }));
  }, [cfg]);

  /** Run a vector-writer action, falling back to the raster capture if it
   *  throws (e.g. an unsupported geometry). */
  const vectorAction = useCallback((run: (doc: DrawingDocument, opts: PdfExportOptions) => void) => {
    try {
      const baseDoc = useDrawingStore.getState().document;
      const { doc, options } = buildExport(baseDoc, cfg, tpl);
      run(doc, options);
    } catch {
      rasterExport('pdf');
    }
  }, [cfg, tpl, rasterExport]);

  const labelClass = 'block text-xs text-gray-300 mb-0.5';
  const inputClass =
    'w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500';
  const radioClass = 'flex items-center gap-2 cursor-pointer';
  const checkClass = 'flex items-center gap-2 cursor-pointer';

  return (
    <ModalFrame
      open
      onClose={onClose}
      title="Print / Export"
      initialWidth={880}
      initialHeight={620}
      minWidth={560}
      minHeight={380}
      scrollBody={false}
    >
      <div className="text-white flex flex-col h-full">
        <div className="flex flex-1 min-h-0">
          {/* ── Settings column ───────────────────────────── */}
          <div className="w-[360px] shrink-0 p-4 space-y-4 overflow-y-auto border-r border-gray-700">
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
                  disabled={cfg.scaleMode !== 'FIXED'}
                />
              </div>
              <div>
                <label className={labelClass}>Scale Mode</label>
                <div className="flex flex-col gap-1 mt-1">
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
                      <span className="text-xs text-gray-200">{m === 'FIXED' ? 'Fixed' : 'Fit to Page (round)'}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

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

          {/* ── Live preview column ───────────────────────── */}
          <div className="flex-1 min-w-0 p-4 flex flex-col">
            <label className={labelClass}>Preview</label>
            <div className="flex-1 min-h-0 rounded border border-gray-600 bg-gray-200 overflow-hidden">
              {previewError ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-600 px-4 text-center">
                  Preview unavailable ({previewError}). Export still works via the
                  raster fallback.
                </div>
              ) : previewUrl ? (
                <iframe
                  title="PDF preview"
                  src={previewUrl}
                  className="w-full h-full"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-gray-600">
                  Rendering preview…
                </div>
              )}
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
            onClick={() => { vectorAction((doc, opts) => printPdf(doc, opts)); }}
            className="px-4 py-1.5 text-xs rounded bg-gray-600 hover:bg-gray-500 text-white transition-colors"
          >
            Print…
          </button>
          <button
            onClick={() => { rasterExport('png'); onClose(); }}
            className="px-4 py-1.5 text-xs rounded bg-green-700 hover:bg-green-600 text-white transition-colors"
          >
            Export PNG
          </button>
          <button
            onClick={() => { vectorAction((doc, opts) => downloadPdf(doc, opts)); onClose(); }}
            className="px-4 py-1.5 text-xs rounded bg-blue-700 hover:bg-blue-600 text-white transition-colors"
          >
            Export PDF
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
