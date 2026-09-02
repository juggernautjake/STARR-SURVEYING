// worker/src/research/purchase-gate.ts — the switch that spends money, actually consulted (plan C3).
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// `research_projects.allow_paid_documents` has a column, a migration (seed 620), a UI control, a
// helper module (`lib/research/paid-documents.ts`) and its own test file. `run-settings.ts` adds a
// per-run override, a normaliser, and `mayRunBuyDocuments()` to decide from them.
//
// And on 2026-09-01, `mayRunBuyDocuments` was called from exactly one place: its own definition.
//
//     $ rg 'mayRunBuyDocuments|mayBuyDocuments' worker/src
//     worker/src/research/run-settings.ts:131:export function mayRunBuyDocuments(...)
//
// The app's lite pipeline read the column. The worker — the process that holds the TexasFile
// credentials and actually buys pages — read nothing. So the owner's requirement, stated plainly as
// "changing the settings of the run, such as whether or not it uses texasfile", was a switch wired
// to a light bulb in a different building. Turning it off changed a value in Postgres and did not
// change what the run spent.
//
// This module is what the three spend sites consult. It is separate from `run-settings.ts` because
// that file answers "what was this run configured with" and this one answers "may this specific
// purchase happen", and the second question needs to know where the answer came from.
//
// ── WHY AN UNREADABLE ANSWER MEANS NO ───────────────────────────────────────────────────────────
//
// The two failure directions are not symmetric.
//
//   Deny when we should have allowed  → a thinner run, recorded as such, fixed by re-running.
//                                       Recoverable, visible, costs nothing.
//   Allow when we should have denied  → money spent against an operator who explicitly said not to.
//                                       Irreversible. TexasFile does not refund.
//
// So a settings source that cannot be read is NOT treated as "no objection". It is treated as "we
// could not confirm this run is allowed to spend", the purchase is skipped, and the reason says so
// in words a person can act on — rather than the run quietly buying documents and the operator
// discovering it on an invoice.
//
// This is the OPPOSITE of the asymmetry in `document-identity.ts`, and deliberately so. There, an
// uncertain identity match must not skip a purchase, because failing to buy a document we do not
// have loses research. Here, an uncertain PERMISSION must not allow one, because spending against
// an instruction loses money and trust. Uncertainty resolves toward the recoverable outcome in both
// cases; the recoverable outcome is just a different direction in each.

import { mayRunBuyDocuments, type RunSettings } from './run-settings.js';

/** Where the effective settings came from. Reported, because "allowed by default" and "allowed
 *  because the operator said so" are different facts about the same run. */
export type SettingsSource =
  /** The live pipeline object — what THIS run was told when it started. */
  | 'live-run'
  /** The `research_runs.settings` column — the durable copy, for a purchase that happens after the
   *  in-memory pipeline is gone. Phase 9 is a separate HTTP call, so this is the common case. */
  | 'run-record'
  /** `research_projects.allow_paid_documents` — the project's default, when the run recorded none. */
  | 'project-default'
  /** Nothing could be read. Not the same as "nothing objected". */
  | 'unreadable';

export interface EffectiveSettings {
  settings: RunSettings;
  source: SettingsSource;
}

/**
 * The settings that govern a purchase, and where they came from.
 *
 * Precedence is most-specific-first, which is the whole point of a per-run override: a re-run can
 * turn paid documents off for one attempt without changing what the project means in general.
 *
 * Every argument is already-fetched data. This function does no I/O so it can be tested without a
 * database, and so the call sites keep their own error handling — a caller that could not reach
 * Supabase passes `undefined` and gets `unreadable`, which is a decision, not an exception.
 */
export function resolveEffectiveSettings(
  liveRunSettings: RunSettings | null | undefined,
  runRecordSettings: Record<string, unknown> | null | undefined,
  projectAllowPaidDocuments: boolean | null | undefined,
): EffectiveSettings {
  // `hasAny` and not truthiness: `{ allowPaidDocuments: false }` is a real and important setting,
  // and an empty `{}` is what the column defaults to, which carries no instruction at all.
  if (liveRunSettings && Object.keys(liveRunSettings).length > 0) {
    return { settings: liveRunSettings, source: 'live-run' };
  }

  if (runRecordSettings && Object.keys(runRecordSettings).length > 0) {
    return { settings: coerceRunSettings(runRecordSettings), source: 'run-record' };
  }

  if (typeof projectAllowPaidDocuments === 'boolean') {
    return { settings: { allowPaidDocuments: projectAllowPaidDocuments }, source: 'project-default' };
  }

  return { settings: {}, source: 'unreadable' };
}

