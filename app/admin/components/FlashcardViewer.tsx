// app/admin/components/FlashcardViewer.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Flashcard {
  id: string;
  term: string;
  definition: string;
  hints: string[];
  linked_keywords: string[];
  linked_module_id?: string;
  linked_lesson_id?: string;
}

type StudyType = 'term' | 'definition' | 'mixed';

interface FlashcardViewerProps {
  cards: Flashcard[];
  deckName: string;
  onBack: () => void;
}

export default function FlashcardViewer({ cards, deckName, onBack }: FlashcardViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [showLinks, setShowLinks] = useState(false);
  const [studyType, setStudyType] = useState<StudyType | null>(null);
  const [mixedSides, setMixedSides] = useState<boolean[]>([]);

  if (cards.length === 0) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">&#x1F0CF;</div>
        <div className="admin-empty__title">No cards in this deck</div>
        <button onClick={onBack} className="admin-btn admin-btn--ghost admin-btn--sm">&larr; Go Back</button>
      </div>
    );
  }

  // STUDY TYPE SELECTION
  if (!studyType) {
    return (
      <div>
        <div style={{ marginBottom: '1rem' }}>
          <button onClick={onBack} className="learn__back">&larr; Back to Flashcards</button>
          <h2 className="learn__title" style={{ marginBottom: '.25rem' }}>{deckName}</h2>
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '.85rem', color: '#6B7280', marginBottom: '1rem' }}>
            {cards.length} card{cards.length !== 1 ? 's' : ''} in this deck. How do you want to study?
          </p>
        </div>
        <div className="fc-setup">
          <button className="fc-setup__option" onClick={() => { setStudyType('term'); setCurrentIndex(0); resetCard(); }}>
            <span className="fc-setup__option-icon">Aa</span>
            <span className="fc-setup__option-title">Study by Term</span>
            <span className="fc-setup__option-desc">See the term first, then try to recall the definition.</span>
          </button>
          <button className="fc-setup__option" onClick={() => { setStudyType('definition'); setCurrentIndex(0); resetCard(); }}>
            <span className="fc-setup__option-icon">&#x1F4DD;</span>
            <span className="fc-setup__option-title">Study by Definition</span>
            <span className="fc-setup__option-desc">See the definition first, then try to recall the term.</span>
          </button>
          <button className="fc-setup__option" onClick={() => { setMixedSides(cards.map(() => Math.random() > 0.5)); setStudyType('mixed'); setCurrentIndex(0); resetCard(); }}>
            <span className="fc-setup__option-icon">&#x1F500;</span>
            <span className="fc-setup__option-title">Mix It Up</span>
            <span className="fc-setup__option-desc">Randomly shows either the term or definition first.</span>
          </button>
        </div>
      </div>
    );
  }

  const card = cards[currentIndex];
  const maxHints = Math.min(card.hints.length, 3);

  const defFirst = studyType === 'definition' || (studyType === 'mixed' && (mixedSides[currentIndex] ?? false));
  const frontLabel = defFirst ? 'Definition' : 'Term';
  const backLabel = defFirst ? 'Term' : 'Definition';
  const frontContent = defFirst ? card.definition : card.term;
  const backContent = defFirst ? card.term : card.definition;
  const tapHint = defFirst ? 'Tap to reveal the term' : 'Tap to reveal the definition';

  // Contextual hints
  const hints: string[] = [];
  if (defFirst) {
    // Showing definition first — hints help identify the TERM (reverse order)
    for (let i = card.hints.length - 1; i >= 0 && hints.length < 3; i--) {
      if (card.hints[i]) hints.push(card.hints[i]);
    }
  } else {
    // Showing term first — hints help recall the DEFINITION (normal order)
    for (let i = 0; i < card.hints.length && hints.length < 3; i++) {
      if (card.hints[i]) hints.push(card.hints[i]);
    }
  }

  const hintLabels = defFirst
    ? ['Show a Spelling Hint', 'How Does It Sound?', 'Give Me a Clue']
    : ['Get a Hint', 'Get Another Hint', 'One Last Hint'];

  const modeBadge = studyType === 'term' ? 'By Term' : studyType === 'definition' ? 'By Definition' : 'Mixed';

  function goNext() {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex((i) => i + 1);
      resetCard();
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      resetCard();
    }
  }

  function resetCard() {
    setFlipped(false);
    setHintsRevealed(0);
    setShowLinks(false);
  }

  function flipCard() {
    setFlipped((f) => !f);
  }

  function handleCardKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flipCard();
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <button onClick={onBack} className="learn__back">&larr; Back to Flashcards</button>
        <h2 className="learn__title" style={{ marginBottom: '.25rem' }}>
          {deckName}
          <span className="fc-study__mode-badge">{modeBadge}</span>
        </h2>
        <button
          onClick={() => setStudyType(null)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontSize: '.78rem', color: '#1D3095', padding: 0 }}
        >
          Change study mode
        </button>
      </div>

      {/* Flashcard with 3D flip */}
      <div
        className={`flashcard ${flipped ? 'flashcard--flipped' : ''}`}
        onClick={flipCard}
        onKeyDown={handleCardKeyDown}
        role="button"
        tabIndex={0}
        aria-label={flipped ? `${backLabel}: ${backContent}` : `${frontLabel}: ${frontContent}. Click to flip.`}
      >
        <div className="flashcard__inner">
          <div className="flashcard__front">
            <div className="flashcard__label">{frontLabel}</div>
            {defFirst ? (
              <div className="flashcard__definition">{frontContent}</div>
            ) : (
              <div className="flashcard__term">{frontContent}</div>
            )}
          </div>
          <div className="flashcard__back">
            <div className="flashcard__label">{backLabel}</div>
            {defFirst ? (
              <div className="flashcard__term">{backContent}</div>
            ) : (
              <div className="flashcard__definition">{backContent}</div>
            )}
          </div>
        </div>
      </div>

      {/* Hints and controls */}
      <div style={{ maxWidth: '520px', margin: '0 auto', textAlign: 'center' }}>
        {/* Hints — always available */}
        {hints.length > 0 && (
          <div className="flashcard__hints">
            {Array.from({ length: hintsRevealed }).map((_, i) => (
              <div key={i} className="flashcard__hint">
                Hint {i + 1}: {hints[i]}
              </div>
            ))}
            {hintsRevealed < hints.length && (
              <button
                className="flashcard__hint-btn"
                onClick={(e) => { e.stopPropagation(); setHintsRevealed((h) => h + 1); }}
              >
                {hintLabels[hintsRevealed] || 'Get a Hint'}
              </button>
            )}
          </div>
        )}

        {/* Read More About This — only after flip */}
        {flipped && card.linked_keywords.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <button
              className="admin-btn admin-btn--ghost admin-btn--sm"
              onClick={(e) => { e.stopPropagation(); setShowLinks(!showLinks); }}
            >
              Read More About This
            </button>
            {showLinks && (
              <div className="flashcard__links" style={{ marginTop: '.5rem' }}>
                <Link href={`/admin/learn/search?q=${encodeURIComponent(card.term)}`} className="flashcard__link">
                  Search &quot;{card.term}&quot;
                </Link>
                {card.linked_module_id && (
                  <Link href={`/admin/learn/modules/${card.linked_module_id}`} className="flashcard__link">
                    Related Module
                  </Link>
                )}
                {card.linked_lesson_id && card.linked_module_id && (
                  <Link href={`/admin/learn/modules/${card.linked_module_id}/${card.linked_lesson_id}`} className="flashcard__link">
                    Related Lesson
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flashcard__controls">
          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={goPrev} disabled={currentIndex === 0}>
            &larr; Prev
          </button>
          <span className="flashcard__counter">{currentIndex + 1} / {cards.length}</span>
          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={goNext} disabled={currentIndex === cards.length - 1}>
            Next &rarr;
          </button>
        </div>

        <p style={{ marginTop: '.75rem', fontFamily: 'Inter,sans-serif', fontSize: '.75rem', color: '#9CA3AF' }}>
          Click the card to flip it
        </p>
      </div>
    </div>
  );
}
