'use client';
// app/admin/design/components/DossierPanel.tsx — what this page is for, and what is still missing.
//
// Phases C5 + D of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"I want that information available in the editor so that I can see what elements need to
// be on the page… As I build the page I can check the elements off and see what is left."*
//
// ── WHY IT LIVES IN THE EDITOR AND NOT ON ITS OWN SCREEN ────────────────────────────────────────
//
// The moment the checklist matters is the moment you are placing things. A checklist on another
// screen is one you consult twice: once at the start, when you have not built anything, and once at
// the end, when changing it is expensive. In here it is read the way it is meant to be — glance,
// place the thing, tick it.
//
// ── THE TWO NUMBERS ─────────────────────────────────────────────────────────────────────────────
//
// "12 of 18" hides the only question worth asking. A design with every optional flourish and no
// data table is not two thirds finished; it has not started. So the must-haves get their own
// counter and their own bar, and the total is the quieter number beside it.
//
// ── AND WHY DETECTION DOES NOT TICK THE BOX ─────────────────────────────────────────────────────
//
// The panel can see that the canvas already holds the element an item asks for, and it says so —
// but the box stays for a person. A checklist that ticks itself is one nobody trusts the first time
// it is confidently wrong, and every other tick becomes suspect with it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare, Square, Plus, Trash2, RefreshCw, X, Sparkles } from 'lucide-react';
import { TIER_LABEL, TIER_MEANING, progressOf, type ChecklistRow, type ChecklistTier } from '@/lib/design/checklist';
import { derivedAgeDays, type PageDossier } from '@/lib/design/dossier';

interface Props {
  designId: string;
  route: string | null;
  onClose: () => void;
  /** Told when the counts change, so the footer button can show them without a second fetch. */
  onProgress?: (summary: { requiredDone: number; requiredTotal: number; done: number; total: number }) => void;
}

interface Payload {
  route: string | null;
  dossier: PageDossier | null;
  rows: ChecklistRow[];
  note?: string;
}

const TIERS: ChecklistTier[] = ['required', 'recommended', 'custom'];

