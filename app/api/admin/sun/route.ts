// app/api/admin/sun/route.ts
//
// Stub endpoint for the Sun Calculator widget (Slice 143). Real impl
// would call a sunrise-sunset API or compute from lat/lon of the active
// job site. The widget already has a hard-coded Austin fallback for
// when this endpoint is missing — returning a shape-correct empty
// payload here gives the widget a clean "we tried, no data" branch
// before that fallback fires.
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
  // 204 No Content — the widget's catch branch already supplies a
  // sensible Austin TX default, so we'd rather defer to that than
  // pretend we have data.
  return new NextResponse(null, { status: 204 });
}, { routeName: 'admin/sun' });
