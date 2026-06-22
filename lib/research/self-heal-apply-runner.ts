// lib/research/self-heal-apply-runner.ts
//
// Slice 4 of research-self-heal-slice-1-manual-sweep-2026-06-22.md.
//
// DB-touching half of the apply pathway. The pure scoring half lives
// in lib/research/self-heal-apply-evaluator.ts. This module wraps:
//   1. load pending proposals from research_adapter_change_proposals
//   2. score them via the pure evaluator (gated on confidence > 0)
//   3. for auto_apply outcomes: swap the adapter config + flip the
//      proposal status to 'applied'
//   4. for reject outcomes: flip the proposal status to 'rejected'
//
// Used by:
//   - POST /api/admin/research/self-heal/evaluate (admin-triggered)
//   - GET  /api/cron/research-self-heal (after a scheduled sweep)
//
// Both paths arrive here with already-authenticated callers; this
// helper trusts its inputs and does not re-check session.

import type { SupabaseClient } from '@supabase/supabase-js';
import { applyProposalToAdapter, type ApplyPolicy } from './apply-policy';
import {
  evaluateProposalsForApply,
  policyFromSettings,
  tallyEvaluations,
  type EvaluableProposal,
  type EvaluatedTally,
  type SelfHealSettingsRow,
} from './self-heal-apply-evaluator';

export interface ApplyRunnerResult {
  evaluated: number;
  applied: number;
  rejected: number;
  tally: EvaluatedTally;
  policy: ApplyPolicy;
}

interface ProposalRow {
  id: string;
  adapter_id: string;
  confidence: number;
  canary_test_passed: boolean | null;
  proposed_config: Record<string, unknown>;
  proposed_field_map: Record<string, unknown>;
  prior_config: Record<string, unknown>;
  prior_field_map: Record<string, unknown>;
}

interface AdapterRow {
  id: string;
  config: Record<string, unknown>;
  field_map: Record<string, unknown>;
}

export async function runApplyEvaluator(
  supabase: SupabaseClient,
  actorEmail: string,
): Promise<ApplyRunnerResult> {
  // 1. Resolve the active policy from the settings table — fall back
  //    to the safe defaults when the seed hasn't been applied yet.
  const { data: settingsRow } = await supabase
    .from('research_self_heal_settings')
    .select('autoapply_enabled, autoapply_confidence_threshold, reviewer_confidence_threshold, require_canary_pass')
    .eq('id', 'singleton')
    .maybeSingle();
  const policy = policyFromSettings(settingsRow as SelfHealSettingsRow | null);

  // 2. Load every currently-pending proposal.
  const { data: proposalsRaw } = await supabase
    .from('research_adapter_change_proposals')
    .select('id, adapter_id, confidence, canary_test_passed, proposed_config, proposed_field_map, prior_config, prior_field_map')
    .eq('status', 'proposed');
  const proposals = (proposalsRaw ?? []) as ProposalRow[];

  if (proposals.length === 0) {
    return {
      evaluated: 0,
      applied: 0,
      rejected: 0,
      tally: { auto_apply: 0, queue_for_review: 0, reject: 0, skipped_low_confidence: 0 },
      policy,
    };
  }

  // 3. Score via the pure evaluator.
  const evaluable: EvaluableProposal[] = proposals.map((p) => ({
    id: p.id,
    confidence: p.confidence,
    canary_test_passed: p.canary_test_passed,
  }));
  const scored = evaluateProposalsForApply(evaluable, policy);
  const proposalsById = new Map<string, ProposalRow>(proposals.map((p) => [p.id, p]));

  // 4. Apply / reject loop. Failures are swallowed so a single bad
  //    proposal can't take down the batch.
  let applied = 0;
  let rejected = 0;
  for (const e of scored) {
    const proposal = proposalsById.get(e.id);
    if (!proposal) continue;
    const nowIso = new Date().toISOString();

    if (e.decision.action === 'auto_apply') {
      const { data: adapterRaw } = await supabase
        .from('research_site_adapters')
        .select('id, config, field_map')
        .eq('id', proposal.adapter_id)
        .single();
      const adapter = adapterRaw as AdapterRow | null;
      if (!adapter) continue;

      const { next, snapshot_for_rollback } = applyProposalToAdapter(
        { config: adapter.config ?? {}, field_map: adapter.field_map ?? {} },
        {
          prior_config: proposal.prior_config ?? {},
          prior_field_map: proposal.prior_field_map ?? {},
          proposed_config: proposal.proposed_config ?? {},
          proposed_field_map: proposal.proposed_field_map ?? {},
        },
      );

      const { error: adapterErr } = await supabase
        .from('research_site_adapters')
        .update({
          config: next.config,
          field_map: next.field_map,
          updated_at: nowIso,
        })
        .eq('id', adapter.id);
      if (adapterErr) continue;

      await supabase
        .from('research_adapter_change_proposals')
        .update({
          prior_config: snapshot_for_rollback.config,
          prior_field_map: snapshot_for_rollback.field_map,
          status: 'applied',
          applied_at: nowIso,
          reviewed_by: actorEmail,
          reviewed_at: nowIso,
          review_notes: e.decision.rationale,
          updated_at: nowIso,
        })
        .eq('id', proposal.id);
      applied++;
    } else if (e.decision.action === 'reject') {
      await supabase
        .from('research_adapter_change_proposals')
        .update({
          status: 'rejected',
          reviewed_by: actorEmail,
          reviewed_at: nowIso,
          review_notes: e.decision.rationale,
          updated_at: nowIso,
        })
        .eq('id', proposal.id);
      rejected++;
    }
    // queue_for_review: no DB change.
  }

  const tally = tallyEvaluations(scored, proposals.length);
  return { evaluated: scored.length, applied, rejected, tally, policy };
}
