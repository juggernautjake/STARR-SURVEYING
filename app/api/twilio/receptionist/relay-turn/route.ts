// app/api/twilio/receptionist/relay-turn/route.ts — the relay asks the brain for the next thing to say.
//
// Called by worker/relay (not by Twilio) once per caller utterance on a ConversationRelay call. The
// response is a stream: the assistant's words as plain text, sentence by sentence as the model
// writes them, then one ASCII record separator, then the JSON envelope (next step, facts, summary).
// The relay forwards the words to Twilio the moment they arrive; that is where the speed comes from.
//
// The lead is saved here, synchronously, the moment the brain has a name and a number — it takes a
// few hundred milliseconds and the caller is already hearing the reply. Everything slower
// (transcript writes, notifications, the wrap-up analysis) runs after the response, via defer.
//
// AUTH: the shared relay secret in `x-relay-secret`, compared in constant time. Not Twilio-signed,
// because Twilio never calls this; it is app-to-app.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { insertLeadFromForm, notifyIntakeRecipients, type LeadIntakeInput } from '@/lib/leads/intake';
import { streamReply } from '@/lib/receptionist/brain';
import { appendTurns, factsToColumns, getCallBySid, updateCall } from '@/lib/receptionist/calls';
import { finishCall, summaryFromTurns } from '@/lib/receptionist/finish';
import { RELAY_RS, relayConfig, validRelaySecret, type RelayRequest } from '@/lib/receptionist/relay';
import type { CallState } from '@/lib/receptionist/state';
import { defer } from '@/lib/server/defer';
import { knownCallerLine, lookupKnownCaller } from '@/lib/receptionist/known-caller';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
  const cfg = relayConfig();
  if (!cfg || !validRelaySecret(request.headers.get('x-relay-secret'), cfg.secret)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let body: RelayRequest;
  try {
    body = (await request.json()) as RelayRequest;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  if (!body?.callSid) return NextResponse.json({ error: 'callSid required' }, { status: 400 });

  if (body.event === 'interrupt') {
    // The caller cut in. Keep only what was actually heard, so the next turn's context is honest.
    const said = (body.said ?? '').trim();
    defer((async () => {
      const call = await getCallBySid(supabaseAdmin, body.callSid);
      if (!call) return;
      const turns = [...(call.transcript ?? [])];
      const last = turns.length - 1;
      if (last >= 0 && turns[last].role === 'assistant') {
        turns[last] = { ...turns[last], text: said ? `${said} (interrupted)` : '(interrupted)' };
        await updateCall(supabaseAdmin, body.callSid, { transcript: turns });
      }
    })(), 'relay interrupt');
    return NextResponse.json({ ok: true });
  }

  if (body.event === 'closed') {
    const state = body.state ?? { turns: [], facts: {}, silence: 0, started: Date.now() };
    defer(finishCall(body.callSid, body.from ?? '', state, body.summary || summaryFromTurns(state)), 'relay closed wrap-up');
    return NextResponse.json({ ok: true });
  }

  if (body.event !== 'turn') return NextResponse.json({ error: 'unknown event' }, { status: 400 });

  const state: CallState = body.state ?? { turns: [], facts: {}, silence: 0, started: Date.now() };
  const isTest = body.test === true || state.test === true;
  const heard = (body.heard ?? '').trim();
  const from = body.from ?? '';
  // First turn: does this number belong to someone we know? One lookup, carried in the facts after.
  if (state.turns.length === 0 && !state.facts.knownCaller) {
    const line = knownCallerLine(await lookupKnownCaller(supabaseAdmin, from));
    if (line) state.facts = { ...state.facts, knownCaller: line };
  }
  const callSid = body.callSid;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => controller.enqueue(encoder.encode(s));
      try {
        const reply = await streamReply(state, heard, from, send, request.signal);
        const facts = { ...state.facts, ...reply.facts };

        // Save the lead the moment there is enough to save. Synchronous: the id has to travel back.
        // A test call captures the facts (they show on /admin/calls) but never becomes a lead.
        if (reply.readyToSave && !facts.leadId && facts.name && !isTest) {
          try {
            const lead = await insertLeadFromForm(supabaseAdmin, leadFrom({ ...state, facts }, from));
            if (lead) {
              facts.leadId = lead.id;
              defer(notifyIntakeRecipients(supabaseAdmin, { leadId: lead.id, input: leadFrom({ ...state, facts }, from) }), 'relay lead notifications');
              defer(updateCall(supabaseAdmin, callSid, { lead_id: lead.id }), 'relay lead link');
            }
          } catch (err) {
            console.error('[relay-turn] lead save failed:', err);
          }
        }

        defer((async () => {
          await appendTurns(supabaseAdmin, callSid, [{ role: 'caller', text: heard }, { role: 'assistant', text: reply.say }]);
          await updateCall(supabaseAdmin, callSid, factsToColumns(facts));
        })(), 'relay transcript');

        send(RELAY_RS + JSON.stringify({ say: reply.say, next: reply.next, facts, readyToSave: reply.readyToSave, summary: reply.summary ?? null }));
      } catch (err) {
        console.error('[relay-turn] failed:', err);
        send(RELAY_RS + JSON.stringify({ say: '', next: 'continue', facts: state.facts, readyToSave: false, summary: null, error: 'turn failed' }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}
