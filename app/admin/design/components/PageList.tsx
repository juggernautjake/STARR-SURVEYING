'use client';
// app/admin/design/components/PageList.tsx — the walkthrough: every page, and how far it has got.
//
// Phase C of docs/planning/completed/DESIGN_STUDIO_QUALITY_2026-08-23.md.
//
// Owner: *"I want the page list to be very well organized, formatted and made available to me
// quickly with a drop down menu or something."*
//
// ── WHAT MAKES A LIST OF 270 THINGS USABLE ──────────────────────────────────────────────────────
//
// Not a scroll. Three things, in this order:
//
//   1. **Grouped by area**, collapsed by default except the one being worked on. 176 admin pages
//      and 35 D&D pages are not the same job and should not be the same list.
//   2. **Filtered to what is left.** The default view is "not done", because the question this
//      screen answers is "what is next", not "what exists".
//   3. **Searchable by route.** Typing `jobs` has to reach `/admin/jobs` in one gesture.
//
// Progress counts SKIPPED out of the denominator rather than as done — of 270 pages a good number
// are redirects or dynamic detail routes covered by designing their list, and a bar that can never
// reach 100% is a bar people stop reading.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Search, Circle, CircleDot, CheckCircle2, MinusCircle, ExternalLink } from 'lucide-react';
import {
  groupByArea, filterPages, progressOf, STATUS_LABELS, GAP_LABEL, GAP_MEANING,
  type PageRow, type ReviewStatus, type PageArea, type PageGap,
} from '@/lib/design/pages';

// ── THE LIST DOUBLES AS THE WORK QUEUE (N3) ─────────────────────────────────────────────────────
//
// Four things a page can be missing, and each is a different job with a different tool: tracing a
// default, deriving a dossier, choosing a design of record, designing anything at all. Filtering to
// one of them turns 270 rows into the list of pages that need that specific thing done — which is
// the only way a list this long is worked THROUGH rather than scrolled.
const GAP_FILTERS: PageGap[] = ['no-default', 'no-dossier', 'no-design', 'no-active'];

const STATUS_ICON: Record<ReviewStatus, typeof Circle> = {
  not_started: Circle,
  in_progress: CircleDot,
  done: CheckCircle2,
  skipped: MinusCircle,
};

/** Clicking the status cycles it. Four states, one control — a dropdown per row for 270 rows would
 *  be 270 dropdowns, and the whole point is that ticking a page off is one click. */
const NEXT_STATUS: Record<ReviewStatus, ReviewStatus> = {
  not_started: 'in_progress',
  in_progress: 'done',
  done: 'skipped',
  skipped: 'not_started',
};

interface Props {
  /** Called when a design should be created for a route with none. */
  onCreateFor: (route: string) => void;
}

