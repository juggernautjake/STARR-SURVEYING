// app/admin/learn/modules/[id]/[lessonId]/page.tsx — Lesson viewer with content interaction tracking
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Topic { id: string; title: string; content: string; order_index: number; keywords: string[]; }
interface Resource { title: string; url: string; type: string; }
interface Video { title: string; url: string; description?: string; }
interface SiblingLesson { id: string; title: string; order_index: number; }

export default function LessonViewerPage() {
  const params = useParams();
  const router = useRouter();
  const moduleId = params.id as string;
  const lessonId = params.lessonId as string;

  const [lesson, setLesson] = useState<any>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [quizCount, setQuizCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  // Sibling lessons for next/prev navigation
  const [siblingLessons, setSiblingLessons] = useState<SiblingLesson[]>([]);

  // Content interaction tracking
  const [interactions, setInteractions] = useState<Record<string, boolean>>({});
  const [totalRequired, setTotalRequired] = useState(0);
  const [quizUnlocked, setQuizUnlocked] = useState(false);

  // Required reading articles
  const [requiredArticles, setRequiredArticles] = useState<any[]>([]);
  const [allArticlesRead, setAllArticlesRead] = useState(true);

  useEffect(() => {
    fetchLesson();
    fetchSiblingLessons();
    checkProgress();
    fetchRequiredArticles();
    markStarted();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  // Re-check when tab gains focus (user may have completed article in another tab)
  useEffect(() => {
    const handleFocus = () => {
      fetchRequiredArticles();
      checkProgress();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  async function fetchLesson() {
    try {
      const res = await fetch(`/api/admin/learn/lessons?id=${lessonId}`);
      if (res.ok) {
        const data = await res.json();
        setLesson(data.lesson);
        setTopics(data.topics || []);
        setQuizCount(data.quiz_question_count || 0);
      }
    } catch (err) { console.error('Failed to fetch lesson', err); }
    setLoading(false);
  }

  async function fetchSiblingLessons() {
    try {
      const res = await fetch(`/api/admin/learn/lessons?module_id=${moduleId}`);
      if (res.ok) {
        const data = await res.json();
        const sorted = (data.lessons || [])
          .sort((a: any, b: any) => a.order_index - b.order_index)
          .map((l: any) => ({ id: l.id, title: l.title, order_index: l.order_index }));
        setSiblingLessons(sorted);
      }
    } catch { /* silent */ }
  }

  async function checkProgress() {
    try {
      const res = await fetch(`/api/admin/learn/progress?lesson_id=${lessonId}`);
      if (res.ok) {
        const data = await res.json();
        setCompleted(data.completed);
      }
    } catch { /* silent */ }

    // Check quiz unlock
    try {
      const res = await fetch('/api/admin/learn/user-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_quiz_unlock', lesson_id: lessonId }),
      });
      if (res.ok) {
        const data = await res.json();
        setQuizUnlocked(data.quiz_unlocked);
        setTotalRequired(data.total_required);
      }
    } catch { /* silent */ }

    // Get current interaction state
    try {
      const res = await fetch(`/api/admin/learn/user-progress?module_id=${moduleId}`);
      if (res.ok) {
        const data = await res.json();
        const lessonProgress = (data.lessons || []).find((l: any) => l.id === lessonId);
        if (lessonProgress) {
          setInteractions(lessonProgress.content_interactions || {});
        }
      }
    } catch { /* silent */ }
  }

  async function fetchRequiredArticles() {
    try {
      const res = await fetch(`/api/admin/learn/articles?lesson_id=${lessonId}`);
      if (res.ok) {
        const data = await res.json();
        setRequiredArticles(data.articles || []);
        setAllArticlesRead(data.all_completed ?? true);
      }
    } catch { /* silent */ }
  }

  async function markStarted() {
    try {
      await fetch('/api/admin/learn/user-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_lesson', lesson_id: lessonId, module_id: moduleId }),
      });
    } catch { /* silent */ }
  }

  async function completeAndContinue() {
    setCompleting(true);
    try {
      const res = await fetch('/api/admin/learn/user-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete_lesson', lesson_id: lessonId, module_id: moduleId }),
      });
      if (res.ok) {
        setCompleted(true);
        // Navigate to next lesson if available
        if (nextLesson) {
          router.push(`/admin/learn/modules/${moduleId}/${nextLesson.id}`);
        }
      }
    } catch { /* silent */ }
    setCompleting(false);
  }

  const recordInteraction = useCallback(async (key: string) => {
    if (interactions[key]) return; // Already recorded
    try {
      const res = await fetch('/api/admin/learn/user-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'content_interaction',
          lesson_id: lessonId,
          module_id: moduleId,
          interaction_key: key,
        }),
      });
      if (res.ok) {
        setInteractions(prev => ({ ...prev, [key]: true }));
        // Re-check quiz unlock
        const unlockRes = await fetch('/api/admin/learn/user-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check_quiz_unlock', lesson_id: lessonId }),
        });
        if (unlockRes.ok) {
          const d = await unlockRes.json();
          setQuizUnlocked(d.quiz_unlocked);
        }
      }
    } catch { /* silent */ }
  }, [interactions, lessonId, moduleId]);

  if (loading) return <div className="admin-empty"><div className="admin-empty__icon">&#x23F3;</div><div className="admin-empty__title">Loading lesson...</div></div>;
  if (!lesson) return <div className="admin-empty"><div className="admin-empty__icon">&#x274C;</div><div className="admin-empty__title">Lesson not found</div></div>;

  let resources: Resource[] = [];
  let videos: Video[] = [];
  try { resources = typeof lesson.resources === 'string' ? JSON.parse(lesson.resources) : (lesson.resources || []); } catch { resources = []; }
  try { videos = typeof lesson.videos === 'string' ? JSON.parse(lesson.videos) : (lesson.videos || []); } catch { videos = []; }

  const completedInteractions = Object.keys(interactions).filter(k => interactions[k]).length;
  const hasRequiredContent = totalRequired > 0;
  const allContentReviewed = completedInteractions >= totalRequired;
  const canTakeQuiz = (quizUnlocked && allArticlesRead) || (!hasRequiredContent && allArticlesRead) || completed;

  // Determine next lesson
  const currentIdx = siblingLessons.findIndex(l => l.id === lessonId);
  const nextLesson = currentIdx >= 0 && currentIdx < siblingLessons.length - 1 ? siblingLessons[currentIdx + 1] : null;
  const isIntroLesson = quizCount === 0;

  return (
    <>
      {/* Navigation */}
      <div className="admin-lesson__header">
        <div className="admin-lesson__nav">
          <Link href={`/admin/learn/modules/${moduleId}`} className="admin-lesson__nav-link">&larr; Back to Module</Link>
          {quizCount > 0 && canTakeQuiz && (
            <Link href={`/admin/learn/modules/${moduleId}/${lessonId}/quiz`} className="admin-btn admin-btn--secondary admin-btn--sm">
              Take Quiz ({quizCount} questions)
            </Link>
          )}
        </div>
        <h2 className="admin-lesson__title">{lesson.title}</h2>
        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: '#9CA3AF', marginTop: '0.25rem', flexWrap: 'wrap' }}>
          <span>&#x23F1; ~{lesson.estimated_minutes} min</span>
          {lesson.tags?.length > 0 && <span>&#x1F3F7; {lesson.tags.join(', ')}</span>}
          {completed && <span style={{ color: '#10B981', fontWeight: 600 }}>&#x2705; Completed</span>}
        </div>
      </div>

      {/* Content Interaction Tracker */}
      {hasRequiredContent && !completed && (
        <div className="lesson-tracker">
          <div className="lesson-tracker__header">
            <span className="lesson-tracker__title">Content Progress</span>
            <span className="lesson-tracker__count">{completedInteractions}/{totalRequired} items reviewed</span>
          </div>
          <div className="lesson-tracker__bar">
            <div className="lesson-tracker__bar-fill" style={{ width: `${totalRequired > 0 ? (completedInteractions / totalRequired) * 100 : 0}%` }} />
          </div>
          {!allContentReviewed && (
            <p className="lesson-tracker__hint">Review all resources{requiredArticles.length > 0 ? ', articles,' : ''} and videos below to unlock the quiz.</p>
          )}
          {allContentReviewed && quizCount > 0 && (
            <p className="lesson-tracker__hint" style={{ color: '#10B981' }}>All content reviewed! Quiz is now unlocked.</p>
          )}
        </div>
      )}

      {/* Lesson Content */}
      <div className="admin-lesson__body" dangerouslySetInnerHTML={{ __html: lesson.content || '' }} />

      {/* Topics */}
      {topics.length > 0 && (
        <div className="lesson-topics">
          <h3 className="lesson-topics__title">Topics in This Lesson</h3>
          {topics.sort((a, b) => a.order_index - b.order_index).map(topic => (
            <div key={topic.id} className="lesson-topics__item" id={`topic-${topic.id}`}>
              <h4 className="lesson-topics__item-title">{topic.title}</h4>
              <p className="lesson-topics__item-content">{topic.content}</p>
              {topic.keywords?.length > 0 && (
                <div className="lesson-topics__keywords">
                  {topic.keywords.map(kw => <span key={kw} className="lesson-topics__keyword">{kw}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Key Takeaways */}
      {lesson.key_takeaways?.length > 0 && (
        <div className="lesson-takeaways">
          <h3 className="lesson-takeaways__title">Key Takeaways</h3>
          <ul className="lesson-takeaways__list">
            {lesson.key_takeaways.map((t: string, i: number) => <li key={i} className="lesson-takeaways__item">{t}</li>)}
          </ul>
        </div>
      )}

      {/* Resources (with interaction tracking) */}
      {resources.length > 0 && (
        <div className="lesson-resources">
          <h3 className="lesson-resources__title">Resources</h3>
          <div className="lesson-resources__list">
            {resources.map((r, i) => {
              const key = `resource_${i}`;
              const reviewed = interactions[key];
              return (
                <a
                  key={i}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`lesson-resources__link ${reviewed ? 'lesson-resources__link--reviewed' : ''}`}
                  onClick={() => recordInteraction(key)}
                >
                  <span className="lesson-resources__link-status">
                    {reviewed ? '\u2705' : '\u25CB'}
                  </span>
                  {r.type === 'website' ? '\u{1F310}' : r.type === 'pdf' ? '\u{1F4C4}' : '\u{1F4CE}'} {r.title}
                  <span className="lesson-resources__arrow">{'\u2197'}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Videos (with interaction tracking) */}
      {videos.length > 0 && (
        <div className="lesson-resources">
          <h3 className="lesson-resources__title">Videos</h3>
          <div className="lesson-resources__list">
            {videos.map((v, i) => {
              const key = `video_${i}`;
              const reviewed = interactions[key];
              return (
                <a
                  key={i}
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`lesson-resources__link ${reviewed ? 'lesson-resources__link--reviewed' : ''}`}
                  onClick={() => recordInteraction(key)}
                >
                  <span className="lesson-resources__link-status">
                    {reviewed ? '\u2705' : '\u25CB'}
                  </span>
                  &#x1F3AC; {v.title}
                  {v.description && <span style={{ fontSize: '0.78rem', color: '#9CA3AF', marginLeft: '0.5rem' }}>{v.description}</span>}
                  <span className="lesson-resources__arrow">{'\u2197'}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Required Reading Articles */}
      {requiredArticles.length > 0 && (
        <div className="lesson-articles">
          <h3 className="lesson-articles__title">Required Reading</h3>
          <div className="lesson-articles__list">
            {requiredArticles.map((art: any) => (
              <a
                key={art.id}
                href={`/admin/learn/articles/${art.id}?lesson_id=${lessonId}&module_id=${moduleId}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`lesson-articles__card ${art.completed ? 'lesson-articles__card--completed' : ''}`}
              >
                <span className="lesson-articles__card-status">
                  {art.completed ? '\u2705' : '\u{1F4D6}'}
                </span>
                <div className="lesson-articles__card-info">
                  <p className="lesson-articles__card-title">{art.title}</p>
                  <p className="lesson-articles__card-meta">
                    {art.author ? `By ${art.author} \u00B7 ` : ''}
                    {art.estimated_minutes ? `${art.estimated_minutes} min read` : ''}
                    {art.completed && art.completed_at ? ` \u00B7 Completed ${new Date(art.completed_at).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <span className="lesson-articles__card-arrow">{'\u2197'}</span>
              </a>
            ))}
          </div>
          {!allArticlesRead && !completed && (
            <p style={{ fontSize: '0.78rem', color: '#F59E0B', marginTop: '0.5rem' }}>
              Read all required articles to unlock the quiz.
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="admin-lesson__actions">
        {/* No-quiz intro lesson: Complete & Continue button */}
        {isIntroLesson && !completed && (
          <button
            className="admin-btn admin-btn--primary"
            onClick={completeAndContinue}
            disabled={completing}
            style={{ padding: '0.75rem 2rem', fontSize: '0.95rem' }}
          >
            {completing ? 'Completing...' : nextLesson ? `Continue to Next Lesson \u2192` : 'Mark as Complete'}
          </button>
        )}

        {/* Completed badge */}
        {completed && (
          <span className="admin-lesson__complete-btn admin-lesson__complete-btn--completed" style={{ cursor: 'default' }}>
            &#x2705; Lesson Completed
          </span>
        )}

        {/* Next Lesson button (shown after completion for all lesson types) */}
        {completed && nextLesson && (
          <Link
            href={`/admin/learn/modules/${moduleId}/${nextLesson.id}`}
            className="admin-btn admin-btn--primary"
            style={{ padding: '0.75rem 2rem', fontSize: '0.95rem' }}
          >
            Next Lesson: {nextLesson.title} &rarr;
          </Link>
        )}

        {/* Quiz actions for lessons with quizzes */}
        {quizCount > 0 && canTakeQuiz && (
          <Link href={`/admin/learn/modules/${moduleId}/${lessonId}/quiz`} className="admin-btn admin-btn--secondary">
            {completed ? 'Retake Lesson Quiz' : 'Take Lesson Quiz'}
          </Link>
        )}

        {quizCount > 0 && !canTakeQuiz && (
          <div className="lesson-quiz-locked">
            <span className="lesson-quiz-locked__icon">&#x1F512;</span>
            <span className="lesson-quiz-locked__text">
              Review all content above to unlock the quiz ({completedInteractions}/{totalRequired} done)
            </span>
          </div>
        )}

        {!completed && quizCount > 0 && canTakeQuiz && (
          <p style={{ fontSize: '0.78rem', color: '#6B7280', margin: '0.5rem 0 0' }}>
            Pass the lesson quiz to mark this lesson as complete.
          </p>
        )}

        {/* Back to Module link at bottom */}
        <Link href={`/admin/learn/modules/${moduleId}`} className="admin-btn admin-btn--ghost" style={{ marginTop: '0.5rem' }}>
          &larr; Back to Module
        </Link>
      </div>
    </>
  );
}
