// __tests__/twilio/call-screening.test.ts — robocalls, silent callers, and the fail-safes.
//
// Owner, 2026-10-06: "If they are clearly a robotic number, then they should be blocked forever …
// If they are silent and Ellie ends up hanging up on them, then they should go straight to voicemail
// from then on … We really need fail safes so that we are not weeding out calls from actual or
// potential customers."
//
// The calls below are transcribed from the live log (Sep 12 – Oct 6 2026). The ones that matter most
// are the customers: each fail-safe is pinned by a real call that a naive rule would have screened.
import { describe, it, expect } from 'vitest';
import { judgeCall, roboFingerprint, callerWords, type VerdictInput } from '@/lib/receptionist/call-verdict';
import { decideRoute, numberStatus, countVerdicts, type RouteInput } from '@/lib/receptionist/screening';
import { regionOf, regionText } from '@/lib/receptionist/area-codes';
import { isJunkCall, treatmentText } from '@/lib/receptionist/screening-labels';
import type { CallTurn } from '@/lib/receptionist/calls';

const t = (role: CallTurn['role'], text: string): CallTurn => ({ role, text });
function call(p: Partial<VerdictInput>): VerdictInput {
  return {
    answered_by: 'owner', transcript: [], voicemail_text: null, analysis: null,
    duration_seconds: 40, recording_duration: 20, transcript_status: 'completed', ...p,
  } as VerdictInput;
}

describe('a recording on the caller side is a robocall', () => {
  it.each([
    ['+13182091951', 'An agent. Press 9 to opt out or call 8 7 7 5 5 6 9 2 5 5.'],
    ['+12722041743', 'To an agent. Press 2 or dial 8 7 7 5 5 6'],
    ['+12722041743', 'Not showing correctly on Google and Google Maps.'],
    ['+12192051333', '5 to opt out.'],
    ['+14102080334', '9 2 5 5. Thank you.'],
  ])('%s: "%s"', (_n, words) => {
    expect(roboFingerprint(words)).not.toBeNull();
    expect(judgeCall(call({ transcript: [t('caller', words), t('owner', 'Hello?')] })).verdict).toBe('robocall');
  });

  it('a customer reading out their own number is not a robocall', () => {
    const words = 'Hi, this is Margaret with Great American Title, you can reach me at 8 3 0 5 5 5 0 1 0 0.';
    expect(roboFingerprint(words)).toBeNull();
  });

  it('Hank\'s own words never count — only the caller channel', () => {
    expect(judgeCall(call({ transcript: [t('owner', 'Press 1 if you can hear me, opt out of nothing')] })).verdict).not.toBe('robocall');
  });
});

describe('silent means the caller had every chance and said nothing', () => {
  it('Hank saying hello into nothing for 17 seconds is silent', () => {
    const c = call({ recording_duration: 17, transcript: [t('owner', 'This is Hank Maddox.'), t('owner', 'Hello?'), t('owner', 'Hello?')] });
    expect(judgeCall(c).verdict).toBe('silent');
  });

  it('Ellie greeting and prompting into nothing is silent', () => {
    const c = call({ answered_by: 'ai', recording_duration: 30, transcript: [t('assistant', 'Thanks for calling…'), t('assistant', 'Are you still there?')] });
    expect(judgeCall(c).verdict).toBe('silent');
  });

  it('FAIL-SAFE: Ellie\'s leg dropping 8 seconds in is NOT the caller being silent (254-217-0985, a real customer)', () => {
    const c = call({ answered_by: 'ai', duration_seconds: 35, recording_duration: 8, transcript: [t('assistant', 'Thanks for calling Starr Surveying, this is')] });
    expect(judgeCall(c).verdict).toBe('unknown');
  });

  it('FAIL-SAFE: an outcome that says our side failed is never silent', () => {
    const c = call({ answered_by: 'ai', recording_duration: 40, transcript: [t('assistant', 'Hi'), t('assistant', 'Hello?')], outcome: 'agent-ended-early' });
    expect(judgeCall(c).verdict).toBe('unknown');
  });

  it('a few words ("Hi. Hello?") is unclear, never silent', () => {
    const c = call({ recording_duration: 20, transcript: [t('owner', 'Hello?'), t('caller', 'Hi. Hello? Hello?'), t('owner', 'Hello?')] });
    expect(judgeCall(c).verdict).toBe('unknown');
  });

  it('waits for the transcript rather than calling an untranscribed call silent', () => {
    const c = call({ transcript: [], transcript_status: 'queued' });
    expect(judgeCall(c).ready).toBe(false);
    expect(judgeCall(c, { final: true }).verdict).toBe('unknown');
  });
});

describe('a real person is recognised', () => {
  it('four or more real words from the caller', () => {
    const c = call({ transcript: [t('owner', 'Hank Maddox.'), t('caller', 'Hi. This is Chrissy at Riverway Title.')] });
    expect(judgeCall(c).verdict).toBe('person');
  });
  it('a voicemail with words in it', () => {
    const c = call({ answered_by: 'voicemail', voicemail_text: 'Hi, this is Terry Glover, I am trying to send an email', transcript: [t('caller', '(Recorded message 1, 42 seconds.)')] });
    expect(judgeCall(c).verdict).toBe('person');
  });
  it('a voicemail waits for its transcription, then is judged on the words', () => {
    const c = call({ answered_by: 'voicemail', transcript: [t('caller', '(Recorded message 1, 42 seconds.)')] });
    expect(judgeCall(c).ready).toBe(false);
  });
  it('hanging up before anyone answered counts against nobody', () => {
    expect(judgeCall(call({ answered_by: 'none', transcript: [] })).verdict).toBe('hangup');
  });
});

