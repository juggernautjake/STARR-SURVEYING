// app/admin/research/[projectId]/documents/page.tsx — Phase 13 Project Document Library
// Shows all research documents retrieved and purchased for a specific project.
// Supports preview, download, and source document linking.
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResearchDocument {
  documentId: string;
  type: 'plat' | 'deed' | 'easement' | 'survey' | 'other';
  instrumentNumber?: string;
  description?: string;
  grantor?: string;
  grantee?: string;
  recordedDate?: string;
  pageCount?: number;
  fileFormat?: 'pdf' | 'jpg' | 'png' | 'tif' | 'unknown';
  sizeBytes?: number;
  relevanceScore?: number;
  purchased: boolean;
  purchasedAt?: string;
  purchaseCost?: number;
  localPath?: string;
  thumbnailUrl?: string;
  usedInAnalysis?: boolean;
  source?: string;
}

type DocFilter = 'all' | 'plat' | 'deed' | 'easement' | 'survey' | 'purchased' | 'used';
type SortBy = 'type' | 'date' | 'relevance' | 'name';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DOC_TYPE_ICONS: Record<ResearchDocument['type'], string> = {
  plat: '🗺',
  deed: '📜',
  easement: '📋',
  survey: '📐',
  other: '📄',
};

const DOC_TYPE_LABELS: Record<ResearchDocument['type'], string> = {
  plat: 'Plat',
  deed: 'Deed',
  easement: 'Easement',
  survey: 'Survey',
  other: 'Other',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relevanceBadge(score: number | undefined): string {
  if (score === undefined) return '';
  if (score >= 0.8) return '⭐⭐⭐';
  if (score >= 0.6) return '⭐⭐';
  if (score >= 0.4) return '⭐';
  return '';
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ProjectDocumentsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId ?? '';

  const [documents, setDocuments] = useState<ResearchDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filter, setFilter] = useState<DocFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('relevance');
  const [search, setSearch] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<ResearchDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ── Auth guard ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') router.push('/auth/signin');
  }, [sessionStatus, router]);

  // ── Load documents ───────────────────────────────────────────────────────

  const loadDocuments = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/documents`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { documents: ResearchDocument[] };
      setDocuments(data.documents ?? []);
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  // ── Filter + Sort + Search ───────────────────────────────────────────────

  const filteredDocs = documents
    .filter(doc => {
      if (filter === 'purchased') return doc.purchased;
      if (filter === 'used') return doc.usedInAnalysis;
      if (filter !== 'all') return doc.type === filter;
      return true;
    })
    .filter(doc => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        doc.documentId.toLowerCase().includes(q) ||
        (doc.instrumentNumber ?? '').toLowerCase().includes(q) ||
        (doc.description ?? '').toLowerCase().includes(q) ||
        (doc.grantor ?? '').toLowerCase().includes(q) ||
        (doc.grantee ?? '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'relevance':
          return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
        case 'date':
          return (b.recordedDate ?? '').localeCompare(a.recordedDate ?? '');
        case 'type':
          return a.type.localeCompare(b.type);
        case 'name':
          return (a.instrumentNumber ?? '').localeCompare(b.instrumentNumber ?? '');
        default:
          return 0;
      }
    });

  // ── Download handler ─────────────────────────────────────────────────────

  const handleDownload = useCallback(async (doc: ResearchDocument) => {
    try {
      const res = await fetch(
        `/api/admin/research/${projectId}/documents/${doc.documentId}/download`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.instrumentNumber ?? doc.documentId}.${doc.fileFormat ?? 'pdf'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download failed: ${String(err)}`);
    }
  }, [projectId]);

  // ── Preview ───────────────────────────────────────────────────────────────

  const handlePreview = useCallback((doc: ResearchDocument) => {
    setSelectedDoc(doc);
    if (doc.thumbnailUrl) {
      setPreviewUrl(doc.thumbnailUrl);
    } else {
      setPreviewUrl(`/api/admin/research/${projectId}/documents/${doc.documentId}/preview`);
    }
  }, [projectId]);

  // ── Loading / Error ───────────────────────────────────────────────────────

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-300 text-center">
          <div className="text-4xl mb-4 animate-spin">⟳</div>
          <p>Loading documents…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">Failed to load documents</p>
          <p className="text-gray-500 text-sm mb-6">{loadError}</p>
          <button onClick={loadDocuments} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const purchasedCount = documents.filter(d => d.purchased).length;
  const usedCount = documents.filter(d => d.usedInAnalysis).length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Header ── */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/admin/research/${projectId}`} className="text-gray-400 hover:text-white text-sm">
              ← Back to Project
            </Link>
            <h1 className="text-xl font-bold">📁 Document Library</h1>
          </div>
          <div className="flex gap-4 text-sm text-gray-400">
            <span><strong className="text-white">{documents.length}</strong> documents</span>
            <span><strong className="text-green-400">{purchasedCount}</strong> purchased</span>
            <span><strong className="text-blue-400">{usedCount}</strong> used in analysis</span>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)] overflow-hidden">
        {/* ── Main list ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex flex-wrap items-center gap-3">
            {/* Filter tabs */}
            <div className="flex gap-1">
              {(['all', 'plat', 'deed', 'easement', 'survey', 'purchased', 'used'] as DocFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    filter === f
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {f === 'all' ? `All (${documents.length})` : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search instrument #, grantor, description…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-40 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />

            {/* Sort */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortBy)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none"
            >
              <option value="relevance">Sort: Relevance</option>
              <option value="date">Sort: Date</option>
              <option value="type">Sort: Type</option>
              <option value="name">Sort: Instrument #</option>
            </select>
          </div>

          {/* Document list */}
          <div className="flex-1 overflow-y-auto p-4">
            {filteredDocs.length === 0 ? (
              <div className="text-center text-gray-500 mt-16">
                <div className="text-4xl mb-3">📭</div>
                <p>{search ? 'No documents match your search.' : 'No documents found for this project.'}</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {filteredDocs.map(doc => (
                  <div
                    key={doc.documentId}
                    onClick={() => handlePreview(doc)}
                    className={`bg-gray-900 border rounded-lg p-4 cursor-pointer transition-colors hover:border-blue-600 ${
                      selectedDoc?.documentId === doc.documentId
                        ? 'border-blue-500 bg-blue-900/10'
                        : 'border-gray-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <span className="text-2xl flex-shrink-0">{DOC_TYPE_ICONS[doc.type]}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-300">
                              {DOC_TYPE_LABELS[doc.type]}
                            </span>
                            {doc.instrumentNumber && (
                              <span className="font-mono text-sm text-blue-300">{doc.instrumentNumber}</span>
                            )}
                            {relevanceBadge(doc.relevanceScore) && (
                              <span className="text-xs" title={`Relevance: ${((doc.relevanceScore ?? 0) * 100).toFixed(0)}%`}>
                                {relevanceBadge(doc.relevanceScore)}
                              </span>
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
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                            {doc.grantor && <span>From: {doc.grantor}</span>}
                            {doc.grantee && <span>To: {doc.grantee}</span>}
                            {doc.recordedDate && <span>{doc.recordedDate}</span>}
                            {doc.pageCount && <span>{doc.pageCount}p</span>}
                            {doc.sizeBytes && <span>{formatBytes(doc.sizeBytes)}</span>}
                            {doc.source && <span>{doc.source}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-1 flex-shrink-0">
                        {doc.purchased && (
                          <button
                            onClick={e => { e.stopPropagation(); handleDownload(doc); }}
                            className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                            title="Download"
                          >
                            ↓
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Preview panel ── */}
        {selectedDoc && (
          <aside className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col flex-shrink-0 overflow-y-auto">
            <div className="flex items-center justify-between p-3 border-b border-gray-800">
              <h2 className="font-semibold text-sm">{DOC_TYPE_ICONS[selectedDoc.type]} Preview</h2>
              <button onClick={() => { setSelectedDoc(null); setPreviewUrl(null); }}
                className="text-gray-400 hover:text-white">✕</button>
            </div>

            {/* Document preview image */}
            <div className="flex-1 overflow-hidden bg-gray-800 flex items-center justify-center min-h-48">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Document preview"
                  className="max-w-full max-h-full object-contain"
                  onError={() => setPreviewUrl(null)}
                />
              ) : (
                <div className="text-gray-500 text-center p-6">
                  <div className="text-4xl mb-2">{DOC_TYPE_ICONS[selectedDoc.type]}</div>
                  <p className="text-sm">No preview available</p>
                </div>
              )}
            </div>

            {/* Document metadata */}
            <div className="p-3 space-y-2 text-sm border-t border-gray-800">
              {selectedDoc.instrumentNumber && (
                <div>
                  <span className="text-gray-500 text-xs">Instrument #: </span>
                  <span className="font-mono">{selectedDoc.instrumentNumber}</span>
                </div>
              )}
              {selectedDoc.recordedDate && (
                <div>
                  <span className="text-gray-500 text-xs">Recorded: </span>
                  <span>{selectedDoc.recordedDate}</span>
                </div>
              )}
              {selectedDoc.grantor && (
                <div>
                  <span className="text-gray-500 text-xs">Grantor: </span>
                  <span>{selectedDoc.grantor}</span>
                </div>
              )}
              {selectedDoc.grantee && (
                <div>
                  <span className="text-gray-500 text-xs">Grantee: </span>
                  <span>{selectedDoc.grantee}</span>
                </div>
              )}
              {selectedDoc.purchaseCost !== undefined && (
                <div>
                  <span className="text-gray-500 text-xs">Purchase cost: </span>
                  <span className="text-green-400">${selectedDoc.purchaseCost.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-gray-800">
              {selectedDoc.purchased ? (
                <button
                  onClick={() => handleDownload(selectedDoc)}
                  className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
                >
                  ↓ Download
                </button>
              ) : (
                <div className="text-gray-500 text-xs text-center">
                  Document not yet purchased. Go to the project page to purchase.
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
