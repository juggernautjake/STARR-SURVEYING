// lib/receptionist/agent-models.ts — which speech model the agent talks with.
//
// Owner, 2026-09-21: "make it where we can switch between eleven_v3_conversational and
// eleven_flash_v2_5."
//
// ── WHY THIS IS A SWITCH AND NOT A DECISION SOMEBODY MAKES ONCE ─────────────────────────────────
//
// Across six test calls the audio dropped mid-sentence three times, always on a long agent turn.
// The most likely cause is generation latency: v3 conversational is the expressive model at roughly
// 280ms, flash is the one ElevenLabs positions for the agents platform at roughly 75ms.
//
// "Likely" is the honest word. It is not provable from a transcript, and the only way to settle it
// is to hear both on a real call. That is an argument for a switch rather than for me picking one:
// the owner can put flash on the line for a morning, and if the gaps stop, the question is answered
// by the phone rather than by me.
//
// ── THE TRADE IS AUDIBLE, SO IT IS SPELT OUT ────────────────────────────────────────────────────
//
// Flash is not "the same but faster". The expressive tags in the prompt — the [warm] and [patient]
// you can hear working in the transcripts — are v3 features. On flash the delivery is flatter. That
// is a real loss and the picker says so, because a switch whose cost is hidden gets flipped once and
// then blamed for something else a week later.

export interface AgentModel {
  /** What `conversation_config.tts.model_id` is set to. */
  id: string;
  name: string;
  /** Round-trip figure ElevenLabs publishes, for the picker. */
  latency: string;
  /** What it is good at. */
  blurb: string;
  /** What you give up. Never empty — every choice here costs something. */
  tradeoff: string;
}

export const AGENT_MODELS: readonly AgentModel[] = [
  {
    id: 'eleven_v3_conversational',
    name: 'Expressive',
    latency: '~280 ms',
    blurb: 'The warm one. Reads the delivery tags in the prompt, so it can sound apologetic, patient or friendly where the script asks for it.',
    tradeoff: 'Nearly four times the generation latency of Fast, and the likeliest suspect for audio dropping out in the middle of a long sentence.',
  },
  {
    id: 'eleven_flash_v2_5',
    name: 'Fast',
    latency: '~75 ms',
    blurb: "ElevenLabs' low-latency model, the one they position for the agents platform. Far less to buffer, so far less to drop.",
    tradeoff: 'Flatter. The delivery tags do nothing, so the agent reads warmly-written lines in a level voice.',
  },
];

export const DEFAULT_AGENT_MODEL = 'eleven_v3_conversational';

export function agentModelById(id: string | null | undefined): AgentModel | null {
  const want = (id ?? '').trim();
  return AGENT_MODELS.find((m) => m.id === want) ?? null;
}

/**
 * A model id we are willing to set, or null.
 *
 * An allowlist rather than a pass-through: `tts.model_id` accepts anything, and a typo would be
 * PATCHed onto the live agent and only discovered when somebody rang and heard nothing.
 */
export function parseAgentModel(value: unknown): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  return agentModelById(v)?.id ?? null;
}
