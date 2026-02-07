// app/admin/learn/flashcards/page.tsx
'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import FieldbookButton from '@/app/admin/components/FieldbookButton';
import { usePageError } from '../../hooks/usePageError';

interface Flashcard {
  id: string; term: string; definition: string;
  hint_1?: string; hint_2?: string; hint_3?: string;
  keywords?: string[]; tags?: string[];
  source: 'builtin' | 'user'; module_id?: string;
  ease_factor?: number; interval_days?: number;
  next_review_at?: string; times_reviewed?: number; times_correct?: number;
}

type FilterMode = 'all' | 'builtin' | 'user' | 'due';
type ViewMode = 'browse' | 'study' | 'study-setup' | 'create';
type StudyType = 'term' | 'definition' | 'mixed';

export default function FlashcardsPage() {
  const { safeFetch, safeAction } = usePageError('FlashcardsPage');
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [mode, setMode] = useState<ViewMode>('browse');
  const [studyType, setStudyType] = useState<StudyType>('term');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [hintsShown, setHintsShown] = useState(0);
  const [showRelated, setShowRelated] = useState(false);
  const [relatedLinks, setRelatedLinks] = useState<any[]>([]);
  const [searchingRelated, setSearchingRelated] = useState(false);
  const [shuffled, setShuffled] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const mountedRef = useRef(true);

  // For mixed mode: pre-generate which side shows first for each card
  const [mixedSides, setMixedSides] = useState<boolean[]>([]);

  // Create form state
  const [newTerm, setNewTerm] = useState('');
  const [newDef, setNewDef] = useState('');
  const [newH1, setNewH1] = useState('');
  const [newH2, setNewH2] = useState('');
  const [newH3, setNewH3] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    fetchCards();
    return () => { mountedRef.current = false; };
  }, []);

  async function fetchCards() {
    setLoading(true);
    setReady(false);
    try {
      const res = await fetch('/api/admin/learn/flashcards');
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setCards(data.cards || []);
      }
    } catch (err) { console.error('FlashcardsPage: failed to fetch cards', err); }
    if (mountedRef.current) {
      setLoading(false);
      setReady(true);
    }
  }

  async function createCard() {
    if (!newTerm.trim() || !newDef.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/learn/flashcards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: newTerm, definition: newDef,
          hint_1: newH1 || null, hint_2: newH2 || null, hint_3: newH3 || null,
          keywords: newKeywords.split(',').map(k => k.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCards(prev => [...prev, data.card]);
        setNewTerm(''); setNewDef(''); setNewH1(''); setNewH2(''); setNewH3(''); setNewKeywords('');
        setMode('browse');
      }
    } catch (err) { console.error('FlashcardsPage: failed to create card', err); }
    setSaving(false);
  }

  async function deleteCard(id: string) {
    if (!confirm('Delete this flashcard?')) return;
    try {
      await fetch(`/api/admin/learn/flashcards?id=${id}`, { method: 'DELETE' });
      setCards(prev => prev.filter(c => c.id !== id));
    } catch (err) { console.error('FlashcardsPage: failed to delete card', err); }
  }

  async function submitRating(rating: 'again' | 'hard' | 'good' | 'easy') {
    const card = filtered[currentIdx];
    if (!card) return;
    setRatingSubmitted(true);
    try {
      await fetch('/api/admin/learn/flashcards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: card.id,
          source: card.source,
          review_rating: rating,
        }),
      });
      setCards(prev => prev.map(c => {
        if (c.id !== card.id) return c;
        return {
          ...c,
          times_reviewed: (c.times_reviewed || 0) + 1,
          times_correct: (c.times_correct || 0) + (rating === 'good' || rating === 'easy' ? 1 : 0),
        };
      }));
    } catch (err) { console.error('FlashcardsPage: failed to submit rating', err); }
    setTimeout(() => {
      nextCard();
      setRatingSubmitted(false);
    }, 400);
  }

  async function findRelated(card: Flashcard) {
    setSearchingRelated(true);
    setShowRelated(true);
    try {
      const searchTerm = card.term;
      const res = await fetch(`/api/admin/learn/search?q=${encodeURIComponent(searchTerm)}`);
      if (res.ok) {
        const data = await res.json();
        const links: any[] = [];
        if (data.results?.lessons) links.push(...data.results.lessons.map((l: any) => ({ ...l, label: 'Lesson' })));
        if (data.results?.articles) links.push(...data.results.articles.map((a: any) => ({ ...a, label: 'Article' })));
        if (data.results?.modules) links.push(...data.results.modules.map((m: any) => ({ ...m, label: 'Module' })));
        if (data.results?.topics) links.push(...data.results.topics.map((t: any) => ({ ...t, label: 'Topic' })));
        setRelatedLinks(links.slice(0, 8));
      }
    } catch (err) { console.error('FlashcardsPage: failed to find related content', err); }
    setSearchingRelated(false);
  }

  const now = new Date();
  const filtered = cards.filter(c => {
    if (filter === 'builtin') return c.source === 'builtin';
    if (filter === 'user') return c.source === 'user';
    if (filter === 'due') {
      if (!c.next_review_at) return true;
      return new Date(c.next_review_at) <= now;
    }
    return true;
  });

  const studyCards = shuffled
    ? [...filtered].sort(() => Math.random() - 0.5)
    : filtered;

  const current = studyCards[currentIdx];
  const dueCount = cards.filter(c => !c.next_review_at || new Date(c.next_review_at) <= now).length;

  // Determine if the definition shows first for the current card
  function isDefFirst(): boolean {
    if (studyType === 'definition') return true;
    if (studyType === 'term') return false;
    // mixed: use pre-generated random sides
    return mixedSides[currentIdx] ?? false;
  }

  // Generate contextual hints based on which side is showing
  function getHints(card: Flashcard): string[] {
    const hints: string[] = [];
    if (isDefFirst()) {
      // Definition is showing first — hints should help identify the TERM
      if (card.hint_3) hints.push(card.hint_3); // partial spelling of term
      if (card.hint_2) hints.push(card.hint_2); // rhymes with / sounds like
      if (card.hint_1) hints.push(card.hint_1); // tidbit about the term
    } else {
      // Term is showing first — hints should help recall the DEFINITION
      if (card.hint_1) hints.push(card.hint_1); // tidbit about the term (relates to definition)
      if (card.hint_2) hints.push(card.hint_2); // rhymes with / sounds like
      if (card.hint_3) hints.push(card.hint_3); // partial spelling
    }
    return hints;
  }

  function getHintLabels(defFirst: boolean): string[] {
    if (defFirst) {
      return ['Show a Spelling Hint', 'How Does It Sound?', 'Give Me a Clue'];
    }
    return ['Get a Hint', 'Get Another Hint', 'One Last Hint'];
  }

  function nextCard() {
    setFlipped(false); setHintsShown(0); setShowRelated(false); setRelatedLinks([]);
    setCurrentIdx(p => (p + 1) % studyCards.length);
  }
  function prevCard() {
    setFlipped(false); setHintsShown(0); setShowRelated(false); setRelatedLinks([]);
    setCurrentIdx(p => (p - 1 + studyCards.length) % studyCards.length);
  }

  function startStudy(type: StudyType) {
    setStudyType(type);
    setCurrentIdx(0);
    setFlipped(false);
    setHintsShown(0);
    setShowRelated(false);
    setRelatedLinks([]);
    // Generate random sides for mixed mode
    if (type === 'mixed') {
      setMixedSides(filtered.map(() => Math.random() > 0.5));
    }
    setMode('study');
  }

  function flipCard() {
    setFlipped(f => !f);
  }

  function handleCardKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flipCard();
    }
  }

  if (loading || !ready) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">&#x23F3;</div>
        <div className="admin-empty__title">Loading flashcards...</div>
      </div>
    );
  }

  // CREATE MODE
  if (mode === 'create') return (
    <>
      <div className="admin-learn__header">
        <button onClick={() => setMode('browse')} className="learn__back" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          &larr; Back to Flashcards
        </button>
        <h2 className="admin-learn__title">Create Flashcard</h2>
      </div>
      <div style={{ maxWidth: '600px' }}>
        <div className="fc-form__field">
          <label className="fc-form__label">Term *</label>
          <input className="fc-form__input" value={newTerm} onChange={e => setNewTerm(e.target.value)} placeholder="e.g. Azimuth" />
        </div>
        <div className="fc-form__field">
          <label className="fc-form__label">Definition *</label>
          <textarea className="fc-form__textarea" value={newDef} onChange={e => setNewDef(e.target.value)} placeholder="The definition..." rows={3} />
        </div>
        <div className="fc-form__field">
          <label className="fc-form__label">Hint 1 (tidbit about the term)</label>
          <input className="fc-form__input" value={newH1} onChange={e => setNewH1(e.target.value)} placeholder="A helpful clue..." />
        </div>
        <div className="fc-form__field">
          <label className="fc-form__label">Hint 2 (rhymes with / sounds like)</label>
          <input className="fc-form__input" value={newH2} onChange={e => setNewH2(e.target.value)} placeholder="Rhymes with..." />
        </div>
        <div className="fc-form__field">
          <label className="fc-form__label">Hint 3 (partial spelling)</label>
          <input className="fc-form__input" value={newH3} onChange={e => setNewH3(e.target.value)} placeholder="A _ _ _ _ _ _ (7 letters)" />
        </div>
        <div className="fc-form__field">
          <label className="fc-form__label">Keywords (comma-separated)</label>
          <input className="fc-form__input" value={newKeywords} onChange={e => setNewKeywords(e.target.value)} placeholder="surveying, angles" />
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button className="admin-btn admin-btn--primary" onClick={createCard} disabled={saving || !newTerm.trim() || !newDef.trim()}>
            {saving ? 'Saving...' : 'Save Card'}
          </button>
          <button className="admin-btn admin-btn--ghost" onClick={() => setMode('browse')}>Cancel</button>
        </div>
      </div>
    </>
  );

  // STUDY SETUP — choose study type
  if (mode === 'study-setup') return (
    <>
      <div className="admin-learn__header">
        <button onClick={() => setMode('browse')} className="learn__back" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          &larr; Back to Flashcards
        </button>
        <h2 className="admin-learn__title">How do you want to study?</h2>
        <p className="admin-learn__subtitle">Choose how cards are presented. You have {studyCards.length} card{studyCards.length !== 1 ? 's' : ''} to study{filter === 'due' ? ' (due for review)' : ''}.</p>
      </div>
      <div className="fc-setup">
        <button className="fc-setup__option" onClick={() => startStudy('term')}>
          <span className="fc-setup__option-icon">Aa</span>
          <span className="fc-setup__option-title">Study by Term</span>
          <span className="fc-setup__option-desc">See the term first, then try to recall the definition.</span>
        </button>
        <button className="fc-setup__option" onClick={() => startStudy('definition')}>
          <span className="fc-setup__option-icon">&#x1F4DD;</span>
          <span className="fc-setup__option-title">Study by Definition</span>
          <span className="fc-setup__option-desc">See the definition first, then try to recall the term.</span>
        </button>
        <button className="fc-setup__option" onClick={() => startStudy('mixed')}>
          <span className="fc-setup__option-icon">&#x1F500;</span>
          <span className="fc-setup__option-title">Mix It Up</span>
          <span className="fc-setup__option-desc">Randomly shows either the term or definition first. Keeps you on your toes!</span>
        </button>
      </div>
    </>
  );

  // STUDY MODE
  if (mode === 'study' && studyCards.length > 0) {
    const defFirst = isDefFirst();
    const frontLabel = defFirst ? 'DEFINITION' : 'TERM';
    const backLabel = defFirst ? 'TERM' : 'DEFINITION';
    const frontContent = defFirst ? current?.definition : current?.term;
    const backContent = defFirst ? current?.term : current?.definition;
    const tapHint = defFirst ? 'Tap to reveal the term' : 'Tap to reveal the definition';
    const hints = current ? getHints(current) : [];
    const hintLabels = getHintLabels(defFirst);
    const modeBadge = studyType === 'term' ? 'By Term' : studyType === 'definition' ? 'By Definition' : 'Mixed';

    return (
      <>
        <div className="admin-learn__header">
          <button onClick={() => { setMode('browse'); setCurrentIdx(0); setFlipped(false); setHintsShown(0); }} className="learn__back" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            &larr; Exit Study Mode
          </button>
          <h2 className="admin-learn__title">
            Study Mode
            <span className="fc-study__mode-badge">{modeBadge}</span>
          </h2>
          <p className="admin-learn__subtitle">Card {currentIdx + 1} of {studyCards.length}{filter === 'due' ? ' (Due for Review)' : ''}</p>
        </div>
        <div className="fc-study">
          {/* Card with proper 3D flip */}
          <div
            className={`fc-study__card ${flipped ? 'fc-study__card--flipped' : ''}`}
            onClick={flipCard}
            onKeyDown={handleCardKeyDown}
            role="button"
            tabIndex={0}
            aria-label={flipped ? `${backLabel}: ${backContent}` : `${frontLabel}: ${frontContent}. Click to flip.`}
          >
            <div className="fc-study__card-inner">
              <div className="fc-study__card-front">
                <span className="fc-study__card-label">{frontLabel}</span>
                {defFirst ? (
                  <p className="fc-study__card-def">{frontContent}</p>
                ) : (
                  <h3 className="fc-study__card-term">{frontContent}</h3>
                )}
                <p className="fc-study__card-tap">{tapHint}</p>
              </div>
              <div className="fc-study__card-back">
                <span className="fc-study__card-label">{backLabel}</span>
                {defFirst ? (
                  <h3 className="fc-study__card-term">{backContent}</h3>
                ) : (
                  <p className="fc-study__card-def">{backContent}</p>
                )}
              </div>
            </div>
          </div>

          {/* Hints — always available (contextual based on study direction) */}
          {hints.length > 0 && (
            <div className="fc-study__hints">
              {hintsShown === 0 && (
                <button className="fc-study__hint-btn" onClick={() => setHintsShown(1)}>
                  {hintLabels[0]}
                </button>
              )}
              {hintsShown >= 1 && <div className="fc-study__hint"><strong>Hint 1:</strong> {hints[0]}</div>}
              {hintsShown === 1 && hints.length >= 2 && (
                <button className="fc-study__hint-btn" onClick={() => setHintsShown(2)}>
                  {hintLabels[1] || 'Another Hint'}
                </button>
              )}
              {hintsShown >= 2 && hints[1] && <div className="fc-study__hint"><strong>Hint 2:</strong> {hints[1]}</div>}
              {hintsShown === 2 && hints.length >= 3 && (
                <button className="fc-study__hint-btn" onClick={() => setHintsShown(3)}>
                  {hintLabels[2] || 'Last Hint'}
                </button>
              )}
              {hintsShown >= 3 && hints[2] && <div className="fc-study__hint"><strong>Hint 3:</strong> {hints[2]}</div>}
            </div>
          )}

          {/* Spaced Repetition Rating — only after flip */}
          {flipped && !ratingSubmitted && (
            <div className="fc-study__rating">
              <p className="fc-study__rating-label">How well did you know this?</p>
              <div className="fc-study__rating-buttons">
                <button className="fc-study__rating-btn fc-study__rating-btn--again" onClick={() => submitRating('again')}>Again</button>
                <button className="fc-study__rating-btn fc-study__rating-btn--hard" onClick={() => submitRating('hard')}>Hard</button>
                <button className="fc-study__rating-btn fc-study__rating-btn--good" onClick={() => submitRating('good')}>Good</button>
                <button className="fc-study__rating-btn fc-study__rating-btn--easy" onClick={() => submitRating('easy')}>Easy</button>
              </div>
            </div>
          )}

          {/* Card Stats */}
          {current && (current.times_reviewed || 0) > 0 && (
            <div className="fc-study__stats">
              Reviewed {current.times_reviewed}x
              {current.times_correct !== undefined && current.times_reviewed
                ? ` · ${Math.round(((current.times_correct) / current.times_reviewed) * 100)}% success`
                : ''}
            </div>
          )}

          {/* Read More — ONLY shows after card is flipped */}
          {flipped && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              {!showRelated ? (
                <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => current && findRelated(current)}>
                  Read More About This
                </button>
              ) : (
                <div className="fc-study__related">
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Related Content</h4>
                  {searchingRelated ? (
                    <p style={{ fontSize: '0.82rem', color: '#9CA3AF' }}>Searching...</p>
                  ) : relatedLinks.length === 0 ? (
                    <p style={{ fontSize: '0.82rem', color: '#9CA3AF' }}>No related content found.</p>
                  ) : (
                    relatedLinks.map((link, i) => (
                      <Link key={i} href={link.url || '#'} className="fc-study__related-link">
                        <span>{link.title || link.term}</span>
                        <span className="fc-study__related-type">{link.label}</span>
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="fc-study__nav">
            <button className="admin-btn admin-btn--ghost" onClick={prevCard}>&larr; Previous</button>
            <span style={{ fontSize: '0.85rem', color: '#6B7280' }}>{currentIdx + 1} / {studyCards.length}</span>
            <button className="admin-btn admin-btn--secondary" onClick={nextCard}>Next &rarr;</button>
          </div>
        </div>
        <FieldbookButton contextType="flashcard" contextLabel={`Flashcard: ${current?.term}`} />
      </>
    );
  }

  // BROWSE MODE
  return (
    <>
      <div className="admin-learn__header">
        <Link href="/admin/learn" className="learn__back">&larr; Back to Learning Hub</Link>
        <h2 className="admin-learn__title">Flashcards</h2>
        <p className="admin-learn__subtitle">Study terms and definitions. Use built-in cards or create your own. Spaced repetition helps you focus on cards you need to review.</p>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="admin-btn admin-btn--secondary" onClick={() => { setFilter('all'); setMode('study-setup'); }} disabled={filtered.length === 0}>
          Study All ({filtered.length})
        </button>
        {dueCount > 0 && (
          <button className="admin-btn admin-btn--primary" onClick={() => { setFilter('due'); setMode('study-setup'); }}>
            Study Due ({dueCount})
          </button>
        )}
        <button className="admin-btn admin-btn--ghost" onClick={() => setMode('create')}>+ Create Card</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto', fontSize: '0.82rem', color: '#6B7280', cursor: 'pointer' }}>
          <input type="checkbox" checked={shuffled} onChange={e => setShuffled(e.target.checked)} />
          Shuffle
        </label>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {([['all', 'All'], ['builtin', 'Built-in'], ['user', 'My Cards'], ['due', `Due (${dueCount})`]] as [FilterMode, string][]).map(([f, label]) => (
          <button key={f} className={`admin-kb__category-btn ${filter === f ? 'admin-kb__category-btn--active' : ''}`} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty__icon">&#x1F0CF;</div>
          <div className="admin-empty__title">{filter === 'due' ? 'No cards due for review' : 'No flashcards yet'}</div>
          {filter === 'due' && <div className="admin-empty__desc">All caught up! Check back later.</div>}
        </div>
      ) : (
        <div className="admin-kb__articles">
          {filtered.map(card => (
            <div key={card.id} className="admin-kb__article-card" style={{ cursor: 'default' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h4 className="admin-kb__article-title">{card.term}</h4>
                <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '10px', background: card.source === 'builtin' ? '#EFF6FF' : '#ECFDF5', color: card.source === 'builtin' ? '#1D3095' : '#065F46', flexShrink: 0 }}>
                  {card.source === 'builtin' ? 'Built-in' : 'Mine'}
                </span>
              </div>
              <p className="admin-kb__article-excerpt">{card.definition}</p>
              {card.keywords && card.keywords.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
                  {card.keywords.map(kw => <span key={kw} style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', background: '#F3F4F6', borderRadius: '8px', color: '#6B7280' }}>{kw}</span>)}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                  {card.hint_1 && <span>{[card.hint_1, card.hint_2, card.hint_3].filter(Boolean).length} hint(s)</span>}
                  {(card.times_reviewed || 0) > 0 && <span> · {card.times_reviewed}x reviewed</span>}
                </div>
                {card.source === 'user' && (
                  <button onClick={() => deleteCard(card.id)} style={{ fontSize: '0.75rem', color: '#BD1218', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <FieldbookButton contextType="flashcard" contextLabel="Flashcards" />
    </>
  );
}
