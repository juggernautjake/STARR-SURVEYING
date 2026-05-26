// app/cad-harness/page.tsx
//
// Unauthenticated, env-gated render of the CAD editor shell, used ONLY
// for local Playwright UX-audit verification. It lives outside /admin so
// middleware's auth gate doesn't redirect it, and it 404s unless
// NEXT_PUBLIC_E2E_HARNESS === '1' so it can never appear in production.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md §2

import { notFound } from 'next/navigation';
import CADLayout from '@/app/admin/cad/CADLayout';
import CADErrorBoundary from '@/app/admin/cad/components/CADErrorBoundary';

export const dynamic = 'force-dynamic';

export default function CadHarnessPage() {
  if (process.env.NEXT_PUBLIC_E2E_HARNESS !== '1') notFound();
  return (
    <CADErrorBoundary>
      <CADLayout />
    </CADErrorBoundary>
  );
}
