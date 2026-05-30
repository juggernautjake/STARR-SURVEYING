// app/api/admin/sun/route.ts
//
// Sun Calculator widget endpoint (Slice 143). hub-widget-excellence-15 —
// this was a 204 stub. Sunrise/sunset/daylight are deterministic from
// lat/lng + date, so there's no reason to defer to a hard-coded
// fallback: we compute them server-side (pure NOAA sunrise equation) and
// return ISO-8601 UTC times the widget formats in the surveyor's zone.
//
// GET /api/admin/sun?lat=&lng= → { sunrise, sunset, daylight_hours, location_label }

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { resolveSunPoint, buildSunResponse } from '@/lib/sun/response';

export const GET = withErrorHandler(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const point = resolveSunPoint(searchParams.get('lat'), searchParams.get('lng'));
  return NextResponse.json(buildSunResponse(point, new Date()));
}, { routeName: 'admin/sun' });
