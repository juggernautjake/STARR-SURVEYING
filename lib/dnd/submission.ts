// lib/dnd/submission.ts — the character submission/approval policy (IG builder Slice 4).
//
// A player submits a finished character to the DM for approval. The one rule that must hold everywhere
// (route, UI, tests) is the vanilla-only gate: a campaign with `allow_custom = false` rejects a character
// that carries any CUSTOM content that isn't DM-granted. This module is the pure, deterministic decision;
// the route just persists the result and the UI just renders it.
import type { ProvenanceSummary, TaggedElement } from './provenance';

export type SubmissionStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export const SUBMISSION_STATUSES: SubmissionStatus[] = ['draft', 'submitted', 'approved', 'rejected'];

export function normalizeSubmissionStatus(v: unknown): SubmissionStatus {
  const s = String(v ?? '').trim().toLowerCase();
  return (SUBMISSION_STATUSES as string[]).includes(s) ? (s as SubmissionStatus) : 'draft';
}

export interface SubmissionCheck {
  allowed: boolean;
  /** Why it was blocked (present only when `allowed` is false). */
  reason?: string;
  /** The custom (non-DM-granted) elements that block submission in a vanilla-only campaign. */
  blocking: TaggedElement[];
}

/**
 * Can this character be submitted to a campaign with the given custom policy?
 * - `allowCustom = true` → always yes (custom content is permitted).
 * - `allowCustom = false` (vanilla-only) → only if there is no CUSTOM (non-DM-granted) content.
 * DM-granted content is always permitted, even in a vanilla-only campaign.
 */
export function evaluateSubmission(allowCustom: boolean, summary: ProvenanceSummary): SubmissionCheck {
  if (allowCustom || !summary.hasBlockingCustom) return { allowed: true, blocking: [] };
  const names = summary.blocking.map((b) => b.name).join(', ');
  return {
    allowed: false,
    reason: `This campaign is vanilla-only — it does not allow homebrew content. Remove or get the DM to grant these custom items before submitting: ${names}.`,
    blocking: summary.blocking,
  };
}
