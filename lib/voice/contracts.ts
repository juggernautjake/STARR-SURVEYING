// lib/voice/contracts.ts — the agreement, as a template and a state machine.
//
// Andrew just finished his first paid contract. The most valuable thing this platform can give him is
// not a signature widget — it is a default agreement that already contains the clauses a first-year
// freelancer does not know to ask for, with the two that actually cause disputes (usage scope and
// revision limits) filled in from the job rather than left as prose.
//
// ── WHAT A "SIGNATURE" IS HERE ──────────────────────────────────────────────────────────────────
//
// A typed name, captured with a timestamp, an IP, a user agent, and a hash of the exact text on
// screen. Under ESIGN/UETA that is a valid electronic signature for a service agreement of this size,
// and the evidence bundle is the part that makes it hold up. The hash is the load-bearing piece: it
// is what lets Andrew prove, later, that the terms were not edited after the client agreed to them.
// `contractBodyIntact()` in tokens.ts is the check, and the signed view runs it on every render.
//
// This is not legal advice and the UI says so. It is a well-formed starting point that a lawyer can
// improve, which is strictly better than the alternative Andrew is otherwise choosing: nothing.

import { hashContractBody } from './tokens';
import { formatCents } from './money';

// The state machine lives in ./contract-status, which imports nothing. This module reaches
// node:crypto through ./tokens for the signature hash, and the studio's contract actions are a
// CLIENT component that needs `isEditable`. Re-exported so there is one definition.
export { canTransition, allowedTransitions, isEditable, type ContractStatus } from './contract-status';
// A re-export makes the name available to IMPORTERS, not to this module's own scope — `buildSignatureRecord`
// below returns a `ContractStatus`, so it needs the type imported as well as forwarded.
import type { ContractStatus } from './contract-status';

// ── Usage terms ──────────────────────────────────────────────────────────────────────────────────
//
// The single most common way a beginning voice actor loses money: quoting a session fee for a spot
// that then runs nationally for two years. Making usage an explicit, priced, named choice — rather
// than a sentence someone forgets to write — is the whole point of putting it in the schema.
//
// The scopes themselves live in `./usage`, which imports nothing. This module imports `node:crypto`
// (via ./tokens) for the signature hash, and the contact form — a CLIENT component — needs the scope
// list for a dropdown. Re-exporting keeps one definition while keeping `node:crypto` out of the
// browser bundle. See the header of lib/voice/usage.ts for what broke.

export { USAGE_SCOPES, usageScope, type UsageScopeId } from './usage';
import { usageScope } from './usage';

// ── Templates ────────────────────────────────────────────────────────────────────────────────────

export interface ContractTemplateInput {
  artistName: string;
  businessName: string;
  clientName: string;
  clientCompany?: string | null;
  projectTitle: string;
  feeCents: number;
  usageScopeId: string;
  usageTermMonths?: number | null;
  deliveryDate?: string | null;
  revisionsIncluded: number;
  depositPct?: number;
  extraTerms?: string | null;
}

export const CONTRACT_TEMPLATES = [
  { id: 'voiceover', label: 'Voice-over service agreement', blurb: 'Recording, delivery, usage rights and revisions for a voice job.' },
  { id: 'coaching', label: 'Vocal coaching agreement', blurb: 'Lesson package, scheduling, cancellation and payment terms.' },
] as const;

export type ContractTemplateId = (typeof CONTRACT_TEMPLATES)[number]['id'];

/**
 * Builds the voice-over agreement body as markdown.
 *
 * Every clause here exists because of a specific way freelance voice work goes wrong:
 * cancellation (the session that evaporates the day before), revision scope (the client who
 * re-writes the script and calls it a fix), usage (above), late payment (the invoice that ages
 * ninety days because nothing said it could not), and credit/ownership (who owns the recording when,
 * which is *on payment*, not on delivery — that ordering is the leverage).
 */
