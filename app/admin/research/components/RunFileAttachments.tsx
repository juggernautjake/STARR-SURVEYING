'use client';

// app/admin/research/components/RunFileAttachments.tsx — G1/G2: give the run what you already know.
//
// ── WHAT WAS MISSING ────────────────────────────────────────────────────────────────────────────
//
// The owner asked to "upload images and files to start the run so that it has as much info to go off
// of before the run begins". Every part of that already existed except the part a person touches:
//
//   worker/src/index.ts        has parsed `userFiles` since it was written
//   the pipeline route         forwards them
//   useRunState.start()        puts them in the POST body
//   …the UI                    never collected one
//
// A survey the client emailed is the single most useful thing a run can be given, and there was
// nowhere to put it.
//
// `DocumentUploadPanel` is not this. It uploads to an EXISTING project, into storage, after the fact.
// These files travel WITH the run so the pipeline has them from the first stage.
//
// ── WHY THESE CAPS, AND NOT THE 500 MB ONE ──────────────────────────────────────────────────────
//
// `lib/storage/uploads.ts` allows 500 MB because that is a streamed upload into a bucket. This is a
// different thing wearing the same word: these files are base64-encoded into a JSON request body,
// which inflates them by a third and holds the whole payload in memory at both ends. A 500 MB
// attachment here would not be a large upload, it would be an outage.
//
// So the caps are small and stated in the UI rather than enforced silently — a file that is too big
// says so, by name, and the others still attach.

import React, { useRef, useState } from 'react';
import { Paperclip, X, AlertTriangle } from 'lucide-react';

/** The shape the worker parses. Matches `UserFile` in worker/src/types. */
export interface RunFile {
  filename: string;
  mimeType: string;
  /** base64, without the `data:` prefix. */
  data: string;
  size: number;
  description?: string;
}

/** Per file. Bigger than a scanned plat, smaller than a problem. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** Across all attachments, because ten 8 MB files is the same outage as one 80 MB file. */
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Decide whether one more file fits, and say why not in words.
 *
 * Separated from the component so the rule is testable without a DOM, and so the two limits cannot
 * drift apart from the text that explains them.
 */
export function rejectionReason(
  file: { name: string; size: number },
  alreadyAttached: RunFile[],
): string | null {
  if (file.size === 0) {
    return `${file.name} is empty — nothing to send.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `${file.name} is ${formatBytes(file.size)}. Attachments travel inside the run request, ` +
      `so each one has to stay under ${formatBytes(MAX_FILE_BYTES)}. Upload it to the project's ` +
      `documents instead.`;
  }
  const used = alreadyAttached.reduce((n, f) => n + f.size, 0);
  if (used + file.size > MAX_TOTAL_BYTES) {
    return `${file.name} would take this run past ${formatBytes(MAX_TOTAL_BYTES)} of attachments ` +
      `(${formatBytes(used)} already attached).`;
  }
  if (alreadyAttached.some((f) => f.filename === file.name)) {
    return `${file.name} is already attached.`;
  }
  return null;
}

/** Strip the `data:mime;base64,` prefix a FileReader result carries. */
export function stripDataUrlPrefix(result: string): string {
  const comma = result.indexOf(',');
  return comma === -1 ? result : result.slice(comma + 1);
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => resolve(stripDataUrlPrefix(String(reader.result ?? '')));
    reader.readAsDataURL(file);
  });
}

export interface RunFileAttachmentsProps {
  files: RunFile[];
  onChange: (files: RunFile[]) => void;
  /** Shown above the control. The re-run dialog and the intake want different framing. */
  label?: string;
  disabled?: boolean;
}

