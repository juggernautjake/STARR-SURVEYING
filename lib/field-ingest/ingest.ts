// lib/field-ingest/ingest.ts — one arrival, whatever brought it (audit §3d, items 8n–8o).
//
// A watched folder, a Trimble Connect poll and a drag-and-drop all end here. One path, because three
// paths is three places to get the two clocks wrong, and the clocks are the whole design.
//
// ── STORE-AND-FORWARD MEANS RETRIES, WHICH MEANS IDEMPOTENCY IS NOT OPTIONAL ────────────────────
//
// §3d: points arrive *"late, in bursts, and out of order, hours after they were shot."* A poller
// re-reads its window after a failure; a watched folder re-sees a file whose mtime moved; a crew
// re-uploads because they were not sure the first one worked. Every one of those is normal, and
// without a dedupe key each doubles a day's points — which is not obviously wrong on screen, it is
// two markers in the same place.
//
// So the content hash is the batch's identity. Same bytes from the same source = the same batch,
// already imported, return it and do nothing.

import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { detectSurveyFormat, type SurveyFormat } from '@/lib/cad/import/format-detect';
import { parseLandXml } from '@/lib/cad/import/landxml-parser';
import { parseGsi } from '@/lib/cad/import/gsi-parser';
import { parseRW5Document } from '@/lib/cad/import/rw5-parser';
import { parseJobXMLDocument } from '@/lib/cad/import/jobxml-parser';
import { parseCSV } from '@/lib/cad/import/csv-parser';
import { DEFAULT_CSV_CONFIG } from '@/lib/cad/import/types';

export interface IncomingPoint {
  pointName: string;
  code: string;
  description: string;
  northing: number;
  easting: number;
  elevation: number | null;
  /** When it was SHOT, if the format said. Never filled in from the clock — see the seed's comment. */
  measuredAt: string | null;
  sourceRef: string;
}

export interface ParsedArrival {
  format: SurveyFormat;
  unit: string;
  points: IncomingPoint[];
  warnings: string[];
  skipped: number;
}

/** Read a file into points, whichever format it is. Throws only when nothing can read it. */
export function parseArrival(text: string, filename?: string): ParsedArrival {
  const detection = detectSurveyFormat(text, filename);

  switch (detection.format) {
    case 'landxml': {
      const doc = parseLandXml(text);
      const usable = doc.points.filter((p) => !p.refersTo);
      return {
        format: 'landxml',
        unit: doc.units.linear,
        warnings: doc.warnings,
        skipped: doc.points.length - usable.length,
        points: usable.map((p) => ({
          pointName: p.name,
          code: p.code,
          description: p.description,
          northing: p.northing,
          easting: p.easting,
          elevation: p.elevation,
          // LandXML has no per-point timestamp. Null, not now() — a point stamped with its upload
          // time reads as having been shot from the office car park.
          measuredAt: null,
          sourceRef: `CgPoint ${p.name}`,
        })),
      };
    }

    case 'gsi': {
      const doc = parseGsi(text);
      return {
        format: 'gsi',
        // The GSI reader normalises to metres per block, so the stored unit is metres regardless of
        // what the instrument wrote. Recorded honestly rather than echoing the file's own unit.
        unit: 'meter',
        warnings: doc.warnings,
        skipped: 0,
        points: doc.points.map((p) => ({
          pointName: p.pointName,
          code: p.code,
          description: p.description,
          northing: p.northing,
          easting: p.easting,
          elevation: p.elevation,
          measuredAt: null,
          sourceRef: `GSI ${p.pointName}`,
        })),
      };
    }

    case 'rw5': {
      const doc = parseRW5Document(text);
      const rows = doc.rows.filter((r) => r.data);
      return {
        format: 'rw5',
        unit: doc.unit,
        warnings: doc.warnings,
        skipped: doc.rows.length - rows.length,
        points: rows.map((r) => ({
          pointName: r.data!.pointName,
          code: r.data!.rawCode,
          description: r.data!.description,
          northing: r.data!.northing,
          easting: r.data!.easting,
          elevation: r.data!.elevation,
          measuredAt: null,
          sourceRef: `line ${r.lineNumber}`,
        })),
      };
    }

    case 'jobxml': {
      const doc = parseJobXMLDocument(text);
      return {
        format: 'jobxml',
        unit: 'unknown',
        warnings: doc.warnings,
        skipped: 0,
        points: doc.points.map((p) => ({
          pointName: p.name,
          code: p.code,
          description: p.description,
          northing: p.northing,
          easting: p.easting,
          elevation: p.elevation,
          measuredAt: null,
          sourceRef: `Point ${p.name}`,
        })),
      };
    }

    case 'csv': {
      const rows = parseCSV(text, DEFAULT_CSV_CONFIG);
      const good = rows.filter((r) => r.data);
      return {
        format: 'csv',
        unit: 'unknown',
        // A CSV read with the DEFAULT mapping is a guess about column order, and the guess is
        // invisible once the points are in. Said out loud rather than assumed correct.
        warnings: ['Imported with the default PNEZD column mapping. Confirm the columns are point, northing, easting, elevation, description — a PENZD file read this way swaps northing and easting.'],
        skipped: rows.length - good.length,
        points: good.map((r) => ({
          pointName: r.data!.pointName,
          code: r.data!.rawCode,
          description: r.data!.description,
          northing: r.data!.northing,
          easting: r.data!.easting,
          elevation: r.data!.elevation,
          measuredAt: null,
          sourceRef: `line ${r.lineNumber}`,
        })),
      };
    }

    default:
      throw new Error(detection.reason);
  }
}

