// lib/cad/io/file-detect.ts
//
// cad-trv-import-export-deep-semantic Pass 8 — sniff a chosen file
// to figure out which loader to route it through, and build a
// structured diagnostic when something goes wrong. Replaces the
// bare `alert(msg)` calls in MenuBar with a multi-line report
// the surveyor can copy-paste into a support ticket.

/** The file formats Open… recognizes. */
export type DetectedFileFormat = 'STARR' | 'TRV' | 'UNKNOWN';

/** Detect the file format by extension + first-line content sniff.
 *  Both signals are checked; either one can route. Filename is the
 *  primary hint (matches what the file picker accepts); the
 *  first-line sniff is a backstop for files named something
 *  unexpected (e.g. `survey.txt`). */
export function detectFileFormat(filename: string, text: string): DetectedFileFormat {
  const lower = filename.toLowerCase();
  // Extension hints first.
  if (lower.endsWith('.starr')) return 'STARR';
  if (lower.endsWith('.trv')) return 'TRV';
  // Content sniff: TRV files start with `#,TRAVERSE PC` or
  // `999,begin` (in some exports). STARR files are JSON.
  const head = text.slice(0, 256);
  if (head.startsWith('#,TRAVERSE PC') || /^\s*999,begin\b/m.test(head)) return 'TRV';
  if (/^\s*\{/.test(head)) return 'STARR';
  return 'UNKNOWN';
}

/** Structured diagnostic for a failed file load. The MenuBar
 *  renders this as a multi-line copy-pasteable report. */
export interface FileLoadDiagnostic {
  /** Short headline ("Failed to load file"). */
  headline: string;
  /** Filename + size in bytes. */
  filename: string;
  byteSize: number;
  /** What the sniffer thought the format was. */
  detectedFormat: DetectedFileFormat;
  /** Top-level error message (what `err.message` reported). */
  errorMessage: string;
  /** Stage where the failure occurred (sniff / parse / map / apply). */
  stage: 'sniff' | 'parse' | 'map' | 'apply' | 'unknown';
  /** First 200 characters of the file content. */
  preview: string;
  /** Per-line parser errors when available (TRV path). */
  parseErrors: Array<{ lineIndex: number; message: string }>;
  /** Suggested next-step action ("Save the file as .starr and
   *  retry", etc.). */
  hint: string;
}

/** Pretty-print a FileLoadDiagnostic for the alert / modal. */
export function formatFileLoadDiagnostic(d: FileLoadDiagnostic): string {
  const lines: string[] = [];
  lines.push(d.headline);
  lines.push('');
  lines.push(`File: ${d.filename} (${d.byteSize.toLocaleString()} bytes)`);
  lines.push(`Detected format: ${d.detectedFormat}`);
  lines.push(`Stage: ${d.stage}`);
  lines.push('');
  lines.push(`Error: ${d.errorMessage}`);
  if (d.parseErrors.length > 0) {
    lines.push('');
    lines.push(`Parser errors (showing first 5 of ${d.parseErrors.length}):`);
    for (const e of d.parseErrors.slice(0, 5)) {
      lines.push(`  Line ${e.lineIndex + 1}: ${e.message}`);
    }
  }
  lines.push('');
  lines.push('First 200 chars of file:');
  lines.push(d.preview);
  if (d.hint) {
    lines.push('');
    lines.push(`Hint: ${d.hint}`);
  }
  return lines.join('\n');
}

/** Build a diagnostic from an error + the file context. The MenuBar
 *  calls this from its catch block; the function picks a sensible
 *  hint based on the format + error message. */
export function buildFileLoadDiagnostic(
  filename: string,
  text: string,
  err: unknown,
  stage: FileLoadDiagnostic['stage'],
  parseErrors: Array<{ lineIndex: number; message: string }> = [],
): FileLoadDiagnostic {
  const detectedFormat = detectFileFormat(filename, text);
  const errorMessage = err instanceof Error ? err.message : String(err);
  return {
    headline: 'Failed to load file',
    filename,
    byteSize: text.length,
    detectedFormat,
    errorMessage,
    stage,
    preview: text.slice(0, 200).replace(/\r/g, ' '),
    parseErrors,
    hint: hintFor(detectedFormat, errorMessage),
  };
}

/** Pick a hint message based on format + error pattern. */
function hintFor(format: DetectedFileFormat, msg: string): string {
  if (format === 'TRV' && /JSON|Unexpected token/i.test(msg)) {
    return 'This is a Traverse PC `.TRV` file — use File → Import → "Import Traverse PC (.TRV)…" instead of File → Open.';
  }
  if (format === 'UNKNOWN' && /JSON|Unexpected token/i.test(msg)) {
    return 'The file doesn\'t look like a Starr drawing (.starr) or a Traverse PC export (.TRV). Check that you selected the right file.';
  }
  if (format === 'STARR' && /version|schema|migrate/i.test(msg)) {
    return 'The .starr file may be from an incompatible schema version. Check that it was saved by a recent build of Starr CAD.';
  }
  return '';
}
