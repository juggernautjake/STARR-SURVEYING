// app/admin/learn/search/page.tsx
'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { usePageError } from '../../hooks/usePageError';

interface SearchResult { type: string; id: string; title: string; excerpt: string; href: string; breadcrumb: string; }

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const { safeFetch, safeAction } = usePageError('SearchContent');
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => { if (initialQuery) doSearch(initialQuery); }, [initialQuery]);

  async function doSearch(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/admin/learn/search?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) { const data = await res.json(); setResults(data.results || []); }
    } catch (err) { console.error('SearchContent: search failed', err); }
    finally { setLoading(false); }
  }

  const typeColors: Record<string, string> = { module: 'search-result__type--module', lesson: 'search-result__type--lesson', topic: 'search-result__type--topic', article: 'search-result__type--article', flashcard: 'search-result__type--flashcard' };

  return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn" className="learn__back">← Back to Learning Hub</Link>
        <h2 className="learn__title">🔎 Search Everything</h2>
        <p className="learn__subtitle">Search across modules, lessons, topics, articles, and flashcards.</p>
      </div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '.5rem', maxWidth: '600px' }}>
        <div className="admin-search" style={{ flex: 1, maxWidth: 'none' }}>
          <input type="text" className="admin-search__input" placeholder="Search for any keyword, topic, term..." value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch(query)} />
        </div>
        <button className="admin-search__btn" onClick={() => doSearch(query)} disabled={!query.trim()}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Search
        </button>
      </div>

      {loading && <div className="admin-empty"><div className="admin-empty__icon">⏳</div><div className="admin-empty__title">Searching...</div></div>}

      {!loading && searched && results.length === 0 && (
        <div className="admin-empty"><div className="admin-empty__icon">🔍</div><div className="admin-empty__title">No results found</div><div className="admin-empty__desc">Try different keywords or a broader search term.</div></div>
      )}

      {!loading && results.length > 0 && (
        <div className="search-results">
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '.85rem', color: '#6B7280', marginBottom: '.5rem' }}>{results.length} result{results.length !== 1 ? 's' : ''} found</p>
          {results.map((r, i) => (
            <Link key={`${r.type}-${r.id}-${i}`} href={r.href} className="search-result">
              <span className={`search-result__type ${typeColors[r.type] || ''}`}>{r.type}</span>
              <div className="search-result__title">{r.title}</div>
              <div className="search-result__excerpt">{r.excerpt}</div>
              {r.breadcrumb && <div className="search-result__breadcrumb">{r.breadcrumb}</div>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function SearchPage() {
  return <Suspense fallback={<div className="admin-empty"><div className="admin-empty__icon">⏳</div></div>}><SearchContent /></Suspense>;
}
