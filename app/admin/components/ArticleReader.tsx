// app/admin/components/ArticleReader.tsx — Article reader with scroll-to-bottom completion tracking
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { decodeUnicodeEscapes } from '@/lib/decodeUnicode';

interface ArticleReaderProps {
  article: {
    id: string;
    title: string;
    subtitle?: string;
    author?: string;
    content: string;
    estimated_minutes?: number;
    images?: any[];
  };
  completed: boolean;
  completedAt?: string | null;
  onComplete?: () => void;
  lessonId?: string;
  moduleId?: string;
}

export default function ArticleReader({ article, completed: initialCompleted, completedAt, onComplete, lessonId, moduleId }: ArticleReaderProps) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [hasReachedBottom, setHasReachedBottom] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Track scroll progress
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 1;
      setScrollProgress(progress);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // IntersectionObserver for bottom sentinel
  useEffect(() => {
    if (completed || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasReachedBottom(true);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [completed]);

  const handleMarkComplete = useCallback(async () => {
    if (confirming || completed) return;
    setConfirming(true);
    try {
      const res = await fetch('/api/admin/learn/articles/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: article.id }),
      });
      if (res.ok) {
        setCompleted(true);
        onComplete?.();
      }
    } catch (err) {
      console.error('Failed to mark article complete', err);
    }
    setConfirming(false);
  }, [article.id, confirming, completed, onComplete]);

  return (
    <div className="article-reader">
      {/* Progress bar */}
      {!completed && (
        <div className="article-reader__progress-bar">
          <div
            className="article-reader__progress-fill"
            style={{ width: `${scrollProgress * 100}%` }}
          />
        </div>
      )}

      {/* Header */}
      <header className="article-reader__header">
        {article.author && (
          <p className="article-reader__author">By {article.author}</p>
        )}
        <h1 className="article-reader__title">{article.title}</h1>
        {article.subtitle && (
          <p className="article-reader__subtitle">{article.subtitle}</p>
        )}
        <div className="article-reader__meta">
          {article.estimated_minutes && (
            <span className="article-reader__read-time">
              ~{article.estimated_minutes} min read
            </span>
          )}
          {completed && (
            <span className="article-reader__completed-badge">
              Completed{completedAt ? ` on ${new Date(completedAt).toLocaleDateString()}` : ''}
            </span>
          )}
        </div>
      </header>

      {/* Article Content */}
      <div
        ref={contentRef}
        className="article-reader__content"
        dangerouslySetInnerHTML={{ __html: decodeUnicodeEscapes(article.content || '') }}
      />

      {/* Bottom sentinel for IntersectionObserver */}
      <div ref={sentinelRef} className="article-reader__sentinel" />

      {/* Completion Section */}
      <div className="article-reader__completion">
        {completed ? (
          <div className="article-reader__complete-msg">
            <span className="article-reader__complete-icon">&#x2705;</span>
            <div>
              <p className="article-reader__complete-title">Article Completed</p>
              <p className="article-reader__complete-sub">
                You have finished reading this article.
                {lessonId && moduleId && ' Return to the lesson to continue.'}
              </p>
            </div>
          </div>
        ) : hasReachedBottom ? (
          <div className="article-reader__confirm-section">
            <p className="article-reader__confirm-prompt">
              You&apos;ve reached the end of the article. Ready to mark it as complete?
            </p>
            <button
              className="admin-btn admin-btn--primary article-reader__confirm-btn"
              onClick={handleMarkComplete}
              disabled={confirming}
            >
              {confirming ? 'Confirming...' : 'I Have Read This Article'}
            </button>
          </div>
        ) : (
          <div className="article-reader__scroll-hint">
            <p>Scroll to the bottom of the article to mark it as complete.</p>
            <div className="article-reader__scroll-arrow">&#x2193;</div>
          </div>
        )}
      </div>

      {/* Back to lesson link */}
      {lessonId && moduleId && (
        <div className="article-reader__back-link">
          <a href={`/admin/learn/modules/${moduleId}/${lessonId}`} className="admin-btn admin-btn--ghost">
            &larr; Back to Lesson
          </a>
        </div>
      )}
    </div>
  );
}
