# PWA + push notifications

**Opened 2026-08-03** at the owner's request. Your summary of how PWAs work is accurate, including
the iOS caveats. What follows is the part that depends on *this* build rather than on PWAs in
general.

---

## 0. You are further along than the question assumes

Before recommending anything I checked what exists, because three times today this codebase already
contained the thing about to be built. It does again:

| piece | state |
|---|---|
| `public/manifest.json` | **exists** — "Starr Surveying", `start_url: /admin/me`, `scope: /`, themed `#BD1218`, 192/512 icons |
| `public/dnd/sw.js` | **exists** — a real service worker, registered by `app/dnd/_ui/RegisterTabletopPWA.tsx` at scope `/dnd/` |
| `public/AndrewAsh/sw.js` | **exists** — same pattern, `RegisterVoicePWA.tsx` |
| Web Push | **exists** — `NotificationPanel.tsx` subscribes via `PushManager`, `lib/voice/notifications.ts` sends |
| a manifest for `/dnd` or `/AndrewAsh` | **missing** |
| a service worker for the business app | **missing** |

So the state is **inverted between areas**:

- **Business app** — installable (has a manifest), but no service worker: no offline, no push.
- **D&D and AndrewAsh** — have offline/push machinery, but no manifest, so they cannot be installed
  as their own app with their own icon. On iOS that also means **push cannot work there**, because
  iOS only delivers push to a home-screen install.

That is the actual gap, and it is much smaller than "build a PWA".

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

- **W1. A manifest per area.** `/dnd/manifest.webmanifest` and `/AndrewAsh/manifest.webmanifest`,
  each with its own name, icons, `start_url` and `scope`, linked from that area's layout. This alone
  makes both installable — and is what unblocks **iOS push for D&D**, which today cannot work at all.

- **W2. A service worker for the business app.** The manifest already exists and promises an app;
  without a worker there is no offline and no push for the crew. Scope `/admin/`, matching the
  existing pattern rather than inventing one.

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

Not started. W1 is the smallest and unblocks the most: two manifest files and two `<link>` tags make
both existing service workers into installable apps, and turn on iOS push for D&D.
