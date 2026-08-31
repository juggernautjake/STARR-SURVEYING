# Keys and APIs — what to set, where, and how to prove it worked

**Written 2026-08-30.** Every claim here was measured against the live system, not read off a
config file. Where something is unknown, it says so.

This exists because "is it configured?" and "does it work?" are different questions, and this
platform has repeatedly answered the first while believing it answered the second. A key can be
present and unread. An API can be enabled and still refused. A green health check can be reporting
on a machine it cannot see.

---

## 0. The three places configuration lives

| Place | What it configures | How you edit it |
|---|---|---|
| **Doppler** (`prd` config) | The **source of truth.** | Doppler dashboard |
| **Vercel** env vars | The **Next.js app** — every `/api/...` route, the admin UI, the watches. A mirror of Doppler. | Vercel dashboard, or synced from Doppler |
| **`/opt/starr/worker/.env`** on the netcup box | The **worker** — the research pipeline, county adapters, document purchase. | SSH to the box and edit the file, then rebuild |

**The app and the worker are separate processes with separate environments.** A key set in Vercel
is invisible to the worker and vice versa. This has cost real time twice: `TAVILY_API_KEY` was set
on the worker, which never reads it, and `WS_TICKET_SECRET` was nearly set there for the same
reason. If you are unsure which process needs a key, ask before setting it in both.

---

## 1. Google Maps — the live task

### What is already done ✅

You enabled Places, Geocoding and Maps Static on the Cloud project on 2026-08-30. Measured
confirmation: the errors changed from *"this API is not activated"* to a **different** refusal,
which is what proves the enabling worked.

### Step 1 — ~~add Maps Static to the browser key~~ **NOT NEEDED — corrected 2026-08-30** ✅

The first version of this guide said to add Maps Static and Geocoding to the existing key. That was
wrong, and checking which code actually calls them is what caught it:

| API | Call sites | All server-side? |
|---|---|---|
| Maps Static | `parcel-map-capture`, `progressive-zoom`, `lot-correlator` | **yes** |
| Geocoding | `boundary-fetch` | **yes** |
| Places | `AddressAutocomplete` (browser SDK) | no — browser |
| Maps JavaScript | the map itself | no — browser |

**Nothing in the browser calls Maps Static or Geocoding.** So the browser key needs exactly what it
already has — Maps JavaScript API and Places API — and adding more to it would widen a public key's
reach for no gain. Leave it alone.

The Cloud Console screen showing *"No API keys to display"* for Maps Static is therefore not a
problem to fix on that key; it is the reason to create the second one below.

### Step 2 — create a SECOND key for server-side use ☐ **← the whole task**

**This is the step that is easy to miss, and nothing works without it.**

Your current key is a **browser** key restricted by HTTP referrer. That is correct and safe for the
address autocomplete, which runs in the browser. But the research pipeline calls Google **from the
server**, and a server request sends no referrer, so Google refuses it:

> `"API keys with referer restrictions cannot be used with this API."`

No amount of enabling APIs fixes this. It needs a different key.

1. Cloud Console → Credentials → **Create credentials → API key**
2. Name it something like `starr-server-maps`
3. **Application restrictions: None.**

   Not "IP addresses", and the reason matters. Three of the four server-side callers
   (`boundary-fetch`, `parcel-map-capture`, `progressive-zoom`) run **on Vercel**, whose function
   egress IPs are dynamic — an IP allow-list would work for the worker box and silently break the
   app. Only `lot-correlator` runs on the netcup box at `152.53.48.240`.

   "None" is safe here **because this key never reaches a browser.** Its protection is that it lives
   only in Doppler and the worker's `.env`, never in a `NEXT_PUBLIC_` variable. If you later put
   Vercel's static-IP add-on in place, tighten this to an IP list then.
4. **API restrictions:** Geocoding API + Maps Static API — those two only. Not Places, not Maps
   JavaScript; the browser key covers those and this key should be able to do nothing else.
5. Set it in **both** places, because both the app and the worker call Google server-side:
   - **Doppler `prd`** → `GOOGLE_MAPS_SERVER_KEY` (Vercel picks it up)
   - **`/opt/starr/worker/.env`** → `GOOGLE_MAPS_SERVER_KEY`

The code accepts either `GOOGLE_MAPS_SERVER_KEY` or `GOOGLE_MAPS_API_KEY`. Prefer the first; the
second exists because the key already existed under that name.

