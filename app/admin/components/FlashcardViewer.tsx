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

  if (cards.length === 0) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">🃏</div>
        <div className="admin-empty__title">No cards in this deck</div>
        <button onClick={onBack} className="admin-btn admin-btn--ghost admin-btn--sm">← Go Back</button>
      </div>
    );
  }

  const card = cards[currentIndex];
  const hintLabels = ['Get a Hint', 'Get Another Hint', 'Get One Last Hint'];
  const maxHints = Math.min(card.hints.length, 3);

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

  function shuffle() {
    // Shuffle is handled by randomizing the array — we just reset
    setCurrentIndex(0);
    resetCard();
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <button onClick={onBack} className="learn__back">← Back to Flashcards</button>
        <h2 className="learn__title" style={{ marginBottom: '.25rem' }}>🃏 {deckName}</h2>
      </div>

      {/* Flashcard */}
      <div className={`flashcard ${flipped ? 'flashcard--flipped' : ''}`} onClick={() => setFlipped(!flipped)}>
        <div className="flashcard__inner">
          <div className="flashcard__front">
            <div className="flashcard__label">Term</div>
            <div className="flashcard__term">{card.term}</div>
          </div>
          <div className="flashcard__back">
            <div className="flashcard__label">Definition</div>
            <div className="flashcard__definition">{card.definition}</div>
          </div>
        </div>
      </div>

      {/* Hints */}
      <div style={{ maxWidth: '520px', margin: '0 auto', textAlign: 'center' }}>
        {!flipped && (
          <div className="flashcard__hints">
            {Array.from({ length: hintsRevealed }).map((_, i) => (
              <div key={i} className="flashcard__hint">
                💡 Hint {i + 1}: {card.hints[i]}
              </div>
            ))}
            {hintsRevealed < maxHints && (
              <button
                className="flashcard__hint-btn"
                onClick={(e) => { e.stopPropagation(); setHintsRevealed((h) => h + 1); }}
              >
                💡 {hintLabels[hintsRevealed] || 'Get a Hint'}
              </button>
            )}
          </div>
        )}

        {/* Read More About This */}
        {card.linked_keywords.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <button
              className="admin-btn admin-btn--ghost admin-btn--sm"
              onClick={(e) => { e.stopPropagation(); setShowLinks(!showLinks); }}
            >
              📖 Read More About This
            </button>
            {showLinks && (
              <div className="flashcard__links" style={{ marginTop: '.5rem' }}>
                <Link href={`/admin/learn/search?q=${encodeURIComponent(card.term)}`} className="flashcard__link">
                  🔍 Search &quot;{card.term}&quot;
                </Link>
                {card.linked_module_id && (
                  <Link href={`/admin/learn/modules/${card.linked_module_id}`} className="flashcard__link">
                    📚 Related Module
                  </Link>
                )}
                {card.linked_lesson_id && card.linked_module_id && (
                  <Link href={`/admin/learn/modules/${card.linked_module_id}/${card.linked_lesson_id}`} className="flashcard__link">
                    📖 Related Lesson
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flashcard__controls">
          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={goPrev} disabled={currentIndex === 0}>
            ← Prev
          </button>
          <span className="flashcard__counter">{currentIndex + 1} / {cards.length}</span>
          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={goNext} disabled={currentIndex === cards.length - 1}>
            Next →
          </button>
        </div>

        <p style={{ marginTop: '.75rem', fontFamily: 'Inter,sans-serif', fontSize: '.75rem', color: '#9CA3AF' }}>
          Click the card to flip it
        </p>
      </div>
    </div>
  );
}
