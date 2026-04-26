/**
 * Sentry crash + error reporting wiring.
 *
 * Phase F0 #7. The plan §10 risk register treats unhandled errors as
 * the largest single class of "things that go wrong silently in the
 * field" — by the time a surveyor mentions it, the trail is cold.
 * Sentry captures stacks, breadcrumbs, and (in F1+) user actions
 * leading up to a crash.
 *
 * Init contract:
 *   - When EXPO_PUBLIC_SENTRY_DSN is missing or empty, initSentry()
 *     is a no-op. Local dev without a Sentry account works fine.
 *   - Otherwise, init runs once at module-load time of app/_layout.tsx
 *     (BEFORE any provider mounts) so a crash during AuthProvider /
 *     DatabaseProvider initialization is still captured.
 *   - The default export is `Sentry` itself, re-exported so callers
 *     can do `import Sentry from '@/lib/sentry'` for the rare cases
 *     where they want to capture a non-fatal error manually
 *     (`Sentry.captureException(err)`).
 *
 * Sentry DSN is intentionally an EXPO_PUBLIC_ var. Per Sentry's docs:
 * "DSNs are designed to be embedded in client applications and are
 * not secrets." They identify the project but cannot read or modify
 * existing data — they're write-only event ingest URLs.
 *
 * Source-map upload is handled separately at EAS Build time via the
 * `@sentry/react-native/expo` config plugin (declared in app.json).
 * That plugin reads SENTRY_AUTH_TOKEN from the EAS build environment
 * — see mobile/README.md for the one-time setup.
 */
import * as Sentry from '@sentry/react-native';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    // Verbose logging in dev; quiet in production builds.
    debug: __DEV__,
    // Performance tracing — sample 10% in prod, 100% in dev so we
    // see every transaction during local testing without blowing up
    // the Sentry quota in production.
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,
    // Don't capture every console.log as a breadcrumb — too noisy.
    // Default integrations capture errors and navigation; we leave
    // those on. Add Sentry.replayIntegration() in F1+ if we want
    // session replay (requires a paid plan).
  });

  initialized = true;
}

export default Sentry;