> **Never set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` as the server key.** It is public to every visitor
> and referrer-restricted, so it both fails and puts a billed API behind a value anyone can read
> from your page source. The code now refuses to fall back to it and says so in the logs.

### Step 3 — prove it ☐

**Autocomplete (browser):** open the New Research Project form and type an address. If the yellow
"Address suggestions are unavailable" notice is gone and suggestions appear, it works. *A
command-line test cannot answer this* — the REST endpoint refuses referrer-restricted keys whatever
referrer is sent, while the browser SDK uses a different endpoint. Only the real form settles it.

**Server-side (Static Maps + Geocoding):** ask me and I will re-run the probe. It returns an image
(not a 403) when the server key is right.

---

## 2. The worker box — what must be set

SSH to the box, then `cd /opt/starr/worker` and edit `.env`.

### Critical — the worker refuses to start correctly without these

| Variable | Why | State |
|---|---|---|
| `WORKER_API_KEY` | Authenticates every app→worker call. Must be the **same string** in Vercel and on the box. | ✅ set, and verified matching (the box answers 401/403/200 to no-header/wrong-key/right-key) |
| `ANTHROPIC_API_KEY` | Every AI step in the pipeline. | ✅ set |

### Already set and verified ✅

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `STORAGE_BACKEND=r2` plus the four
`R2_*` values, and `TEXASFILE_USERNAME` / `TEXASFILE_PASSWORD` (funded, card on file).

### Still to set ☐

| Variable | What it unlocks | Notes |
|---|---|---|
| `GOOGLE_MAPS_SERVER_KEY` | Aerial/topo imagery in research runs | §1 Step 2 above |

### Deliberately NOT set

`WS_TICKET_SECRET` on the worker — the worker does not verify tickets and never did. Setting it
there puts a secret on a machine that will never read it. (It **is** needed in Vercel, where
`/api/ws/ticket` runs.)

### After any change to the worker's `.env`

```bash
cd /opt/starr && git pull
cd worker && BUILD_SHA=$(git rev-parse --short HEAD) docker compose up -d --build
curl -s https://worker.starr-surveying.com/healthz | head -c 400
```

**Do this now regardless of the keys.** The deployed build is behind `main`, and the staleness is
*faking a green light*: it still contains a `TAVILY_API_KEY missing` warning that `main` deleted, so
the current `warnings: []` proves only that a key is set on a box where no file reads it. The
redeploy also ships this session's fixes — the per-run spend limit, the removed false
`websocket_auth` check, and the map-image failures that now say why.

---

## 3. Vercel / Doppler — the app side

Doppler `prd` is the source of truth; Vercel mirrors it.

| Variable | Purpose | State |
|---|---|---|
| `WORKER_API_KEY` | Must match the worker's exactly | ✅ verified matching |
| `ANTHROPIC_API_KEY` | Receipt AI, research analysis, the tutor | ✅ |
| `TAVILY_API_KEY` | Open-web research, lead enrichment, the portal + regulatory watches | ✅ set 2026-08-28 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Browser maps + autocomplete | ✅ set (referrer-restricted, correctly) |
| `GOOGLE_MAPS_SERVER_KEY` | Server-side geocoding and imagery | ☐ **to do** — §1 Step 2 |
| `WS_TICKET_SECRET` | `/api/ws/ticket` returns 503 without it | ☐ check whether set |
| VAPID keys | Admin push notifications | ☐ not set — push is inert until they are |
| Stripe keys + `PAYMENTS_LIVE` | Taking payments | ☐ **off by design.** Empty keys plus no flag is the correct state for "payments not switched on". Do not set these until you intend to take card payments. |

> **`vercel env pull` blanks encrypted variables.** A blank in a pulled file is **not** evidence a
> key is missing. Check the Doppler or Vercel dashboard, not a local file.

### The 16 vendor credentials that are empty

ATTOM, Regrid, TNRIS, Landex, USPS, Mapbox, ElevenLabs and the county-portal logins (Kofile, GovOS,
Henschen, iDocket, Fidlar, Tyler, CSLexi, Landex) are all unset. **This is mostly fine** — the
counties you work in route to free portals or to TexasFile, which is funded.

Two are worth money if you ever want them:

- `IDOCKET_PAY_*` — **$0/page across 18 counties.** Those counties currently route to TexasFile at
  $1/page instead. Free money if an account is free to create.
- `TYLER_PAY_*` ($0.50/page, 7 counties) and `FIDLAR_PAY_*` ($0.75/page, 13 counties) — same trade.

---

## 4. Decisions that are yours, not configuration

| Item | Recommendation |
|---|---|
| **Browserbase** | **Decide AFTER the first real run, not before** — see §4b. Earlier advice here said "cancel", which under-weighted one fact: the worker is in **Vienna**, and a Texas county portal seeing automated traffic from an Austrian datacentre IP is a classic blocking profile. Nothing has been blocked, but nothing has been tried either — those are currently the same observation. |
| **CapSolver** | Key was rejected. Only needed for counties with captchas; none of yours currently. Leave it. |
| **Google Business Profile** | Photos, description (paste-ready text is in the planning doc §G4), and reviews. Slow real-world work, biggest effect on lead volume. |
| **Profile URLs** | Business Profile, Facebook, LinkedIn, BBB — whichever exist. They fill `sameAs` in the site's structured data. If some do not exist, say so and the field gets dropped rather than left half-filled. |

---

## 4b. Browserbase — would it help, and what would switching it on take?

**Measured live 2026-08-30:** `/healthz` reports `browser: {"backend":"local"}`. The worker launches
its own Chromium; Browserbase is paid for and idle, as it has been for four months.

### Would it be useful?

Its real value for this platform is **US-based, less-flagged IPs and anti-fingerprinting** — not
"cloud browsers" as a feature. That matters here for one specific reason: **the worker is in Vienna,
Austria.** A Texas county clerk portal receiving automated traffic from an Austrian datacentre IP is
a recognisable profile for blocking or geo-filtering.

**But no portal has ever blocked us, because no purchase run has ever executed.**
`research_document_purchases` has 0 rows. "We do not need it" and "we have not tested it" are
currently the same observation, and only the first sounds like a conclusion.

### So: run the test first

The first real research run (§5) is the cheapest possible experiment and it is decisive:

- **Run completes normally** → cancel Browserbase. The Vienna IP is fine and the money is waste.
- **Portal blocks or challenges** → you have a concrete reason to enable it, and you know exactly
  *which adapter* needs it, which is what the per-adapter gate is for.

Cancelling first risks the opposite mistake: discovering on a real job that a county will not talk
to the box, with no fallback configured.

### What switching it on takes — configuration, not a build

The plumbing already exists: `getBrowser({ adapterId })` in `worker/src/lib/browser-factory.ts`
routes per adapter, with telemetry attribution.

1. **Prove the key.** The audit called it "valid"; zero sessions means that was never exercised. One
   test session before relying on it.
2. **On the worker** (`/opt/starr/worker/.env`): `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`.
3. **Enable per adapter**, never globally: `BROWSERBASE_ENABLED_ADAPTERS=kofile-clerk,texasfile`
   (comma-separated ids from `KNOWN_ADAPTER_IDS`). It bills per session, so it belongs in the
   variable-cost column as an exception for portals that need it — never as the default backend.
   That is why `BROWSER_BACKEND` and this list are separate switches.
4. **Redeploy** (§2), then confirm `/healthz` shows `browser.backend` leaving `local` for those
   adapters.

About ten minutes, and reversible by clearing one variable.

## 5. The one test that has never been run

**No research run has ever completed a document purchase.** `research_document_purchases` has
**0 rows**, and the newest `research_projects` row is from 2026-03-31. Every health check proves
plumbing; none proves a run.

When you are ready:

1. Create a project with a real property. **County must be a real county name** — "Bell", not
   "Texas". (The form now catches that and suggests the right one.)
2. Bounded at **$2.00** by default, and now settable per run up to **$10**.
3. **A Bell County run will not prove the purchase path.** Bell routes to Kofile, which is free, so
   the run never reaches a paywall. To test purchasing you need a TexasFile county such as
   **McLennan**.
4. Before spending anything, the free endpoint `/research/purchase/platforms/status` reports whether
   the worker believes it can buy — it answers the credential question without buying.

---

## Appendix — how to check something rather than assume it

Patterns this platform has been bitten by, and the check that catches each:

- **A key set on the wrong process.** Ask which process reads it. `grep` the variable in `worker/src`
  and in `lib`/`app` separately.
- **Two failures with the same status code.** Read the response **body**. Three different Google 403s
  appeared in one session and only the body distinguished them.
- **A green light from a stale deploy.** Compare `buildSha` on `/healthz` against `git rev-parse
  --short HEAD`.
- **"It works, so the config must be fine."** That inference was written into this codebase on
  2026-08-17 and was false — 22 stored images were broken the whole time. Measure the thing itself.
- **A blank from `vercel env pull`.** Proves nothing; encrypted values pull blank.
