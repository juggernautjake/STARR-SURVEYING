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
import { useAdminNavStore } from '@/lib/admin/nav-store';
import type { UserRole } from '@/lib/auth';

import '../../styles/AdminCommandPalette.css';

// The four initial commands from §8 Phase 1. Surface as registry-shaped
// entries so the same ranker scores them.
const ACTIONS: AdminRoute[] = [
  { href: '/admin/jobs/new',       label: 'New job',           workspace: 'work',         iconName: 'FilePlus',      description: 'Create a new job.',                keywords: ['create', 'add', 'start'],            isAction: true, roles: ['admin'], internalOnly: true },
  { href: '/admin/receipts',       label: 'Approve receipts',  workspace: 'office',       iconName: 'CheckSquare',   description: 'Review pending expense receipts.', keywords: ['expenses', 'approval', 'queue'],     isAction: true, roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
  { href: '/admin/cad',            label: 'Run AI Drawing Engine', workspace: 'research-cad', iconName: 'Sparkles',  description: 'Open the CAD editor + start the AI engine.', keywords: ['ai', 'engine', 'auto', 'draw'], isAction: true, roles: ['admin', 'developer', 'researcher', 'drawer', 'field_crew', 'tech_support'], internalOnly: true },
  { href: '/admin/my-hours',       label: 'Clock in / out',    workspace: 'hub',          iconName: 'Clock',         description: 'Open your timesheet to clock in or out.', keywords: ['clock', 'time', 'shift'],   isAction: true, roles: ['admin', 'developer', 'field_crew', 'tech_support'], internalOnly: true },
];

interface PaletteRow {
  section: 'Recent' | 'Pages' | 'Actions';
  route: AdminRoute;
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
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const roles: UserRole[] = useMemo(
    () => (session?.user?.roles ?? (session?.user?.role ? [session.user.role] : [])) as UserRole[],
    [session?.user?.roles, session?.user?.role],
  );
  const isCompanyUser = useMemo(
    () => !!session?.user?.email?.toLowerCase().endsWith('@starr-surveying.com'),
    [session?.user?.email],
  );

  const visiblePages = useMemo(
    () => accessibleRoutes({ roles, isCompanyUser }),
    [roles, isCompanyUser],
  );

  const visibleActions = useMemo(() => {
    return ACTIONS.filter((a) => {
      if (a.internalOnly && !isCompanyUser) return false;
      if (roles.includes('admin')) return true;
      return !a.roles || a.roles.some((r) => roles.includes(r));
    });
  }, [roles, isCompanyUser]);

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
    const ranked = rankRoutes([...visiblePages, ...visibleActions], q);
    const pageRows: PaletteRow[] = [];
    const actionRows: PaletteRow[] = [];
    for (const route of ranked) {
      if (route.isAction) actionRows.push({ section: 'Actions', route });
      else pageRows.push({ section: 'Pages', route });
    }
    return [...pageRows, ...actionRows];
  }, [query, recentRoutes, visiblePages, visibleActions]);

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
            placeholder="Search for a page or action…"
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
              No matches. Try typing a page name, a keyword, or an action.
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
        <div className="cmdk-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
