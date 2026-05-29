// app/api/admin/learn/modules/[id]/credential/route.ts
//
// GET — Returns the credential awarded by a module + its hourly pay bump,
// so the module detail page can render its pay-impact callout client-side
// without forcing the page to be server-rendered. Returns
// `{ credential: null }` (not a 404) when the module isn't linked to a
// credential — that's the expected no-op state for the callout.
//
// PAY_PROGRESSION_OVERHAUL.md P-25/P-26 deferred item — shipped 2026-05-28.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { getModuleCredentialBonus } from '@/lib/learn/moduleCredentialBonus';

function extractModuleId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('modules');
  if (i < 0 || !parts[i + 1]) return null;
  return parts[i + 1];
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const moduleId = extractModuleId(req);
  if (!moduleId) {
    return NextResponse.json({ error: 'Module ID required' }, { status: 400 });
  }

  const bonus = await getModuleCredentialBonus(moduleId);
  return NextResponse.json({ credential: bonus });
}, { routeName: 'admin/learn/modules/credential' });
