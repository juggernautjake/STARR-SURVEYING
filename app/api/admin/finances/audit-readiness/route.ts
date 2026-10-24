// app/api/admin/finances/audit-readiness — what must be checked before a tax year can be locked.
//
// GET ?year=YYYY  → { ok, duplicates[], needsReview[] } for receipts created that year — the same
// window POST /api/admin/finances/mark-exported locks, and the same rule it refuses on
// (lib/receipts/audit-readiness.ts). Owner, 2026-10-07: flagged receipts "must be checked before a
// full audit can be done for taxes".
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { auditBlockers } from '@/lib/receipts/audit-readiness';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const roles = (session.user as { roles?: string[] }).roles ?? [];
  if (!isAdmin(session.user.roles) && !roles.includes('tech_support')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const year = Number(new URL(req.url).searchParams.get('year')) || new Date().getFullYear();
  const blockers = await auditBlockers(`${year}-01-01T00:00:00.000Z`, `${year}-12-31T23:59:59.999Z`);
  return NextResponse.json({ year, ...blockers });
}, { routeName: 'admin/finances/audit-readiness' });