export default function PageList({ onCreateFor }: Props) {
  const [pages, setPages] = useState<PageRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [hideDone, setHideDone] = useState(true);
  const [openAreas, setOpenAreas] = useState<Set<PageArea>>(new Set(['admin']));
  const [gapFilter, setGapFilter] = useState<PageGap | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/design/pages')
      .then((r) => r.json())
      .then((body) => setPages(body.pages ?? []))
      .catch(() => setPages([]));
  }, []);

  const progress = useMemo(() => (pages ? progressOf(pages) : null), [pages]);

  const visible = useMemo(() => {
    if (!pages) return [];
    let filtered = filterPages(pages, query);
    // The gap filter is not overridden by a search: "find me the pages with no default, called
    // jobs" is a real question, and the two narrow the same list rather than competing for it.
    if (gapFilter) filtered = filtered.filter((p) => p.gaps.includes(gapFilter));
    // A search means "find me this page", so it overrides the hide-done filter — otherwise
    // searching for a page you finished yesterday returns nothing and looks broken.
    if (!hideDone || query.trim()) return filtered;
    return filtered.filter((p) => p.status !== 'done' && p.status !== 'skipped');
  }, [pages, query, hideDone, gapFilter]);

  /** How many pages are missing each thing. The number is the point: it says which job is the big
   *  one, and it is counted over EVERY page rather than over what is currently shown, so choosing a
   *  filter cannot change the counts underneath it. */
  const gapCounts = useMemo(() => {
    const out = {} as Record<PageGap, number>;
    for (const gap of GAP_FILTERS) out[gap] = 0;
    for (const page of pages ?? []) for (const gap of page.gaps) out[gap] = (out[gap] ?? 0) + 1;
    return out;
  }, [pages]);

  const groups = useMemo(() => groupByArea(visible), [visible]);

  async function update(route: string, patch: { status?: ReviewStatus; note?: string }) {
    setBusy(route);
    // Optimistic: the whole point is that ticking a page off feels like ticking a box.
    setPages((current) => current?.map((p) => (p.route === route ? { ...p, ...patch } : p)) ?? null);
    await fetch('/api/admin/design/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route, ...patch }),
    }).catch(() => {});
    setBusy(null);
  }

  if (!pages) return <p className="dsx-pages__loading">Reading the page list…</p>;

  return (
    <section className="dsx-pages">
      <header className="dsx-pages__head">
        <div>
          <h2>Every page</h2>
          {progress && (
            <p className="dsx-pages__progress-text">
              <strong>{progress.done}</strong> of {progress.total - progress.skipped} done
              {progress.inProgress > 0 && <> · {progress.inProgress} in progress</>}
              {progress.skipped > 0 && <> · {progress.skipped} skipped</>}
            </p>
          )}
        </div>
        {progress && (
          <div className="dsx-pages__bar" role="img" aria-label={`${progress.percent}% complete`}>
            <span style={{ width: `${progress.percent}%` }} />
            <em>{progress.percent}%</em>
          </div>
        )}
      </header>

      <div className="dsx-pages__controls">
        <label className="dsx-pages__search">
          <Search size={14} aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a page — /admin/jobs, invoices, login…"
            aria-label="Search pages"
          />
        </label>
        <label className="dsx-pages__toggle">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          <span>Only what is left</span>
        </label>
      </div>

      {/* ── What is missing, as a filter (N3) ─────────────────────────────────────────────────── */}
      <div className="dsx-pages__gaps">
        <button
          className={gapFilter === null ? 'is-on' : ''}
          onClick={() => setGapFilter(null)}
          title="Every page, whatever it is missing"
        >
          Everything
        </button>
        {GAP_FILTERS.map((gap) => (
          <button
            key={gap}
            className={gapFilter === gap ? 'is-on' : ''}
            onClick={() => setGapFilter(gapFilter === gap ? null : gap)}
            title={GAP_MEANING[gap]}
          >
            {GAP_LABEL[gap]}
            <span>{gapCounts[gap] ?? 0}</span>
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <p className="dsx-pages__empty">
          {query.trim() ? `Nothing matches “${query}”.` : 'Every page is done or skipped. '}
        </p>
      )}

      {groups.map((group) => {
        const isOpen = openAreas.has(group.area) || !!query.trim();
        const Chevron = isOpen ? ChevronDown : ChevronRight;
        return (
          <div key={group.area} className="dsx-pages__group">
            <button
              className="dsx-pages__group-head"
              onClick={() => setOpenAreas((s) => {
                const next = new Set(s);
                if (next.has(group.area)) next.delete(group.area); else next.add(group.area);
                return next;
              })}
              aria-expanded={isOpen}
            >
              <Chevron size={15} aria-hidden />
              <span className="dsx-pages__group-name">{group.label}</span>
              <span className="dsx-pages__group-count">{group.rows.length}</span>
            </button>

            {isOpen && (
              <ul className="dsx-pages__list">
                {group.rows.map((page) => {
                  const Icon = STATUS_ICON[page.status];
                  return (
                    <li key={page.route} className={`dsx-pages__row is-${page.status}`}>
                      <button
                        className="dsx-pages__status"
                        onClick={() => update(page.route, { status: NEXT_STATUS[page.status] })}
                        disabled={busy === page.route}
                        title={`${STATUS_LABELS[page.status]} — click for ${STATUS_LABELS[NEXT_STATUS[page.status]].toLowerCase()}`}
                        aria-label={`${page.route}: ${STATUS_LABELS[page.status]}`}
                      >
                        <Icon size={16} aria-hidden />
                      </button>

                      {/* The route text alone. A "dynamic" chip used to sit after it and escaped
                        * the phone viewport by 27px — and it was saying twice what `[id]` in the
                        * route already says. The tooltip carries the explanation instead. */}
                      <code
                        className="dsx-pages__route"
                        title={page.dynamic ? `${page.route} — one page serving many records` : page.route}
                      >
                        {page.route}
                      </code>

                      {/* ── WHAT EXISTS FOR THIS PAGE ──────────────────────────────────────────
                        * Owner: *"I will need it so that we have all of the pages listed out and so
                        * that we can click them and be taken to the editor to change them and save
                        * the changes, or just make up a whole new version of the page."*
                        *
                        * Four facts, in the order they are wanted: what the page IS today (the
                        * default trace), what it is SUPPOSED to be (the active design), and how much
                        * other work exists. The plural kinds are counted rather than listed — nine
                        * links would push the route off the row, and the count is the useful part. */}
                      <div className="dsx-pages__actions">
                        {page.lifecycle.default && (
                          <Link
                            className="dsx-pages__chip dsx-pages__chip--default"
                            href={`/admin/design/${page.lifecycle.default.id}`}
                            title="The page as it is actually served — read-only. Clone it to make a version."
                          >
                            Default
                          </Link>
                        )}
                        {page.lifecycle.active && (
                          <Link
                            className="dsx-pages__chip dsx-pages__chip--active"
                            href={`/admin/design/${page.lifecycle.active.id}`}
                            title={`Active: ${page.lifecycle.active.name}`}
                          >
                            Active
                          </Link>
                        )}
                        {page.lifecycle.alternatives > 0 && (
                          <span className="dsx-pages__chip dsx-pages__chip--alt" title="Finished designs that are not the current record">
                            {page.lifecycle.alternatives} alt
                          </span>
                        )}
                        {page.lifecycle.drafts > 0 && (
                          <span className="dsx-pages__chip dsx-pages__chip--draft" title="Still being built">
                            {page.lifecycle.drafts} draft
                          </span>
                        )}
                        {/* What the page IS, not what has been designed for it. A route with a
                          * purpose written against it reads very differently from one nobody has
                          * described, and that difference is what the dossier queue is made of. */}
                        <Link
                          className={`dsx-pages__chip dsx-pages__chip--dossier is-${page.dossier?.state ?? 'none'}`}
                          href={`/admin/design/dossiers?route=${encodeURIComponent(page.route)}`}
                          title={page.dossier?.purpose
                            ? `${page.dossier.purpose} — ${page.dossier.elementCount} elements measured`
                            : 'Nothing is recorded about what this page is for'}
                        >
                          {page.dossier?.state === 'complete' ? 'Dossier'
                            : page.dossier?.elementCount ? 'Needs a sentence' : 'No dossier'}
                        </Link>
                        {page.designs.length === 0 && (
                          <button className="dsx-pages__create" onClick={() => onCreateFor(page.route)}>
                            Design it
                          </button>
                        )}
                        {/* Only when something IS active: "see it as a page" pointing at nothing is
                          * a link that teaches people the feature is broken. */}
                        {page.lifecycle.active && (
                          <Link
                            className="dsx-pages__chip dsx-pages__chip--serve"
                            href={`/admin/design/serve?route=${encodeURIComponent(page.route)}`}
                            title="See the design of record at real size, as a page"
                          >
                            As a page
                          </Link>
                        )}
                        <button
                          className="dsx-pages__note-btn"
                          onClick={() => setEditingNote(editingNote === page.route ? null : page.route)}
                          title="What is on this page and what it is for"
                        >
                          {page.note ? '📝' : '＋'}
                        </button>
                        {!page.dynamic && (
                          <a className="dsx-pages__open" href={page.route} target="_blank" rel="noreferrer" title="Open the real page">
                            <ExternalLink size={13} aria-hidden />
                          </a>
                        )}
                      </div>

                      {editingNote === page.route && (
                        <textarea
                          className="dsx-pages__note"
                          autoFocus
                          defaultValue={page.note ?? ''}
                          placeholder="What is on this page, who opens it, and what they are trying to do."
                          onBlur={(e) => { update(page.route, { note: e.target.value }); setEditingNote(null); }}
                        />
                      )}
                      {page.note && editingNote !== page.route && (
                        <p className="dsx-pages__note-text">{page.note}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
