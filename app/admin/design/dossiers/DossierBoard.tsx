'use client';
// app/admin/design/dossiers/DossierBoard.tsx — a dossier for every page, written and measured.
//
// Phases D2–D4 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"I want a clear comprehensive summary of the purpose of each page and every main element
// on the page and what it is for."*
//
// ── THE SCREEN IS A WORK QUEUE, NOT AN ARCHIVE ──────────────────────────────────────────────────
//
// 270 pages, each in one of four states: nothing, measured but nobody has said what it is for,
// written but never measured, and both. The default filter is "measured, needs a sentence", because
// that is the pile a person can actually clear — the deriver produces it by the hundred and only a
// human can finish it.
//
// ── AND WHY THE TWO HALVES ARE VISIBLY DIFFERENT THINGS ─────────────────────────────────────────
//
// The written half is in editable fields. The measured half is grey, timestamped and read-only,
// with the command that refreshes it. That is not decoration: somebody who cannot tell which half
// a claim came from cannot tell whether disagreeing with it means fixing a sentence or re-running a
// measurement.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, RefreshCw, Save, FileText } from 'lucide-react';
import { DOSSIER_STATE_LABEL, dossierState, derivedAgeDays, type PageDossier, type DossierState } from '@/lib/design/dossier';
import type { ChecklistRow } from '@/lib/design/checklist';
import '../DesignStudio.css';

interface PageRow { route: string; area: string; dynamic: boolean }

const FILTERS: Array<{ id: DossierState | 'all'; label: string }> = [
  { id: 'derived-only', label: 'Needs a sentence' },
  { id: 'none', label: 'Nothing yet' },
  { id: 'complete', label: 'Done' },
  { id: 'authored-only', label: 'Never measured' },
  { id: 'all', label: 'Every page' },
];

