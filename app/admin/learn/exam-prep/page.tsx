// app/admin/learn/exam-prep/page.tsx
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import FieldbookButton from '@/app/admin/components/FieldbookButton';
import { usePageError } from '../../hooks/usePageError';

export default function ExamPrepPage() {
  const { safeFetch } = usePageError('ExamPrepPage');
  const [fsStats, setFsStats] = useState<{ completed_modules: number; total_modules: number; overall_readiness: number } | null>(null);
  const [attempts, setAttempts] = useState<{ id: string; exam_category: string; score_percent: number; completed_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    try {
      // Fetch FS prep stats
      const fsRes = await fetch('/api/admin/learn/exam-prep/fs');
      if (fsRes.ok) {
        const fsData = await fsRes.json();
        setFsStats(fsData.stats || null);
        setAttempts(fsData.recent_quiz_attempts || []);
      }
    } catch (err) { console.error('ExamPrepPage: fetch failed', err); }
    setLoading(false);
  }

  if (loading) return (
    <div className="admin-empty">
      <div className="admin-empty__icon">&#x23F3;</div>
      <div className="admin-empty__title">Loading...</div>
    </div>
  );

  return (
    <>
      <div className="admin-learn__header">
        <Link href="/admin/learn" className="admin-module-detail__back">&larr; Back to Learning Hub</Link>
        <h2 className="admin-learn__title">&#x1F4DD; Exam Prep</h2>
        <p className="admin-learn__subtitle">
          Prepare for your surveying licensure exams with structured study modules, practice quizzes, and full mock exams.
        </p>
      </div>

      <div className="admin-learn__sections">
        {/* FS Exam Prep Card */}
        <Link href="/admin/learn/exam-prep/sit" className="admin-learn__section-card" style={{ borderColor: '#1D3095', borderWidth: '2px' }}>
          <span className="admin-learn__section-icon">&#x1F3AF;</span>
          <h3 className="admin-learn__section-title">Fundamentals of Surveying (FS)</h3>
          <p className="admin-learn__section-desc">
            Comprehensive 8-module curriculum covering all NCEES FS exam content areas.
            Includes 160+ practice questions, module quizzes, and a full 110-question mock exam.
          </p>
          {fsStats && (
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', background: '#EFF6FF', color: '#1D3095', borderRadius: '12px', fontWeight: 600 }}>
                {fsStats.completed_modules}/{fsStats.total_modules} modules
              </span>
              <span style={{
                fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: 600,
                background: fsStats.overall_readiness >= 70 ? '#ECFDF5' : '#FEF3C7',
                color: fsStats.overall_readiness >= 70 ? '#065F46' : '#92400E',
              }}>
                {fsStats.overall_readiness}% ready
              </span>
            </div>
          )}
          <span className="admin-learn__section-arrow">Start FS Prep &rarr;</span>
        </Link>

        {/* RPLS Card */}
        <div className="admin-learn__section-card" style={{ opacity: 0.7 }}>
          <span className="admin-learn__section-icon">&#x2B50;</span>
          <h3 className="admin-learn__section-title">RPLS Exam (Coming Soon)</h3>
          <p className="admin-learn__section-desc">
            Advanced preparation for the Registered Professional Land Surveyor exam.
            Complete the FS exam prep first to build your foundation.
          </p>
          <span className="admin-learn__section-arrow" style={{ color: '#9CA3AF' }}>Coming Soon</span>
        </div>
      </div>

      {/* Recent Activity */}
      {attempts.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '2px solid #E5E7EB' }}>
            Recent Quiz Attempts
          </h3>
          {attempts.slice(0, 10).map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{a.exam_category} Quiz</span>
              <span style={{ color: a.score_percent >= 70 ? '#10B981' : '#BD1218', fontWeight: 700 }}>{a.score_percent}%</span>
              <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>{new Date(a.completed_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      <FieldbookButton contextType="exam_prep" contextLabel="Exam Prep" />
    </>
  );
}
