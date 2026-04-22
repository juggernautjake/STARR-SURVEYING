// app/api/ws/ticket/route.ts
//
// Issues short-lived HMAC tickets that authorize a browser to open a
// WebSocket connection to server/ws.ts. See worker/src/shared/ws-ticket.ts for
// the format and worker/src/shared/research-events.ts for the events delivered
// over that connection.
//
// Request:  POST /api/ws/ticket
//           body: { jobIds: string[] }   // jobs the client wants to subscribe to
// Response: { ticket: string, expiresAt: number }   on 200
//           { error: string }                       on 401 / 403
//
// Authorization:
//   - Caller must have a valid next-auth session (we never trust an
//     arbitrary userId from the request body).
//   - Caller must be authorized for every requested jobId. Today we
//     gate on `research_projects.created_by = user.email`. When team
//     sharing lands this should fall back to a project_collaborators
//     check — see PHASE_A_INTEGRATION_PREP.md "Open follow-ups".

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { issueWsTicket, WS_TICKET_DEFAULT_TTL_SECONDS } from '@/worker/src/shared/ws-ticket';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const secret = process.env.WS_TICKET_SECRET;
  if (!secret) {
    // Fail closed in prod; never serve unsigned tickets.
    return NextResponse.json(
      { error: 'WebSocket auth is not configured (WS_TICKET_SECRET missing)' },
      { status: 503 },
    );
  }

  let body: { jobIds?: unknown };
  try { body = await req.json(); } catch { body = {}; }

  const requested = Array.isArray(body.jobIds)
    ? body.jobIds.filter((j): j is string => typeof j === 'string')
    : [];

  if (requested.length === 0) {
    return NextResponse.json({ error: 'jobIds (string[]) is required' }, { status: 400 });
  }
  if (requested.length > 50) {
    // Clients shouldn't be subscribing to many jobs from one tab.
    return NextResponse.json({ error: 'Too many jobIds (max 50)' }, { status: 400 });
  }

  // Authorization: confirm the caller owns each requested job.
  // We use Supabase admin client because RLS is configured for direct user
  // queries; this server route runs with the service role.
  const { data, error } = await supabaseAdmin
    .from('research_projects')
    .select('id')
    .in('id', requested)
    .eq('created_by', session.user.email);

  if (error) {
    console.error('[ws/ticket] supabase lookup failed:', error);
    return NextResponse.json({ error: 'Authorization check failed' }, { status: 500 });
  }

  const owned = new Set((data ?? []).map((r: { id: string }) => r.id));
  const denied = requested.filter((id) => !owned.has(id));
  if (denied.length > 0) {
    return NextResponse.json(
      { error: 'Forbidden', deniedJobIds: denied },
      { status: 403 },
    );
  }

  const { ticket, payload } = issueWsTicket(
    session.user.email,
    requested,
    secret,
    WS_TICKET_DEFAULT_TTL_SECONDS,
  );

  return NextResponse.json({
    ticket,
    expiresAt: payload.exp,
    ttlSeconds: WS_TICKET_DEFAULT_TTL_SECONDS,
  });
}
