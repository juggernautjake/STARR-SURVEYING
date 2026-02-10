// app/admin/learn/exam-prep/sit/module/[id]/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import QuizRunner from '@/app/admin/components/QuizRunner';
import { usePageError } from '../../../../../hooks/usePageError';

interface ContentSection {
  type: string;
  title: string;
  content: string;
}

interface Formula {
  name: string;
  formula: string;
}

interface WeakArea {
  topic: string;
  weakness_score: number;
  questions_attempted: number;
  questions_correct: number;
}

interface ModuleData {
  id: string;
  module_number: number;
  title: string;
  description: string;
  week_range: string;
  exam_weight_percent: number;
  key_topics: string[];
  key_formulas: Formula[];
  content_sections: ContentSection[];
  icon: string;
  passing_score: number;
  question_count: number;
}

interface ProgressData {
  status: string;
  quiz_best_score: number;
  quiz_attempts_count: number;
}

interface QuizAttempt {
  id: string;
  score_percent: number;
  correct_answers: number;
  total_questions: number;
  completed_at: string;
}

export default function FSModulePage() {
  const params = useParams();
  const moduleId = params.id as string;
  const { safeFetch } = usePageError('FSModulePage');

  const [module, setModule] = useState<ModuleData | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [recentAttempts, setRecentAttempts] = useState<QuizAttempt[]>([]);
  const [weakAreas, setWeakAreas] = useState<WeakArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);

  const fetchModule = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/learn/exam-prep/fs?module_id=${moduleId}`);
      if (res.ok) {
        const data = await res.json();
        setModule(data.module);
        setProgress(data.progress);
        setQuestionCount(data.question_count);
        setRecentAttempts(data.recent_attempts || []);
        setWeakAreas(data.weak_areas || []);
      }
    } catch (err) { console.error('FSModulePage: fetch failed', err); }
    setLoading(false);
  }, [moduleId]);

  useEffect(() => { fetchModule(); }, [fetchModule]);

  function renderMarkdown(text: string): string {
    // Simple markdown-to-HTML for study content
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/^### (.*$)/gm, '<h4>$1</h4>')
      .replace(/^## (.*$)/gm, '<h3>$1</h3>')
      .replace(/^# (.*$)/gm, '<h2>$1</h2>')
      .replace(/^- (.*$)/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');
  }

  function getContentForTab(tab: string): ContentSection | undefined {
    if (!module) return undefined;
    const typeMap: Record<string, string> = {
      overview: 'overview',
      concepts: 'concepts',
      formulas: 'formulas',
      examples: 'examples',
      tips: 'tips',
    };
    return module.content_sections?.find(s => s.type === typeMap[tab]);
  }

  if (loading) return (
    <div className="admin-empty">
      <div className="admin-empty__icon">&#x23F3;</div>
      <div className="admin-empty__title">Loading module...</div>
    </div>
  );

  if (!module) return (
    <div className="admin-empty">
      <div className="admin-empty__icon">&#x274C;</div>
      <div className="admin-empty__title">Module not found</div>
      <Link href="/admin/learn/exam-prep/sit" className="admin-btn admin-btn--ghost" style={{ marginTop: '1rem' }}>Back to FS Prep</Link>
    </div>
  );

  if (progress?.status === 'locked') return (
    <div className="admin-empty">
      <div className="admin-empty__icon">&#x1F512;</div>
      <div className="admin-empty__title">Module Locked</div>
      <div className="admin-empty__desc">Complete the previous module to unlock this one.</div>
      <Link href="/admin/learn/exam-prep/sit" className="admin-btn admin-btn--ghost" style={{ marginTop: '1rem' }}>Back to FS Prep</Link>
    </div>
  );

  // Quiz mode
  if (showQuiz) {
    return (
      <div className="fs-module__quiz-wrapper">
        <QuizRunner
          type="module_test"
          moduleId={moduleId}
          questionCount={Math.min(questionCount, 20)}
          title={`${module.icon} Module ${module.module_number} Quiz: ${module.title}`}
          backUrl={`/admin/learn/exam-prep/sit/module/${moduleId}`}
          backLabel="Back to Module"
        />
      </div>
    );
  }

  const contentSection = getContentForTab(activeTab);
  const isCompleted = progress?.status === 'completed';
  const bestScore = progress?.quiz_best_score || 0;

  const tabs = [
    { key: 'overview', label: 'Overview', icon: '\u{1F4D6}' },
    { key: 'concepts', label: 'Key Concepts', icon: '\u{1F4A1}' },
    { key: 'formulas', label: 'Formulas', icon: '\u{1F522}' },
    { key: 'examples', label: 'Examples', icon: '\u270F\uFE0F' },
    { key: 'tips', label: 'Exam Tips', icon: '\u{1F4CC}' },
  ];

  return (
    <>
      <div className="admin-learn__header">
        <Link href="/admin/learn/exam-prep/sit" className="admin-module-detail__back">&larr; Back to FS Prep</Link>
        <h2 className="admin-learn__title">{module.icon} Module {module.module_number}: {module.title}</h2>
        <p className="admin-learn__subtitle">{module.description}</p>
        <div className="fs-module__meta">
          <span className="fs-module__meta-item">{module.week_range}</span>
          <span className="fs-module__meta-item">{module.exam_weight_percent}% of FS Exam</span>
          <span className="fs-module__meta-item">{questionCount} quiz questions</span>
          {isCompleted && <span className="fs-module__meta-item fs-module__meta-item--complete">&#x2705; Completed</span>}
        </div>
      </div>

      {/* Progress & Score Banner */}
      {(bestScore > 0 || isCompleted) && (
        <div className={`fs-module__score-banner ${isCompleted ? 'fs-module__score-banner--pass' : 'fs-module__score-banner--progress'}`}>
          <div className="fs-module__score-info">
            <span className="fs-module__score-label">Best Quiz Score</span>
            <span className={`fs-module__score-value ${bestScore >= 70 ? 'fs-module__score-value--pass' : 'fs-module__score-value--fail'}`}>
              {bestScore}%
            </span>
          </div>
          <div className="fs-module__score-info">
            <span className="fs-module__score-label">Attempts</span>
            <span className="fs-module__score-value">{progress?.quiz_attempts_count || 0}</span>
          </div>
          <div className="fs-module__score-info">
            <span className="fs-module__score-label">Status</span>
            <span className="fs-module__score-value">{isCompleted ? 'Passed' : 'In Progress'}</span>
          </div>
        </div>
      )}

      {/* Study Recommendations */}
      {weakAreas.length > 0 && !isCompleted && (
        <div className="fs-module__recommendations">
          <h4>&#x1F4CB; Recommended Review Areas</h4>
          <p className="fs-module__rec-desc">Based on your quiz performance, focus on these topics:</p>
          <div className="fs-module__rec-list">
            {weakAreas
              .filter(w => w.weakness_score > 0.3)
              .sort((a, b) => b.weakness_score - a.weakness_score)
              .map((w, i) => (
                <div key={i} className="fs-module__rec-item">
                  <span className="fs-module__rec-topic">{w.topic}</span>
                  <span className="fs-module__rec-score" style={{ color: w.weakness_score > 0.6 ? '#EF4444' : '#F59E0B' }}>
                    {w.questions_correct}/{w.questions_attempted} correct
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Content Tabs */}
      <div className="fs-module__tabs">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`fs-module__tab ${activeTab === tab.key ? 'fs-module__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            dangerouslySetInnerHTML={{ __html: `${tab.icon} ${tab.label}` }}
          />
        ))}
      </div>

      {/* Content Area */}
      <div className="fs-module__content">
        {activeTab === 'formulas' && module.key_formulas && module.key_formulas.length > 0 ? (
          <div className="fs-module__formulas-grid">
            <h3>Key Formulas for {module.title}</h3>
            {module.key_formulas.map((f, i) => (
              <div key={i} className="fs-module__formula-card">
                <div className="fs-module__formula-name">{f.name}</div>
                <div className="fs-module__formula-expr">{f.formula}</div>
              </div>
            ))}
            {contentSection && (
              <div className="fs-module__content-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(contentSection.content) }} />
            )}
          </div>
        ) : contentSection ? (
          <div className="fs-module__content-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(contentSection.content) }} />
        ) : (
          <div className="admin-empty" style={{ padding: '2rem' }}>
            <div className="admin-empty__icon">&#x1F4DA;</div>
            <div className="admin-empty__title">Content coming soon</div>
            <div className="admin-empty__desc">This section&apos;s content is being prepared.</div>
          </div>
        )}
      </div>

      {/* Key Topics */}
      {module.key_topics && module.key_topics.length > 0 && (
        <div className="fs-module__topics">
          <h4>Topics Covered</h4>
          <div className="fs-module__topics-grid">
            {module.key_topics.map((topic, i) => (
              <span key={i} className="fs-module__topic-tag">{topic}</span>
            ))}
          </div>
        </div>
      )}

      {/* Quiz Section */}
      <div className="fs-module__quiz-section">
        <h3>&#x1F4DD; Module {module.module_number} Quiz</h3>
        <p>
          {questionCount} questions covering all topics in this module.
          You need {module.passing_score}% to pass and unlock the next module.
        </p>
        <button
          className="admin-btn admin-btn--primary"
          onClick={() => setShowQuiz(true)}
          disabled={questionCount === 0}
          style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}
        >
          {questionCount > 0
            ? (isCompleted ? 'Retake Quiz' : bestScore > 0 ? 'Try Again' : 'Start Quiz')
            : 'No Questions Available Yet'}
        </button>

        {/* Recent Attempts */}
        {recentAttempts.length > 0 && (
          <div className="fs-module__attempts">
            <h4>Recent Quiz Attempts</h4>
            {recentAttempts.slice(0, 5).map(a => (
              <div key={a.id} className="fs-module__attempt">
                <span className={`fs-module__attempt-score ${a.score_percent >= 70 ? 'fs-module__attempt-score--pass' : 'fs-module__attempt-score--fail'}`}>
                  {a.score_percent}%
                </span>
                <span className="fs-module__attempt-detail">{a.correct_answers}/{a.total_questions} correct</span>
                <span className="fs-module__attempt-date">{new Date(a.completed_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
