// app/api/admin/weather/route.ts
//
// Stub endpoint for the Weather widget (Slice 141). Real impl needs
// an OpenWeather API key wired through an env var + a small adapter
// (the widget settings already cover `location: auto|manual|active-job`).
// Until that lands the stub returns 204 No Content so the widget's
// `if (!res.ok) setStatus('empty')` branch fires cleanly.
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
  // 204 No Content — the widget treats !res.ok as "no data" and renders
  // its WidgetEmpty "Weather unavailable" copy.
  return new NextResponse(null, { status: 204 });
}, { routeName: 'admin/weather' });
