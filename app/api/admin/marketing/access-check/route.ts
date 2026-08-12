// app/api/admin/marketing/access-check/route.ts — is the Google Ads connection actually usable? A6.
//
// Admin-only, and not because the answer is secret: the probe makes a live call to Google on every
// request, and an endpoint anyone can hammer is an endpoint that burns somebody's API quota.
//
// No caching. This is asked when somebody is actively trying to fix the connection, and a cached
// "still not approved" after the approval has landed is exactly the wrong answer at exactly the
// wrong moment.

import { NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { checkAdsAccess } from '@/lib/integrations/google-ads/access-level';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json(await checkAdsAccess());
}, { routeName: 'admin/marketing/access-check' });
