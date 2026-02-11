// app/admin/learn/manage/article-editor/[id]/page.tsx — Full article editor page
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ArticleEditor from '@/app/admin/components/ArticleEditor';
import SmallScreenBanner from '@/app/admin/components/SmallScreenBanner';

export default function ArticleEditorPage() {
  const params = useParams();
  const articleId = params.id as string;
  const [article, setArticle] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchArticle();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  async function fetchArticle() {
    try {
      const res = await fetch(`/api/admin/learn/articles?id=${articleId}`);
      if (res.ok) {
        const data = await res.json();
        setArticle(data.article);
      }
    } catch (err) {
      console.error('Failed to fetch article', err);
    }
    setLoading(false);
  }

  async function handleSave(updates: any): Promise<boolean> {
    try {
      const res = await fetch('/api/admin/learn/articles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setArticle(data.article);
        return true;
      }
    } catch (err) {
      console.error('Failed to save article', err);
    }
    return false;
  }

  if (loading) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">&#x23F3;</div>
        <div className="admin-empty__title">Loading article...</div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">&#x274C;</div>
        <div className="admin-empty__title">Article not found</div>
        <Link href="/admin/learn/manage?tab=articles" className="admin-btn admin-btn--ghost" style={{ marginTop: '1rem' }}>&larr; Back to Articles</Link>
      </div>
    );
  }

  return (
    <>
      <SmallScreenBanner storageKey="article-editor-banner" />
      <div className="learn__header">
        <Link href="/admin/learn/manage?tab=articles" className="learn__back">&larr; Back to Articles</Link>
        <h2 className="learn__title">Edit Article: {article.title}</h2>
        <p className="learn__subtitle">Edit article content, metadata, and media. Use Source mode for HTML and Preview to see the rendered result.</p>
      </div>
      <ArticleEditor article={article} onSave={handleSave} />
    </>
  );
}
