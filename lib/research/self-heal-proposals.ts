// lib/research/self-heal-proposals.ts
//
// Slice 3 of research-self-heal-slice-1-manual-sweep-2026-06-22.md —
// the bridge between "a sweep detected a broken adapter" and "a row
// lands in research_adapter_change_proposals so a human can triage."
//
// What this layer does today (slice 3):
//   - When a sweep / cron probe classifies an adapter as 'broken' or
//     'degraded with fingerprint mismatch', insert a proposal row with
//     status='proposed', confidence=0, and a rationale that captures
//     what we detected.
//   - The proposal carries the prior adapter config so an approved /
//     applied proposal can be reverted via apply-policy.rollbackProposal.
//   - Future slices (4+) layer the actual AI repair generator on top:
//     given the live page + the canary, produce a real
//     proposed_config / proposed_field_map + confidence > 0 and run
//     the canary re-test. The `apply-policy.decideApplyAction` helper
//     already routes high-confidence + canary-passing proposals into
//     auto-apply (gated on autoapply_enabled).
//
// Pure description / shape helpers live here. The DB write happens at
// the route layer.

import type { FingerprintDiff } from './dom-fingerprint';

import type { SweepStatus } from './self-heal-sweep';

export interface BreakageProposalInput {
  adapter_id: string;
  health_check_id: string | null;
  status: SweepStatus;
  http_status: number | null;
  fingerprint_match: boolean | null;
  duration_ms: number | null;
  /** Plain-text per-probe summary already produced by describeProbe. */
  probe_summary: string;
  /** Current adapter config snapshot — captured before any proposed
   *  edit so the proposal is reversible per §9.5. */
  prior_config: Record<string, unknown>;
  prior_field_map: Record<string, unknown>;
  /** R10 — the structural before/after, when a canary baseline existed to compare against. Null
   *  when there is no baseline yet, which is a different thing from "nothing changed". */
  fingerprint_diff?: FingerprintDiff | null;
}

export interface BreakageProposalRow {
  adapter_id: string;
  health_check_id: string | null;
  prior_config: Record<string, unknown>;
  prior_field_map: Record<string, unknown>;
  /** Empty in slice 3 — populated when the AI repair generator lands. */
  proposed_config: Record<string, unknown>;
  proposed_field_map: Record<string, unknown>;
  diff: Record<string, unknown>;
  rationale: string;
  /** 0 until the AI repair generator produces a real fix; the apply
   *  policy treats 0 as "below reviewer threshold" → status stays
   *  'proposed' for human triage but never auto-applies. */
  confidence: number;
  canary_test_passed: boolean | null;
  canary_test_summary: string | null;
  status: 'proposed';
}

/** Pure. Decide whether a probe outcome warrants writing a proposal
 *  row. Today: broken always; degraded only when the fingerprint
 *  mismatch signal flips. The other statuses are noise we don't
 *  surface in the triage queue. */
export function shouldProposeRepair(input: {
  status: SweepStatus;
  fingerprint_match: boolean | null;
}): boolean {
  if (input.status === 'broken') return true;
  if (input.status === 'degraded' && input.fingerprint_match === false) return true;
  return false;
}

/** Pure. Build the proposal row payload from a probe outcome. The
 *  caller inserts this row into research_adapter_change_proposals. */
export function buildBreakageProposal(input: BreakageProposalInput): BreakageProposalRow {
  const detected: string[] = [];
  if (input.status === 'broken') {
    detected.push(`Site returned ${input.http_status ?? 'an error'}.`);
  }
  if (input.fingerprint_match === false) {
    // R10 — name what changed, when the sweep was able to work it out.
    //
    // "No longer matches our baseline fingerprint" is true of a renamed wrapper div and of a search
    // form replaced by a captcha wall, and a reviewer cannot tell those apart without opening the
    // site by hand — which is the whole cost this queue exists to remove. `diffFingerprints` had
    // been written for exactly this and had no callers anywhere in the repo.
    const d = input.fingerprint_diff;
    if (d) {
      const pct = Math.round(d.similarity * 100);
      const bits = [`Live page structure changed (${pct}% similar to baseline, ${d.severity}).`];
      if (d.removed.length > 0) bits.push(`Gone: ${d.removed.slice(0, 6).join(', ')}${d.removed.length > 6 ? ` +${d.removed.length - 6} more` : ''}.`);
      if (d.added.length > 0) bits.push(`New: ${d.added.slice(0, 6).join(', ')}${d.added.length > 6 ? ` +${d.added.length - 6} more` : ''}.`);
      detected.push(bits.join(' '));
    } else {
      detected.push('Live page structure no longer matches our baseline fingerprint.');
    }
  }
  if (input.status === 'error') {
    detected.push('Network probe failed.');
  }
  const rationale = [
    detected.length > 0
      ? detected.join(' ')
      : 'Probe flagged a possible breakage.',
    input.probe_summary,
    'Slice 3 records this proposal automatically when a sweep flags broken or fingerprint-mismatch. No automatic fix is proposed yet — investigate the live page and either approve (acknowledge breakage) or reject (false alarm) from /admin/research/self-heal/proposals.',
  ].join(' ');

  return {
    adapter_id: input.adapter_id,
    health_check_id: input.health_check_id,
    prior_config: input.prior_config,
    prior_field_map: input.prior_field_map,
    proposed_config: {},
    proposed_field_map: {},
    diff: {
      detected,
      probe: {
        status: input.status,
        http_status: input.http_status,
        fingerprint_match: input.fingerprint_match,
        duration_ms: input.duration_ms,
      },
      // Kept structured as well as prose so a later UI can render the token lists directly rather
      // than re-parsing the sentence above.
      fingerprint: input.fingerprint_diff ?? null,
    },
    rationale,
    confidence: 0,
    canary_test_passed: null,
    canary_test_summary: null,
    status: 'proposed',
  };
}

/** Pure. One-line summary for the review-queue UI. */
export function describeProposal(row: {
  rationale: string;
  diff: Record<string, unknown> | null;
}): string {
  const detected = (row.diff && Array.isArray((row.diff as { detected?: unknown }).detected))
    ? ((row.diff as { detected: string[] }).detected).join(' ')
    : null;
  return detected || row.rationale.split('. ')[0] + '.';
}
