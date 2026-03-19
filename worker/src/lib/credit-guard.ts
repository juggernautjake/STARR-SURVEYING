/**
 * Credit Guard — Detects Anthropic API credit depletion across all call sites.
 *
 * When ANY Anthropic API call fails due to insufficient credits, the guard
 * sets a module-level flag so all subsequent AI calls can short-circuit
 * immediately instead of burning time on doomed requests.
 *
 * Usage:
 *   import { withCreditGuard, isCreditDepleted, resetCreditGuard } from '../lib/credit-guard.js';
 *
 *   // Wrap any Anthropic API call:
 *   const response = await withCreditGuard(() => client.messages.create({ ... }));
 *
 *   // Check if credits are exhausted before starting an AI-heavy phase:
 *   if (isCreditDepleted()) { /* skip AI, return partial results *\/ }
 *
 *   // Reset at the start of a new pipeline run:
 *   resetCreditGuard();
 */

// ── Singleton state ──────────────────────────────────────────────────────────

let _creditDepleted = false;
let _depletionMessage = '';

/** Returns true if any Anthropic call has detected credit depletion this run. */
export function isCreditDepleted(): boolean {
  return _creditDepleted;
}

/** Returns the original error message from the credit depletion detection. */
export function getDepletionMessage(): string {
  return _depletionMessage;
}

/** Reset at the start of each pipeline run so previous state doesn't carry over. */
export function resetCreditGuard(): void {
  _creditDepleted = false;
  _depletionMessage = '';
}

// ── Error class ──────────────────────────────────────────────────────────────

/** Thrown when the Anthropic API key has insufficient credits. */
export class AnthropicCreditDepletedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnthropicCreditDepletedError';
  }
}

// ── Detection ────────────────────────────────────────────────────────────────

const CREDIT_ERROR_PATTERNS = [
  /credit balance is too low/i,
  /insufficient.{0,20}credit/i,
  /billing.{0,30}limit/i,
  /exceeded.{0,20}budget/i,
];

/**
 * Checks if an error indicates Anthropic credit depletion.
 * Returns true if the error matches known credit-depletion patterns.
 */
export function isCreditDepletionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');

  // Check HTTP status if available (Anthropic SDK sets .status on APIError)
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: number }).status;
    // 402 Payment Required is a definitive credit depletion signal
    if (status === 402) return true;
    // 400/403 with credit-related message
    if ((status === 400 || status === 403) && CREDIT_ERROR_PATTERNS.some(p => p.test(msg))) {
      return true;
    }
  }

  // Also check the message directly (in case the error was wrapped)
  return CREDIT_ERROR_PATTERNS.some(p => p.test(msg));
}

/**
 * If the error is a credit depletion error, sets the module-level flag and
 * throws AnthropicCreditDepletedError. Otherwise does nothing.
 */
export function checkAndFlagCreditDepletion(err: unknown): void {
  if (_creditDepleted) return; // already flagged
  if (!isCreditDepletionError(err)) return;

  const msg = err instanceof Error ? err.message : String(err ?? '');
  _creditDepleted = true;
  _depletionMessage = msg;
  console.error(
    `[CreditGuard] ⚠ AI CREDIT DEPLETION DETECTED: ${msg.slice(0, 200)}`,
  );

  throw new AnthropicCreditDepletedError(
    'AI credit balance is too low. Please add funds to your Anthropic account at console.anthropic.com/settings/billing, then re-run research.',
  );
}

// ── Wrapper ──────────────────────────────────────────────────────────────────

/**
 * Wraps an async Anthropic API call with credit-depletion detection.
 *
 * If credits were already detected as depleted by a previous call, this
 * throws immediately without making the request. If the call fails due to
 * credit depletion, it sets the flag and throws AnthropicCreditDepletedError.
 */
export async function withCreditGuard<T>(fn: () => Promise<T>): Promise<T> {
  if (_creditDepleted) {
    throw new AnthropicCreditDepletedError(
      _depletionMessage || 'AI credit balance is too low. Please add funds to your Anthropic account.',
    );
  }

  try {
    return await fn();
  } catch (err) {
    // Check if this is a credit depletion error — if so, flag and re-throw
    // as AnthropicCreditDepletedError. If not, re-throw the original error.
    checkAndFlagCreditDepletion(err);
    throw err;
  }
}
