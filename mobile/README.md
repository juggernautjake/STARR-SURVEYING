# Starr Field — mobile companion app

Phase F0 scaffold. The full plan lives in
[`docs/planning/in-progress/STARR_FIELD_MOBILE_APP_PLAN.md`](../docs/planning/in-progress/STARR_FIELD_MOBILE_APP_PLAN.md).

## What's here

- **Expo Router** with file-based routing under `app/` — five tabs
  per plan §7.2 (Jobs / Capture / Time / $ / Me); Capture is a
  floating FAB (`lib/CaptureFab.tsx`) that protrudes above the bar
- **Auth** — email + password, magic link, password reset (deep
  link), Sign in with Apple (iOS), biometric unlock, auto-lock
  after idle, re-auth helper for destructive actions. See
  `lib/auth.tsx`, `lib/biometric.ts`, `lib/lockState.ts`,
  `lib/LockOverlay.tsx`, `lib/AppleSignInButton.tsx`
- **Local SQLite + sync** via PowerSync (`lib/db/`) — schema mirrors
  the 12 plan §6.3 tables; `SupabaseConnector` replays the upload
  queue against Supabase. Local DB works fully offline; cloud sync
  activates when `EXPO_PUBLIC_POWERSYNC_URL` is set. See
  `lib/db/README.md` for the PowerSync deployment runbook.
- **Native splash handoff** (`expo-splash-screen`) — no flash between
  native splash and RN tree paint
- **EAS Build** — `eas.json` with `development` / `preview` /
  `production` profiles. See "EAS Build" section below.
- **OTA updates** via `expo-updates` — `runtimeVersion: appVersion`
  policy + `updates.url` in app.json. See "OTA updates" section.
- **Sentry crash reporting** (`lib/sentry.ts`, `@sentry/react-native`
  via the Expo config plugin) — no-op when `EXPO_PUBLIC_SENTRY_DSN`
  is empty so dev works without an account.
- **Theme** (`lib/theme.ts`) — dark-mode default per plan §7.1 rule 7
- **TypeScript** strict mode, **ESLint** (`eslint-config-expo` +
  `eslint-config-prettier`), **Prettier** with single-quote / 2-space
  style matching the worker

## What's NOT here yet (deferred to F1+)

- Google native sign-in (needs GCP project + 3 client IDs)
- Floating-Capture haptic feedback + vector tab icons (cosmetic)

**Phase F0 is complete** — next phase is F1 (Jobs + basic time logging
per plan §9 phased build plan).

## Quick start

```bash
cd mobile
npm install
cp .env.example .env.local
# Required: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
# Optional: EXPO_PUBLIC_POWERSYNC_URL (when empty, local SQLite still
#           works; only the cloud sync layer is disabled)
npm start
```

`npm start` opens the Expo dev tools; press `i` for iOS simulator,
`a` for Android emulator, or scan the QR code with Expo Go on a
physical device.

## Type-check

```bash
npm run type-check
```

## Lint

```bash
npm run lint
```

## EAS Build

EAS Build produces signed native binaries on Expo's cloud (so we don't
need a Mac in the build pipeline) and submits them to TestFlight /
Play Store. The `eas.json` in this directory has three profiles:

| Profile | Distribution | Use it for |
|---|---|---|
| `development` | dev client (internal) | Local hot-reload with all native modules — `npx expo start --dev-client` |
| `preview` | internal install (`.ipa` / `.apk`) | Putting a real signed build on Jacob's phone before TestFlight is wired |
| `production` | TestFlight / Play Store | Customer-ready releases |

### One-time setup (your machine)

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Sign in to your Expo account
eas login

# From inside mobile/ — populates extra.eas.projectId in app.json
cd mobile
eas init
```

`eas init` creates a project on Expo's servers and writes its id back
into `app.json`. Commit that change.

### Apple credentials (TestFlight + App Store)

Two paths:

1. **Easiest (recommended for solo-dev):** let EAS manage everything.
   `eas credentials` walks you through registering the bundle ID
   (`com.starrsoftware.starrfield`), generating a distribution
   certificate, and creating a provisioning profile. EAS stores them
   on its servers; nothing sensitive lands in the repo.

2. **Manual:** if you already have a `.p8` API key from App Store
   Connect (`Users and Access → Keys → App Store Connect API`), put
   it somewhere outside the repo and reference its path in your
   shell env (`EXPO_APPLE_APP_SPECIFIC_PASSWORD` or similar). The
   `.p8`, `.p12`, `.mobileprovision` extensions are gitignored so
   accidental commits won't leak them.

### Android credentials (Play internal track + Play Store)

EAS auto-generates a keystore on first Android build. For
`eas submit --platform android`, you also need a Google Play
service-account JSON. Create one in GCP Console:

1. GCP project → IAM → Service Accounts → Create
2. Grant the role `Service Account User` and `Pub/Sub Editor`
3. Create a JSON key, download it as `mobile/google-play-service-account.json`
   (gitignored — never commit)
4. In Play Console: Setup → API access → grant the service account
   access to your app

### Build commands

```bash
# Development client (install once, then `npx expo start --dev-client`)
eas build --profile development --platform ios
eas build --profile development --platform android

# Preview (internal-distribution; install via TestFlight invite or .apk link)
eas build --profile preview --platform all

# Production (TestFlight + Play Store)
eas build --profile production --platform all
```

### Submit

```bash
# TestFlight (replace placeholders in eas.json `submit.production.ios` first)
eas submit --profile production --platform ios

