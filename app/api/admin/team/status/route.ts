// app/api/admin/team/status/route.ts
//
// Stub endpoint for the Team Status widget (Slice 118). Returns an
// empty members list so the widget renders its friendly empty state
// instead of fetch-erroring in the console.
//
// Real implementation needs to read currently-clocked-in users from
// a future `active_clock_sessions` server table (see Slice 188's
// localStorage helper for the v1 pattern). Tracked as a follow-up.
//
// Slice 191 of customizable-hub-and-work-mode-2026-05-28.md.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Shape mirrors the widget's expectation: `{ members: TeamMember[] }`.
  // Returning [] surfaces the widget's empty state ("No one's clocked
  // in") rather than the error state ("Couldn't load…").
  return NextResponse.json({ members: [] });
}, { routeName: 'admin/team/status' });
