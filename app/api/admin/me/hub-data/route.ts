// app/api/admin/me/hub-data/route.ts
//
// Hub data aggregator. The hub canvas calls this in a single request
// to hydrate every widget on the page, rather than each widget
// firing its own fetch on mount.
//
// GET /api/admin/me/hub-data?widgets=my-jobs,my-pay,today-schedule
//   → { 'my-jobs': {...}, 'my-pay': {...}, ... }
//
// Slice 152 of customizable-hub-and-work-mode-2026-05-28.md.
//
// Note: the aggregator just forwards each widget's standard endpoint
// in parallel. As more widgets ship, the source map below grows. For
// now we cover the most-used widgets; un-covered types fall through
// to `null` and the widget loads via its existing per-widget fetch.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface WidgetSource {
  /** Path relative to /api. The route forwards the caller's cookies
   *  so the per-widget endpoint inherits the session. */
  path: string;
}

const WIDGET_SOURCES: Record<string, WidgetSource | undefined> = {
  'my-jobs':                 { path: '/admin/jobs?my_jobs=true&limit=10' },
  'my-pay':                  { path: '/admin/payroll/employees' },
  'pto-balance':             { path: '/admin/pto' },
  'today-schedule':          { path: '/admin/schedule' },
  'pending-receipts':        { path: '/admin/receipts?status=pending' },
  'pending-time-off':        { path: '/admin/time-off?status=pending' },
  'team-status':             { path: '/admin/team/status' },
  'messages':                { path: '/admin/messages/conversations?limit=10' },
  'open-discussions':        { path: '/admin/messages/conversations?limit=20' },
  'mentions-inbox':          { path: '/admin/messages/mentions' },
  'recent-announcements':    { path: '/admin/announcements?limit=3' },
  'class-assignments':       { path: '/admin/learn/assignments?status=assigned' },
  'roadmap-progress':        { path: '/admin/learn/roadmap' },
  'flashcards-due':          { path: '/admin/learn/flashcards?due=true&summary=1' },
  'quiz-history':            { path: '/admin/learn/quiz-attempts?limit=20' },
  'recommended-lessons':     { path: '/admin/learn/recommended?limit=10' },
  'streak-counter':          { path: '/admin/learn/streak' },
  'hours-this-week':         { path: '/admin/time-logs?week_start=auto' },
  'equipment-out-today':     { path: '/admin/equipment/today?status=checked-out&mine=true' },
  'maintenance-due':         { path: '/admin/equipment/maintenance?due=month' },
  'low-consumables':         { path: '/admin/equipment/consumables?below=25' },
  'vehicles-status':         { path: '/admin/equipment/vehicles?filter=all' },
  'recent-drawings':         { path: '/admin/cad/drawings?mine=true' },
  'drawings-in-progress':    { path: '/admin/cad/drawings?status=in-progress&mine=true' },
  'active-research-projects':{ path: '/admin/research?status=active' },
  'pipeline-status':         { path: '/admin/research/pipeline' },
  'assignments-due':         { path: '/admin/assignments?mine=true' },
  'crew-calendar':           { path: '/admin/personnel/crew-calendar?range=this-week' },
  'field-data-pending':      { path: '/admin/jobs/field-data?status=pending' },
  'job-activity-feed':       { path: '/admin/jobs/activity' },
  'pending-hours':           { path: '/admin/time-logs/approve?status=pending' },
  'monthly-revenue':         { path: '/admin/reports?metric=monthly-revenue' },
  'outstanding-invoices':    { path: '/admin/invoices?status=outstanding' },
  'weather':                 { path: '/admin/weather?location=auto' },
  'mileage-tracker':         { path: '/admin/mileage?period=week' },
  'sun-calculator':          { path: '/admin/sun' },
  // Universal/personal widgets that don't need server data
  'pinned-pages':            undefined,
  'quick-actions':           undefined,
  'recent-activity':         undefined,
  'bookmarks':               undefined,
  'daily-briefing':          undefined,
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requested = (searchParams.get('widgets') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (requested.length === 0) return NextResponse.json({});

  // Forward the caller's cookies so per-widget endpoints inherit the
  // session. The aggregator deliberately runs each fetch in parallel
  // and never aborts the whole request on one failure — each widget
  // gets its own success/error envelope.
  const cookieHeader = req.headers.get('cookie') ?? '';
  const origin = new URL(req.url).origin;

  const results = await Promise.all(requested.map(async (widgetId) => {
    const source = WIDGET_SOURCES[widgetId];
    if (!source) return [widgetId, { skipped: true }] as const;
    try {
      const res = await fetch(`${origin}/api${source.path}`, {
        headers: { cookie: cookieHeader },
        cache: 'no-store',
      });
      if (!res.ok) {
        return [widgetId, { error: `HTTP ${res.status}` }] as const;
      }
      const data = await res.json();
      return [widgetId, { data }] as const;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return [widgetId, { error: message }] as const;
    }
  }));

  const out: Record<string, unknown> = {};
  for (const [id, payload] of results) {
    out[id] = payload;
  }
  return NextResponse.json(out);
}, { routeName: 'admin/me/hub-data' });
