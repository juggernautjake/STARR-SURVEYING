// app/admin/learn/page.tsx
'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useState, useCallback } from 'react';

interface SearchResult {
  id: string;
  title?: string;
  term?: string;
  type: string;
  url?: string;
  slug?: string;
  category?: string;
  excerpt?: string;
  definition?: string;
}

export default function LearnHubPage() {
  const { data: session } = useSession();
  const role = session?.user?.role || 'employee';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any>(null);
  const [searching, setSearching] = useState(false);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/learn/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
      }
    } catch { /* ignore */ }
    setSearching(false);
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    clearTimeout((window as any).__searchTimer);
    (window as any).__searchTimer = setTimeout(() => search(v), 350);
  };

  const allResults: SearchResult[] = results ? [
    ...(results.modules || []),
    ...(results.lessons || []),
    ...(results.topics || []),
    ...(results.articles || []),
    ...(results.flashcards || []),
  ] : [];

  return (
    <>
      <div className="admin-learn__header">
        <h2 className="admin-learn__title">🎓 Learning Hub</h2>
        <p className="admin-learn__subtitle">
          Build your surveying expertise with structured courses, exam prep, flashcards, and a searchable reference library.
        </p>
      </div>

      {/* Global Search */}
      <div className="admin-search" style={{ maxWidth: '100%', marginBottom: '2rem', position: 'relative' }}>
        <span className="admin-search__icon">🔍</span>
        <input
          type="text"
          className="admin-search__input"
          placeholder="Search modules, lessons, topics, articles, flashcards..."
          value={query}
          onChange={handleSearch}
        />
        {searching && <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: '#9CA3AF' }}>Searching...</span>}

        {/* Search Results Dropdown */}
        {results && query.length >= 2 && (
          <div className="search-dropdown">
            {allResults.length === 0 ? (
              <div className="search-dropdown__empty">No results found for &ldquo;{query}&rdquo;</div>
            ) : (
              <>
                {results.modules?.length > 0 && (
                  <div className="search-dropdown__section">
                    <div className="search-dropdown__section-label">📚 Modules</div>
                    {results.modules.map((r: any) => (
                      <Link key={r.id} href={r.url} className="search-dropdown__item" onClick={() => { setQuery(''); setResults(null); }}>
                        <span className="search-dropdown__item-title">{r.title}</span>
                        <span className="search-dropdown__item-type">Module</span>
                      </Link>
                    ))}
                  </div>
                )}
                {results.lessons?.length > 0 && (
                  <div className="search-dropdown__section">
                    <div className="search-dropdown__section-label">📖 Lessons</div>
                    {results.lessons.map((r: any) => (
                      <Link key={r.id} href={r.url} className="search-dropdown__item" onClick={() => { setQuery(''); setResults(null); }}>
                        <span className="search-dropdown__item-title">{r.title}</span>
                        <span className="search-dropdown__item-type">Lesson</span>
                      </Link>
                    ))}
                  </div>
                )}
                {results.topics?.length > 0 && (
                  <div className="search-dropdown__section">
                    <div className="search-dropdown__section-label">📌 Topics</div>
                    {results.topics.map((r: any) => (
                      <div key={r.id} className="search-dropdown__item">
                        <span className="search-dropdown__item-title">{r.title}</span>
                        <span className="search-dropdown__item-type">Topic</span>
                      </div>
                    ))}
                  </div>
                )}
                {results.articles?.length > 0 && (
                  <div className="search-dropdown__section">
                    <div className="search-dropdown__section-label">📄 Articles</div>
                    {results.articles.map((r: any) => (
                      <Link key={r.id} href={r.url} className="search-dropdown__item" onClick={() => { setQuery(''); setResults(null); }}>
                        <span className="search-dropdown__item-title">{r.title}</span>
                        <span className="search-dropdown__item-type">{r.category}</span>
                      </Link>
                    ))}
                  </div>
                )}
                {results.flashcards?.length > 0 && (
                  <div className="search-dropdown__section">
                    <div className="search-dropdown__section-label">🃏 Flashcards</div>
                    {results.flashcards.map((r: any) => (
                      <Link key={r.id} href="/admin/learn/flashcards" className="search-dropdown__item" onClick={() => { setQuery(''); setResults(null); }}>
                        <span className="search-dropdown__item-title">{r.term}</span>
                        <span className="search-dropdown__item-type">Flashcard</span>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Section Cards */}
      <div className="admin-learn__sections">
        <Link href="/admin/learn/modules" className="admin-learn__section-card">
          <span className="admin-learn__section-icon">📚</span>
          <h3 className="admin-learn__section-title">Learning Modules</h3>
          <p className="admin-learn__section-desc">
            Progressive courses from beginner to advanced. Each module has lessons with topics, resources, videos, and quizzes. Complete a module test at the end.
          </p>
          <span className="admin-learn__section-arrow">Browse Modules →</span>
        </Link>

        <Link href="/admin/learn/knowledge-base" className="admin-learn__section-card">
          <span className="admin-learn__section-icon">🔍</span>
          <h3 className="admin-learn__section-title">Knowledge Base</h3>
          <p className="admin-learn__section-desc">
            Searchable reference library covering any surveying topic. Designed for quick lookup — like a surveying encyclopedia.
          </p>
          <span className="admin-learn__section-arrow">Search Articles →</span>
        </Link>

        <Link href="/admin/learn/flashcards" className="admin-learn__section-card">
          <span className="admin-learn__section-icon">🃏</span>
          <h3 className="admin-learn__section-title">Flashcards</h3>
          <p className="admin-learn__section-desc">
            Study terms and definitions with built-in flashcards. Create your own cards with up to 3 progressive hints. Link cards to modules and topics.
          </p>
          <span className="admin-learn__section-arrow">Study Flashcards →</span>
        </Link>

        <Link href="/admin/learn/exam-prep" className="admin-learn__section-card">
          <span className="admin-learn__section-icon">📝</span>
          <h3 className="admin-learn__section-title">Exam Prep (SIT / RPLS)</h3>
          <p className="admin-learn__section-desc">
            Practice for the Surveyor Intern Test (SIT) and Registered Professional Land Surveyor (RPLS) exams with randomized practice tests.
          </p>
          <span className="admin-learn__section-arrow">Start Exam Prep →</span>
        </Link>

        <Link href="/admin/learn/fieldbook" className="admin-learn__section-card">
          <span className="admin-learn__section-icon">📓</span>
          <h3 className="admin-learn__section-title">My Fieldbook</h3>
          <p className="admin-learn__section-desc">
            Keep all your study notes in one place. Notes automatically record the date, time, and what page you were on when you wrote them.
          </p>
          <span className="admin-learn__section-arrow">Open Fieldbook →</span>
        </Link>

        {role === 'admin' && (
          <Link href="/admin/learn/manage" className="admin-learn__section-card" style={{ borderColor: '#BD1218' }}>
            <span className="admin-learn__section-icon">✏️</span>
            <h3 className="admin-learn__section-title">Manage Content</h3>
            <p className="admin-learn__section-desc">
              Create and edit modules, lessons, questions, flashcards, and articles. Admin only.
            </p>
            <span className="admin-learn__section-arrow" style={{ color: '#BD1218' }}>Manage →</span>
          </Link>
        )}
      </div>
    </>
  );
}
