// app/admin/design/conformance/page.tsx — how far the pages are from their designs.
//
// Phase R3 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"if we make a page the active page, then it will become the actual served page."*
//
// §1 explains why a design cannot literally replace a working route. This is the honest version of
// the same question: for every page with a design of record, how much of that design is actually on
// the page — and, for every page with a default, whether that trace is still 1:1.
//
// ── WHY THIS READS A FILE AND NOT THE DATABASE ──────────────────────────────────────────────────
//
// The measurement needs a real browser walking real pages at two viewports; it takes minutes, not
// milliseconds, so it cannot happen while somebody is waiting for a page to render. The run writes
// `lib/design/conformance.generated.json` and this reads it — the same shape as the fidelity record,
// for the same reason. What matters is that the page says WHEN the numbers were measured, because a
// conformance score with no date is a number people trust for months.

import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import Link from 'next/link';
import '../DesignStudio.css';

export const metadata: Metadata = { title: 'Design conformance' };
export const dynamic = 'force-dynamic';

interface Row {
  kind?: string;
  view?: string;
  designId?: string;
  designName?: string;
  score?: number;
  designElements?: number;
  pageElements?: number;
  matched?: number;
  missing?: number;
  moved?: number;
  resized?: number;
  extra?: number;
  verdict?: { ok: boolean; why: string } | null;
  worst?: Array<{ kind: string; signature: string; note: string }>;
  error?: string;
}

interface Record_ {
  measuredAt: string;
  base: string;
  which: string;
  routes: Record<string, Row[]>;
}

function readRecord(): Record_ | null {
  try {
    const file = path.join(process.cwd(), 'lib/design/conformance.generated.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record_;
  } catch {
    // Absent is the normal state before the first run, and not an error worth a stack trace.
    return null;
  }
}

const COMMAND = 'node --env-file=.env.local scripts/check-design-conformance.mjs --base http://127.0.0.1:3000 --write';

export default function ConformancePage() {
  const record = readRecord();

  if (!record) {
    return (
      <div className="dsx-conf">
        <h1>Conformance</h1>
        <p className="dsx-conf__intro">
          How much of each page’s design is actually on the page. Nothing has been measured yet.
        </p>
        <pre className="dsx-conf__cmd">{COMMAND}</pre>
        <p className="dsx-conf__note">
          It walks every route that has a design of record or a default, at 1440 and at 390, and
          compares what it finds with what the design says should be there.
        </p>
        <Link className="admin-btn admin-btn--secondary" href="/admin/design">Back to the Page Designer</Link>
      </div>
    );
  }

  const routes = Object.entries(record.routes).sort(([a], [b]) => a.localeCompare(b));
  const measured = new Date(record.measuredAt);
  const ageDays = Math.floor((Date.now() - measured.getTime()) / 86_400_000);
  const staleDefaults = routes.flatMap(([route, rows]) =>
    rows.filter((r) => r.verdict && !r.verdict.ok).map((r) => ({ route, row: r })));

  return (
    <div className="dsx-conf">
      <header className="dsx-conf__head">
        <div>
          <h1>Conformance</h1>
          <p className="dsx-conf__intro">
            The design of record against the page as it is served, and the default trace against the
            page it claims to be a record of.
          </p>
        </div>
        <p className={`dsx-conf__when${ageDays > 7 ? ' is-stale' : ''}`}>
          Measured {measured.toLocaleString()}
          {ageDays > 0 && <> · {ageDays} day{ageDays === 1 ? '' : 's'} ago</>}
          <br />
          <code>{record.base}</code>
        </p>
      </header>

      {/* ── The one thing on this page that is a failure rather than a distance ────────────────
        * A default that no longer matches its page is not a design decision waiting to be built —
        * it is a record that has stopped being true, and everything downstream of it (the
        * checklist, the comparison, the "1:1" claim) is quietly wrong until it is re-traced. */}
      {staleDefaults.length > 0 && (
        <section className="dsx-conf__stale">
          <h2>{staleDefaults.length} default{staleDefaults.length === 1 ? '' : 's'} no longer match the page</h2>
          <ul>
            {staleDefaults.map(({ route, row }) => (
              <li key={`${route}-${row.view}`}>
                <code>{route}</code> <em>{row.view}</em> — {row.verdict?.why}
                <span className="dsx-conf__fix">
                  re-trace: <code>node --env-file=.env.local scripts/trace-defaults.mjs --only {route}</code>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <table className="dsx-conf__table">
        <thead>
          <tr>
            <th>Page</th>
            <th>Compared with</th>
            <th>View</th>
            <th>Conformance</th>
            <th>Missing</th>
            <th>Out of place</th>
            <th>On the page only</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {routes.flatMap(([route, rows]) => rows.map((row, i) => (
            <tr key={`${route}-${row.kind}-${row.view}-${i}`} className={row.verdict && !row.verdict.ok ? 'is-bad' : ''}>
              {i === 0 && <td rowSpan={rows.length}><code>{route}</code></td>}
              <td>
                {row.error ? <em className="dsx-conf__err">{row.error}</em> : (
                  <>
                    <strong>{row.kind}</strong>
                    <span className="dsx-conf__design">{row.designName}</span>
                  </>
                )}
              </td>
              <td>{row.view ?? '—'}</td>
              <td>
                {row.score != null && (
                  <span className="dsx-conf__score">
                    <span className="dsx-conf__bar"><span style={{ width: `${row.score}%` }} /></span>
                    {row.score}%
                  </span>
                )}
              </td>
              <td>{row.missing ?? '—'}</td>
              <td>{row.moved != null ? (row.moved ?? 0) + (row.resized ?? 0) : '—'}</td>
              <td>{row.extra ?? '—'}</td>
              <td>
                {row.designId && (
                  <Link className="dsx-conf__open" href={`/admin/design/${row.designId}`}>Open</Link>
                )}
              </td>
            </tr>
          )))}
        </tbody>
      </table>

      <details className="dsx-conf__detail">
        <summary>What each number means</summary>
        <dl>
          <dt>Conformance</dt>
          <dd>
            The share of the DESIGN’s elements that are on the page, in the right place, at the right
            size. Computed from the design’s elements rather than from both sides, so a page with an
            extra help link is conformant-with-an-addition rather than 90% conformant — otherwise the
            way to raise the score would be to delete useful controls.
          </dd>
          <dt>Missing</dt>
          <dd>The design has it; the page does not. On an active design this is work to do.</dd>
          <dt>Out of place</dt>
          <dd>Both have it, more than 24px apart or more than 16px different in size.</dd>
          <dt>On the page only</dt>
          <dd>
            The page has something the design never mentions. Not counted against the score: it is
            usually the page having grown, which is information rather than a defect.
          </dd>
        </dl>
      </details>

      <p className="dsx-conf__note">
        Re-measure: <code>{COMMAND}</code>
      </p>
    </div>
  );
}
