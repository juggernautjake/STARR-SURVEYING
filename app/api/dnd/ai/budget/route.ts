// app/api/dnd/ai/budget/route.ts — "AI assists: 34 of 120 today" (P2-2).
//
// The slice's bar is that the ceiling is **visible before it is hit, not only after**. That requires a read
// that does not itself consume budget, which is what `peekRateLimit` is for — calling the enforcing
// `checkRateLimit` here would spend a unit of allowance every time the number rendered, and a component
// that polled would exhaust the budget by displaying it.
//
// Both windows are returned because they are different controls: the hourly one stops a burst, the daily
// one stops a slow grind that never trips it. A UI showing only the daily figure would leave someone
// confused about why they were refused at 34/120.
import { NextResponse } from 'next/server';
import { getDndSession } from '@/lib/dnd/auth';
import { peekRateLimit, rateLimitSubject } from '@/lib/dnd/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const subject = rateLimitSubject({ userId: session.userId });
  const [hourly, daily] = await Promise.all([
    peekRateLimit('ai', subject),
    peekRateLimit('ai-daily', subject),
  ]);

  return NextResponse.json({ hourly, daily });
}
