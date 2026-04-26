/**
 * Logging helper — single entry point for console + Sentry.
 *
 * Three levels:
 *   logError(scope, msg, err, extra)   serious problem; capture to Sentry
 *   logWarn (scope, msg, err?, extra)  recoverable issue; breadcrumb to Sentry
 *   logInfo (scope, msg, extra)        state-transition trail; breadcrumb only
 *
 * Why a wrapper instead of calling Sentry / console directly:
 *   1. One call covers BOTH surfaces — no "I logged to console but
 *      forgot to capture for Sentry" gaps.
 *   2. Consistent `[{scope}] {message}` prefix across all logs makes
 *      device-log triage scannable.
 *   3. When DSN isn't configured, Sentry methods are no-ops by design
 *      — so this helper is safe in dev without a Sentry account.
 *   4. Single place to add structured tags later (release version,
 *      device model, etc.) without touching every call site.
 *
 * scope conventions:
 *   '<file>.<function>' — e.g. 'timeTracking.clockIn',
 *                              'db.connector.uploadData'
 *   matches the Sentry tag so filtering by tag pulls all events
 *   from one code path.
 *
 * setUserContext should be called once after sign-in and once after
 * sign-out (with null) — it tags every subsequent Sentry event with
 * the surveyor's id and email.
 */
import Sentry from './sentry';

export interface LogExtra {
  [key: string]: unknown;
}

export function logError(
  scope: string,
  message: string,
  err: unknown,
  extra?: LogExtra
): void {
  // Always to console so dev / device logs see it.
  // eslint-disable-next-line no-console
  console.error(`[${scope}] ${message}`, err, extra ?? '');

  // And to Sentry. captureException for real Errors (preserves
  // stack), captureMessage for non-Error throws (string, object, etc).
  if (err instanceof Error) {
    Sentry.captureException(err, {
      tags: { scope },
      extra: { message, ...(extra ?? {}) },
    });
  } else {
    Sentry.captureMessage(`${scope}: ${message}`, {
      level: 'error',
      tags: { scope },
      extra: { error: safeStringify(err), ...(extra ?? {}) },
    });
  }
}

export function logWarn(
  scope: string,
  message: string,
  err?: unknown,
  extra?: LogExtra
): void {
  // eslint-disable-next-line no-console
  console.warn(`[${scope}] ${message}`, err ?? '', extra ?? '');

  Sentry.addBreadcrumb({
    category: scope,
    message,
    level: 'warning',
    data: {
      ...(err !== undefined ? { error: safeStringify(err) } : {}),
      ...(extra ?? {}),
    },
  });
}

export function logInfo(
  scope: string,
  message: string,
  extra?: LogExtra
): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[${scope}] ${message}`, extra ?? '');
  }

  Sentry.addBreadcrumb({
    category: scope,
    message,
    level: 'info',
    data: extra ?? {},
  });
}

/**
 * Tag every subsequent Sentry event with the current user. Pass
 * `null` on sign-out so events stop attributing to a stale user.
 *
 * Email + id are deliberate; we don't send PII beyond that. The
 * Supabase access token / refresh token are NEVER passed here.
 */
export function setUserContext(
  user: { id?: string | null; email?: string | null } | null
): void {
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: user.id ?? undefined,
    email: user.email ?? undefined,
  });
}

/**
 * String coercion that doesn't throw on circular refs or `undefined`.
 * Sentry's `extra` field accepts arbitrary values but we want a
 * predictable string representation in case it ever gets serialized
 * downstream (e.g. console output, future log shipping).
 */
function safeStringify(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return Object.prototype.toString.call(v);
  }
}
