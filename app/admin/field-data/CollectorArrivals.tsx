'use client';
// app/admin/field-data/CollectorArrivals.tsx — the drag-and-drop half of §3d (items 8n/8o).
//
// `/api/admin/field-ingest` shipped with a full parser set behind it — LandXML, GSI, RW5, JobXML,
// CSV — an idempotent content hash, and two clocks. And nothing in the app called it. A surveyor
// with a day's shots on a collector had no way to get them in except an HTTP client.
//
// This is the manual path, which §3d lists first for a reason: *"Every collector can auto-export to
// a cloud folder … Watch it, parse, ingest. Unglamorous, and the only option that covers Leica and
// GeoMax at all today."* The watched-folder agent posts to the same endpoint with a JSON body, so
// what a person does by hand here and what the agent does unattended cannot drift apart.
//
// Re-importing the same file is normal — a crew that is not sure the first upload worked will do it
// again. The route answers `alreadyImported` and this says so in words, because "imported 0 points"
// reads as a failure.

import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadCloud, FileCheck, AlertTriangle } from 'lucide-react';

interface Batch {
  id: string;
  job_id: string | null;
  file_name: string | null;
  format: string | null;
  received_at: string;
  point_count: number | null;
  skipped_count: number | null;
  status: string | null;
  warnings: string[] | null;
  error: string | null;
  created_by: string | null;
}

export default function CollectorArrivals({ jobId }: { jobId?: string }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; warnings?: string[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/field-ingest${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ''}`);
      if (!res.ok) { setState('failed'); return; }
      const d = await res.json();
      setBatches(d.batches ?? []);
      setState('ok');
    } catch { setState('failed'); }
  }, [jobId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const upload = useCallback(async (file: File) => {
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (jobId) form.append('jobId', jobId);
      const res = await fetch('/api/admin/field-ingest', { method: 'POST', body: form });
      const d = await res.json();
      if (!res.ok) {
        // The parser's own message is shown rather than a generic failure: "no recognisable points"
        // and "this is a Leica GSI-8 with a truncated block" send the reader to different places.
        setResult({ ok: false, message: d.error || 'That file could not be read.' });
        return;
      }
      setResult({ ok: true, message: d.message, warnings: d.warnings ?? [] });
      void refresh();
    } catch {
      setResult({ ok: false, message: 'The upload did not reach the server.' });
    } finally {
      setBusy(false);
    }
  }, [jobId, refresh]);

  return (
    <section className="arrivals">
      <header className="arrivals__head">
        <h2 className="arrivals__title">Collector arrivals</h2>
        <p className="arrivals__sub">
          Drop a raw file from any collector — LandXML, GSI, RW5, Trimble JobXML or CSV. The same
          endpoint receives the watched-folder agent’s uploads, so an import done here and one done
          unattended are recorded identically. Importing the same file twice is safe.
        </p>
      </header>

      <div
        className={`arrivals__drop${dragging ? ' arrivals__drop--over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
      >
        <UploadCloud size={22} aria-hidden />
        <p>
          Drop a file here, or{' '}
          <button type="button" className="arrivals__browse" onClick={() => inputRef.current?.click()} disabled={busy}>
            choose one
          </button>
          .
        </p>
        <input
          ref={inputRef}
          type="file"
          className="arrivals__file"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }}
          aria-label="Choose a collector file to import"
        />
        {busy ? <p className="arrivals__busy">Reading the file…</p> : null}
      </div>

      {result ? (
        <div className={`arrivals__result arrivals__result--${result.ok ? 'ok' : 'bad'}`} role="status">
          {result.ok ? <FileCheck size={14} aria-hidden /> : <AlertTriangle size={14} aria-hidden />}
          <span>{result.message}</span>
          {result.warnings && result.warnings.length > 0 ? (
            <ul>{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          ) : null}
        </div>
      ) : null}

      {state === 'loading' ? (
        <p className="arrivals__note">Loading arrivals…</p>
      ) : state === 'failed' ? (
        <p className="arrivals__note arrivals__note--bad">
          The arrivals list could not be read — which is not the same as no files having arrived.
        </p>
      ) : batches.length === 0 ? (
        <p className="arrivals__note">
          No collector files have been imported yet. Points captured on the crew’s phones appear in
          the gallery below without any of this.
        </p>
      ) : (
        <table className="arrivals__table">
          <thead>
            <tr><th>File</th><th>Format</th><th>Points</th><th>Arrived</th><th>By</th></tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className={b.error ? 'arrivals__row--bad' : undefined}>
                <td>{b.file_name ?? '—'}{b.error ? <em> — {b.error}</em> : null}</td>
                <td>{b.format ?? 'unknown'}</td>
                <td>
                  {b.point_count ?? 0}
                  {/* Skipped is shown whenever it is non-zero. A silent difference between "the file
                      had 400 points" and "we imported 380" is how a boundary quietly loses corners. */}
                  {b.skipped_count ? <em> ({b.skipped_count} skipped)</em> : null}
                </td>
                <td>{new Date(b.received_at).toLocaleString()}</td>
                <td>{b.created_by ?? 'agent'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
