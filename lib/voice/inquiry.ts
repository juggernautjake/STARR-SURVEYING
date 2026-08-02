// lib/voice/inquiry.ts — validating the one form that matters.
//
// The quote-request form is the entire commercial purpose of the public site. Every other page exists
// to get someone to fill it in. Two consequences shape this file:
//
//   1. It must be HARD TO FAIL. Validation rejects only what genuinely cannot be acted on — a missing
//      name, a malformed email. A form that refuses a phone number because of its punctuation loses a
//      job over a hyphen.
//   2. It must be hard to abuse. A public form that writes to a database and sends a notification is
//      a spam target from the day it is indexed.
//
// Pure functions, no I/O, so the rules are testable and identical on the client (instant feedback)
// and on the server (the copy that actually decides).

export const INQUIRY_INTENTS = ['voiceover', 'coaching', 'booking', 'other'] as const;
export type InquiryIntent = (typeof INQUIRY_INTENTS)[number];

export const PROJECT_TYPES = [
  { id: 'commercial', label: 'Commercial / advert' },
  { id: 'telephony', label: 'Phone system, IVR or on-hold' },
  { id: 'elearning', label: 'E-learning or training' },
  { id: 'narration', label: 'Narration / explainer' },
  { id: 'character', label: 'Character, game or animation' },
  { id: 'audiobook', label: 'Audiobook' },
  { id: 'singing', label: 'Singing / vocal recording' },
  { id: 'other', label: 'Something else' },
] as const;

export const EXPERIENCE_LEVELS = [
  { id: 'none', label: 'Complete beginner' },
  { id: 'some', label: 'Some singing experience' },
  { id: 'trained', label: 'Formally trained' },
  { id: 'professional', label: 'Working performer' },
] as const;

export interface InquiryInput {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  intent?: string;
  projectType?: string;
  scriptWords?: number | string | null;
  budgetCents?: number | null;
  deadline?: string | null;
  usageTerms?: string;
  experienceLevel?: string;
  coachingGoals?: string;
  message?: string;
  referralSource?: string;
  /** Hidden field, must stay empty. See below. */
  website?: string;
  /** Client timestamp of when the form was first rendered, ms. */
  renderedAt?: number;
}

export interface InquiryValidation {
  ok: boolean;
  /** Field-keyed messages for inline display. */
  errors: Record<string, string>;
  /** True when the submission looks automated. Accepted at the HTTP layer, stored as spam. */
  suspectedSpam: boolean;
  spamReason: string | null;
}

// Deliberately permissive. This rejects "not an address at all", not "an address I do not recognise" —
// a stricter regex costs real inquiries from unusual but valid domains, and the only real test of an
// address is whether the reply arrives.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Milliseconds a human plausibly needs to fill this form in.
 *
 *  Set low on purpose. A determined bot waits; the goal is only to catch the ones that post
 *  instantly, and the cost of a false positive here is a real client silently filed as spam. */
const MIN_FILL_MS = 2500;

export function validateInquiry(input: InquiryInput): InquiryValidation {
  const errors: Record<string, string> = {};

  const name = String(input.name ?? '').trim();
  if (name.length < 2) errors.name = 'Please tell me your name.';
  if (name.length > 120) errors.name = 'That name is too long.';

  const email = String(input.email ?? '').trim();
  if (!email) errors.email = 'I need an email address to reply to.';
  else if (!EMAIL_RE.test(email)) errors.email = 'That does not look like an email address.';
  else if (email.length > 200) errors.email = 'That email address is too long.';

  const intent = String(input.intent ?? 'voiceover');
  if (!(INQUIRY_INTENTS as readonly string[]).includes(intent)) {
    errors.intent = 'Choose what you are getting in touch about.';
  }

  const message = String(input.message ?? '').trim();
  // A message is required for "other" — that is the branch with no structured fields, so with an
  // empty message there is literally nothing to respond to.
  if (intent === 'other' && message.length < 10) {
    errors.message = 'Tell me a little about what you need.';
  }
  if (message.length > 5000) errors.message = 'That message is longer than this form can take — email it instead.';

  const deadline = String(input.deadline ?? '').trim();
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    errors.deadline = 'Use a date like 2026-09-01.';
  }

  // ── Spam heuristics ──
  // Both are silent. A bot told which check it failed is a bot that passes next time, and a human
  // caught by a heuristic must never see an accusation — their submission is stored, flagged, and
  // still visible to Andrew in a "possible spam" filter he can rescue it from.
  let suspectedSpam = false;
  let spamReason: string | null = null;

  // Honeypot: a field hidden from humans by CSS, filled in by anything that parses the form.
  if (String(input.website ?? '').trim() !== '') {
    suspectedSpam = true;
    spamReason = 'honeypot';
  }

  if (!suspectedSpam && typeof input.renderedAt === 'number' && input.renderedAt > 0) {
    const elapsed = Date.now() - input.renderedAt;
    // Negative elapsed means a clock skew or a forged value, not a fast human.
    if (elapsed >= 0 && elapsed < MIN_FILL_MS) {
      suspectedSpam = true;
      spamReason = 'submitted too fast';
    }
  }

  if (!suspectedSpam && countLinks(message) >= 4) {
    suspectedSpam = true;
    spamReason = 'link-heavy message';
  }

  return { ok: Object.keys(errors).length === 0, errors, suspectedSpam, spamReason };
}

