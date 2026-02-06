// app/admin/learn/knowledge-base/[slug]/page.tsx
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface ArticleDetail { id: string; title: string; slug: string; category: string; tags: string[]; content: string; updated_at: string; }

export default function ArticleDetailPage() {
  const { slug } = useParams() as { slug: string };
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/learn/articles?slug=${slug}`).then(r => r.json()).then(d => setArticle(d.article || null)).catch(() => {}).finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="admin-empty"><div className="admin-empty__icon">⏳</div><div className="admin-empty__title">Loading...</div></div>;
  if (!article) return <div className="admin-empty"><div className="admin-empty__icon">❌</div><div className="admin-empty__title">Article not found</div><Link href="/admin/learn/knowledge-base" className="admin-btn admin-btn--ghost admin-btn--sm">← Back</Link></div>;

  return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn/knowledge-base" className="learn__back">← Back to Knowledge Base</Link>
        <div className="kb__article-category">{article.category}</div>
        <h2 className="learn__title">{article.title}</h2>
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '.8rem', color: '#9CA3AF' }}>
          Updated {new Date(article.updated_at).toLocaleDateString()}{article.tags.length > 0 && ` · Tags: ${article.tags.join(', ')}`}
        </p>
      </div>
      <div className="lesson__body" dangerouslySetInnerHTML={{ __html: article.content }} />
    </>
  );
}
