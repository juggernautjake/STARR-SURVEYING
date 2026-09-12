// app/api/twilio/status/route.ts — the call ended, however it ended.
//
// The number's StatusCallback. This is the one hook that fires when the caller hangs up during the
// ring or mid-conversation, so it closes any row the other routes did not: final duration, status,
// and — for a call nobody handled — a "missed call" notice to the owners.
//
// PUBLIC BY DESIGN: Twilio-signed, like the receptionist routes.
//
// 204s are built with a null body. `new Response('', { status: 204 })` throws in Node's fetch
// (a 204 may not carry a body, and an empty string counts as one), which is exactly the HTTP 500
// Twilio's debugger logged against this route on the first live calls, 2026-09-11.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { getCallBySid, updateCall } from '@/lib/receptionist/calls';
import { notifyOwners } from '@/lib/receptionist/notify';

export const dynamic = 'force-dynamic';

const FINAL = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  if (!validTwilioSignature(publicUrlOf(request), params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const status = params.CallStatus ?? '';
  if (!FINAL.has(status)) return new Response(null, { status: 204 });
  const callSid = params.CallSid ?? '';
  const call = await getCallBySid(supabaseAdmin, callSid);
  if (!call) return new Response(null, { status: 204 });

  const duration = Number(params.CallDuration) || call.duration_seconds;
  const unhandled = !call.answered_by;
  await updateCall(supabaseAdmin, callSid, {
    status: status === 'completed' ? 'completed' : 'failed',
    duration_seconds: duration,
    ended_at: call.ended_at ?? new Date().toISOString(),
    answered_by: unhandled ? 'none' : call.answered_by,
  });
  if (unhandled && !call.notified_at) {
    await notifyOwners({ from: call.from_number, facts: { kind: 'unknown' }, summary: `missed: hung up after ${duration ?? '?'} seconds, before anyone answered`, callId: call.id, answeredBy: 'none' });
    await updateCall(supabaseAdmin, callSid, { notified_at: new Date().toISOString() });
  }
  return new Response(null, { status: 204 });
}
