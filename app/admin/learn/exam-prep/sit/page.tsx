// app/admin/learn/exam-prep/sit/page.tsx
'use client';
import QuizRunner from '@/app/admin/components/QuizRunner';

export default function SITPrepPage() {
  return (
    <QuizRunner
      type="exam_prep"
      examCategory="SIT"
      questionCount={10}
      title="🎯 SIT Practice Test"
      backUrl="/admin/learn/exam-prep"
      backLabel="Back to Exam Prep"
    />
  );
}
