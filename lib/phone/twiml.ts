// lib/phone/twiml.ts — slice I2 of
// docs/planning/completed/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// TwiML is the XML document Twilio asks for when a call arrives; whatever this returns is what the
// caller hears. Built as pure strings so the behaviour is testable without a phone — a webhook that
// can only be verified by ringing it is a webhook nobody verifies.
//
// ── THE ESCAPING IS NOT COSMETIC ────────────────────────────────────────────────────────────────
//
// The greeting is free text an admin types into a settings form, and it is interpolated into XML. An
// unescaped `&` in "Hill & Vale Surveying" produces a malformed document, and Twilio's response
// to malformed TwiML is to hang up on the caller — a lost customer caused by an ampersand.
//
// The worse case is the caller's own data. Caller-ID names come from the carrier and are not
// sanitised by anyone. A name containing `</Say><Dial>+1900…</Dial>` would, unescaped, add a verb to
// our document and dial a premium-rate number on the firm's account. So every interpolated value —
// ours and theirs — goes through `esc`, and the tests assert it for both.
//
// ── AND WHY THE VERBS ARE IN THIS ORDER ─────────────────────────────────────────────────────────
//
// Twilio executes verbs top to bottom, and a `<Dial>` that connects consumes the rest of the
// document. So voicemail-after-no-answer works by putting `<Record>` AFTER the `<Dial>`: it is
// reached only when the dial fails to connect. Putting it before would send every caller straight
// to the machine while the office sat waiting for the phone to ring.

/** Escape a value for XML text or an attribute. Applied to everything interpolated, without exception. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Strip characters that break speech synthesis without being XML-significant.
 *
 * Control characters are not valid in XML 1.0 at all — a stray one makes the whole document
 * unparseable, and it arrives via copy-paste from Word more often than you would guess.
 */
