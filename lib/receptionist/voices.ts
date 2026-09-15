// lib/receptionist/voices.ts — the voices the receptionist can speak with (owner, 2026-09-15).
//
// "I want more natural female voice options … so that it is difficult to tell if it is human or not."
//
// One catalogue, used by both paths, because the two speak through different machinery:
//
//   relayVoice   ConversationRelay (the live agent): the `voice` attribute of <ConversationRelay>,
//                whose format depends on the provider. ElevenLabs takes
//                `<voiceId>-<model>-<speed>_<stability>_<similarity>`; Google and Amazon take a name.
//   sayVoice     <Say> (the answering machine and the <Gather> fallback): a Twilio voice name.
//
// ElevenLabs voices need ELEVENLABS through Twilio's ConversationRelay (the live agent path); on the
// <Say> path Twilio offers Google's Chirp 3 HD and Amazon's generative Pollys, so an ElevenLabs
// choice falls back to the closest Google voice there. `sayVoice` is what makes that explicit rather
// than silently speaking in the default voice.
//
// This file imports nothing so the test bench can render the list.

export type VoiceProvider = 'ElevenLabs' | 'Google' | 'Amazon';

export interface ReceptionistVoice {
  id: string;
  name: string;
  provider: VoiceProvider;
  /** One line a person can choose by, not marketing. */
  blurb: string;
  /** The <ConversationRelay voice="…"> value (the live agent). */
  relayVoice: string;
  /** The <Say voice="…"> value (the answering machine and the Gather fallback). */
  sayVoice: string;
  /** Where to hear it before calling. */
  sample?: string;
}

// ElevenLabs Flash v2.5 is the low-latency model ConversationRelay streams; the trailing numbers are
// speed_stability_similarity (speed 0.7–1.2). 0.9 is the pace the owner asked for on 2026-09-11.
const el = (id: string, voiceId: string, name: string, blurb: string, say: string, speed = '0.9', stability = '0.6'): ReceptionistVoice => ({
  id, name, provider: 'ElevenLabs', blurb,
  relayVoice: `${voiceId}-flash_v2_5-${speed}_${stability}_0.8`,
  sayVoice: say,
  sample: `https://elevenlabs.io/app/voice-library?voiceId=${voiceId}`,
});

export const RECEPTIONIST_VOICES: readonly ReceptionistVoice[] = [
  el('rachel', '21m00Tcm4TlvDq8ikWAM', 'Rachel (ElevenLabs)', 'Calm, even, narrator pace. The current live voice.', 'Google.en-US-Chirp3-HD-Aoede'),
  el('sarah', 'EXAVITQu4vr4xnSDxMaL', 'Sarah (ElevenLabs)', 'Warm and young; the friendliest of the set.', 'Google.en-US-Chirp3-HD-Leda'),
  el('jessica', 'cgSgspJ2msm6clMCkdW9', 'Jessica (ElevenLabs)', 'Bright, conversational, a little quicker.', 'Google.en-US-Chirp3-HD-Zephyr', '0.95'),
  el('lily', 'pFZP5JQG7iQjIQuC4Bku', 'Lily (ElevenLabs)', 'Soft and measured; good on numbers and addresses.', 'Google.en-US-Chirp3-HD-Kore'),
  el('alice', 'Xb7hH8MSUJpSbSDYk0k2', 'Alice (ElevenLabs)', 'Confident and clear, a touch more formal.', 'Google.en-US-Chirp3-HD-Aoede'),
  el('matilda', 'XrExE9yKIg1WjnnlVkGX', 'Matilda (ElevenLabs)', 'Easy, unhurried, a friendly office voice.', 'Google.en-US-Chirp3-HD-Leda'),
  {
    id: 'aoede', name: 'Aoede (Google Chirp 3 HD)', provider: 'Google',
    blurb: 'Google generative voice. Natural pauses; no ElevenLabs bill.',
    relayVoice: 'en-US-Chirp3-HD-Aoede', sayVoice: 'Google.en-US-Chirp3-HD-Aoede',
    sample: 'https://cloud.google.com/text-to-speech/docs/chirp3-hd',
  },
  {
    id: 'leda', name: 'Leda (Google Chirp 3 HD)', provider: 'Google',
    blurb: 'Younger and lighter than Aoede.',
    relayVoice: 'en-US-Chirp3-HD-Leda', sayVoice: 'Google.en-US-Chirp3-HD-Leda',
    sample: 'https://cloud.google.com/text-to-speech/docs/chirp3-hd',
  },
  {
    id: 'kore', name: 'Kore (Google Chirp 3 HD)', provider: 'Google',
    blurb: 'Steady and even; the most neutral of the Google set.',
    relayVoice: 'en-US-Chirp3-HD-Kore', sayVoice: 'Google.en-US-Chirp3-HD-Kore',
    sample: 'https://cloud.google.com/text-to-speech/docs/chirp3-hd',
  },
  {
    id: 'ruth', name: 'Ruth (Amazon Polly generative)', provider: 'Amazon',
    blurb: 'Amazon\'s generative American voice; relaxed and natural.',
    relayVoice: 'Ruth-Generative', sayVoice: 'Polly.Ruth-Generative',
    sample: 'https://docs.aws.amazon.com/polly/latest/dg/generative-voices.html',
  },
  {
    id: 'danielle', name: 'Danielle (Amazon Polly generative)', provider: 'Amazon',
    blurb: 'Slightly brighter than Ruth, same engine.',
    relayVoice: 'Danielle-Generative', sayVoice: 'Polly.Danielle-Generative',
    sample: 'https://docs.aws.amazon.com/polly/latest/dg/generative-voices.html',
  },
];

export const DEFAULT_VOICE_ID = 'rachel';

export function voiceById(id: string | null | undefined): ReceptionistVoice | null {
  const want = (id ?? '').trim().toLowerCase();
  return RECEPTIONIST_VOICES.find((v) => v.id === want) ?? null;
}

/** The voice to speak with: the chosen one, else the default. Never null, so no caller has to decide. */
export function resolveVoice(id: string | null | undefined): ReceptionistVoice {
  return voiceById(id) ?? voiceById(DEFAULT_VOICE_ID) ?? RECEPTIONIST_VOICES[0];
}

/** The <Say voice="…"> for a chosen voice; `RECEPTIONIST_VOICE` still overrides everything. */
export function sayVoiceFor(id: string | null | undefined, env: Record<string, string | undefined> = process.env): string {
  const override = (env.RECEPTIONIST_VOICE ?? '').trim();
  if (override && !id) return override;
  return resolveVoice(id).sayVoice;
}