# Play Store internal track (default per eas.json)
eas submit --profile production --platform android
```

For TestFlight specifically: after `eas submit` uploads, go to App
Store Connect → TestFlight → invite Jacob (and Hank, etc.) by email.
First build per version requires Apple's processing time (~10 min).

### Env vars in EAS

`EXPO_PUBLIC_*` env vars are baked into the JS bundle at build time,
so they need to be set on EAS for cloud builds. Two options:

1. **Inline in `eas.json`** under `build.<profile>.env` — works but
   leaks values into git history.
2. **EAS Secrets** (recommended) — `eas secret:create --name
   EXPO_PUBLIC_SUPABASE_URL --value https://...` once per env var.
   EAS injects them at build time without putting them in the repo.

```bash
# One-time, per env var, per project:
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value 'https://xxxxx.supabase.co'
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value 'eyJhbGc...'
eas secret:create --scope project --name EXPO_PUBLIC_POWERSYNC_URL --value 'https://...powersync.journeyapps.com'
eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value 'https://...@o....ingest.sentry.io/...'

# Sentry source-map upload (used by the @sentry/react-native/expo
# plugin during EAS Build only — NOT an EXPO_PUBLIC_* var):
eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value 'sntrys_...'
```

These are public anon keys / write-only DSNs per the comments in
`.env.example` — safe to embed but not to commit.

## OTA updates (`expo-updates`)

After a binary build is installed on a device, JS-only changes can be
shipped without going back through TestFlight / Play Store review. The
app checks for updates on launch (per the configured policy) and
applies them on next cold-start.

### One-time setup

```bash
cd mobile
eas update:configure
```

This populates `updates.url` in `app.json` with your project's update
endpoint and verifies the channel mapping in `eas.json`. Commit the
resulting app.json change.

### Push an update

```bash
# Ship to the preview channel (used by --profile preview builds):
eas update --branch preview --message "fix: forgot-password redirect on android"

# Ship to production (used by --profile production builds):
eas update --branch production --message "feat: timesheet copy edits"
```

Updates respect the `runtimeVersion` policy in `app.json`
(`appVersion` — only matching app versions accept the OTA). Bumping
the app version in `app.json` creates a new runtime; previous OTAs
won't apply to it. Always rebuild + resubmit when bumping app version.

### Limits

- Native code changes (new modules, plugin config changes, version
  bumps for native deps) **require a new binary build**, not an OTA.
- iOS App Store and Play Store accept OTA bug fixes; substantial
  feature changes via OTA without store review can violate ToS — if
  in doubt, ship the binary.

## Sentry crash reporting

`lib/sentry.ts` initializes the JS-side Sentry SDK at module-load
time of `app/_layout.tsx`. The `@sentry/react-native/expo` plugin in
`app.json` handles native init + source-map upload during EAS Build.

### One-time setup

1. Create a Sentry account + project at <https://sentry.io>. Pick the
   "React Native" project type so you get the right SDK template.
2. Copy the DSN from the project settings.
3. Set it as both a local dev value and an EAS Secret:

```bash
# Local:
echo 'EXPO_PUBLIC_SENTRY_DSN=https://...@o....ingest.sentry.io/...' >> mobile/.env.local

# EAS:
eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value 'https://...@o....ingest.sentry.io/...'
```

4. For source-map upload during EAS Build, generate a Sentry auth
   token (Sentry → Settings → Auth Tokens, scope: `project:write` +
   `project:releases`). Then:

```bash
eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value 'sntrys_...'
```

The plugin reads `SENTRY_AUTH_TOKEN` from the EAS build environment
and uploads source maps automatically — no `sentry.properties` file
in the repo. (`sentry.properties` and `.sentryclirc` are gitignored
in case `npx @sentry/wizard` ever writes them locally.)

### Verify it's working

After the first build with the DSN set, trigger a fake crash from a
dev menu or with a temporary throw:

```ts
import Sentry from '@/lib/sentry';
// in some onPress:
Sentry.captureException(new Error('starr-field smoke test'));
```

The event should land in your Sentry project within 30 seconds with
a usable stack trace (provided source-map upload ran during build).

### Without a DSN

If `EXPO_PUBLIC_SENTRY_DSN` is empty, `initSentry()` is a no-op and
`Sentry.wrap` is a passthrough. Local dev runs identically with or
without a Sentry account.

## Repo layout decision

This directory lives at `mobile/` inside the STARR-SURVEYING monorepo,
adjacent to `app/` (Next.js web), `worker/` (Recon pipeline), and
`lib/` (shared web code). Reasoning is documented in plan §6 preamble:
shared TypeScript types (especially the realtime event catalog at
`worker/src/shared/research-events.ts`), shared lint config, single CI
pipeline. If mobile build noise becomes a real problem at end of Phase
F1, the escape hatch is to split this into its own repo with the
shared types extracted to a published npm package.

## Notes

- **Do NOT put server secrets in `.env.local`** — `EXPO_PUBLIC_*` vars
  are inlined into the JS bundle at build time. Anthropic API keys and
  Supabase service-role keys stay on the server.
- The `mobile/node_modules` install is large (~700 MB). It's ignored
  by the root `.gitignore` (`node_modules/` matches recursively).
- Root `tsconfig.json` excludes this directory — running `tsc` at the
  repo root never touches mobile code. Type-check from inside `mobile/`
  with `npm run type-check`.
