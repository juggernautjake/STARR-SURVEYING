// lib/receptionist/elevenlabs-agents.ts — the two ElevenLabs agents, and reading what they said.
//
// Owner, 2026-09-15: "there should be a button to click to just start a conversation … I want it to
// still transcribe everything. I want a version that is just generic all around conversation for any
// reason, and one that is totally geared and prepped and trained for taking calls for Starr Surveying."
//
//   starr     the receptionist (lib/receptionist/agent-prompt.ts + the land-law knowledge base)
//   generic   the same voice and turn-taking with no business behind it, for judging the platform
//
// A browser talks to an agent directly over WebRTC — no Twilio, no phone — using a short-lived token
// this module mints. ElevenLabs keeps the recording and the transcript of every one of those
// conversations; `listConversations`/`getConversation` read them back so they can be filed on
// /admin/calls beside the phone calls, which is what "transcribe everything" means here.
export type AgentKind = 'starr' | 'generic';

const API = 'https://api.elevenlabs.io';

export function elevenLabsKey(env: Record<string, string | undefined> = process.env): string | null {
  const k = (env.ELEVENLABS_CONVAI_KEY ?? '').trim();
  return k.startsWith('sk_') ? k : null;
}

export function agentIdFor(kind: AgentKind, env: Record<string, string | undefined> = process.env): string | null {
  const id = (kind === 'generic' ? env.ELEVENLABS_AGENT_ID_GENERIC : env.ELEVENLABS_AGENT_ID) ?? '';
  return id.trim().startsWith('agent_') ? id.trim() : null;
}

export const agentsConfigured = (env: Record<string, string | undefined> = process.env): boolean =>
  elevenLabsKey(env) !== null && agentIdFor('starr', env) !== null;

async function el<T>(path: string, env = process.env): Promise<{ ok: boolean; status: number; json: T | null }> {
  const key = elevenLabsKey(env);
  if (!key) return { ok: false, status: 503, json: null };
  const res = await fetch(API + path, { headers: { 'xi-api-key': key } });
  let json: T | null = null;
  try { json = (await res.json()) as T; } catch { /* no body */ }
  return { ok: res.ok, status: res.status, json };
}

/** A short-lived token that lets ONE browser session talk to the agent over WebRTC. */
export async function conversationToken(kind: AgentKind, env = process.env): Promise<{ token: string; agentId: string } | { error: string; status: number }> {
  const agentId = agentIdFor(kind, env);
  if (!agentId) return { error: `The ${kind} agent is not configured on this deployment.`, status: 503 };
  const res = await el<{ token?: string }>(`/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`, env);
  if (!res.ok || !res.json?.token) return { error: `ElevenLabs refused the token (HTTP ${res.status}).`, status: res.status || 502 };
  return { token: res.json.token, agentId };
}

export interface ElevenConversation {
  conversation_id: string;
  agent_id: string;
  start_time_unix_secs?: number;
  call_duration_secs?: number;
  status?: string;
  call_successful?: string;
  transcript?: Array<{ role: string; message?: string | null; time_in_call_secs?: number }>;
  analysis?: { transcript_summary?: string } | null;
}

export async function listConversations(agentId: string, limit = 20, env = process.env) {
  const res = await el<{ conversations?: ElevenConversation[] }>(`/v1/convai/conversations?agent_id=${encodeURIComponent(agentId)}&page_size=${limit}`, env);
  return res.json?.conversations ?? [];
}

export async function getConversation(id: string, env = process.env) {
  const res = await el<ElevenConversation>(`/v1/convai/conversations/${encodeURIComponent(id)}`, env);
  return res.json;
}

/** ElevenLabs' roles are `user` and `agent`; ours are `caller` and `assistant`. */
export function toCallTurns(c: ElevenConversation): Array<{ role: 'caller' | 'assistant'; text: string }> {
  return (c.transcript ?? [])
    .filter((t) => (t.message ?? '').trim())
    .map((t) => ({ role: t.role === 'agent' ? ('assistant' as const) : ('caller' as const), text: (t.message ?? '').trim() }));
}
