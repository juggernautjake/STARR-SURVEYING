// app/admin/learn/articles/[id]/page.tsx — Dedicated article reading page
'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import ArticleReader from '@/app/admin/components/ArticleReader';

export default function ArticleViewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const articleId = params.id as string;
  const lessonId = searchParams.get('lesson_id') || undefined;
  const moduleId = searchParams.get('module_id') || undefined;

  const [article, setArticle] = useState<any>(null);
  const [completed, setCompleted] = useState(false);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
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
        setCompleted(data.completed || false);
        setCompletedAt(data.completed_at || null);
      }
    } catch (err) {
      console.error('Failed to fetch article', err);
    }
    setLoading(false);
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
      </div>
    );
  }

  return (
    <ArticleReader
      article={article}
      completed={completed}
      completedAt={completedAt}
      lessonId={lessonId}
      moduleId={moduleId}
      onComplete={() => {
        setCompleted(true);
        setCompletedAt(new Date().toISOString());
      }}
    />
  );
}
