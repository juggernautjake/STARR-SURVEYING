// app/api/twilio/receptionist/turn/route.ts — one thing the caller said, one reply.
//
// Twilio's speech recognition posts `SpeechResult`. The brain decides what to say and whether to
// keep listening, take a voicemail, or hang up. Every turn is appended to the call row, so the
// transcript on /admin/calls is complete even if the caller hangs up mid-sentence. When the brain
// has a customer's name and number it saves a lead through `insertLeadFromForm` — the same path as
// the website form, so the lead shows up in /admin/leads and rings the bell like a form would.
//
// TIMING. Twilio drops a webhook after 15 s. The reply itself (one Claude call) is the only thing
// the caller waits for; the lead notifications, the analysis and the owner alerts are handed to
// `defer` and finish after the TwiML has gone out (measured 16.7 s before this, 2026-09-11).
//
// PUBLIC BY DESIGN: Twilio-signed, like the entry route.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { insertLeadFromForm, notifyIntakeRecipients, type LeadIntakeInput } from '@/lib/leads/intake';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { gather, hangup, record, say, twiml, twimlResponse } from '@/lib/twilio/twiml';
import { readStateCookie, stateCookieHeader, clearStateCookieHeader, type CallState } from '@/lib/receptionist/state';
import { nextReply } from '@/lib/receptionist/brain';
import { OWNER_NAME as OWNER } from '@/lib/receptionist/knowledge';
import { appendTurns, factsToColumns, updateCall } from '@/lib/receptionist/calls';
import { finishCall } from '@/lib/receptionist/finish';
import { defer } from '@/lib/server/defer';
import { knownCallerLine, lookupKnownCaller } from '@/lib/receptionist/known-caller';

export const dynamic = 'force-dynamic';

const MAX_TURNS = 14;

function leadFrom(state: CallState, from: string): LeadIntakeInput {
  const f = state.facts;
  const ref = `PH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${from.slice(-4)}`;
  return {
    name: f.name || `Caller ${from}`,
    email: f.email ?? '',
    phone: f.phone || from,
    propertyAddress: f.address,
    serviceType: f.service,
    projectDetails: [f.propertyId ? `Property ID: ${f.propertyId}` : null, f.details, `Taken by the phone receptionist from ${from}.`].filter(Boolean).join('\n'),
    referenceNumber: ref,
    source: 'Phone (receptionist)',
    howHeard: 'Phone call',
  };
}

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  if (!validTwilioSignature(publicUrlOf(request), params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const from = params.From ?? '';
  const callSid = params.CallSid ?? '';
  const state = readStateCookie(request);
  const heard = (params.SpeechResult ?? '').trim();

  // Silence twice in a row: stop asking and take a voicemail instead.
  if (!heard) {
    state.silence += 1;
    if (state.silence >= 2) {
      return twimlResponse(
        twiml(say(`I didn't catch that. Please leave a message for ${OWNER} after the tone, with your name and number.`), record('/api/twilio/receptionist/voicemail', '/api/twilio/receptionist/voicemail')),
        { 'set-cookie': stateCookieHeader(state) },
      );
    }
    return twimlResponse(twiml(gather('/api/twilio/receptionist/turn', 'Sorry, I missed that. Go ahead.')), { 'set-cookie': stateCookieHeader(state) });
  }
  state.silence = 0;
  if (state.turns.length === 0 && !state.facts.knownCaller) {
    const line = knownCallerLine(await lookupKnownCaller(supabaseAdmin, from));
    if (line) state.facts = { ...state.facts, knownCaller: line };
  }
  state.turns.push({ role: 'caller', text: heard });

  const reply = await nextReply(state, heard, from);
  state.facts = { ...state.facts, ...reply.facts };
  state.turns.push({ role: 'assistant', text: reply.say });
  await appendTurns(supabaseAdmin, callSid, [{ role: 'caller', text: heard }, { role: 'assistant', text: reply.say }]);
  await updateCall(supabaseAdmin, callSid, factsToColumns(state.facts));

  // Save the lead once, the moment there is enough to save.
  if (reply.readyToSave && !state.facts.leadId && !state.test) {
    try {
      const lead = await insertLeadFromForm(supabaseAdmin, leadFrom(state, from));
      if (lead) {
        state.facts.leadId = lead.id;
        await updateCall(supabaseAdmin, callSid, { lead_id: lead.id });
        defer(notifyIntakeRecipients(supabaseAdmin, { leadId: lead.id, input: leadFrom(state, from) }), 'lead notifications');
      }
    } catch (err) {
      console.error('[receptionist] lead save failed:', err);
    }
  }

  const tooLong = state.turns.length >= MAX_TURNS * 2;
  if (reply.next === 'voicemail') {
    await updateCall(supabaseAdmin, callSid, { answered_by: 'voicemail' });
    return twimlResponse(
      twiml(say(reply.say), record('/api/twilio/receptionist/voicemail', '/api/twilio/receptionist/voicemail')),
      { 'set-cookie': stateCookieHeader(state) },
    );
  }
  if (reply.next === 'done' || tooLong) {
    const summary = reply.summary || state.turns.filter((t) => t.role === 'caller').map((t) => t.text).join(' ').slice(0, 300);
    defer(finishCall(callSid, from, state, summary), 'call wrap-up');
    return twimlResponse(twiml(say(tooLong ? `Thanks, I have what I need. ${OWNER} will call you back. Goodbye.` : reply.say), hangup()), { 'set-cookie': clearStateCookieHeader() });
  }
  return twimlResponse(twiml(say(reply.say), gather('/api/twilio/receptionist/turn')), { 'set-cookie': stateCookieHeader(state) });
}
