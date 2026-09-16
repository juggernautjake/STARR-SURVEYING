// app/api/admin/receptionist-test/talk/route.ts — a token to talk to an agent from the browser.
//
//   POST { agent: 'starr' | 'generic' } → { token, agentId }
//
// Owner, 2026-09-15: "there should be a button to click to just start a conversation." The browser
// opens a WebRTC session straight to ElevenLabs with this token — no phone, no Twilio, no ringing
// anyone. Tokens are short-lived and minted only for signed-in admins, so the agent (and the firm's
// ElevenLabs minutes) cannot be reached by anyone else.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { conversationToken, type AgentKind } from '@/lib/receptionist/elevenlabs-agents';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { agent?: string };
  const kind: AgentKind = body.agent === 'generic' ? 'generic' : 'starr';
  const result = await conversationToken(kind);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  console.log(`[receptionist-test] ${session.user.email} opened a browser conversation with the ${kind} agent`);
  return NextResponse.json({ ...result, agent: kind });
}, { routeName: 'admin/receptionist-test/talk' });
