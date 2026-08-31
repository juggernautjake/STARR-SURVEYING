// __tests__/research/static-map-status.test.ts
//
// Every body string below is VERBATIM from Google, captured against the live key on 2026-08-30.
// That matters more than it sounds: the whole point of this module is that three different problems
// arrive as HTTP 403, and a test written from imagination would pin phrasing Google never uses.

import { describe, it, expect } from 'vitest';
import {
  classifyStaticMapFailure,
  NO_MAPS_KEY_MESSAGE,
} from '@/lib/maps/static-map-status';

// Captured responses, unedited.
const NOT_ACTIVATED =
  'The Google Maps Platform server rejected your request. This API is not activated on your API '
  + 'project. You may need to enable this API in the Google Cloud Console: '
  + 'https://console.cloud.google.com/apis/library?filter=category:maps.';

const NOT_AUTHORIZED =
  'The Google Maps Platform server rejected your request. This API key is not authorized to use '
  + 'this service or API.';

const REFERER_RESTRICTED = '{ "error_message" : "API keys with referer restrictions cannot be used with this API." }';

describe('the three 403s that mean different things', () => {
  it('tells "nobody enabled it" from "the key is not allowed to use it"', () => {
    // These two arrived hours apart from the SAME key and the same URL, as APIs were switched on.
    // Identical status code; different person to talk to. If this test ever collapses them, the
    // operator gets sent to the wrong Cloud Console screen.
    expect(classifyStaticMapFailure(403, NOT_ACTIVATED).kind).toBe('not-enabled');
    expect(classifyStaticMapFailure(403, NOT_AUTHORIZED).kind).toBe('key-not-authorized');
  });

  it('recognises a browser key used server-side, and says enabling more will not help', () => {
    const r = classifyStaticMapFailure(403, REFERER_RESTRICTED);
    expect(r.kind).toBe('referer-restricted-key');
    expect(r.needsAction).toBe(true);
    // The actionable half: name the variable, and kill the obvious wrong fix.
    expect(r.message).toContain('GOOGLE_MAPS_API_KEY');
    expect(r.message).toContain('will not fix this');
  });

  it('checks the referer case BEFORE the general "not authorized" match', () => {
    // Order dependence, pinned. The referer body is also a 403 about keys; if the looser match ran
    // first it would classify as key-not-authorized and send somebody to the API-restrictions list
    // for a problem no restriction list can solve.
    const bothPhrases = 'API keys with referer restrictions cannot be used with this API. Not authorized.';
    expect(classifyStaticMapFailure(403, bothPhrases).kind).toBe('referer-restricted-key');
  });
});

describe('the rest of the failure space', () => {
  it('names a billing problem as a billing problem', () => {
    expect(classifyStaticMapFailure(403, 'You must enable Billing on the Google Cloud Project').kind)
      .toBe('billing');
  });

  it('separates temporary from permanent', () => {
    // A quota failure is the only one worth retrying, so it is the only one flagged as not needing
    // a person.
    expect(classifyStaticMapFailure(429, '').needsAction).toBe(false);
    expect(classifyStaticMapFailure(429, '').kind).toBe('quota');
    expect(classifyStaticMapFailure(403, NOT_ACTIVATED).needsAction).toBe(true);
  });

  it('does not invent a diagnosis for an unnamed failure', () => {
    // The failure mode this module exists to prevent is confident wrongness. An unrecognised body
    // must report itself as unrecognised and carry the evidence.
    const r = classifyStaticMapFailure(500, 'upstream exploded');
    expect(r.kind).toBe('broken');
    expect(r.message).toContain('500');
    expect(r.message).toContain('upstream exploded');
  });

  it('survives an empty or missing body without claiming to know why', () => {
    for (const body of ['', null, undefined]) {
      const r = classifyStaticMapFailure(502, body);
      expect(r.kind).toBe('broken');
      expect(r.message).toContain('502');
    }
    expect(classifyStaticMapFailure(502, '').message).toContain('empty body');
  });
});

describe('the no-key message', () => {
  it('explains why the public key is not a substitute', () => {
    // The trap it guards: `GOOGLE_MAPS_API_KEY || NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` reads as a
    // sensible fallback and silently supplies a key that cannot authenticate a server request.
    expect(NO_MAPS_KEY_MESSAGE).toContain('GOOGLE_MAPS_API_KEY');
    expect(NO_MAPS_KEY_MESSAGE).toContain('referer-restricted');
  });
});