/** Read a `research_runs.settings` jsonb blob back into the typed shape.
 *
 *  Deliberately permissive about what it ignores and strict about what it accepts: the column is
 *  jsonb, so anything could be in there, and a malformed value must not become a configuration. */
function coerceRunSettings(raw: Record<string, unknown>): RunSettings {
  const out: RunSettings = {};
  if (typeof raw.allowPaidDocuments === 'boolean') out.allowPaidDocuments = raw.allowPaidDocuments;
  const minutes = Number(raw.maxResearchTimeMinutes);
  if (Number.isFinite(minutes) && minutes > 0) out.maxResearchTimeMinutes = minutes;
  const usd = Number(raw.maxCostUsd);
  if (Number.isFinite(usd) && usd >= 0) out.maxCostUsd = usd;
  if (raw.mode === 'free' || raw.mode === 'paid') out.mode = raw.mode;
  if (typeof raw.refreshImagery === 'boolean') out.refreshImagery = raw.refreshImagery;
  return out;
}

/**
 * The status written to `research_document_purchases` for a document that was NOT bought.
 *
 * A machine-readable companion to `reason`, and the reason it exists is B3: the app's analyze route
 * counts these rows to build the "why did this run buy nothing?" notice, and nothing in the product
 * had ever written one. `research_document_purchases` held 0 rows, so the count was always 0, so
 * `paidDocumentsNotice()` — which returns null at a count of zero — could never return a sentence.
 * A whole explanation path, present at both ends and joined in the middle by nothing.
 *
 * `permission_unreadable` is deliberately its own value rather than being folded into
 * `paid_disabled`. "You told us not to spend" and "we could not find out whether you had" lead to
 * different actions: the first is finished, the second is worth re-running once the setting reads.
 */
export type PurchaseSkipStatus = 'paid_disabled' | 'permission_unreadable';

export interface PurchaseDecision {
  allowed: boolean;
  /** A sentence for the log, the run record and the report. Never a bare boolean's worth of
   *  information: "skipped by choice" and "the county has no such record" must never read alike. */
  reason: string;
  /** What to record against each document this decision skips. Null when the run may buy. */
  skipStatus: PurchaseSkipStatus | null;
  source: SettingsSource;
  settings: RunSettings;
}

/**
 * May this run buy documents?
 *
 * The single question every spend site asks. There are three of them in the worker — Phase 9
 * (`POST /research/purchase`), Phase 15 (`POST /research/purchase/automated`) and the document
 * access orchestrator's paid tier — and before this they asked nobody.
 */
export function decidePurchase(effective: EffectiveSettings): PurchaseDecision {
  if (effective.source === 'unreadable') {
    return {
      allowed: false,
      reason:
        'This run could not be confirmed as allowed to spend: neither its own settings nor the ' +
        "project's paid-documents switch could be read. Nothing was purchased. This is a deliberate " +
        'refusal, not a finding about the county — re-run once the setting can be read.',
      skipStatus: 'permission_unreadable',
      source: effective.source,
      settings: effective.settings,
    };
  }

  const verdict = mayRunBuyDocuments(effective.settings);
  return {
    allowed: verdict.allowed,
    reason: verdict.reason,
    // Every remaining refusal is a deliberate instruction — the switch off, a $0.00 ceiling, or free
    // mode. All three are the operator saying no, and they are one status because the operator's
    // next action is the same for all three: change the setting and re-run.
    skipStatus: verdict.allowed ? null : 'paid_disabled',
    source: effective.source,
    settings: effective.settings,
  };
}

/**
 * The sentence a report puts next to a document that was not bought.
 *
 * Exists so the distinction survives all the way to the page an operator reads. "Paid documents
 * were switched off for this run" and "the county holds no such record" describe completely
 * different states of the world, and a report that renders them identically is worse than one that
 * says nothing, because it invites a conclusion about the property that the run never tested.
 */
export function describeSkippedPurchase(decision: PurchaseDecision, documentCount: number): string {
  if (decision.allowed) return '';
  const n = documentCount === 1 ? '1 document' : `${documentCount} documents`;
  return (
    `${n} that could only be obtained from a paid vendor ${documentCount === 1 ? 'was' : 'were'} ` +
    `NOT retrieved. ${decision.reason} This says nothing about whether those records exist — ` +
    'they were not looked for at a source that charges.'
  );
}
