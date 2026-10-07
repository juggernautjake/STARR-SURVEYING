// lib/receptionist/screening-labels.ts — the words the pages use for screening, in one place.
//
// Client-safe (no database imports), so the call list, the call page and the numbers page all say
// the same thing for the same state. A page calling a number "Silent caller" while another calls it
// "Screened" is how a person ends up unsure which switch to flip.

export const VERDICT_LABEL: Record<string, string> = {
  person: 'Real person',
  silent: 'Silent',
  robocall: 'Robocall',
  spam: 'Spam',
  hangup: 'Hung up',
  blocked: 'Blocked',
  unknown: 'Unclear',
};

export const STATUS_LABEL: Record<string, string> = {
  customer: 'Customer',
  person: 'Real person',
  silent: 'Silent caller',
  robocall: 'Robocaller',
  spam: 'Spam',
  unknown: 'Not sure yet',
};

export const SCREENING_LABEL: Record<string, string> = {
  auto: 'Automatic',
  always_ring: 'Always rings',
  voicemail: 'Straight to voicemail',
  block: 'Blocked',
};

/** What each choice does, said plainly next to the buttons. */
export const SCREENING_HELP: Record<string, string> = {
  auto: 'The rules decide: robocalls are blocked, silent and spam callers go to voicemail, everyone else rings.',
  always_ring: 'Always rings through, whatever the rules say. Use it for anyone you never want screened.',
  voicemail: 'Never rings; hears the greeting and can leave a message. A real message still notifies you.',
  block: 'Refused before anything rings. Nobody is told, and the call is counted on the Blocked numbers page.',
};

/** How a number is being treated right now, in words: its own setting, or what the rules make of it. */
export function treatmentText(n: { screening?: string | null; status?: string | null; relationship?: string | null }): string {
  if (n.screening && n.screening !== 'auto') return SCREENING_LABEL[n.screening] ?? n.screening;
  if (n.status === 'robocall') return 'Blocked automatically';
  if (n.status === 'silent' || n.status === 'spam' || n.relationship === 'spam') return 'Screened to voicemail';
  return 'Rings normally';
}

/** True for a call that never reached a person on our side because of screening. */
export function wasScreened(c: { screened_as?: string | null; answered_by?: string | null }): boolean {
  return c.screened_as === 'voicemail' || c.screened_as === 'blocked' || c.answered_by === 'blocked';
}

/** Calls nobody needs to look at: refused, junk, or screened with no real message. */
export function isJunkCall(c: { screened_as?: string | null; answered_by?: string | null; caller_verdict?: string | null }): boolean {
  const v = c.caller_verdict;
  if (v === 'robocall' || v === 'silent' || v === 'blocked' || v === 'spam') return true;
  return wasScreened(c) && v !== 'person';
}
