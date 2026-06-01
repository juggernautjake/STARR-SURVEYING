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
import { parseTrv, type TrvMetadata } from './trv-parser';
import { trvToDrawing, type TrvMappingResult } from './trv-to-drawing';
import { drawingToTrv } from './drawing-to-trv';
import { extractTitleBlockHints, type TrvTitleBlockHints } from './trv-titleblock';

export interface TrvImportReport {
  layerCount: number;
  pointCount: number;
  traverseCount: number;
  /** Non-fatal mapping + parse notes (missing coords, dangling refs, …). */
  notes: string[];
  /** The mapping result, ready to be applied to the drawing store. */
  mapped: TrvMappingResult;
  /** cad-trv-import-export-deep-semantic Pass 6 — TRV project
   *  metadata (90 / 101-106). The import UI can offer to apply
   *  it to the drawing's title block via
   *  `applyTrvMetadataToTitleBlock`. */
  metadata: TrvMetadata;
  /** cad-trv-drawing-element-rendering Slice 4 — structured title-
   *  block fields recovered from paper-space `28,5` text (firm /
   *  surveyor / job / customer / flood note), passed as the 3rd
   *  arg to `applyTrvMetadataToTitleBlock`. */
  titleBlockHints: TrvTitleBlockHints;
}

/** Options for {@link importTrvFromText}. */
export interface ImportTrvOptions {
  /** cad-trv-dual-layer-filename Slice 1 — the source file's name
   *  (e.g. `Smith Boundary.TRV`). Its base name (directory +
   *  extension stripped) becomes the synthetic layer-name prefix so
   *  the imported layers are named after the FILE rather than a
   *  generic "TRV". */
  fileName?: string;
}

/** Parse a TRV file's text + map it into our layers + features.
 *  Returns the mapped result + a count summary the caller can show
 *  in a preview modal before committing to the store. */
export function importTrvFromText(text: string, opts: ImportTrvOptions = {}): TrvImportReport {
  const trv = parseTrv(text);
  const layerPrefix = opts.fileName ? fileBaseName(opts.fileName) : undefined;
  const mapped = trvToDrawing(trv, layerPrefix ? { layerPrefix } : {});
  // cad-trv-dual-layer-filename Slice 2 — count the CANONICAL points
  // only; the Drawing-layer mirrors are render echoes and shouldn't
  // double the count shown in the import-confirm dialog.
  // cad-trv-drawing-element-rendering Slices 2-3 — `trvDerived`
  // features (connector lines, element polylines, text) are rendered
  // from the `28` block and must not inflate the point/traverse
  // counts the confirm dialog reports.
  const points = mapped.features.filter(
    (f) => f.type === 'POINT' && !f.properties.trvPointMirror && !f.properties.trvDerived,
  ).length;
  const traverses = mapped.features.filter(
    (f) => (f.type === 'POLYLINE' || f.type === 'POLYGON') && !f.properties.trvDerived,
  ).length;
  return {
    layerCount: mapped.layers.length,
    pointCount: points,
    traverseCount: traverses,
    notes: [...trv.errors.map((e) => `Line ${e.lineIndex}: ${e.message}`), ...mapped.notes],
    mapped,
    metadata: trv.metadata,
    titleBlockHints: extractTitleBlockHints(trv.drawingElements),
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

/** cad-trv-dual-layer-filename Slice 1 — turn a file name (possibly
 *  with a path + extension) into a clean display base name used as
 *  the imported-layer prefix. `C:\jobs\Smith Boundary.TRV` →
 *  `Smith Boundary`. Falls back to `TRV Import` when empty. */
export function fileBaseName(fileName: string): string {
  const leaf = fileName.split(/[\\/]/).pop() ?? fileName;
  const noExt = leaf.replace(/\.[^.]+$/, '');
  return noExt.trim() || 'TRV Import';
}
