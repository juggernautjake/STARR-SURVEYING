# PWA + push notifications

**Opened 2026-08-03** at the owner's request. Your summary of how PWAs work is accurate, including
the iOS caveats. What follows is the part that depends on *this* build rather than on PWAs in
general.

---

## 0. You are further along than the question assumes

Before recommending anything I checked what exists, because three times today this codebase already
contained the thing about to be built. It does again:

> **CORRECTED 2026-08-03, an hour after writing.** The first version of this table said the `/dnd`
> and `/AndrewAsh` manifests were **missing**. They are not — I globbed `manifest*.json` and they are
> `manifest.webmanifest`. That was the fourth time in one session I asserted something absent that
> was present, and it happened in the very paragraph claiming I had checked. The corrected table is
> below; the wrong claim is recorded rather than quietly deleted, because the pattern is the point.

| piece | state |
|---|---|
| `public/manifest.json` | **exists** — "Starr Surveying", `start_url: /admin/me`, `scope: /` |
| `public/dnd/manifest.webmanifest` + `public/dnd/sw.js` | **both exist**, registered at scope `/dnd/` |
| `public/AndrewAsh/manifest.webmanifest` + `public/AndrewAsh/sw.js` | **both exist**, same pattern |
| Web Push | **exists** — `PushManager` subscribe + a sender in `lib/voice/notifications.ts` |
| **a service worker for the business app** | **missing — the only real gap** |

So **two of the three PWAs are already complete and installable**, with their own icons, scopes and
workers. D&D and AndrewAsh can be added to a home screen today, and iOS push works for them once a
user does.

The single gap is the **business app**: `public/manifest.json` promises an installable app at
`/admin/me`, and nothing registers a worker for it. So a crew member can install it and get **no
offline and no push** — the manifest writes a cheque the app does not honour.

That is far smaller than "build a PWA", and it is one slice.

---

## 1. Recommendation: three scoped PWAs, not one

**Do not make the whole site one installable app.** Four reasons, in order of weight:

1. **Three unrelated audiences.** A survey crew member installing a field tool does not want a
   tabletop-RPG icon on their phone, and a D&D player does not want `/admin`. One manifest means one
   name, one icon, one `start_url` — you would be picking which audience is second-class.
2. **The codebase is already built this way, deliberately.** `RegisterTabletopPWA` registers at scope
   `/dnd/` and its own comment says unregistering *"by breadth would take out the business app's
   worker"*. Someone already thought about collision between scopes. Collapsing to one worker throws
   that away.
3. **Offline means different things per area.** The crew needs the approved job packet readable with
   no signal — a single JSON object, already shaped for it (see `fieldBrief`, R26). D&D needs sheets
   and rules. The business app needs neither cached aggressively. One cache strategy would be wrong
   for all three.
4. **iOS installs per scope anyway.** A user adds *a* home-screen app; scoping is the natural grain.

**So: keep the scoped-worker architecture and finish it** — give each area a manifest, give the
business app a worker, and share one push backend.

---

## 2. Slices

- ~~**W1. A manifest per area.**~~ **ALREADY DONE, before this document existed.** Both manifests
  exist and are declared from their layouts — `app/dnd/layout.tsx` sets
  `manifest: '/dnd/manifest.webmanifest'`. Struck rather than deleted, because this slice was written
  against a wrong reading of the tree and the correction is worth more than a tidy list.

