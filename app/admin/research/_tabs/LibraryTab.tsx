// app/admin/research/_tabs/LibraryTab.tsx — a tab of the Research portal.
//
// C11b / P13 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
// Was `/admin/research/library/page.tsx`; the old route stays and forwards.
// app/admin/research/library/page.tsx — Phase 13 Global Document Library
// Shows ALL research documents across ALL projects for the current user.
// Supports full-text search, type filtering, county filtering, and bulk actions.
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Map, ScrollText, Spline, DraftingCompass, FileText, BookOpen, Inbox,
  Check, Home, type LucideIcon,
} from 'lucide-react';
// E2b — the three data states and the status chip come from the shared primitives now, not from
// this file's own dark Tailwind. `Loader2` went with them: LoadingState owns the spinner.
import { LoadingState, ErrorState, EmptyState, StatPill } from '../components/ui';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LibraryDocument {
  documentId: string;
  projectId: string;
  projectAddress?: string;
  countyName?: string;
  type: 'plat' | 'deed' | 'easement' | 'survey' | 'other';
  instrumentNumber?: string;
  description?: string;
  grantor?: string;
  grantee?: string;
  recordedDate?: string;
  pageCount?: number;
  sizeBytes?: number;
  relevanceScore?: number;
  purchased: boolean;
  purchasedAt?: string;
  purchaseCost?: number;
  usedInAnalysis?: boolean;
  source?: string;
  fileFormat?: string;
}

interface LibraryStats {
  totalDocuments: number;
  totalPurchased: number;
  totalSpent: number;
  byType: Record<string, number>;
  byCounty: Record<string, number>;
}

type DocFilter = 'all' | 'plat' | 'deed' | 'easement' | 'survey' | 'purchased';
type SortBy = 'date_desc' | 'date_asc' | 'relevance' | 'type' | 'county';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DOC_TYPE_ICONS: Record<string, LucideIcon> = {
  plat: Map, deed: ScrollText, easement: Spline, survey: DraftingCompass, other: FileText,
};

function DocTypeIcon({ type, size = 16 }: { type: string; size?: number }) {
  const Icon = DOC_TYPE_ICONS[type] ?? FileText;
  return <Icon size={size} strokeWidth={1.75} className="inline align-text-bottom" aria-hidden="true" />;
}

/**
 * What an empty document list should say.
 *
 * ── TWO EMPTINESSES, ONE MESSAGE ───────────────────────────────────────────────────────────────
 *
 * "No documents" has two causes and they take opposite advice. A filter hiding everything is undone
 * by clearing the filter; a genuinely empty library needs a research run. The dark version gave the
 * second answer to both, so somebody with 900 documents behind an active county filter was told to
 * go and harvest some — confidently, and wrongly.
 *
 * Exported and pure because the alternative is a decision buried in three JSX props, where the only
 * thing a test can check is that the strings are present somewhere in the file. A logic change is
 * invisible to that; here it is one function call.
 */
