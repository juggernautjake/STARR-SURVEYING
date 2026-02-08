// app/admin/learn/modules/[id]/[lessonId]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { usePageError } from '../../../../hooks/usePageError';

interface Topic {
  id: string;
  title: string;
  content: string;
  order_index: number;
  keywords: string[];
}

interface Resource {
  title: string;
  url: string;
  type: string;
}

interface Video {
  title: string;
  url: string;
  description?: string;
}

export default function LessonViewerPage() {
  const params = useParams();
  const moduleId = params.id as string;
  const lessonId = params.lessonId as string;
  const { safeFetch, safeAction } = usePageError('LessonViewerPage');

  const [lesson, setLesson] = useState<any>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [quizCount, setQuizCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLesson();
    checkProgress();
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
    } catch (err) { console.error('LessonViewerPage: failed to fetch lesson', err); }
    setLoading(false);
  }

  async function checkProgress() {
    try {
      const res = await fetch(`/api/admin/learn/progress?lesson_id=${lessonId}`);
      if (res.ok) {
        const data = await res.json();
        setCompleted(data.completed);
      }
    } catch (err) { console.error('LessonViewerPage: failed to check progress', err); }
  }

  if (loading) return <div className="admin-empty"><div className="admin-empty__icon">⏳</div><div className="admin-empty__title">Loading lesson...</div></div>;
  if (!lesson) return <div className="admin-empty"><div className="admin-empty__icon">❌</div><div className="admin-empty__title">Lesson not found</div></div>;

  const resources: Resource[] = typeof lesson.resources === 'string' ? JSON.parse(lesson.resources) : (lesson.resources || []);
  const videos: Video[] = typeof lesson.videos === 'string' ? JSON.parse(lesson.videos) : (lesson.videos || []);

  return (
    <>
      {/* Navigation */}
      <div className="admin-lesson__header">
        <div className="admin-lesson__nav">
          <Link href={`/admin/learn/modules/${moduleId}`} className="admin-lesson__nav-link">← Back to Module</Link>
          {quizCount > 0 && (
            <Link href={`/admin/learn/modules/${moduleId}/${lessonId}/quiz`} className="admin-btn admin-btn--secondary admin-btn--sm">
              📝 Take Quiz ({quizCount} questions)
            </Link>
          )}
        </div>
        <h2 className="admin-lesson__title">{lesson.title}</h2>
        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: '#9CA3AF', marginTop: '0.25rem' }}>
          <span>⏱ ~{lesson.estimated_minutes} min</span>
          {lesson.tags?.length > 0 && <span>🏷 {lesson.tags.join(', ')}</span>}
        </div>
      </div>

      {/* Lesson Content */}
      <div className="admin-lesson__body" dangerouslySetInnerHTML={{ __html: lesson.content || '' }} />

      {/* Topics Section */}
      {topics.length > 0 && (
        <div className="lesson-topics">
          <h3 className="lesson-topics__title">📌 Topics in This Lesson</h3>
          {topics.sort((a, b) => a.order_index - b.order_index).map(topic => (
            <div key={topic.id} className="lesson-topics__item" id={`topic-${topic.id}`}>
              <h4 className="lesson-topics__item-title">{topic.title}</h4>
              <p className="lesson-topics__item-content">{topic.content}</p>
              {topic.keywords?.length > 0 && (
                <div className="lesson-topics__keywords">
                  {topic.keywords.map(kw => (
                    <span key={kw} className="lesson-topics__keyword">{kw}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Key Takeaways */}
      {lesson.key_takeaways?.length > 0 && (
        <div className="lesson-takeaways">
          <h3 className="lesson-takeaways__title">💡 Key Takeaways</h3>
          <ul className="lesson-takeaways__list">
            {lesson.key_takeaways.map((t: string, i: number) => (
              <li key={i} className="lesson-takeaways__item">{t}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Resources */}
      {resources.length > 0 && (
        <div className="lesson-resources">
          <h3 className="lesson-resources__title">🔗 Resources</h3>
          <div className="lesson-resources__list">
            {resources.map((r, i) => (
              <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="lesson-resources__link">
                {r.type === 'website' ? '🌐' : r.type === 'pdf' ? '📄' : '📎'} {r.title}
                <span className="lesson-resources__arrow">↗</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <div className="lesson-resources">
          <h3 className="lesson-resources__title">🎥 Videos</h3>
          <div className="lesson-resources__list">
            {videos.map((v, i) => (
              <a key={i} href={v.url} target="_blank" rel="noopener noreferrer" className="lesson-resources__link">
                🎬 {v.title}
                {v.description && <span style={{ fontSize: '0.78rem', color: '#9CA3AF', marginLeft: '0.5rem' }}>{v.description}</span>}
                <span className="lesson-resources__arrow">↗</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="admin-lesson__actions">
        {completed && (
          <span className="admin-lesson__complete-btn admin-lesson__complete-btn--completed" style={{ cursor: 'default' }}>
            ✅ Lesson Completed
          </span>
        )}

        {quizCount > 0 && (
          <Link href={`/admin/learn/modules/${moduleId}/${lessonId}/quiz`} className="admin-btn admin-btn--secondary">
            📝 {completed ? 'Retake Lesson Quiz' : 'Take Lesson Quiz'}
          </Link>
        )}

        {!completed && quizCount > 0 && (
          <p style={{ fontSize: '0.78rem', color: '#6B7280', margin: '0.5rem 0 0' }}>
            Pass the lesson quiz to mark this lesson as complete.
          </p>
        )}
      </div>
    </>
  );
}
