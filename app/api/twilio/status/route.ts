// app/api/twilio/status/route.ts — slice I2 of
// docs/planning/completed/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// Twilio's status callback: the call ended, here is how. Set as the number's "call status changes"
// webhook in the console.
//
// This is the only webhook that reliably reports a duration and a final state, including for calls
// that never reached our voice handler at all — a caller who hung up during the greeting still
// produces a status callback, and without this route that call would sit at 'ringing' forever and
// read as a call still in progress days later.
import { NextRequest, NextResponse } from 'next/server';
import { readTwilioWebhook } from '@/lib/phone/webhook';
import { registerCall, updateCallBySid } from '@/lib/phone/calls';

export const dynamic = 'force-dynamic';

/** Twilio's vocabulary → ours. Anything unrecognised is left alone rather than guessed at. */
const STATUS_MAP: Record<string, string> = {
  queued: 'ringing',
  initiated: 'ringing',
  ringing: 'ringing',
  'in-progress': 'in_progress',
  completed: 'completed',
  busy: 'busy',
  failed: 'failed',
  'no-answer': 'no_answer',
  canceled: 'canceled',
};

export async function POST(req: NextRequest) {
  const result = await readTwilioWebhook(req, 'status');
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });

  const { params, callSid } = result.data;
  if (!callSid) return NextResponse.json({ ok: true });

  const status = STATUS_MAP[params.CallStatus ?? ''] ?? null;
  const duration = Number(params.CallDuration);

  const patch: Record<string, unknown> = {};
  if (status) patch.status = status;
  if (Number.isFinite(duration) && duration > 0) patch.duration_seconds = Math.round(duration);
  if (status === 'completed' || status === 'no_answer' || status === 'busy' || status === 'failed' || status === 'canceled') {
    patch.ended_at = new Date().toISOString();
  }
  if (status === 'in_progress') patch.answered_at = new Date().toISOString();

  const updated = Object.keys(patch).length > 0 ? await updateCallBySid(callSid, patch) : true;

  // A status callback can arrive for a call we never saw — an outbound call placed from the Twilio
  // console, or a race where this beats the voice webhook. Creating the row here rather than
  // dropping the event means the log is complete, which is the entire point of having one.
  if (!updated) {
    await registerCall({
      callSid,
      direction: params.Direction?.startsWith('outbound') ? 'outbound' : 'inbound',
      from: params.From ?? null,
      to: params.To ?? null,
      callerName: params.CallerName || null,
      status: status ?? 'completed',
    });
    if (Object.keys(patch).length > 0) await updateCallBySid(callSid, patch);
  }

  return NextResponse.json({ ok: true });
}
