// app/api/admin/research/self-heal/evaluate/route.ts
//
// Slice 4 of research-self-heal-slice-1-manual-sweep-2026-06-22.md.
//
// POST → run the shared apply-evaluator against every pending
// proposal. Auto-applies high-confidence + canary-passing rows when
// the settings.autoapply_enabled toggle is ON; rejects rows that
// can't clear the reviewer threshold; leaves the rest queued.
//
// Slice-3 confidence=0 proposals (the rows the manual sweep + cron
// currently file) are filtered out of the evaluator — they stay in
// the human review queue. The moment an AI fix generator produces
// confidence > 0 proposals, this endpoint picks them up.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { runApplyEvaluator } from '@/lib/research/self-heal-apply-runner';

async function authGate(): Promise<
  | { ok: true; email: string }
  | { ok: false; res: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!isAdmin(session.user.roles)) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, email: session.user.email };
}

export const POST = withErrorHandler(async (_req: NextRequest) => {
  const g = await authGate();
  if (!g.ok) return g.res;
  const result = await runApplyEvaluator(supabaseAdmin, g.email);
  return NextResponse.json(result);
}, { routeName: 'admin/research/self-heal/evaluate.post' });