export default function DossierPanel({ designId, route, onClose, onProgress }: Props) {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'checklist' | 'about'>('checklist');
  // Held in a ref so a parent that re-creates the callback every render cannot re-fire the effect.
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/design/checklist?design=${encodeURIComponent(designId)}`, { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (!res.ok) { setError(body?.error ?? 'Could not read the checklist.'); return; }
    setData(body as Payload);
  }, [designId]);

  useEffect(() => { void load(); }, [load]);

  const rows = data?.rows ?? [];
  const progress = useMemo(() => progressOf(rows), [rows]);

  // ── THE DEPENDENCIES ARE FOUR NUMBERS, NOT THE PROGRESS OBJECT ──────────────────────────────
  //
  // Caught in a browser pass, as "Maximum update depth exceeded". `progressOf` returns a NEW object
  // every render, so depending on it meant: effect fires → parent setState → re-render → new object
  // → effect fires. `onProgress` is a parent callback and is not stable either, so it cannot be a
  // dependency here. Four primitives are stable by value, which is what makes the loop impossible
  // rather than merely unlikely.
  const { done: requiredDone, total: requiredTotal } = progress.required;
  const { done: allDone, total: allTotal } = progress.all;
  useEffect(() => {
    onProgressRef.current?.({ requiredDone, requiredTotal, done: allDone, total: allTotal });
  }, [requiredDone, requiredTotal, allDone, allTotal]);

  async function toggle(row: ChecklistRow) {
    setBusy(row.id);
    // Optimistic. Ticking a box has to feel like ticking a box, and there are forty of them.
    setData((d) => (d ? { ...d, rows: d.rows.map((r) => (r.id === row.id ? { ...r, checked: !r.checked } : r)) } : d));
    await fetch('/api/admin/design/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ designId, itemId: row.id, checked: !row.checked }),
    }).catch(() => {});
    setBusy(null);
  }

  async function addItem() {
    const label = newLabel.trim();
    if (!label || !data?.route) return;
    setBusy('new');
    const res = await fetch('/api/admin/design/checklist', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route: data.route, label }),
    });
    setBusy(null);
    if (res.ok) { setNewLabel(''); setAdding(false); await load(); }
    else setError((await res.json().catch(() => null))?.error ?? 'Could not add that.');
  }

  async function removeItem(row: ChecklistRow) {
    setBusy(row.id);
    const res = await fetch(`/api/admin/design/checklist?item=${encodeURIComponent(row.id)}`, { method: 'DELETE' });
    setBusy(null);
    if (res.ok) await load();
    else setError((await res.json().catch(() => null))?.error ?? 'Could not remove that.');
  }

  const dossier = data?.dossier ?? null;
  const age = derivedAgeDays(dossier?.derivedAt, new Date());

  return (
    <section className="dsx__dossier" aria-label="Page checklist">
      <header className="dsx__dossier-head">
        <div className="dsx__dossier-title">
          <strong>{route ?? 'No page set'}</strong>
          {dossier?.purpose && <span className="dsx__dossier-purpose">{dossier.purpose}</span>}
        </div>

        <div className="dsx__dossier-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'checklist'} className={tab === 'checklist' ? 'is-on' : ''} onClick={() => setTab('checklist')}>
            Checklist
          </button>
          <button role="tab" aria-selected={tab === 'about'} className={tab === 'about' ? 'is-on' : ''} onClick={() => setTab('about')}>
            What this page is
          </button>
        </div>

        <button className="dsx__tool" onClick={onClose} aria-label="Close"><X size={14} aria-hidden /></button>
      </header>

      {error && <p className="dsx__dossier-error" role="alert">{error}</p>}
      {data?.note && <p className="dsx__dossier-note">{data.note}</p>}

      {!data && <p className="dsx__dossier-note">Reading the checklist…</p>}

      {data && data.route && rows.length === 0 && (
        <p className="dsx__dossier-note">
          No checklist for this page yet. It is generated from the page’s dossier — run{' '}
          <code>node --env-file=.env.local scripts/derive-dossiers.mjs --only {data.route}</code> to
          measure what is on the real page, and the required and recommended items appear here.
        </p>
      )}

      {tab === 'checklist' && rows.length > 0 && (
        <>
          {/* ── Progress: the floor first ────────────────────────────────────────────────────── */}
          <div className="dsx__dossier-progress">
            <div className={`dsx__dossier-bar${progress.floorMet ? ' is-met' : ''}`}>
              <span style={{ width: `${progress.required.total ? (progress.required.done / progress.required.total) * 100 : 0}%` }} />
            </div>
            <p>
              <strong>{progress.required.done} of {progress.required.total}</strong> must-haves
              {progress.floorMet && <em className="dsx__dossier-met"> — floor met</em>}
              <span> · {progress.all.done}/{progress.all.total} in all</span>
            </p>
            {progress.detectedUnticked > 0 && (
              <p className="dsx__dossier-hint">
                <Sparkles size={13} aria-hidden /> {progress.detectedUnticked} item
                {progress.detectedUnticked === 1 ? ' is' : 's are'} already on the canvas but not ticked.
              </p>
            )}
          </div>

          {TIERS.map((tier) => {
            const inTier = rows.filter((r) => r.tier === tier);
            if (!inTier.length && tier !== 'custom') return null;
            return (
              <div key={tier} className={`dsx__dossier-tier dsx__dossier-tier--${tier}`}>
                <h4>
                  {TIER_LABEL[tier]}
                  <span>{inTier.filter((r) => r.checked).length}/{inTier.length}</span>
                </h4>
                <p className="dsx__dossier-tier-meaning">{TIER_MEANING[tier]}</p>

                <ul className="dsx__dossier-list">
                  {inTier.map((row) => (
                    <li key={row.id} className={`dsx__dossier-item${row.checked ? ' is-checked' : ''}`}>
                      <button
                        className="dsx__dossier-check"
                        onClick={() => void toggle(row)}
                        disabled={busy === row.id}
                        aria-pressed={row.checked}
                      >
                        {row.checked ? <CheckSquare size={16} aria-hidden /> : <Square size={16} aria-hidden />}
                      </button>
                      <div className="dsx__dossier-item-body">
                        <span className="dsx__dossier-label">{row.label}</span>
                        {row.detail && <span className="dsx__dossier-detail">{row.detail}</span>}
                        <span className="dsx__dossier-meta">
                          {row.generated
                            ? <em title="Generated from the real page">measured</em>
                            : <em title={`Added by ${row.createdBy ?? 'someone'}`}>yours</em>}
                          {row.detected && !row.checked && (
                            <em className="is-detected" title="Something matching this is already on the canvas">
                              on the canvas
                            </em>
                          )}
                          {row.checked && row.elementRef && !row.detected && (
                            // Ticked, but nothing on the canvas matches. Not an error — an element
                            // can be satisfied by something the matcher cannot see — but worth
                            // saying, because the other explanation is that it was ticked by
                            // mistake and nobody would ever find out.
                            <em className="is-warn" title="Ticked, but nothing on the canvas matches this">
                              nothing matching placed
                            </em>
                          )}
                        </span>
                      </div>
                      {!row.generated && (
                        <button className="dsx__dossier-del" onClick={() => void removeItem(row)} title="Remove this item">
                          <Trash2 size={13} aria-hidden />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>

                {tier === 'custom' && (
                  adding ? (
                    <form className="dsx__dossier-add" onSubmit={(e) => { e.preventDefault(); void addItem(); }}>
                      <input
                        autoFocus value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                        placeholder="Something this page needs that nothing measured"
                        aria-label="New checklist item"
                      />
                      <button className="dsx__tool" type="submit" disabled={!newLabel.trim() || busy === 'new'}>Add</button>
                      <button className="dsx__tool" type="button" onClick={() => setAdding(false)}>Cancel</button>
                    </form>
                  ) : (
                    <button className="dsx__tool dsx__dossier-addbtn" onClick={() => setAdding(true)}>
                      <Plus size={13} aria-hidden /> Add your own
                    </button>
                  )
                )}
              </div>
            );
          })}
        </>
      )}

      {tab === 'about' && (
        <div className="dsx__dossier-about">
          {!dossier && <p className="dsx__dossier-note">Nothing has been recorded about this page yet.</p>}

          {dossier && (
            <>
              {dossier.summary
                ? <p className="dsx__dossier-summary">{dossier.summary}</p>
                : <p className="dsx__dossier-note">
                    No one has written what this page is for yet.{' '}
                    <a href={`/admin/design?tab=dossiers&route=${encodeURIComponent(route ?? '')}`}>Write it</a>.
                  </p>}
              {dossier.audience && <p className="dsx__dossier-aud"><strong>Who opens it:</strong> {dossier.audience}</p>}

              <h4>What it does</h4>
              <ul className="dsx__dossier-fns">
                {dossier.functions.map((fn) => (
                  <li key={fn.id}>
                    <strong>{fn.label}</strong>
                    <span>{fn.detail}</span>
                    {fn.evidence.length > 0 && <code>{fn.evidence.join(' · ')}</code>}
                  </li>
                ))}
                {dossier.functions.length === 0 && <li><span>Nothing measured yet.</span></li>}
              </ul>

              <h4>
                Every element{' '}
                <span className="dsx__dossier-age">
                  {age === null ? 'never measured' : age === 0 ? 'measured today' : `measured ${age} day${age === 1 ? '' : 's'} ago`}
                </span>
              </h4>
              <ul className="dsx__dossier-els">
                {dossier.elements.map((el) => (
                  <li key={el.selector} className={el.required ? 'is-required' : ''}>
                    <code>{el.selector}</code>
                    <strong>{el.label}</strong>
                    <span>{el.purpose}</span>
                    {el.count > 1 && <em>×{el.count}</em>}
                    {/* An element the catalogue cannot draw is a gap in the PALETTE, surfaced where
                      * somebody is about to need it rather than in a report they will not read. */}
                    {!el.catalogId && <em className="is-warn" title="No palette entry matches this">not in the palette</em>}
                  </li>
                ))}
                {dossier.elements.length === 0 && <li><span>Nothing measured yet.</span></li>}
              </ul>

              {dossier.endpoints.length > 0 && (
                <>
                  <h4>What it calls</h4>
                  <ul className="dsx__dossier-eps">
                    {dossier.endpoints.map((ep) => (
                      <li key={`${ep.method} ${ep.path}`}>
                        <code className={ep.method === 'GET' ? '' : 'is-write'}>{ep.method}</code> {ep.path}
                        {ep.count > 1 && <em>×{ep.count}</em>}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <p className="dsx__dossier-refresh">
                <RefreshCw size={12} aria-hidden />{' '}
                Re-measure with{' '}
                <code>node --env-file=.env.local scripts/derive-dossiers.mjs --only {route}</code>
                {' '}— it replaces the measured half and never touches what a person wrote.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
