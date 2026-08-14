// __tests__/phone/signature.test.ts — slice P0b of
// docs/planning/completed/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// The webhook signature is the only thing standing between a public URL and an attacker who can
// make the firm's Twilio account place calls. Two failure directions, and they are not symmetric:
// rejecting a real Twilio request takes the phone line down loudly, while accepting a forged one
// does nothing visible at all.

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  buildSignatureBase, signTwilioRequest, validateTwilioSignature,
  candidateWebhookUrls, paramsFromFormBody,
} from '@/lib/phone/signature';

// Twilio's own documented worked example. Pinning it means a "harmless" refactor of the
// concatenation cannot pass the suite by agreeing with itself — every other test here signs with
// the same helper it verifies with, and would happily validate a scheme Twilio has never used.
const DOC_TOKEN = '12345';
const DOC_URL = 'https://mycompany.com/myapp.php?foo=1&bar=2';
const DOC_PARAMS = {
  CallSid: 'CA1234567890ABCDE',
  Caller: '+14158675309',
  Digits: '1234',
  From: '+14158675309',
  To: '+18005551212',
};
const DOC_SIGNATURE = 'RSOYDt4T1cUTdK1PDd93/VVr8B8=';

describe('the string Twilio signs', () => {
  it('matches the documented example byte for byte', () => {
    expect(buildSignatureBase(DOC_URL, DOC_PARAMS)).toBe(
      DOC_URL +
        'CallSidCA1234567890ABCDE' +
        'Caller+14158675309' +
        'Digits1234' +
        'From+14158675309' +
        'To+18005551212',
    );
  });

  it('produces the documented signature', () => {
    expect(signTwilioRequest(DOC_TOKEN, DOC_URL, DOC_PARAMS)).toBe(DOC_SIGNATURE);
  });

  it('sorts by key rather than trusting insertion order', () => {
    // Object key order is whatever the form parser produced. Twilio sorts, so we must too — and a
    // mismatch here fails only for requests whose fields happen to arrive out of order, i.e.
    // intermittently.
    const forward = { Alpha: '1', Beta: '2', Gamma: '3' };
    const backward = { Gamma: '3', Beta: '2', Alpha: '1' };
    expect(buildSignatureBase('u', backward)).toBe(buildSignatureBase('u', forward));
  });

  it('concatenates with no separator between pairs', () => {
    expect(buildSignatureBase('u', { A: '1', B: '2' })).toBe('uA1B2');
  });

  it('distinguishes a value boundary that a separator-less join could blur', () => {
    // {AB: 'c'} and {A: 'Bc'} both concatenate to 'ABc'. Twilio has this ambiguity too, so the
    // point is not to fix it — it is that the sorted-key order stays stable so we always agree
    // with Twilio about which reading produced the signature.
    expect(buildSignatureBase('u', { AB: 'c' })).toBe(buildSignatureBase('u', { A: 'Bc' }));
  });

  it('signs an empty parameter set as just the URL', () => {
    expect(buildSignatureBase(DOC_URL, {})).toBe(DOC_URL);
  });
});

