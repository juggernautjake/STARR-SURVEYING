// app/api/admin/research/requests/claim/route.ts — one request, one machine (plan R28).
//
// POST — claim the oldest queued request and mark it running.
// PATCH — report the outcome of a claimed request, and notify either way.
//
// ── WHY THE CLAIM IS A CONDITIONAL UPDATE ───────────────────────────────────────────────────────
//
// Two workers polling one queue will race. A read-then-write — SELECT the oldest queued row, then
// UPDATE it — hands one property to two machines and pays for it twice, and the window is exactly as
// wide as the network round trip between them. The claim below updates guarded on
// `status = 'queued'` and treats "no row updated" as "somebody else got it", which is the only shape
// that is correct without a transaction.

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import { notify } from '@/lib/notifications';
import { notificationFor, shouldRetry, type RequestRow } from '@/lib/research/intake';

/** The worker authenticates with its own key, not a user session: this endpoint is polled by a
 *  machine, and a session would expire under it. */
function workerAuthorised(req: NextRequest): boolean {
  const key = process.env.WORKER_API_KEY;
  if (!key) return false;
  const header = req.headers.get('x-worker-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return !!header && header === key;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  if (!workerAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: candidates, error: readErr } = await supabaseAdmin
    .from('research_requests')
    .select('id, attempts')
    .eq('status', 'queued')
    .order('queued_at', { ascending: true })
    .limit(5);

  if (readErr) return NextResponse.json({ error: 'Could not read the queue.' }, { status: 500 });

  // Walk the oldest few: if another worker took the first, try the next rather than returning empty
  // and sleeping — an idle machine beside a full queue is the thing this loop exists to prevent.
  for (const c of (candidates ?? []) as Array<{ id: string; attempts: number }>) {
    const { data, error } = await supabaseAdmin
      .from('research_requests')
      .update({
        status: 'running',
        claimed_at: new Date().toISOString(),
        attempts: c.attempts + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', c.id)
      .eq('status', 'queued')   // ← the guard. Lose the race and this matches nothing.
      .select('*');

    if (error) continue;
    if ((data ?? []).length === 1) {
      return NextResponse.json({ request: (data as RequestRow[])[0] });
    }
    // Zero rows: another worker claimed it between our read and our write. Try the next one.
  }

  return NextResponse.json({ request: null, message: 'Nothing queued.' });
}, { routeName: 'research/requests-claim' });

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  if (!workerAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    outcome?: 'complete' | 'failed';
    projectId?: string | null;
    packetId?: string | null;
    failureReason?: string | null;
  };

  if (!body.id || !body.outcome) {
    return NextResponse.json({ error: 'id and outcome are required' }, { status: 400 });
  }

  const { data: current } = await supabaseAdmin
    .from('research_requests').select('*').eq('id', body.id).single();
  if (!current) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

  const row = current as RequestRow & { notify_email: string | null };

  // A failure that can be retried goes back on the queue; one that cannot stops and says why.
  // Retrying a permanent failure — a county with no adapter — burns a full run to reach the same
  // answer, every time, forever.
  let status: RequestRow['status'] = body.outcome;
  let retryNote = '';
  if (body.outcome === 'failed') {
    const decision = shouldRetry(row.attempts, row.max_attempts, body.failureReason ?? null);
    retryNote = decision.reason;
    if (decision.retry) status = 'queued';
  }

  const { data, error } = await supabaseAdmin
    .from('research_requests')
    .update({
      status,
      research_project_id: body.projectId ?? row.research_project_id,
      packet_id: body.packetId ?? row.packet_id,
      failure_reason: body.outcome === 'failed'
        ? `${body.failureReason ?? 'No reason recorded.'} ${retryNote}`.trim()
        : null,
      finished_at: status === 'queued' ? null : new Date().toISOString(),
      claimed_at: status === 'queued' ? null : row['claimed_at' as keyof RequestRow] as string | null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: `Could not record the outcome: ${error.message}` }, { status: 500 });

  const finished = data as RequestRow;
  let notified = false;

  // Notify either way. Failure is the one people forget, and it is the one that matters: a request
  // that quietly failed looks identical to one still running, and somebody finds out when the crew
  // is already on site.
  if (status !== 'queued' && row.notify_email) {
    const message = notificationFor(finished);
    if (message) {
      try {
        await notify({
          user_email: row.notify_email,
          type: status === 'failed' ? 'research_failed' : 'research_complete',
          title: message.title,
          body: message.body,
          link: message.link ?? undefined,
        });
        await supabaseAdmin
          .from('research_requests')
          .update({ notified_at: new Date().toISOString() })
          .eq('id', body.id);
        notified = true;
      } catch {
        // Leaving `notified_at` null is deliberate: the partial index on unnotified finished
        // requests is how somebody finds the run nobody was told about.
      }
    }
  }

  return NextResponse.json({ request: finished, notified, retryNote });
}, { routeName: 'research/requests-outcome' });
