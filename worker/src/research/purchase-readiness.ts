// worker/src/research/purchase-readiness.ts — "will a paid run work?", answered without spending.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// D3 is the last item in the plan and it is the one thing I cannot ship: proving the paid path
// end to end means spending real money at a live vendor against a real property. That is the owner's
// call.
//
// What I can do is make the answer checkable BEFORE the money is at stake. Every link in the chain
// is now built — the reconciled boundary, Phase 8's recommendations, the gate, the ceiling, the
// ledger — and a paid run that fails on a missing password teaches nothing except that a password
// was missing.
//
// `GET /research/purchase/platforms/status` already existed and does not answer this. It reports six
// Phase 15 adapters — Tyler Pay, Henschen, iDocket, Fidlar, GovOS, Landex — and NOT TexasFile or
// Kofile, which are the two the purchase orchestrator actually buys through. It also has no callers.
// So the one question worth asking before a paid run had no way to be asked.
//
// ── WHAT "READY" MEANS HERE ─────────────────────────────────────────────────────────────────────
//
// Deliberately NOT "the credentials are correct" — that cannot be known without using them, and a
// login attempt is a side effect against a vendor's account. This reports what can be established
// for free, and says plainly which of its answers is presence rather than proof. A green light that
// overstates itself is worse than a red one.

export interface ReadinessCheck {
  name: string;
  ok: boolean;
  /** What was actually established — presence, or proof. Never both. */
  detail: string;
}

export interface PurchaseReadiness {
  /** True only when nothing blocks a purchase. Presence-only checks can still be true. */
  ready: boolean;
  checks: ReadinessCheck[];
  /** The one sentence to read. */
  summary: string;
}

export interface ReadinessInput {
  /** Vendor credentials, by presence only. */
  env: NodeJS.ProcessEnv;
  /** The gate's answer for this run, if a project was named. */
  permission?: { allowed: boolean; reason: string } | null;
  /** Whether a Phase 8 report exists with something worth buying. */
  recommendationCount?: number | null;
  /** Whether the reconciled boundary Phase 8 needs is on disk. */
  hasReconciledBoundary?: boolean | null;
}

export function assessPurchaseReadiness(input: ReadinessInput): PurchaseReadiness {
  const checks: ReadinessCheck[] = [];
  const { env } = input;

  const texasfile = !!(env.TEXASFILE_USERNAME && env.TEXASFILE_PASSWORD);
  const kofile = !!(env.KOFILE_USERNAME && env.KOFILE_PASSWORD);

  checks.push({
    name: 'A vendor account is configured',
    ok: texasfile || kofile,
    detail: texasfile || kofile
      // Stated as presence, not proof. A username and a password being SET says nothing about
      // whether the vendor accepts them or the account is funded.
      ? `Credentials are present for ${[texasfile && 'TexasFile', kofile && 'Kofile'].filter(Boolean).join(' and ')}. ` +
        `That is presence, not proof — nothing here has logged in.`
      : 'Neither TEXASFILE_ nor KOFILE_ credentials are set. A run allowed to buy would find nothing to buy with.',
  });

  if (input.permission) {
    checks.push({
      name: 'This run is allowed to spend',
      ok: input.permission.allowed,
      detail: input.permission.reason,
    });
  }

  if (input.hasReconciledBoundary !== null && input.hasReconciledBoundary !== undefined) {
    checks.push({
      name: 'The boundary Phase 8 needs exists',
      ok: input.hasReconciledBoundary,
      detail: input.hasReconciledBoundary
        ? 'reconciled_boundary.json is on disk, so confidence scoring can run.'
        : 'No reconciled boundary. Phase 8 cannot run, so there will be no purchase recommendations — ' +
          'which is exactly why no run has ever bought a document.',
    });
  }

  if (input.recommendationCount !== null && input.recommendationCount !== undefined) {
    checks.push({
      name: 'There is something worth buying',
      ok: input.recommendationCount > 0,
      detail: input.recommendationCount > 0
        ? `${input.recommendationCount} document(s) were recommended by confidence scoring.`
        : 'Confidence scoring recommended no purchases. A run here would correctly buy nothing, ' +
          'which does NOT prove the purchase path works.',
    });
  }

  const blocking = checks.filter((c) => !c.ok);
  const ready = blocking.length === 0;

  return {
    ready,
    checks,
    summary: ready
      ? 'Everything that can be checked without spending is in place. The only way to prove the ' +
        'purchase path is a deliberate paid run — nothing above has logged in or bought anything.'
      : `Not ready: ${blocking.map((c) => c.name.toLowerCase()).join('; ')}.`,
  };
}
