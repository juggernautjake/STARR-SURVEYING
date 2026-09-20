// app/api/admin/receptionist-test/model/route.ts — which speech model the agent talks with.
//
//   GET                                       → the two models, and the one each agent uses now
//   POST { modelId, agent?: 'starr'|'generic'|'both' }  → switch it, effective next conversation
//
// Owner, 2026-09-21: "make it where we can switch between eleven_v3_conversational and
// eleven_flash_v2_5."
//
// The sibling of ./voices, and deliberately the same shape: read the live value from ElevenLabs
// rather than assume it, PATCH only the one field, and never invent a model id.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { AGENT_MODELS, parseAgentModel } from '@/lib/receptionist/agent-models';
import { agentIdFor, elevenLabsKey, type AgentKind } from '@/lib/receptionist/elevenlabs-agents';

export const dynamic = 'force-dynamic';

const API = 'https://api.elevenlabs.io';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

/** The model an agent is set to right now, read from ElevenLabs rather than assumed. */
async function currentModel(kind: AgentKind, key: string): Promise<string | null> {
  const id = agentIdFor(kind);
  if (!id) return null;
  const res = await fetch(`${API}/v1/convai/agents/${id}`, { headers: { 'xi-api-key': key } });
  if (!res.ok) return null;
  const j = (await res.json()) as { conversation_config?: { tts?: { model_id?: string } } };
  return j.conversation_config?.tts?.model_id ?? null;
}

export const GET = withErrorHandler(async () => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const key = elevenLabsKey();
  if (!key) return NextResponse.json({ models: AGENT_MODELS, current: {}, configured: false });
  const [starr, generic] = await Promise.all([currentModel('starr', key), currentModel('generic', key)]);
  return NextResponse.json({ models: AGENT_MODELS, current: { starr, generic }, configured: true });
}, { routeName: 'admin/receptionist-test/model' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const key = elevenLabsKey();
  if (!key) return NextResponse.json({ error: 'ElevenLabs is not configured on this deployment.' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { modelId?: string; agent?: string };
  // An allowlist, not a pass-through. `tts.model_id` accepts any string, so a typo would be PATCHed
  // onto the live agent and discovered when somebody rang and heard nothing.
  const modelId = parseAgentModel(body.modelId);
  if (!modelId) return NextResponse.json({ error: 'Unknown speech model.' }, { status: 400 });

  const kinds: AgentKind[] = body.agent === 'starr' ? ['starr'] : body.agent === 'generic' ? ['generic'] : ['starr', 'generic'];

  const changed: string[] = [];
  const failed: string[] = [];
  for (const kind of kinds) {
    const id = agentIdFor(kind);
    if (!id) continue;
    const res = await fetch(`${API}/v1/convai/agents/${id}`, {
      method: 'PATCH',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      // Only the one field. A whole-config PATCH would carry whatever this route happened to know
      // about the agent and quietly reset everything it did not.
      body: JSON.stringify({ conversation_config: { tts: { model_id: modelId } } }),
    });
    if (res.ok) changed.push(kind);
    else failed.push(`${kind}: HTTP ${res.status}`);
  }

  if (changed.length === 0) {
    return NextResponse.json({ error: failed.join('; ') || 'No agent to change.' }, { status: 502 });
  }
  return NextResponse.json({ modelId, changed, failed });
}, { routeName: 'admin/receptionist-test/model' });
