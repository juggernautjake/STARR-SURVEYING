// app/api/elevenlabs/conversation-init/route.ts — ElevenLabs asks who is calling, before it answers.
//
// Configured as the agent's "conversation initiation client data" webhook (see
// scripts/elevenlabs-agent.mjs --apply). At the start of every call ElevenLabs posts the caller's
// number here and substitutes what we return into the system prompt before the first word is
// spoken. It is how the platform agent gets the call history the relay version already had.
//
// THIS ROUTE IS IN FRONT OF EVERY LIVE CALL, so it is built to be boring:
//
//   · it always answers 200 with a usable body — a failure here must not stop a phone being answered
//   · the database lookup is raced against 2.5 seconds (lib/receptionist/agent-init.ts)
//   · an unknown or missing caller id is answered "brand new caller", which is what the agent
//     assumed before this route existed
//
// AUTHENTICATED, because the answer names people and the properties they called about. The token in
// the query string is derived from the Twilio auth token (see agent-init.ts for why that one); a request without it gets the new-caller answer
// rather than an error, so a misconfigured webhook degrades instead of breaking. Nothing about a
// caller is ever returned to an unauthenticated request.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { initPayload, initVariables, INIT_PLACEHOLDERS, validInitToken, type InitRequestBody } from '@/lib/receptionist/agent-init';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let body: InitRequestBody = {};
  try {
    body = (await request.json()) as InitRequestBody;
  } catch {
    body = {};
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('t') ?? request.headers.get('x-starr-init-token');
  if (!validInitToken(token)) {
    console.error('[conversation-init] unauthenticated request — answering as a new caller');
    return NextResponse.json(initPayload(INIT_PLACEHOLDERS));
  }

  try {
    const vars = await initVariables(supabaseAdmin, body);
    const known = vars.caller_history !== INIT_PLACEHOLDERS.caller_history;
    console.log(`[conversation-init] ${body.caller_id ? 'caller id present' : 'no caller id'} · ${known ? 'known number' : 'new number'}`);
    return NextResponse.json(initPayload(vars));
  } catch (err) {
    console.error('[conversation-init] failed, answering as a new caller:', err);
    return NextResponse.json(initPayload(INIT_PLACEHOLDERS));
  }
}

/** A GET is not part of the contract; it exists so the owner (and a deploy check) can see that the
 *  endpoint is alive without learning anything about anyone. */
export async function GET(): Promise<Response> {
  return NextResponse.json({ ok: true, expects: 'POST from ElevenLabs conversation initiation' });
}
