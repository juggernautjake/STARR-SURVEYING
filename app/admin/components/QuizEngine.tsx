// app/admin/components/QuizEngine.tsx
'use client';

import { useState } from 'react';

interface Question {
  id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'fill_blank';
  options: string[];
  correct_answer: string;
  explanation: string;
}

interface QuizEngineProps {
  questions: Question[];
  title: string;
  onComplete: (results: { total: number; correct: number; score: number; answers: Record<string, string> }) => void;
  onBack: () => void;
}

export default function QuizEngine({ questions, title, onComplete, onBack }: QuizEngineProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fillInput, setFillInput] = useState('');

  if (questions.length === 0) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">📝</div>
        <div className="admin-empty__title">No questions available</div>
        <div className="admin-empty__desc">Questions will appear once an admin adds them to the question bank.</div>
        <button onClick={onBack} className="admin-btn admin-btn--ghost admin-btn--sm">← Go Back</button>
      </div>
    );
  }

  const q = questions[currentIndex];
  const userAnswer = answers[q.id] || '';
  const isCorrect = userAnswer.toLowerCase().trim() === q.correct_answer.toLowerCase().trim();

  function selectAnswer(answer: string) {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [q.id]: answer }));
  }

  function handleSubmitAnswer() {
    if (q.question_type === 'fill_blank' && fillInput.trim()) {
      setAnswers((prev) => ({ ...prev, [q.id]: fillInput.trim() }));
    }
    setSubmitted(true);
    setShowExplanation(true);
  }

  function handleNext() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSubmitted(false);
      setShowExplanation(false);
      setFillInput('');
    } else {
      // Calculate final results
      let correct = 0;
      questions.forEach((question) => {
        const a = answers[question.id] || '';
        if (a.toLowerCase().trim() === question.correct_answer.toLowerCase().trim()) correct++;
      });
      const score = Math.round((correct / questions.length) * 100);
      onComplete({ total: questions.length, correct, score, answers });
    }
  }

  function getOptionClass(option: string): string {
    let cls = 'quiz__option';
    if (submitted) {
      cls += ' quiz__option--disabled';
      if (option === q.correct_answer) cls += ' quiz__option--correct';
      else if (option === userAnswer && option !== q.correct_answer) cls += ' quiz__option--incorrect';
    } else if (option === userAnswer) {
      cls += ' quiz__option--selected';
    }
    return cls;
  }

  const canSubmit = q.question_type === 'fill_blank' ? fillInput.trim().length > 0 : !!userAnswer;

  return (
    <div className="quiz">
      <div className="quiz__header">
        <button onClick={onBack} className="learn__back">← {title}</button>
        <div className="quiz__progress-text">
          Question {currentIndex + 1} of {questions.length}
        </div>
        <div className="admin-progress">
          <div className="admin-progress__bar">
            <div className="admin-progress__fill" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="quiz__question-card">
        <div className="quiz__question-number">Question {currentIndex + 1}</div>
        <div className="quiz__question-text">{q.question_text}</div>

        {(q.question_type === 'multiple_choice' || q.question_type === 'true_false') && (
          <div className="quiz__options">
            {q.options.map((opt, i) => (
              <div
                key={i}
                className={getOptionClass(opt)}
                onClick={() => selectAnswer(opt)}
              >
                <span className="quiz__option-marker">
                  {submitted && opt === q.correct_answer ? '✓' :
                   submitted && opt === userAnswer && opt !== q.correct_answer ? '✗' :
                   String.fromCharCode(65 + i)}
                </span>
                {opt}
              </div>
            ))}
          </div>
        )}

        {q.question_type === 'fill_blank' && !submitted && (
          <input
            type="text"
            className="quiz__fill-input"
            placeholder="Type your answer..."
            value={fillInput}
            onChange={(e) => setFillInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSubmitAnswer()}
          />
        )}

        {q.question_type === 'fill_blank' && submitted && (
          <div style={{ marginTop: '.5rem' }}>
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '.9rem' }}>
              Your answer: <strong style={{ color: isCorrect ? '#065F46' : '#BD1218' }}>{userAnswer}</strong>
            </p>
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '.9rem' }}>
              Correct answer: <strong style={{ color: '#065F46' }}>{q.correct_answer}</strong>
            </p>
          </div>
        )}

        {showExplanation && q.explanation && (
          <div className="quiz__explanation">
            💡 <strong>Explanation:</strong> {q.explanation}
          </div>
        )}
      </div>

      <div className="quiz__nav-buttons">
        <div />
        {!submitted ? (
          <button
            className="admin-btn admin-btn--primary"
            onClick={handleSubmitAnswer}
            disabled={!canSubmit}
          >
            Submit Answer
          </button>
        ) : (
          <button className="admin-btn admin-btn--secondary" onClick={handleNext}>
            {currentIndex < questions.length - 1 ? 'Next Question →' : 'See Results'}
          </button>
        )}
      </div>
    </div>
  );
}
