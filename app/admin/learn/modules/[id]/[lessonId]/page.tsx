// app/admin/learn/modules/[id]/[lessonId]/page.tsx — Lesson viewer with content interaction tracking
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Topic { id: string; title: string; content: string; order_index: number; keywords: string[]; }
interface Resource { title: string; url: string; type: string; }
interface Video { title: string; url: string; description?: string; }
interface SiblingLesson { id: string; title: string; order_index: number; }
interface LessonBlock { id: string; block_type: string; content: Record<string, any>; order_index: number; style?: Record<string, any>; }

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

  // Block-based content
  const [lessonBlocks, setLessonBlocks] = useState<LessonBlock[]>([]);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Record<string, boolean>>({});
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});
  const [flashcardIndexes, setFlashcardIndexes] = useState<Record<string, number>>({});
  const [expandedPopups, setExpandedPopups] = useState<Record<string, boolean>>({});
  const [clickedLinks, setClickedLinks] = useState<Record<string, boolean>>({});
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number | null>>({});
  const [quizRevealed, setQuizRevealed] = useState<Record<string, boolean>>({});
  const [slideshowIndexes, setSlideshowIndexes] = useState<Record<string, number>>({});

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
      const [lessonRes, blocksRes] = await Promise.all([
        fetch(`/api/admin/learn/lessons?id=${lessonId}`),
        fetch(`/api/admin/learn/lesson-blocks?lesson_id=${lessonId}`),
      ]);
      if (lessonRes.ok) {
        const data = await lessonRes.json();
        setLesson(data.lesson);
        setTopics(data.topics || []);
        setQuizCount(data.quiz_question_count || 0);
      }
      if (blocksRes.ok) {
        const data = await blocksRes.json();
        setLessonBlocks((data.blocks || []).sort((a: LessonBlock, b: LessonBlock) => a.order_index - b.order_index));
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

      {/* Lesson Content — Blocks preferred, fallback to legacy HTML */}
      {lessonBlocks.length > 0 ? (
        <div className="admin-lesson__body">
          {lessonBlocks.map((block) => {
            const st: React.CSSProperties = {};
            if (block.style?.backgroundColor && block.style.backgroundColor !== '#ffffff') st.backgroundColor = block.style.backgroundColor;
            if (block.style?.borderColor && block.style?.borderWidth) st.border = `${block.style.borderWidth}px solid ${block.style.borderColor}`;
            if (block.style?.borderRadius !== undefined) st.borderRadius = `${block.style.borderRadius}px`;
            if (block.style?.boxShadow && block.style.boxShadow !== 'none') {
              const shadows: Record<string, string> = { sm: '0 1px 3px rgba(0,0,0,.1)', md: '0 4px 12px rgba(0,0,0,.1)', lg: '0 8px 24px rgba(0,0,0,.12)', xl: '0 16px 40px rgba(0,0,0,.15)' };
              st.boxShadow = shadows[block.style.boxShadow] || 'none';
            }
            if (block.style?.width && block.style.width !== 'full') {
              const widths: Record<string, string> = { wide: '80%', half: '50%', third: '33%' };
              st.maxWidth = widths[block.style.width]; st.margin = '0 auto';
            }
            if (Object.keys(st).length > 0) { st.padding = st.padding || '1rem'; st.marginBottom = '1rem'; }
            const isCollapsible = block.style?.collapsible;
            const isHidden = block.style?.hidden;
            const isCollapsed = collapsedBlocks[block.id] ?? true;

            if (isHidden && isCollapsed) {
              return (
                <div key={block.id} style={{ textAlign: 'center', margin: '1rem 0' }}>
                  <button className="admin-btn admin-btn--ghost" onClick={() => setCollapsedBlocks(prev => ({ ...prev, [block.id]: false }))} style={{ fontSize: '.85rem' }}>
                    {block.style?.hiddenLabel || 'Click to reveal'}
                  </button>
                </div>
              );
            }

            return (
              <div key={block.id} style={st}>
                {isCollapsible && (
                  <button className="lesson-builder__collapse-toggle" onClick={() => setCollapsedBlocks(prev => ({ ...prev, [block.id]: !isCollapsed }))}>
                    <span style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)', display: 'inline-block', transition: 'transform .2s' }}>&#x25BC;</span>
                    {' '}{block.style?.collapsedLabel || block.block_type}
                  </button>
                )}
                <div className={`block-collapsible-wrap ${(!isCollapsible || !isCollapsed) ? 'block-collapsible-wrap--open' : ''}`}><div>
                  {block.block_type === 'text' && <div dangerouslySetInnerHTML={{ __html: block.content.html || '' }} />}
                  {block.block_type === 'html' && <div dangerouslySetInnerHTML={{ __html: block.content.code || '' }} />}
                  {block.block_type === 'image' && block.content.url && (
                    <figure style={{ textAlign: (block.content.alignment || 'center') as any, margin: '1.5rem 0' }}>
                      <img src={block.content.url} alt={block.content.alt || ''} style={{ maxWidth: '100%', borderRadius: '8px' }} />
                      {block.content.caption && <figcaption style={{ fontSize: '.82rem', color: '#6B7280', marginTop: '.5rem' }}>{block.content.caption}</figcaption>}
                    </figure>
                  )}
                  {block.block_type === 'video' && block.content.url && (() => {
                    let embedUrl = block.content.url;
                    const ytMatch = embedUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                    if (ytMatch) embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
                    const vimeoMatch = embedUrl.match(/vimeo\.com\/(\d+)/);
                    if (vimeoMatch) embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
                    return (
                      <div style={{ margin: '1.5rem 0' }}>
                        <iframe src={embedUrl} style={{ width: '100%', aspectRatio: '16/9', border: 'none', borderRadius: '8px' }} allowFullScreen />
                        {block.content.caption && <p style={{ fontSize: '.82rem', color: '#6B7280', marginTop: '.5rem', textAlign: 'center' }}>{block.content.caption}</p>}
                      </div>
                    );
                  })()}
                  {block.block_type === 'audio' && block.content.url && (
                    <div style={{ margin: '1.5rem 0' }}>
                      {block.content.title && <p style={{ fontWeight: 600, marginBottom: '.5rem' }}>{block.content.title}</p>}
                      <audio controls src={block.content.url} style={{ width: '100%' }}>Your browser does not support audio.</audio>
                    </div>
                  )}
                  {block.block_type === 'callout' && (
                    <div className={`lesson-builder__callout lesson-builder__callout--${block.content.type || 'info'}`}>
                      <span dangerouslySetInnerHTML={{ __html: block.content.text || '' }} />
                    </div>
                  )}
                  {block.block_type === 'highlight' && (
                    <div className={`block-highlight block-highlight--${block.content.style || 'blue'}`}>
                      <span dangerouslySetInnerHTML={{ __html: block.content.text || '' }} />
                    </div>
                  )}
                  {block.block_type === 'key_takeaways' && (
                    <div className="block-takeaways">
                      <h4 className="block-takeaways__title">{block.content.title || 'Key Takeaways'}</h4>
                      <ul className="block-takeaways__list">
                        {(block.content.items || []).map((item: string, i: number) => (
                          <li key={i} className="block-takeaways__item">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {block.block_type === 'divider' && <hr style={{ border: 'none', borderTop: '2px solid #E5E7EB', margin: '2rem 0' }} />}
                  {block.block_type === 'embed' && block.content.url && (
                    <iframe src={block.content.url} style={{ width: '100%', height: `${block.content.height || 400}px`, border: '1px solid #E5E7EB', borderRadius: '8px', margin: '1.5rem 0' }} />
                  )}
                  {block.block_type === 'table' && (
                    <div style={{ overflowX: 'auto', margin: '1.5rem 0' }}>
                      <table className="lesson-builder__preview-table">
                        <thead><tr>{(block.content.headers || []).map((h: string, i: number) => <th key={i} dangerouslySetInnerHTML={{ __html: h }} />)}</tr></thead>
                        <tbody>{(block.content.rows || []).map((row: string[], ri: number) => (
                          <tr key={ri}>{row.map((cell: string, ci: number) => <td key={ci} dangerouslySetInnerHTML={{ __html: cell }} />)}</tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                  {block.block_type === 'quiz' && (() => {
                    const qKey = block.id;
                    const selected = quizAnswers[qKey] ?? null;
                    const revealed = quizRevealed[qKey] || false;
                    return (
                      <div className="block-quiz" style={{ margin: '1.5rem 0' }}>
                        <div className="block-quiz__question">{block.content.question}</div>
                        <div className="block-quiz__options">
                          {(block.content.options || []).map((opt: string, i: number) => {
                            const isCorrect = i === block.content.correct;
                            const isSelected = selected === i;
                            let cls = 'block-quiz__option';
                            if (revealed && isCorrect) cls += ' block-quiz__option--correct';
                            else if (revealed && isSelected) cls += ' block-quiz__option--wrong';
                            else if (isSelected) cls += ' block-quiz__option--selected';
                            return (
                              <button key={i} className={cls} onClick={() => { if (!revealed) setQuizAnswers(prev => ({ ...prev, [qKey]: i })); }} disabled={revealed}>
                                <span className="block-quiz__option-letter">{String.fromCharCode(65 + i)}</span>
                                <span className="block-quiz__option-text">{opt}</span>
                                {revealed && isCorrect && <span className="block-quiz__option-icon">&#x2713;</span>}
                                {revealed && isSelected && !isCorrect && <span className="block-quiz__option-icon">&#x2717;</span>}
                              </button>
                            );
                          })}
                        </div>
                        {selected !== null && !revealed && (
                          <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => { setQuizRevealed(prev => ({ ...prev, [qKey]: true })); recordInteraction(`quiz_block_${block.id}`); }} style={{ marginTop: '.75rem' }}>Check Answer</button>
                        )}
                        {revealed && (
                          <div className={`block-quiz__result ${selected === block.content.correct ? 'block-quiz__result--correct' : 'block-quiz__result--wrong'}`}>
                            <strong>{selected === block.content.correct ? 'Correct!' : 'Incorrect.'}</strong>
                            {block.content.explanation && <p style={{ margin: '.35rem 0 0' }}>{block.content.explanation}</p>}
                            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => { setQuizAnswers(prev => ({ ...prev, [qKey]: null })); setQuizRevealed(prev => ({ ...prev, [qKey]: false })); }} style={{ marginTop: '.5rem' }}>Try Again</button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {block.block_type === 'file' && block.content.url && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '1rem', background: '#F8F9FA', borderRadius: '8px', margin: '1.5rem 0', border: '1px solid #E5E7EB' }}>
                      <span style={{ fontSize: '1.5rem' }}>📎</span>
                      <div><div style={{ fontWeight: 600, fontSize: '.9rem' }}>{block.content.name || 'File'}</div></div>
                      <a href={block.content.url} download={block.content.name} className="admin-btn admin-btn--ghost admin-btn--sm" style={{ marginLeft: 'auto' }}>Download</a>
                    </div>
                  )}
                  {block.block_type === 'slideshow' && (block.content.images || []).length > 0 && (() => {
                    const images = block.content.images || [];
                    const idx = slideshowIndexes[block.id] || 0;
                    const img = images[idx];
                    if (!img) return null;
                    return (
                      <div style={{ margin: '1.5rem 0', textAlign: 'center' }}>
                        <img src={img.url} alt={img.alt || ''} style={{ maxWidth: '100%', maxHeight: '500px', borderRadius: '8px', objectFit: 'contain' }} />
                        {img.caption && <p style={{ fontSize: '.82rem', color: '#6B7280', marginTop: '.5rem' }}>{img.caption}</p>}
                        {images.length > 1 && (
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '.75rem' }}>
                            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setSlideshowIndexes(prev => ({ ...prev, [block.id]: idx <= 0 ? images.length - 1 : idx - 1 }))}>&larr;</button>
                            <span style={{ fontSize: '.82rem', color: '#6B7280' }}>{idx + 1} / {images.length}</span>
                            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setSlideshowIndexes(prev => ({ ...prev, [block.id]: idx >= images.length - 1 ? 0 : idx + 1 }))}>&rarr;</button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {block.block_type === 'link_reference' && (block.content.links || []).length > 0 && (
                    <div className="lesson-resources" style={{ margin: '1.5rem 0' }}>
                      <div className="lesson-resources__list">
                        {(block.content.links || []).map((link: any, i: number) => {
                          const linkKey = `${block.id}_link_${i}`;
                          const wasClicked = clickedLinks[linkKey];
                          return (
                            <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                              className={`lesson-resources__link ${wasClicked ? 'lesson-resources__link--reviewed' : ''}`}
                              onClick={() => { setClickedLinks(prev => ({ ...prev, [linkKey]: true })); recordInteraction(`block_link_${block.id}_${i}`); }}>
                              <span className="lesson-resources__link-status">
                                {wasClicked ? '\u2705' : '\u25CB'}
                              </span>
                              {link.type === 'pdf' ? '📄' : link.type === 'website' ? '🌐' : '📎'} {link.title || link.url}
                              {link.description && <span style={{ fontSize: '.78rem', color: '#9CA3AF', marginLeft: '.5rem' }}>{link.description}</span>}
                              <span className="lesson-resources__arrow">↗</span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {block.block_type === 'flashcard' && (block.content.cards || []).length > 0 && (() => {
                    const cards = block.content.cards || [];
                    const cardIdx = flashcardIndexes[block.id] || 0;
                    const card = cards[cardIdx];
                    const isFlipped = flippedCards[block.id] || false;
                    return (
                      <div className="block-flashcard" style={{ margin: '1.5rem 0' }}>
                        <div className={`block-flashcard__card ${isFlipped ? 'block-flashcard__card--flipped' : ''}`} onClick={() => setFlippedCards(prev => ({ ...prev, [block.id]: !isFlipped }))}>
                          <div className="block-flashcard__face block-flashcard__front">
                            <span className="block-flashcard__label">FRONT</span>
                            <p className="block-flashcard__text">{card?.front || ''}</p>
                            <span className="block-flashcard__hint">Click to flip</span>
                          </div>
                          <div className="block-flashcard__face block-flashcard__back">
                            <span className="block-flashcard__label">BACK</span>
                            <p className="block-flashcard__text">{card?.back || ''}</p>
                            <span className="block-flashcard__hint">Click to flip</span>
                          </div>
                        </div>
                        {cards.length > 1 && (
                          <div className="block-flashcard__nav">
                            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={(e) => { e.stopPropagation(); setFlippedCards(prev => ({ ...prev, [block.id]: false })); setFlashcardIndexes(prev => ({ ...prev, [block.id]: cardIdx <= 0 ? cards.length - 1 : cardIdx - 1 })); }}>&larr;</button>
                            <span style={{ fontSize: '.82rem', color: '#6B7280' }}>{cardIdx + 1} / {cards.length}</span>
                            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={(e) => { e.stopPropagation(); setFlippedCards(prev => ({ ...prev, [block.id]: false })); setFlashcardIndexes(prev => ({ ...prev, [block.id]: cardIdx >= cards.length - 1 ? 0 : cardIdx + 1 })); }}>&rarr;</button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {block.block_type === 'popup_article' && (
                    <div className="block-popup-article" style={{ margin: '1.5rem 0' }}>
                      <div className="block-popup-article__header" onClick={() => setExpandedPopups(prev => ({ ...prev, [block.id]: !prev[block.id] }))}>
                        <div>
                          <h4 className="block-popup-article__title">{block.content.title || 'Article'}</h4>
                          <p className="block-popup-article__summary">{block.content.summary || ''}</p>
                        </div>
                        <span className={`block-popup-article__chevron ${expandedPopups[block.id] ? 'block-popup-article__chevron--open' : ''}`}>&#x25BC;</span>
                      </div>
                      <div className={`block-popup-article__body ${expandedPopups[block.id] ? 'block-popup-article__body--open' : ''}`}>
                        <div className="block-popup-article__content" dangerouslySetInnerHTML={{ __html: block.content.full_content || '' }} />
                      </div>
                    </div>
                  )}
                  {block.block_type === 'backend_link' && block.content.path && (
                    <a href={block.content.path} className="block-backend-link" style={{ margin: '1.5rem 0', textDecoration: 'none' }}>
                      <span className="block-backend-link__icon">{block.content.icon || '📖'}</span>
                      <div className="block-backend-link__info">
                        <span className="block-backend-link__title">{block.content.title || 'Page'}</span>
                        {block.content.description && <span className="block-backend-link__desc">{block.content.description}</span>}
                      </div>
                      <span className="block-backend-link__arrow">→</span>
                    </a>
                  )}
                  {isHidden && !isCollapsed && (
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setCollapsedBlocks(prev => ({ ...prev, [block.id]: true }))} style={{ marginTop: '.5rem', fontSize: '.78rem' }}>Hide</button>
                  )}
                </div></div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="admin-lesson__body" dangerouslySetInnerHTML={{ __html: lesson.content || '' }} />
      )}

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
