// __tests__/phone/twiml.test.ts — slice I2 of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// TwiML is what the caller hears, and every bug in it is audible rather than logged. Three classes
// here, in descending order of how much they cost:
//
//   · INJECTION. Caller-ID names come from the carrier unsanitised. An unescaped one can add a
//     <Dial> verb to our document and bill a premium-rate number to the firm.
//   · A MALFORMED DOCUMENT. Twilio's response to invalid TwiML is to hang up. An ampersand in the
//     company name is enough.
//   · VERB ORDER. <Record> before <Dial> sends every caller to voicemail while the office waits for
//     a phone that never rings — and nothing errors.

import { describe, it, expect } from 'vitest';
import {
  esc, speakable, say, twimlDocument, record, dial,
  afterHoursTwiml, inHoursTwiml, voicemailThanksTwiml, bridgeTwiml,
} from '@/lib/phone/twiml';
import { expectOrder } from '../helpers/expect-order';

/** Crude but sufficient: every < that opens a tag has a matching >, and quotes are balanced. */
function tagNames(xml: string): string[] {
  return Array.from(xml.matchAll(/<\/?([A-Za-z]+)/g)).map((m) => m[1]);
}

describe('escaping', () => {
  it('escapes the five XML-significant characters', () => {
    expect(esc('&')).toBe('&amp;');
    expect(esc('<')).toBe('&lt;');
    expect(esc('>')).toBe('&gt;');
    expect(esc('"')).toBe('&quot;');
    expect(esc("'")).toBe('&apos;');
  });

  it('escapes the ampersand FIRST, so it does not double-escape', () => {
    // Getting the order wrong turns `<` into `&amp;lt;`, which the caller hears read aloud.
    expect(esc('<a & b>')).toBe('&lt;a &amp; b&gt;');
    expect(esc('&lt;')).toBe('&amp;lt;');
  });

  it('handles null and undefined without printing them', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  it('strips control characters that make the document unparseable', () => {
    expect(speakable('Hello\u0000World\u0000')).toBe('Hello World');
  });

  it('does NOT strip the letter s', () => {
    // A regression guard with a story: an escaping fix once wrote /s+/ where /\s+/ was meant, which
    // turns "Starr Surveying" into "tarr urveying" — spoken aloud, to every caller.
    expect(speakable('Starr Surveying')).toBe('Starr Surveying');
    expect(speakable('assess')).toBe('assess');
  });

  it('collapses runs of whitespace instead of reading a wall of newlines', () => {
    expect(speakable('Hello\n\n\n   world')).toBe('Hello world');
  });
});

describe('the injection attempt', () => {
  const EVIL = '</Say><Dial><Number>+19005551212</Number></Dial><Say>';

  it('does not let a caller-ID name add a verb', () => {
    // The one that costs money: a premium-rate number dialled on the firm's account.
    const xml = say(`Call from ${EVIL}`);
    expect(xml).not.toContain('<Dial>');
    expect(xml).not.toContain('<Number>');
    expect(tagNames(xml)).toEqual(['Say', 'Say']); // the open and its close, nothing else
  });

  it('does not let a greeting from the settings form add a verb', () => {
    const xml = afterHoursTwiml(EVIL);
    expect(xml).not.toContain('<Dial ');
    expect(xml).not.toContain('<Number>');
  });

  it('does not let a forwarding number break out of its element', () => {
    const xml = dial({ numbers: ['+1512"><Hangup/><Number>+1900'] });
    expect(xml.match(/<Hangup\/>/)).toBeNull();
  });

  it('does not let a callback URL break out of its attribute', () => {
    const xml = record({ action: 'https://x/y" onload="evil' });
    expect(xml).toContain('&quot;');
    expect(tagNames(xml)).toEqual(['Record']);
  });
});

describe('a well-formed document', () => {
  it('opens with the XML declaration and a Response element', () => {
    const xml = twimlDocument(say('hi'));
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><Response>')).toBe(true);
    expect(xml.endsWith('</Response>')).toBe(true);
  });

  it('survives an ampersand in the company name', () => {
    // The cheap disaster: Twilio hangs up on malformed TwiML.
    const xml = afterHoursTwiml('Thank you for calling Starr Surveying & Mapping.');
    expect(xml).toContain('Starr Surveying &amp; Mapping');
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it('drops empty verbs rather than emitting a blank element', () => {
    expect(twimlDocument(say('a'), '', say('b'))).not.toContain('<>');
  });
});

describe('what an out-of-hours caller hears', () => {
  const xml = afterHoursTwiml('We are closed.', {
    recordAction: 'https://x/api/twilio/voicemail',
    recordingStatusCallback: 'https://x/api/twilio/recording',
  });

  it('announces recording before anything else', () => {
    // Decision D5. It has to be first — announcing it after the message is captured is not a notice.
    expectOrder(xml, 'may be recorded', 'We are closed', 'the recording notice comes first');
  });

  it('plays the greeting and then records', () => {
    expect(xml).toContain('We are closed.');
    expectOrder(xml, 'We are closed', '<Record', 'greeting then tone');
  });

  it('never dials anybody', () => {
    // The whole point of after-hours. A <Dial> here rings the office at 3am.
    expect(xml).not.toContain('<Dial');
  });

  it('asks Twilio not to transcribe, since we do it ourselves', () => {
    expect(xml).toContain('transcribe="false"');
  });

  it('hangs up gracefully when the caller says nothing', () => {
    expect(xml).toContain('<Hangup/>');
    expect(xml).toContain('did not hear a message');
  });

  it('wires both callbacks so the recording can be fetched', () => {
    expect(xml).toContain('action="https://x/api/twilio/voicemail"');
    expect(xml).toContain('recordingStatusCallback="https://x/api/twilio/recording"');
  });
});

describe('what an in-hours caller hears', () => {
  const base = {
    greeting: 'Thank you for calling.',
    forwardTo: ['+19366620077', '+15125551234'],
    ringSeconds: 20,
    callerId: '+19366620077',
    fallbackGreeting: 'Nobody is available. Leave a message.',
  };

  it('rings the office', () => {
    const xml = inHoursTwiml(base);
    expect(xml).toContain('<Number>+19366620077</Number>');
    expect(xml).toContain('<Number>+15125551234</Number>');
  });

  it('records ONLY AFTER the dial, so voicemail is the fallback and not the destination', () => {
    // The silent one. Reversed, every caller reaches the machine while the office waits.
    const xml = inHoursTwiml(base);
    expectOrder(xml, '<Dial', '<Record', 'voicemail is the fallback, not the destination');
  });

  it('honours the configured ring time', () => {
    expect(inHoursTwiml({ ...base, ringSeconds: 45 })).toContain('timeout="45"');
  });

  it('shows the business number to the person being rung, not the caller’s', () => {
    expect(inHoursTwiml(base)).toContain('callerId="+19366620077"');
  });

  it('omits the Dial entirely when nobody is configured to ring', () => {
    // `<Dial></Dial>` with no children is invalid TwiML and drops the call — so an unconfigured
    // deployment must go straight to voicemail rather than emit an empty verb.
    const xml = inHoursTwiml({ ...base, forwardTo: [] });
    expect(xml).not.toContain('<Dial');
    expect(xml).toContain('<Record');
    expect(xml).toContain('Leave a message');
  });

  it('still announces recording first', () => {
    const xml = inHoursTwiml(base);
    expectOrder(xml, 'may be recorded', '<Dial', 'the recording notice comes first');
  });

  it('clamps an absurd ring time rather than passing it through', () => {
    expect(inHoursTwiml({ ...base, ringSeconds: 9999 })).toContain('timeout="120"');
  });
});

describe('the call-back bridge', () => {
  it('tells the staff member who they are about to speak to', () => {
    // Otherwise they answer an unexplained call from their own office number and hang up on their
    // own customer.
    const xml = bridgeTwiml({ customerNumber: '+15125551234', callerId: '+19366620077', label: 'Jane Doe' });
    expect(xml).toContain('Jane Doe');
    expectOrder(xml, 'Jane Doe', '<Dial', 'they are told who before it rings');
  });

  it('dials the customer showing the business number', () => {
    const xml = bridgeTwiml({ customerNumber: '+15125551234', callerId: '+19366620077' });
    expect(xml).toContain('<Number>+15125551234</Number>');
    expect(xml).toContain('callerId="+19366620077"');
  });

  it('escapes a customer name from the database', () => {
    const xml = bridgeTwiml({ customerNumber: '+1512', callerId: '+1936', label: 'Smith & Sons <script>' });
    expect(xml).toContain('Smith &amp; Sons');
    expect(xml).not.toContain('<script>');
  });
});

describe('the thanks message', () => {
  it('closes the call rather than leaving the line open', () => {
    expect(voicemailThanksTwiml()).toContain('<Hangup/>');
  });
});
