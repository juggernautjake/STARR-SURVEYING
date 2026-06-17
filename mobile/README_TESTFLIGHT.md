# TestFlight runbook — Starr Field on iPhone

> **Audience.** Operator running the first internal TestFlight build of
> Starr Field for Hank + Jacob Maddux to use in the field.
>
> **Outcome.** The Starr Field app on both phones in ~45 minutes of
> wall-clock time (Apple's build queue dominates).
>
> **Skip Android for now.** The same EAS profiles ship for Android; you
> don't have one yet and your dad doesn't either, so M6 (Android) is
> deferred. Re-open this doc later for the Google Play steps.

## Before you touch a keyboard

You need **three** pieces of information from the
[Apple Developer account](https://developer.apple.com/account):

| Where to find it | What it looks like | Notes |
|---|---|---|
| **Apple ID** | Your developer-account email | The one paid for the developer membership |
| **Team ID** | 10 chars, e.g. `A1B2C3D4E5` | `Membership` page, top right |
| **App Store Connect App ID** | 10-digit numeric, e.g. `6483019272` | Visible AFTER step 2 below |

If your developer agreement has lapsed (Apple wants you to re-sign their
program terms once a year), do that FIRST. EAS will surface a clear
error if you try to build before re-signing, but it adds five minutes.

## Step 1 — fill in `mobile/eas.json`

Replace the three `REPLACE_WITH_*` placeholders in
`mobile/eas.json` with your real values:

```diff
   "ios": {
-    "appleId": "REPLACE_WITH_APPLE_ID",
-    "ascAppId": "REPLACE_WITH_APP_STORE_CONNECT_APP_ID",
-    "appleTeamId": "REPLACE_WITH_APPLE_TEAM_ID"
+    "appleId": "henry@example.com",
+    "ascAppId": "6483019272",
+    "appleTeamId": "A1B2C3D4E5"
   }
```

> ⚠️ The `ascAppId` doesn't exist yet — fill it in after Step 2.

The **validator** at `mobile/scripts/check-eas-config.mjs` runs the
moment you `npm run build:ios` and refuses to invoke EAS if any
placeholder is still present. Re-run after each edit until it's
clean:

```bash
cd mobile
npm run check-eas
```

## Step 2 — one-time App Store Connect app record

Sign in to [App Store Connect](https://appstoreconnect.apple.com/),
then `My Apps → +` to create an app:

| Field | Value |
|---|---|
| **Platforms** | iOS |
| **Name** | Starr Field |
| **Primary Language** | English (U.S.) |
| **Bundle ID** | `com.starrsoftware.starrfield` (matches `mobile/app.json`) |
| **SKU** | `STARRFIELD0001` (anything sensible) |
| **User Access** | Limited (you + your dad as testers in step 4) |

After save, copy the **Apple ID** number that appears at the top of the
app's `App Information` page — THAT is the `ascAppId` you put back into
`eas.json`.

> Do NOT submit for App Store review yet. TestFlight Internal track is
> all you need.

## Step 3 — first build + submit

From the repo root:

```bash
cd mobile
npm install --force                                     # one-time
npx eas login                                            # interactive, signs in with your Apple ID
npx eas build --profile preview --platform ios           # ~15 min on the EAS cloud
```

When EAS asks "Do you want EAS to manage credentials?" answer **yes**.
The follow-up "Do you have a distribution certificate?" answer **no** —
EAS will create one. Same with provisioning profile.

When the build finishes (EAS prints a green ✅ + a URL), run:

```bash
npx eas submit --profile production --platform ios --latest
```

This uploads the just-built `.ipa` to App Store Connect. Apple's
processing takes 10-30 more minutes; you'll get an email when it lands
in TestFlight.

## Step 4 — install on both iPhones

1. **You.** Install the TestFlight app from the App Store. Apple emails
   the invite to your developer-account email; tap "Start Testing".
2. **Your dad.** Open App Store Connect → `Users and Access` →
   `Testers` → `+` → enter his Apple ID email. Save. He gets the same
   email + can install via TestFlight on his phone.

## Step 5 — smoke test the field flow

Run this once on each phone, end-to-end:

1. **Sign in.** Existing email + password against production Supabase
   already works (`mobile/app/(auth)/sign-in.tsx`).
2. **Receipt.** `Money` tab → capture FAB → snap a real receipt →
   preview → approve → wait ~10 s. Verify it appears in `/admin/receipts`
   on the web with AI extraction in `extracted` state.
3. **Point photo.** `Jobs` tab → pick any real job → `Points` → tap a
   point → `Photos` → camera. Verify the photo appears under that point
   on the web job-detail view within 30 s of network availability.
4. **Customer query.** From the web, submit a fake query through the
   contact form. Verify the bell-icon notification fires on the mobile
   app within ~5 s of the submission landing in `/admin/leads`. Tap it
   to confirm the deep link routes to the right card.

If any of (1)/(2)/(3)/(4) fails on real hardware, capture a screen
recording + share with the dev. Those become their own slices
(M5a/b/c/d).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `npx eas build` errors "missing bundle identifier" | `app.json` got corrupted | Re-check `expo.ios.bundleIdentifier === 'com.starrsoftware.starrfield'` |
| `eas submit` errors "invalid Apple ID" | Step 1 still has a placeholder | Re-run `npm run check-eas` until it passes |
| Build finishes but ASC says "binary rejected" | Provisioning profile is missing a capability | Trigger another build; EAS regenerates the profile |
| TestFlight email never arrives | Apple's ID system is async; can take 30 min | Check spam, then check ASC `Users and Access → Testers` to confirm the row exists |

## When Android time comes

You and your dad both have iPhones, so M6 stays deferred. When a
non-Apple field crew member joins, add:

- a Google Play Console developer account ($25 one-time, not annual)
- the `mobile/eas.json` Android `submit.production` block already has
  `serviceAccountKeyPath: ./google-play-service-account.json` — drop
  the JSON file there and re-run `eas submit --platform android`

Same `preview` profile, same `eas build` command, just `--platform
android` instead.
