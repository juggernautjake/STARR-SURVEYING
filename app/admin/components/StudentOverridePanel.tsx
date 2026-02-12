// app/admin/components/StudentOverridePanel.tsx — Admin student override panel
'use client';
import { useState } from 'react';
import { useToast } from './Toast';

interface QuizStats { attempts: number; bestScore: number; avgScore: number; totalScore: number }
interface OverrideLesson {
  id: string; title: string; order_index: number; status: string;
  quiz_unlocked: boolean; started_at: string | null; completed_at: string | null;
  is_assigned: boolean; quiz_stats: QuizStats | null;
}
interface OverrideModule {
  id: string; title: string; order_index: number; difficulty: string;
  is_completed: boolean; completion: any; is_assigned: boolean;
  total_lessons: number; completed_lessons: number;
  lessons: OverrideLesson[]; quiz_stats: QuizStats | null;
}
interface StudentOverview {
  user_email: string; total_xp: number; modules: OverrideModule[];
  flashcards_discovered: number; enrollments: string[];
  quiz_attempts_count: number; overall_avg_score: number | null;
}

export default function StudentOverridePanel() {
  const { addToast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<StudentOverview | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [gradeForm, setGradeForm] = useState<Record<string, string>>({});
  const [xpForm, setXpForm] = useState({ points: '', reason: '' });
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function loadStudent() {
    if (!email.trim()) { addToast('Enter a student email', 'warning'); return; }
    setLoading(true);
    setOverview(null);
    try {
      const res = await fetch('/api/admin/learn/admin-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_student_overview', user_email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) { addToast(data.error || 'Failed to load student', 'error'); setLoading(false); return; }
      setOverview(data);
      // Auto-expand first incomplete module
      const firstIncomplete = data.modules?.find((m: OverrideModule) => !m.is_completed);
      if (firstIncomplete) setExpandedModules(new Set([firstIncomplete.id]));
      else if (data.modules?.length) setExpandedModules(new Set([data.modules[0].id]));
    } catch { addToast('Network error', 'error'); }
    setLoading(false);
  }

  async function doAction(actionType: string, payload: Record<string, any>, label: string) {
    if (!overview) return;
    const key = `${actionType}:${payload.module_id || ''}:${payload.lesson_id || ''}`;
    setActionLoading(key);
    try {
      const res = await fetch('/api/admin/learn/admin-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType, user_email: overview.user_email, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) { addToast(data.error || `Failed: ${label}`, 'error'); setActionLoading(null); return; }
      addToast(label, 'success');
      loadStudent();
    } catch { addToast('Network error', 'error'); }
    setActionLoading(null);
  }

  function toggleModule(id: string) {
    setExpandedModules(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function isLoading(key: string) { return actionLoading === key; }
  function actionKey(action: string, modId?: string, lesId?: string) { return `${action}:${modId || ''}:${lesId || ''}`; }

  async function handleAwardXP() {
    const pts = parseInt(xpForm.points);
    if (!pts || pts <= 0) { addToast('Enter valid XP points', 'warning'); return; }
    await doAction('award_xp', { points: pts, reason: xpForm.reason || undefined }, `Awarded ${pts} XP`);
    setXpForm({ points: '', reason: '' });
  }

  async function handleManualGrade(moduleId: string, lessonId: string) {
    const key = `${moduleId}:${lessonId}`;
    const scoreStr = gradeForm[key];
    const score = parseInt(scoreStr);
    if (isNaN(score) || score < 0 || score > 100) { addToast('Enter a score between 0 and 100', 'warning'); return; }
    await doAction('manual_grade', { module_id: moduleId, lesson_id: lessonId, score_percent: score, attempt_type: 'lesson_quiz' }, `Grade recorded: ${score}%`);
    setGradeForm(prev => { const n = { ...prev }; delete n[key]; return n; });
  }

  const statusIcon = (status: string) => {
    if (status === 'completed') return '\u2705';
    if (status === 'in_progress') return '\u{1F7E1}';
    return '\u26AA';
  };

  return (
    <div className="override-panel">
      {/* Search */}
      <div className="override-panel__search">
        <input
          className="manage__form-input"
          placeholder="Enter student email..."
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadStudent()}
          style={{ flex: 1 }}
        />
        <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={loadStudent} disabled={loading}>
          {loading ? 'Loading...' : 'Load Student'}
        </button>
      </div>

      {loading && (
        <div style={{ padding: '1rem 0' }}>
          {[1,2,3].map(i => <div key={i} className="skeleton skeleton--card" style={{ height: 48, marginBottom: '0.5rem' }} />)}
        </div>
      )}

      {overview && (
        <>
          {/* Summary */}
          <div className="override-panel__summary">
            <h4 className="override-panel__email">{overview.user_email}</h4>
            <div className="override-panel__stats">
              <span className="override-panel__stat">
                <strong>{overview.total_xp}</strong> XP
              </span>
              <span className="override-panel__stat">
                <strong>{overview.modules.filter(m => m.is_completed).length}</strong>/{overview.modules.length} modules
              </span>
              <span className="override-panel__stat">
                <strong>{overview.quiz_attempts_count}</strong> quiz attempts
              </span>
              {overview.overall_avg_score !== null && (
                <span className="override-panel__stat">
                  <strong>{overview.overall_avg_score}%</strong> avg score
                </span>
              )}
              <span className="override-panel__stat">
                <strong>{overview.flashcards_discovered}</strong> flashcards
              </span>
              {overview.enrollments.length > 0 && (
                <span className="override-panel__stat">
                  ACC: {overview.enrollments.join(', ')}
                </span>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="override-panel__quick">
            <div className="override-panel__quick-row">
              <input
                className="manage__form-input"
                style={{ width: '80px' }}
                type="number"
                min="1"
                placeholder="XP"
                value={xpForm.points}
                onChange={e => setXpForm(p => ({ ...p, points: e.target.value }))}
              />
              <input
                className="manage__form-input"
                style={{ flex: 1 }}
                placeholder="Reason (optional)"
                value={xpForm.reason}
                onChange={e => setXpForm(p => ({ ...p, reason: e.target.value }))}
              />
              <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleAwardXP} disabled={!!actionLoading}>
                Award XP
              </button>
            </div>
          </div>

          {/* Modules */}
          <div className="override-panel__modules">
            {overview.modules.map(mod => {
              const expanded = expandedModules.has(mod.id);
              const pct = mod.total_lessons > 0 ? Math.round((mod.completed_lessons / mod.total_lessons) * 100) : 0;
              return (
                <div key={mod.id} className="override-module">
                  {/* Module header */}
                  <div className="override-module__header" onClick={() => toggleModule(mod.id)}>
                    <div className="override-module__info">
                      <span className="override-module__expand">{expanded ? '\u25BC' : '\u25B6'}</span>
                      <span className="override-module__order">{mod.order_index}</span>
                      <span className="override-module__title">{mod.title}</span>
                      {mod.is_completed && <span className="override-module__badge override-module__badge--completed">Completed</span>}
                      {mod.is_assigned && <span className="override-module__badge override-module__badge--assigned">Assigned</span>}
                      {!mod.is_completed && !mod.is_assigned && pct > 0 && (
                        <span className="override-module__badge override-module__badge--progress">{pct}%</span>
                      )}
                    </div>
                    <span className="override-module__meta">
                      {mod.completed_lessons}/{mod.total_lessons} lessons
                      {mod.quiz_stats && ` \u00B7 ${mod.quiz_stats.avgScore}% avg`}
                    </span>
                  </div>

                  {/* Module actions */}
                  {expanded && (
                    <div className="override-module__body">
                      <div className="override-module__actions">
                        {!mod.is_assigned && (
                          <>
                            <button
                              className="override-btn override-btn--unlock"
                              onClick={() => doAction('unlock_module', { module_id: mod.id, unlock_all_lessons: false }, `Module "${mod.title}" unlocked`)}
                              disabled={!!actionLoading}
                            >
                              {isLoading(actionKey('unlock_module', mod.id)) ? '...' : '\u{1F513} Unlock Module'}
                            </button>
                            <button
                              className="override-btn override-btn--unlock"
                              onClick={() => doAction('unlock_module', { module_id: mod.id, unlock_all_lessons: true }, `All lessons in "${mod.title}" unlocked`)}
                              disabled={!!actionLoading}
                            >
                              {isLoading(actionKey('unlock_module', mod.id)) ? '...' : '\u{1F513} Unlock All Lessons'}
                            </button>
                          </>
                        )}
                        {!mod.is_completed ? (
                          <button
                            className="override-btn override-btn--complete"
                            onClick={() => { if (confirm(`Mark entire module "${mod.title}" as completed for ${overview.user_email}? This will complete all lessons and award XP.`)) doAction('mark_module_complete', { module_id: mod.id }, `Module "${mod.title}" marked complete`); }}
                            disabled={!!actionLoading}
                          >
                            {'\u2705'} Mark Module Complete
                          </button>
                        ) : (
                          <button
                            className="override-btn override-btn--warning"
                            onClick={() => { if (confirm(`Remove module completion for "${mod.title}"? The lesson progress will remain.`)) doAction('mark_module_incomplete', { module_id: mod.id }, `Module "${mod.title}" marked incomplete`); }}
                            disabled={!!actionLoading}
                          >
                            {'\u21A9'} Mark Incomplete
                          </button>
                        )}
                        <button
                          className="override-btn override-btn--grant"
                          onClick={() => doAction('grant_flashcard_access', { module_id: mod.id }, `Flashcard access granted for "${mod.title}"`)}
                          disabled={!!actionLoading}
                        >
                          {'\u{1F0CF}'} Grant Flashcards
                        </button>
                        <button
                          className="override-btn override-btn--danger"
                          onClick={() => { if (confirm(`RESET all progress for "${mod.title}"? This removes lesson progress, module completion, and cancels assignments. This cannot be undone.`)) doAction('reset_module_progress', { module_id: mod.id }, `Progress reset for "${mod.title}"`); }}
                          disabled={!!actionLoading}
                        >
                          {'\u{1F5D1}'} Reset Module
                        </button>
                      </div>

                      {/* Lessons */}
                      <div className="override-lessons">
                        {mod.lessons.map(lesson => {
                          const gradeKey = `${mod.id}:${lesson.id}`;
                          return (
                            <div key={lesson.id} className="override-lesson">
                              <div className="override-lesson__info">
                                <span className="override-lesson__status">{statusIcon(lesson.status)}</span>
                                <span className="override-lesson__order">{lesson.order_index}.</span>
                                <span className="override-lesson__title">{lesson.title}</span>
                                {lesson.is_assigned && <span className="override-module__badge override-module__badge--assigned" style={{ fontSize: '.65rem', padding: '.1rem .35rem' }}>Assigned</span>}
                                {lesson.quiz_unlocked && <span style={{ fontSize: '.7rem', color: '#7C3AED' }}>Quiz open</span>}
                                {lesson.quiz_stats && (
                                  <span style={{ fontSize: '.7rem', color: lesson.quiz_stats.bestScore >= 70 ? '#059669' : '#DC2626' }}>
                                    Best: {lesson.quiz_stats.bestScore}% ({lesson.quiz_stats.attempts} tries)
                                  </span>
                                )}
                              </div>
                              <div className="override-lesson__actions">
                                {lesson.status !== 'completed' ? (
                                  <>
                                    {!lesson.is_assigned && (
                                      <button className="override-btn-sm" onClick={() => doAction('unlock_lesson', { module_id: mod.id, lesson_id: lesson.id }, `"${lesson.title}" unlocked`)} disabled={!!actionLoading} title="Unlock this lesson">
                                        {'\u{1F513}'}
                                      </button>
                                    )}
                                    {!lesson.quiz_unlocked && (
                                      <button className="override-btn-sm" onClick={() => doAction('force_quiz_unlock', { module_id: mod.id, lesson_id: lesson.id }, `Quiz unlocked for "${lesson.title}"`)} disabled={!!actionLoading} title="Force unlock quiz">
                                        {'\u{1F4DD}'}
                                      </button>
                                    )}
                                    <button className="override-btn-sm override-btn-sm--green" onClick={() => doAction('mark_lesson_complete', { module_id: mod.id, lesson_id: lesson.id }, `"${lesson.title}" marked complete`)} disabled={!!actionLoading} title="Mark complete">
                                      {'\u2705'}
                                    </button>
                                  </>
                                ) : (
                                  <button className="override-btn-sm override-btn-sm--yellow" onClick={() => doAction('mark_lesson_incomplete', { lesson_id: lesson.id }, `"${lesson.title}" marked incomplete`)} disabled={!!actionLoading} title="Mark incomplete">
                                    {'\u21A9'}
                                  </button>
                                )}
                                <button className="override-btn-sm override-btn-sm--red" onClick={() => { if (confirm(`Reset all progress for "${lesson.title}"?`)) doAction('reset_lesson_progress', { lesson_id: lesson.id }, `"${lesson.title}" progress reset`); }} disabled={!!actionLoading} title="Reset progress">
                                  {'\u{1F5D1}'}
                                </button>

                                {/* Inline manual grade */}
                                <div className="override-lesson__grade">
                                  <input
                                    className="override-lesson__grade-input"
                                    type="number"
                                    min="0"
                                    max="100"
                                    placeholder="%"
                                    value={gradeForm[gradeKey] || ''}
                                    onChange={e => setGradeForm(p => ({ ...p, [gradeKey]: e.target.value }))}
                                    onKeyDown={e => e.key === 'Enter' && handleManualGrade(mod.id, lesson.id)}
                                  />
                                  {gradeForm[gradeKey] && (
                                    <button className="override-btn-sm override-btn-sm--blue" onClick={() => handleManualGrade(mod.id, lesson.id)} disabled={!!actionLoading} title="Submit grade">
                                      {'\u2714'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {!loading && !overview && (
        <div className="admin-empty" style={{ padding: '2rem', marginTop: '1rem' }}>
          <div className="admin-empty__icon">{'\u{1F464}'}</div>
          <div className="admin-empty__title">Student Override Panel</div>
          <div className="admin-empty__desc">
            Enter a student&apos;s email above to view their full learning progress and apply overrides.
            You can unlock modules/lessons, mark items complete, manually input grades, grant flashcard access, award XP, and reset progress.
          </div>
        </div>
      )}
    </div>
  );
}
