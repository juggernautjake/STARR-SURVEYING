// app/admin/learn/knowledge-base/page.tsx
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePageError } from '../../hooks/usePageError';

interface Article { id: string; title: string; slug: string; category: string; tags: string[]; excerpt: string; status: string; updated_at: string; }

const CATEGORIES = ['All', 'Units & Measurements', 'Mathematics & Formulas', 'Equipment & Technology', 'Legal & Regulatory', 'Texas Land History', 'Survey Types', 'CAD & Drafting', 'Field Procedures', 'Business & Professional', 'Calculator Tips'];

export default function KnowledgeBasePage() {
  const { safeFetch, safeAction } = usePageError('KnowledgeBasePage');
  const [articles, setArticles] = useState<Article[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/learn/articles').then(r => r.json()).then(d => setArticles(d.articles || [])).catch((err) => { console.error('KnowledgeBasePage: failed to load articles', err); }).finally(() => setLoading(false));
  }, []);

  const filtered = articles.filter(a => a.status === 'published')
    .filter(a => category === 'All' || a.category === category)
    .filter(a => !search.trim() || a.title.toLowerCase().includes(search.toLowerCase()) || a.excerpt.toLowerCase().includes(search.toLowerCase()) || a.tags.some(t => t.toLowerCase().includes(search.toLowerCase())));

  if (loading) return <div className="admin-empty"><div className="admin-empty__icon">⏳</div><div className="admin-empty__title">Loading...</div></div>;

  return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn" className="learn__back">← Back to Learning Hub</Link>
        <h2 className="learn__title">🔍 Knowledge Base</h2>
        <p className="learn__subtitle">Search for any surveying topic.</p>
      </div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="admin-search">
          <span className="admin-search__icon">🔍</span>
          <input type="text" className="admin-search__input" placeholder="Search articles..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="kb__categories">
        {CATEGORIES.map((c) => <button key={c} className={`kb__cat-btn ${category === c ? 'kb__cat-btn--active' : ''}`} onClick={() => setCategory(c)}>{c}</button>)}
      </div>
      {filtered.length === 0 ? (
        <div className="admin-empty"><div className="admin-empty__icon">📄</div><div className="admin-empty__title">{articles.length === 0 ? 'No articles yet' : 'No results'}</div></div>
      ) : (
        <div className="kb__articles">
          {filtered.map((a) => (
            <Link key={a.id} href={`/admin/learn/knowledge-base/${a.slug}`} className="kb__article-card">
              <div className="kb__article-category">{a.category}</div>
              <h3 className="kb__article-title">{a.title}</h3>
              <p className="kb__article-excerpt">{a.excerpt}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
