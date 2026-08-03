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

- **W3. Offline the field packet.** The highest-value offline case in the product: the approved
  packet is already a single snapshot object and `packet-offline.ts` already decides what a cached
  copy may CLAIM (live / offline / stale / refused, with "none" distinct from "not recorded"). W3 is
  the service-worker half of work whose honesty rules are already written and tested.

- **W4. One push backend.** `lib/voice/notifications.ts` already speaks Web Push. Generalise it to
  take an audience and a scope, so all three areas share one VAPID key pair and one send path rather
  than growing three. **Self-host it** — the protocol is simple, you already have the sender, and
  FCM/OneSignal would add a dependency and a data-sharing question for no capability you lack.

- **W5. The iOS install walkthrough.** No automatic prompt exists on iOS; the user must use Share →
  Add to Home Screen. A short, dismissible, iOS-only hint — shown once, and only in Safari, not in an
  already-installed session. Without this, iOS push is built and unreachable, which is this
  codebase's signature defect.

- **W6. Mobile fitness pass.** "Make sure everything works on mobile" is its own slice and needs a
  device pass, not a desktop resize. Worth doing after W1–W3 so it is tested inside the installed
  shell, where there is no browser chrome and viewport units behave differently.

---

## 3. What this does NOT need

No Apple Developer account, no Play account, no store review — your summary is right. The only hard
requirements are HTTPS (Vercel gives you that), a correct manifest, and a registered worker.

---

## 4. State

**W1 was already done** before this document was written — see the correction in §0.

**W2 is DONE** (2026-08-03), shipped dark behind `NEXT_PUBLIC_ADMIN_PWA=1`. All three areas now have
a manifest and a scoped worker.

**Next: W5**, the iOS install walkthrough — without it, iOS push is built and unreachable, which is
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
