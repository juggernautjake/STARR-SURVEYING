// app/api/twilio/transcript/route.ts — Voice Intelligence finished transcribing a recording.
//
// Only calls a person answered come through here (the AI leg already has its transcript, turn by
// turn). The webhook names the transcript; we fetch its sentences, map channel 1 to the caller and
// channel 2 to the owner (dual-channel <Dial> recording), store them on the call, run the analysis,
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
import { analyzeCall } from '@/lib/receptionist/analysis';
import { notifyOwners } from '@/lib/receptionist/notify';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const url = publicUrlOf(request);
  const sig = request.headers.get('x-twilio-signature');
  const isJson = (request.headers.get('content-type') ?? '').includes('application/json');
  let params: Record<string, string> = {};
  let ok = false;
  if (isJson) {
    const withHash = `${url}${url.includes('?') ? '&' : '?'}bodySHA256=${createHash('sha256').update(raw).digest('hex')}`;
    ok = validTwilioSignature(withHash, {}, sig);
    try { params = Object.fromEntries(Object.entries(JSON.parse(raw) as Record<string, unknown>).map(([k, v]) => [k, String(v)])); } catch { params = {}; }
  } else {
    params = Object.fromEntries(new URLSearchParams(raw));
    ok = validTwilioSignature(url, params, sig);
  }
  if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const transcriptSid = params.transcript_sid ?? params.TranscriptSid ?? '';
  const status = (params.status ?? params.Status ?? '').toLowerCase();
  if (!transcriptSid || (status && status !== 'completed')) return new Response('', { status: 204 });

  try {
    const t = await getTranscript(transcriptSid);
    const recordingSid = t.channel?.media_properties?.source_sid;
    if (!recordingSid) return new Response('', { status: 204 });
    const call = await getCallByRecordingSid(supabaseAdmin, recordingSid);
    if (!call) return new Response('', { status: 204 });
    const sentences = await getTranscriptSentences(transcriptSid);
    const turns: CallTurn[] = sentences.map((s) => ({ role: s.media_channel === 2 ? 'owner' : 'caller', text: s.transcript }));
    let updated = await updateCall(supabaseAdmin, call.call_sid, { transcript: turns, transcript_sid: transcriptSid, transcript_status: 'completed' });
    if (updated) {
      const analysis = await analyzeCall(updated);
      if (analysis) updated = (await updateCall(supabaseAdmin, call.call_sid, { analysis, summary: analysis.summary, kind: analysis.caller_type === 'personal' ? 'personal' : analysis.caller_type === 'vendor' ? 'vendor' : analysis.caller_type === 'customer' || analysis.caller_type === 'existing_client' ? 'customer' : 'unknown' })) ?? updated;
    }
    await notifyOwners({ from: call.from_number, facts: { kind: (updated?.kind as never) ?? 'unknown', name: updated?.caller_name ?? undefined }, summary: updated?.analysis?.summary || 'transcript ready for the call Hank answered', callId: call.id, answeredBy: 'owner' });
  } catch (err) {
    console.error('[transcript] failed:', err);
  }
  return new Response('', { status: 204 });
}
