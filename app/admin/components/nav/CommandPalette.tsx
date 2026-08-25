'use client';
// app/admin/components/nav/CommandPalette.tsx
//
// The global Cmd+K palette (§5.1 Surface 3). Phase 1 slice 1b — opens
// from anywhere in the admin shell, fuzzy-searches the route registry,
// shows recents when the query is empty, and routes on Enter / click.
// Actions (Clock in, Run AI engine, New job, Approve receipts) are
// shipped as named-shortcut deep-links for now; Phase 6 swaps the
// nav-style actions for event dispatchers + ranking by recent use.
//
// The palette is purely a consumer of `route-registry.ts` and
// `nav-store.ts`. No new routing or session logic.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

import {
  ADMIN_ROUTES,
  accessibleRoutes,
  findRoute,
  rankRoutes,
  type AdminRoute,
} from '@/lib/admin/route-registry';
// T2. §11 of PAGE_CONSOLIDATION: which pages this FIRM uses, a different question from "may
// you" and answered in `accessibleRoutes` so all four nav surfaces cannot disagree.
import { useFeatureToggles } from '@/lib/admin/use-feature-toggles';
import { useAdminNavStore } from '@/lib/admin/nav-store';
import type { UserRole } from '@/lib/auth-roles';
import { isInternalUser } from '@/lib/saas/internal-user';

import '../../styles/AdminCommandPalette.css';

