# Starr Field — mobile companion app

Phase F0 scaffold. The full plan lives in
[`docs/planning/in-progress/STARR_FIELD_MOBILE_APP_PLAN.md`](../docs/planning/in-progress/STARR_FIELD_MOBILE_APP_PLAN.md).

## What's here

- **Expo Router** with file-based routing under `app/`
- **Tab bar shell** (`app/(tabs)/_layout.tsx`) with five placeholder
  screens: Jobs, Capture, Time, $, Me — per plan §7.2
- **Supabase client** (`lib/supabase.ts`) wired to `EXPO_PUBLIC_*`
  env vars with `AsyncStorage` for session persistence
- **Theme** (`lib/theme.ts`) — dark-mode default per plan §7.1 rule 7
- **TypeScript** strict mode, **ESLint** via `eslint-config-expo`,
  **Prettier** with single-quote / 2-space style matching the worker

## What's NOT here yet (Phase F0 remaining)

- Auth flow + biometric unlock (deliverable #2)
- Local SQLite + sync queue (deliverable #3 — PowerSync vs WatermelonDB
  spike pending; see plan §6.1)
- EAS Build configured for TestFlight / internal Android (#5)
- OTA updates (#6)
- Sentry crash reporting (#7)

Each lands in its own session.

## Quick start

```bash
cd mobile
npm install
cp .env.example .env.local
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
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
