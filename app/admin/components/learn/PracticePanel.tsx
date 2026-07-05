// app/admin/components/learn/PracticePanel.tsx
//
// Untimed, not-for-score PRACTICE for an FS module — the "practice section" that
// prepares a student for the graded module quiz. Pulls a queue of the module's
// knowledge questions + practice problems from
//   GET /api/admin/learn/exam-prep/fs/practice
// and works them one at a time through the shared <ProblemCard/>, recording a
// lightweight per-module tally (POST same route). Distinct from <QuizRunner/>.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ArrowRight, Dumbbell } from 'lucide-react';
import ProblemCard, { type ProblemData, type GradeResult } from '@/app/admin/components/learn/ProblemCard';

type Kind = 'all' | 'knowledge' | 'problems';
interface Counts { total: number; knowledge: number; problems: number; by_difficulty: Record<string, number>; genres: string[] }
interface Progress { attempted: number; correct: number; last_practiced_at?: string | null }
interface Current { problem: ProblemData; answerToken: string }

const DIFFS = ['', 'easy', 'medium', 'hard'] as const;

export default function PracticePanel({ moduleId }: { moduleId: string }) {
  const [kind, setKind] = useState<Kind>('all');
  const [difficulty, setDifficulty] = useState('');
  const [queue, setQueue] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [current, setCurrent] = useState<Current | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [progress, setProgress] = useState<Progress>({ attempted: 0, correct: 0 });
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingProblem, setLoadingProblem] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProblem = useCallback(async (questionId: string) => {
    setLoadingProblem(true); setError(null); setCurrent(null);
    try {
      const res = await fetch('/api/admin/learn/tutor-problem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch', questionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.problem) { setError(data.error || 'Could not load this problem.'); }
      else setCurrent({ problem: data.problem, answerToken: data.answerToken });
    } catch { setError('Network error — please try again.'); }
    setLoadingProblem(false);
  }, []);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true); setError(null);
    try {
      const qs = new URLSearchParams({ module_id: moduleId, kind, count: '25' });
      if (difficulty) qs.set('difficulty', difficulty);
      const res = await fetch(`/api/admin/learn/exam-prep/fs/practice?${qs}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Could not load practice.'); setLoadingQueue(false); return; }
      setCounts(data.counts || null);
      setProgress(data.progress || { attempted: 0, correct: 0 });
      const ids: string[] = (data.questions || []).map((q: { id: string }) => q.id);
      setQueue(ids); setIdx(0);
      if (ids.length) loadProblem(ids[0]); else setCurrent(null);
    } catch { setError('Network error — please try again.'); }
    setLoadingQueue(false);
  }, [moduleId, kind, difficulty, loadProblem]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  function next() {
    const n = idx + 1;
    if (n >= queue.length) { loadQueue(); return; } // exhausted → reshuffle a fresh set
    setIdx(n); loadProblem(queue[n]);
  }

  async function another(fromId: string) {
    setLoadingProblem(true); setError(null); setCurrent(null);
    try {
      const res = await fetch('/api/admin/learn/tutor-problem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'another', questionId: fromId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.problem) setError(data.error || 'Could not load another problem.');
      else setCurrent({ problem: data.problem, answerToken: data.answerToken });
    } catch { setError('Network error — please try again.'); }
    setLoadingProblem(false);
  }

  function onGraded(_p: ProblemData, result: GradeResult) {
    if (!result.gradable) return; // written answers aren't auto-scored
    fetch('/api/admin/learn/exam-prep/fs/practice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_id: moduleId, question_id: _p.id, is_correct: result.correct }),
    }).then((r) => r.ok ? r.json() : null).then((d) => { if (d?.progress) setProgress(d.progress); }).catch(() => {});
  }

  const pct = progress.attempted > 0 ? Math.round((progress.correct / progress.attempted) * 100) : 0;

  return (
    <div className="fs-module__practice">
      <div className="fs-practice__head">
        <div className="fs-practice__intro">
          <h3><Dumbbell size={17} style={{ verticalAlign: '-3px', marginRight: '.4rem' }} />Practice</h3>
          <p>Work through this module&apos;s questions untimed — it doesn&apos;t affect your score. Drill until you&apos;re ready for the quiz.</p>
        </div>
        {progress.attempted > 0 && (
          <div className="fs-practice__stat" title="Your practice tally for this module">
            <span className="fs-practice__stat-num">{progress.attempted}</span> practiced
            <span className="fs-practice__stat-sep">·</span>
            <span className="fs-practice__stat-num">{pct}%</span> correct
          </div>
        )}
      </div>

      <div className="fs-practice__filters">
        <div className="fs-practice__chips" role="group" aria-label="Question kind">
          {(['all', 'knowledge', 'problems'] as Kind[]).map((k) => (
            <button key={k} className={`fs-practice__chip ${kind === k ? 'is-active' : ''}`} onClick={() => setKind(k)}>
              {k === 'all' ? `All${counts ? ` (${counts.total})` : ''}`
                : k === 'knowledge' ? `Knowledge${counts ? ` (${counts.knowledge})` : ''}`
                : `Problems${counts ? ` (${counts.problems})` : ''}`}
            </button>
          ))}
        </div>
        <label className="fs-practice__diff">
          Difficulty
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            {DIFFS.map((d) => (
              <option key={d || 'any'} value={d}>
                {d ? d[0].toUpperCase() + d.slice(1) : 'Any'}
                {d && counts ? ` (${counts.by_difficulty[d] ?? 0})` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="ai-tutor__error" style={{ marginBottom: '.75rem' }}>{error}</div>}

      {loadingQueue || loadingProblem ? (
        <div className="fs-practice__loading"><Loader2 size={20} className="spin" /> Loading a problem…</div>
      ) : !queue.length ? (
        <div className="admin-empty" style={{ padding: '2rem' }}>
          <div className="admin-empty__title">No practice questions match</div>
          <div className="admin-empty__desc">Try a different difficulty or the “All” filter.</div>
        </div>
      ) : current ? (
        <>
          <ProblemCard key={`${current.problem.id}-${idx}`} problem={current.problem}
            answerToken={current.answerToken} onGraded={onGraded} onAnother={another} />
          <div className="fs-practice__nav">
            <span className="fs-practice__pos">{Math.min(idx + 1, queue.length)} / {queue.length}</span>
            <button className="admin-btn admin-btn--primary" onClick={next}>
              Next problem <ArrowRight size={15} />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
