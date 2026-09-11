// lib/twilio/twiml.ts — the five TwiML tags the receptionist uses, as functions.
//
// No SDK: TwiML is XML, and the receptionist needs Say, Gather, Record, Hangup and Message. Every
// text value goes through `esc`, so a caller's name containing an ampersand cannot break the
// document (a malformed TwiML response makes Twilio read an error to the caller and hang up).

export const RECEPTIONIST_VOICE = 'Google.en-US-Neural2-D';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));

export function say(text: string): string {
  return `<Say voice="${RECEPTIONIST_VOICE}">${esc(text)}</Say>`;
}

export function gather(action: string, prompt?: string, opts: { timeout?: number } = {}): string {
  const attrs = [
    'input="speech"',
    `action="${esc(action)}"`,
    'method="POST"',
    'speechTimeout="auto"',
    `timeout="${opts.timeout ?? 6}"`,
    'language="en-US"',
    'enhanced="true"',
    'speechModel="phone_call"',
    'actionOnEmptyResult="true"',
  ].join(' ');
  return `<Gather ${attrs}>${prompt ? say(prompt) : ''}</Gather>`;
}

export function record(action: string, transcribeCallback: string, maxSeconds = 180): string {
  return `<Record action="${esc(action)}" method="POST" maxLength="${maxSeconds}" playBeep="true" trim="trim-silence" transcribe="true" transcribeCallback="${esc(transcribeCallback)}" />`;
}

/** Ring a phone. `screenUrl` is fetched on the callee's leg when it answers (a whisper), and the
 *  bridge only happens if that TwiML returns without hanging up. `action` receives DialCallStatus. */
export function dial(number: string, opts: { timeout: number; callerId: string; action: string; screenUrl?: string }): string {
  const attrs = [`timeout="${opts.timeout}"`, `action="${esc(opts.action)}"`, 'method="POST"', opts.callerId ? `callerId="${esc(opts.callerId)}"` : ''].filter(Boolean).join(' ');
  const num = opts.screenUrl ? `<Number url="${esc(opts.screenUrl)}" method="POST">${esc(number)}</Number>` : esc(number);
  return `<Dial ${attrs}>${num}</Dial>`;
}

export const hangup = (): string => '<Hangup/>';
export const message = (text: string): string => `<Message>${esc(text)}</Message>`;

export function twiml(...inner: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner.join('')}</Response>`;
}

export function twimlResponse(body: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/xml; charset=utf-8', ...extraHeaders } });
}
