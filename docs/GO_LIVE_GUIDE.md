# Go-Live Guide — Getting the App to Your Employees

**Audience:** the owner (non-developer). This explains, in plain terms, every
account/credential you need, what each one costs, and the exact steps to get
**Starr Field** (the phone app) onto your employees' phones — either by them
downloading it from the admin website (`/admin/install`) or from a link you text
them.

> Costs below are 2026 ballparks — always confirm current pricing on each
> vendor's site. Anything marked **OPTIONAL** is only needed for a specific
> feature; you can launch without it.

---

## 1. The big picture — there are two pieces

1. **The backend website** (`starr-surveying.com` admin area). This is the
   Next.js app in this repo. It runs in the cloud, holds the database, and serves
   the page employees use to download the phone app (`/admin/install`).
2. **The phone app — "Starr Field"** (the `mobile/` folder). A real iPhone/Android
   app built with Expo. Employees install it and it talks to the same backend.

You stand up #1 first, then build + distribute #2. The download page on #1 is how
employees get #2.

---

## 2. Accounts & credentials you need (with cost)

### Required to launch
| Service | What it's for | Cost (2026 ballpark) |
|---|---|---|
| **Domain name** (`starr-surveying.com`) | The web address | ~$12–20 / year |
| **Vercel** | Hosts the backend website | Free to try; **Pro ~$20/user/mo** for commercial use |
| **Supabase** | Database, employee logins, file storage | Free tier; **Pro ~$25/mo** once you have real data |
| **Google Cloud (OAuth)** | "Sign in with Google" for employees | Free |
| **Apple Developer Program** | Required to put the app on **iPhones** (via TestFlight) | **$99 / year** |
| **Expo / EAS account** | Builds the iPhone + Android app | Free tier is enough to start; paid plans speed up builds |
| **Resend** (email) | Sends emails to customers/employees | Free up to ~3,000/mo, then **~$20/mo** |

### Optional (per feature)
| Service | Unlocks | Cost |
|---|---|---|
| **Anthropic API** | AI receipt reading + AI property research | Usage-based (pay per use) |
| **Google Maps API** | Maps, address autocomplete | Usage-based; has a monthly free credit |
| **Stripe** | Charging customers / subscriptions | ~2.9% + 30¢ per charge |
| **Twilio** | Text-message (SMS) alerts | Usage-based (~1¢/text) |
| **DigitalOcean droplet** | The heavy AI property-research scraper | ~$6–12 / mo |
| **PowerSync** | Offline sync for the field app | Free tier; paid at scale |
| **Sentry** | Crash reporting for the phone app | Free tier |
| **Google Play Developer** | Only if you publish to the Play **Store** (not needed for the direct-APK method below) | **$25 one-time** |

**Cheapest realistic "just get my crew on the app" monthly:** domain + Vercel Pro
+ Supabase Pro + Apple Developer (annualized) ≈ **~$55–70/mo**, plus small
usage-based charges for AI/maps/email only if you use those features.

---

## 3. Stand up the backend website (one-time)

1. **Buy the domain** (Namecheap, Cloudflare, Google Domains, etc.).
2. **Create a Supabase project.** Copy three values from Settings → API:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` (keep the service-role key secret).
   - Run the SQL files in `seeds/` (in numeric order) in the Supabase SQL editor
     to create the tables — or, far faster, run them all in one command with the
     helper script (needs `psql` + your DB connection string from Supabase →
     Settings → Database → Connection string → URI):
     ```bash
     ./scripts/run-seeds.sh "postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"
     ```
     (Add `--dry-run` first to preview the order. It skips the destructive
     `000_reset.sql` unless you pass `--with-reset`.)
   - Then add the Storage buckets noted in the seed comments (e.g.
     `message-attachments`, `lead-attachments`, `user-files`) with the
     service-role policy each file describes (storage-object policies are added in
     the dashboard, not via SQL).
3. **Create Google OAuth credentials** (Google Cloud Console → Credentials → OAuth
   client → Web). Authorized redirect URL:
   `https://starr-surveying.com/api/auth/callback/google`. Copy
   `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`.
4. **Create a Resend account**, verify your sending domain, copy `RESEND_API_KEY`.
5. **Deploy to Vercel:** connect this GitHub repo, then paste all the environment
   variables (see `.env.example` for the full list) into Vercel → Settings →
   Environment Variables. The must-haves to boot:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXTAUTH_URL=https://starr-surveying.com`, plus a `NEXTAUTH_SECRET`
     (generate with `openssl rand -hex 32`)
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `ADMIN_EMAILS=hankmaddux@starr-surveying.com,jacobmaddux@…` (these accounts
     get admin automatically)
   - `RESEND_API_KEY`
   - `CRON_SECRET` (any long random string — protects the scheduled jobs in
     `vercel.json`, e.g. the 6pm "still clocked in" reminder)
   - Add `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `STRIPE_*`,
     `TWILIO_*` **only when you turn those features on.**
6. Point the domain's DNS at Vercel. The admin site is now live at
   `https://starr-surveying.com/admin`.

