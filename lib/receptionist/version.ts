// lib/receptionist/version.ts — which receptionist answers the business line (owner, 2026-09-15).
//
// "Make it so that for now the system uses the simple answering machine style AI that just records
//  the caller's message and bids them a good day. In the meantime, I want to be able to work on and
//  test the other version privately until I am able to get it fully functional."
//
//   answering-machine   the fixed-script message taker (./answering-machine.ts) — LIVE CALLS, by default
//   agent               the full conversational receptionist (./brain.ts, relay or <Gather>) — work in progress
//
// Live calls use the version stored in `app_settings` under `receptionist` (switched on the test
// bench, /admin/dev/receptionist). ABSENT, UNREADABLE OR UNKNOWN MEANS THE ANSWERING MACHINE: the safe
// version is the one a broken setting falls back to, never the one that "says weird things". Test calls
// choose their version per call, whatever live calls are using.
//
// This file imports nothing, so the test page can use the labels.

export type ReceptionistVersion = 'answering-machine' | 'agent';

export const RECEPTIONIST_SETTINGS_KEY = 'receptionist';
export const DEFAULT_LIVE_VERSION: ReceptionistVersion = 'answering-machine';

export const VERSION_LABELS: Record<ReceptionistVersion, { name: string; blurb: string }> = {
  'answering-machine': {
    name: 'Answering machine',
    blurb: 'Asks for a message with a name and number, records it, asks if there is anything else, and says goodbye. Fixed words, no AI replies.',
  },
  agent: {
    name: 'Full AI agent (work in progress)',
    blurb: 'Ellie: holds a conversation, takes down details, answers survey and land-law questions, quotes through the calculator.',
  },
};

/** A stored or requested version, or null when it is not one. Accepts a few spellings. */
export function parseVersion(value: unknown): ReceptionistVersion | null {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (v === 'answering-machine' || v === 'machine' || v === 'answering_machine' || v === 'voicemail') return 'answering-machine';
  if (v === 'agent' || v === 'ai' || v === 'full') return 'agent';
  return null;
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
