'use client';
// app/AndrewAsh/studio/_ui/StudioUploader.tsx — one uploader, used by media and documents.
//
// ── FILES UPLOAD ONE AT A TIME, ON PURPOSE ──────────────────────────────────────────────────────
//
// Andrew may be uploading a 180 MB WAV master over a domestic connection. Firing six of those
// concurrently makes all six slow and gives no useful progress; sequential means the first one is
// done and usable while the rest are still going, and a failure part-way leaves the earlier files
// safely stored rather than an ambiguous partial batch.
//
// Progress is per-file and stated in files, not bytes. "3 of 7" is information a person can act on;
// a percentage bar that stalls at 94% on a big upload is not.

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload, X } from 'lucide-react';

interface Props {
  destination: 'media' | 'documents';
  accept?: string;
  /** Extra form fields sent with every file — folder and category for documents. */
  extra?: Record<string, string>;
  label: string;
  hint: string;
}

export default function StudioUploader({ destination, accept, extra, label, hint }: Props): React.ReactElement {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(list: FileList | null): Promise<void> {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    setError(null);
    setQueue({ done: 0, total: files.length });

    for (const [i, file] of files.entries()) {
      const form = new FormData();
      form.append('file', file);
      form.append('destination', destination);
      form.append('title', file.name.replace(/\.[^.]+$/, ''));
      for (const [k, v] of Object.entries(extra ?? {})) form.append(k, v);

      try {
        const res = await fetch('/api/voice/media', { method: 'POST', body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Could not upload ${file.name}.`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : `Could not upload ${file.name}.`);
        // Stop the batch. Continuing past a failure means a half-uploaded set and a message that only
        // mentions the last thing that went wrong.
        break;
      }
      setQueue({ done: i + 1, total: files.length });
    }

    setQueue(null);
    if (inputRef.current) inputRef.current.value = '';
    router.refresh();
  }

  const busy = queue !== null;

  return (
    <div className="vaField" style={{ marginBottom: 18 }}>
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
        // Without preventDefault the browser refuses the drop and NAVIGATES to the file instead.
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
          accept={accept}
          className="vaDropInput"
          disabled={busy}
          onChange={(e) => void upload(e.target.files)}
        />
        <span className="vaDropIcon">
          {busy ? <Loader2 size={22} aria-hidden className="vaSpin" /> : <Upload size={22} aria-hidden />}
        </span>
        <span className="vaDropText">
          <strong>{busy ? `Uploading ${queue.done + 1} of ${queue.total}…` : label}</strong>
          <span>{hint}</span>
        </span>
      </label>

      {error && (
        <p className="vaError" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
