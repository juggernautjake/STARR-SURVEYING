// app/admin/learn/modules/[id]/test/page.tsx
'use client';

import { useParams } from 'next/navigation';
import QuizRunner from '@/app/admin/components/QuizRunner';

export default function ModuleTestPage() {
  const params = useParams();
  const moduleId = params.id as string;

  return (
    <QuizRunner
      type="module_test"
      moduleId={moduleId}
      questionCount={10}
      title="📋 Module Test"
      backUrl={`/admin/learn/modules/${moduleId}`}
      backLabel="Back to Module"
    />
  );
}