export function emptyLibraryCopy(filtersNarrowed: boolean): {
  title: string;
  body: string;
  canClear: boolean;
} {
  if (filtersNarrowed) {
    return {
      title: 'No documents match these filters.',
      body: 'Widen or clear the filters to see the rest of the library.',
      canClear: true,
    };
  }
  return {
    title: 'Your document library is empty.',
    body: 'Documents are harvested by a research run. Start one from the Projects tab.',
    canClear: false,
  };
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LibraryTab() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filter, setFilter] = useState<DocFilter>('all');
  const [countyFilter, setCountyFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortBy>('date_desc');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') router.push('/admin/login');
  }, [sessionStatus, router]);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/research/library');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { documents: LibraryDocument[]; stats: LibraryStats };
      setDocuments(data.documents ?? []);
      setStats(data.stats ?? null);
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  // ── Derive county list from documents ─────────────────────────────────────

  const counties = Array.from(
    new Set(documents.map(d => d.countyName).filter(Boolean)),
  ).sort() as string[];

  // ── Filter + Sort + Paginate ───────────────────────────────────────────────

  const filtered = documents
    .filter(doc => {
      if (filter === 'purchased') return doc.purchased;
      if (filter !== 'all') return doc.type === filter;
      return true;
    })
    .filter(doc => countyFilter === 'all' || doc.countyName === countyFilter)
    .filter(doc => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (doc.instrumentNumber ?? '').toLowerCase().includes(q) ||
        (doc.description ?? '').toLowerCase().includes(q) ||
        (doc.grantor ?? '').toLowerCase().includes(q) ||
        (doc.grantee ?? '').toLowerCase().includes(q) ||
        (doc.projectAddress ?? '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date_desc': return (b.recordedDate ?? '').localeCompare(a.recordedDate ?? '');
        case 'date_asc':  return (a.recordedDate ?? '').localeCompare(b.recordedDate ?? '');
        case 'relevance': return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
        case 'type':      return a.type.localeCompare(b.type);
        case 'county':    return (a.countyName ?? '').localeCompare(b.countyName ?? '');
        default: return 0;
      }
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetPage = () => setPage(1);

  /**
   * Is the list empty because a filter hid everything, or because there is nothing to show?
   *
   * Two different states with two different answers, and the dark version conflated them: it told
   * anyone with an empty result to "run a research project to harvest documents" — wrong advice for
   * somebody who has 900 documents sitting behind an active county filter.
   *
   * One binding rather than the condition written out at each of the three places that need it, so
   * the title, the explanation and the action cannot disagree about which state this is.
   */
  const filtersNarrowed = Boolean(search) || filter !== 'all' || countyFilter !== 'all';
  const emptyCopy = emptyLibraryCopy(filtersNarrowed);


  // ── Render ─────────────────────────────────────────────────────────────────
  //
  // ── E2b: THIS TAB USED TO BE A DARK FULL-PAGE LAYOUT INSIDE A LIGHT PORTAL ──────────────────
  //
  // `min-h-screen bg-gray-950`, its own `<header>`, 36 dark Tailwind utilities — left over from
  // when this was `/admin/research/library/page.tsx` and owned the whole viewport. The other five
  // tabs use ZERO dark utilities (counted, not assumed). Inside a tab panel a `min-h-screen` block
  // does not fill the screen; it just pushes the portal's own chrome around a black rectangle.
  //
  // E2 deliberately did NOT fix only the error state here, because a light error banner on a black
  // page is more jarring than the inconsistency it replaced. This is the wholesale pass that entry
  // asked for: the portal's `research-page` shell, the shared primitives for the three data states,
  // and a `research-library__*` block for what is genuinely specific to a document list.

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="research-page">
        <LoadingState label="Loading document library…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="research-page">
        <ErrorState
          title="The document library could not be loaded"
          message={loadError}
          onRetry={loadLibrary}
        />
      </div>
    );
  }

  return (
    <div className="research-page">
      <div className="research-page__header">
        <h1 className="research-page__title">
          <BookOpen size={20} strokeWidth={1.75} aria-hidden="true" /> Document Library
        </h1>
        {stats && (
          <div className="research-page__actions">
            {/* Tone is a named meaning, not a colour. The dark version used `text-green-400` and
                `text-yellow-400` directly, which said nothing to a reader who cannot see them —
                the counts now carry their own words. */}
            <StatPill>{stats.totalDocuments} documents</StatPill>
            <StatPill tone="good">{stats.totalPurchased} purchased</StatPill>
            <StatPill tone="info">${stats.totalSpent.toFixed(2)} spent</StatPill>
          </div>
        )}
      </div>

      {stats && Object.keys(stats.byType).length > 0 && (
        <div className="research-library__type-bar">
          {Object.entries(stats.byType).map(([type, count]) => (
            <span key={type} className="research-library__type-stat">
              <DocTypeIcon type={type} size={14} /> {type}: <strong>{count}</strong>
            </span>
          ))}
        </div>
      )}

      <div className="research-page__controls">
        {/* The same chip vocabulary the Projects tab uses. These were `py-1` (24px) beside 40px
            controls; the shared class carries one height for the whole row, so the disagreement
            the alignment audit measured cannot come back by editing one element. They still scroll
            sideways rather than wrap — six chips do not fit 390px, and wrapping pushes the list
            people came for below the fold. */}
        <div className="research-page__status-filters research-library__filters">
          {(['all', 'plat', 'deed', 'easement', 'survey', 'purchased'] as DocFilter[]).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => { setFilter(f); resetPage(); }}
              className={`research-page__status-chip ${f === filter ? 'research-page__status-chip--active' : ''}`}
              aria-pressed={f === filter}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <label className="research-library__field">
          <span className="research-library__field-label">County</span>
          <select
            className="research-library__select"
            value={countyFilter}
            onChange={e => { setCountyFilter(e.target.value); resetPage(); }}
          >
            <option value="all">All Counties</option>
            {counties.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <div className="research-page__search research-library__search">
          <input
            type="search"
            className="research-page__search-input"
            placeholder="Search instrument #, grantor, grantee, address…"
            aria-label="Search documents"
            value={search}
            onChange={e => { setSearch(e.target.value); resetPage(); }}
          />
        </div>

        <label className="research-library__field">
          <span className="research-library__field-label">Sort</span>
          <select
            className="research-library__select"
            value={sortBy}
            onChange={e => { setSortBy(e.target.value as SortBy); resetPage(); }}
          >
            <option value="date_desc">Newest First</option>
            <option value="date_asc">Oldest First</option>
            <option value="relevance">Relevance</option>
            <option value="type">Document Type</option>
            <option value="county">County</option>
          </select>
        </label>

        <span className="research-library__result-count">{filtered.length} results</span>
      </div>

      {paginated.length === 0 ? (
        <EmptyState
          icon={<Inbox size={40} strokeWidth={1.5} />}
          title={emptyCopy.title}
          body={emptyCopy.body}
          action={emptyCopy.canClear ? (
            <button
              type="button"
              className="research-page__new-btn"
              onClick={() => { setSearch(''); setFilter('all'); setCountyFilter('all'); resetPage(); }}
            >
              Clear filters
            </button>
          ) : undefined}
        />
      ) : (
        <div className="research-library__list">
          {paginated.map(doc => (
            <Link
              key={doc.documentId}
              href={`/admin/research/${doc.projectId}/documents`}
              className="research-library__doc"
            >
              <span className="research-library__doc-icon" aria-hidden="true">
                <DocTypeIcon type={doc.type} size={20} />
              </span>

              <span className="research-library__doc-body">
                <span className="research-library__doc-tags">
                  <span className="research-library__doc-type">{doc.type}</span>
                  {doc.instrumentNumber && (
                    <span className="research-library__doc-instrument">{doc.instrumentNumber}</span>
                  )}
                  {doc.purchased && (
                    <StatPill tone="good"><Check size={11} strokeWidth={2.5} aria-hidden="true" /> Purchased</StatPill>
                  )}
                  {doc.usedInAnalysis && (
                    <StatPill tone="info"><Check size={11} strokeWidth={2.5} aria-hidden="true" /> Used</StatPill>
                  )}
                </span>

                {doc.description && (
                  <span className="research-library__doc-desc">{doc.description}</span>
                )}

                <span className="research-library__doc-meta">
                  {doc.projectAddress && (
                    <span className="research-library__doc-address">
                      <Home size={12} strokeWidth={2} aria-hidden="true" /> {doc.projectAddress}
                    </span>
                  )}
                  {doc.countyName && <span>{doc.countyName} County</span>}
                  {doc.grantor && <span>From: {doc.grantor}</span>}
                  {doc.recordedDate && <span>{doc.recordedDate}</span>}
                  {doc.sizeBytes && <span>{formatBytes(doc.sizeBytes)}</span>}
                </span>
              </span>

              {doc.purchaseCost !== undefined && (
                <span className="research-library__doc-cost">${doc.purchaseCost.toFixed(2)}</span>
              )}
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="research-library__pager" aria-label="Library pages">
          <button
            type="button"
            className="research-library__pager-btn"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Prev
          </button>
          <span className="research-library__pager-status" aria-live="polite">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="research-library__pager-btn"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next →
          </button>
        </nav>
      )}
    </div>
  );
}