- **W2. A service worker for the business app.** ✅ **DONE 2026-08-03** — `public/admin/sw.js`,
  `public/admin/offline.html`, `app/admin/components/RegisterAdminPWA.tsx`, mounted in
  `app/admin/layout.tsx`. **Gated off** behind `NEXT_PUBLIC_ADMIN_PWA=1`.

  Follows `RegisterTabletopPWA` deliberately rather than inventing a second pattern: served from
  `/admin/sw.js` so the scope cap is a property of the URL, and the OFF path **actively uninstalls**
  — a flag that merely skips registration leaves an installed worker running forever, which is the
  opposite of a killswitch. It unregisters and clears caches for **its own scope only**, because
  `/dnd/` and `/AndrewAsh/` each run their own worker and a broad `unregister()` from here would take
  both out.

  **What it refuses to cache is the point, and more so here than for the tabletop app**: never
  `/api/…` (every route is caller-scoped and role-gated, so a cached response is someone else's pay
  or someone else's job), never non-GET, and navigations are network-only with an offline page rather
  than network-first-then-cache — nothing authenticated is in the cache by design, and pretending
  otherwise is how a signed-out user reads a signed-in page on a shared device.

  The offline page says what is true: the data lives on the server, and **nothing you saved has been
  lost** — which is the thing a crew member will actually fear.

  Fourteen tests pin the cautious properties rather than the caching, because a worker outlives the
  deploy that installed it and a mistake persists until a user clears site data.

  **To turn it on:** set `NEXT_PUBLIC_ADMIN_PWA=1` in Vercel. It is off until then, so this ships
  dark and can be enabled after a browser check on a real device.

- **W3. Offline the field packet.** ✅ **PARTLY DONE 2026-08-03 — and the remainder is a decision, not
  a task.** The slice assumed the payload caching still needed building. It did not: `readCache` /
  `writeCache` / `resolveOffline` are already wired into `JobResearchPacket.tsx`, so the packet is
  cached in `localStorage` with the honest freshness rules (live / offline / stale / refused, "none"
  distinct from "not recorded").

  **The real gap was on either side of that, and neither was the service worker.**

  1. **Nothing could enumerate the cache.** Offline, a crew member got a bare "no connection" with no
     way to learn what they already had. `listCachedPackets` now returns metadata — job id and when
     the copy was taken — **never the payload**, and the offline page lists them.
  2. **Nothing ever cleared it.** `localStorage` has no expiry, so a customer's parcel research
     outlived the session that fetched it. On work vehicles and shared tablets that is a privacy
     problem, and it is the same shared-device concern W2 raised about the service-worker cache.
     `clearAllPacketCaches` now runs on sign-out from `AdminTopBar`.

  The offline page reports **when** a copy was taken and deliberately no verdict. `resolveOffline`
  owns live/stale/refused and its thresholds; the page is plain HTML served by the worker and cannot
  import the module, so restating those numbers in hand-written JS would put them in two places —
  the exact defect `survey-primitives-are-not-duplicated` exists to catch. A test asserts the page
  contains the **derived** cache prefix (so bumping `CACHE_VERSION` fails the build) and none of the
  threshold values.

  ### ▶ W3b — the remaining half conflicts with W2, and that is the owner's call

  Fully *rendering* a packet with no signal means serving `/admin/jobs/[id]` from cache. W2 refuses
  that deliberately, and the reasoning still holds: *"nothing authenticated is in the cache by
  design, and pretending otherwise is how a signed-out user reads a signed-in page on a shared
  device."* The two goals are in direct tension and no amount of implementation resolves it.

  The shape that would honour both is an **app-shell route** — a static, precacheable page containing
  no user data, which reads the packet from `localStorage` on the client. That keeps authenticated
  HTML out of the cache while making the cached data reachable. It is still a widening: today the
  data is only reachable through an authenticated page; then it would be reachable by anyone holding
  an unlocked device until sign-out. Clearing on sign-out (shipped above) bounds that, but does not
  eliminate it — an unlocked, still-signed-in tablet left in a truck is the case that stays open.

  **Recommend deciding, not building.** Cost is moderate; the exposure change is real and is a
  judgement about how the crews actually handle devices, which is the owner's to make.

- **W4. One push backend.** ✅ **DONE 2026-08-03.** `lib/push/web-push.ts` is now the single Web Push
  transport, and `lib/voice/notifications.ts` — which *was* the push backend — is one of its callers.

  **The design question was what to share, and the answer is not "everything".**

  - **VAPID keys ARE shared.** They identify the application *server* to the push service, not the
    application. One pair legitimately serves all three scopes; generating three would mean three
    secrets to rotate for no isolation benefit. Env is `PUSH_VAPID_PUBLIC_KEY` /
    `PUSH_VAPID_PRIVATE_KEY` / `PUSH_VAPID_SUBJECT`, **falling back to the existing `VOICE_VAPID_*`**
    — those keys are already set in the deployment, and a rename that silently turned push off for
    the one area currently using it would be a poor way to "unify" anything.
  - **Subscription storage is NOT shared, and the transport touches no database.** Each area keeps
    its own table and its own disable policy. The studio's three-strike rule stays in
    `notifications.ts` because it is the studio's decision, not a property of Web Push — and a
    transport that wrote to a table would have to know *which* table, which is exactly what made the
    original impossible to reuse.

  Self-hosted, as the slice recommended. No FCM, no OneSignal, no new dependency: `web-push` is
  still resolved at runtime behind a bundler-opaque `require` (that trick moved into the transport
  rather than being copied a second time), so `npm install web-push` plus two env vars remains the
  entire activation.

  **Two boundary cases carry most of the value**, and both are tested:
  - `sendPush` returns `[]` when push is unconfigured — **distinct from a list of failures**. If it
    returned failures, a caller in an environment with no keys would disable every subscription it
    had.
  - A failure is `{ gone }` rather than a boolean. 404/410 mean the browser discarded the endpoint
    for good; **a 500 or 429 is transient**, and treating one as the other unsubscribes every device
    during an outage.

  16 tests, including three that assert the existing caller was actually rewired — an extracted
  module with no caller is the defect this codebase produces most often, and W4 would have been a
  perfect place to commit it.

  **What this unblocks:** `/admin/` and `/dnd/` can now send push without a second sender. Neither
  does yet — each needs its own subscription table and a subscribe UI, which is W4b and belongs with
  W3 (offline field packet) rather than here.

- **W4b. The subscribe path — a crew member can say yes.** ✅ **DONE 2026-08-03.** Everything under
  this already existed and could not reach the other pieces: W2's `/admin/` service worker, W4's
  scope-agnostic sender, and now seed 571's table. What was missing was the **"yes"**. A complete
  push stack with no subscribe path is the built-but-unreachable defect in its purest form, and this
  codebase has produced it in push specifically before.

  Three parts: `seeds/571_admin_push_subscriptions.sql`,
  `app/api/admin/push/subscribe/route.ts` (POST / DELETE), and
  `app/admin/components/EnableNotifications.tsx`, mounted on `/admin/install`.

  **A separate table, not a `scope` column on the studio's.** The two reference different identity
  tables (`registered_users` vs `va_users`), so one shared table would need a nullable FK pair and a
  CHECK to keep them exclusive — a constraint one forgotten branch away from linking a crew member's
  phone to a studio account. Columns otherwise mirror 539 deliberately: every one was there for a
  reason that still applies, and re-deriving them differently is how two tables drift.

  **On `/admin/install` rather than a settings page, because on iOS the install is a PRECONDITION.**
  Push there works only from a home-screen install, so the two belong on one screen; a notifications
  toggle anywhere else would be found by people who cannot yet act on it.

  ### The states are the design

  Collapsing these into "notifications unavailable" would leave a crew member with nothing to do, and
  each has a different remedy:

  | state | why it is its own branch |
  |---|---|
  | unconfigured | no VAPID key in the deployment. Renders **nothing** — an enable button is a promise the deployment cannot keep |
  | unsupported | no `PushManager` at all |
  | **iOS, not installed** | the most common dead end. iOS grants push only to a home-screen install and **the prompt never appears in Safari** — telling someone to "allow notifications" sends them hunting for something that cannot exist |
  | denied | a site cannot re-prompt once refused, so a button that silently does nothing is a lie |
  | subscribed | already on for this device; say so instead of offering to redo it |

  ### The quiet failures it avoids

  - **Upsert on `endpoint`** (UNIQUE). The endpoint is stable per browser install, so a plain insert
    gives a phone one row per app launch and the crew member one copy of every alert per launch.
  - **Re-subscribing re-arms a disabled device** — `failure_count` and `disabled_at` reset, because
    the browser handing us a subscription IS it telling us the endpoint is live again.
  - **A partial subscription is a 400, not a row.** A row missing a key looks like an enabled device
    and can never deliver: the user believes alerts are on and simply never receives one.
  - **DELETE is scoped to `user_id` as well as `endpoint`** — endpoint alone would let any signed-in
    user unsubscribe any device by replaying an endpoint string.
  - **A server rejection unsubscribes the browser again**, or the device sits with the UI saying
    "on" while nothing can ever arrive.
  - **`getRegistration('/admin/')`, not `serviceWorker.ready`** — `ready` resolves against any
    controlling scope, and `/dnd/` and `/AndrewAsh/` run their own workers.

  **The multi-tenancy gate caught this**, which is the check earning its keep: a new admin API route
  must resolve to a bundle or a reasoned open. `push` is classified open alongside `notifications` —
  gating device registration behind a bundle would mean a crew silently stops receiving push when a
  plan changes, with the delivery channel rather than the content as the thing that broke.

  ### ⚠ Not yet applied to the live database

  **Seed 571 is committed, not run.** Applying it is a production schema change and the owner's call.
  It is additive and safe (`CREATE TABLE IF NOT EXISTS`, one index, RLS deny-all), and until it runs
  the route returns a 500 on POST — the UI is otherwise inert, since no VAPID key is configured yet
  either. **To activate the whole feature: apply seed 571, set `PUSH_VAPID_PUBLIC_KEY` /
  `PUSH_VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_PUSH_VAPID_KEY`, `npm install web-push`, and set
  `NEXT_PUBLIC_ADMIN_PWA=1`.**

  **Still device-gated:** the runtime half — a real permission prompt and a real endpoint from a real
  push service — cannot be verified without a phone. Tracked in W6b, not claimed here.

- **W5. The iOS install walkthrough.** DONE 2026-08-03 — added to the EXISTING `/admin/install` page
  rather than as a new banner, because that page is already the "get the app" surface and is already
  reachable from the sidebar behind auth.

  Worth noting what that page previously offered: TestFlight for iPhone and a direct APK for Android
  — the native model needing the 9/yr and 5 accounts the owner asked to avoid. The browser-install
  card now sits alongside them and says plainly that it needs no store and no account.

  iOS gets real steps (Share, Add to Home Screen, open from the icon NOT from Safari) because it gets
  no prompt; Android gets the shorter Chrome path and an acknowledgement that Chrome may offer it
  unasked. The iOS card states the rule that silently defeats push: alerts cannot arrive in an
  ordinary Safari tab, only from the home-screen icon.

  It does not nag someone already inside the installed app — standalone is detected via the media
  query AND `navigator.standalone`, which iOS Safari uses instead and which a media-query-only check
  would miss.

  A multi-tenancy ratchet (`starr-assumptions`) caught the first draft for hard-coding the firm name
  three more times; the copy is generic now, which is better for tenanting and reads no worse.

- **W6. Mobile fitness pass.** ⚠️ **PARTLY DONE 2026-08-03 — the decidable half shipped; the device
  half is NOT done and is not claimed.**

  W6 says this "needs a device pass, not a desktop resize", and that is still true. Most of it —
  real touch targets, thumb reach, behaviour inside the installed shell where there is no browser
  chrome and viewport units change meaning — cannot be established from source or from a resized
  desktop window, and none of it is asserted here.

  **The browser was also unavailable for this slice.** Playwright refused local connections that
  `fetch` from Node completed successfully, across three ports and after closing stale tabs. Rather
  than loop on it, the slice was re-scoped to what is decidable statically. Recorded so the next
  session does not read "W6 partly done" as "the pages were looked at on a phone-sized viewport" —
  they were not.

  ### What shipped: the viewport declaration, which breaks everything else when it is wrong

  Two real defects, both in `app/layout.tsx`:

  1. **A comment claimed pinch-zoom was "locked off so the app feels native". It never was** —
     neither `maximumScale` nor `userScalable` was ever set. **Corrected the comment, not the code**,
     because the comment described the worse behaviour:
     - blocking zoom fails WCAG 2.1 SC 1.4.4, and this app is read outdoors in bright sun by crews
       checking bearings and job numbers on a phone — pinching to confirm a digit is exactly the
       case it would break;
     - it would not even work: iOS Safari has ignored `user-scalable=no` since iOS 10, so the only
       reliable effect is to break Android for low-vision users.

     The dangerous shape here is that the code was RIGHT and the comment was WRONG. Someone tidying
     up by making them agree would have shipped an accessibility regression that looked like a fix.
     `__tests__/pwa/mobile-viewport.test.ts` now fails on that edit — watched failing by making it.

  2. **The viewport was declared twice** — the Next `viewport` export *and* a hand-written
     `<meta name="viewport">` in `<head>`, so every page carried two, with the duplicate shadowing
     or outranking the export depending on order. Removed the hand-written one.

  Also pinned: the offline page (raw HTML outside the React tree, so it inherits none of the app's
  layout rules) declares its own viewport, does not disable zoom, and constrains its width.

  **A third instance of the same self-inflicted bug appeared while writing this**, and it is worth
  naming because it is now a pattern rather than an accident: the zoom sweep failed against the very
  comment explaining *why* zoom is not disabled. Every source-scanning check written today got this
  wrong on its first run. **The failure is not symmetric** — a prose mention causes a false alarm,
  which is annoying but visible, while the same blindness lets a file that merely *describes* a fix
  pass as though it applied one. The stripper here handles `//`, `/* */` **and JSX `{/* */}`; a
  version that knew only the first two would still have failed on this file.

  ### What is left, and what it needs

  #### ▶ 2026-08-04 — a phone-sized BROWSER pass was attempted and did NOT complete

  The 2026-08-03 note above blamed Playwright for refusing local connections. **That diagnosis was
  wrong, and the real cause is now known:** `AUTH_URL` in `.env.local` points at `localhost:3000`,
  which is a dead socket, so every middleware redirect for an unauthenticated request hung forever.
  It looked exactly like a browser that could not reach localhost. Mint a session cookie first and
  the redirect never happens.

  With that understood, a 390x844 pass was run against `/admin/me`, `/admin/install`,
  `/admin/receipts/new` and `/admin/jobs`. **It produced no usable result and none is claimed.**
  Every page returned `textLen: 13` — the string "⏳ Loading..." — with zero interactive elements,
  because `npm run build` had been run earlier in the same session while the dev server was live,
  which replaces `.next` underneath it: the server answers 200 for HTML and 500 for every JS chunk,
  so the React tree never mounts.

  **The measurements from that run said "0 px overflow, 0 undersized tap targets" on all three
  pages, and they were measuring a blank page.** Recording this because it is the same failure this
  document already warns about one section up — an instrument that appears to work and is answering
  a different question — and because "no overflow found" is exactly the kind of result that would
  have been believed. **Never run `npm run build` against a live dev server**; restart it afterwards.

  **W6b — the actual device pass.** Needs a phone, ideally after installing to the home screen so it
  is exercised in the standalone shell. The field-critical surfaces are the shortlist: `/admin/me`,
  the job page and its Work Mode tabs, receipt/photo capture, and `/admin/install` itself. **Not
  deferrable** — "works on mobile" is the owner's explicit requirement and this half is the half that
  actually answers it.

---

## 3. What this does NOT need

No Apple Developer account, no Play account, no store review — your summary is right. The only hard
requirements are HTTPS (Vercel gives you that), a correct manifest, and a registered worker.

---

## 4. State

**W1 was already done** before this document was written — see the correction in §0.

**W2 is DONE** (2026-08-03), shipped dark behind `NEXT_PUBLIC_ADMIN_PWA=1`. All three areas now have
a manifest and a scoped worker.

**W5 shipped**; **W4 shipped** (one transport, self-hosted). **W3 shipped** (cache inventory + clear-on-sign-out; W3b is an owner decision — it conflicts with W2). **W6 partly shipped** (viewport correctness + a zoom-lock guard; the DEVICE pass W6b still needs a phone). **W4b shipped** (seed 571 + subscribe route + EnableNotifications on /admin/install; seed NOT yet applied to live). **What is left is device-gated (W6b) or owner-gated (apply seed 571, set VAPID keys, npm i web-push, NEXT_PUBLIC_ADMIN_PWA=1)** (subscribe UI + a table per area) and W6 (mobile fitness). Previously read: **Next: W5**, the iOS install walkthrough — without it, iOS push is built and unreachable, which is
this codebase's signature defect. Then W3 (offline the field packet) and W4 (one push backend).

### A note on how this document was written, which is the most useful thing in it

Four times in one session I asserted that this codebase lacked something it already had — the render
dirty check, the profiling fixtures, a D&D orphan-check, and these manifests. The last one happened
**inside the paragraph claiming I had checked first**, because I globbed `manifest*.json` against
files named `manifest.webmanifest`.

The pattern is not carelessness about whether to look; it is looking with too narrow a probe and
treating a null result as proof of absence. The cheap defence is the one that caught three of the
four: **when a check comes back empty, widen it once before believing it.** A `find` by extension, a
grep for the concept rather than the filename, or simply `ls` the directory.

This repo is mature enough that "it does not exist" is usually wrong.

### ✅ W6c DONE 2026-08-04 — the phone-width browser pass, this time with a working instrument

The 2026-08-04 note above records a 390px pass that **produced no usable result**: every page returned
`textLen: 13` ("⏳ Loading…") because `npm run build` had replaced `.next` under a live dev server, and
the run cheerfully reported *"0 px overflow, 0 undersized tap targets"* while measuring blank pages.
This is that pass, done against a **fresh production build** on a server that stayed up.

**The instrument came first, in three parts, because this document's own history is the argument for
that.** (1) `scripts/audit-mobile.mjs` already existed with a hardened detector in
`scripts/lib/overflow.mjs` that documents *four things that are NOT overflow* — reused rather than
re-written, since two drifting copies is exactly how that file came to exist. (2) Its `--self-test`
was run first and **passed** — it injects real overflow and two decoys (a closed `<details>`, a fixed
element) and must catch one and ignore both. A sweep is worthless if the probe cannot fail. (3) Every
page was confirmed to actually mount (595–1424 chars, 50–64 interactive elements) before any number
was believed.

One change was needed: the script hardcoded the `dnd_session` cookie name in two places, so it could
not be pointed at the staff app — the surface this PWA work is actually about, since it is what a
field crew opens on a phone. `--cookie-name` / `STARR_SESSION` now selects it.

**Result — no overflow on any field-critical surface**, at three widths:

| width | pages | result |
|---|---|---|
| 390 | `/admin/me`, `/install`, `/receipts/new`, `/work-mode`, `/my-files`, `/time-off`, `/mileage`, `/notifications`, `/search`, `/calendar` | 10/10 clean |
| 360 | the six field-critical ones | 6/6 clean |
| 414 | the six field-critical ones | 6/6 clean |

#### ▶ What the sweep actually found, which was not a layout bug

Three runs died at the **same page**, `/admin/receipts/new`, and the script refused to score it —
*"a load failure, not a layout result."* That honesty is what made the finding reachable.

The first diagnosis was wrong: the server looked dead, and it was not. `Invoke-WebRequest` follows
redirects, `/admin/receipts/new` was answering **307**, and the redirect target resolves through the
`AUTH_URL` pointing at the dead `localhost:3000` — so "unable to connect" was reported for a server
that was answering 200 on the next request.

**The 307 was a regression shipped by S19 hours earlier.** That slice gated `/admin/receipts/new`
with the nav registry's seven roles, which do not include `employee` — the role middleware itself
falls back to (`role || 'employee'`) for any staff member without an explicit one. Its API,
`/api/admin/receipts/upload`, checks **only that a session exists**, no role at all. So the gate was
stricter than the boundary it was supposed to shadow, and a new hire who could file a receipt before
S19 could not after it.

That is the same mistake S19's own commit message describes catching and avoiding — made again, one
level down, in the very entry written to prevent it. The entry now lists all eleven roles, checked
against `ALL_ROLES` rather than a copy, so a twelfth role cannot silently lock its holders out of
expense filing. Deleting the entry is not an option: `/admin/receipts` matches this path too and
first-match-wins would hand it to the approval queue's admin-only gate.

**Verified at runtime against a rebuilt server, which S19 never was:** `/admin/receipts/new` → 200,
`/admin/receipts` → 307, `/admin/me` → 200. 13 middleware tests green.

**W6b (the device pass) is unchanged and still needs a phone.** This pass measured a phone-sized
*viewport* in a desktop browser; it cannot see the standalone home-screen shell, real touch, iOS
Safari's chrome, or the push permission prompt. Recording that distinction rather than letting a
green sweep read as "mobile is done".

### ✅ W6d DONE 2026-08-04 — tap targets, and the nav button that shrank on the smallest phones

W6c measured **overflow** and found none. Overflow is not the whole of "fits on a phone": a control
can sit perfectly inside the viewport and still be too small to hit. This is that half.

**No second measurer was written.** `scripts/audit-voice-mobile.mjs` already had the rules and — more
valuable — the *exemptions* that stop them accusing working markup: 40px for controls, **24 for
links** (WCAG 2.5.8's figure, deliberately not 44, because padding eight reference links to 44 each
builds a 350px wall of whitespace), plus the label-wrapped-input case where measuring the 17px box
inside a 44px label reports a target that is not the target. That reasoning is the expensive part and
it is not specific to the voice studio. It was hardwired to it — thirteen routes and a form login —
so it now takes `--routes` and a session cookie. Copying the thresholds instead is how this repo
ended up with two overflow detectors that disagreed.

**17 undersized controls per route, and 7 of them were chrome** — the same elements on every page, so
one rule each moved them everywhere:

| control | was | now | why it mattered |
|---|---|---|---|
| `.admin-topbar__hamburger` | 36px, **and 32px below 480px** | 44px | The single most-tapped control the app has on a phone: it is how navigation opens at all. It only ever *displays* below 1023px, so every size it has ever had was a touch size — and the responsive rule made it **smaller on the narrowest screens**, which is exactly backwards. |
| `.admin-sidebar__section-label--collapsible` ×5 | 32px | 44px (≤1023px only) | Not headings. `role="button"`, `onClick`, `tabIndex={0}` — each expands a nav section. Raised only inside the breakpoint where the sidebar *becomes a drawer*; the desktop sidebar keeps its compact spacing, because padding every label there costs vertical room in a list people scan rather than tap. |
| `.notif-bell__btn` | 36px | 40px | 40 rather than 44: it shares a 390px row with the wordmark and the avatar, and the hamburger has already taken 44. |

**The icon inside the hamburger stays 18px.** The target grew, not the glyph — nothing about the
topbar's appearance changes except how easy it is to hit.

**Re-measured after rebuilding, and the fix was checked for the defect it could cause.** All three
disappear from the report. Enlarging controls is a plausible way to *create* horizontal overflow, so
the overflow sweep was re-run at 360 and 390 across all six routes: still clean. A fix that trades one
defect for another is not a fix.

#### ▶ What is still undersized, measured rather than estimated

**10 per route remain, and they are all Hub-widget controls**, identical on `/admin/me` and
`/admin/work-mode` because both render the widget grid:

| control | size | floor |
|---|---|---|
| `"CS"` chip · `"✏️ Customize Hub"` | 34px | 40 |
| `"All steps"` | 39px | 40 |
| `"×"` (dismiss) | 28px | 40 |
| `widget-go-to-link` — *"Go to the schedule→"*, *"Go to jobs→"* | 19px | 24 (link) |

Left for a follow-up rather than swept up here: they are one component family with a shared layout,
and the 19px links in particular need a judgement about whether to pad them or restyle them as
buttons — which is the choice the auditor's own comment warns against making by reflex. **Recorded
with numbers so the next pass starts from measurement, not from "the hub feels cramped".**

**W6b is unchanged and still needs a phone.** A 390px viewport in a desktop browser measures
geometry; it cannot tell you whether a 44px button is comfortable in a gloved hand in a truck.
