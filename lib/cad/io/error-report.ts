// lib/cad/io/error-report.ts
//
// cad-multi-error-report-modal Slice 1 — bridge helpers from the
// existing FileLoadDiagnostic shape into the global
// useErrorReportStore. Keeping these in a tiny module rather than
// inside the store keeps the store free of file-detect imports
// (and avoids React-side state from leaking into pure modules).

import { useErrorReportStore } from '../store/error-report-store';
import { formatFileLoadDiagnostic, type FileLoadDiagnostic } from './file-detect';

/** Push a FileLoadDiagnostic into the error-report store as a
 *  single ERROR entry. Returns the entry id. */
export function reportFileLoadError(diag: FileLoadDiagnostic): string {
  const body = formatFileLoadDiagnostic(diag);
  return useErrorReportStore.getState().report({
    title: `Failed to load ${diag.filename} (${diag.detectedFormat}, stage: ${diag.stage})`,
    body,
    severity: 'ERROR',
    hint: diag.hint || undefined,
  });
}

/** Push a free-form error / bug entry into the report store. */
export function reportError(input: {
  title: string;
  body: string;
  severity?: 'ERROR' | 'WARNING' | 'INFO';
  hint?: string;
}): string {
  return useErrorReportStore.getState().report({
    title: input.title,
    body: input.body,
    severity: input.severity ?? 'ERROR',
    hint: input.hint,
  });
}