export function buildVoiceoverContract(input: ContractTemplateInput): string {
  const scope = usageScope(input.usageScopeId);
  const term = input.usageTermMonths
    ? `${input.usageTermMonths} month${input.usageTermMonths === 1 ? '' : 's'} from first use`
    : 'the term stated above';
  const deposit = Math.max(0, Math.min(100, input.depositPct ?? 50));
  const depositCents = Math.round((input.feeCents * deposit) / 100);
  const client = input.clientCompany ? `${input.clientCompany} ("Client")` : `${input.clientName} ("Client")`;

  return `# Voice-Over Service Agreement

**Between:** ${input.businessName}, represented by ${input.artistName} ("Artist")
**And:** ${client}
**Project:** ${input.projectTitle}

---

## 1. Services

The Artist will record, edit and deliver professional voice-over audio for the project named above,
in accordance with the script and direction supplied by the Client.

Audio is delivered as broadcast-ready WAV (48 kHz / 24-bit) unless another format is agreed in
writing. Delivery is by download link${input.deliveryDate ? `, on or before **${input.deliveryDate}**` : ', on a schedule agreed at booking'}.

## 2. Fee and payment

The total fee for the services described above is **${formatCents(input.feeCents)}**.

${deposit > 0
    ? `A deposit of ${deposit}% (**${formatCents(depositCents)}**) is payable before recording begins. The balance of **${formatCents(input.feeCents - depositCents)}** is due on delivery.`
    : 'The full fee is due on delivery.'}

Invoices are payable within the terms stated on the invoice. Amounts unpaid after thirty (30) days may
accrue interest at 1.5% per month, and the Artist may suspend further work until the account is
current.

## 3. Usage rights

The Client is granted the right to use the delivered audio for: **${scope.label}** — ${scope.detail}

This licence runs for ${term}, and covers the project named in this agreement only.

Any use beyond this scope — a different medium, a wider territory, a longer term, or a different
project — requires a further licence and a further fee, to be agreed in writing before that use
begins.

## 4. Ownership

The Artist retains ownership of the recorded audio and of the performance until the fee is paid in
full. **On receipt of payment in full**, the Client receives the licence described in section 3. The
Artist retains ownership of the underlying performance and all rights not expressly granted here,
including the right to use short excerpts in a demo reel or portfolio, unless the parties agree
otherwise in writing.

## 5. Revisions

**${input.revisionsIncluded}** round${input.revisionsIncluded === 1 ? '' : 's'} of revision ${input.revisionsIncluded === 1 ? 'is' : 'are'} included, where a revision corrects
a performance issue — read, pace, emphasis, pronunciation or a technical fault in the audio.

Changes to the script itself, to direction given after delivery, or additional rounds beyond those
included, are new work and are quoted separately.

## 6. Cancellation

If the Client cancels after booking but before recording begins, the deposit is retained.
If the Client cancels after recording has begun, the full fee is payable.
If the Artist cannot deliver, any amounts paid are refunded in full.

## 7. Client responsibilities

The Client will supply a final script, pronunciation guidance for any unusual names or terms, and any
required reference audio, before the session. Delays caused by outstanding materials move the delivery
date accordingly.

## 8. Confidentiality

Each party will keep the other's non-public material confidential. The Artist will not disclose the
script, the product or the campaign before its public release.

## 9. Limitation of liability

The Artist's total liability under this agreement is limited to the fee paid. Neither party is liable
for indirect or consequential loss.

## 10. General

This agreement is governed by the laws of the State of Texas. It is the entire agreement between the
parties on this subject and replaces any prior discussion. It may be amended only in writing, signed
by both parties.
${input.extraTerms ? `\n## 11. Additional terms\n\n${input.extraTerms}\n` : ''}
---

By typing their name below, the Client agrees to the terms of this agreement and intends that typed
name to be their signature.
`;
}

/** The coaching equivalent. Shorter, because the risks are different: no-shows and unused packages. */
export function buildCoachingContract(input: ContractTemplateInput & { sessionCount?: number; sessionMinutes?: number; expiryMonths?: number }): string {
  const sessions = input.sessionCount ?? 1;
  const minutes = input.sessionMinutes ?? 45;
  const expiry = input.expiryMonths ?? 6;

  return `# Vocal Coaching Agreement

**Between:** ${input.businessName}, represented by ${input.artistName} ("Coach")
**And:** ${input.clientName} ("Student")
**Package:** ${input.projectTitle}

---

## 1. What is included

**${sessions}** coaching session${sessions === 1 ? '' : 's'} of **${minutes} minutes** each, delivered online or in
person as agreed. Each session includes a written summary and practice assignments.

## 2. Fee

The fee for this package is **${formatCents(input.feeCents)}**, payable in advance of the first session
unless otherwise agreed in writing.

## 3. Scheduling and cancellation

Sessions are booked by agreement. A session cancelled with **more than 24 hours' notice** is
rescheduled at no charge. A session cancelled with less notice, or missed, is deducted from the
package.

The Coach will offer a free reschedule for any session the Coach cannot attend.

## 4. Expiry

Sessions in this package expire **${expiry} months** after purchase. This is to keep progress
continuous, not to withhold what has been paid for — the Coach will extend on request where life
reasonably intervenes.

## 5. What coaching is and is not

Vocal coaching develops technique, musicianship and performance. It is **not** medical care. If the
Student experiences pain, hoarseness lasting more than two weeks, or any loss of voice, the Coach will
recommend they see an ENT or a speech-language pathologist, and may pause lessons until they have.

## 6. Recordings

Lessons may be recorded for the Student's practice. The Coach will not publish any recording, or the
Student's name, without separate written permission.

## 7. General

This agreement is governed by the laws of the State of Texas and may be amended only in writing.
${input.extraTerms ? `\n## 8. Additional terms\n\n${input.extraTerms}\n` : ''}
---

By typing their name below, the Student agrees to the terms of this agreement and intends that typed
name to be their signature.
`;
}

export function buildContract(templateId: string, input: ContractTemplateInput & Record<string, unknown>): string {
  return templateId === 'coaching' ? buildCoachingContract(input) : buildVoiceoverContract(input);
}

// ── Signing ──────────────────────────────────────────────────────────────────────────────────────

export interface SignatureInput {
  typedName: string;
  expectedName: string;
  agreed: boolean;
}

export interface SignatureCheck {
  ok: boolean;
  error: string | null;
}

/**
 * Validates a typed-name signature before it is written.
 *
 * The name is compared loosely — case-insensitive, punctuation and extra spaces ignored — because
 * "Bob Smith" signing as "bob smith" or "Bob  Smith" is the same person, and rejecting them produces
 * a support email instead of a signed contract. What is NOT loose is the requirement that the name
 * resemble the party named in the agreement at all: a blank or one-character signature, or a
 * completely different name, is refused, because that is the case where the wrong person is signing.
 */
export function checkSignature(input: SignatureInput): SignatureCheck {
  const typed = normalizeName(input.typedName);
  const expected = normalizeName(input.expectedName);

  if (!input.agreed) {
    return { ok: false, error: 'Tick the box to confirm you agree to the terms.' };
  }
  if (typed.length < 2) {
    return { ok: false, error: 'Type your full name to sign.' };
  }
  if (expected && typed !== expected) {
    // Allow a middle name, a suffix, or a shortened first name — the surname must match.
    const typedParts = typed.split(' ').filter(Boolean);
    const expectedParts = expected.split(' ').filter(Boolean);
    const typedLast = typedParts[typedParts.length - 1];
    const expectedLast = expectedParts[expectedParts.length - 1];
    if (typedLast !== expectedLast) {
      return {
        ok: false,
        error: `This agreement names ${input.expectedName}. If you are signing on their behalf, contact Andrew so the agreement can be reissued in your name.`,
      };
    }
  }
  return { ok: true, error: null };
}

function normalizeName(name: string | null | undefined): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[.,'’-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SignatureRecord {
  signer_name: string;
  signer_email: string | null;
  signed_at: string;
  signature_ip: string | null;
  signature_user_agent: string | null;
  body_hash: string;
  status: ContractStatus;
}

/** Builds the row patch that records a signature. */
export function buildSignatureRecord(args: {
  typedName: string;
  email?: string | null;
  body: string;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
}): SignatureRecord {
  return {
    signer_name: args.typedName.trim().slice(0, 200),
    signer_email: args.email ? args.email.trim().toLowerCase().slice(0, 200) : null,
    signed_at: (args.now ?? new Date()).toISOString(),
    // Truncated, because these are evidence fields and not a place to store an unbounded header from
    // an untrusted client.
    signature_ip: args.ip ? String(args.ip).slice(0, 60) : null,
    signature_user_agent: args.userAgent ? String(args.userAgent).slice(0, 400) : null,
    body_hash: hashContractBody(args.body),
    status: 'signed',
  };
}
