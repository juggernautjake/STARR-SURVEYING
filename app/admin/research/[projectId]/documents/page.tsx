// app/admin/research/[projectId]/documents/page.tsx — the project's Document Library.
//
// ── THIS PAGE RENDERED SEVENTEEN EMPTY BOXES ────────────────────────────────────────────────────
//
// Found 2026-08-31 by photographing it. The count said "17 documents", the filters were right, and
// every single row was blank — because the page cast the API's response to a shape nothing
// produces. `documentId`, `type`, `instrumentNumber`, `grantor`, `pageCount`, `fileFormat`,
// `sizeBytes`, `purchased`… not one is a column on `research_documents`. Every value was
// `undefined`, and `key={doc.documentId}` was `undefined` for all seventeen rows at once.
//
// The shaping is in `./document-rows.ts` now, with its column list held against the seeds by
// `document-library-reads-real-columns.test.ts`. See that file for the full account.
//
// ── AND IT COULD NOT SHOW AN IMAGE ──────────────────────────────────────────────────────────────
//
// Owner: *"be able to view all images"*. The old preview pane pointed at
// `/documents/{id}/preview`, a route that does not exist, using an id that was undefined. A plat
// you cannot see at full size is a plat you have not checked, so the viewer opens the real file:
// images inline and zoomable, PDFs in an object frame, and anything else as an honest download.

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  toCards, formatBytes, type DocumentCard, type DocumentKind,
} from './document-rows';

type DocFilter = 'all' | DocumentKind | 'uploaded' | 'retrieved';
type SortBy = 'date' | 'type' | 'name' | 'size';

const KIND_ICON: Record<DocumentKind, string> = {
  plat: '🗺', deed: '📜', easement: '📋', survey: '📐', other: '📄',
};

const KIND_LABEL: Record<DocumentKind, string> = {
  plat: 'Plat', deed: 'Deed', easement: 'Easement', survey: 'Survey', other: 'Other',
};

/** `analyzed` / `pending` / `failed` — what the pipeline did with the file, in one word. */
function statusTone(status: string): string {
  if (status === 'analyzed' || status === 'extracted') return 'bg-green-900 text-green-200';
  if (status === 'failed' || status === 'error') return 'bg-red-900 text-red-200';
  return 'bg-gray-700 text-gray-200';
}

