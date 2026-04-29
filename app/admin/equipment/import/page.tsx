// app/admin/equipment/import/page.tsx — Bulk CSV import (Phase F10.1h-ii)
//
// System-go-live fleet seeder per §5.12.11.H + §15 prereq #40.
// Equipment Manager walks the cage, transcribes to a spreadsheet,
// exports CSV, drops it here.
//
// Two-phase flow:
//   1. Pick file (or paste CSV) → run dry-run → review per-row
//      errors highlighted by row + field
//   2. When dry-run is clean, click "Execute import" → atomic
//      bulk insert via the F10.1h-i endpoint, success toast +
//      link back to catalogue
//
// Auth: admin / developer / equipment_manager.
'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

interface RowError {
  row_index: number;
  field?: string;
  message: string;
}

interface DryRunResponse {
  mode: 'dry_run';
  total_rows: number;
  would_insert: number;
  errors: RowError[];
}

interface ExecuteResponse {
  mode: 'execute';
  total_rows: number;
  inserted: number;
  inserted_items?: Array<{
    id: string;
    name: string | null;
    qr_code_id: string | null;
    item_kind: string | null;
  }>;
  error?: string;
  errors?: RowError[];
  message?: string;
  details?: string;
}

const SAMPLE_CSV = `name,item_kind,category,brand,model,serial_number,qr_code_id,current_status,acquired_cost_cents,useful_life_months,home_location
Total Station — Trimble S9 #1,durable,total_station,Trimble,S9,SN12345,,available,4000000,60,Cage shelf B2
GPS Rover Kit #1,kit,gps_rover_kit,,,,,available,2500000,60,Truck 3
Pink survey ribbon (1 in × 300 ft),consumable,ribbon,,,,,available,,,Cage shelf C1`;