export function speakable(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface SayOptions {
  voice?: string;
  language?: string;
}

const DEFAULT_VOICE = 'Polly.Joanna';
const DEFAULT_LANGUAGE = 'en-US';

export function say(text: string, opts: SayOptions = {}): string {
  return `<Say voice="${esc(opts.voice ?? DEFAULT_VOICE)}" language="${esc(opts.language ?? DEFAULT_LANGUAGE)}">${esc(speakable(text))}</Say>`;
}

export function pause(seconds: number): string {
  const n = Math.min(60, Math.max(1, Math.round(Number.isFinite(seconds) ? seconds : 1)));
  return `<Pause length="${n}"/>`;
}

/** Wrap verbs in the document envelope Twilio expects. */
export function twimlDocument(...verbs: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${verbs.filter(Boolean).join('')}</Response>`;
}

export interface RecordOptions {
  action?: string;
  /** Fires as soon as the recording exists, so transcription can start before the call is filed. */
  recordingStatusCallback?: string;
  maxLengthSeconds?: number;
  /** Silence that ends the message. Too short truncates a thoughtful caller mid-sentence. */
  timeoutSeconds?: number;
  playBeep?: boolean;
  /** Lets a caller who is done press # rather than sitting through the silence timeout. */
  finishOnKey?: string;
}

export function record(opts: RecordOptions = {}): string {
  const attrs = [
    `maxLength="${Math.min(3600, Math.max(10, opts.maxLengthSeconds ?? 180))}"`,
    `timeout="${Math.min(60, Math.max(2, opts.timeoutSeconds ?? 5))}"`,
    `playBeep="${opts.playBeep === false ? 'false' : 'true'}"`,
    `finishOnKey="${esc(opts.finishOnKey ?? '#')}"`,
    // Twilio's own transcription is off: it is charged per minute and we already own a Whisper
    // pipeline. See decision D2 in the plan.
    'transcribe="false"',
  ];
  if (opts.action) attrs.push(`action="${esc(opts.action)}"`);
  if (opts.recordingStatusCallback) {
    attrs.push(`recordingStatusCallback="${esc(opts.recordingStatusCallback)}"`);
    attrs.push('recordingStatusCallbackEvent="completed"');
  }
  return `<Record ${attrs.join(' ')}/>`;
}

export interface DialOptions {
  numbers: string[];
  timeoutSeconds?: number;
  callerId?: string;
  action?: string;
  /** Record both legs of an answered call. */
  record?: boolean;
  recordingStatusCallback?: string;
}

export function dial(opts: DialOptions): string {
  const attrs = [`timeout="${Math.min(120, Math.max(5, opts.timeoutSeconds ?? 20))}"`];
  if (opts.callerId) attrs.push(`callerId="${esc(opts.callerId)}"`);
  if (opts.action) attrs.push(`action="${esc(opts.action)}"`);
  if (opts.record) attrs.push('record="record-from-answer-dual"');
  if (opts.recordingStatusCallback) {
    attrs.push(`recordingStatusCallback="${esc(opts.recordingStatusCallback)}"`);
    attrs.push('recordingStatusCallbackEvent="completed"');
  }
  // `answerOnBridge` so the caller hears real ringing instead of silence while we try each number.
  attrs.push('answerOnBridge="true"');
  const numbers = opts.numbers.map((n) => `<Number>${esc(n)}</Number>`).join('');
  return `<Dial ${attrs.join(' ')}>${numbers}</Dial>`;
}

export interface GreetingUrls {
  /** Where `<Record>` posts when the caller hangs up or presses #. */
  recordAction?: string;
  recordingStatusCallback?: string;
  /** Where `<Dial>` posts its outcome, so a no-answer can fall through to voicemail. */
  dialAction?: string;
}

/**
 * What an out-of-hours caller hears: the notice, the greeting, then the tone.
 *
 * The recording notice comes first and unconditionally — see decision D5. It is announced even
 * though Texas is one-party-consent, because callers from two-party states exist and this costs one
 * line.
 */
export function afterHoursTwiml(greeting: string, urls: GreetingUrls = {}): string {
  return twimlDocument(
    say('This call may be recorded.'),
    say(greeting),
    record({
      action: urls.recordAction,
      recordingStatusCallback: urls.recordingStatusCallback,
      maxLengthSeconds: 180,
      timeoutSeconds: 5,
    }),
    // Reached when the caller says nothing at all. Without it Twilio hangs up bare, and a silent
    // disconnect reads to the caller as a broken line rather than a finished message.
    say('We did not hear a message. Goodbye.'),
    '<Hangup/>',
  );
}

/**
 * What an in-hours caller hears: the notice, then ringing, then voicemail if nobody picks up.
 *
 * `<Record>` sits after `<Dial>` deliberately — see the header. With no numbers configured the dial
 * is omitted entirely rather than emitted empty, since `<Dial></Dial>` with no children is an error
 * that drops the call.
 */
export function inHoursTwiml(opts: {
  greeting: string;
  forwardTo: string[];
  ringSeconds: number;
  callerId?: string;
  fallbackGreeting: string;
  urls?: GreetingUrls;
}): string {
  const urls = opts.urls ?? {};
  const verbs: string[] = [say('This call may be recorded.')];

  // The greeting is said here only when there is somebody to ring. With no numbers configured the
  // call falls straight through to `fallbackGreeting`, which opens with its own "thank you for
  // calling" — so saying both makes the caller hear the firm thank them twice in a row. A live
  // webhook test is what surfaced this; it is invisible in the markup.
  if (opts.forwardTo.length > 0) {
    verbs.push(
      say(opts.greeting),
      dial({
        numbers: opts.forwardTo,
        timeoutSeconds: opts.ringSeconds,
        callerId: opts.callerId,
        action: urls.dialAction,
        record: true,
        recordingStatusCallback: urls.recordingStatusCallback,
      }),
    );
  }

  // Reached when nobody answered, or when there is nobody to ring.
  verbs.push(
    say(opts.fallbackGreeting),
    record({
      action: urls.recordAction,
      recordingStatusCallback: urls.recordingStatusCallback,
      maxLengthSeconds: 180,
      timeoutSeconds: 5,
    }),
    say('We did not hear a message. Goodbye.'),
    '<Hangup/>',
  );
  return twimlDocument(...verbs);
}

/** Said after a message is captured, before hanging up. */
export function voicemailThanksTwiml(): string {
  return twimlDocument(say('Thank you. We will get back to you as soon as we can. Goodbye.'), '<Hangup/>');
}

/**
 * The outbound leg of a call-back: what the staff member hears when we ring them first.
 *
 * They need to know who they are about to be connected to before it happens — otherwise they answer
 * an unexplained call from their own office number and hang up on their own customer.
 */
export function bridgeTwiml(opts: { customerNumber: string; callerId: string; label?: string; recordingStatusCallback?: string }): string {
  return twimlDocument(
    say(`Connecting you to ${opts.label ?? 'your customer'}. This call may be recorded.`),
    dial({
      numbers: [opts.customerNumber],
      callerId: opts.callerId,
      timeoutSeconds: 30,
      record: true,
      recordingStatusCallback: opts.recordingStatusCallback,
    }),
  );
}