export function hashContent(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export interface IngestResult {
  batchId: string;
  /** True when this exact content was already imported from this source. */
  alreadyImported: boolean;
  imported: number;
  skipped: number;
  format: SurveyFormat;
  warnings: string[];
}

export interface IngestOptions {
  sourceId: string | null;
  jobId?: string | null;
  fileName?: string;
  createdBy?: string;
}

/** Take one arrival all the way in. Safe to call twice with the same bytes. */
export async function ingestArrival(text: string, opts: IngestOptions): Promise<IngestResult> {
  const fileHash = hashContent(text);

  // Already seen? The unique index on (source_id, file_hash) is the real guarantee; this read is the
  // fast path that avoids parsing a megabyte of XML to discover we have it.
  if (opts.sourceId) {
    const { data: existing } = await supabaseAdmin
      .from('ingest_batches')
      .select('id, point_count, skipped_count, format, warnings')
      .eq('source_id', opts.sourceId)
      .eq('file_hash', fileHash)
      .maybeSingle();
    if (existing) {
      const row = existing as { id: string; point_count: number; skipped_count: number; format: string; warnings: string[] | null };
      return {
        batchId: row.id,
        alreadyImported: true,
        imported: row.point_count,
        skipped: row.skipped_count,
        format: row.format as SurveyFormat,
        warnings: row.warnings ?? [],
      };
    }
  }

  let parsed: ParsedArrival;
  try {
    parsed = parseArrival(text, opts.fileName);
  } catch (err) {
    // A failed arrival is RECORDED, not just thrown. A watched folder that has been rejecting the
    // crew's export for a week produces no error anywhere unless the failure is written down — which
    // is the exact invisibility store-and-forward creates.
    const message = err instanceof Error ? err.message : String(err);
    await supabaseAdmin.from('ingest_batches').insert({
      source_id: opts.sourceId,
      job_id: opts.jobId ?? null,
      file_name: opts.fileName ?? null,
      file_hash: fileHash,
      status: 'failed',
      error: message,
      created_by: opts.createdBy ?? null,
    });
    throw err;
  }

  const { data: batch, error: batchErr } = await supabaseAdmin
    .from('ingest_batches')
    .insert({
      source_id: opts.sourceId,
      job_id: opts.jobId ?? null,
      file_name: opts.fileName ?? null,
      file_hash: fileHash,
      format: parsed.format,
      point_count: parsed.points.length,
      skipped_count: parsed.skipped,
      status: parsed.skipped > 0 ? 'partial' : 'ok',
      warnings: parsed.warnings,
      created_by: opts.createdBy ?? null,
    })
    .select('id')
    .single();

  if (batchErr || !batch) {
    throw new Error(`Could not record the arrival: ${batchErr?.message ?? 'unknown error'}`);
  }
  const batchId = (batch as { id: string }).id;

  if (parsed.points.length > 0) {
    // Chunked: a day of topo is thousands of points and one statement per point is a minute of
    // round-trips, while one statement with thousands of rows exceeds the request limit.
    const CHUNK = 500;
    for (let i = 0; i < parsed.points.length; i += CHUNK) {
      const rows = parsed.points.slice(i, i + CHUNK).map((p) => ({
        batch_id: batchId,
        job_id: opts.jobId ?? null,
        point_name: p.pointName,
        code: p.code || null,
        description: p.description || null,
        northing: p.northing,
        easting: p.easting,
        elevation: p.elevation,
        unit: parsed.unit,
        measured_at: p.measuredAt,
        source_ref: p.sourceRef,
      }));
      // `received_at` is deliberately absent: the column defaults, so no code path can accidentally
      // supply a client's clock for it.
      const { error } = await supabaseAdmin.from('instrument_points').upsert(rows, { onConflict: 'batch_id,point_name', ignoreDuplicates: true });
      if (error) throw new Error(`Points ${i + 1}–${i + rows.length} failed to save: ${error.message}`);
    }
  }

  return {
    batchId,
    alreadyImported: false,
    imported: parsed.points.length,
    skipped: parsed.skipped,
    format: parsed.format,
    warnings: parsed.warnings,
  };
}
