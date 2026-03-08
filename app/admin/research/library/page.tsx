// app/admin/research/library/page.tsx — Phase 13 Global Document Library
// Shows ALL research documents across ALL projects for the current user.
// Supports full-text search, type filtering, county filtering, and bulk actions.
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

const DOC_TYPE_ICONS: Record<string, string> = {
  plat: '🗺', deed: '📜', easement: '📋', survey: '📐', other: '📄',
};

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GlobalLibraryPage() {
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
    if (sessionStatus === 'unauthenticated') router.push('/auth/signin');
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

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-300 text-center">
          <div className="text-4xl mb-4 animate-spin">⟳</div>
          <p>Loading document library…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Failed to load library</p>
          <p className="text-gray-500 text-sm mb-6">{loadError}</p>
          <button onClick={loadLibrary} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Header ── */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin/research" className="text-gray-400 hover:text-white text-sm">
              ← Research
            </Link>
            <h1 className="text-xl font-bold">📚 Document Library</h1>
          </div>
          {stats && (
            <div className="flex gap-6 text-sm text-gray-400">
              <span><strong className="text-white">{stats.totalDocuments}</strong> documents</span>
              <span><strong className="text-green-400">{stats.totalPurchased}</strong> purchased</span>
              <span><strong className="text-yellow-400">${stats.totalSpent.toFixed(2)}</strong> spent</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Stats bar ── */}
      {stats && (
        <div className="bg-gray-900/50 border-b border-gray-800 px-6 py-2 flex gap-6 overflow-x-auto text-xs text-gray-400">
          {Object.entries(stats.byType).map(([type, count]) => (
            <span key={type}>{DOC_TYPE_ICONS[type] ?? '📄'} {type}: <strong className="text-white">{count}</strong></span>
          ))}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex flex-wrap items-center gap-3">
        {/* Filter tabs */}
        <div className="flex gap-1">
          {(['all', 'plat', 'deed', 'easement', 'survey', 'purchased'] as DocFilter[]).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); resetPage(); }}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* County filter */}
        <select
          value={countyFilter}
          onChange={e => { setCountyFilter(e.target.value); resetPage(); }}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none"
        >
          <option value="all">All Counties</option>
          {counties.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Search */}
        <input
          type="text"
          placeholder="Search instrument #, grantor, grantee, address…"
          value={search}
          onChange={e => { setSearch(e.target.value); resetPage(); }}
          className="flex-1 min-w-48 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />

        {/* Sort */}
        <select
          value={sortBy}
          onChange={e => { setSortBy(e.target.value as SortBy); resetPage(); }}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none"
        >
          <option value="date_desc">Newest First</option>
          <option value="date_asc">Oldest First</option>
          <option value="relevance">Relevance</option>
          <option value="type">Document Type</option>
          <option value="county">County</option>
        </select>

        <span className="text-xs text-gray-500 ml-auto">
          {filtered.length} results
        </span>
      </div>

      {/* ── Document list ── */}
      <div className="px-6 py-4">
        {paginated.length === 0 ? (
          <div className="text-center text-gray-500 mt-16">
            <div className="text-4xl mb-3">📭</div>
            <p>{search ? 'No documents match your search.' : 'Your document library is empty.'}</p>
            <p className="text-sm mt-2">Run a research project to harvest documents.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {paginated.map(doc => (
              <Link
                key={doc.documentId}
                href={`/admin/research/${doc.projectId}/documents`}
                className="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-blue-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="text-xl flex-shrink-0">{DOC_TYPE_ICONS[doc.type] ?? '📄'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-300 capitalize">
                          {doc.type}
                        </span>
                        {doc.instrumentNumber && (
                          <span className="font-mono text-sm text-blue-300">{doc.instrumentNumber}</span>
                        )}
                        {doc.purchased && (
                          <span className="text-xs px-2 py-0.5 bg-green-800 text-green-300 rounded">✓ Purchased</span>
                        )}
                        {doc.usedInAnalysis && (
                          <span className="text-xs px-2 py-0.5 bg-blue-800 text-blue-300 rounded">✓ Used</span>
                        )}
                      </div>
                      {doc.description && (
                        <p className="text-sm text-gray-300 mt-1 truncate">{doc.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        {doc.projectAddress && <span className="text-gray-400">🏠 {doc.projectAddress}</span>}
                        {doc.countyName && <span>{doc.countyName} County</span>}
                        {doc.grantor && <span>From: {doc.grantor}</span>}
                        {doc.recordedDate && <span>{doc.recordedDate}</span>}
                        {doc.sizeBytes && <span>{formatBytes(doc.sizeBytes)}</span>}
                      </div>
                    </div>
                  </div>
                  {doc.purchaseCost !== undefined && (
                    <div className="text-green-400 text-sm font-medium flex-shrink-0">
                      ${doc.purchaseCost.toFixed(2)}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 bg-gray-800 rounded text-sm disabled:opacity-40 hover:bg-gray-700"
            >
              ← Prev
            </button>
            <span className="text-sm text-gray-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 bg-gray-800 rounded text-sm disabled:opacity-40 hover:bg-gray-700"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
