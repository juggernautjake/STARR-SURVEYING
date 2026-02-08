// app/admin/learn/exam-prep/sit/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePageError } from '../../../hooks/usePageError';

interface FSModule {
  id: string;
  module_number: number;
  title: string;
  description: string;
  week_range: string;
  exam_weight_percent: number;
  key_topics: string[];
  icon: string;
  status: 'locked' | 'available' | 'in_progress' | 'completed';
  quiz_best_score: number;
  quiz_attempts_count: number;
  completed_at: string | null;
  passing_score: number;
  question_count: number;
  prerequisite_module: number | null;
}

interface Stats {
  total_modules: number;
  completed_modules: number;
  overall_readiness: number;
  average_score: number;
  total_quiz_attempts: number;
  mock_exams_taken: number;
  best_mock_score: number;
}

interface MockAttempt {
  id: string;
  score_percent: number;
  correct_answers: number;
  total_questions: number;
  time_spent_seconds: number;
  passed: boolean;
  completed_at: string;
}

export default function FSPrepHubPage() {
  const { safeFetch } = usePageError('FSPrepHubPage');
  const [modules, setModules] = useState<FSModule[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [mockAttempts, setMockAttempts] = useState<MockAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    try {
      const res = await fetch('/api/admin/learn/exam-prep/fs');
      if (res.ok) {
        const data = await res.json();
        setModules(data.modules || []);
        setStats(data.stats || null);
        setMockAttempts(data.mock_attempts || []);
      }
    } catch (err) { console.error('FSPrepHubPage: fetch failed', err); }
    setLoading(false);
  }

  async function startModule(moduleId: string) {
    setStarting(moduleId);
    try {
      await fetch('/api/admin/learn/exam-prep/fs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_module', module_id: moduleId }),
      });
    } catch { /* ignore */ }
    setStarting(null);
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return '#10B981';
      case 'in_progress': return '#F59E0B';
      case 'available': return '#1D3095';
      case 'locked': return '#9CA3AF';
      default: return '#9CA3AF';
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'completed': return 'Completed';
      case 'in_progress': return 'In Progress';
      case 'available': return 'Ready to Start';
      case 'locked': return 'Locked';
      default: return 'Unknown';
    }
  }

  function getReadinessColor(pct: number): string {
    if (pct >= 90) return '#059669';
    if (pct >= 75) return '#10B981';
    if (pct >= 60) return '#F59E0B';
    if (pct >= 40) return '#F97316';
    return '#EF4444';
  }

  function getReadinessLabel(pct: number): string {
    if (pct >= 90) return 'Exam Ready';
    if (pct >= 75) return 'Strong';
    if (pct >= 60) return 'Progressing';
    if (pct >= 40) return 'Building';
    return 'Getting Started';
  }

  function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  const allModulesCompleted = modules.every(m => m.status === 'completed');

  if (loading) return (
    <div className="admin-empty">
      <div className="admin-empty__icon">&#x23F3;</div>
      <div className="admin-empty__title">Loading FS Exam Prep...</div>
    </div>
  );

  return (
    <>
      <div className="admin-learn__header">
        <Link href="/admin/learn/exam-prep" className="admin-module-detail__back">&larr; Back to Exam Prep</Link>
        <h2 className="admin-learn__title">&#x1F3AF; FS Exam Prep</h2>
        <p className="admin-learn__subtitle">
          Comprehensive preparation for the NCEES Fundamentals of Surveying (FS) exam.
          Complete all 8 modules, pass each quiz, then take the full mock exam.
        </p>
      </div>

      {/* Overall Readiness Card */}
      {stats && (
        <div className="fs-prep__readiness-card">
          <div className="fs-prep__readiness-score">
            <div className="fs-prep__readiness-circle" style={{ borderColor: getReadinessColor(stats.overall_readiness) }}>
              <span className="fs-prep__readiness-pct">{stats.overall_readiness}%</span>
              <span className="fs-prep__readiness-sublabel">{getReadinessLabel(stats.overall_readiness)}</span>
            </div>
            <div className="fs-prep__readiness-info">
              <h3 className="fs-prep__readiness-title">FS Exam Readiness</h3>
              <p className="fs-prep__readiness-desc">
                Based on your quiz scores weighted by NCEES exam content areas.
                Score 70%+ on all modules to be exam-ready.
              </p>
            </div>
          </div>

          <div className="fs-prep__readiness-bar">
            <div className="fs-prep__readiness-bar-track">
              <div
                className="fs-prep__readiness-bar-fill"
                style={{ width: `${stats.overall_readiness}%`, background: getReadinessColor(stats.overall_readiness) }}
              />
            </div>
          </div>

          <div className="fs-prep__stats-grid">
            <div className="fs-prep__stat">
              <span className="fs-prep__stat-value">{stats.completed_modules}/{stats.total_modules || 8}</span>
              <span className="fs-prep__stat-label">Modules Complete</span>
            </div>
            <div className="fs-prep__stat">
              <span className="fs-prep__stat-value">{stats.average_score}%</span>
              <span className="fs-prep__stat-label">Avg Quiz Score</span>
            </div>
            <div className="fs-prep__stat">
              <span className="fs-prep__stat-value">{stats.best_mock_score > 0 ? `${stats.best_mock_score}%` : '--'}</span>
              <span className="fs-prep__stat-label">Best Mock Score</span>
            </div>
            <div className="fs-prep__stat">
              <span className="fs-prep__stat-value">{stats.mock_exams_taken}</span>
              <span className="fs-prep__stat-label">Mock Exams</span>
            </div>
          </div>
        </div>
      )}

      {/* Module Progression */}
      <div className="fs-prep__modules">
        <h3 className="fs-prep__section-title">Study Modules</h3>
        <p className="fs-prep__section-desc">Complete each module&apos;s study material and pass the quiz (70%+) to unlock the next module.</p>

        <div className="fs-prep__module-list">
          {modules.map((mod, idx) => {
            const isLocked = mod.status === 'locked';
            const isCompleted = mod.status === 'completed';
            const isAvailable = mod.status === 'available';
            const isInProgress = mod.status === 'in_progress';

            return (
              <div key={mod.id} className={`fs-prep__module ${isLocked ? 'fs-prep__module--locked' : ''} ${isCompleted ? 'fs-prep__module--completed' : ''}`}>
                {/* Connector line */}
                {idx > 0 && (
                  <div className={`fs-prep__module-connector ${isLocked ? '' : 'fs-prep__module-connector--active'}`} />
                )}

                <div className="fs-prep__module-header">
                  <div className="fs-prep__module-number" style={{ background: getStatusColor(mod.status) }}>
                    {isCompleted ? '\u2713' : isLocked ? '\uD83D\uDD12' : mod.module_number}
                  </div>
                  <div className="fs-prep__module-info">
                    <h4 className="fs-prep__module-title">
                      <span className="fs-prep__module-icon">{mod.icon}</span>
                      {mod.title}
                    </h4>
                    <p className="fs-prep__module-desc">{mod.description}</p>
                    <div className="fs-prep__module-meta">
                      <span className="fs-prep__module-weeks">{mod.week_range}</span>
                      <span className="fs-prep__module-weight">{mod.exam_weight_percent}% of exam</span>
                      <span className="fs-prep__module-topics">{mod.key_topics?.length || 0} topics</span>
                    </div>
                  </div>
                  <div className="fs-prep__module-status">
                    <span className="fs-prep__module-status-badge" style={{ background: getStatusColor(mod.status), color: '#fff' }}>
                      {getStatusLabel(mod.status)}
                    </span>
                    {mod.quiz_best_score > 0 && (
                      <span className="fs-prep__module-score" style={{ color: mod.quiz_best_score >= 70 ? '#10B981' : '#EF4444' }}>
                        Best: {mod.quiz_best_score}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar for completed/in-progress */}
                {(isCompleted || isInProgress) && (
                  <div className="fs-prep__module-progress">
                    <div className="fs-prep__module-progress-bar">
                      <div
                        className="fs-prep__module-progress-fill"
                        style={{
                          width: isCompleted ? '100%' : `${Math.min(mod.quiz_best_score, 100)}%`,
                          background: isCompleted ? '#10B981' : '#F59E0B',
                        }}
                      />
                    </div>
                    <span className="fs-prep__module-progress-label">
                      {isCompleted ? 'Module Complete' : `${mod.quiz_attempts_count} attempt${mod.quiz_attempts_count !== 1 ? 's' : ''} - Best: ${mod.quiz_best_score}%`}
                    </span>
                  </div>
                )}

                {/* Action button */}
                <div className="fs-prep__module-actions">
                  {isLocked && (
                    <span className="fs-prep__module-locked-msg">Complete Module {(mod.prerequisite_module || mod.module_number - 1)} to unlock</span>
                  )}
                  {isAvailable && (
                    <Link
                      href={`/admin/learn/exam-prep/sit/module/${mod.id}`}
                      className="admin-btn admin-btn--primary fs-prep__module-btn"
                      onClick={() => startModule(mod.id)}
                    >
                      {starting === mod.id ? 'Starting...' : 'Start Module'}
                    </Link>
                  )}
                  {isInProgress && (
                    <Link
                      href={`/admin/learn/exam-prep/sit/module/${mod.id}`}
                      className="admin-btn admin-btn--secondary fs-prep__module-btn"
                    >
                      Continue Studying
                    </Link>
                  )}
                  {isCompleted && (
                    <Link
                      href={`/admin/learn/exam-prep/sit/module/${mod.id}`}
                      className="admin-btn admin-btn--ghost fs-prep__module-btn"
                    >
                      Review Module
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mock Exam Section */}
      <div className="fs-prep__mock-section">
        <h3 className="fs-prep__section-title">&#x1F4DD; Full Mock Exam</h3>
        <div className="fs-prep__mock-card">
          <div className="fs-prep__mock-info">
            <h4>NCEES FS Practice Exam</h4>
            <p>110 questions &bull; 320 minutes &bull; Timed &bull; Category scoring</p>
            <p className="fs-prep__mock-note">
              Simulates the real NCEES Fundamentals of Surveying exam.
              Questions drawn from all 8 study areas. You need 70%+ to pass.
            </p>
          </div>
          <div className="fs-prep__mock-actions">
            {allModulesCompleted ? (
              <Link href="/admin/learn/exam-prep/sit/mock-exam" className="admin-btn admin-btn--primary">
                Start Mock Exam
              </Link>
            ) : (
              <>
                <button className="admin-btn admin-btn--ghost" disabled>
                  Complete All Modules First
                </button>
                <Link href="/admin/learn/exam-prep/sit/mock-exam" className="admin-btn admin-btn--ghost" style={{ fontSize: '0.8rem' }}>
                  Preview Mock Exam
                </Link>
              </>
            )}
          </div>
        </div>

        {/* FS Readiness Test (mini mock - available anytime) */}
        <div className="fs-prep__readiness-test">
          <h4 className="fs-prep__section-subtitle">&#x26A1; Quick Readiness Check</h4>
          <p className="fs-prep__readiness-test-desc">
            Take a 20-question mini exam covering all topics. Available anytime to gauge your progress.
          </p>
          <Link href="/admin/learn/exam-prep/sit/mock-exam?quick=true" className="admin-btn admin-btn--secondary">
            Start Readiness Check (20 questions, 60 min)
          </Link>
        </div>

        {/* Mock Exam History */}
        {mockAttempts.length > 0 && (
          <div className="fs-prep__mock-history">
            <h4 className="fs-prep__section-subtitle">Mock Exam History</h4>
            {mockAttempts.map((a) => (
              <div key={a.id} className="fs-prep__mock-attempt">
                <div className="fs-prep__mock-attempt-info">
                  <span className={`fs-prep__mock-attempt-score ${a.passed ? 'fs-prep__mock-attempt-score--pass' : 'fs-prep__mock-attempt-score--fail'}`}>
                    {a.score_percent}%
                  </span>
                  <span className="fs-prep__mock-attempt-detail">
                    {a.correct_answers}/{a.total_questions} correct
                  </span>
                </div>
                <div className="fs-prep__mock-attempt-meta">
                  <span>{formatTime(a.time_spent_seconds)}</span>
                  <span>{new Date(a.completed_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Exam Info */}
      <div className="fs-prep__info-section">
        <h3 className="fs-prep__section-title">&#x2139;&#xFE0F; About the FS Exam</h3>
        <div className="fs-prep__info-grid">
          <div className="fs-prep__info-card">
            <strong>Format</strong>
            <p>110 multiple-choice questions, computer-based</p>
          </div>
          <div className="fs-prep__info-card">
            <strong>Time</strong>
            <p>5 hours 20 minutes (320 minutes)</p>
          </div>
          <div className="fs-prep__info-card">
            <strong>Passing</strong>
            <p>~70% (scaled score varies by administration)</p>
          </div>
          <div className="fs-prep__info-card">
            <strong>Content Areas</strong>
            <p>7 knowledge areas aligned with NCEES specifications</p>
          </div>
        </div>
      </div>
    </>
  );
}