export default function RunFileAttachments({
  files, onChange, label = 'Files this run should start with', disabled = false,
}: RunFileAttachmentsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [reading, setReading] = useState(false);

  const used = files.reduce((n, f) => n + f.size, 0);

  async function handlePicked(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setReading(true);
    const rejected: string[] = [];
    // Accumulated locally rather than from `files`, so two files picked in one go are measured
    // against each other and not both against the same starting total.
    const accepted: RunFile[] = [...files];

    for (const file of Array.from(picked)) {
      const why = rejectionReason(file, accepted);
      if (why) { rejected.push(why); continue; }
      try {
        accepted.push({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          data: await readAsBase64(file),
          size: file.size,
        });
      } catch {
        rejected.push(`${file.name} could not be read.`);
      }
    }

    setProblems(rejected);
    setReading(false);
    onChange(accepted);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="rfa">
      <span className="rfa__label">{label}</span>
      <p className="rfa__hint">
        A survey, a plat, a deed, a photo of a monument — anything you already have. The run reads
        these alongside what it finds itself. Up to {formatBytes(MAX_FILE_BYTES)} each,{' '}
        {formatBytes(MAX_TOTAL_BYTES)} in total.
      </p>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="rfa__input"
        disabled={disabled || reading}
        onChange={(e) => { void handlePicked(e.target.files); }}
        aria-label={label}
      />

      {files.length > 0 && (
        <ul className="rfa__list">
          {files.map((f) => (
            <li key={f.filename} className="rfa__item">
              <Paperclip size={13} aria-hidden />
              <span className="rfa__name">{f.filename}</span>
              <span className="rfa__size">{formatBytes(f.size)}</span>
              <button
                type="button"
                className="rfa__remove"
                onClick={() => { setProblems([]); onChange(files.filter((x) => x.filename !== f.filename)); }}
                aria-label={`Remove ${f.filename}`}
                disabled={disabled}
              >
                <X size={13} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <p className="rfa__total">
          {files.length} file{files.length === 1 ? '' : 's'}, {formatBytes(used)} of{' '}
          {formatBytes(MAX_TOTAL_BYTES)}.
        </p>
      )}

      {problems.length > 0 && (
        <div className="rfa__problems">
          <AlertTriangle size={13} aria-hidden />
          <ul>
            {problems.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      <style jsx>{`
        .rfa { display: flex; flex-direction: column; gap: 0.3rem; }
        .rfa__label { font-size: 0.78rem; font-weight: 600; color: var(--theme-fg-primary, #1F2937); }
        .rfa__hint { margin: 0; font-size: 0.72rem; line-height: 1.4; color: var(--theme-fg-muted, #6B7280); }
        .rfa__input { font-size: 0.75rem; color: var(--theme-fg-primary, #1F2937); }
        .rfa__list { list-style: none; margin: 0.25rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.2rem; }
        .rfa__item {
          display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem;
          padding: 0.25rem 0.4rem; border-radius: 5px;
          background: var(--theme-bg-subtle, #F9FAFB);
          border: 1px solid var(--theme-border, #E5E7EB);
          color: var(--theme-fg-primary, #1F2937);
        }
        .rfa__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rfa__size { color: var(--theme-fg-muted, #6B7280); font-variant-numeric: tabular-nums; }
        .rfa__remove {
          display: inline-flex; align-items: center; justify-content: center;
          border: none; background: transparent; cursor: pointer; padding: 0.1rem;
          color: var(--theme-fg-muted, #6B7280); border-radius: 4px;
        }
        .rfa__remove:hover:not(:disabled) { color: #B91C1C; background: #FEF2F2; }
        .rfa__total { margin: 0; font-size: 0.7rem; color: var(--theme-fg-muted, #6B7280); }
        .rfa__problems {
          display: flex; gap: 0.4rem; align-items: flex-start;
          font-size: 0.72rem; line-height: 1.4;
          padding: 0.35rem 0.5rem; border-radius: 6px;
          border: 1px solid #FCD34D;
          background: var(--color-warning-surface, #FFFBEB);
          color: var(--color-warning-text, #92400E);
        }
        .rfa__problems ul { margin: 0; padding-left: 1rem; }
      `}</style>
    </div>
  );
}
