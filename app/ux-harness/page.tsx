// app/ux-harness/page.tsx
//
// Unauthenticated, env-gated render of real admin PAGE components for
// Playwright UX/formatting audits. Lives outside /admin so middleware's auth
// gate doesn't apply, and 404s unless NEXT_PUBLIC_E2E_HARNESS === '1' so it
// can never appear in production. A seeded mock session (UxHarnessClient)
// makes the pages' useSession() resolve as an admin; specs mock /api/admin/**
// data via page.route to populate lists.
//
// Usage:  /ux-harness?page=jobs   (see UxHarnessClient PAGES registry)

import { notFound } from 'next/navigation';
import UxHarnessClient from './UxHarnessClient';

export const dynamic = 'force-dynamic';

export default async function UxHarnessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NEXT_PUBLIC_E2E_HARNESS !== '1') notFound();
  const sp = await searchParams;
  const page = typeof sp.page === 'string' ? sp.page : 'settings';
  const chrome = sp.chrome === '1';
  return <UxHarnessClient page={page} chrome={chrome} />;
}