export default function EquipmentImportPage() {
  const { data: session } = useSession();
  const [csv, setCsv] = useState('');
  const [filename, setFilename] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dryRun, setDryRun] = useState<DryRunResponse | null>(null);
  const [executeResult, setExecuteResult] = useState<ExecuteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setCsv(text);
      setFilename(file.name);
      setDryRun(null);
      setExecuteResult(null);
      setError(null);
    };
    reader.onerror = () => setError(`Failed to read ${file.name}`);
    reader.readAsText(file);
  }, []);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onPaste = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCsv(e.target.value);
    setFilename(null);
    setDryRun(null);
    setExecuteResult(null);
    setError(null);
  }, []);

  const runDryRun = useCallback(async () => {
    setError(null);
    setDryRun(null);
    setExecuteResult(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/equipment/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, mode: 'dry_run' }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
      } else {
        setDryRun(json as DryRunResponse);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }, [csv]);

  const runExecute = useCallback(async () => {
    if (!dryRun || dryRun.errors.length > 0) return;
    const ok = window.confirm(
      `Insert ${dryRun.would_insert} equipment row${
        dryRun.would_insert === 1 ? '' : 's'
      }? This is atomic — if anything fails the whole batch rolls back.`
    );
    if (!ok) return;
    setError(null);
    setExecuteResult(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/equipment/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, mode: 'execute' }),
      });
      const json = (await res.json()) as ExecuteResponse;
      setExecuteResult(json);
      if (!res.ok) {
        setError(json.error ?? `Execute failed (HTTP ${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }, [csv, dryRun]);

  const reset = useCallback(() => {
    setCsv('');
    setFilename(null);
    setDryRun(null);
    setExecuteResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  const dryClean = dryRun && dryRun.errors.length === 0 && dryRun.would_insert > 0;

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Equipment CSV import</h1>
        <p style={styles.subtitle}>
          System-go-live path: walk the cage with a clipboard, transcribe to a
          spreadsheet, export CSV, drop it here. Required headers:{' '}
          <code>name</code> + <code>item_kind</code>. See the sample below for
          the full optional column list. Atomic — if any row fails the whole
          batch rolls back.
        </p>
        <p style={styles.subtitle}>
          ▸ Workflow: pick file → <strong>Run dry-run</strong> → fix
          per-row errors → <strong>Execute import</strong>. Run dry-run as
          many times as you want; only Execute touches the database.
        </p>
      </header>

      {executeResult?.mode === 'execute' && executeResult.inserted > 0 ? (
        <div style={styles.successBanner}>
          ✓ Imported{' '}
          <strong>
            {executeResult.inserted} row
            {executeResult.inserted === 1 ? '' : 's'}
          </strong>
          .{' '}
          <Link href="/admin/equipment/inventory" style={styles.link}>
            Open the catalogue →
          </Link>
        </div>
      ) : null}

      <section style={styles.section}>
        <header style={styles.sectionHeader}>
          <h2 style={styles.h2}>1. Upload or paste your CSV</h2>
        </header>
        <div style={styles.sectionBody}>
          <div style={styles.uploadRow}>
            <label style={styles.fileBtn}>
              <input
                type="file"
                accept=".csv,.tsv,.txt,text/csv"
                onChange={onFileChange}
                ref={fileInputRef}
                style={{ display: 'none' }}
              />
              Choose file
            </label>
            <span style={styles.muted}>
              {filename ? <code>{filename}</code> : 'No file selected.'}
            </span>
            {csv ? (
              <button
                type="button"
                style={styles.refreshBtn}
                onClick={reset}
                disabled={submitting}
              >
                Reset
              </button>
            ) : null}
          </div>
          <textarea
            value={csv}
            onChange={onPaste}
            placeholder={`Paste CSV here, or load via the picker above.\n\nExample:\n${SAMPLE_CSV}`}
            style={styles.textarea}
            spellCheck={false}
          />
          <p style={styles.modalHint}>
            ▸ Sample headers showing every supported column lives in the
            placeholder above. Tab-delimited works too (Sheets &quot;Copy
            range&quot; pastes tabs).
          </p>
        </div>
      </section>

      <section style={styles.section}>
        <header style={styles.sectionHeader}>
          <h2 style={styles.h2}>2. Validate</h2>
        </header>
        <div style={styles.sectionBody}>
          <button
            type="button"
            style={styles.addBtn}
            onClick={() => void runDryRun()}
            disabled={submitting || !csv.trim()}
          >
            {submitting && !dryRun ? 'Validating…' : 'Run dry-run'}
          </button>
          {error && !dryRun ? (
            <div style={styles.errorBanner}>⚠ {error}</div>
          ) : null}
          {dryRun ? (
            <div
              style={
                dryRun.errors.length === 0
                  ? styles.successBanner
                  : styles.errorBanner
              }
            >
              {dryRun.errors.length === 0 ? '✓' : '⚠'} Dry-run:{' '}
              <strong>{dryRun.total_rows}</strong> row
              {dryRun.total_rows === 1 ? '' : 's'} parsed,{' '}
              <strong>{dryRun.would_insert}</strong> would insert,{' '}
              <strong>{dryRun.errors.length}</strong> error
              {dryRun.errors.length === 1 ? '' : 's'}.
            </div>
          ) : null}
          {dryRun && dryRun.errors.length > 0 ? (
            <table style={styles.errorsTable}>
              <thead>
                <tr>
                  <th style={styles.th}>Row</th>
                  <th style={styles.th}>Field</th>
                  <th style={styles.th}>Error</th>
                </tr>
              </thead>
              <tbody>
                {dryRun.errors.map((e, idx) => (
                  <tr key={`${e.row_index}-${e.field ?? ''}-${idx}`}>
                    <td style={styles.td}>{e.row_index}</td>
                    <td style={styles.td}>
                      {e.field ? <code>{e.field}</code> : '—'}
                    </td>
                    <td style={styles.td}>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </section>

      <section style={styles.section}>
        <header style={styles.sectionHeader}>
          <h2 style={styles.h2}>3. Execute</h2>
        </header>
        <div style={styles.sectionBody}>
          <button
            type="button"
            style={styles.submitBtn}
            onClick={() => void runExecute()}
            disabled={submitting || !dryClean}
            title={
              !dryRun
                ? 'Run dry-run first.'
                : dryRun.errors.length > 0
                  ? 'Fix dry-run errors first.'
                  : dryRun.would_insert === 0
                    ? 'Nothing to insert.'
                    : 'Run the atomic bulk insert'
            }
          >
            {submitting && dryRun ? 'Importing…' : 'Execute import'}
          </button>
          {executeResult?.errors && executeResult.errors.length > 0 ? (
            <div style={styles.errorBanner}>
              ⚠ Execute refused — {executeResult.errors.length} per-row error
              {executeResult.errors.length === 1 ? '' : 's'} in the latest
              run. Re-run dry-run for the latest preview.
            </div>
          ) : null}
          {executeResult?.error && !executeResult.inserted ? (
            <div style={styles.errorBanner}>⚠ {executeResult.error}</div>
          ) : null}
        </div>
      </section>

      <p style={styles.note}>
        ▸ Activation gate: <code>seeds/233-237</code> must be applied to live
        Supabase before this page accepts uploads. Sidebar entry lands in
        Phase F10.6 alongside the Equipment dashboard group.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: '24px', maxWidth: 1100, margin: '0 auto' },
  header: { marginBottom: 16 },
  h1: { fontSize: 22, fontWeight: 600, margin: '0 0 4px' },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    margin: '0 0 8px',
    maxWidth: 760,
    lineHeight: 1.5,
  },
  section: {
    marginBottom: 16,
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    padding: '12px 16px',
    background: '#F7F8FA',
    borderBottom: '1px solid #E2E5EB',
  },
  h2: { fontSize: 14, fontWeight: 600, margin: 0 },
  sectionBody: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  uploadRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  fileBtn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    display: 'inline-block',
  },
  refreshBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
  },
  addBtn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    alignSelf: 'flex-start',
  },
  submitBtn: {
    background: '#15803D',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    alignSelf: 'flex-start',
  },
  textarea: {
    fontFamily: 'Menlo, monospace',
    fontSize: 12,
    padding: '10px 12px',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    minHeight: 220,
    resize: 'vertical',
    width: '100%',
    boxSizing: 'border-box',
  },
  successBanner: {
    background: '#F0FDF4',
    border: '1px solid #86EFAC',
    color: '#15803D',
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
  },
  errorBanner: {
    background: '#FEF2F2',
    border: '1px solid #FCA5A5',
    color: '#B91C1C',
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
  },
  errorsTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
    marginTop: 8,
  },
  th: {
    textAlign: 'left',
    padding: '6px 10px',
    background: '#FEF2F2',
    color: '#7F1D1D',
    fontWeight: 600,
    borderBottom: '1px solid #FCA5A5',
  },
  td: {
    padding: '6px 10px',
    borderBottom: '1px solid #F3F4F6',
    verticalAlign: 'top',
  },
  empty: {
    padding: 32,
    textAlign: 'center',
    color: '#6B7280',
  },
  link: { color: '#1D3095', fontWeight: 500 },
  muted: { color: '#9CA3AF', fontSize: 13 },
  modalHint: {
    fontSize: 12,
    color: '#6B7280',
    margin: 0,
    fontStyle: 'italic',
  },
  note: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 24,
    fontStyle: 'italic',
  },
};
