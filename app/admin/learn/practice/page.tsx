// app/admin/learn/practice/page.tsx
'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface ProblemType {
  id: string; name: string; description: string; category: string; module: number; difficulties: string[];
}

interface ProblemConfig { typeId: string; typeName: string; count: number; difficulty: string; }

interface Problem {
  id: string; question_text: string; question_type: string; options?: string[];
  difficulty: string; category: string; subcategory: string; tags: string[]; tolerance: number;
}

interface SolutionStep {
  step_number: number; title: string; description?: string; formula?: string; calculation?: string; result?: string;
}

interface AnswerResult {
  problem_id: string; is_correct: boolean; is_close: boolean; user_answer: string;
  correct_answer: string; difference: number | null; feedback: string;
  rounding_warning?: string; solution_steps: SolutionStep[]; explanation: string;
}

type Phase = 'setup' | 'active' | 'results';

export default function PracticeSessionPage() {
  const [categories, setCategories] = useState<Record<string, ProblemType[]>>({});
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('setup');

  // Setup state
  const [configs, setConfigs] = useState<ProblemConfig[]>([{ typeId: '', typeName: '', count: 5, difficulty: 'medium' }]);
  const [randomize, setRandomize] = useState(true);

  // Active session state
  const [sessionId, setSessionId] = useState('');
  const [problems, setProblems] = useState<Problem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [solutionViewed, setSolutionViewed] = useState<Record<string, { steps: SolutionStep[]; explanation: string; correct_answer: string }>>({});
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<number>(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Results state
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [summary, setSummary] = useState<{ total: number; correct: number; close: number; incorrect: number; score_percent: number; passed: boolean } | null>(null);
  const [expandedSolutions, setExpandedSolutions] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/admin/learn/practice?action=types')
      .then(r => r.json())
      .then(d => setCategories(d.categories || {}))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (phase === 'active') {
      timerRef.current = Date.now();
      timerIntervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - timerRef.current) / 1000));
      }, 1000);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [phase]);

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function addConfig() {
    setConfigs(prev => [...prev, { typeId: '', typeName: '', count: 5, difficulty: 'medium' }]);
  }

  function removeConfig(idx: number) {
    setConfigs(prev => prev.filter((_, i) => i !== idx));
  }

  function updateConfig(idx: number, field: keyof ProblemConfig, value: string | number) {
    setConfigs(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      const updated = { ...c, [field]: value };
      if (field === 'typeId') {
        // Find the type name
        for (const types of Object.values(categories)) {
          const found = types.find(t => t.id === value);
          if (found) { updated.typeName = found.name; break; }
        }
      }
      return updated;
    }));
  }

  async function startSession() {
    const validConfigs = configs.filter(c => c.typeId && c.count > 0);
    if (validConfigs.length === 0) { alert('Please select at least one problem type.'); return; }

    setGenerating(true);
    try {
      const config = validConfigs.map(c => ({ typeId: c.typeId, count: c.count }));
      const res = await fetch(`/api/admin/learn/practice?action=generate&randomize=${randomize}&config=${encodeURIComponent(JSON.stringify(config))}`);
      const data = await res.json();
      if (data.problems && data.problems.length > 0) {
        setSessionId(data.session_id);
        setProblems(data.problems);
        setAnswers({});
        setSkippedIds(new Set());
        setSolutionViewed({});
        setCurrentIdx(0);
        setElapsed(0);
        setPhase('active');
      } else {
        alert('No problems generated. Please check your selections.');
      }
    } catch (e) { console.error(e); alert('Failed to generate problems.'); }
    setGenerating(false);
  }

  async function seeSolution(problemId: string) {
    // Mark as skipped (auto-miss)
    setSkippedIds(prev => new Set([...prev, problemId]));

    try {
      const res = await fetch('/api/admin/learn/practice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'see_solution', session_id: sessionId, problem_id: problemId }),
      });
      const data = await res.json();
      if (data.solution_steps) {
        setSolutionViewed(prev => ({
          ...prev,
          [problemId]: { steps: data.solution_steps, explanation: data.explanation, correct_answer: data.correct_answer },
        }));
      }
    } catch { /* show error */ }
  }

  async function submitSession() {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setSubmitting(true);
    try {
      const answerList = problems.map(p => ({
        problem_id: p.id,
        user_answer: skippedIds.has(p.id) ? '' : (answers[p.id] || ''),
        correct_answer: '', // Server has it
        question_type: p.question_type,
        tolerance: p.tolerance,
      }));

      const res = await fetch('/api/admin/learn/practice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_session',
          session_id: sessionId,
          answers: answerList,
          time_spent_seconds: elapsed,
        }),
      });
      const data = await res.json();
      setResults(data.results || []);
      setSummary(data.summary || null);
      setPhase('results');
    } catch (e) { console.error(e); alert('Failed to submit session.'); }
    setSubmitting(false);
  }

  function toggleSolution(id: string) {
    setExpandedSolutions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allTypes = Object.values(categories).flat();
  const totalProblems = configs.reduce((s, c) => s + (c.typeId ? c.count : 0), 0);
  const currentProblem = problems[currentIdx];
  const answeredCount = Object.keys(answers).length + skippedIds.size;

  if (loading) return (
    <div className="admin-empty">
      <div className="admin-empty__icon">&#x23F3;</div>
      <div className="admin-empty__title">Loading practice session...</div>
    </div>
  );

  // ===================== SETUP PHASE =====================
  if (phase === 'setup') return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn" className="learn__back">&larr; Back to Learning Hub</Link>
        <h2 className="learn__title">Practice Session</h2>
        <p className="learn__subtitle">Configure your practice session. Select problem types, difficulty, and quantity. Procedurally generated problems with step-by-step solutions.</p>
      </div>

      <div style={{ maxWidth: 800 }}>
        {configs.map((cfg, idx) => (
          <div key={idx} className="practice-config-row" style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 10, padding: '1.25rem', marginBottom: '.75rem', display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'Sora,sans-serif', fontSize: '.85rem', fontWeight: 600, color: '#1D3095' }}>Problem Set {idx + 1}</span>
              {configs.length > 1 && (
                <button onClick={() => removeConfig(idx)} style={{ background: 'none', border: 'none', color: '#BD1218', cursor: 'pointer', fontSize: '.85rem', fontWeight: 600 }}>Remove</button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '2 1 250px' }}>
                <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: '.25rem' }}>Problem Type</label>
                <select
                  value={cfg.typeId}
                  onChange={e => updateConfig(idx, 'typeId', e.target.value)}
                  style={{ width: '100%', padding: '.5rem .7rem', border: '1.5px solid #E5E7EB', borderRadius: 6, fontFamily: 'Inter,sans-serif', fontSize: '.85rem', background: '#FFF' }}
                >
                  <option value="">-- Select a problem type --</option>
                  {Object.entries(categories).map(([catName, types]) => (
                    <optgroup key={catName} label={catName}>
                      {types.map(t => (
                        <option key={t.id} value={t.id}>{t.name} — {t.description}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div style={{ flex: '0 0 100px' }}>
                <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: '.25rem' }}>Quantity</label>
                <input
                  type="number" min={1} max={50}
                  value={cfg.count}
                  onChange={e => updateConfig(idx, 'count', parseInt(e.target.value) || 1)}
                  style={{ width: '100%', padding: '.5rem .7rem', border: '1.5px solid #E5E7EB', borderRadius: 6, fontFamily: 'Inter,sans-serif', fontSize: '.85rem' }}
                />
              </div>

              <div style={{ flex: '0 0 120px' }}>
                <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: '.25rem' }}>Difficulty</label>
                <select
                  value={cfg.difficulty}
                  onChange={e => updateConfig(idx, 'difficulty', e.target.value)}
                  style={{ width: '100%', padding: '.5rem .7rem', border: '1.5px solid #E5E7EB', borderRadius: 6, fontFamily: 'Inter,sans-serif', fontSize: '.85rem', background: '#FFF' }}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                  <option value="very_hard">Very Hard</option>
                </select>
              </div>
            </div>

            {cfg.typeId && (
              <div style={{ fontSize: '.78rem', color: '#6B7280' }}>
                {allTypes.find(t => t.id === cfg.typeId)?.description || ''}
                {' '}&middot; Module {allTypes.find(t => t.id === cfg.typeId)?.module || ''}
              </div>
            )}
          </div>
        ))}

        <button onClick={addConfig} style={{
          display: 'block', width: '100%', padding: '.75rem', border: '2px dashed #D1D5DB', borderRadius: 10,
          background: '#FAFBFF', color: '#1D3095', fontFamily: 'Inter,sans-serif', fontSize: '.85rem', fontWeight: 600,
          cursor: 'pointer', marginBottom: '1.5rem', transition: 'all .15s',
        }}>
          + Add more problems to your practice session
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.85rem', color: '#374151', cursor: 'pointer' }}>
            <input type="checkbox" checked={randomize} onChange={e => setRandomize(e.target.checked)} />
            Randomize problem order
          </label>
          <span style={{ fontSize: '.85rem', color: '#6B7280' }}>
            Total: <strong style={{ color: '#1D3095' }}>{totalProblems}</strong> problems
          </span>
        </div>

        <button
          className="admin-btn admin-btn--primary"
          onClick={startSession}
          disabled={generating || totalProblems === 0}
          style={{ fontSize: '1rem', padding: '.75rem 2rem' }}
        >
          {generating ? 'Generating Problems...' : `Start Practice Session (${totalProblems} problems)`}
        </button>
      </div>
    </>
  );

  // ===================== ACTIVE SESSION =====================
  if (phase === 'active' && currentProblem) return (
    <>
      {/* Progress bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <span style={{ fontFamily: 'Sora,sans-serif', fontSize: '.9rem', fontWeight: 600, color: '#0F1419' }}>
          Question {currentIdx + 1} of {problems.length}
        </span>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '.82rem', color: '#6B7280' }}>{answeredCount}/{problems.length} answered</span>
          <span style={{ fontSize: '.82rem', color: '#6B7280', fontVariantNumeric: 'tabular-nums' }}>{formatTime(elapsed)}</span>
        </div>
      </div>
      <div style={{ height: 4, background: '#F3F4F6', borderRadius: 2, marginBottom: '1.5rem' }}>
        <div style={{ height: '100%', width: `${((currentIdx + 1) / problems.length) * 100}%`, background: '#1D3095', borderRadius: 2, transition: 'width .3s' }} />
      </div>

      {/* Question nav dots */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: '1.5rem' }}>
        {problems.map((p, i) => {
          const isAnswered = !!answers[p.id] || skippedIds.has(p.id);
          const isCurrent = i === currentIdx;
          const isSkipped = skippedIds.has(p.id);
          return (
            <button key={p.id} onClick={() => setCurrentIdx(i)} style={{
              width: 28, height: 28, borderRadius: '50%', fontSize: '.7rem', fontWeight: 700, cursor: 'pointer',
              border: isCurrent ? '2px solid #1D3095' : '1px solid #E5E7EB',
              background: isSkipped ? '#FEF2F2' : isAnswered ? '#EFF6FF' : '#FFF',
              color: isSkipped ? '#BD1218' : isAnswered ? '#1D3095' : '#6B7280',
            }}>
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Question card */}
      <div className="quiz__question" style={{ maxWidth: 800 }}>
        <div className="quiz__question-header">
          <span className="quiz__question-num">Question {currentIdx + 1}</span>
          <div className="quiz__question-badges">
            <span className={`quiz__question-diff quiz__question-diff--${currentProblem.difficulty === 'very_hard' ? 'hard' : currentProblem.difficulty}`}>
              {currentProblem.difficulty.replace('_', ' ')}
            </span>
            <span className="quiz__question-type-badge">{currentProblem.subcategory}</span>
          </div>
        </div>
        <div className="quiz__question-text" style={{ whiteSpace: 'pre-line' }}>
          {currentProblem.question_text}
        </div>

        {/* Answer input */}
        {currentProblem.question_type === 'multiple_choice' && currentProblem.options ? (
          <div className="quiz__options">
            {currentProblem.options.map(opt => (
              <button key={opt} className={`quiz__option ${answers[currentProblem.id] === opt ? 'quiz__option--selected' : ''}`}
                onClick={() => setAnswers(prev => ({ ...prev, [currentProblem.id]: opt }))}
                disabled={skippedIds.has(currentProblem.id)}>
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <div className="quiz__numeric-wrap">
            <input
              type="text"
              className="quiz__text-input quiz__text-input--numeric"
              placeholder="Enter your answer..."
              value={answers[currentProblem.id] || ''}
              onChange={e => setAnswers(prev => ({ ...prev, [currentProblem.id]: e.target.value }))}
              disabled={skippedIds.has(currentProblem.id)}
              onKeyDown={e => { if (e.key === 'Enter' && currentIdx < problems.length - 1) setCurrentIdx(currentIdx + 1); }}
            />
          </div>
        )}

        {/* See Solution button */}
        {!solutionViewed[currentProblem.id] && (
          <div style={{ marginTop: '1rem' }}>
            <button
              className="admin-btn admin-btn--ghost admin-btn--sm"
              onClick={() => seeSolution(currentProblem.id)}
              style={{ color: '#BD1218', borderColor: '#FECACA' }}
            >
              Give Up &amp; See Solution (counts as incorrect)
            </button>
          </div>
        )}

        {/* Solution display (if viewed) */}
        {solutionViewed[currentProblem.id] && (
          <div style={{ marginTop: '1.25rem', padding: '1rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8 }}>
            <div style={{ fontSize: '.82rem', fontWeight: 700, color: '#BD1218', marginBottom: '.5rem' }}>
              You gave up on this problem. Correct answer: {solutionViewed[currentProblem.id].correct_answer}
            </div>
            <div style={{ fontSize: '.85rem', color: '#374151', lineHeight: 1.7 }}>
              {solutionViewed[currentProblem.id].steps.map(step => (
                <div key={step.step_number} style={{ marginBottom: '.75rem', paddingLeft: '1rem', borderLeft: '3px solid #1D3095' }}>
                  <div style={{ fontWeight: 600, color: '#1D3095', fontSize: '.82rem' }}>Step {step.step_number}: {step.title}</div>
                  {step.description && <div style={{ whiteSpace: 'pre-line' }}>{step.description}</div>}
                  {step.formula && <div style={{ fontFamily: 'monospace', background: '#F3F4F6', padding: '.3rem .6rem', borderRadius: 4, margin: '.25rem 0', fontSize: '.82rem' }}>{step.formula}</div>}
                  {step.calculation && <div style={{ whiteSpace: 'pre-line', fontFamily: 'monospace', fontSize: '.82rem' }}>{step.calculation}</div>}
                  {step.result && <div style={{ fontWeight: 600, color: '#059669' }}>{step.result}</div>}
                </div>
              ))}
              {solutionViewed[currentProblem.id].explanation && (
                <div style={{ padding: '.5rem .75rem', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 6, fontSize: '.82rem', color: '#9A3412', marginTop: '.5rem' }}>
                  {solutionViewed[currentProblem.id].explanation}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', maxWidth: 800, flexWrap: 'wrap', gap: '.5rem' }}>
        <button className="admin-btn admin-btn--ghost" disabled={currentIdx === 0} onClick={() => setCurrentIdx(currentIdx - 1)}>
          &larr; Previous
        </button>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          {currentIdx < problems.length - 1 ? (
            <button className="admin-btn admin-btn--secondary" onClick={() => setCurrentIdx(currentIdx + 1)}>
              Next &rarr;
            </button>
          ) : (
            <button className="admin-btn admin-btn--primary" onClick={submitSession} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Practice Session'}
            </button>
          )}
        </div>
      </div>

      {/* Finish early button */}
      {answeredCount > 0 && (
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={submitSession} disabled={submitting}>
            Finish Early ({answeredCount}/{problems.length} answered)
          </button>
        </div>
      )}
    </>
  );

  // ===================== RESULTS PHASE =====================
  if (phase === 'results' && summary) return (
    <>
      <div className="learn__header">
        <button onClick={() => { setPhase('setup'); setResults([]); setSummary(null); }} className="learn__back" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          &larr; New Practice Session
        </button>
        <h2 className="learn__title">Practice Session Results</h2>
      </div>

      {/* Score card */}
      <div className="quiz-results__header" style={{ maxWidth: 800 }}>
        <div className={`quiz-results__score ${summary.passed ? 'quiz-results__score--pass' : 'quiz-results__score--fail'}`}>
          {summary.score_percent}%
        </div>
        <div className="quiz-results__title">{summary.passed ? 'Great job!' : 'Keep practicing!'}</div>
        <div className="quiz-results__summary">
          {summary.correct} correct out of {summary.total} &middot; {formatTime(elapsed)}
          {summary.close > 0 && ` · ${summary.close} close (counted correct with rounding warning)`}
        </div>
      </div>

      {/* Question review */}
      <div className="quiz-results__questions" style={{ maxWidth: 800 }}>
        {results.map((r, idx) => {
          const prob = problems[idx];
          const isExpanded = expandedSolutions.has(r.problem_id);
          return (
            <div key={r.problem_id} className={`quiz-results__question ${r.is_correct ? 'quiz-results__question--correct' : 'quiz-results__question--wrong'} ${r.is_close ? 'quiz-results__question--partial' : ''}`}>
              <div className="quiz-results__question-num">
                {r.is_correct ? (r.is_close ? '~' : '\u2713') : '\u2717'} Question {idx + 1}
                {r.is_close && <span className="quiz-results__partial-badge">Rounding</span>}
                {skippedIds.has(r.problem_id) && <span style={{ fontSize: '.7rem', background: '#FEF2F2', color: '#BD1218', padding: '.1rem .4rem', borderRadius: 3, fontWeight: 700 }}>Gave Up</span>}
              </div>
              <div className="quiz-results__question-text">{prob?.question_text}</div>
              <div className="quiz-results__answer">
                <span>Your answer: <strong>{r.user_answer || '(no answer)'}</strong></span>
                <span>Correct answer: <strong style={{ color: '#059669' }}>{r.correct_answer}</strong></span>
                {r.difference !== null && <span style={{ fontSize: '.78rem', color: '#6B7280' }}>Difference: {r.difference.toFixed(6)}</span>}
              </div>
              {r.rounding_warning && (
                <div style={{ marginTop: '.5rem', padding: '.5rem .75rem', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 6, fontSize: '.78rem', color: '#92400E' }}>
                  {r.rounding_warning}
                </div>
              )}

              {/* Expandable solution */}
              <button onClick={() => toggleSolution(r.problem_id)} style={{
                background: 'none', border: 'none', color: '#1D3095', cursor: 'pointer',
                fontSize: '.82rem', fontWeight: 600, marginTop: '.5rem', padding: 0,
              }}>
                {isExpanded ? 'Hide Solution' : 'Show Step-by-Step Solution'}
              </button>
              {isExpanded && r.solution_steps && r.solution_steps.length > 0 && (
                <div style={{ marginTop: '.75rem', padding: '1rem', background: '#F8F9FA', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  {r.solution_steps.map(step => (
                    <div key={step.step_number} style={{ marginBottom: '.75rem', paddingLeft: '1rem', borderLeft: '3px solid #1D3095' }}>
                      <div style={{ fontWeight: 600, color: '#1D3095', fontSize: '.82rem' }}>Step {step.step_number}: {step.title}</div>
                      {step.description && <div style={{ fontSize: '.85rem', color: '#374151', whiteSpace: 'pre-line' }}>{step.description}</div>}
                      {step.formula && <div style={{ fontFamily: 'monospace', background: '#FFF', padding: '.3rem .6rem', borderRadius: 4, margin: '.25rem 0', fontSize: '.82rem', border: '1px solid #E5E7EB' }}>{step.formula}</div>}
                      {step.calculation && <div style={{ whiteSpace: 'pre-line', fontFamily: 'monospace', fontSize: '.82rem', color: '#374151' }}>{step.calculation}</div>}
                      {step.result && <div style={{ fontWeight: 600, color: '#059669', fontSize: '.85rem' }}>{step.result}</div>}
                    </div>
                  ))}
                  {r.explanation && (
                    <div className="quiz-results__explanation">{r.explanation}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '.75rem', marginTop: '1.5rem' }}>
        <button className="admin-btn admin-btn--primary" onClick={() => { setPhase('setup'); setResults([]); setSummary(null); }}>
          New Practice Session
        </button>
        <Link href="/admin/learn" className="admin-btn admin-btn--ghost">Back to Learning Hub</Link>
      </div>
    </>
  );

  return null;
}