export default function ProjectDocumentsPage() {
  const { status: sessionStatus } = useSession();
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId ?? '';

  const [documents, setDocuments] = useState<DocumentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filter, setFilter] = useState<DocFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<DocumentCard | null>(null);

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') router.push('/admin/login');
  }, [sessionStatus, router]);

  const loadDocuments = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/documents`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // `toCards` is tolerant of the wrapper AND of a bare array, and drops rows with no id rather
      // than rendering them with an undefined React key.
      setDocuments(toCards(await res.json()));
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const filtered = useMemo(() => documents
    .filter((d) => {
      if (filter === 'all') return true;
      if (filter === 'uploaded') return d.isUpload;
      if (filter === 'retrieved') return !d.isUpload;
      return d.kind === filter;
    })
    .filter((d) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return d.title.toLowerCase().includes(q)
        || (d.instrument ?? '').toLowerCase().includes(q)
        || d.sourceLabel.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'type': return a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title);
        case 'name': return a.title.localeCompare(b.title);
        case 'size': return (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0);
        default: return (b.recordedDate ?? '').localeCompare(a.recordedDate ?? '');
      }
    }), [documents, filter, search, sortBy]);

  const uploaded = documents.filter((d) => d.isUpload).length;
  const images = documents.filter((d) => d.isImage).length;

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="research-dark-app min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-300 text-center">
          <div className="text-4xl mb-4 animate-spin">⟳</div>
          <p>Loading documents…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="research-dark-app min-h-screen bg-gray-950 flex items-center justify-center">
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

  return (
    <div className="research-dark-app min-h-screen bg-gray-950 text-gray-100">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href={`/admin/research/${projectId}`} className="text-gray-400 hover:text-white text-sm">
              ← Back to Project
            </Link>
            <h1 className="text-xl font-bold text-gray-100">📁 Document Library</h1>
          </div>
          {/* Counts that are actually derivable. The old header promised "purchased" and "used in
              analysis" from two fields that do not exist, so both read 0 on every project. */}
          <div className="flex gap-4 text-sm text-gray-300">
            <span><strong className="text-white">{documents.length}</strong> documents</span>
            <span><strong className="text-white">{uploaded}</strong> uploaded by us</span>
            <span><strong className="text-white">{images}</strong> viewable images</span>
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-73px)] lg:overflow-hidden">
        <div className="flex-1 flex flex-col lg:overflow-hidden">
          <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex gap-1 flex-wrap">
              {(['all', 'plat', 'deed', 'easement', 'survey', 'uploaded', 'retrieved'] as DocFilter[]).map((f) => {
                const n = f === 'all' ? documents.length
                  : f === 'uploaded' ? uploaded
                  : f === 'retrieved' ? documents.length - uploaded
                  : documents.filter((d) => d.kind === f).length;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    aria-pressed={filter === f}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      filter === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {/* The count is on EVERY chip, not just "All". A filter that turns out to be
                        empty after you click it is a filter you learn not to trust. */}
                    {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({n})
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              placeholder="Search title, instrument # or source…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search documents"
              className="flex-1 min-w-40 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />

            <label className="text-xs text-gray-300 flex items-center gap-2">
              Sort
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100"
              >
                <option value="date">Recorded date</option>
                <option value="type">Type</option>
                <option value="name">Name</option>
                <option value="size">Size</option>
              </select>
            </label>
          </div>

          <div className="flex-1 lg:overflow-y-auto p-4">
            {filtered.length === 0 ? (
              <div className="text-center text-gray-300 py-16">
                <div className="text-4xl mb-3">📁</div>
                <p className="font-medium">
                  {documents.length === 0 ? 'No documents on this project yet.' : 'No documents match that filter.'}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  {documents.length === 0
                    ? 'Run the research pipeline, or upload deeds and plats from the project page.'
                    : 'Clear the search or pick another filter.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                {filtered.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setSelected(doc)}
                    aria-pressed={selected?.id === doc.id}
                    className={`text-left w-full bg-gray-900 border rounded-lg p-4 transition-colors hover:border-blue-600 ${
                      selected?.id === doc.id ? 'border-blue-500' : 'border-gray-800'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0" aria-hidden="true">{KIND_ICON[doc.kind]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-200">
                            {KIND_LABEL[doc.kind]}
                          </span>
                          {doc.instrument && (
                            <span className="font-mono text-sm text-blue-300">{doc.instrument}</span>
                          )}
                          {doc.isUpload && (
                            <span className="text-xs px-2 py-0.5 bg-blue-900 text-blue-200 rounded">Uploaded</span>
                          )}
                          {doc.isImage && (
                            <span className="text-xs px-2 py-0.5 bg-gray-700 text-gray-200 rounded">Image</span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded ${statusTone(doc.status)}`}>
                            {doc.status}
                          </span>
                        </div>
                        {/* The title. It is never blank — `titleOf` falls back through the filename
                            to the id, because a blank row is indistinguishable from a broken one. */}
                        <p className="text-sm text-gray-100 font-medium break-words">{doc.title}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                          <span>{doc.sourceLabel}</span>
                          {doc.recordedDate && <span>{doc.recordedDate}</span>}
                          {doc.pageCount != null && <span>{doc.pageCount}p</span>}
                          {doc.sizeBytes != null && <span>{formatBytes(doc.sizeBytes)}</span>}
                        </div>
                        {doc.statusError && (
                          <p className="text-xs text-red-400 mt-1 break-words">{doc.statusError}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── The viewer ─────────────────────────────────────────────────────────────────────────
            Images inline, PDFs in a frame, anything else an honest link. The old pane pointed at a
            `/preview` route that does not exist, with an id that was undefined. */}
        {selected && (
          <aside className="w-full lg:w-[26rem] bg-gray-900 border-t lg:border-t-0 lg:border-l border-gray-800 flex flex-col lg:overflow-y-auto">
            <div className="flex items-start justify-between gap-2 p-4 border-b border-gray-800">
              <h2 className="font-semibold text-gray-100 text-sm break-words">{selected.title}</h2>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close preview"
                className="text-gray-400 hover:text-white flex-shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3">
              {selected.fileUrl ? (
                selected.isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a Supabase storage URL
                  // is not a configured next/image domain, and a plat has to open at full size.
                  <a href={selected.fileUrl} target="_blank" rel="noopener noreferrer" title="Open full size">
                    <img
                      src={selected.fileUrl}
                      alt={selected.title}
                      className="w-full rounded border border-gray-800 bg-gray-950"
                    />
                  </a>
                ) : (
                  <object
                    data={selected.fileUrl}
                    type="application/pdf"
                    className="w-full h-96 rounded border border-gray-800 bg-gray-950"
                    aria-label={`Preview of ${selected.title}`}
                  >
                    <p className="text-sm text-gray-300 p-3">
                      This document cannot be shown inline.{' '}
                      <a href={selected.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline">
                        Open it in a new tab
                      </a>.
                    </p>
                  </object>
                )
              ) : (
                <p className="text-sm text-gray-300">
                  No file was stored for this record — only its metadata was captured.
                </p>
              )}

              <dl className="text-xs text-gray-300 space-y-1">
                <div className="flex gap-2"><dt className="text-gray-400 w-24 flex-shrink-0">Type</dt><dd>{KIND_LABEL[selected.kind]}</dd></div>
                {selected.instrument && (
                  <div className="flex gap-2"><dt className="text-gray-400 w-24 flex-shrink-0">Instrument</dt><dd className="font-mono break-all">{selected.instrument}</dd></div>
                )}
                {selected.recordedDate && (
                  <div className="flex gap-2"><dt className="text-gray-400 w-24 flex-shrink-0">Recorded</dt><dd>{selected.recordedDate}</dd></div>
                )}
                <div className="flex gap-2"><dt className="text-gray-400 w-24 flex-shrink-0">Source</dt><dd>{selected.sourceLabel}</dd></div>
                <div className="flex gap-2"><dt className="text-gray-400 w-24 flex-shrink-0">Status</dt><dd>{selected.status}</dd></div>
                {selected.pageCount != null && (
                  <div className="flex gap-2"><dt className="text-gray-400 w-24 flex-shrink-0">Pages</dt><dd>{selected.pageCount}</dd></div>
                )}
                {selected.sizeBytes != null && (
                  <div className="flex gap-2"><dt className="text-gray-400 w-24 flex-shrink-0">Size</dt><dd>{formatBytes(selected.sizeBytes)}</dd></div>
                )}
              </dl>

              {selected.fileUrl && (
                <a
                  href={selected.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Open full size
                </a>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
