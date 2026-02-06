// app/admin/learn/exam-prep/page.tsx
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import QuizRunner from '@/app/admin/components/QuizRunner';
import FieldbookButton from '@/app/admin/components/FieldbookButton';

export default function ExamPrepPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [counts, setCounts] = useState({ SIT: 0, RPLS: 0 });
  const [activeExam, setActiveExam] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    try {
      const res = await fetch('/api/admin/learn/exam-prep');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
        setCounts(data.question_counts || { SIT: 0, RPLS: 0 });
        setAttempts(data.recent_attempts || []);
      }
    } catch {}
    setLoading(false);
  }

  if (activeExam) {
    return (
      <QuizRunner type="exam_prep" examCategory={activeExam} questionCount={10}
        title={`📝 ${activeExam} Practice Test`} backUrl="/admin/learn/exam-prep" backLabel="Back to Exam Prep" />
    );
  }

  if (loading) return <div className="admin-empty"><div className="admin-empty__icon">⏳</div><div className="admin-empty__title">Loading...</div></div>;

  const sitCats = categories.filter(c => c.exam_type === 'SIT');
  const rplsCats = categories.filter(c => c.exam_type === 'RPLS');

  return (
    <>
      <div className="admin-learn__header">
        <Link href="/admin/learn" className="admin-module-detail__back">← Back to Learning Hub</Link>
        <h2 className="admin-learn__title">📝 Exam Prep</h2>
        <p className="admin-learn__subtitle">Practice for SIT and RPLS exams with randomized questions.</p>
      </div>
      <div className="admin-learn__sections">
        <div className="admin-learn__section-card">
          <span className="admin-learn__section-icon">🎯</span>
          <h3 className="admin-learn__section-title">Surveyor Intern Test (SIT)</h3>
          <p className="admin-learn__section-desc">First step to licensure. <strong>{counts.SIT} questions</strong> available.</p>
          {sitCats.length > 0 && (
            <div style={{display:'flex',flexWrap:'wrap',gap:'0.35rem',marginBottom:'0.5rem'}}>
              {sitCats.map(c => <span key={c.id} style={{fontSize:'0.72rem',padding:'0.15rem 0.5rem',background:'#EFF6FF',color:'#1D3095',borderRadius:'12px'}}>{c.category_name}</span>)}
            </div>
          )}
          <button className="admin-btn admin-btn--secondary" onClick={() => setActiveExam('SIT')} disabled={counts.SIT===0}>
            {counts.SIT > 0 ? '🚀 Start SIT Practice' : 'No questions yet'}
          </button>
        </div>
        <div className="admin-learn__section-card">
          <span className="admin-learn__section-icon">⭐</span>
          <h3 className="admin-learn__section-title">RPLS Exam</h3>
          <p className="admin-learn__section-desc">Advanced licensure exam. <strong>{counts.RPLS} questions</strong> available.</p>
          {rplsCats.length > 0 && (
            <div style={{display:'flex',flexWrap:'wrap',gap:'0.35rem',marginBottom:'0.5rem'}}>
              {rplsCats.map(c => <span key={c.id} style={{fontSize:'0.72rem',padding:'0.15rem 0.5rem',background:'#FEF2F2',color:'#BD1218',borderRadius:'12px'}}>{c.category_name}</span>)}
            </div>
          )}
          <button className="admin-btn admin-btn--primary" onClick={() => setActiveExam('RPLS')} disabled={counts.RPLS===0}>
            {counts.RPLS > 0 ? '🚀 Start RPLS Practice' : 'No questions yet'}
          </button>
        </div>
      </div>
      {attempts.length > 0 && (
        <div style={{marginTop:'2rem'}}>
          <h3 style={{fontFamily:'Sora,sans-serif',fontSize:'1.1rem',fontWeight:600,marginBottom:'0.75rem',paddingBottom:'0.5rem',borderBottom:'2px solid #E5E7EB'}}>Recent Attempts</h3>
          {attempts.slice(0,10).map(a => (
            <div key={a.id} style={{display:'flex',justifyContent:'space-between',padding:'0.75rem 1rem',background:'#fff',border:'1px solid #E5E7EB',borderRadius:'8px',marginBottom:'0.5rem'}}>
              <span style={{fontWeight:600,fontSize:'0.85rem'}}>{a.exam_category} Practice</span>
              <span style={{color:a.score_percent>=70?'#10B981':'#BD1218',fontWeight:700}}>{a.score_percent}%</span>
              <span style={{fontSize:'0.75rem',color:'#9CA3AF'}}>{new Date(a.completed_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
      <FieldbookButton contextType="exam_prep" contextLabel="Exam Prep" />
    </>
  );
}
