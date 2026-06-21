// app/admin/learn/exam-prep/rpls/page.tsx
'use client';
import QuizRunner from '@/app/admin/components/QuizRunner';

export default function RPLSPrepPage() {
  return (
    <QuizRunner
      type="exam_prep"
      examCategory="RPLS"
      questionCount={10}
      title="RPLS Practice Test"
      backUrl="/admin/learn/exam-prep"
      backLabel="Back to Exam Prep"
    />
  );
}
