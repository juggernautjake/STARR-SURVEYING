// lib/leads/honeypot.ts — the bot trap on the public intake forms.
//
// A1-3 of docs/planning/in-progress/SURVEYING_BACKEND_ANALYSIS_2026-08-01.md.
//
// ── WHY A HONEYPOT AND NOT A CAPTCHA ────────────────────────────────────────────────────────────────
//
// A captcha is a tax on every honest customer to stop a dishonest script, and the people it taxes hardest
// are the ones on a phone in a field with one bar of signal — which, for a land-surveying firm, is a real
// share of the people trying to get in touch. It also adds a third-party dependency and a privacy notice
// to a form whose entire job is to be easy.
//
// A honeypot costs the customer nothing, because they never see it. It stops the naive bots that make up
// the overwhelming majority of form spam: they fill every input they can find, because that is the only
// strategy that works across a million different forms.
//
// It does NOT stop a targeted attacker who reads the page and skips the field. That is fine, and it is why
// the rate limiter (A1-2) exists alongside it: the honeypot removes the volume, the throttle bounds what is
// left. Neither alone is the answer, and neither is a captcha.
//
// ── THE TIMING CHECK IS THE SECOND HALF, AND THE MORE INTERESTING ONE ───────────────────────────────
//
// Scripts submit instantly — they have no form to read. A human filling in name, email, phone, address,
// county and property number takes tens of seconds at minimum. A submission that arrives within a couple
// of seconds of the page rendering did not come from someone typing.
//
// The threshold is deliberately LOW (3 seconds). A slow, careful bot defeats it; that is the throttle's
// job. What it must never do is reject a fast human — someone with autofill, submitting a short form on a
// second visit, can be genuinely quick, and losing that enquiry costs more than letting a bot through.
//
// ── HOW A REJECTION BEHAVES ─────────────────────────────────────────────────────────────────────────
//
// **A trapped submission is told it succeeded.** It gets the ordinary success response and nothing is sent,
// stored or emailed. That is not politeness — it is the point: a bot that receives an error retries,
// mutates, and eventually finds the shape that works, and it reports the form as "protected" to whoever is
// running it. A bot that receives a 200 goes away satisfied and never learns anything.
//
// The consequence to keep in mind: a false positive is INVISIBLE to the customer. They believe they have
// contacted us and nobody has. That is the strongest possible argument for the checks staying loose, and
// for logging every trip so a false positive can be found in the log rather than in a lost customer.

/** The field name. Plausible enough that a bot will want to fill it, absent from every real form. */
export const HONEYPOT_FIELD = 'company_website';

/** The hidden timestamp field: when the form was rendered, milliseconds since epoch. */
export const HONEYPOT_TIME_FIELD = 'form_loaded_at';

/** Anything faster than this did not come from a person typing. Low on purpose — see the header. */
export const MIN_FILL_MS = 3000;

/** An upper bound too: a page left open for a day and then submitted is more likely a replayed capture
 *  than a customer. Twelve hours is well past "I got distracted and came back after lunch". */
export const MAX_FILL_MS = 12 * 60 * 60 * 1000;

export type HoneypotVerdict =
  | { trapped: false }
  | { trapped: true; reason: 'filled' | 'too-fast' | 'too-old' };

/**
 * Judge a submission. Pure — takes the two field values and the current time, returns a verdict.
 *
 * `now` is injectable so the timing rules are testable without waiting or mocking a clock.
 */
export function checkHoneypot(
  fields: { [HONEYPOT_FIELD]?: unknown; [HONEYPOT_TIME_FIELD]?: unknown } | null | undefined,
  now: number = Date.now(),
): HoneypotVerdict {
  const bag = (fields ?? {}) as Record<string, unknown>;

  const pot = bag[HONEYPOT_FIELD];
  if (typeof pot === 'string' && pot.trim() !== '') {
    return { trapped: true, reason: 'filled' };
  }

  const rawTime = bag[HONEYPOT_TIME_FIELD];
  const loadedAt = typeof rawTime === 'string' ? Number(rawTime) : typeof rawTime === 'number' ? rawTime : NaN;

  // A MISSING OR UNREADABLE TIMESTAMP IS NOT A TRAP. This is the decision most likely to be got wrong,
  // and getting it wrong is expensive: the field is added by client JavaScript, so anyone whose script
  // failed to run — a strict privacy extension, a slow phone that timed out, an accessibility tool that
  // rebuilt the form — would be silently discarded while believing they had contacted us. The honeypot's
  // whole justification is that it never touches an honest customer.
  if (!Number.isFinite(loadedAt) || loadedAt <= 0) return { trapped: false };

  const elapsed = now - loadedAt;
  // A negative elapsed time means clock skew between the customer's device and our server, which is
  // common and meaningless. Not a trap.
  if (elapsed < 0) return { trapped: false };
  if (elapsed < MIN_FILL_MS) return { trapped: true, reason: 'too-fast' };
  if (elapsed > MAX_FILL_MS) return { trapped: true, reason: 'too-old' };

  return { trapped: false };
}

/**
 * Read the trap's two values out of a submitted form.
 *
 * NEEDED BECAUSE RENDERING THE INPUTS IS NOT ENOUGH. Every intake form here builds its request body from
 * React state (`JSON.stringify(formData)`, or a `FormData` assembled from `Object.entries(formData)`), not
 * from the DOM — so a hidden input that nothing reads is submitted by exactly nobody, and the trap would
 * have silently never fired. Taking the values from the form element at submit time is what connects the
 * two halves.
 *
 * Returns plain strings so the caller can spread them into either payload shape.
 */
export function honeypotValuesFrom(root: ParentNode | null | undefined): Record<string, string> {
  // Takes ANY container, not just an `HTMLFormElement`, and queries by name. The pricing calculator
  // submits from a BUTTON rather than a form, so it has no `e.currentTarget` and may have no enclosing
  // `<form>` at all — a form-only signature would have quietly returned nothing there, which is the same
  // silent gap this helper exists to close.
  if (!root || typeof (root as ParentNode).querySelector !== 'function') return {};
  const out: Record<string, string> = {};
  for (const field of [HONEYPOT_FIELD, HONEYPOT_TIME_FIELD]) {
    const el = root.querySelector<HTMLInputElement>(`input[name="${field}"]`);
    const value = el ? String(el.value ?? '') : '';
    // Only sent when it has something in it — an empty honeypot is the normal case and carrying an empty
    // string adds nothing. The timestamp is sent whenever it is present.
    if (value) out[field] = value;
  }
  return out;
}

/** The props a hidden honeypot input needs. Kept here so all four forms render an identical trap and a
 *  change to the field name cannot reach three of them. */
export function honeypotInputProps(): {
  name: string;
  tabIndex: number;
  autoComplete: string;
  'aria-hidden': 'true';
  style: { position: 'absolute'; left: string; width: string; height: string; opacity: number };
} {
  return {
    name: HONEYPOT_FIELD,
    // NOT `display: none` or `hidden`. The better bots skip anything obviously hidden, and some screen
    // readers announce a `display: none` field's label anyway. Off-screen with zero opacity is invisible
    // to a person, unremarkable to a script, and `aria-hidden` + `tabIndex: -1` keep it out of the
    // keyboard and screen-reader path entirely.
    tabIndex: -1,
    autoComplete: 'off',
    'aria-hidden': 'true',
    style: { position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 },
  };
}