describe('what a number becomes', () => {
  const counts = (v: Array<string | null>) => countVerdicts(v.map((caller_verdict) => ({ caller_verdict })));
  it('one real conversation outweighs any number of robocalls (spoofed numbers get reused)', () => {
    expect(numberStatus(counts(['robocall', 'robocall', 'person']), { linked: false }).status).toBe('person');
  });
  it('robocall before silent before unknown', () => {
    expect(numberStatus(counts(['robocall', 'silent', 'silent']), { linked: false }).status).toBe('robocall');
    expect(numberStatus(counts(['silent', 'hangup']), { linked: false }).status).toBe('silent');
    expect(numberStatus(counts(['hangup', 'unknown']), { linked: false }).status).toBe('unknown');
  });
  it('FAIL-SAFE: tied to a customer, lead, job or contact is a customer, whatever the calls were', () => {
    expect(numberStatus(counts(['silent', 'robocall']), { linked: true }).status).toBe('customer');
  });
  it('the crew and family are known callers', () => {
    expect(numberStatus(counts(['silent']), { linked: false, relationship: 'staff' }).status).toBe('person');
  });
});

describe('ring, voicemail or block', () => {
  const base: RouteInput = { screening: 'auto', status: 'unknown', relationship: 'unknown', linked: false, rule: null, enabled: true };
  const route = (p: Partial<RouteInput>) => decideRoute({ ...base, ...p }).route;

  it('a stranger rings', () => expect(route({})).toBe('ring'));
  it('a silent caller goes to voicemail, never refused', () => expect(route({ status: 'silent' })).toBe('voicemail'));
  it('a spammer goes to voicemail', () => expect(route({ status: 'spam' })).toBe('voicemail'));
  it('an automatic robocall rule refuses', () => expect(route({ status: 'robocall', rule: { reason: 'robocall', auto_blocked: true } })).toBe('block'));
  it('a robocaller someone UNBLOCKED is not quietly re-refused — voicemail at worst', () => expect(route({ status: 'robocall', rule: null })).toBe('voicemail'));

  it('FAIL-SAFE: "always ring" beats every rule, even a block', () => {
    expect(route({ screening: 'always_ring', status: 'robocall', rule: { reason: 'x', auto_blocked: false } })).toBe('ring');
  });
  it('FAIL-SAFE: a linked customer is never screened by an automatic rule', () => {
    expect(route({ linked: true, status: 'silent' })).toBe('ring');
    expect(route({ linked: true, rule: { reason: 'robocall', auto_blocked: true } })).toBe('ring');
  });
  it('…but a block a person made still holds', () => {
    expect(route({ linked: true, rule: { reason: 'harassment', auto_blocked: false } })).toBe('block');
  });
  it('FAIL-SAFE: switched off, nothing automatic happens — only what a person chose', () => {
    expect(route({ enabled: false, status: 'silent' })).toBe('ring');
    expect(route({ enabled: false, rule: { reason: 'robocall', auto_blocked: true } })).toBe('ring');
    expect(route({ enabled: false, screening: 'voicemail' })).toBe('voicemail');
  });
  it('FAIL-SAFE: out of state on its own changes nothing (Colorado, Chicago and California customers in the log)', () => {
    expect(regionOf('+17208378305')).toBe('out_of_state');
    expect(route({})).toBe('ring');
  });
});

describe('where a number is from', () => {
  it('reads Texas, out of state, toll-free and international', () => {
    expect(regionOf('+12543151123')).toBe('texas');
    expect(regionText('+18722684567')).toBe('Out of state (872)');
    expect(regionOf('+18778426971')).toBe('toll_free');
    expect(regionOf('+447700900123')).toBe('international');
    expect(regionOf('browser:starr')).toBe('unknown');
  });
});

describe('the page words', () => {
  it('junk is robocalls, silent, spam, blocked, and screened calls with no real message', () => {
    expect(isJunkCall({ caller_verdict: 'robocall' })).toBe(true);
    expect(isJunkCall({ screened_as: 'voicemail', caller_verdict: 'hangup' })).toBe(true);
    expect(isJunkCall({ screened_as: 'voicemail', caller_verdict: 'person' })).toBe(false);
    expect(isJunkCall({ caller_verdict: 'hangup' })).toBe(false);
  });
  it('treatment says what happens next time', () => {
    expect(treatmentText({ status: 'robocall' })).toBe('Blocked automatically');
    expect(treatmentText({ status: 'silent' })).toBe('Screened to voicemail');
    expect(treatmentText({ status: 'silent', screening: 'always_ring' })).toBe('Always rings');
    expect(treatmentText({ status: 'person' })).toBe('Rings normally');
  });
  it('callerWords ignores the machine\'s bracketed notes', () => {
    expect(callerWords({ transcript: [t('caller', '(Recorded message 1, 1 seconds.)')], voicemail_text: null })).toBe('');
  });
});
