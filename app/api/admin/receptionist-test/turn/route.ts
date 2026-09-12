// app/api/admin/receptionist-test/turn/route.ts — the receptionist by text, for quick checks.
//
// The developer page's chat panel. Same brain, same streaming reply, same model as a phone call,
// minus the microphone: useful for checking a quote, a land-law answer, or how the intake goes,
// in seconds, without a phone. Each chat is a phone_calls row (call_sid TEST-…, is_test) so it is
// reviewable on /admin/calls with its transcript and analysis like any other call.
//
// Streams like relay-turn: the words, then RS, then a JSON envelope; the envelope adds callSid and
// timings so the page can show time-to-first-word — the number the owner asked to bring down.
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { streamReply } from '@/lib/receptionist/brain';
import { appendTurns, factsToColumns, startCall, updateCall } from '@/lib/receptionist/calls';
import { finishCall, summaryFromTurns } from '@/lib/receptionist/finish';
import { RELAY_RS } from '@/lib/receptionist/relay';
import { emptyState, type CallState } from '@/lib/receptionist/state';
import { defer } from '@/lib/server/defer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface TurnBody { callSid?: string; heard?: string; state?: CallState; end?: boolean }

export async function POST(req: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const email = session.user.email;
  const body = (await req.json().catch(() => ({}))) as TurnBody;
  const state: CallState = { ...emptyState(), ...(body.state ?? {}), test: true };
  const from = `web:${email}`;

  let callSid = body.callSid ?? '';
  if (!callSid) {
    callSid = `TEST-${randomUUID()}`;
    await startCall(supabaseAdmin, { callSid, from, to: 'text chat', isTest: true });
    await updateCall(supabaseAdmin, callSid, { status: 'in-progress', answered_by: 'ai', is_test: true });
  }

  if (body.end) {
    defer(finishCall(callSid, from, state, summaryFromTurns(state)), 'test chat wrap-up');
    return NextResponse.json({ ok: true, callSid });
  }

  const heard = (body.heard ?? '').trim();
  if (!heard) return NextResponse.json({ error: 'Say something first.' }, { status: 400 });
  const encoder = new TextEncoder();
  const t0 = Date.now();
  let firstWordMs: number | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => controller.enqueue(encoder.encode(s));
      try {
        const reply = await streamReply(state, heard, from, (t) => { if (firstWordMs === null) firstWordMs = Date.now() - t0; send(t); }, req.signal);
        const facts = { ...state.facts, ...reply.facts };
        defer((async () => {
          await appendTurns(supabaseAdmin, callSid, [{ role: 'caller', text: heard }, { role: 'assistant', text: reply.say }]);
          await updateCall(supabaseAdmin, callSid, factsToColumns(facts));
        })(), 'test chat transcript');
        if (reply.next === 'done' || reply.next === 'voicemail') {
          const after = { ...state, facts, turns: [...state.turns, { role: 'caller' as const, text: heard }, { role: 'assistant' as const, text: reply.say }] };
          defer(finishCall(callSid, from, after, reply.summary || summaryFromTurns(after)), 'test chat wrap-up');
        }
        send(RELAY_RS + JSON.stringify({ callSid, say: reply.say, next: reply.next, facts, readyToSave: reply.readyToSave, summary: reply.summary ?? null, firstWordMs, totalMs: Date.now() - t0 }));
      } catch (err) {
        console.error('[receptionist-test/turn] failed:', err);
        send(RELAY_RS + JSON.stringify({ callSid, say: '', next: 'continue', facts: state.facts, error: 'turn failed', firstWordMs, totalMs: Date.now() - t0 }));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}
