// app/api/admin/receptionist-test/voices/route.ts — which voice each agent speaks with.
//
//   GET                                  → the shortlist, plus the voice each agent uses now
//   POST { voiceId, agent?: 'starr' | 'generic' | 'both' }   → switch it, effective next conversation
//
// Owner, 2026-09-16: "I want it so that we can switch voices … If I want to hear it on a call, I can
// just switch to it and test it conversationally or with it acting like the actual Starr agent."
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { AGENT_VOICES, agentVoiceById } from '@/lib/receptionist/agent-voices';
import { agentIdFor, elevenLabsKey, type AgentKind } from '@/lib/receptionist/elevenlabs-agents';

export const dynamic = 'force-dynamic';

const API = 'https://api.elevenlabs.io';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

/** The voice an agent is set to right now, read from ElevenLabs rather than assumed. */
async function currentVoice(kind: AgentKind, key: string): Promise<string | null> {
  const id = agentIdFor(kind);
  if (!id) return null;
  const res = await fetch(`${API}/v1/convai/agents/${id}`, { headers: { 'xi-api-key': key } });
  if (!res.ok) return null;
  const j = (await res.json()) as { conversation_config?: { tts?: { voice_id?: string } } };
  return j.conversation_config?.tts?.voice_id ?? null;
}

export const GET = withErrorHandler(async () => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const key = elevenLabsKey();
  if (!key) return NextResponse.json({ voices: AGENT_VOICES, current: {}, configured: false });
  const [starr, generic] = await Promise.all([currentVoice('starr', key), currentVoice('generic', key)]);
  return NextResponse.json({ voices: AGENT_VOICES, current: { starr, generic }, configured: true });
}, { routeName: 'admin/receptionist-test/voices' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const key = elevenLabsKey();
  if (!key) return NextResponse.json({ error: 'ElevenLabs is not configured on this deployment.' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { voiceId?: string; agent?: string };
  const voice = agentVoiceById(body.voiceId);
  if (!voice) return NextResponse.json({ error: 'Unknown voice.' }, { status: 400 });
  const kinds: AgentKind[] = body.agent === 'starr' ? ['starr'] : body.agent === 'generic' ? ['generic'] : ['starr', 'generic'];

  const changed: string[] = [];
  for (const kind of kinds) {
    const id = agentIdFor(kind);
    if (!id) continue;
    const res = await fetch(`${API}/v1/convai/agents/${id}`, {
      method: 'PATCH',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ conversation_config: { tts: { voice_id: voice.id } } }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: `ElevenLabs refused the change (HTTP ${res.status}). ${detail.slice(0, 140)}` }, { status: 502 });
    }
    changed.push(kind);
  }
  console.log(`[receptionist-test] ${gate.email} set ${changed.join(' + ')} voice to ${voice.name}`);
  return NextResponse.json({ voice: voice.id, name: voice.name, agents: changed });
}, { routeName: 'admin/receptionist-test/voices' });
