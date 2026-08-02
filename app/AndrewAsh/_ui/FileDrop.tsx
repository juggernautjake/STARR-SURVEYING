'use client';
// app/AndrewAsh/_ui/FileDrop.tsx — attaching a script to an inquiry.
//
// ── IT IS A <label> WRAPPING A REAL <input type="file"> ─────────────────────────────────────────
//
// Not a div with a click handler. The hand-rolled version loses keyboard access, loses the screen
// reader's "button, choose file", and loses the mobile behaviour where tapping offers Files / Photos
// / Browse. A real input styled to look like a drop zone keeps all of it and still accepts a drag.
//
// Drag-and-drop is the enhancement, not the mechanism. On a phone — where a real fraction of these
// submissions come from — there is nothing to drag.
//
// ── FILES UPLOAD IMMEDIATELY, NOT ON SUBMIT ─────────────────────────────────────────────────────
//
// Chosen so the client sees progress and failure while they are still looking at the form. Deferring
// to submit means a 12 MB script uploads behind a spinner on the one click they expect to be
// instant — and if it fails there, the whole form appears to have failed.
//
// The cost is orphaned uploads when someone attaches a file and abandons the form. That is a storage
// housekeeping problem, and it is much cheaper than losing the inquiry.

import { useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, Upload, X } from 'lucide-react';

export interface UploadedFile {
  name: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string | null;
}

interface Props {
  files: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  error: string | null;
  onError: (error: string | null) => void;
}

const ACCEPT = '.pdf,.doc,.docx,.rtf,.txt,.md,.odt,.csv,.mp3,.wav,.m4a';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileDrop({ files, onChange, error, onError }: Props): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Nested dragenter/dragleave events fire for every child element, so a boolean flag flickers as the
  // pointer moves across the zone's contents. Counting enters and leaves is the fix.
  const dragDepth = useRef(0);

  async function upload(list: FileList | null): Promise<void> {
    if (!list || list.length === 0) return;
    onError(null);

    if (files.length + list.length > 5) {
      onError('Up to five files. If you have more, zip is not accepted — send a link instead.');
      return;
    }

    const form = new FormData();
    for (const file of Array.from(list)) form.append('files', file);

    setBusy(true);
    try {
      const res = await fetch('/api/voice/uploads', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'That upload did not work.');
      onChange([...files, ...(body.files ?? [])]);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'That upload did not work.');
    } finally {
      setBusy(false);
      // Clear the input so choosing the SAME file again still fires a change event.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="vaField">
      <span className="vaLabel">Attach a script (optional)</span>

      <label
        className={`vaDrop${dragging ? ' vaDropActive' : ''}${busy ? ' vaDropBusy' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDragging(false);
          }
        }}
        // Without preventDefault on dragOver the browser refuses the drop and instead NAVIGATES to
        // the file — replacing the half-filled form with a PDF.
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="vaDropInput"
          disabled={busy}
          onChange={(e) => void upload(e.target.files)}
        />
        <span className="vaDropIcon">
          {busy ? <Loader2 size={22} aria-hidden className="vaSpin" /> : <Upload size={22} aria-hidden />}
        </span>
        <span className="vaDropText">
          <strong>{busy ? 'Uploading…' : 'Choose a file or drop one here'}</strong>
          <span>PDF, Word, RTF or plain text. Reference audio welcome. Up to 15 MB each.</span>
        </span>
      </label>

      {error && (
        <p className="vaError" role="alert">
          {error}
        </p>
      )}

      {files.length > 0 && (
        <ul className="vaDropList">
          {files.map((file) => (
            <li key={file.storage_path}>
              <FileText size={15} aria-hidden />
              <span className="vaDropName">{file.name}</span>
              <span className="vaDropSize">{formatBytes(file.size_bytes)}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((f) => f.storage_path !== file.storage_path))}
                aria-label={`Remove ${file.name}`}
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.length === 0 && !busy && (
        <p className="vaHint">
          <Paperclip size={12} aria-hidden style={{ verticalAlign: -1, marginRight: 4 }} />
          No file? Pasting the script into the box above works just as well.
        </p>
      )}
    </div>
  );
}
