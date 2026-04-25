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
- **Theme** (`lib/theme.ts`) — dark-mode default per plan §7.1 rule 7
- **TypeScript** strict mode, **ESLint** (`eslint-config-expo` +
  `eslint-config-prettier`), **Prettier** with single-quote / 2-space
  style matching the worker

## What's NOT here yet (Phase F0 remaining)

- Google native sign-in (needs GCP project + 3 client IDs from you;
  defer to F1)
- OTA updates via `expo-updates` (F0 #6)
- Sentry crash reporting (F0 #7)

Each lands in its own session.

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
```

These are public anon keys per the comments in `.env.example` — safe
to embed but not to commit.

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
