// app/api/admin/nav-events/route.ts
//
// ADMIN_NAVIGATION_REDESIGN.md §13.8 deferred item — receive nav.*
// telemetry events from the V2 rail components and persist to
// `nav_events`. POST-only; payload is `{ event: string, props?: object }`.
// 204 No Content on success (clients don't render the response). The
// route swallows errors silently to keep telemetry off the
// critical-path — a flaky write should not break navigation.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const KNOWN_EVENTS = new Set([
  'nav.cmdk.open',
  'nav.workspace.click',
  'nav.pin.add',
  'nav.pin.remove',
  'nav.persona.override',
]);

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { event?: string; props?: Record<string, unknown>; pathname?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = (body.event ?? '').trim();
  if (!event || !KNOWN_EVENTS.has(event)) {
    return NextResponse.json({ error: 'Unknown event name' }, { status: 400 });
  }

  const pathname = typeof body.pathname === 'string' ? body.pathname.slice(0, 256) : null;
  const props = body.props && typeof body.props === 'object' ? body.props : {};

  // Fire-and-forget insert. The table might not exist yet (seed 300 not
  // applied) — in that case Supabase returns an error which we silently
  // ignore; telemetry is best-effort and should never break navigation.
  try {
    await supabaseAdmin.from('nav_events').insert({
      event_name: event,
      user_email: session.user.email,
      pathname,
      props,
    });
  } catch {
    // swallow
  }

  return new NextResponse(null, { status: 204 });
}, { routeName: 'admin/nav-events' });
