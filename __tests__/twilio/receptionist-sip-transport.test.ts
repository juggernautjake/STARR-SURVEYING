/**
 * The missing parameter that silenced the receptionist for five days.
 *
 * ElevenLabs' trunk listens on TCP (5060) and TLS (5061), never UDP. Twilio defaults a `sip:` URI
 * with no `transport` to UDP, so every INVITE went to a port with nothing behind it: no SIP response,
 * therefore no Twilio error code and no ElevenLabs conversation — just a one-second failure, the
 * answering machine taking over exactly as designed, and five real customers leaving voicemails.
 *
 * Proven live on 2026-09-21 by dialling the trunk straight from Twilio:
 *   without the parameter — failed, 0s
 *   with    the parameter — completed, 12s, and ElevenLabs logged its first `sip_trunk` conversation
 */

import { describe, it, expect } from 'vitest';
import { elevenLabsSipUri, elevenLabsConfigured } from '@/lib/receptionist/elevenlabs';

const BARE = 'sip:+18338426971@sip.rtc.elevenlabs.io:5060';

describe('elevenLabsSipUri', () => {
  it('adds the transport a bare sip: URI is missing', () => {
    // This exact string is what scripts/elevenlabs-agent.mjs used to print, and what was in Vercel.
    expect(elevenLabsSipUri({ ELEVENLABS_SIP_URI: BARE }))
      .toBe(`${BARE};transport=tcp`);
  });

  it('leaves a URI that states its own transport alone', () => {
    for (const u of [
      `${BARE};transport=tcp`,
      'sip:+18338426971@sip.rtc.elevenlabs.io:5061;transport=tls',
    ]) {
      expect(elevenLabsSipUri({ ELEVENLABS_SIP_URI: u })).toBe(u);
    }
  });

  it('leaves a sips: URI alone, because that scheme already means TLS', () => {
    const u = 'sips:+18338426971@sip.rtc.elevenlabs.io:5061';
    expect(elevenLabsSipUri({ ELEVENLABS_SIP_URI: u })).toBe(u);
  });

  it('still rejects what is not a SIP URI at all', () => {
    for (const bad of ['', '   ', 'https://example.com', 'sip:nohost', '+18338426971']) {
      expect(elevenLabsSipUri({ ELEVENLABS_SIP_URI: bad }), bad).toBeNull();
    }
  });

  it('never reports configured when the variable is absent', () => {
    expect(elevenLabsConfigured({})).toBe(false);
    // ...and DOES report configured for the bare form, which is reachable once normalised.
    expect(elevenLabsConfigured({ ELEVENLABS_SIP_URI: BARE })).toBe(true);
  });
});