describe('validating an incoming signature', () => {
  const params = { From: '+15125551234', To: '+19366620077', CallSid: 'CA1' };
  const url = 'https://starr.example/api/twilio/voice';
  const token = 'a-real-looking-token';
  const good = signTwilioRequest(token, url, params);

  it('accepts a genuine signature', () => {
    const r = validateTwilioSignature({ authToken: token, signature: good, candidateUrls: [url], params });
    expect(r.valid).toBe(true);
    expect(r.matchedUrl).toBe(url);
  });

  it('rejects a forged one', () => {
    const r = validateTwilioSignature({
      authToken: token, signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAA=', candidateUrls: [url], params,
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('signature_mismatch');
  });

  it('rejects a signature for the same params under a different token', () => {
    const other = signTwilioRequest('someone-elses-token', url, params);
    expect(validateTwilioSignature({ authToken: token, signature: other, candidateUrls: [url], params }).valid).toBe(false);
  });

  it('rejects when a single parameter is altered', () => {
    // The attack this stops: replaying a real call's signature with `To` swapped for a number the
    // attacker wants dialled.
    const tampered = { ...params, To: '+19005551212' };
    expect(validateTwilioSignature({ authToken: token, signature: good, candidateUrls: [url], params: tampered }).valid).toBe(false);
  });

  it('rejects when a parameter is added', () => {
    expect(validateTwilioSignature({
      authToken: token, signature: good, candidateUrls: [url], params: { ...params, Extra: 'x' },
    }).valid).toBe(false);
  });

  it('rejects when a parameter is removed', () => {
    expect(validateTwilioSignature({
      authToken: token, signature: good, candidateUrls: [url], params: { From: params.From, To: params.To },
    }).valid).toBe(false);
  });

  it('rejects the same signature at a different path', () => {
    expect(validateTwilioSignature({
      authToken: token, signature: good, candidateUrls: ['https://starr.example/api/twilio/callback'], params,
    }).valid).toBe(false);
  });

  it('REFUSES rather than passes when no auth token is configured', () => {
    // The failure that matters. A deployment missing its token must not accept everything, and
    // must not accept nothing-in-particular either — it must refuse and say why.
    const r = validateTwilioSignature({ authToken: null, signature: good, candidateUrls: [url], params });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('no_auth_token');
  });

  it('refuses a request carrying no signature header at all', () => {
    const r = validateTwilioSignature({ authToken: token, signature: null, candidateUrls: [url], params });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('no_signature');
  });

  it('refuses when there is no URL to check against', () => {
    expect(validateTwilioSignature({ authToken: token, signature: good, candidateUrls: [], params }).reason)
      .toBe('no_candidate_url');
  });

  it('does not throw on a signature of the wrong length', () => {
    // `crypto.timingSafeEqual` throws when the buffers differ in length, which inside a webhook is
    // a 500 rather than a rejection — and a 500 makes Twilio retry the forged request.
    for (const junk of ['', 'x', 'A'.repeat(500), '!!!not base64!!!']) {
      expect(() => validateTwilioSignature({ authToken: token, signature: junk, candidateUrls: [url], params }))
        .not.toThrow();
    }
  });

  it('accepts a match on any candidate URL', () => {
    const alt = 'https://www.starr.example/api/twilio/voice';
    const sigForAlt = signTwilioRequest(token, alt, params);
    const r = validateTwilioSignature({ authToken: token, signature: sigForAlt, candidateUrls: [url, alt], params });
    expect(r.valid).toBe(true);
    expect(r.matchedUrl).toBe(alt);
  });
});

describe('reconstructing the URL Twilio signed', () => {
  it('prefers the explicitly configured public base', () => {
    // The one that fixes production. Vercel hands the route an internal host; Twilio signed the
    // custom domain.
    const urls = candidateWebhookUrls({
      requestUrl: 'http://internal-deploy.vercel.app/api/twilio/voice?x=1',
      forwardedProto: 'https',
      forwardedHost: 'starr-surveying.vercel.app',
      publicBaseUrl: 'https://starrsurveying.com',
    });
    expect(urls[0]).toBe('https://starrsurveying.com/api/twilio/voice?x=1');
  });

  it('keeps the query string, which is part of the signed URL', () => {
    const urls = candidateWebhookUrls({
      requestUrl: 'http://h/api/twilio/voice?token=abc&retry=2',
      publicBaseUrl: 'https://starrsurveying.com',
    });
    expect(urls[0]).toContain('?token=abc&retry=2');
  });

  it('does not double the slash when the base has a trailing one', () => {
    const urls = candidateWebhookUrls({
      requestUrl: 'http://h/api/twilio/voice',
      publicBaseUrl: 'https://starrsurveying.com/',
    });
    expect(urls[0]).toBe('https://starrsurveying.com/api/twilio/voice');
  });

  it('falls back to the forwarded host when no base is configured', () => {
    const urls = candidateWebhookUrls({
      requestUrl: 'http://internal/api/twilio/voice',
      forwardedProto: 'https',
      forwardedHost: 'starrsurveying.com',
    });
    expect(urls).toContain('https://starrsurveying.com/api/twilio/voice');
  });

  it('takes the first entry of a forwarded-host chain', () => {
    // Behind two proxies the header is a list; the client-facing host is the first.
    const urls = candidateWebhookUrls({
      requestUrl: 'http://internal/api/twilio/voice',
      forwardedProto: 'https,http',
      forwardedHost: 'starrsurveying.com, internal.vercel.app',
    });
    expect(urls).toContain('https://starrsurveying.com/api/twilio/voice');
  });

  it('assumes https rather than http when the proto header is missing', () => {
    // Twilio will not call an http webhook for a production number, so http is the wrong guess.
    const urls = candidateWebhookUrls({ requestUrl: 'http://internal/api/twilio/voice', forwardedHost: 'starrsurveying.com' });
    expect(urls).toContain('https://starrsurveying.com/api/twilio/voice');
  });

  it('always includes the raw request URL as a last resort', () => {
    const raw = 'https://exact.example/api/twilio/voice';
    expect(candidateWebhookUrls({ requestUrl: raw })).toContain(raw);
  });

  it('never returns the same URL twice', () => {
    const urls = candidateWebhookUrls({
      requestUrl: 'https://starrsurveying.com/api/twilio/voice',
      forwardedProto: 'https',
      forwardedHost: 'starrsurveying.com',
      publicBaseUrl: 'https://starrsurveying.com',
    });
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('does not throw on an unparseable request URL', () => {
    expect(() => candidateWebhookUrls({ requestUrl: 'not a url' })).not.toThrow();
  });
});

describe('reading the form body', () => {
  it('decodes the encoding Twilio posts in', () => {
    const params = paramsFromFormBody('From=%2B15125551234&To=%2B19366620077&CallStatus=ringing');
    expect(params.From).toBe('+15125551234');
    expect(params.CallStatus).toBe('ringing');
  });

  it('decodes + as a space in a transcription, but not in a phone number', () => {
    // `+` means space in form encoding; a real plus is `%2B`. Getting this backwards corrupts every
    // caller ID into a leading space and every signature check with it.
    const params = paramsFromFormBody('Body=call+me+back&From=%2B15125551234');
    expect(params.Body).toBe('call me back');
    expect(params.From).toBe('+15125551234');
  });

  it('survives an empty body', () => {
    expect(paramsFromFormBody('')).toEqual({});
  });
});

describe('the signature is a real HMAC-SHA1, not a hash of the token', () => {
  it('agrees with an independent computation', () => {
    const url = 'https://x/y';
    const params = { A: '1' };
    const expected = crypto.createHmac('sha1', 'tok').update(`${url}A1`).digest('base64');
    expect(signTwilioRequest('tok', url, params)).toBe(expected);
  });
});
