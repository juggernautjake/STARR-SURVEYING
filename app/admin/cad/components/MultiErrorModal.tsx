'use client';
// app/admin/cad/components/MultiErrorModal.tsx
//
// cad-multi-error-report-modal Slice 1 — multi-entry modal that
// surfaces every entry pushed into useErrorReportStore in the
// session, with:
//   - "Copy all" + per-entry Copy buttons (clipboard API +
//     execCommand fallback)
//   - severity icons + colors
//   - collapsible rows so a long error list stays scannable
//   - readOnly <textarea> per entry so highlight-copy also works
//   - per-entry dismiss + "Clear all"
//
// Mount once at the app root (CADLayout); any store.report(...)
// flips open=true and the modal surfaces.

import { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, Copy, X, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useErrorReportStore, formatEntries, type ErrorReportEntry } from '@/lib/cad/store/error-report-store';

export default function MultiErrorModal() {
  const open = useErrorReportStore((s) => s.open);
  const entries = useErrorReportStore((s) => s.entries);
  const setOpen = useErrorReportStore((s) => s.setOpen);
  const clear = useErrorReportStore((s) => s.clear);
  const [allCopied, setAllCopied] = useState(false);
  if (!open) return null;

  const onCopyAll = async () => {
    await copyText(formatEntries(entries));
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/75"
      onClick={() => setOpen(false)}
      data-testid="multi-error-modal"
    >
      <div
        className="bg-gray-900 border border-red-500/70 rounded-lg p-5 max-w-[800px] w-[95%] max-h-[90vh] flex flex-col gap-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h2 className="text-red-400 text-base font-semibold">
              Errors &amp; Warnings ({entries.length})
            </h2>
            <p className="text-gray-400 text-xs mt-0.5">
              Every error and warning reported in this session. Click a row to expand the full text, or use Copy to grab everything.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-gray-500 hover:text-white text-xl leading-none px-1"
            aria-label="Close"
          >×</button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCopyAll}
            disabled={entries.length === 0}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white"
            data-testid="multi-error-copy-all"
          >
            <Copy size={11} />
            {allCopied ? 'Copied!' : `Copy all (${entries.length})`}
          </button>
          <button
            type="button"
            onClick={() => clear()}
            disabled={entries.length === 0}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200"
            data-testid="multi-error-clear-all"
          >
            <Trash2 size={11} />
            Clear all
          </button>
        </div>

        <div className="flex-1 overflow-auto space-y-1.5">
          {entries.length === 0 ? (
            <p className="text-center text-gray-500 text-xs py-6">No errors reported yet.</p>
          ) : (
            entries.map((entry) => <ErrorEntryRow key={entry.id} entry={entry} />)
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorEntryRow({ entry }: { entry: ErrorReportEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const dismiss = useErrorReportStore((s) => s.dismiss);
  const onCopy = async () => {
    await copyText(`[${entry.severity}] ${entry.title}\n${entry.hint ? `Hint: ${entry.hint}\n` : ''}${entry.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div
      className="rounded border border-gray-700"
      style={{ backgroundColor: '#1a1f2e' }}
      data-testid={`multi-error-entry-${entry.id}`}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-gray-400 hover:text-white"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <SeverityIcon severity={entry.severity} />
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 text-left text-xs text-gray-200 hover:text-white select-text cursor-text"
          style={{ userSelect: 'text' }}
        >
          {entry.title}
        </button>
        <span className="text-[10px] text-gray-500 font-mono">
          {new Date(entry.timestamp).toLocaleTimeString()}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          data-testid={`multi-error-entry-copy-${entry.id}`}
        >
          <Copy size={10} />
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={() => dismiss(entry.id)}
          className="text-gray-500 hover:text-red-400"
          aria-label="Dismiss"
          data-testid={`multi-error-entry-dismiss-${entry.id}`}
        >
          <X size={12} />
        </button>
      </div>
      {expanded && (
        <div className="px-2 pb-2 space-y-1.5">
          {entry.hint && (
            <p className="text-[11px] text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded px-2 py-1">
              <span className="font-semibold">Hint: </span>{entry.hint}
            </p>
          )}
          <textarea
            readOnly
            value={entry.body}
            className="bg-black/60 border border-gray-700 text-gray-200 font-mono text-[11px] rounded p-2 w-full h-48 resize-none focus:outline-none focus:border-blue-500 selection:bg-blue-500/40"
            data-testid={`multi-error-entry-textarea-${entry.id}`}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
    </div>
  );
}

function SeverityIcon({ severity }: { severity: ErrorReportEntry['severity'] }) {
  switch (severity) {
    case 'ERROR':
      return <AlertCircle size={14} className="text-red-400" />;
    case 'WARNING':
      return <AlertTriangle size={14} className="text-yellow-400" />;
    case 'INFO':
    default:
      return <Info size={14} className="text-blue-400" />;
  }
}

/** Clipboard write with a document.execCommand fallback so it
 *  still works in older browsers / insecure contexts. */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {
      // Silently fail — the per-entry textarea is still user-
      // selectable for manual copy.
    }
  }
}