function countLinks(text: string): number {
  return (text.match(/https?:\/\//gi) ?? []).length;
}

/** Normalises validated input into the shape `va_inquiries` expects. */
export function toInquiryRow(input: InquiryInput, suspectedSpam: boolean): Record<string, unknown> {
  const intent = (INQUIRY_INTENTS as readonly string[]).includes(String(input.intent))
    ? String(input.intent)
    : 'voiceover';

  const words = typeof input.scriptWords === 'string'
    ? parseInt(input.scriptWords.replace(/[^0-9]/g, ''), 10)
    : input.scriptWords;

  return {
    name: String(input.name ?? '').trim().slice(0, 120),
    email: String(input.email ?? '').trim().toLowerCase().slice(0, 200),
    phone: emptyToNull(input.phone, 40),
    company: emptyToNull(input.company, 160),
    intent,
    project_type: emptyToNull(input.projectType, 40),
    script_words: Number.isFinite(words as number) && (words as number) > 0 ? Math.round(words as number) : null,
    budget_cents: Number.isFinite(input.budgetCents as number) ? Math.max(0, Math.round(input.budgetCents as number)) : null,
    deadline: emptyToNull(input.deadline, 10),
    usage_terms: emptyToNull(input.usageTerms, 500),
    experience_level: emptyToNull(input.experienceLevel, 40),
    coaching_goals: emptyToNull(input.coachingGoals, 2000),
    message: emptyToNull(input.message, 5000),
    referral_source: emptyToNull(input.referralSource, 200),
    status: suspectedSpam ? 'spam' : 'new',
  };
}

function emptyToNull(value: unknown, max: number): string | null {
  const v = String(value ?? '').trim();
  if (!v) return null;
  return v.slice(0, max);
}

/**
 * A rough quote range for a voice-over job, in cents.
 *
 * Shown on the contact form as live feedback while someone fills it in — "roughly $180–$260 for this"
 * — because the single biggest reason a small-business inquiry goes cold is that the client had no
 * idea what to expect and was afraid to ask.
 *
 * The model is the one the industry actually uses: a session-fee floor plus a per-word rate, with a
 * usage multiplier on top. Numbers are set for a working-but-early voice actor, which is what Andrew
 * is, and every one of them is editable from the studio — this function only encodes the SHAPE of the
 * pricing, never the rate card itself.
 */
export interface QuoteRates {
  sessionFloorCents: number;
  perWordCents: number;
  usageMultipliers: Record<string, number>;
  rushMultiplier: number;
  /** Half-width of the quoted range, as a percentage. 20 → ±20%. */
  spreadPct: number;
}

export const DEFAULT_QUOTE_RATES: QuoteRates = {
  sessionFloorCents: 15000,
  perWordCents: 25,
  usageMultipliers: {
    internal: 1,
    web: 1.25,
    telephony: 1.15,
    regional: 1.75,
    national: 3,
  },
  rushMultiplier: 1.35,
  spreadPct: 20,
};

export interface QuoteEstimate {
  lowCents: number;
  highCents: number;
  basis: string;
}

export function estimateQuote(
  input: { scriptWords?: number | null; usage?: string; rush?: boolean; projectType?: string },
  rates: QuoteRates = DEFAULT_QUOTE_RATES,
): QuoteEstimate | null {
  const words = Number(input.scriptWords ?? 0);
  // Below a hundred words the per-word component is noise and the answer is just the session floor.
  // Returning null instead of a fake range keeps the UI honest: no words entered, no estimate shown.
  if (!Number.isFinite(words) || words <= 0) return null;

  const multiplier = rates.usageMultipliers[input.usage ?? 'web'] ?? rates.usageMultipliers.web ?? 1;
  const base = Math.max(rates.sessionFloorCents, Math.round(words * rates.perWordCents));
  let mid = Math.round(base * multiplier);
  if (input.rush) mid = Math.round(mid * rates.rushMultiplier);

  const spread = Math.max(0, Math.min(90, rates.spreadPct)) / 100;
  return {
    lowCents: roundToNearest(Math.round(mid * (1 - spread)), 500),
    highCents: roundToNearest(Math.round(mid * (1 + spread)), 500),
    basis: `${words.toLocaleString()} words${input.rush ? ', rush turnaround' : ''}`,
  };
}

/** Rounds to the nearest `step` cents so a quote reads as a price ($225) not a computation ($223.75). */
function roundToNearest(cents: number, step: number): number {
  return Math.round(cents / step) * step;
}
