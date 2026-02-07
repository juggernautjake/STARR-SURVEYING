// app/admin/components/FillBlankQuestion.tsx
'use client';
import { useState } from 'react';

interface FillBlankProps {
  questionText: string;
  options: string[];
  blanks: string[];
  onChange: (blanks: string[]) => void;
  disabled?: boolean;
  results?: { correctAnswers: string[]; isCorrect: boolean[] } | null;
}

interface Segment { type: 'text' | 'blank'; content: string; }

function parseSegments(text: string): Segment[] {
  const parts = text.split(/(\{\{BLANK\}\})/g);
  return parts
    .filter(p => p.length > 0)
    .map(part => ({
      type: part === '{{BLANK}}' ? 'blank' as const : 'text' as const,
      content: part === '{{BLANK}}' ? '' : part,
    }));
}

export default function FillBlankQuestion({ questionText, options, blanks, onChange, disabled, results }: FillBlankProps) {
  const [draggedWord, setDraggedWord] = useState<string | null>(null);

  const segments = parseSegments(questionText);
  const blankCount = segments.filter(s => s.type === 'blank').length;

  // Ensure blanks array matches blank count
  while (blanks.length < blankCount) blanks.push('');

  const usedWords = blanks.filter(b => b !== '');
  const availableWords = options.filter(w => !usedWords.includes(w));

  function handleDragStart(e: React.DragEvent, word: string) {
    if (disabled) return;
    setDraggedWord(word);
    e.dataTransfer.setData('text/plain', word);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(e: React.DragEvent, blankIndex: number) {
    e.preventDefault();
    if (disabled) return;
    const word = e.dataTransfer.getData('text/plain') || draggedWord;
    if (!word) return;
    const newBlanks = [...blanks];
    newBlanks[blankIndex] = word;
    onChange(newBlanks);
    setDraggedWord(null);
  }

  function handleDragOver(e: React.DragEvent) {
    if (disabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleRemove(blankIndex: number) {
    if (disabled) return;
    const newBlanks = [...blanks];
    newBlanks[blankIndex] = '';
    onChange(newBlanks);
  }

  // Click-to-place for mobile: click word, then click blank
  const [selectedWord, setSelectedWord] = useState<string | null>(null);

  function handleWordClick(word: string) {
    if (disabled) return;
    if (selectedWord === word) {
      setSelectedWord(null);
      return;
    }
    setSelectedWord(word);
    // Auto-place in first empty blank
    const firstEmpty = blanks.findIndex(b => b === '');
    if (firstEmpty !== -1) {
      const newBlanks = [...blanks];
      newBlanks[firstEmpty] = word;
      onChange(newBlanks);
      setSelectedWord(null);
    }
  }

  function handleBlankClick(blankIndex: number) {
    if (disabled) return;
    if (selectedWord && blanks[blankIndex] === '') {
      const newBlanks = [...blanks];
      newBlanks[blankIndex] = selectedWord;
      onChange(newBlanks);
      setSelectedWord(null);
    }
  }

  let blankIdx = 0;

  return (
    <div className="fill-blank">
      <div className="fill-blank__text">
        {segments.map((seg, i) => {
          if (seg.type === 'text') {
            return <span key={i}>{seg.content}</span>;
          }
          const idx = blankIdx++;
          const answer = blanks[idx] || '';
          const isCorrect = results ? results.isCorrect[idx] : undefined;
          const correctAnswer = results ? results.correctAnswers[idx] : undefined;

          return (
            <span
              key={i}
              className={`fill-blank__slot${answer ? ' fill-blank__slot--filled' : ''}${
                results ? (isCorrect ? ' fill-blank__slot--correct' : ' fill-blank__slot--incorrect') : ''
              }${selectedWord && !answer ? ' fill-blank__slot--target' : ''}`}
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, idx)}
              onClick={() => handleBlankClick(idx)}
            >
              {answer ? (
                <>
                  <span className="fill-blank__slot-word">{answer}</span>
                  {!disabled && (
                    <button
                      className="fill-blank__slot-remove"
                      onClick={e => { e.stopPropagation(); handleRemove(idx); }}
                      title="Remove word"
                      type="button"
                    >
                      &times;
                    </button>
                  )}
                </>
              ) : (
                <span className="fill-blank__slot-placeholder">
                  {selectedWord ? 'tap to place' : 'drag here'}
                </span>
              )}
              {results && !isCorrect && correctAnswer && (
                <span className="fill-blank__slot-answer">{correctAnswer}</span>
              )}
            </span>
          );
        })}
      </div>

      {/* Word Pool */}
      {!results && availableWords.length > 0 && (
        <div className="fill-blank__pool">
          <div className="fill-blank__pool-label">Word Bank</div>
          <div className="fill-blank__pool-words">
            {availableWords.map(word => (
              <div
                key={word}
                className={`fill-blank__word${selectedWord === word ? ' fill-blank__word--selected' : ''}`}
                draggable={!disabled}
                onDragStart={e => handleDragStart(e, word)}
                onClick={() => handleWordClick(word)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleWordClick(word); }}
              >
                {word}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Partial score hint */}
      {results && blankCount > 1 && (
        <div className="fill-blank__score">
          {results.isCorrect.filter(Boolean).length} of {blankCount} blanks correct
          {results.isCorrect.every(Boolean) ? ' — Perfect!' : ''}
        </div>
      )}
    </div>
  );
}
