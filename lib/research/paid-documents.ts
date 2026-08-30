// lib/research/paid-documents.ts — may this run buy documents, and if not, why not?
//
// ── WHY A SWITCH AT ALL ─────────────────────────────────────────────────────────────────────────
//
// Texas has no statewide deed index. `getClerkSystem()` routes each county to the vendor that county
// actually uses, and where no adapter exists it falls through to TexasFile, which charges per
// document. So the same six clicks cost nothing in Bell County and real money in McLennan.
//
// Until now the only control was `run-budget.ts`, which caps a run at $2.00 and 20 paid pages. That
// is a good backstop and it stops you AFTER the money is committed. This stops you before, at the
// moment you have the most context: is this particular property worth paying for?
//
// ── THE HALF THAT MATTERS MORE THAN THE SWITCH ──────────────────────────────────────────────────
//
// A run with purchasing disabled finds fewer documents. If the report renders that the same way as a
// run that searched and found nothing, the switch has made the system less trustworthy rather than
// cheaper — the reader cannot tell "this property has no recorded deed" from "you told me not to
// look behind the paywall".
//
// That is the same failure this codebase has hit repeatedly and under several names: a Places
// `REQUEST_DENIED` rendering identically to `ZERO_RESULTS`; a worker warning about a key it does not
// read; four notification paths reporting success for messages they never sent. The pattern is
// always a system that cannot say which of two opposite things happened.
//
// So the decision carries its REASON, every skipped document records which reason applied, and the
// report says so in words. `reasonForReader` is not decoration — it is the point.

/** Why a document was not bought. `allowed` means it was, or would be. */
export type PaidDocumentDecision =
  | { allowed: true }
  | { allowed: false; reason: 'disabled-for-run'; reasonForReader: string }
  | { allowed: false; reason: 'no-credentials'; reasonForReader: string };

export interface PaidDocumentContext {
  /** The project's `allow_paid_documents` column. Defaults to true — see the seed. */
  allowPaidDocuments: boolean;
  /** Whether the worker actually holds a TexasFile login. Presence, not validity. */
  hasVendorCredentials: boolean;
}

/**
 * May this run buy a document?
 *
 * Two independent reasons to refuse, and they are NOT interchangeable:
 *
 *   · `disabled-for-run` — the operator chose this. Nothing is wrong; re-run with the toggle on.
 *   · `no-credentials`   — the system cannot buy at all. A setup problem, and no amount of
 *                          re-running fixes it.
 *
 * Collapsing them into one "skipped" is how somebody spends an afternoon re-running a project that
 * was never going to work, or files a bug against a deliberate choice.
 */
export function mayBuyDocuments(ctx: PaidDocumentContext): PaidDocumentDecision {
  if (!ctx.allowPaidDocuments) {
    return {
      allowed: false,
      reason: 'disabled-for-run',
      reasonForReader:
        'Paid documents were switched off for this run, so anything behind a paywall was not '
        + 'retrieved. This is a setting, not a gap in the record — re-run with paid documents '
        + 'enabled to fetch them.',
    };
  }
  if (!ctx.hasVendorCredentials) {
    return {
      allowed: false,
      reason: 'no-credentials',
      reasonForReader:
        'No document-vendor login is configured, so anything behind a paywall could not be '
        + 'retrieved. This is a configuration problem rather than a choice, and re-running will not '
        + 'change it until credentials are set.',
    };
  }
  return { allowed: true };
}

/** The status recorded against a document that was not bought. Distinct from `budget_exceeded`,
 *  which means the run DID have permission and ran out of money — a third, different thing. */
export function skipStatusFor(d: PaidDocumentDecision): 'paid_disabled' | 'no_vendor_credentials' | null {
  if (d.allowed) return null;
  return d.reason === 'disabled-for-run' ? 'paid_disabled' : 'no_vendor_credentials';
}

/**
 * The sentence the report shows when documents were skipped, or null when none were.
 *
 * Takes the COUNT because "3 documents were not retrieved" and "documents were not retrieved" read
 * very differently to somebody deciding whether to re-run — the first says how much is missing.
 */
export function paidDocumentsNotice(d: PaidDocumentDecision, skippedCount: number): string | null {
  if (d.allowed || skippedCount <= 0) return null;
  const noun = skippedCount === 1 ? '1 document' : `${skippedCount} documents`;
  return `${noun} behind a paywall ${skippedCount === 1 ? 'was' : 'were'} not retrieved. ${d.reasonForReader}`;
}
