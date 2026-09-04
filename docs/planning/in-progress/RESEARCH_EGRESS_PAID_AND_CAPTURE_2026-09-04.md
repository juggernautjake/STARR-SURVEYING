# Research platform — egress, the paid path, captcha, and capture priority — 2026-09-04

Part-2 (`completed/RESEARCH_PLATFORM_COMPLETION_2_2026-09-04.md`) closed with the environment-blocked
work deferred to "the QA phase". This document is that next phase: the owner has made the decisions
those items were waiting on, and this records them and turns them into phased slices.

## 1. The owner's decisions (2026-09-04, logged verbatim in intent)

1. **Plat repository IP block** — pursue an office-side egress. The owner has other computers,
   laptops, and a Shadow PC account; is open to subscribing to a more local IP, a proxy, or IP
   routing. Find the option that reaches `bellcountytx.com` (an office connection already gets a 302).
2. **Captcha** — the owner will FUND a solver if that is what it takes. Integrate a solution.
3. **TexasFile paid path — MUST work.** Use Playwright with the credentials to sign in, search the
   documents, make the payment, download the files, and save them to be reviewed.
4. **Auto-run AI analysis** — wire it to run every time, for now at least (fills the empty Data
   Points / Briefing / Encumbrances panels).
5. **A real paid TexasFile purchase test** — yes, do it (after the flow is built).
6. **Run length — 30 minutes**, not 15. (The default is already 30; the 15-min runs were test
   triggers. Aligned the worker fallback too.)
7. **Capture priority — in this order: (a) plats/drawings, (b) overhead views, (c) deeds and all
   other files and data that can be found.**
8. **Supervised proof run** — the owner will do one. (Run 9 started 2026-09-04T21:39Z at 30 min,
   paid OFF, as the free-path baseline; the paid test follows once the TexasFile flow is built.)
9. **Merge everything to main and confirm the worker picked it up** — standing requirement each slice.

## 2. Roadblocks and the solution options on the table

### 2a. The plat repository IP block (the plat gap)
`bellcountytx.com` returns 403 to the worker's datacenter IP (netcup) AND to Browserbase's cloud
IPs; an office/residential connection gets 302/200. No software trick defeats an IP block — the fetch
must originate from an allowed address. Options, best-first:

- **Relay on an always-on allowed machine (recommended).** A tiny fetch-relay service on one of the
  owner's office machines: the worker POSTs "GET this URL" to the relay; the relay fetches from its
  allowed IP and returns the bytes. Reach it from the worker without a static IP via a **Tailscale**
  or **Cloudflare Tunnel** (both free) — the relay dials out, the worker connects over the tunnel.
  Cheapest and uses an IP already proven to work. Needs a machine that stays on (a laptop that sleeps
  is unreliable; a desktop or a small always-on box is ideal). **Shadow PC is a cloud/datacenter IP —
  likely blocked like Browserbase; low confidence, but 5 minutes to test with a curl from it.**
- **Residential proxy subscription (turnkey paid).** Route the plat fetches through a residential
  proxy (Bright Data, Oxylabs, IPRoyal, etc.), ideally a US/Texas exit. No machine to keep on;
  monthly cost. Also tends to clear Cloudflare/bot walls, which trigger on datacenter IPs — so this
  helps captcha too. Plugs into the existing `plat-repo` browser-route adapter as its egress.
- **VPN with a residential/US exit on the worker** — similar to the proxy, coarser (routes more than
  just plats); workable but the proxy is cleaner because it scopes to the plat fetch only.
- **"Subscribe to a more local IP" / IP routing** — the netcup box's IP is a fixed German datacenter
  address; you cannot make it present as a Texas residential IP without one of the above. True IP
  routing (BGP) is not realistic at this scale. So this reduces to: relay, proxy, or VPN.

**Recommendation:** start with the relay over Tailscale (free, uses the known-good office IP); keep a
residential proxy as the fallback if no machine can stay on. Either way it wires into the already-
registered `plat-repo` egress adapter, and C2's exhaustion logic already stops asking when an egress
is dead.

### 2b. Captcha
Detection ships (B6 — `detectCaptcha` names the wall instead of parsing it as empty). To PASS one:

