// lib/receptionist/version.ts — which receptionist answers the business line (owner, 2026-09-15).
//
// "Make it so that for now the system uses the simple answering machine style AI that just records
//  the caller's message and bids them a good day. In the meantime, I want to be able to work on and
//  test the other version privately until I am able to get it fully functional."
//
//   answering-machine   the fixed-script message taker (./answering-machine.ts) — the safe default
//   elevenlabs          the conversational receptionist on ElevenLabs Agents — LIVE since 2026-09-16
//   agent               the same script on our own relay / <Gather> loop (./brain.ts) — the fallback
//
// Owner, 2026-09-16, after the agent was rewritten and tested: "Let's please make the conversational
// agent the active live version for calls for now so we can test it in the real world." The live
// switch used to refuse `elevenlabs` on purpose; it accepts it now, and a deployment where the SIP
// trunk is not configured still answers with the machine rather than dropping the call.
//
// Live calls use the version stored in `app_settings` under `receptionist` (switched on the test
// bench, /admin/dev/receptionist). ABSENT, UNREADABLE OR UNKNOWN MEANS THE ANSWERING MACHINE: the safe
// version is the one a broken setting falls back to, never the one that "says weird things". Test calls
// choose their version per call, whatever live calls are using.
//
// This file imports nothing, so the test page can use the labels.

// ── TWO CHOICES, NOT THREE (owner, 2026-09-21) ──────────────────────────────────────────────────
//
// "We need to be able to set the call receptionist to be just a voicemail prompt message... or we
//  need it to be a full conversational interaction... These should be the only two options. We need
//  to be able to set the voicemail message version to the backup if the conversational version
//  fails for some reason."
//
// There were three, and the third was a transport rather than a decision: `agent` is the same
// receptionist run through our own relay instead of ElevenLabs. Offering it as a peer of the other
// two asked the operator to pick a pipe, and the test bench showed all three at once with one of
// them labelled LIVE NOW and another labelled the fallback — which is the confusion this removes.
//
// The fallback is now what the owner asked for and what it always should have been: if the
// conversational agent cannot answer, the caller gets the voicemail message. That is the version
// that cannot misbehave, and a caller who is asked to leave a message has still reached the firm.
//
// `agent` remains in the union ONLY so a stored value from before this change still parses. Nothing
// offers it, and `liveVersionFrom` reads it as conversational — it was always the conversational
// receptionist, just over a different wire.
export type ReceptionistVersion = 'answering-machine' | 'agent' | 'elevenlabs';

/** The two a person may actually choose, for live calls and for a test call alike. */
export const CHOOSABLE_VERSIONS = ['elevenlabs', 'answering-machine'] as const;
export type ChoosableVersion = (typeof CHOOSABLE_VERSIONS)[number];

/** What a TEST call can run — the same two, chosen per call whatever live calls are using. */
export type TestVersion = ChoosableVersion;

/** A stored value as one of the two choices. The retired relay reads as conversational. */
export function choosable(v: ReceptionistVersion): ChoosableVersion {
  return v === 'answering-machine' ? 'answering-machine' : 'elevenlabs';
}

export const RECEPTIONIST_SETTINGS_KEY = 'receptionist';
export const DEFAULT_LIVE_VERSION: ReceptionistVersion = 'answering-machine';

export const VERSION_LABELS: Record<ReceptionistVersion, { name: string; blurb: string }> = {
  'answering-machine': {
    name: 'Answering machine',
    blurb: 'Asks for a message with a name and number, records it, asks if there is anything else, and says goodbye. Fixed words, no AI replies.',
  },
  elevenlabs: {
    name: 'Conversational receptionist',
    blurb: 'Ellie holds a real conversation: takes the caller’s name, number and what they need, never gives a price, and never assumes it has met them before. If she cannot answer for any reason, the caller gets the voicemail message instead.',
  },
  // Retired as a choice on 2026-09-21; kept so an older stored value still renders if it surfaces.
  agent: {
    name: 'Conversational receptionist',
    blurb: 'The conversational receptionist.',
  },
};

/** The two, in the order they are offered: the one we want, then the safe one. */
export const TEST_VERSION_LABELS: Record<TestVersion, { name: string; blurb: string }> = {
  elevenlabs: VERSION_LABELS.elevenlabs,
  'answering-machine': VERSION_LABELS['answering-machine'],
};

/** A stored or requested version, or null when it is not one. Accepts a few spellings. */
export function parseVersion(value: unknown): ReceptionistVersion | null {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (v === 'answering-machine' || v === 'machine' || v === 'answering_machine' || v === 'voicemail') return 'answering-machine';
  // 'agent' was the relay. Retired as a choice; anything asking for it means the conversational one.
  if (v === 'agent' || v === 'ai' || v === 'full' || v === 'conversational') return 'elevenlabs';
  if (v === 'elevenlabs' || v === 'eleven' || v === '11labs') return 'elevenlabs';
  return null;
}

/** Kept as its own name because the two lists were different until 2026-09-16, and the call sites
 *  read better for saying which decision they are making. */
export function parseTestVersion(value: unknown): TestVersion | null {
  const v = parseVersion(value);
  // A test call runs one of the two a person can choose, so the retired relay collapses here too.
  return v === null ? null : choosable(v);
}

/** The live version from the stored settings object — the answering machine unless it clearly says agent. */
export function liveVersionFrom(stored: unknown): ReceptionistVersion {
  const obj = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  return parseVersion(obj.live_version) ?? DEFAULT_LIVE_VERSION;
}

/** The voice live calls are spoken in (an id from lib/receptionist/voices.ts), or null for the default. */
export function liveVoiceFrom(stored: unknown): string | null {
  const obj = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const v = typeof obj.voice === 'string' ? obj.voice.trim() : '';
  return v || null;
}
