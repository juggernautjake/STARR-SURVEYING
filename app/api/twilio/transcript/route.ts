// app/api/twilio/transcript/route.ts — Voice Intelligence finished transcribing a recording.
//
// Calls a person answered come through here, and since 2026-09-16 so do calls the conversational
// agent answered on ElevenLabs — for those, this is the ONLY transcript there is, because the
// conversation happened between the caller and ElevenLabs and no turns were written as it went.
//
// The webhook names the transcript; we fetch its sentences, map channel 1 to the caller and channel
// 2 to whoever was on the other end (Hank, or the agent), store them on the call, run the analysis,
// and notify the owners with the summary.
//
// PUBLIC BY DESIGN: Twilio-signed. Intelligence webhooks may arrive as JSON; Twilio then signs the
// URL plus a `bodySHA256` query parameter, which validTwilioSignature handles when given the raw
// body hash in the URL.
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { validTwilioSignature, publicUrlOf } from '@/lib/twilio/signature';
import { getTranscript, getTranscriptSentences } from '@/lib/twilio/rest';
import { getCallByRecordingSid, updateCall, type CallTurn } from '@/lib/receptionist/calls';
import { analyzeCall, contactColumns } from '@/lib/receptionist/analysis';
import { notifyOwners } from '@/lib/receptionist/notify';
import { rememberCaller } from '@/lib/receptionist/registry';
import { OWNER_NAME } from '@/lib/receptionist/knowledge';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const url = publicUrlOf(request);
  const sig = request.headers.get('x-twilio-signature');
  const isJson = (request.headers.get('content-type') ?? '').includes('application/json');
  let params: Record<string, string> = {};
  let ok = false;
  if (isJson) {
    // Twilio signs JSON webhooks by appending bodySHA256=<hash of the body> to the URL it calls and
    // signing that full URL. So the hash usually arrives in our query string already (verify it
    // matches the body we got); a client that signed the bare URL plus the hash is accepted too.
    const hash = createHash('sha256').update(raw).digest('hex');
    const given = new URL(url).searchParams.get('bodySHA256');
    ok = given
      ? given.toLowerCase() === hash && validTwilioSignature(url, {}, sig)
      : validTwilioSignature(`${url}${url.includes('?') ? '&' : '?'}bodySHA256=${hash}`, {}, sig);
    try { params = Object.fromEntries(Object.entries(JSON.parse(raw) as Record<string, unknown>).map(([k, v]) => [k, String(v)])); } catch { params = {}; }
  } else {
    params = Object.fromEntries(new URLSearchParams(raw));
    ok = validTwilioSignature(url, params, sig);
  }
  if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const transcriptSid = params.transcript_sid ?? params.TranscriptSid ?? '';
  const status = (params.status ?? params.Status ?? '').toLowerCase();
  if (!transcriptSid || (status && status !== 'completed')) return new Response(null, { status: 204 });

  try {
    const t = await getTranscript(transcriptSid);
    const recordingSid = t.channel?.media_properties?.source_sid;
    if (!recordingSid) return new Response(null, { status: 204 });
    const call = await getCallByRecordingSid(supabaseAdmin, recordingSid);
    if (!call) return new Response(null, { status: 204 });
    const sentences = await getTranscriptSentences(transcriptSid);
    // Channel 2 is the answering end of the dial: Hank on a call he picked up, the receptionist on
    // one it took. Calling the agent 'owner' would put its words in Hank's mouth on the calls page.
    const answeredByAi = call.answered_by === 'ai';
    const other: CallTurn['role'] = answeredByAi ? 'assistant' : 'owner';
    const turns: CallTurn[] = sentences.map((s) => ({ role: s.media_channel === 2 ? other : 'caller', text: s.transcript }));
    let updated = await updateCall(supabaseAdmin, call.call_sid, { transcript: turns, transcript_sid: transcriptSid, transcript_status: 'completed' });
    if (updated) {
      const analysis = await analyzeCall(updated);
      if (analysis) updated = (await updateCall(supabaseAdmin, call.call_sid, { ...contactColumns(updated, analysis), analysis, summary: analysis.summary, kind: analysis.caller_type === 'personal' ? 'personal' : analysis.caller_type === 'vendor' ? 'vendor' : analysis.caller_type === 'customer' || analysis.caller_type === 'existing_client' ? 'customer' : 'unknown' })) ?? updated;
    }
    // The analysis is the best contact data a call ever produces — a name and an email read back
    // and confirmed out loud. It teaches the caller ID memory (lib/receptionist/registry.ts) the
    // same way a finished call does, as `observed`: the next call may recognise the name, never
    // greet with it. Only a person typing it on the registry page makes a name certain.
    if (!call.is_test) {
      await rememberCaller(supabaseAdmin, {
        phone: call.from_number,
        name: updated?.caller_name ?? call.caller_name ?? null,
        email: updated?.caller_email ?? call.caller_email ?? null,
        about: updated?.analysis?.intent ?? null,
        at: call.started_at ?? undefined,
        isTest: false,
      });
    }
    // A test call is transcribed and analysed like any other; it just tells nobody (notifyOwners
    // refuses a test row anyway — this keeps the intent visible at the call site).
    if (!call.is_test) {
      await notifyOwners({
        from: call.from_number,
        facts: {},
        summary: updated?.analysis?.summary || (answeredByAi ? 'Transcript is ready for the call the receptionist answered.' : `Transcript is ready for the call ${OWNER_NAME} answered.`),
        callId: call.id,
        answeredBy: answeredByAi ? 'ai' : 'owner',
        call: updated ?? call,
      });
    }
  } catch (err) {
    console.error('[transcript] failed:', err);
  }
  return new Response(null, { status: 204 });
}