// The four initial commands from §8 Phase 1. Surface as registry-shaped
// entries so the same ranker scores them.
const ACTIONS: AdminRoute[] = [
  { href: '/admin/jobs/new',       label: 'New job',           workspace: 'work',         iconName: 'FilePlus',      description: 'Create a new job.',                keywords: ['create', 'add', 'start'],            isAction: true, roles: ['admin'], internalOnly: true },
  { href: '/admin/receipts',       label: 'Approve receipts',  workspace: 'office',       iconName: 'CheckSquare',   description: 'Review pending expense receipts.', keywords: ['expenses', 'approval', 'queue'],     isAction: true, roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
  // Slice W4 — CAD action open to every signed-in user (no
  // `roles:` gate). Restore the role list when permissions
  // (W7) lands.
  { href: '/admin/cad',            label: 'Run AI Drawing Engine', workspace: 'research-cad', iconName: 'Sparkles',  description: 'Open the CAD editor + start the AI engine.', keywords: ['ai', 'engine', 'auto', 'draw'], isAction: true, internalOnly: true },
  { href: '/admin/research?new=1', label: 'Start research',    workspace: 'research-cad', iconName: 'Microscope',    description: 'Create a new AI property research project.', keywords: ['research', 'new', 'create', 'start', 'property', 'recon', 'analyze'], isAction: true, roles: ['admin', 'developer', 'researcher', 'drawer', 'field_crew', 'tech_support'], internalOnly: true },
  // FIXED 2026-08-06 — was `/admin/me?tab=hours`. ⌘K's most-used action opened the Hub instead of
  // the timesheet, so "Clock in / out" could not clock you in or out.
  { href: '/admin/hours?tab=my-time',       label: 'Clock in / out',    workspace: 'hub',          iconName: 'Clock',         description: 'Open your timesheet to clock in or out.', keywords: ['clock', 'time', 'shift'],   isAction: true, roles: ['admin', 'developer', 'field_crew', 'tech_support'], internalOnly: true },
];

interface PaletteRow {
  section: 'Recent' | 'Pages' | 'Actions' | 'Records';
  route: AdminRoute;
}

/** Platform audit §4: *"Only knows routes. Add actions … and records (job #, person, equipment)."*
 *
 *  Actions arrived with the palette. Records arrive here, and they are NOT a second search: the
 *  request goes to `/api/admin/search`, the same ranked, permission-filtered, typo-tolerant backbone
 *  the §3b search page uses. A palette with its own matching rules would answer differently from the
 *  page it links to, and the first time those disagree the palette is the one nobody trusts again.
 *
 *  A record hit is shaped into the registry's row type so the ranking, keyboard nav and rendering
 *  below stay one code path. That is a deliberate re-use of a data shape, not a claim that a job is
 *  a route. */
const RECORD_LIMIT = 5;
const RECORD_DEBOUNCE_MS = 220;

interface SearchHit {
  corpus: string;
  corpusLabel: string;
  title: string;
  snippet: string;
  href: string | null;
}

function hitToRoute(hit: SearchHit): AdminRoute | null {
  // A corpus with no viewer page (customers today) returns a null href. The full search page renders
  // those with their details in the snippet; the palette cannot, because every row here navigates.
  // Dropping them beats rendering a 404 dressed as a result.
  if (!hit.href) return null;
  return {
    href: hit.href,
    label: hit.title,
    workspace: 'hub',
    iconName: 'Search',
    description: hit.snippet ? `${hit.corpusLabel} · ${hit.snippet.slice(0, 90)}` : hit.corpusLabel,
  };
}

const EMPTY_QUERY_PAGE_LIMIT = 8;
const EMPTY_QUERY_RECENT_LIMIT = 6;

export default function CommandPalette() {
  const { data: session } = useSession();
  const router = useRouter();
  const open = useAdminNavStore((s) => s.paletteOpen);
  const close = useAdminNavStore((s) => s.closePalette);
  const recentRoutes = useAdminNavStore((s) => s.recentRoutes);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [recordHits, setRecordHits] = useState<SearchHit[]>([]);
  const [recordsState, setRecordsState] = useState<'idle' | 'loading' | 'ok' | 'failed'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const roles: UserRole[] = useMemo(
    () => (session?.user?.roles ?? (session?.user?.role ? [session.user.role] : [])) as UserRole[],
    [session?.user?.roles, session?.user?.role],
  );
  // Staff, from the session's own answer rather than an email suffix (audit item 8h).
  const isCompanyUser = useMemo(() => isInternalUser(session), [session]);
  const toggles = useFeatureToggles();

  const visiblePages = useMemo(
    () => accessibleRoutes({ roles, isCompanyUser, toggles }),
    [roles, isCompanyUser, toggles],
  );

  const visibleActions = useMemo(() => {
    return ACTIONS.filter((a) => {
      if (a.internalOnly && !isCompanyUser) return false;
      if (roles.includes('admin')) return true;
      return !a.roles || a.roles.some((r) => roles.includes(r));
    });
  }, [roles, isCompanyUser, toggles]);

  // Records, from the search backbone. Debounced, and cancelled on every keystroke: the palette is
  // typed into fast, and an un-cancelled response arriving late would repaint the list under
  // somebody's cursor with results for a prefix they have already moved past.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setRecordHits([]); setRecordsState('idle'); return; }
    let cancelled = false;
    setRecordsState('loading');
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}&limit=${RECORD_LIMIT}`);
        if (!res.ok) { if (!cancelled) setRecordsState('failed'); return; }
        const d = (await res.json()) as { results?: SearchHit[] };
        if (cancelled) return;
        setRecordHits(d.results ?? []);
        setRecordsState('ok');
      } catch {
        if (!cancelled) setRecordsState('failed');
      }
    }, RECORD_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const rows: PaletteRow[] = useMemo(() => {
    const q = query.trim();
    if (!q) {
      const recentRows: PaletteRow[] = recentRoutes
        .slice(0, EMPTY_QUERY_RECENT_LIMIT)
        .map((href) => findRoute(href))
        .filter((r): r is AdminRoute => !!r)
        .map((route) => ({ section: 'Recent', route }));
      const pageRows: PaletteRow[] = visiblePages
        .slice(0, EMPTY_QUERY_PAGE_LIMIT)
        .map((route) => ({ section: 'Pages', route }));
      const actionRows: PaletteRow[] = visibleActions.map((route) => ({ section: 'Actions', route }));
      return [...recentRows, ...pageRows, ...actionRows];
    }
    const ranked = rankRoutes([...visiblePages, ...visibleActions], q, { recentRoutes });
    const pageRows: PaletteRow[] = [];
    const actionRows: PaletteRow[] = [];
    for (const route of ranked) {
      if (route.isAction) actionRows.push({ section: 'Actions', route });
      else pageRows.push({ section: 'Pages', route });
    }
    // Records last. A page match is what somebody typing two letters into a launcher almost always
    // wants; a record match is what they want when the page list is empty, and it should not push
    // "Jobs" below a job.
    const recordRows: PaletteRow[] = recordHits
      .map(hitToRoute)
      .filter((r): r is AdminRoute => !!r)
      .map((route) => ({ section: 'Records' as const, route }));
    // Always offered once records could exist, whether any came back or not: the palette shows five,
    // and "nothing here" from a launcher should not read as "nothing anywhere".
    const seeAll: PaletteRow[] = q.length >= 2
      ? [{
          section: 'Records',
          route: {
            href: `/admin/search?q=${encodeURIComponent(q)}`,
            label: `Search everything for “${q}”`,
            workspace: 'hub',
            iconName: 'Search',
            description: 'Documents, jobs, customers, contacts, leads and invoices — with filters.',
          },
        }]
      : [];
    return [...pageRows, ...actionRows, ...recordRows, ...seeAll];
  }, [query, recentRoutes, visiblePages, visibleActions, recordHits]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      // Defer focus so the modal exists in the DOM before we focus.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keep the selected row scrolled into view on arrow-nav.
  useEffect(() => {
    if (!resultsRef.current) return;
    const el = resultsRef.current.querySelector<HTMLButtonElement>(`[data-cmdk-idx="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  function activate(row: PaletteRow) {
    router.push(row.route.href);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => (rows.length === 0 ? 0 : Math.min(s + 1, rows.length - 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[selected];
      if (row) activate(row);
    }
  }

  // Group rows by section for rendering — preserving the order rows
  // were assembled in above so keyboard nav indices stay aligned.
  const sections: { name: PaletteRow['section']; items: { row: PaletteRow; flatIndex: number }[] }[] = [];
  let currentName: PaletteRow['section'] | null = null;
  rows.forEach((row, idx) => {
    if (row.section !== currentName) {
      sections.push({ name: row.section, items: [] });
      currentName = row.section;
    }
    sections[sections.length - 1].items.push({ row, flatIndex: idx });
  });

  return (
    <div
      className="cmdk-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={close}
      onKeyDown={onKeyDown}
    >
      <div
        className="cmdk-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmdk-search">
          <span className="cmdk-search__icon" aria-hidden="true">⌘K</span>
          <input
            ref={inputRef}
            className="cmdk-search__input"
            type="text"
            placeholder="Search pages, actions, jobs, customers, documents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Command palette search"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="cmdk-search__hint">Esc</kbd>
        </div>
        <div ref={resultsRef} className="cmdk-results" role="listbox">
          {rows.length === 0 ? (
            <div className="cmdk-empty">
              No matches. Try a page name, an action, or a job number.
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.name} className="cmdk-section">
                <div className="cmdk-section__label">{section.name}</div>
                {section.items.map(({ row, flatIndex }) => {
                  const isSelected = flatIndex === selected;
                  return (
                    <button
                      key={`${section.name}-${row.route.href}`}
                      type="button"
                      data-cmdk-idx={flatIndex}
                      className={`cmdk-row${isSelected ? ' cmdk-row--selected' : ''}`}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setSelected(flatIndex)}
                      onClick={() => activate(row)}
                    >
                      <span className="cmdk-row__label">{row.route.label}</span>
                      <span className="cmdk-row__meta">{row.route.description ?? row.route.href}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        {recordsState === 'failed' ? (
          <div className="cmdk-note">Pages and actions only — the record search could not be reached.</div>
        ) : recordsState === 'loading' ? (
          <div className="cmdk-note">Looking through records…</div>
        ) : null}
        <div className="cmdk-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
