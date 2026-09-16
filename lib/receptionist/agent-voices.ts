// lib/receptionist/agent-voices.ts — the voices the ElevenLabs agents can speak with (owner, 2026-09-16).
//
// "I want it so that we can switch voices, and so that there is a sampling for each voice so I can
//  just test the sample and listen to it. If I want to hear it on a call, I can just switch to it."
//
// A shortlist, not the whole library: every one of these is in the firm's ElevenLabs account and is
// worth hearing on a phone line. The order is the order they are offered — Riley first, because the
// owner listened to all of them and picked her (2026-09-16: "I like Riley's voice the best. Let's
// work with that for now"); the rest are there so he can hear the difference rather than take the
// shortlist on trust.
//
// The sample each one speaks is the receptionist's real first line (../receptionist/agent-prompt.ts),
// so what you audition is what a caller hears, not a stock sentence about the weather.

export interface AgentVoice {
  /** The ElevenLabs voice id — what an agent's `tts.voice_id` is set to. */
  id: string;
  name: string;
  /** One line to choose by. */
  blurb: string;
  /** Who it reads as, for grouping in the picker. */
  group: 'Women, American' | 'Women, British' | 'Other voices';
  /** Worth trying first for this business. */
  recommended?: boolean;
}

export const AGENT_VOICES: readonly AgentVoice[] = [
  { id: 'hA4zGnmTwX2NQiTRMt7o', name: 'Riley', blurb: "Younger and engaging. Friendly, slightly informal — the owner's pick, and what the agent speaks with today.", group: 'Women, American', recommended: true },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', blurb: 'Mature, reassuring, confident. What the agent used before Riley.', group: 'Women, American', recommended: true },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', blurb: 'Bright and warm, a little quicker. Sounds like a friendly front desk.', group: 'Women, American', recommended: true },
  { id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella', blurb: 'Professional, bright, warm — the most "office manager" of the set.', group: 'Women, American', recommended: true },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', blurb: 'Knowledgeable and professional; unhurried on numbers and addresses.', group: 'Women, American', recommended: true },
  { id: 'K7W7zLWeGoxU9YqWoB7A', name: 'Rachel', blurb: 'Even and neutral narrator pace. Safe, a touch impersonal.', group: 'Women, American' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', blurb: 'Enthusiastic with some attitude. Lively, less formal.', group: 'Women, American' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', blurb: 'Clear and engaging — British accent.', group: 'Women, British' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', blurb: 'Soft and velvety — British accent.', group: 'Women, British' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', blurb: 'Smooth and trustworthy. A man on the desk, if you ever want that.', group: 'Other voices' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', blurb: 'Charming and down to earth; the least formal of the men.', group: 'Other voices' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', blurb: 'Relaxed and neutral, neither clearly male nor female.', group: 'Other voices' },
];

export function agentVoiceById(id: string | null | undefined): AgentVoice | null {
  const want = (id ?? '').trim();
  return AGENT_VOICES.find((v) => v.id === want) ?? null;
}

export const AGENT_VOICE_GROUPS: ReadonlyArray<AgentVoice['group']> = ['Women, American', 'Women, British', 'Other voices'];
