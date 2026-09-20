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

export type ReceptionistVersion = 'answering-machine' | 'agent' | 'elevenlabs';

/**
 * What a TEST call can run.
 *
 * The three live versions, plus `intake` — the voicemail interview, which is deliberately NOT a
 * `ReceptionistVersion`. It has no TwiML and no phone route yet, so it cannot be put in front of a
 * real caller, and keeping it out of that type is what makes that impossible rather than merely
 * discouraged: `parseVersion` (which the live switch uses) cannot return it.
 */
export type TestVersion = ReceptionistVersion | 'intake';

export const RECEPTIONIST_SETTINGS_KEY = 'receptionist';
export const DEFAULT_LIVE_VERSION: ReceptionistVersion = 'answering-machine';

export const VERSION_LABELS: Record<ReceptionistVersion, { name: string; blurb: string }> = {
  'answering-machine': {
    name: 'Answering machine',
    blurb: 'Asks for a message with a name and number, records it, asks if there is anything else, and says goodbye. Fixed words, no AI replies.',
  },
  elevenlabs: {
    name: 'Conversational agent (ElevenLabs)',
    blurb: 'Ellie on ElevenLabs Agents with Riley’s voice: holds a real conversation, takes a message for Hank, never gives a price, and never assumes it has met the caller before.',
  },
  agent: {
    name: 'Conversational agent on our own relay',
    blurb: 'The same receptionist run through our relay instead of ElevenLabs. The fallback if ElevenLabs is unavailable; the voice is less natural.',
  },
};

export const TEST_VERSION_LABELS: Record<TestVersion, { name: string; blurb: string }> = {
  ...VERSION_LABELS,
  intake: {
    name: 'Voicemail intake interview',
    blurb: 'Greets, lets the caller say their piece, reads what it can out of it, then asks only about what is still missing — and stops at seven minutes. Bench only: it has no phone route, so it cannot answer a real call.',
  },
};

/** A stored or requested version, or null when it is not one. Accepts a few spellings. */
export function parseVersion(value: unknown): ReceptionistVersion | null {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (v === 'answering-machine' || v === 'machine' || v === 'answering_machine' || v === 'voicemail') return 'answering-machine';
  if (v === 'agent' || v === 'ai' || v === 'full') return 'agent';
  if (v === 'elevenlabs' || v === 'eleven' || v === '11labs') return 'elevenlabs';
  return null;
}

/**
 * A version a TEST call may run.
 *
 * Its own function because the two lists diverged again on 2026-09-21: a test call may run the
 * intake interview, and a live call may not. `parseVersion` is what the live switch uses, and it
 * cannot return `intake` — so there is no string anybody can PUT to the live endpoint that puts an
 * unfinished agent in front of a customer.
 */
export function parseTestVersion(value: unknown): TestVersion | null {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (v === 'intake' || v === 'voicemail-intake') return 'intake';
  return parseVersion(value);
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
