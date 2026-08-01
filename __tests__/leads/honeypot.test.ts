// __tests__/leads/honeypot.test.ts — the bot trap on the public forms (A1-3).
//
// The asymmetry that shapes every case below: a trapped submission is told it SUCCEEDED, so a false
// positive is invisible to the customer. They believe they have contacted us and nobody has. Which means
// the interesting tests are not "does it catch a bot" — they are "does it let every plausible human
// through", and there are more of those.
import { describe, it, expect } from 'vitest';
import {
  HONEYPOT_FIELD, HONEYPOT_TIME_FIELD, MAX_FILL_MS, MIN_FILL_MS,
  checkHoneypot, honeypotInputProps,
} from '@/lib/leads/honeypot';

const NOW = 1_770_000_000_000;
const at = (msAgo: number) => ({ [HONEYPOT_TIME_FIELD]: String(NOW - msAgo) });

describe('the trap catches what it is for', () => {
  it('catches a filled honeypot', () => {
    expect(checkHoneypot({ [HONEYPOT_FIELD]: 'https://spam.example', ...at(30_000) }, NOW))
      .toEqual({ trapped: true, reason: 'filled' });
  });

  it('catches an instant submission', () => {
    expect(checkHoneypot(at(100), NOW)).toEqual({ trapped: true, reason: 'too-fast' });
    expect(checkHoneypot(at(MIN_FILL_MS - 1), NOW)).toEqual({ trapped: true, reason: 'too-fast' });
  });

  it('catches a replay of a page opened yesterday', () => {
    expect(checkHoneypot(at(MAX_FILL_MS + 1000), NOW)).toEqual({ trapped: true, reason: 'too-old' });
  });
});

describe('it lets every plausible human through — the half that actually matters', () => {
  it('passes an ordinary submission', () => {
    expect(checkHoneypot(at(45_000), NOW)).toEqual({ trapped: false });
  });

  it('passes an EMPTY honeypot, including whitespace a browser might insert', () => {
    expect(checkHoneypot({ [HONEYPOT_FIELD]: '', ...at(30_000) }, NOW)).toEqual({ trapped: false });
    expect(checkHoneypot({ [HONEYPOT_FIELD]: '   ', ...at(30_000) }, NOW)).toEqual({ trapped: false });
  });

  it('passes when the timestamp is MISSING — the most important case here', () => {
    // The field is added by client JavaScript. Anyone whose script did not run — a strict privacy
    // extension, a phone that timed out, an accessibility tool that rebuilt the form — would otherwise be
    // silently discarded while believing they had contacted us. The honeypot's entire justification is
    // that it never touches an honest customer.
    expect(checkHoneypot({}, NOW)).toEqual({ trapped: false });
    expect(checkHoneypot(null, NOW)).toEqual({ trapped: false });
    expect(checkHoneypot(undefined, NOW)).toEqual({ trapped: false });
  });

  it('passes when the timestamp is unreadable rather than treating it as suspicious', () => {
    for (const bad of ['', 'not-a-number', '0', 'NaN', '-1']) {
      expect(checkHoneypot({ [HONEYPOT_TIME_FIELD]: bad, ...{} }, NOW), bad).toEqual({ trapped: false });
    }
  });

  it('passes when the customer\'s clock is ahead of ours', () => {
    // Device clock skew is common and meaningless. A negative elapsed time is not evidence of a bot.
    expect(checkHoneypot({ [HONEYPOT_TIME_FIELD]: String(NOW + 60_000) }, NOW)).toEqual({ trapped: false });
  });

  it('passes at exactly the threshold, not one millisecond either side of a coin flip', () => {
    expect(checkHoneypot(at(MIN_FILL_MS), NOW)).toEqual({ trapped: false });
    expect(checkHoneypot(at(MAX_FILL_MS), NOW)).toEqual({ trapped: false });
  });

  it('keeps the fast threshold LOW, so autofill never trips it', () => {
    // If this ever creeps up to "a careful human minimum", it starts rejecting people with autofill on a
    // repeat visit — and they will never know.
    expect(MIN_FILL_MS).toBeLessThanOrEqual(5000);
  });
});

describe('the hidden field is hidden the right way', () => {
  const props = honeypotInputProps();

  it('is off-screen rather than display:none', () => {
    // Better bots skip anything obviously hidden, and some screen readers announce a display:none label
    // anyway. Off-screen at zero opacity is invisible to a person and unremarkable to a script.
    expect(props.style.position).toBe('absolute');
    expect(props.style.left).toMatch(/-\d{4,}px/);
    expect(props.style.opacity).toBe(0);
    expect(JSON.stringify(props.style)).not.toMatch(/display.*none/i);
  });

  it('is out of the keyboard and screen-reader path', () => {
    expect(props.tabIndex).toBe(-1);
    expect(props['aria-hidden']).toBe('true');
    expect(props.autoComplete).toBe('off');
  });

  it('names the field in ONE place, so four forms cannot drift', () => {
    expect(props.name).toBe(HONEYPOT_FIELD);
  });
});
