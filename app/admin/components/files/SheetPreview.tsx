'use client';
// SheetPreview — rows and columns of a CSV, TSV or Excel file inside the shared file viewer
// (owner, 2026-10-01). CSV is parsed here (lib/files/sheet-preview.ts); Excel by SheetJS, imported
// only when a workbook is actually opened so no other page pays for it.
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  SHEET_MAX_BYTES, SHEET_PAGE_ROWS, columnCount, columnLetter, parseDelimited, type SheetFormat,
} from '@/lib/files/sheet-preview';

interface Sheet {
  name: string;
  rows: string[][];
  /** Rows in the sheet, when more exist than were read. */
  totalRows: number | null;
}

/** How many rows are read up front. The table draws them in pages of SHEET_PAGE_ROWS. */
const READ_ROWS = 20_000;

async function loadSheets(url: string, format: SheetFormat): Promise<Sheet[]> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const declared = Number(res.headers.get('content-length'));
  if (declared > SHEET_MAX_BYTES) throw new Error('this file is too large to preview — save it to open it');
  const buf = await res.arrayBuffer();
  if (buf.byteLength > SHEET_MAX_BYTES) throw new Error('this file is too large to preview — save it to open it');

  if (format !== 'excel') {
    const text = new TextDecoder('utf-8').decode(buf);
    const { rows, truncated } = parseDelimited(text, { delimiter: format === 'tsv' ? '\t' : undefined, maxRows: READ_ROWS });
    return [{ name: format.toUpperCase(), rows, totalRows: truncated ? null : rows.length }];
  }

  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true, sheetRows: READ_ROWS });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    // `raw: false` gives each cell as Excel would display it: dates as dates, currency with its
    // symbol, numbers with their format — which is what someone previewing a file expects to see.
    const rows = ws ? (XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '', blankrows: true }) as unknown[][])
      .map((r) => r.map((v) => (v === null || v === undefined ? '' : String(v)))) : [];
    // With `sheetRows` set, SheetJS keeps the sheet's real extent in `!fullref`.
    const full = ws?.['!fullref'] ? XLSX.utils.decode_range(ws['!fullref'] as string) : null;
    const totalRows = full ? full.e.r + 1 : rows.length;
    return { name, rows, totalRows };
  });
}

export default function SheetPreview({ url, format }: { url: string; format: SheetFormat }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [headerRow, setHeaderRow] = useState(true);
  const [shown, setShown] = useState(SHEET_PAGE_ROWS);

  useEffect(() => {
    let cancelled = false;
    setSheets(null); setError(null); setActive(0); setShown(SHEET_PAGE_ROWS);
    loadSheets(url, format)
      .then((s) => { if (!cancelled) setSheets(s); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [url, format]);

  const sheet = sheets?.[active] ?? null;
  const cols = useMemo(() => (sheet ? columnCount(sheet.rows) : 0), [sheet]);

  if (error) return <div className="fv-message" role="alert"><AlertTriangle size={18} aria-hidden="true" /> Could not open this file: {error}</div>;
  if (!sheets || !sheet) return <div className="fv-loading"><Loader2 size={22} className="fv-spin motion-essential" aria-hidden="true" /> Loading spreadsheet…</div>;

  const head = headerRow && sheet.rows.length > 0 ? sheet.rows[0] : null;
  const body = head ? sheet.rows.slice(1) : sheet.rows;
  const visible = body.slice(0, shown);
  const firstNumber = head ? 2 : 1;
  const readAll = sheet.totalRows !== null && sheet.totalRows <= sheet.rows.length;
  const total = sheet.totalRows ?? sheet.rows.length;

  return (
    // Pointer events stop here: the viewer's stage drags to pan, and that would swallow text
    // selection and scrollbar drags inside the table.
    <div className="fv-sheet" onPointerDown={(e) => e.stopPropagation()} data-testid="sheet-preview">
      <div className="fv-sheet__bar">
        {sheets.length > 1 ? (
          <div className="fv-sheet__tabs" role="tablist" aria-label="Sheets">
            {sheets.map((s, i) => (
              <button key={`${s.name}-${i}`} type="button" role="tab" aria-selected={i === active}
                className={`fv-sheet__tab${i === active ? ' fv-sheet__tab--on' : ''}`}
                onClick={() => { setActive(i); setShown(SHEET_PAGE_ROWS); }}>
                {s.name}
              </button>
            ))}
          </div>
        ) : null}
        <span className="fv-sheet__count">
          {total.toLocaleString()} row{total === 1 ? '' : 's'} · {cols} column{cols === 1 ? '' : 's'}
        </span>
        <label className="fv-sheet__toggle">
          <input type="checkbox" checked={headerRow} onChange={(e) => setHeaderRow(e.target.checked)} /> First row is headings
        </label>
      </div>

      {sheet.rows.length === 0 || cols === 0 ? (
        <div className="fv-message"><p>This sheet is empty.</p></div>
      ) : (
        <div className="fv-sheet__scroll" tabIndex={0} aria-label={`${sheet.name} — rows and columns`}>
          <table className="fv-sheet__table">
            <thead>
              <tr>
                <th className="fv-sheet__corner" aria-hidden="true" />
                {Array.from({ length: cols }, (_, c) => <th key={c} className="fv-sheet__col" scope="col">{columnLetter(c)}</th>)}
              </tr>
              {head ? (
                <tr className="fv-sheet__headrow">
                  <th className="fv-sheet__rownum" scope="row">1</th>
                  {Array.from({ length: cols }, (_, c) => <th key={c} scope="col" title={head[c] ?? ''}>{head[c] ?? ''}</th>)}
                </tr>
              ) : null}
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={i}>
                  <th className="fv-sheet__rownum" scope="row">{i + firstNumber}</th>
                  {Array.from({ length: cols }, (_, c) => <td key={c} title={(r[c] ?? '').length > 40 ? r[c] : undefined}>{r[c] ?? ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {body.length > shown || !readAll ? (
        <div className="fv-sheet__more">
          Showing {Math.min(shown, body.length).toLocaleString()} of {(total - (head ? 1 : 0)).toLocaleString()} rows.
          {body.length > shown ? (
            <button type="button" className="fv-sheet__morebtn" onClick={() => setShown((n) => n + SHEET_PAGE_ROWS)}>Show {SHEET_PAGE_ROWS.toLocaleString()} more</button>
          ) : <span> Save the file to see the rest.</span>}
        </div>
      ) : null}
    </div>
  );
}
