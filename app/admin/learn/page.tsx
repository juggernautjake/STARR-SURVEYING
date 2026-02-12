// app/admin/learn/page.tsx
'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useState, useCallback } from 'react';
import { usePageError } from '../hooks/usePageError';
import SmartSearch from './components/SmartSearch';

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
  const { safeFetch, safeAction } = usePageError('LearnHubPage');
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
    } catch (err) { console.error('LearnHubPage: search failed', err); }
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

      {/* Universal Smart Search */}
      <div style={{ maxWidth: '100%', marginBottom: '2rem' }}>
        <SmartSearch placeholder="Search modules, lessons, topics, articles, flashcards, questions... (Ctrl+K)" />
      </div>

      {/* Section Cards */}
      <div className="admin-learn__sections">
        <Link href="/admin/learn/roadmap" className="admin-learn__section-card" style={{ borderColor: '#1D3095', borderWidth: '2px' }}>
          <span className="admin-learn__section-icon">🗺️</span>
          <h3 className="admin-learn__section-title">My Roadmap</h3>
          <p className="admin-learn__section-desc">
            Track your progress through the full Texas Land Surveying curriculum — 28 modules, 9 parts, from foundations to RPLS exam readiness.
          </p>
          <span className="admin-learn__section-arrow">View Roadmap →</span>
        </Link>

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

        <Link href="/admin/learn/exam-prep" className="admin-learn__section-card" style={{ borderColor: '#BD1218', borderWidth: '2px' }}>
          <span className="admin-learn__section-icon">📝</span>
          <h3 className="admin-learn__section-title">Exam Prep (FS / RPLS)</h3>
          <p className="admin-learn__section-desc">
            Comprehensive FS exam preparation with 8 study modules, 270+ practice questions, timed mock exams, and progress tracking.
            Complete module quizzes to unlock the next level.
          </p>
          <span className="admin-learn__section-arrow" style={{ color: '#BD1218' }}>Start Exam Prep →</span>
        </Link>

        <Link href="/admin/learn/fieldbook" className="admin-learn__section-card">
          <span className="admin-learn__section-icon">📓</span>
          <h3 className="admin-learn__section-title">My Fieldbook</h3>
          <p className="admin-learn__section-desc">
            Keep all your study notes in one place. Notes automatically record the date, time, and what page you were on when you wrote them.
          </p>
          <span className="admin-learn__section-arrow">Open Fieldbook →</span>
        </Link>

        {(role === 'admin' || role === 'teacher') && (
          <Link href="/admin/learn/students" className="admin-learn__section-card" style={{ borderColor: '#1D3095' }}>
            <span className="admin-learn__section-icon">👨‍🎓</span>
            <h3 className="admin-learn__section-title">Student Progress</h3>
            <p className="admin-learn__section-desc">
              View student learning activity, quiz scores, module completions, and XP.
            </p>
            <span className="admin-learn__section-arrow" style={{ color: '#1D3095' }}>View Students →</span>
          </Link>
        )}

        {(role === 'admin' || role === 'teacher') && (
          <Link href="/admin/learn/manage" className="admin-learn__section-card" style={{ borderColor: '#BD1218' }}>
            <span className="admin-learn__section-icon">✏️</span>
            <h3 className="admin-learn__section-title">Manage Content</h3>
            <p className="admin-learn__section-desc">
              Create and edit modules, lessons, questions, flashcards, and articles.
            </p>
            <span className="admin-learn__section-arrow" style={{ color: '#BD1218' }}>Manage →</span>
          </Link>
        )}
      </div>
    </>
  );
}