export default function DossierBoard({ initialRoute }: { initialRoute?: string }) {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [dossiers, setDossiers] = useState<PageDossier[]>([]);
  const [filter, setFilter] = useState<DossierState | 'all'>('derived-only');
  const [query, setQuery] = useState('');
  const [route, setRoute] = useState<string | null>(initialRoute ?? null);
  const [detail, setDetail] = useState<{ dossier: PageDossier | null; rows: ChecklistRow[] } | null>(null);
  const [draft, setDraft] = useState({ purpose: '', summary: '', audience: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadIndex = useCallback(async () => {
    const [pagesRes, dossierRes] = await Promise.all([
      fetch('/api/admin/design/pages', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ pages: [] })),
      fetch('/api/admin/design/dossier', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ dossiers: [] })),
    ]);
    setPages((pagesRes.pages ?? []).filter((p: PageRow) => !p.dynamic));
    setDossiers(dossierRes.dossiers ?? []);
  }, []);

  useEffect(() => { void loadIndex(); }, [loadIndex]);

  const loadDetail = useCallback(async (target: string) => {
    const res = await fetch(`/api/admin/design/dossier?route=${encodeURIComponent(target)}`, { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    setDetail(body ?? null);
    setDraft({
      purpose: body?.dossier?.purpose ?? '',
      summary: body?.dossier?.summary ?? '',
      audience: body?.dossier?.audience ?? '',
    });
    setSaved(false);
  }, []);

  useEffect(() => { if (route) void loadDetail(route); }, [route, loadDetail]);

  const byRoute = useMemo(() => new Map(dossiers.map((d) => [d.route, d])), [dossiers]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pages
      .map((p) => {
        const d = byRoute.get(p.route);
        const state = d
          ? dossierState({ purpose: d.purpose, summary: d.summary, elementCount: d.elementCount })
          : 'none';
        return { ...p, dossier: d ?? null, state };
      })
      .filter((r) => (filter === 'all' ? true : r.state === filter))
      .filter((r) => (!q ? true : r.route.toLowerCase().includes(q) || (r.dossier?.purpose ?? '').toLowerCase().includes(q)));
  }, [pages, byRoute, filter, query]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { none: 0, 'derived-only': 0, 'authored-only': 0, complete: 0 };
    for (const p of pages) {
      const d = byRoute.get(p.route);
      const state = d ? dossierState({ purpose: d.purpose, summary: d.summary, elementCount: d.elementCount }) : 'none';
      out[state] = (out[state] ?? 0) + 1;
    }
    return out;
  }, [pages, byRoute]);

  async function save() {
    if (!route) return;
    setSaving(true);
    const res = await fetch('/api/admin/design/dossier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route, ...draft }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); await loadIndex(); await loadDetail(route); }
  }

  const dossier = detail?.dossier ?? null;
  const age = derivedAgeDays(dossier?.derivedAt, new Date());

  return (
    <div className="dsx-dos">
      <header className="dsx-dos__head">
        <div>
          <h1><FileText size={20} aria-hidden /> Page dossiers</h1>
          <p>
            What each page is for, what it does, and every element on it. The measured half comes
            from a walk of the running app; the written half comes from you, and a re-measure never
            touches it.
          </p>
        </div>
        <Link className="admin-btn admin-btn--secondary" href="/admin/design">Back to designs</Link>
      </header>

      <div className="dsx-dos__body">
        <aside className="dsx-dos__list">
          <div className="dsx-dos__filters">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={filter === f.id ? 'is-on' : ''}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                {f.id !== 'all' && <span>{counts[f.id] ?? 0}</span>}
              </button>
            ))}
          </div>
          <label className="dsx-dos__search">
            <Search size={14} aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a page" aria-label="Find a page" />
          </label>

          <ul>
            {rows.map((r) => (
              <li key={r.route}>
                <button className={route === r.route ? 'is-on' : ''} onClick={() => setRoute(r.route)}>
                  <code>{r.route}</code>
                  <span className={`dsx-dos__state is-${r.state}`}>{DOSSIER_STATE_LABEL[r.state]}</span>
                  {r.dossier?.purpose && <em>{r.dossier.purpose}</em>}
                </button>
              </li>
            ))}
            {rows.length === 0 && <li className="dsx-dos__empty">Nothing in this pile.</li>}
          </ul>
        </aside>

        <section className="dsx-dos__detail">
          {!route && <p className="dsx-dos__hint">Pick a page on the left.</p>}

          {route && (
            <>
              <h2><code>{route}</code></h2>

              {/* ── The written half ─────────────────────────────────────────────────────────── */}
              <div className="dsx-dos__authored">
                <label>
                  <span>Purpose — one line</span>
                  <input
                    value={draft.purpose}
                    onChange={(e) => { setDraft((d) => ({ ...d, purpose: e.target.value })); setSaved(false); }}
                    placeholder="The list every job passes through."
                  />
                </label>
                <label>
                  <span>Who opens it, and on what</span>
                  <input
                    value={draft.audience}
                    onChange={(e) => { setDraft((d) => ({ ...d, audience: e.target.value })); setSaved(false); }}
                    placeholder="The crew, on a phone, in the field; the office, on a laptop."
                  />
                </label>
                <label>
                  <span>The comprehensive summary</span>
                  <textarea
                    rows={6}
                    value={draft.summary}
                    onChange={(e) => { setDraft((d) => ({ ...d, summary: e.target.value })); setSaved(false); }}
                    placeholder={'What this page is, what a person is trying to do when they open it, and what '
                      + 'would go wrong if it did not exist.'}
                  />
                </label>
                <div className="dsx-dos__save">
                  <button className="admin-btn admin-btn--primary" onClick={() => void save()} disabled={saving}>
                    <Save size={15} aria-hidden /> {saving ? 'Saving…' : 'Save'}
                  </button>
                  {saved && <span className="dsx-dos__saved">Saved</span>}
                </div>
              </div>

              {/* ── The measured half ────────────────────────────────────────────────────────── */}
              <div className="dsx-dos__derived">
                <h3>
                  Measured
                  <span>
                    {age === null ? 'never' : age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}
                    {dossier?.derivedFrom && <> · {dossier.derivedFrom}</>}
                  </span>
                </h3>

                {!dossier?.elementCount && (
                  <p className="dsx-dos__hint">
                    Nothing measured for this page yet. Run{' '}
                    <code>node --env-file=.env.local scripts/derive-dossiers.mjs --only {route}</code>
                  </p>
                )}

                {!!dossier?.functions.length && (
                  <>
                    <h4>What it does</h4>
                    <ul className="dsx-dos__fns">
                      {dossier.functions.map((fn) => (
                        <li key={fn.id}>
                          <strong>{fn.label}</strong> <span>{fn.detail}</span>
                          {fn.evidence.length > 0 && <code>{fn.evidence.join(' · ')}</code>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {!!dossier?.elements.length && (
                  <>
                    <h4>Every element ({dossier.elements.length})</h4>
                    <table className="dsx-dos__els">
                      <thead>
                        <tr><th>Element</th><th>What it is for</th><th /></tr>
                      </thead>
                      <tbody>
                        {dossier.elements.map((el) => (
                          <tr key={el.selector} className={el.required ? 'is-required' : ''}>
                            <td>
                              <code>{el.selector}</code>
                              <strong>{el.label}</strong>
                              {el.count > 1 && <em>×{el.count}</em>}
                            </td>
                            <td>{el.purpose}</td>
                            <td>
                              {el.required && <span className="dsx-dos__req">must have</span>}
                              {!el.catalogId && <span className="dsx-dos__gap" title="No palette entry matches this element">not in the palette</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {!!dossier?.endpoints.length && (
                  <>
                    <h4>What it calls</h4>
                    <ul className="dsx-dos__eps">
                      {dossier.endpoints.map((ep) => (
                        <li key={`${ep.method} ${ep.path}`}>
                          <code className={ep.method === 'GET' ? '' : 'is-write'}>{ep.method}</code> {ep.path}
                          {ep.count > 1 && <em>×{ep.count}</em>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <p className="dsx-dos__refresh">
                  <RefreshCw size={12} aria-hidden /> Re-measure:{' '}
                  <code>node --env-file=.env.local scripts/derive-dossiers.mjs --only {route}</code>
                  {' '}— it replaces this half and regenerates the checklist, and never touches what
                  you wrote above.
                </p>
              </div>

              {/* ── What the checklist became ────────────────────────────────────────────────── */}
              {!!detail?.rows.length && (
                <div className="dsx-dos__checklist">
                  <h3>Checklist generated from this ({detail.rows.length} items)</h3>
                  <ul>
                    {detail.rows.map((r) => (
                      <li key={r.id} className={`is-${r.tier}`}>
                        <span className="dsx-dos__tier">{r.tier}</span>
                        {r.label}
                        {!r.generated && <em>yours</em>}
                      </li>
                    ))}
                  </ul>
                  <p className="dsx-dos__hint">
                    Ticking happens per design, in the editor — three versions of this page are at
                    three different points.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
