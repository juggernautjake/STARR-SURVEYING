// app/admin/components/learn/ProblemCard.tsx
//
// An interactive practice problem rendered inside the AI-tutor chat. Handles any
// question type, grades against /api/admin/learn/tutor-problem, reveals the
// worked steps + explanation, and offers "Explain with AI" and "Try another".
'use client';

import { useState } from 'react';
import { Check, X, ChevronDown, Sparkles, RefreshCw } from 'lucide-react';

export interface ProblemData {
  id: string;
  question_type: string;
  question_text: string;
  options: string[];
  diagram?: string;
  difficulty?: string;
}
interface Step { step_number?: number; title?: string; calculation?: string; calculation_template?: string; result?: string; result_template?: string; }
export interface GradeResult { correct: boolean; gradable: boolean; correctAnswer: string; explanation: string; solutionSteps: Step[] }

export default function ProblemCard({
  problem, answerToken, onExplain, onAnother,
}: {
  problem: ProblemData;
  answerToken: string;
  onExplain: (p: ProblemData, studentAnswer: string, result: GradeResult | null) => void;
  onAnother: (fromId: string) => void;
}) {
  const [answer, setAnswer] = useState('');
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  const type = problem.question_type;
  const isChoice = type === 'multiple_choice' || type === 'true_false';
  const isNumeric = type === 'numeric_input' || type === 'math_template';
  const submitted = result !== null;

  async function submit() {
    if (!answer.trim() || grading || submitted) return;
    setGrading(true); setError(null);
    try {
      const res = await fetch('/api/admin/learn/tutor-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grade', answerToken, answer }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Could not grade'); setGrading(false); return; }
      setResult(data as GradeResult);
    } catch { setError('Network error — please try again.'); }
    setGrading(false);
  }

  const options = type === 'true_false' && problem.options.length === 0 ? ['True', 'False'] : problem.options;

  return (
    <div className="problem-card">
      <div className="problem-card__head">
        <span className="problem-card__badge">Practice</span>
        {problem.difficulty && <span className="problem-card__diff">{problem.difficulty}</span>}
      </div>

      <div className="problem-card__q">{problem.question_text}</div>

      {problem.diagram && (
        <div className="problem-card__diagram" dangerouslySetInnerHTML={{ __html: problem.diagram }} />
      )}

      {/* Answer input by type */}
      {isChoice ? (
        <div className="problem-card__options">
          {options.map((opt, i) => {
            const chosen = answer === opt;
            const isRight = submitted && result?.correctAnswer?.toLowerCase() === opt.toLowerCase();
            const isWrongChosen = submitted && chosen && !isRight;
            return (
              <label key={i} className={`problem-card__option ${chosen ? 'is-chosen' : ''} ${isRight ? 'is-right' : ''} ${isWrongChosen ? 'is-wrong' : ''}`}>
                <input type="radio" name={`opt-${problem.id}`} value={opt} disabled={submitted}
                  checked={chosen} onChange={() => setAnswer(opt)} />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
      ) : isNumeric ? (
        <input className="problem-card__input" type="text" inputMode="decimal" placeholder="Your answer…"
          value={answer} disabled={submitted} onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
      ) : (
        <textarea className="problem-card__textarea" rows={3} placeholder="Write your answer…"
          value={answer} disabled={submitted} onChange={(e) => setAnswer(e.target.value)} />
      )}

      {error && <div className="problem-card__error">{error}</div>}

      {!submitted ? (
        <div className="problem-card__actions">
          <button className="problem-card__submit" onClick={submit} disabled={grading || !answer.trim()}>
            {grading ? 'Checking…' : 'Submit answer'}
          </button>
        </div>
      ) : (
        <>
          <div className={`problem-card__result ${result.gradable ? (result.correct ? 'is-correct' : 'is-incorrect') : 'is-written'}`}>
            {result.gradable
              ? (result.correct
                  ? <><Check size={16} /> Correct!</>
                  : <><X size={16} /> Not quite — the answer is <b>{result.correctAnswer}</b>.</>)
              : <>Answer recorded. Compare with the model answer below, or ask the tutor to review it.</>}
          </div>

          {(result.explanation || (result.solutionSteps && result.solutionSteps.length > 0)) && (
            <div className="problem-card__steps">
              <button className="problem-card__steps-toggle" onClick={() => setShowSteps((s) => !s)} aria-expanded={showSteps}>
                <ChevronDown size={14} className={showSteps ? 'rot' : ''} /> {showSteps ? 'Hide' : 'Show'} worked solution
              </button>
              {showSteps && (
                <div className="problem-card__steps-body">
                  {result.solutionSteps?.map((s, i) => (
                    <div key={i} className="problem-card__step">
                      {s.title && <div className="problem-card__step-title">{s.step_number ? `${s.step_number}. ` : ''}{s.title}</div>}
                      {(s.calculation || s.calculation_template) && <div className="problem-card__step-calc">{s.calculation || s.calculation_template}</div>}
                      {(s.result || s.result_template) && <div className="problem-card__step-res">{s.result || s.result_template}</div>}
                    </div>
                  ))}
                  {result.explanation && <div className="problem-card__explain">{result.explanation}</div>}
                </div>
              )}
            </div>
          )}

          <div className="problem-card__actions">
            <button className="problem-card__ai" onClick={() => onExplain(problem, answer, result)}>
              <Sparkles size={14} /> Explain with AI
            </button>
            <button className="problem-card__again" onClick={() => onAnother(problem.id)}>
              <RefreshCw size={14} /> Try another like this
            </button>
          </div>
        </>
      )}
    </div>
  );
}