---

## 4. Build the phone app "Starr Field" (one-time, repeat per update)

The app lives in `mobile/`. It's built with **Expo Application Services (EAS)**.

1. **Apple Developer Program** ($99/yr) — enroll at developer.apple.com. This is
   mandatory for iPhone distribution. (Android needs no paid account for the
   direct-APK method.)
2. **Install the build tooling** (on any Mac/PC, one time):
   `npm install -g eas-cli`, then `eas login`.
3. **Set the app's public env** in `mobile/eas.json` build profiles (copy from
   `mobile/.env.example`): `EXPO_PUBLIC_SUPABASE_URL`,
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` (same Supabase project as the web app).
   Optional: `EXPO_PUBLIC_POWERSYNC_URL`, `EXPO_PUBLIC_SENTRY_DSN`.
4. **Build the two installers** from inside `mobile/`:
   - **iPhone (TestFlight):** `eas build --platform ios --profile production`,
     then `eas submit --platform ios` to push it to TestFlight. Apple processes
     it; you then get a **TestFlight invite link**.
   - **Android (.apk):** `eas build --platform android --profile preview` (the
     `preview` profile already produces an `.apk`). EAS gives you a **download
     URL** for the signed `.apk`.

That's it — you now have one TestFlight link and one `.apk` link.

---

## 5. Make employees able to download it (the part you asked about)

The admin site already has a built-in download page: **`/admin/install`**. It shows
an iPhone card (TestFlight) and an Android card (direct APK + QR code), behind the
normal login. To wire it up, set two env vars in Vercel and redeploy:

- `NEXT_PUBLIC_MOBILE_TESTFLIGHT_URL` = the TestFlight invite link from step 4.
- `NEXT_PUBLIC_MOBILE_ANDROID_APK_URL` = the `.apk` download URL from step 4
  (or upload the `.apk` to Supabase Storage / the site and use that URL).
- (Optional) `NEXT_PUBLIC_MOBILE_APP_VERSION` so the page shows the version.

Now there are **two ways** employees get the app:

1. **From the website:** they sign in at `starr-surveying.com/admin`, open
   **Install** in the menu, and tap the button for their phone. iPhone users are
   handed to TestFlight; Android users download the `.apk` directly (they tap
   "allow from this source" once — normal for company apps).
2. **From a link you send:** just text/email them the **TestFlight link**
   (iPhone) or the **APK link** (Android) directly. Same destination, no website
   visit needed. The `/admin/install` page also renders a **QR code** they can
   scan.

---

## 6. Employee onboarding flow (what each new hire does)

1. You add them: in **`/admin/users`**, add their email (or they self-register at
   `/register` and you approve them). Set their role (e.g. `field_crew`).
2. They install the app via TestFlight or APK (section 5).
3. They open Starr Field and **sign in with the same email** (Google or
   email/password) — the app and website share one Supabase login.
4. They can now clock in/out, record receipts, capture field data, see jobs, get
   alerts, etc. Their data syncs to the same backend you see in `/admin`.

---

## 7. Keeping it running

- **Scheduled jobs** (6pm clock-in reminders, etc.) run automatically via
  `vercel.json` crons — they just need `CRON_SECRET` set (section 3).
- **App updates:** rebuild with EAS (section 4) and update the two install env
  vars / re-submit to TestFlight. Employees get the new version from the same
  links.
- **Secrets hygiene:** never put `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
  or `STRIPE_SECRET_KEY` in the mobile app or anywhere public — they live only in
  Vercel's server env. Only `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` values are safe to
  ship to a browser or phone.

---

### TL;DR fast path to "my crew is on the app this week"
1. Domain + Vercel + Supabase + Google OAuth + Resend → deploy the site.
2. Apple Developer ($99/yr) + free Expo account → `eas build` iOS + Android.
3. Paste the TestFlight + APK links into `NEXT_PUBLIC_MOBILE_TESTFLIGHT_URL` /
   `NEXT_PUBLIC_MOBILE_ANDROID_APK_URL`, redeploy.
4. Add employees in `/admin/users`, send them to `/admin/install` (or text them
   the link). Done.
