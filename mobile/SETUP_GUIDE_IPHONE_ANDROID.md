# Starr Field — get the app on iPhone **and** Android (step by step)

> **Who this is for.** Anyone (even non-technical) who needs to put the Starr
> Field mobile app onto a real iPhone or Android phone — for the field crew,
> for testing, or to publish to the App Store / Google Play.
>
> **What you'll end up with.** The Starr Field app running on a phone, signed
> in against the real Starr backend, capturing receipts + points + time.
>
> **How long.** ~30–45 min of your attention per platform. The cloud build
> queue (Apple/Google) does most of the waiting for you.
>
> **Screenshots.** Each console step has a `📸` callout naming the screenshot
> that belongs there. They live in
> [`docs/setup-screenshots/`](docs/setup-screenshots/README.md) and render
> here once you drop the PNGs in with the listed filenames. The text steps
> work fine on their own — the shots just make it foolproof.
>
> **The short version:** fill in a few config values (§1–§2), then run **one
> build command** per platform (§I / §A). That's it. Everything below is just
> making those two things bullet-proof.

---

## Table of contents

- [§0 — The mental model (read this once)](#0--the-mental-model-read-this-once)
- [§1 — Prerequisites: accounts + tools](#1--prerequisites-accounts--tools)
- [§2 — One-time config (fill the placeholders)](#2--one-time-config-fill-the-placeholders)
- [§3 — Sign in to Expo/EAS](#3--sign-in-to-expaseas)
- [§I — iPhone track (TestFlight)](#i--iphone-track-testflight)
- [§A — Android track (Play + direct APK)](#a--android-track-google-play--direct-apk)
- [§4 — Fast local iteration (see code changes live)](#4--fast-local-iteration-see-code-changes-live)
- [§5 — Publishing updates without a new build (OTA)](#5--publishing-updates-without-a-new-build-ota)
- [§6 — Smoke test on real hardware](#6--smoke-test-on-real-hardware)
- [§7 — Troubleshooting (both platforms)](#7--troubleshooting-both-platforms)

---

## §0 — The mental model (read this once)

Starr Field is an **Expo / React Native** app (the code lives in `mobile/`).
You do **not** need Xcode or Android Studio. You build in the cloud with
**EAS** (Expo Application Services) and install the result on a phone.

Two ways to run it on a phone:

1. **Dev build (fast, for testing):** run `npx expo start` on your computer
   and open the app on a phone that's on the same Wi-Fi. Code changes appear
   in ~1 second (hot reload). Great for "test it without it crashing and see
   changes in real time." → **§4**.
2. **Store/TestFlight build (for the crew):** `eas build` produces a real
   installable app; you distribute it via **TestFlight** (iPhone) or **Google
   Play internal testing / a direct APK** (Android). → **§I / §A**.

You'll do §1–§3 once, then pick §I, §A, or both.

---

## §1 — Prerequisites: accounts + tools

### Tools on your computer (one-time)

```bash
# 1. Node.js 20+ (check with: node -v). Install from https://nodejs.org if missing.
# 2. The EAS command-line tool:
npm install -g eas-cli
# 3. Install the app's dependencies:
cd mobile
npm install
```

### Accounts

| Account | Needed for | Cost | Link |
|---|---|---|---|
| **Expo** | Running cloud builds (EAS) | Free | https://expo.dev/signup |
| **Apple Developer** | iPhone / TestFlight / App Store | $99/yr | https://developer.apple.com/account |
| **Google Play Console** | Android / Play Store | $25 once | https://play.google.com/console |

> You only need the Apple account for the **iPhone** track and the Google
> account for the **Android** Play-Store track. A **direct-install Android
> APK** (§A-4) needs **neither** store account — handy for a quick test.

---

## §2 — One-time config (fill the placeholders)

The repo ships with clearly-marked `REPLACE_WITH_*` placeholders so no secrets
are committed. Fill them in before your first build. A validator
(`mobile/scripts/check-eas-config.mjs`) blocks the build until they're all set.

### 2a. Backend connection — `mobile/eas.json`

Both the `preview` and `production` profiles carry an `env` block. Set them to
the **same public** Supabase values the website uses (the anon key is a public
JWT — safe to embed in a phone app):

```diff
   "env": {
-    "EXPO_PUBLIC_SUPABASE_URL": "REPLACE_WITH_SUPABASE_URL",
-    "EXPO_PUBLIC_SUPABASE_ANON_KEY": "REPLACE_WITH_SUPABASE_ANON_KEY"
+    "EXPO_PUBLIC_SUPABASE_URL": "https://YOURPROJECT.supabase.co",
+    "EXPO_PUBLIC_SUPABASE_ANON_KEY": "eyJhbGciOi...(the anon key)"
   }
```

> 🔒 **Never** put a `service_role` key or any `sk_…` / `sk-ant-…` secret in
> here. Only `EXPO_PUBLIC_*` values are safe to ship to a phone.
> Optional extras: `EXPO_PUBLIC_POWERSYNC_URL` (offline sync) and
> `EXPO_PUBLIC_SENTRY_DSN` (crash reports). Leave them out to disable those.

### 2b. Over-the-air updates — `mobile/app.json`

```diff
     "updates": {
       "enabled": true,
-      "url": "REPLACE_WITH_EAS_UPDATE_URL"
+      "url": "https://u.expo.dev/<your-eas-project-id>"
     },
```

Get `<your-eas-project-id>` by running `eas init` once inside `mobile/` (it
prints the id and wires it up). You can also skip OTA for now by leaving
updates disabled — the build still works.

### 2c. Verify

```bash
cd mobile
npm run check-eas
```

It prints an OK line when every placeholder is filled, or lists exactly which
ones remain. Re-run until clean.

> 📸 `02-check-eas-pass.png` — the terminal showing the green OK line.

![check-eas passing](docs/setup-screenshots/02-check-eas-pass.png)

---

## §3 — Sign in to Expo/EAS

```bash
cd mobile
eas login          # enter your Expo account email + password
eas whoami         # confirms you're logged in
```

> 📸 `01-expo-login.png` — the terminal showing "Logged in as …".

![eas login](docs/setup-screenshots/01-expo-login.png)

---

## §I — iPhone track (TestFlight)

> Result: Starr Field installable on any iPhone you invite, via Apple's
> TestFlight app. No App Store review needed for internal testers.

### §I-1 — Apple values you'll need

From https://developer.apple.com/account:

| Value | Looks like | Where |
|---|---|---|
| **Apple ID** | your developer email | the account you pay the $99 with |
| **Team ID** | `A1B2C3D4E5` (10 chars) | Membership page, top-right |
| **App Store Connect App ID** | `6483019272` (10 digits) | created in §I-2 below |

If Apple is nagging you to re-sign the annual developer agreement, do that
first — otherwise the build fails with a clear error.

### §I-2 — Create the App Store Connect record (one-time)

1. Sign in to https://appstoreconnect.apple.com → **My Apps → ➕ → New App**.
2. Fill in:

   | Field | Value |
   |---|---|
   | Platforms | iOS |
   | Name | Starr Field |
   | Primary Language | English (U.S.) |
   | Bundle ID | `com.starrsoftware.starrfield` (must match `mobile/app.json`) |
   | SKU | `STARRFIELD0001` (any sensible string) |

   > 📸 `10-asc-new-app.png` — the New App dialog filled in.

   ![New App dialog](docs/setup-screenshots/10-asc-new-app.png)

3. After saving, open **App Information** and copy the **Apple ID** number at
   the top — that's your `ascAppId`.

   > 📸 `11-asc-app-id.png` — App Information with the Apple ID circled.

   ![App ID](docs/setup-screenshots/11-asc-app-id.png)

4. Put the three Apple values into `mobile/eas.json` under
   `submit.production.ios`:

   ```diff
      "ios": {
   -    "appleId": "REPLACE_WITH_APPLE_ID",
   -    "ascAppId": "REPLACE_WITH_APP_STORE_CONNECT_APP_ID",
   -    "appleTeamId": "REPLACE_WITH_APPLE_TEAM_ID"
   +    "appleId": "you@example.com",
   +    "ascAppId": "6483019272",
   +    "appleTeamId": "A1B2C3D4E5"
      }
   ```

   Then re-run `npm run check-eas`.

> Do **not** submit for App Store review yet — the TestFlight internal track
> is all you need for the crew.

### §I-3 — Build + upload

```bash
cd mobile
eas build --profile preview --platform ios      # ~15 min in the cloud
```

When prompted:
- "Manage credentials for you?" → **Yes**
- "Do you have a distribution certificate?" → **No** (EAS makes one)
- Same for the provisioning profile → let EAS create it.

> 📸 `12-eas-build-ios-done.png` — the terminal green ✅ + build URL.

![iOS build done](docs/setup-screenshots/12-eas-build-ios-done.png)

Then upload the finished build to TestFlight:

```bash
eas submit --profile production --platform ios --latest
```

Apple processes it in 10–30 min; you get an email when it's live in
TestFlight.

### §I-4 — Install on the iPhone(s)

1. **You:** install the **TestFlight** app from the App Store. Apple emails an
   invite to your developer email → tap **Start Testing**.
2. **Another tester (e.g. your dad):** App Store Connect → **Users and
   Access → Testers → ➕** → enter their Apple ID email. They get the same
   email and install via TestFlight.

   > 📸 `13-testflight-invite.png` and `14-testflight-installed.png`.

   ![TestFlight invite](docs/setup-screenshots/13-testflight-invite.png)
   ![Installed](docs/setup-screenshots/14-testflight-installed.png)

Jump to [§6 smoke test](#6--smoke-test-on-real-hardware).

---

## §A — Android track (Google Play + direct APK)

> Two options. **A-4 (direct APK)** is the fastest way onto a phone and needs
> no Play account. **A-5 (Play internal testing)** is the path to the Play
> Store. The **same `eas build` command** produces the installable for both.

### §A-1 — Values you'll need

Nothing up front for a direct APK. For the Play Store you'll create a service
account in §A-2.

### §A-2 — (Play Store only) Create the app + a submit key

1. Sign in to https://play.google.com/console → **Create app**:

   | Field | Value |
   |---|---|
   | App name | Starr Field |
   | Default language | English (U.S.) |
   | App or game | App |
   | Free or paid | Free |

   Package name is `com.starrsoftware.starrfield` (matches `mobile/app.json`);
   it's locked in on your first upload.

   > 📸 `20-play-create-app.png` — the Create app dialog.

   ![Create app](docs/setup-screenshots/20-play-create-app.png)

2. Create a **service account** so EAS can upload for you:
   - Google Play Console → **Setup → API access → Create new service
     account** → follow the link to Google Cloud → **Create service
     account** → grant it the **Service Account User** role → **Keys → Add
     key → JSON**. Download the JSON.
   - Back in Play Console → grant that service account **Release** permission.
   - Save the JSON as `mobile/google-play-service-account.json` (this path is
     already referenced in `eas.json` and is git-ignored — never commit it).

   > 📸 `21-play-service-account.png` — the Create key (JSON) step.

   ![Service account key](docs/setup-screenshots/21-play-service-account.png)

### §A-3 — Build

```bash
cd mobile
eas build --profile preview --platform android    # ~15 min; produces an installable .apk
```

When prompted about a keystore → let **EAS manage credentials** (Yes).

> 📸 `22-eas-build-android-done.png` — terminal green ✅ + the APK download URL.

![Android build done](docs/setup-screenshots/22-eas-build-android-done.png)

### §A-4 — Install the APK directly (no Play account needed)

1. Open the build's URL (EAS printed it, and it's on your https://expo.dev
   dashboard) **on the Android phone**, or email yourself the `.apk`.
2. Tap the `.apk`. Android warns about installing from an unknown source →
   **Settings → allow this source → Install anyway**.

   > 📸 `23-android-install-apk.png` — the unknown-source prompt.

   ![Install APK](docs/setup-screenshots/23-android-install-apk.png)

3. Open Starr Field. Done — go to [§6](#6--smoke-test-on-real-hardware).

### §A-5 — (Play Store) Push to internal testing

```bash
eas submit --profile production --platform android --latest
```

This uploads to the Play **internal** track (set in `eas.json`). Then in Play
Console → **Testing → Internal testing → Testers**, add tester emails and
share the opt-in link. Testers install through the Play Store.

> 📸 `24-play-internal-testing.png` — the internal-testing testers list.

![Internal testing](docs/setup-screenshots/24-play-internal-testing.png)

> Note: Google requires an `.aab` (App Bundle) for a **production** Play
> release. The `preview` profile builds an `.apk` for direct install; when
> you're ready for a production Play submission, build with the
> `production` profile (which produces an `.aab`).

---

## §4 — Fast local iteration (see code changes live)

For day-to-day development you don't rebuild — you hot-reload:

```bash
cd mobile
npx expo start           # prints a QR code
```

- **iPhone:** install **Expo Go** from the App Store (for pure-JS changes) or,
  because this app uses native modules (camera, location, PowerSync), install
  a **dev build** once with `eas build --profile development --platform ios`
  and open that. Scan the QR from the Camera app.
- **Android:** install **Expo Go** or the development dev-build APK
  (`eas build --profile development --platform android`), then scan the QR
  from inside Expo Go / the dev app.

Edit any file under `mobile/app/` or `mobile/lib/` and the phone reloads in
about a second. This is the "test without crashing and see changes in real
time" workflow.

Before you commit, keep the app green:

```bash
cd mobile
npx tsc --noEmit         # types must be clean
npx eslint . --ext .ts,.tsx
```

---

## §5 — Publishing updates without a new build (OTA)

Once §2b (the EAS Update URL) is set, most JS-only fixes ship **instantly**
without a store round-trip:

```bash
cd mobile
eas update --branch preview --message "fix: …"      # or --branch production
```

Phones pick it up on next launch. (Changes to native config — new
permissions, SDK bumps — still need a fresh `eas build`.)

---

## §6 — Smoke test on real hardware

Run this once on each phone, end-to-end:

1. **Sign in** with an existing email + password (real Supabase).

   > 📸 `30-app-signin.png`

   ![Sign in](docs/setup-screenshots/30-app-signin.png)

2. **Receipt:** Money tab → capture → snap a receipt → approve → within ~10 s
   it should appear in `/admin/receipts` on the web with AI extraction.

   > 📸 `31-app-capture.png`

   ![Capture](docs/setup-screenshots/31-app-capture.png)

3. **Point photo:** Jobs → a real job → Points → a point → Photos → camera.
   It should appear on the web job-detail view within ~30 s.
4. **Notification:** submit a test lead from the website; the phone's bell
   should fire within ~5 s and deep-link to the right card.

Anything that fails on real hardware → capture a screen recording and file it.

---

## §7 — Troubleshooting (both platforms)

| Symptom | Likely cause | Fix |
|---|---|---|
| `eas build` refuses to start, mentions `REPLACE_WITH_` | a placeholder is still unset | `npm run check-eas` and fill what it lists |
| iOS build: "missing bundle identifier" | `app.json` edited wrong | confirm `expo.ios.bundleIdentifier === com.starrsoftware.starrfield` |
| `eas submit` iOS: "invalid Apple ID" | `eas.json` still has a placeholder Apple value | fill §I-2 step 4, re-run `check-eas` |
| Android install: "app not installed" | an old copy with a different signature | uninstall the old Starr Field first, then reinstall |
| Android: "unknown source blocked" | source not allowed | Settings → Apps → your browser/files app → allow install from this source |
| TestFlight invite never arrives | Apple's async ID system | wait 30 min, check spam, confirm the tester row exists in ASC |
| App opens but can't reach backend | Supabase env not baked into the build | fix §2a, **rebuild** (env is embedded at build time, not runtime) |
| Play submit: "aab required" | production Play needs an App Bundle | build with `--profile production` (produces `.aab`) |
| Camera/location does nothing | permission denied earlier | phone Settings → Starr Field → enable the permission |

---

### Related docs

- [`README_TESTFLIGHT.md`](README_TESTFLIGHT.md) — the original iPhone-only
  runbook (kept for reference; this guide supersedes it and adds Android).
- [`STYLES_AUDIT.md`](STYLES_AUDIT.md) — mobile styling/formatting contract.
- [`docs/setup-screenshots/`](docs/setup-screenshots/README.md) — where the
  screenshots referenced above live.
