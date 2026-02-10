// app/admin/learn/modules/[id]/[lessonId]/quiz/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import QuizRunner from '@/app/admin/components/QuizRunner';

export default function LessonQuizPage() {
  const params = useParams();
  const moduleId = params.id as string;
  const lessonId = params.lessonId as string;
  const [nextLesson, setNextLesson] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    async function fetchSiblings() {
      try {
        const res = await fetch(`/api/admin/learn/lessons?module_id=${moduleId}`);
        if (res.ok) {
          const data = await res.json();
          const sorted = (data.lessons || []).sort((a: any, b: any) => a.order_index - b.order_index);
          const idx = sorted.findIndex((l: any) => l.id === lessonId);
          if (idx >= 0 && idx < sorted.length - 1) {
            setNextLesson({ id: sorted[idx + 1].id, title: sorted[idx + 1].title });
          }
        }
      } catch { /* silent */ }
    }
    fetchSiblings();
  }, [moduleId, lessonId]);

  return (
    <QuizRunner
      type="lesson_quiz"
      lessonId={lessonId}
      moduleId={moduleId}
      questionCount={5}
      title={'\u{1F4DD} Lesson Quiz'}
      backUrl={`/admin/learn/modules/${moduleId}/${lessonId}`}
      backLabel="Back to Lesson"
      nextLessonUrl={nextLesson ? `/admin/learn/modules/${moduleId}/${nextLesson.id}` : undefined}
      nextLessonLabel={nextLesson ? `Next: ${nextLesson.title}` : undefined}
    />
  );
}
