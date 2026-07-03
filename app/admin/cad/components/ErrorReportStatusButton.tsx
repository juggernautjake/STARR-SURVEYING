'use client';
// app/admin/cad/components/ErrorReportStatusButton.tsx
//
// Status-bar pill that surfaces the count of errors + warnings captured this
// session (every cadLog.error/warn is mirrored into useErrorReportStore) and
// opens the copyable MultiErrorModal on click. This is how a surveyor grabs a
// CAD error/warning to paste into a bug report — no console spelunking.
//
// Self-contained so its per-report re-renders don't reconcile the whole
// StatusBar. Renders nothing until at least one error/warning exists.

import { AlertTriangle } from 'lucide-react';
import { useErrorReportStore } from '@/lib/cad/store/error-report-store';

export default function ErrorReportStatusButton() {
  const count = useErrorReportStore((s) => s.entries.length);
  const errorCount = useErrorReportStore(
    (s) => s.entries.filter((e) => e.severity === 'ERROR').length,
  );
  const setOpen = useErrorReportStore((s) => s.setOpen);

  if (count === 0) return null;

  const hasErrors = errorCount > 0;

  return (
    <>
      <span className="text-gray-600">|</span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="statusbar-error-report"
        className={`shrink-0 flex items-center gap-1 transition-colors animate-[fadeIn_150ms_ease-out] ${
          hasErrors ? 'text-red-400 hover:text-red-200' : 'text-amber-300 hover:text-amber-100'
        }`}
        title={`${count} error${count === 1 ? '' : 's'} / warning${count === 1 ? '' : 's'} this session — click to review and copy`}
      >
        <AlertTriangle size={12} />
        {count} {count === 1 ? 'issue' : 'issues'}
      </button>
    </>
  );
}
