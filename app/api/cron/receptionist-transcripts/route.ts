// app/api/cron/receptionist-transcripts/route.ts — save every agent conversation, unprompted.
//
// Owner, 2026-09-16: "can you save the transcripts". They were saved only when somebody pressed
// **File the conversation** on /admin/dev/receptionist. Anything said to an agent that nobody
// remembered to file lived only in ElevenLabs' own history page, where it is not searchable beside
// the phone calls and ages out with the retention window. A transcript that exists only if a human
// remembers a button is a transcript that is not being kept.
//
// Every fifteen minutes, so a conversation is on /admin/calls while it is still worth reading, and
// because ElevenLabs writes its `transcript_summary` a little after the call ends — the tick that
// catches a conversation seconds old files the words, and a later tick fills in the summary (the
// row is keyed `EL-<conversation_id>`, so that is an update, never a duplicate).
//
// Auth: `Authorization: Bearer <CRON_SECRET>`, the same as every other cron here.
//
// Vercel cron config (vercel.json):
//   { "path": "/api/cron/receptionist-transcripts", "schedule": "*/15 * * * *" }

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { agentsConfigured } from '@/lib/receptionist/elevenlabs-agents';
import { importAgentConversations } from '@/lib/receptionist/import-conversations';

/** A quarter-hour of conversations is a handful; 30 is headroom, not a target. */
const PAGE_SIZE = 30;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/receptionist-transcripts] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // A deployment without the ElevenLabs key or the agent ids has nothing to import, which is not a
  // failure: preview and local deploys are in that state permanently. Returning 200 with
  // `configured: false` keeps a cron that genuinely broke distinguishable from one that has no work.
  const configured = agentsConfigured();
  const result = await importAgentConversations(PAGE_SIZE);

  if (result.errors.length) console.error('[cron/receptionist-transcripts] some conversations failed', result.errors);
  else console.log('[cron/receptionist-transcripts] imported', result.imported, 'updated', result.updated, 'skipped', result.skipped);

  return NextResponse.json({ configured, ...result });
}, { routeName: 'cron/receptionist-transcripts' });
