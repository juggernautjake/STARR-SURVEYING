// app/admin/learn/modules/[id]/[lessonId]/quiz/page.tsx
'use client';

import { useParams } from 'next/navigation';
import QuizRunner from '@/app/admin/components/QuizRunner';

export default function LessonQuizPage() {
  const params = useParams();
  const moduleId = params.id as string;
  const lessonId = params.lessonId as string;

  return (
    <QuizRunner
      type="lesson_quiz"
      lessonId={lessonId}
      moduleId={moduleId}
      questionCount={5}
      title="📝 Lesson Quiz"
      backUrl={`/admin/learn/modules/${moduleId}/${lessonId}`}
      backLabel="Back to Lesson"
    />
  );
}