- **Fund a solver API** (CapSolver — re-check the rejection reason; or 2Captcha / Anti-Captcha). The
  worker sends the sitekey + page URL, gets a token back, and submits it. A `captcha-solver` adapter
  the scrapers call when `detectCaptcha` fires. reCAPTCHA v2/v3, hCaptcha, Turnstile are all covered
  by these services.
- **Browserbase built-in captcha solving** — enable it for the browser-route sessions (covers some
  wall types) as a lighter first step.
- **Residential egress (2a)** avoids many bot walls entirely (they fire on datacenter IPs), so the
  egress fix and the captcha fix overlap — do 2a first and re-measure how many captchas remain.

## 3. Phases / slices

### P1 — 30-minute default alignment `[shipped this session]`
`DEFAULT_LIMITS.maxWallClockMs` aligned 25 → 30 so a bare trigger matches the app's 30-min default.
`RUN_MINUTES` was already `{min:15, default:30, max:60}`.

### P2 — Capture priority order (plats/drawings → overhead → deeds) `[already implemented — confirmed]`
`run-order.ts` (`RUN_PHASES` / `describeRunOrder`) already encodes the owner's exact order: identify
→ drawings/plats → overhead views → the rest of the documents, and the Bell orchestrator's Phase 1.5
runs the visual capture BEFORE the Phase 2 document grind. Built for this request in part 1. Run 9's
log announces the order at start. No change needed; confirmed against the owner's restated priority.

### P3 — Auto-run AI analysis after every run (A5 impl) `[shipped 3c0a4cd2b; verify on next run]`
The analyze route accepts `x-worker-key` and bypasses the interactive status gates for a worker call
(keeps the scope refusal); `triggerAppAnalysis` POSTs it at the Bell run-finish tail, fire-and-forget,
non-fatal, every run for now. Tests cover the helper's paths + the wiring on both sides. The app half
is live on Vercel; the worker half deploys after run 9. VERIFY: the next supervised run's Data Points
panel populates. (Generic-pipeline finish wiring is a follow-up; the owner's runs are Bell.)

### P4 — TexasFile paid path end to end (E5) `[stack already built + wired — needs a SUPERVISED live test]`
CORRECTION after reading the code: this is NOT a blind build. The pieces exist and are wired:
`adapters/texasfile-adapter.ts` (628 lines, Playwright SPA search), `services/purchase-ledger.ts`
(`recordPurchase`, `findOwned` — the don't-double-buy guard by county+instrument key,
`recordSkippedPurchases`), `document-purchase-orchestrator.ts`, `purchase-gate.ts` (`decidePurchase`),
and the run CALLS `recordSkippedPurchases` (index.ts:2099, 4860). `research_document_purchases` is 0
rows only because every run so far hit the ceiling in Phase 2 before the purchase phase, with paid
OFF. So P4 = a SUPERVISED live paid run (paid ON, 30 min, a document the free path could not read):
confirm the texasfile adapter logs in, searches, pays, downloads, and files the PDF; confirm the row
is written and a second run does not re-buy. Any DOM/selector breakage the live site shows is fixed
THEN, against the real page — it cannot be verified blind. **This is the owner's supervised paid test.**
Blocked on: the supervised session + the free-path baseline (run 9) finishing first.

### P5 — Office-side egress for the plat repository (2a)
Stand up the relay (or proxy); point the `plat-repo` egress adapter at it; re-run a plat fetch and
confirm bytes come back. Then the plat repository is a live source again, and C1's name-variant recipe
+ C2's exhaustion logic + B6's captcha detection all apply to it.

### P6 — Captcha solver integration (2b)
Once funded, a `captcha-solver` adapter called when `detectCaptcha` fires; measured against the live
sites (after P5, since residential egress may remove most walls).

### P7 — Supervised proof runs
Free-path baseline (run 9, in flight) → then a paid run once P4 lands → then the three F1 runs, each
read end to end, every request re-checked.

## 4. Ground rules (carried)
Merge to main needs the owner's say-so (given for this work); `npm run build` before merge; verify a
tool's exit in one turn, commit in the next; a browser/app/paid step is proven by a supervised run,
not asserted.
