// lib/cad/io/trv-io.ts
//
// cad-trv-import-export Slice 4 — high-level import / export
// helpers used by the MenuBar (File → Import TRV…, File → Export
// as TRV…). Wraps parseTrv + trvToDrawing for import + drawingToTrv
// for export so the MenuBar handlers stay thin.
//
// `importTrvFromText` returns a report (counts + notes) so the
// caller can either display a preview-then-confirm modal or apply
// directly. `downloadTrv` triggers a Blob download with a sensible
// default filename.

import type { DrawingDocument } from '../types';
import { parseTrv } from './trv-parser';
import { trvToDrawing, type TrvMappingResult } from './trv-to-drawing';
import { drawingToTrv } from './drawing-to-trv';

export interface TrvImportReport {
  layerCount: number;
  pointCount: number;
  traverseCount: number;
  /** Non-fatal mapping + parse notes (missing coords, dangling refs, …). */
  notes: string[];
  /** The mapping result, ready to be applied to the drawing store. */
  mapped: TrvMappingResult;
}

/** Parse a TRV file's text + map it into our layers + features.
 *  Returns the mapped result + a count summary the caller can show
 *  in a preview modal before committing to the store. */
export function importTrvFromText(text: string): TrvImportReport {
  const trv = parseTrv(text);
  const mapped = trvToDrawing(trv);
  const points = mapped.features.filter((f) => f.type === 'POINT').length;
  const traverses = mapped.features.filter((f) => f.type === 'POLYLINE' || f.type === 'POLYGON').length;
  return {
    layerCount: mapped.layers.length,
    pointCount: points,
    traverseCount: traverses,
    notes: [...trv.errors.map((e) => `Line ${e.lineIndex}: ${e.message}`), ...mapped.notes],
    mapped,
  };
}

/** Serialize a DrawingDocument into TRV text and trigger a browser
 *  download. The default filename uses the doc name (slugified) or
 *  falls back to `survey.TRV`. Returns the bytes-written + filename
 *  for the caller's log. */
export function downloadTrv(doc: DrawingDocument, opts: { filename?: string } = {}): { byteSize: number; filename: string } {
  const text = drawingToTrv(doc);
  const filename = opts.filename ?? `${slug(doc.name || 'survey')}.TRV`;
  // Browser-only: triggers a download via a hidden anchor.
  if (typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof Blob !== 'undefined') {
    const blob = new Blob([text], { type: 'text/plain;charset=ISO-8859-1' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return { byteSize: text.length, filename };
}

/** Filename-safe slug: alphanumerics + dash, rest stripped. */
function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'survey';
}
