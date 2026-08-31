# Research worker rebuild, open-web research, and the growth backlog — 2026-08-26

**Status:** IN PROGRESS · opened 2026-08-26 · **this is the live doc for the netcup migration and
everything parked behind it.**

This absorbs the loose ends of a long working session: the research worker being gone, the local-SEO
work that shipped, the Google Business Profile that is claimed but empty, and a cost audit of 110
configured secrets. Anything discussed that session and not finished is written down here, because the
alternative is rediscovering it in three weeks.

---

> ### ⚠ THE "tsc clean" IN THIS BRANCH'S COMMIT MESSAGES WAS CLAIMED, NOT VERIFIED — corrected 2026-08-29
>
> Commits on `claude/org-scope-backfill-2026-08-29` repeatedly assert "tsc clean, eslint clean".
> **Those assertions were true. They were also not checked**, and the difference matters enough to
> write down where somebody reading those messages will find it.
>
> Two faults compounded:
>
> 1. `npx tsc` in this working copy resolved to a DECOY package — *"This is not the tsc command
>    you are looking for"* — because `node_modules/.bin/` did not exist.
> 2. Every check was read as `npx tsc --noEmit 2>&1 | tail -3; echo $?`, and `$?` after a pipe
>    reports **`tail`'s** status. So a decoy that exited 1 was read as 0, every time.
>
> Either fault alone would have been caught. Together they produced a check that always said what
> it was expected to say — which is the definition of an instrument nobody is reading.
>
> **Root cause of the missing `.bin`: I deleted it.** A `node_modules` junction inside a probe
> worktree; `git worktree remove --force` followed the junction into the real directory and removed
> entries before failing with `Invalid argument`. A failed cleanup is not untidy — it is a partial
> delete that already happened, and it was treated as cosmetic at the time.
>
> **Repaired** with `npm install --legacy-peer-deps` (not `npm ci`, which deletes first and leaves
> nothing if the install then fails), and the branch re-verified with working tooling, exit codes
> read without a pipe:
>
> ```
> npm run type-check   REAL exit 0    0 errors
> npm run lint         REAL exit 0    1 pre-existing warning
> npx vitest run       REAL exit 0    26,575 passed · 2 skipped · 0 failed
> ```
>
> **The damage was scoped to the ROOT project only.** `worker/node_modules/.bin` is intact (60
> binaries), so every "worker tsc clean" claim in these commits WAS valid — the worker has its own
> dependency tree and the junction never pointed at it. Re-confirmed with real exit codes:
>
> ```
> worker npx tsc --noEmit   REAL exit 0
> worker npx vitest run     REAL exit 0    1,621 passed
> ```
>
> Worth separating from the root-project correction above rather than lumping them together: an
> over-broad retraction is its own kind of false record.
>
> The branch is sound. The point of recording it is that it was sound by luck for most of a
> session: had any of the 41 changed files carried a type error, the same broken check would have
> reported clean just as confidently.

## START HERE — the worker is LIVE and fully credentialled; one test and four decisions remain

**This table now lists only what is OPEN.** Seven rows were cleared between 2026-08-28 and
2026-08-30 and have been removed rather than left ticked, because a table where most rows say ✅
buries the four that still need you. What they were, for the record — the reasoning behind each is
still in its numbered section below:

> **Cleared:** `TAVILY_API_KEY` set (1) · netcup invoice paid and the box provisioned (2) ·
> `worker.starr-surveying.com` moved to `152.53.48.240` with TLS, verified from outside (2b) ·
> reboot survival measured, not assumed (3) · TexasFile credentials set and funded (3b) ·
> `design_mockups` backfilled and `verify:org-scope` green (7). And item **3c was WITHDRAWN** —
> `WS_TICKET_SECRET` on the worker was a key on a machine that does not read it, the same mistake
> as TAVILY; the code making that false claim was removed 2026-08-30.

Nothing below is urgent except in the order given. The engineering half is finished; every item
here needs a decision, an account, or a physical act only the owner can perform.

| # | Do this | Where | Why it is first |
|---|---|---|---|
| 3d | **Run ONE research run against a real property, deliberately** | §3.5 of the runbook | The only complete test of the purchase path, and now the last unproven link. Presence is not function: the worker warns when `TEXASFILE_USERNAME` is absent and *cannot* warn when the login is wrong or the balance is spent — both of which produce a run that works perfectly until it reaches a paywall. Bounded at **\$2.00** per run by `run-budget.ts`, so the downside is a few dollars and the upside is knowing. |
| 4 | **Cancel Browserbase, or decide to use it** | §I0, §I4 | Valid key, **zero sessions in four months**. It is the only service measured tonight that is definitely costing money for nothing. |
| 5 | **Google Business Profile: photos, description, reviews** | §G | Owner-paused, correctly. Still the largest lever on actual lead volume, and reviews are the slowest-moving thing on the list. |
| 6 | **Send me your profile URLs** (Business Profile, Facebook, LinkedIn, BBB) | §M3 | One edit fills the last empty field in the site's structured data. |
| 8 | **Enable Places API (legacy) + Geocoding API + Maps Static API** in Google Cloud Console | §M5 | Measured 2026-08-30 with a control: the key returns `REQUEST_DENIED` — *"You are calling a legacy API, which is not enabled"* for Places and *"not activated"* for Geocoding. **Not a referrer problem.** Maps JavaScript IS enabled, which is why the map draws and only autocomplete dies. The client calls `AutocompleteService`, so enabling *Places API (New)* alone will NOT fix it. Check the key API-restriction list too. **Maps Static was added 2026-08-30 and is NOT optional:** four call sites already use it and it returns 403 not-activated, which is why 22 stored aerial/topo images are broken — see M5. If Google refuses legacy (blocked on projects created after ~March 2025), this becomes a code migration to `AutocompleteSuggestion` — engineering work, not yet commissioned. |
| 9 | **Redeploy the worker** — `cd /opt/starr && git pull && cd worker && BUILD_SHA=$(git rev-parse --short HEAD) docker compose up -d --build` | §3.6 | The deployed build is behind `main`, and the staleness is FAKING A GREEN LIGHT: it still carries the `TAVILY_API_KEY missing` warning that `main` deleted, so `warnings: []` currently proves only that the key is set on a box where no worker file reads it. Costs nothing. It is also what ships the per-run spend limit and the removal of the false `websocket_auth` check. |

> ### 🔎 FULL AUDIT 2026-08-30 — the server half holds up; one thing above was false
>
> Asked to confirm "the worker and pipeline work perfectly and nothing is left to set up", every
> claim in the table above was re-measured against the live system rather than re-read.
>
> **What is genuinely proven.** `/healthz` v5.1.0, `warnings: []`, Playwright · Supabase · Anthropic ·
> R2 · Redis all `ok`. The auth guard answers **401 / 403 / 200** to no-header / wrong-key /
> real-key — three distinct answers, so it can prove a positive and not merely fail. Address
> validation works live end to end: Belton→Bell returned `valid:true`, and a deliberate `Harris`
> control returned 422 `ADDRESS_COUNTY_MISMATCH` with the right detected county. TexasFile reports
> `configuredForUse: true` across 254 counties at \$1/page via the free
> `/research/purchase/platforms/status` endpoint — **use that before spending money; §3.5 documents
> it and it answers the credential question without buying anything.** Worker suite 1,621 pass; root
> `tsc` 0 errors; research suite 1,107 pass; `npm run verify:worker` ✓ OK.
>
> **The Vercel→worker link is proven by evidence nobody had to generate:** the hourly watchdog wrote
> `research_worker_health = {state: ok, latency_ms: 338}` at 12:17 UTC. That is production Vercel
> reaching the box, which a laptop `curl` cannot demonstrate. The cron is registered in
> `vercel.json` and firing.
>
> **Item 3c was wrong and is withdrawn above** — the worker never verifies WS tickets. Worth dwelling
> on: this doc contains commit `615b6e543`'s lesson about TAVILY ("a key on a machine that ignores
> it") and then made the identical mistake with `WS_TICKET_SECRET` four rows later. Writing the
> lesson down did not prevent the repeat, because the check that would have caught it
> (`warnings-are-about-this-process.test.ts`) guards `configWarnings` and this claim lives in the
> `/health` handler.
>
> **The deployed worker is 4 commits behind `main`** (`buildSha d4bc6ef04`). None change pipeline
> behaviour — docs, `.env.example`, tests, and the TAVILY warning removal — **but the staleness is
> currently faking a green light.** The deployed build still contains the `TAVILY_API_KEY missing`
> warning at `health.ts:260`, `main` deleted it, and `/healthz` reports `warnings: []`. That proves
> `TAVILY_API_KEY` is set on the box, where no worker file reads it (controlled against
> `ANTHROPIC_API_KEY`, which appears in 4+ adapter files). Redeploying per §3.6 makes the green
> honest and costs nothing.
>
> **Item 3d is the whole remaining risk, and the database says so louder than this doc does:** the
> newest `research_projects` row is **2026-03-31** and `research_document_purchases` has **0 rows**.
> The purchase path has never executed once — not on netcup, not on the DigitalOcean box before it.
> Every "✅" above proves the plumbing; none proves a run.
>
> **Two smaller things.** `worker/src/websocket/progress-server.ts` is an orphan whose
> `validateToken` returns true for *any non-empty token* (line 263) — inert because nothing starts
> it, but a live landmine for whoever wires it up. ✅ **CLOSED 2026-08-30 — see the slice note
> below.** And `idocket_pay` is **\$0/page across 18
> counties** and unconfigured, so those counties route to TexasFile at \$1/page instead;
> `tyler_pay` (\$0.50, 7) and `fidlar_pay` (\$0.75, 13) are the same trade. Free money, not a defect.
>
> ---
>
> **SHIPPED IN THE SAME PASS — the paid-documents notice now reaches a reader.** The audit found the
> switch shipped in `938160289` half-connected in this repo's signature way: the analyze-status route
> computed `paidDocumentsNotice` and returned it on every response, and **no `.tsx` read it.** The
> route's tests passed and `paid-documents.ts`'s eleven tests passed, while the reader still could
> not tell "no deed exists" from "you told me not to look" — the exact confusion that module's header
> says it exists to prevent.
>
> `ResearchAnalysisPanel` now reads the field when a run finishes (at completion, not mid-run: the
> count is of documents a *finished* run declined to buy) and renders it above the final summary,
> where a caveat still precedes the conclusion it qualifies. A failed fetch leaves it `null` rather
> than empty-string, because a false all-clear is worse than silence. Styled as a caution, not an
> error — the commonest reason is the operator's own deliberate choice, and rendering a correct
> setting in error red teaches people to ignore red.
>
> Six new assertions in `paid-documents-toggle-is-wired.test.ts` check the **caller**, per
> [[feedback_wiring_tests_must_check_the_caller]]. **Mutation-tested three ways** before the green was
> believed: deleting the render fails it, renaming the CSS rule fails it, and changing `?? null` to
> `?? ''` fails it. 13 pass; research suite 1,107 pass; `type-check` and `lint` exit 0.

> ### ✅ SLICE 2026-08-30 — the WebSocket auth landmine is defused
>
> The audit above found `ProgressServer.validateToken` ending in `return token.length > 0` under the
> comment *"For now, accept any non-empty token"*. That is fail-**open**: every check above it could
> miss and the connection was still admitted. Nothing constructs the class, so nothing was breached
> — the defect was that the first person to wire it up would inherit an auth check that always says
> yes, which is the worst moment to discover one.
>
> **The ticket it needed already existed in this repository.** `worker/src/shared/ws-ticket.ts` signs
> `{ userId, jobIds, iat, exp }`, and `app/api/ws/ticket/route.ts` fills `jobIds` with
> `research_projects.id` values it has confirmed the caller owns (`created_by = session email`).
> Those ids are **the same namespace** as this server's `projectId` — checked, not assumed, before
> building on it. So the ticket carries per-project authorisation, and `server/ws.ts` was already
> verifying it correctly forty lines away. The orphan was not missing a mechanism; it never called
> the one beside it.
>
> `authorize()` now fails closed in every direction — no token, no configured secret, bad signature,
> expired ticket, or **a project the ticket does not name**. That last one is its own check: stopping
> at "the signature is valid" would let any authenticated user stream any other user's run, which is
> the same shape as every other bug in this doc — a system that cannot tell two opposite things
> apart. The rejections carry **distinct close codes** (4001 unauthenticated · 4005 authenticated
> but not for this project · 4002/4004 malformed) so a future failure says which. The
> `WORKER_API_KEY` service path is kept, now compared in constant time and only when the key is
> actually set — an unset key must never make an empty token match.
>
> Also added `close()`: the 30-second heartbeat was cleared only by the `wss` 'close' event, which no
> caller could reach.
>
> **18 tests drive the real handshake over a real socket**, not the private method — a test calling
> `authorize()` directly would pass just as happily if the handshake stopped calling it
> ([[feedback_wiring_tests_must_check_the_caller]]). **Mutation-tested with a control** before the
> green was believed: restoring the old fail-open line fails 11, dropping the per-project check fails
> 3, defaulting the secret instead of failing closed fails 1, and a cosmetic log-text change stays
> green — so the suite discriminates rather than merely passes.
>
> Worker `tsc --noEmit` exit 0 and the full worker suite **1,639 pass** (was 1,621; +18), both read
> without a pipe per this branch's own `$?`-after-`tail` lesson. Root `tsc` and `lint` exit 0; orphan
> guard "No new orphans".
>
> **Two things deliberately NOT done here.** The file stays an orphan — deleting working-looking code
> on the strength of a grep is how a real feature disappears (§F5), and that call is the owner's.
> And `ws` is used by this file but **declared only in the root `package.json`**, not the worker's
> (8.19.0 resolves transitively today). Whoever wires this server up should declare it; adding a
> dependency and a lockfile change did not belong in a security fix.

> ### ✅ SLICE 2026-08-30 (b) — item 3d met the form, and the form was the problem
>
> The owner opened the New Research Project modal to start the first real run (item 3d) and hit four
> things in one screen. All four are fixed and merged to `main` (`a85b2f1c5`), plus a fifth found by
> watching what was typed.
>
> **The per-run spend limit never existed, and the code implied it did.** `limitsFor()` has accepted
> `maxCostUsd` since it was written; its one caller passed only the clock and dropped the cost, so
> every run got \$2.00 whatever it asked for. Now threaded research-input → router → `limitsFor`, and
> clamped to **`MAX_COST_CEILING_USD` = \$10** — the owner's number. A ceiling and a default are
> different things: without the ceiling a typo of `1000` for `10.00` is a thousand-dollar run. The
> clamp is silent (satisfied AT the maximum, not refused — failing a run over a too-large budget
> helps nobody), and a requested `0` survives as "free sources only", which `||` would have read as
> unset. `RUN_MAX_COST_USD` is clamped too; a deployment is the same mistake with a different author.
> **NOT wired into `/research/run`** deliberately: that route's `budget` goes to `MasterOrchestrator`
> and never reaches `limitsFor`, so accepting the parameter there would have been a knob connected to
> nothing.
>
> **Property ID was required by the form and optional everywhere else** — the server has always
> stored `parcel_id?.trim() || null`, so the red asterisk only sent you to the appraisal district
> before you could start a run you had the address for. Now: address *or* ID, with the missing one
> named rather than a greyed-out button.
>
> **The modal discarded a hand-typed form on a stray overlay click.** Closing now takes the new × or
> Cancel. Escape stays — a deliberate keypress is not a slip, and a dialog you cannot dismiss from
> the keyboard is a trap.
>
> **Google Places and Geocoding are OWNER-GATED, and the cause is now measured rather than guessed.**
> Tested against the live key with Geocoding as a control: Places returns `REQUEST_DENIED` with
> *"You're calling a legacy API, which is not enabled for your project"*, Geocoding with *"This API is
> not activated"*. **Not a referrer problem.** Maps JavaScript API is enabled, which is why the map
> draws and only autocomplete dies. The owner must enable **Places API (legacy)** — the client uses
> `google.maps.places.AutocompleteService`, so enabling only *Places API (New)* will not fix it — and
> **Geocoding API**, then check the key's API restrictions list. If Google refuses to enable legacy
> (it blocks it on projects created after ~March 2025) this becomes a code migration to
> `AutocompleteSuggestion`, which is engineering work and not yet commissioned.
>
> **And the fifth: "Texas" was typed in the County box.** Entirely reasonable — the label says
> County, the property is in Texas — and nothing on screen disagreed. County is the ROUTING KEY:
> Bell goes to Kofile for free, an unmatched county routes nowhere, and the run either fails
> validation twenty minutes in or reports on no property at all. `lib/research/county-input.ts` now
> checks the field against the 254-county table the repo already ships, suggests the nearest real
> names (prefix matches first — "Will" wants Williamson, and no distance metric should outrank
> that), stores the canonical spelling so `bell county` and `Bell` do not become two rows, and gives
> **"Texas" its own answer**: it is a category error, not a misspelling, and "did you mean Bexar?"
> would be a terrible reply. Warns, never blocks — it fires on a string somebody is halfway through
> typing.
>
> Mutation-tested, and one mutation **escaped**: renaming the warning's CSS class left the wiring
> test green, because a looser `toContain` matched the plain note class still present elsewhere. The
> probe was the bug, again; the assertion now names the `--warn` variant and requires both branches.
> 25 new tests. Root `tsc` 0 · `lint` 0 errors · research suite **1,132 pass** · `npm run build`
> exit 0 — the build specifically, because tsc and 21k tests were once green over a broken one.
>
> **Item 3d is still open, and a Bell County run will not close it.** Bell routes to Kofile, so a
> free-county run proves the pipeline and never reaches a paywall. `research_document_purchases` is
> still 0 rows. Proving the purchase path needs a TexasFile county.
> ### ✅ SLICE 2026-08-30 (c) — the false health claim is gone, and the guard now reaches it
>
> Item 3c was withdrawn as a *plan*; the code that made the false claim was still shipping. Removed:
>
>     checks.websocket_auth = process.env.WS_TICKET_SECRET
>       ? { status: 'ok',           detail: 'WS_TICKET_SECRET configured' }
>       : { status: 'unconfigured', detail: 'WS_TICKET_SECRET missing — /api/ws/ticket will return 503' }
>
> Both halves were about a different process. `/api/ws/ticket` is a Next.js route on Vercel reading
> its own environment. And this worker serves no WebSocket at all — controlled for: `WebSocketServer`
> and `upgrade` appear **nowhere** in `index.ts`. So a green `websocket_auth` meant "a string is
> present in this container" while reading as "WebSocket auth is working". Also removed from the
> boot warning list and the Phase A startup line, which claimed a missing key would make
> `/api/ws/ticket` return 503.
>
> Nothing replaces it. A check that cannot observe what it reports on has no honest version.
>
> **Why it repeated, and what now stops it.** This doc already carried the TAVILY lesson — *a key on
> a machine that ignores it* — and `warnings-are-about-this-process.test.ts` was written to enforce
> it. That guard scans `infra/health.ts`; this claim lived in the deep `/health` handler in
> `index.ts`. The guard was pointed at one file and the next mistake was made in another.
>
> It now covers that handler too, **by reachability rather than by substring**, and that distinction
> is the whole point: `websocket/progress-server.ts` genuinely reads `WS_TICKET_SECRET`, and it is an
> orphan nothing constructs — so a "some worker file reads this key" rule would have waved the bug
> straight through. The guard walks relative imports from `src/index.ts` and asks whether a module
> that actually RUNS reads the key. It asserts the orphan is *not* reachable, so the hole cannot
> quietly reopen.
>
> **Two of my own probes were wrong before they were right**, both caught by controls rather than by
> luck: the first scanner took every `process.env` line in `index.ts` and "found" ANALYTICS_DIR,
> BATCH_DIR, GIT_SHA and GOVOS_CREDIT_CARD_TOKEN, none of which health reports on; and it was aimed
> at `/healthz` when the claim lives in the deep `/health` handler — which this doc had said all
> along. An over-reporting scanner trains you to ignore it just as surely as a silent one.
>
> Mutation-tested: reintroducing the `websocket_auth` line fails the guard; restoring it goes green.
> Worker suite green.

**Two things you should know before you act on the cost sections:**

- **17 of 18 vendor credentials are empty** (§S2b). Most of the "check this invoice" advice earlier in
  this doc is probably moot — there are no accounts. The three services that genuinely cost money are
  Anthropic, Google Maps, and Browserbase.
- **Stripe is off by design, not broken** (§F2b). Empty keys plus a missing `PAYMENTS_LIVE` is the
  correct state for "payments not switched on".

**Nothing in this doc is a regression.** Every ☐ item now needs a decision or an account only the
owner has — the server half is finished.

### Why this doc is still in `in-progress/` — read this before trying to move it

Per the rubric in `docs/planning/README.md`, a doc is IN-PROGRESS if it "contains action items not
yet done". This one does, and **none of them are deferrable by an engineer**, which is the
distinction that matters: the README's COMPLETED test is "the phase it describes has shipped", not
"nobody is currently working on it".

| Category | Items | Why it cannot be closed from the code side |
|---|---|---|
| **Needs a dashboard login** | S2, S3, S4, M1, M2, G1–G4, F1, F2 | Doppler, Vercel, Google Ads, Search Console, Business Profile, Meta. Credentials the owner holds. |
| **Needs a purchase or a cancellation** | I4, I5, R4/R4a, S2b | Browserbase (valid key, zero sessions in four months), a working CapSolver key, TexasFile. Spending money is not an engineering call. |
| **Needs the owner's own content** | M3, G2, G3, G4 | Profile URLs, reviews, photos, a services description. Nobody can write these for the firm. |
| **Needs a physical act** | W5, S5 | Reboot the box and re-verify; rotate the credentials pasted into transcripts. |
| **Correctly gated on another item** | M4 | County landing pages wait on Search Console data. Building 46 pages on a guess produces 46 thin pages Google ignores — that is the item's own reasoning and it still holds. |
| **Explicitly deferred, with measurement** | R2b, F4, F5 | R2b: Galveston is the only live Fidlar portal and the firm does not work there. F5: 764 orphaned lines, and deleting working-looking code on the strength of a grep is how a real feature disappears. |
| **Scoped, not commissioned** | R3 | Re-measured 2026-08-29 into three pieces; only the third is product work, and nobody has asked for multi-tenancy yet. |

**What HAS shipped is the entire engineering half**: the worker rebuilt on netcup and verified from
outside over TLS, R2 storage, the `org_id` drift closed, all five Tavily applications, and every
defect the walkthrough surfaced in the runbook itself.

Marking the rest "deferred" to empty the folder would be a lie about who is blocked.

> ### ✅ MERGED AND DEPLOYED 2026-08-28 — the warning below has been resolved
>
> For one day this block warned that "✅" did **not** mean "on `main`": eighteen commits sat on
> `claude/address-autocomplete-visible-failures-2026-08-27`, unmerged, because the owner authorises
> each merge. **That is no longer the case.** Merged fast-forward to `main` on 2026-08-28 and
> deployed.
>
> Checked rather than assumed, per the warning's own instruction — `git merge-base --is-ancestor`
> returns true for every commit in the set, and the deploy was confirmed from outside by polling
> `GET /api/admin/research/portal-watch` until it stopped returning **404** (old build) and started
> returning **401** (route present, auth-gated as designed). That took about three minutes.
>
> **Keep the habit the warning describes.** This repo has already lost a whole feature to a document
> that said DONE: the business-phone work was recorded as shipped for weeks while every commit sat on
> an unmerged branch and the `calls` table held zero rows. A ✅ is a claim about a branch until
> somebody checks, and the check is one command:
>
> ```
> git merge-base --is-ancestor <sha> main
> ```
>
> The reason this block was written and then resolved a day later, rather than deleted, is that the
> failure it guards against is invisible from inside the document — only the repository can answer it.

---

## 0. What actually happened, in one paragraph

The DigitalOcean droplet running the research worker was **destroyed** — the card paying for it was
cancelled, the account was suspended, and the droplet went with it. It had already been unreachable
since **2026-08-02** (recorded in `docs/platform/RESEARCH_WORKER_DEPLOYMENT.md`), so deep research has
been down far longer than the billing incident suggests. A netcup RS 4000 G12 has been ordered to
replace it. Separately, the website's local-SEO work shipped and is verified live, and an audit of
every configured secret found two services being paid for that no code path can reach.

---

## 1. SHIPPED this session — do not re-litigate

Each verified against production, in a browser where that was the only way to see it.

| | Evidence |
|---|---|
| `LocalBusiness` JSON-LD on every page | Parsed out of the live homepage: 46 counties, 12 services, RPLS #6706 |
| **GA4 `G-V8715QJGBX`** live | `POST google-analytics.com/g/collect` → HTTP 204, real `page_view` |
| 8 of 8 public pages have unique titles | Five were serving the homepage's; a client component cannot export `metadata` |
| Self-referencing canonicals | Consolidates the `?gclid=` variants paid traffic arrives with |
| Header logo no longer lazy-loaded | Was `loading="lazy"` + a single 3840px candidate on the LCP element |
| Office hours corrected to **9:00 AM** | The site had said 8:00 since it existed — an hour before anyone was in |
| Service-area map fixed | Maps key allowed `starr-surveying.com` but not the `www` the site serves |
| **AI search live** — 841 chunks embedded | `document_embeddings`, 601 research documents, Voyage `voyage-3.5` |

Merges `1aaa98381` and `d461a1c7b`. See [[project_seo_schema_and_ga4]].

**Research data survived the droplet's destruction.** Files are in Supabase storage, not on the box —
verified by fetching deed page images (HTTP 200). The worker was genuinely stateless.

---

## 2. W — The worker on netcup

> ### ✅ THE WORKER IS LIVE — 2026-08-29, first build, healthy on the first try
>
> ```
> starr-research-worker-1   Up (healthy)   127.0.0.1:3100->3100/tcp
> {"status":"ok","version":"5.1.0","buildSha":"d4bc6ef04",
>  "browser":{"backend":"local","ok":true,"durationMs":555},
>  "queue":{"maxConcurrentPipelines":6,"limitedBy":"ceiling"}}
> ```
>
> `limitedBy: "ceiling"` is the number §2 of the runbook predicted for this exact box: 12 cores and
> 32 GB permit 11 by memory and 8 by CPU, and the worker holds itself to 6 because these are small
> government servers and the fastest way to lose a county portal is to look like a load test. The
> sizing model and the machine agree, which is the first time that has been checkable.
>
> **What the boot warnings caught, and it was not what they appeared to say.** `/healthz` reported:
>
> ```
> "TAVILY_API_KEY missing — open-web research is inert; runs see county sources only"
> "TEXASFILE credentials missing — the universal clerk fallback cannot buy documents"
> ```
>
> The first reads as an owner who forgot a key. **It was a defect in the setup procedure.**
> `TAVILY_API_KEY` appeared nowhere in `worker/.env.example` and nowhere in the runbook, and the
> runbook builds a real `.env` by FILTERING that file — so the key could not be set by anyone
> following the documented steps. The owner had set Tavily in Doppler on 08-28; that is the website's
> environment, a different process on a different machine. Item 1 of START HERE was correctly marked
> done and the worker still could not see it.
>
> Fixed as a class, not an instance: every `env.FOO` in `worker/src` checked against every `KEY=` in
> `.env.example`, two found (`TAVILY_API_KEY`, `RECEIPT_EXTRACTION_POLLER`), both documented, and
> `env-example-documents-every-key.test.ts` now fails when code reads a name the example omits.
>
> **Three defects in §3.3 of the runbook, found before the owner ran it:** `ufw` opened 443 but not
> 80, which ACME HTTP-01 needs; the Caddyfile was written BEFORE the DNS record, so the first
> certificate request validates against the destroyed droplet; and `systemctl reload` fails on a unit
> that was never started.
>
> **Still open, and both are one step each:** the worker needs its own `TAVILY_API_KEY` line, and
> `worker.starr-surveying.com` still resolves to `104.131.20.240`. Until the DNS record moves, the
> worker is healthy and unreachable — which is precisely the state W4 exists to detect from outside.

**Ordered 2026-08-26:** netcup RS 4000 G12, Manassas VA. 12 dedicated Zen 5 cores, 32 GB ECC, 1 TB
NVMe. **€39.77 + €0.50 IPv4 = €40.27/month ≈ $46**, minimum 1-month term, no setup fee, **VAT 0%**
(business details supplied). Awaiting netcup's manual order review.

The full build lives in `docs/platform/RESEARCH_WORKER_DEPLOYMENT.md` — Docker Compose, Caddy with a
**45-minute** proxy timeout (a run streams for 20–30 min; Caddy's default 100s would sever it), ufw
locked to SSH + 443 with the worker bound to `127.0.0.1:3100`.

### W1 — `STORAGE_BACKEND=local` must become `r2` ✅ DONE 2026-08-26

Doppler `prd` currently reads `STORAGE_BACKEND=local`, meaning the worker wrote research artifacts to
**its own disk**. That disk was destroyed with the droplet.

The database rows survived and most files are in Supabase, but anything written through the local
storage path is gone — which is the likeliest explanation for a `research_documents.storage_url` that
returned **400** during verification while its siblings returned 200.

Rebuilding with `local` would set the same trap, knowingly.

**Done 2026-08-26: `STORAGE_BACKEND=r2` in Doppler `prd`** — but only after proving the credentials,
because switching to a backend that does not work is worse than the one that loses data on a rebuild.
A real round-trip against `starr-recon-artifacts`: PUT, GET with byte-for-byte content match, DELETE.
All three succeeded.

Safe to change now precisely because **no worker is running** — nothing reads this until netcup is
built, so the risky moment is a rebuild that has not happened yet rather than a live cutover.

This also settles the cost audit's open question about R2: it is not optional, it is required.

### W2 — DNS is the only cutover step

`WORKER_URL` and `WORKER_API_URL` in Doppler both read `https://worker.starr-surveying.com`, and **no
Doppler entry references the dead IP**. `worker.starr-surveying.com` currently resolves to
`104.131.20.240`. The switch is one A record; nothing in Doppler or Vercel needs editing.

### W3 — `WORKER_API_KEY` must match on both sides ◐ **guard SHIPPED 2026-08-26**

Pull the existing value from Doppler `prd` rather than generating a new one. If the worker and the app
disagree, **the worker runs perfectly and the app reports it unreachable** — a failure that looks like
a network problem and is not.

**Now warned about at boot.** `configWarnings()` in `infra/health.ts` was extended rather than
duplicated — it already covered Anthropic, Supabase, Redis and Browserbase, and a second env checker
beside it is how this repo has grown parallel helpers before. Three additions, each guarding a setting
that is **accepted at boot and only fails later**:

| Setting | Where it currently fails |
|---|---|
| `WORKER_API_KEY` absent | Every call from the app rejected — reads as an outage, sends you to DNS |
| `STORAGE_BACKEND=r2` without R2 keys | **The first upload, mid-run**, after paid documents are bought |
| `CAPTCHA_PROVIDER=capsolver` without key | The first time a county portal presents a captcha |

The middle one is the reason this slice exists. `resolveBackend()` honours `r2` whether or not the
credentials are present, and W1 made `r2` the configured default — so forgetting a key on the netcup
box is now a live risk that would surface twenty minutes into a run rather than at startup.

Surfaced on `/healthz`, so it is visible from the app rather than only in a boot log. 6 new tests; the
existing "complete environment" fixture gained `WORKER_API_KEY` — the contract widening, not a test
being loosened. Full worker suite: 1,606 tests green.

### W4 — verify from OUTSIDE the box ✅ TOOLING ALREADY EXISTS — verified 2026-08-26

`curl localhost:3100/healthz` on the server proves nothing about reachability. The real test is
`curl https://worker.starr-surveying.com/health` from elsewhere. A worker that answers on loopback and
not the internet is a firewall problem that looks like success from inside.

**I was about to build a verification script and found one already built, better.** `/admin/research`
renders `WorkerStatusBanner`, which probes the worker from the app — i.e. from outside the box, over
the real hostname, through the real TLS — and `interpretWorkerProbe` names which of four situations
you are in rather than "it failed":

| State | Meaning |
|---|---|
| `not_configured` | no `WORKER_URL` — a valid state, not a fault |
| `unreachable` | configured and not answering — start or redeploy it |
| `degraded` | answering, but its own `/healthz` says it cannot launch a browser. **Worse than down, because it looks up** — it will accept work and fail it |
| `ok` | answering and able to work |

So the cutover check is: load `/admin/research` and read the banner. A CLI script would have been a
second, worse copy of this — the failure mode this repo is most prone to.

**What I did instead: pinned the chain.** The config warnings added in W3 travel five hops across
three directories and two test suites — `configWarnings()` → `/healthz` body → the app's probe route
→ `interpretWorkerProbe` → the banner's render. Every hop was traced by hand and was intact, **which
is precisely when the test is worth writing**: nothing is red to tell you when a hop is dropped, and
the symptom would be the worker correctly announcing "STORAGE_BACKEND=r2 but R2_ACCESS_KEY_ID
missing" into a void while an operator watches a run die twenty minutes in.

Added to `worker-healthcheck-contract.test.ts`, which already exists for exactly this reason — it was
written after a Dockerfile polled `/healthz` while the worker only served `/health`, a defect that
hid in the gap between two test suites. 9 tests green.

### W5 — surviving a host reboot ✅ **PASSED 2026-08-29 — measured, not assumed**

> **The evidence is one number: `uptime`.**
>
> | | |
> |---|---|
> | Earlier check | `"uptime": 1102` |
> | After the reboot | `"uptime": 69.7` |
>
> The worker restarted and came back on its own, and the reply arrived over HTTPS at the public
> hostname from the owner's laptop — so it is not merely the process that recovered. Every link in
> the chain did, unattended: Docker started on boot, Redis came up healthy and the worker waited for
> it, Caddy started and served a valid certificate, Playwright launched Chromium
> (`playwright: ok`), and R2 and Supabase reconnected. The Tavily key survived, so `.env` is being
> read from disk rather than held in a shell that is gone.
>
> ```
> ✓ OK  https://worker.starr-surveying.com
>   The research worker is up and idle.
>   v5.1.0 (d4bc6ef04) · 647ms · 0 active
>   exit=0
> ```
>
> **This is the item that mattered most on the whole list**, because the previous worker died by
> silently never coming back and nobody found out until somebody needed it. That failure mode is now
> closed twice over: the machine demonstrably recovers, and `/api/cron/worker-health` watches hourly
> in case a future one does not.
>
> One honest caveat, recorded rather than smoothed over: the uptime drop is proof the worker
> RESTARTED, not proof of what caused it. If that was not a deliberate reboot, it is worth chasing —
> `docker compose logs --tail 100 worker` would say why.

> **Two things shipped that turn this from a thing somebody must remember into a thing that happens.**
>
> **1. `npm run verify:worker`** — probes `/healthz` over the real hostname and prints a verdict with
> an exit code. W4 had argued against a CLI check and was right about the reason: `/admin/research`
> already renders `WorkerStatusBanner`, and a CLI that RE-DERIVED that judgement would be a second,
> worse copy. This imports `interpretWorkerProbe` instead — one brain, three callers. The exit code
> gates on `verdict.canRunDeep`, not on `state === 'ok'`, so it cannot silently disagree the day a
> fifth state exists. Verified against all four paths on the live worker.
>
> **2. `/api/cron/worker-health`, hourly at :17.** This is the actual answer to "the last worker died
> by silently never coming back". There were nineteen crons in `vercel.json` and **not one looked at
> the worker.** A banner needs somebody looking at it, and the whole problem was that nobody was.
>
> **It alerts on the TRANSITION, not on the state**, which is the entire design. A worker down for
> three days is one piece of news, not seventy-two — notify every tick and the third day looks like
> the first, everyone mutes the channel, and the next real outage lands somewhere nobody reads.
> Recovery is announced too, because a watchdog that only reports bad news makes silence ambiguous:
> is it fine, or did the watchdog die? `degraded` escalates above `unreachable` — it looks up, and
> will accept a run and fail it twenty minutes in after documents have been paid for.
>
> **An exhaustive test over every (previous, current) pair caught a real bug in the policy.** The
> recovery branch was written as "was bad, is no longer bad", which fires on
> `unreachable → not_configured` and announces *"the research worker is back"*. It is not back —
> somebody removed `WORKER_URL`. A cheerful lie, and the kind nobody double-checks because good news
> is not suspicious.
>
> **Still owner-gated:** the reboot itself. `reboot`, wait 60s, then `npm run verify:worker` from a
> laptop. Steps are in `STARR-WORKER-SETUP-STEPS.txt` in the owner's Downloads.

Compose already sets `restart: unless-stopped` on both services. But that only helps if the **Docker
daemon** starts at boot, and the runbook had no step that confirmed it — it installed Docker, ran
`compose up -d`, and moved on.

**That is the exact shape of the failure that killed the last worker.** Not a crash: a silent absence.
Unreachable from 2026-08-02, noticed weeks later, entirely consistent with a stack that never came
back after a host restart. A runbook that cannot demonstrate the machine returns is a runbook that
reproduces it.

Added §3.4 to `docs/platform/RESEARCH_WORKER_DEPLOYMENT.md`: `systemctl is-enabled docker` (Docker's
Ubuntu packages normally enable it — *normally* being the operative word, and cheap to confirm),
then an actual reboot, then `curl https://worker.starr-surveying.com/health` **from your own machine**.

That one command exercises the whole chain the app depends on — DNS, firewall, Caddy, certificate,
container, and the daemon that had to start it. `docker ps` over SSH proves only that the container
is up, which was never the part in doubt.

Also documented the sharp edge: `unless-stopped` means exactly that. A container stopped by hand
before a reboot stays stopped, by design.

**Execution is server-gated** — the reboot test can only be run once netcup provisions. The runbook
step is what was missing, and it is no longer missing.

### W6 — compose limits vs the new box ✅ DONE 2026-08-26 — but not the fix predicted

**The predicted problem did not exist.** `worker/docker-compose.yml` was already written for the netcup
box — `memory: 26g`, with a comment saying "Leaves ~6 GB for Redis, the OS and page cache on a 32 GB
box", plus `shm_size: 1gb` for Chromium. Nothing to resize. Premise checked, premise false.

**A real bug turned up underneath it.** `capacity.ts` called `os.totalmem()`, which inside a container
reports the HOST rather than the cgroup — 32 GB against a 26 GB container cap. Fixed in `7d37b3c3c`:
read cgroup v2 `memory.max`, then v1 `memory.limit_in_bytes`, falling back to the host; discard a
cgroup value larger than the host, because that means the file was misread.

**It is currently correct by luck, which is why it was worth fixing now.** Concurrency is
`min(byMemory, byCpu, ceiling)` — host reading `min(11, 8, 6)`, true reading `min(8, 8, 6)`. Both give
6, because the ceiling decides. But the compose file itself warns that "this limit and that calculation
must be moved together", and the ceiling is the number most likely to move: it is a policy about not
hammering small county servers, not a hardware fact. Raise it and the worker starts admitting runs
sized against memory the cgroup will refuse — an OOM kill at minute 22, after the paid documents have
been bought.

8 new tests cover a branch that only executes inside a container, including one pinning today's netcup
answer at 6 while asserting `byMemory` is 8 rather than 11 — so the fix is visible even though the
outcome does not change. **6 remains a politeness ceiling, not hardware.**

CPU deliberately still reads the host: compose sets no `cpus` limit, so all 12 really are available.

---

## 3. R — Research capability

> ### ✅ RESEARCH IS FULLY CREDENTIALLED — 2026-08-29, and the dead hosts do not touch it
>
> `/healthz` reports **zero warnings** for the first time. The owner set TexasFile and
> `WS_TICKET_SECRET` on the worker:
>
> ```
> ok   playwright                    ok   document_storage  backend=r2 bucket=starr-recon-artifacts
> ok   supabase          HTTP 200    ok   research_events   REDIS_URL configured
> ok   anthropic         Key present ok   websocket_auth    WS_TICKET_SECRET configured
> ok   browser_factory   backend=local
> OFF  captcha_solver    provider=stub          ← correct; the CapSolver key is rejected (§R4a)
> ```
>
> `WS_TICKET_SECRET` is confirmed on BOTH sides, which matters because it is an HMAC: the app signs
> a ticket and the worker verifies it. `POST /api/ws/ticket` now answers **401** where it used to
> answer **503** — 401 is "you are not signed in", which is the correct reply to an unauthenticated
> probe and proof the secret is present on Vercel.
>
> **Two things still cannot be verified from outside, and are stated rather than glossed:** whether
> the TexasFile credentials WORK (the worker checks presence, and the real test is a run that hits
> the paywall and spends money), and whether the two `WS_TICKET_SECRET` values are the SAME STRING
> — both being set does not make them equal, and a mismatch shows up as a WebSocket that closes
> immediately with no useful error.
>
> #### The 23 dead adapter hosts — re-measured, and NONE of them is routed
>
> `node worker/scripts/check-adapter-hosts.mjs`: **19 resolve, 23 do not**, unchanged since
> 2026-08-02.
>
> | Adapter file | Dead | Routed? |
> |---|---|---|
> | `henschen-clerk-adapter.ts` | 8 | No — `henschen` is not in `PROVEN_VENDORS` |
> | `fidlar-clerk-adapter.ts` | 6 | No — `fidlar` is not in `PROVEN_VENDORS` |
> | `tyler-clerk-adapter.ts` | 6 | No — Tyler routing derives from `TYLER_EAGLE_PORTALS` in a *different* file, which has **zero** dead hosts |
> | `kofile-clerk-adapter.ts` | 2 | No — Travis `48453` and McLennan `48309` are **not in `KOFILE_FIPS_SET`** |
>
> **Zero of the twenty-three are reachable by `getClerkSystem()`.** Every one sits in an adapter
> config for a county that routing does not send there, and those counties fall through to TexasFile
> — which now has credentials. Research capability is not degraded by any of this.
>
> **Control, because a DNS check reporting a dead world is the obvious way to be wrong:**
> `williamson.tx.publicsearch.us` resolves to `35.247.2.99`. The `<county>.tx.publicsearch.us`
> pattern is real for the counties that use it; Travis and McLennan simply do not.
>
> **This correction was needed because I got it wrong out loud first.** I reported the count and
> added a consequence I had not checked — "runs route to them and get *no records found*". They do
> not. The number was right and the sentence after it was invented, which is the more dangerous half
> because it is the half somebody acts on.

### R1 — Open-web research via Tavily ✅ DONE 2026-08-26 (R1a + R1b)

`TAVILY_API_KEY` is configured and does exactly one job: guessing county CAD URLs, as "Method 9" in
`lib/research/boundary-fetch.service.ts`. Free tier, 1,000 requests/month.

That same API is a general web search. Per property it could be finding:

- Owner name → liens, judgments, probate, business filings
- Address → local news, permits, planning agendas, code enforcement
- Prior listings, plat history, subdivision records
- Environmental and utility filings that never appear in a CAD portal

**This is what "research everything findable" actually means**, and it is the difference between
scraping the county and searching the world. The API is already paid for; the work is prompt design,
result ranking, and feeding what comes back to Claude.

> **Browserbase is NOT this.** It is a *place to run a browser* — hosted Chromium on residential IPs.
> It finds nothing and reads nothing. It solves exactly one problem: a site that blocks datacentre IPs.
> Useful, narrow, and unrelated to giving the AI reach. See S2.

**R1a — the search itself. SHIPPED 2026-08-26.** `lib/research/open-web.ts`, wired into
`analyzeProject` at the first point where address, county, parcel id and owner are all resolved —
earlier would build queries from a half-empty subject, and an angle with nothing to ask gets skipped.

Five angles, each its own search: `owner-encumbrance`, `permits-planning`, `news-disputes`,
`plat-subdivision`, `environmental-utility`. One query with everything in it returns one topic's
results and silently answers none of the other questions.

Three rules that each stop a specific way of being plausibly wrong:

- **An angle with nothing to ask is skipped, not guessed.** Searching for liens with no owner name
  returns the county's general lien page — a well-formed finding answering a question nobody asked,
  which reads as "we checked".
- **Domain authority is weighted, not filtered.** Tavily scores topical match, not trustworthiness,
  so ranking on score alone puts real-estate lead-gen above the county. Government is 1.0, the
  records vendors we already pay for 0.8, open web 0.2 — but nothing is discarded, because a blog
  post may be the only public record of a boundary dispute.
- **Angles fail independently.** A rate-limit on the owner search must not lose the permit findings.

Every non-result carries a reason (`not-configured` / `insufficient-subject` / `search-failed`),
following `lib/search/semantic.ts`. Non-fatal by construction: a web search being down can never
fail a run that has already bought paid documents. 19 tests, `tsc` clean, 1,050 suite tests green.

**R1b — the findings reach the AI, not just the log. SHIPPED 2026-08-26.**

Written as a `research_documents` row, so the existing pipeline reads them like any other source:
data points extracted, cross-validated against the deed and the CAD record, embedded for AI search,
listed in the UI. One insert inherits all of that. A bespoke "web findings" field would need every
one of those rebuilt, and would be missed by whichever was written last.

`source_type: 'linked_reference'` + `document_type: 'property_report'` — the honest fits inside this
table's CHECK constraints, **read from the live database rather than guessed**. There is no
`web_search` source type; inventing one would have failed at insert time, in production only.

Three deliberate properties of the rendered document:

- It states outright that these are **not** county records — it sits in the same list as deeds.
- Every entry keeps its URL, angle and a **worded** provenance band ("government record" /
  "open web — unverified"). Strip that and the AI gets a flat list of equally-credible-looking
  claims, which is exactly how a confident wrong answer reaches a survey report.
- Angles that did **not** run are listed, so "could not ask" is never read as "found nothing".

Re-running refreshes the row rather than adding a second — two copies would be cross-validated
against each other as though they were independent sources. The row is deliberately not pushed into
the in-memory document arrays either: those are loaded from this same table moments later, filtered
to `extracted`, which is the status written here.

24 tests, `tsc` clean, production build exit 0.

### R2 — County coverage ◐ R2a SHIPPED 2026-08-26 · R2b open

Measured 2026-08-26:

| Layer | Coverage |
|---|---|
| **BIS CAD portals** (`services/bis-cad.ts`) | **108 Texas counties** — Bell outward in rings |
| CAD adapters wired (`services/property-discovery.ts`) | 6 — BIS, Tyler, TrueAutomation, HCAD, TAD, **GenericCAD fallback** |
| Clerk/deed routing (`services/clerk-registry.ts`) | **all 254** — 22 Kofile + specific vendors, TexasFile as the proven universal fallback |
| Government data sources (`worker/src/sources/`) | 10 — FEMA, NRCS, RRC, TCEQ, TNRIS, TxDOT, USGS, Comptroller, GLO |
| Deep county modules (`counties/`) | **1** — Bell, 7 dedicated scrapers + analyzers |

> ### ⚠ CORRECTED 2026-08-26 — "deed coverage is 21 counties" was WRONG
>
> That number came from `adapters/clerk-registry.ts`. **There are two clerk registries**, and the one
> that decides behaviour is `services/clerk-registry.ts`, which I had not found.
>
> `getClerkSystem()` routes by FIPS through Kofile → eDoctec → USLandRecords → Aumentum → iDocMarket
> → CountyFusion → Tyler → Henschen → iDocket → Fidlar, **and falls back to `texasfile`** — which is
> in `PROVEN_VENDORS`. So **every Texas county routes to a working clerk system.** Deed coverage is
> 254 counties, not 21.
>
> The third false premise this session, and mine. Recorded rather than edited away.

**So what is the real gap?** Two narrower things:

1. **Unproven vendors are skipped.** `countyfusion`, `henschen`, `idocket` and `fidlar` each have
   adapters and FIPS sets, but are absent from `PROVEN_VENDORS`, so their branches never fire and
   those counties fall through to TexasFile. That is the vendor-proving rule working as designed —
   but it means we pay TexasFile per document for counties whose native portal is already coded.
   Proving one vendor converts a whole set of counties at once. **Highest-value R2 work.**
2. **TexasFile is pay-per-document.** A universal fallback that always works and always costs is a
   different thing from native coverage, and the funnel does not currently distinguish them.

**R2a — the registry is now checked rather than trusted. SHIPPED 2026-08-26.**

Every `baseUrl` in `adapters/clerk-registry.ts` was fetched. Of 11 URLs: 6 fine, **4 wrong**.

- **Bell — the home county, marked `implemented`, annotated "Fully tested" — pointed at
  `www.bellcountyclerk.org`, which does not resolve.** Bell research has never been broken by it,
  because `counties/bell/scrapers/clerk-scraper.ts` hardcodes the real host and never reads this
  table; 215 rows in `research_documents` came from `bell.tx.publicsearch.us` while the registry
  named a dead host. Corrected, and now pinned by a test against the scraper.
- Coryell (404), Collin (404), Travis (unreachable) — annotated with the verification date rather
  than nulled, because "no URL" reads as "no online system", which is a different and wronger claim.
- Fort Bend was `http://` and the server redirects to https anyway — a county records search
  travelling in plaintext for no benefit. **Found by the new test, not by the sweep.**

`clerk-registry-truthfulness.test.ts` keeps it honest offline: the Bell entry must name a host the
Bell scraper actually uses, `implemented` requires a URL and a note, every URL must be https, and a
known-dead URL must carry its annotation. Deliberately no network calls — a test that fetches county
servers on every CI run is both flaky and exactly the load-test behaviour the worker's concurrency
ceiling exists to avoid.

> ### ⚠ R2b's premise was also wrong — corrected 2026-08-27
>
> I wrote it as "pick a vendor, drive it, promote it", as though those four were unproven merely
> because nobody had got round to it. `vendor-reachability.test.ts` records what actually happened:
> **all 54 base URLs across Tyler, Henschen, iDocket and Fidlar were probed on 2026-08-02 and every
> one was unreachable.** Not stale addresses — *fabricated patterns*. `<county>.co.texas.us`,
> `idocket.com/TX/<County>`, `<county>.fidlar.com`: URL shapes that never existed.
>
> Four of six clerk adapters were routing research at domains that are not there, and it surfaced as
> **"no records found"** — a statement about the property rather than about our routing, and
> indistinguishable from a real answer. Fourth false premise of mine this session.

**R2b — re-probed 2026-08-27, and it opened a real lead.** The 2026-08-02 finding holds three weeks
on (a stale "all dead" is as misleading as a stale "all fine", so it was checked rather than trusted):
`laredo.fidlar.com`, `idocket.com/TX/Collin` and `deed.traviscountyclerk.org` are all still gone.

**But one live Fidlar portal turned up, in a shape the adapter does not build:**

| URL | |
|---|---|
| `ava.fidlar.com/TXGalveston/AvaWeb/` | **200 — live** |
| `ava.fidlar.com/TXBrazoria/AvaWeb/` | 404 — so it is *not* a universal pattern |
| `ava.fidlar.com/` | 403 — host alive, no root page |
| `laredo.fidlar.com` (what the adapter builds) | **no A, AAAA or CNAME — the host does not exist** |

So Fidlar is not uniformly dead — **the adapter is pointed at the wrong URL shape.**

**The URL discovery is now done, and it kills the item. ⏸ R2b DEFERRED 2026-08-27.**

Every county Fidlar is configured for was probed against the live AVA pattern, one request per
second against one host:

```
TXWard TXTerrell TXJasper TXNewton TXSabine TXSanAugustine TXSanJacinto
TXDallas TXHidalgo TXMenard TXFoard TXFortBend TXFranklin TXBrazoria   → 404 (14 of 14)
TXGalveston                                                            → 200
```

**Galveston is the only live Fidlar portal in existence for these counties — and Galveston is not in
the firm's service area.** It is absent from the 46 counties in `lib/seo/business.ts`, roughly 200
miles from Belton, on the Gulf Coast.

So proving Fidlar — the whole exercise of driving an adapter, verifying real documents come back, and
promoting it to `PROVEN_VENDORS` — would convert **one county the firm does not work in** from
TexasFile to native. The cost is a full vendor-proving cycle against a live portal; the benefit is
zero for this business today.

**Deferred on measured value, not on difficulty.** Revisit only if the firm takes work in Galveston,
or if Fidlar stands up portals for counties inside the service area. The same probe re-run answers
that in about fifteen seconds.

> This closes the "proving one vendor converts a whole set of counties at once" idea for Fidlar
> specifically. It was a reasonable hypothesis and the data does not support it: there is no set.
> **TexasFile's universal fallback is not the consolation prize here — it is the answer**, and the
> only genuine cost is per-document pricing rather than missing coverage.

**Deliberately NOT promoted to `PROVEN_VENDORS`.** A 200 from a landing page is reachability, not
proof. The rule is that an adapter must be driven against a real county and return a real document;
pinging is the cheap half, and promoting on it would put an unproven adapter in front of real records
— which is the failure the proving rule exists to prevent. **Server-gated:** driving it needs the
worker, which needs netcup.

### R3 — Multi-tenancy is ~60% present in the schema and 0% present in the worker ◐ **RE-MEASURED 2026-08-29**

The owner intends to eventually rent research capacity to other surveying firms.

> **⚠ THE ORIGINAL CLAIM WAS WRONG, and wrong in the direction that inflates the work.** It read:
> *"There is no `org_id` anywhere in the research pipeline, worker services or routes."* Measured
> against the live schema on 2026-08-29 — the fourth parked premise this project has checked and the
> fourth to be false or far narrower than written, see [[feedback_check_the_premise_before_building]].

Of the **27 research tables**:

| | count | what it means |
|---|---|---|
| carry `org_id` directly | **7** | `research_projects`, `research_runs`, `research_documents`, `research_usage_events`, `research_batch_jobs`, `research_subscriptions`, `research_clerk_lookups` — the ownership and billing spine already exists, and all seven are enrolled in `ORG_SCOPED_TABLES` as of 2026-08-29 |
| reach an owner by foreign key | **9** | `research_adjoiners`, `research_chain_of_title`, `research_flood_zone`, `research_packets`, `research_survey_plans`, `research_tax`, `research_topo` (via `research_projects`); `research_requests`, `job_research` (via `jobs`). Child rows of an owned parent do not need their own column — a second one is a second answer to the same question |
| no path to an owner | **11** | split below, and the split is the whole point |

**Eight of those eleven SHOULD stay unowned, and giving them `org_id` would be the bug.**
`research_counties` (254 rows), `research_site_adapters` (57), `research_data_vendors` (4),
`research_county_data_sources` (1), `research_self_heal_settings` (1) and the three
`research_adapter_*` health tables are **shared platform knowledge**. Bell County is Bell County for
every firm; an adapter that learned to read its portal is worth more the more tenants use it. Copying
that per-tenant is how one customer's outage stops being everyone's fix.

**Three genuinely need tenant attribution, and all three are empty today:**

- `research_document_purchases` (0 rows) — `worker/src/services/purchase-ledger.ts`
- `research_vendor_accounts` (0 rows) — `worker/src/services/vendor-accounts.ts`
- `research_vendor_topups` (0 rows) — `worker/src/services/vendor-accounts-policy.ts`

These are **money**. You cannot bill firm A for firm B's document purchase, and a shared vendor
balance is a shared invoice. Being empty is the opportunity: adding the column now costs one seed and
no backfill. Adding it after they fill costs exactly what `design_mockups` cost — 1,371 rows, a
snapshot, and an ordering trap where enrolling before backfilling makes every record vanish at once.
**Not done here** because it is schema for a feature nobody has commissioned; flagged because the
cheap moment is now and it closes silently.

**The half of the original claim that was exactly right:** `grep -c org_id worker/src` returns **0**
across 286 files. The worker does not read, write or filter the column anywhere — including on the
seven tables that carry it. The schema is roughly a layer ahead of the code, which is a much better
place to be than the reverse, but it also means the seven columns are decorative until something
uses them.

So R3 is three pieces, not one build: **(a)** teach the worker to stamp and filter `org_id` on the
seven tables that already have it, **(b)** add the column to the three money tables while they are
still empty, **(c)** per-firm quotas and billing attribution, which is the actual product work.

> **Do not size hardware for this yet.** And when it comes: county portals rate-limit by **IP**, so ten
> firms behind one address is how you get blocked. The scale-out unit is another cheap box with its own
> IP, not a bigger box. Four netcup servers = $184/mo, 48 dedicated cores, four IPs — half the price of
> one equivalent DigitalOcean General Purpose droplet.

### R4a — the CapSolver key is REJECTED ⚠ MEASURED 2026-08-27

`CAPSOLVER_API_KEY` is set (68 characters) and their API refuses it:

```
POST api.capsolver.com/getBalance → 401
ERROR_KEY_DENIED_ACCESS — account authorization is invalid: Code(41)
```

Expired, revoked, or from a closed account. Harmless today because
`CAPTCHA_PROVIDER=stub` means nothing calls it — but **the moment anyone enables captcha solving it
fails on the first portal that asks**, with an authorisation error rather than a solve failure, which
sends the operator to debug the wrong thing entirely.

**And it exposes a real gap in W3, which is my own work.** That check is
`CAPTCHA_PROVIDER=capsolver && !CAPSOLVER_API_KEY` — it asserts **presence**. A key that exists and
is rejected passes it silently. Same shape as the `vercel env pull` lesson: a value being there is
not a value being right.

**Deliberately not "fixed" by adding a validity probe at boot.** A worker whose startup depends on a
third-party API is a worker that cannot start when that API has an outage — strictly worse than the
problem. Validity is a thing to check when you turn a provider on, not on every boot, and that is now
written down here where the turning-on happens.

**Owner decision, one of two:** get a working key, or drop CapSolver from the stack. Three services
have now been measured and all three were in a different broken state — Browserbase valid-and-never-
used, Tavily never-configured, CapSolver present-and-rejected. **None of them would have been found
by reading the config.**

### R4 — `CAPTCHA_PROVIDER=stub` ☐

CapSolver is configured but the provider is set to `stub`, so captcha solving is not live. Decide
whether to enable it — and note the standing owner decision in the deep-build plan that **which
counties we are willing to automate is a policy question, not a config default.**

---

## 4. S — Secrets and spend

### S1 — Doppler is the source of truth ✅ established

`Doppler prd → Vercel Production (Sensitive)`, status **In Sync**. This was nearly a costly
misunderstanding: two variables were written straight to Vercel earlier that day, which is the mirror,
not the source.

**The sync is additive, not destructive** — it reports In Sync while 25 Vercel-only variables coexist.
An earlier warning in this session that `DATABASE_URL` was "one sync away from being wiped" was
**overstated** and is corrected here.

Vercel writes them as *Sensitive*, which is write-only — that is why `vercel env pull` returns `""` for
most values. **A blank from `vercel env pull` proves nothing.**

### S2 — Cancel these ☐

| Service | Finding |
|---|---|
| **Browserbase** | `BROWSER_BACKEND=local` in Doppler `prd`. The code refuses to route to Browserbase unless this says `browserbase` **and** the adapter is listed in `BROWSERBASE_ENABLED_ADAPTERS`. **Paid for, never ran.** Re-enable per adapter if a portal ever blocks the netcup IP. |
| **Mailgun** | Zero code references at any layer — comments only. Resend is the real provider (9 files). |
| **CapSolver** | Check billing; `CAPTCHA_PROVIDER=stub` means it is not being called (see R4). |
| **DigitalOcean** | Droplet destroyed. Settle the balance and close the account — check for orphaned snapshots, volumes and reserved IPs, which bill independently. |

**Doppler itself stays** — free Developer plan, and it is load-bearing infrastructure. An earlier
"cancel it, zero code references" call in this session was wrong: it checked the wrong layer.

### S2b — ⚠ 17 OF 18 VENDOR CREDENTIALS ARE EMPTY — measured 2026-08-27

This reframes the entire cost audit, and it is the single most useful thing measured tonight.

```
HAS A VALUE (1):
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (39)

EMPTY OR ABSENT (17):
   ATTOM_API_KEY · REGRID_TOKEN · TNRIS_API_KEY · LANDEX_API_KEY · LANDEX_ACCOUNT_ID
   USPS_USER_ID · MAPBOX_ACCESS_TOKEN · ELEVENLABS_API_KEY · GOOGLE_MAPS_API_KEY (server)
   CSLEXI_USERNAME · TEXASFILE_USERNAME · GOVOS_ACCOUNT_USERNAME · KOFILE_USERNAME
   TYLER_PAY_USERNAME · IDOCKET_PAY_USERNAME · HENSCHEN_PAY_USERNAME · FIDLAR_PAY_USERNAME
```

Same method that correctly read Anthropic at 108 characters and Supabase at 219 — these are genuinely
length-zero, not a reading error.

**So the cost half of the audit largely dissolves.** "Check the iDocket subscription", "check ATTOM
and Regrid", "the county vendors have been billing through the outage" — **there are no credentials,
which strongly suggests there are no accounts.** The three services that DO cost money are the three
already measured: Browserbase (billing, unused), Anthropic (in use), and Google Maps (in use).

**And it changes the research picture more than the cost one.** `worker/src/services/paid-platform-registry.ts`
splits platforms by `authType`:

| `authType` | Cost | Works with no credentials? |
|---|---|---|
| `none` | $0.00/page | **Yes** — free search and free documents |
| `username_password` / `api_key` | ~$0.50/page | No |
| `subscription` | included (iDocket, est. $50–200/mo) | No |

So a deep run can still search the free platforms and read what they publish, and **cannot purchase a
document from any paid one.** `TEXASFILE_USERNAME` being empty matters most: TexasFile is the
universal clerk fallback that made "all 254 counties are routed" true in R2. The **routing** is real;
the **retrieval** stops at the paywall.

**Open question worth answering before buying anything:** how much of a useful survey packet comes
from the free platforms alone? If the free tier carries the index and the paid tier only carries
document images, the gap is narrower than it looks. That is measurable once the worker runs — and it
is a much better basis for deciding which vendor account to open first than guessing.

### S3 — Worth checking ☐

**Mapbox** (one geocoding fallback, duplicating Google) · **ElevenLabs** (tutor read-aloud only;
degrades to the free browser voice) · **managed Redis** (falls back to `redis://localhost:6379`; runs
free on the netcup box) · **iDocket** (registry marks it a real subscription, est. **$50–200/month**).

> #### Twilio — measured 2026-08-27, and my earlier guess was wrong
>
> I wrote *"a rented number bills monthly whether or not it sends anything — check the console"*.
> Checked:
>
> | | |
> |---|---|
> | Account status | **active** |
> | **Phone numbers rented** | **ZERO** |
> | Messages ever | at least 5 |
> | Most recent | **30 Jan 2026** — seven months ago, and **undelivered** |
>
> **So there is no monthly rental to cancel.** An active Twilio account holding no numbers bills
> essentially nothing, and the cost concern I raised does not exist.
>
> **But something worse is true instead: SMS cannot work.** Outbound messages need a `from` number
> and the account owns none — which is exactly why the last attempt in January is marked
> `undelivered`. The code path is fully wired and reachable (`lib/saas/notifications/sms.ts`, called
> from the Stripe webhook, signup, the trial-ending cron and invites), and `TWILIO_PHONE_NUMBER` is
> set in config, naming a number the account does not hold.
>
> **A feature that is wired, configured, reachable, and structurally incapable of succeeding** — and
> it has been failing quietly for seven months. Owner decision: rent a number if SMS is wanted, or
> remove the notification path so it stops pretending. Not a cost item; a correctness one.

> #### ✅ THE ADAPTER HALF IS FIXED — 2026-08-29, and reading the code found worse than the account did
>
> The measurement above says *why* SMS could not work. Opening `lib/saas/notifications/sms.ts` showed
> what it did about that:
>
> ```js
> if (!accountSid || !authToken || !fromNumber) {
>   console.info('[notifications/sms] DEV mode (no Twilio creds) — would send:', ...)
>   return true;
> }
> ```
>
> **No environment check.** In production, an SMS that could not possibly be sent logged at `info`,
> said "DEV mode", and returned `true`. Every property of that line is wrong for finding it: the one
> severity nobody greps, the one word that tells a reader it does not apply to them, and a return
> value claiming success. Seven months of alerts announcing themselves as fine.
>
> **The header said where the next one was.** `sms.ts` states it copies "the same pattern as the
> Resend adapter in ./email.ts". It does, including this. So the CLASS was swept rather than the
> instance fixed — every direct Resend and Twilio caller in `lib/` and `app/`.
>
> | Where | Verdict |
> |---|---|
> | `lib/saas/notifications/sms.ts` | **Broken and active.** Fixed. |
> | `lib/saas/notifications/email.ts` | **Broken, latent** — `RESEND_API_KEY` is set, so mail is sending. But the return value is CONSUMED: `weekly-reports` writes a `WEEKLY_REPORT_SENT` audit-log row when it is true. Fixed. |
> | `app/api/contact/route.ts` | **Broken, latent.** Production logged nothing, and the customer was shown *"Form received (dev mode - check server logs)"*. The lead was never lost — the insert and the in-app notification already ran. Fixed. |
> | `app/api/admin/email/send/route.ts` | **Broken, latent, and the worst-shaped**: wrote a send record claiming `sent_count: N, failed_count: 0` and returned `success: true`. Fixed — logs the attempt with the counts the other way round, and returns 502, which is this route's own convention for a mail-service failure. |
> | `invoices/[id]/send`, `leads/[id]/reply`, `payment-attempts/[id]/clear`, `public/invoice/…/attempt`, `public/invoice/…/receipt` | **Already correct.** All four capture `send_error` and return it. Left alone. |
> | `lib/learn/tutor-guard.ts` | Returns true without a key for a documented, unrelated reason. Left alone. |
>
> **Four of seven direct callers were already right**, which is worth recording as plainly as the
> three that were not: the pattern was a copied mistake, not a house style.
>
> Every fix keeps the dev short-circuit unchanged — a local clone with no Resend or Twilio account
> must not fail a signup — and every one was MUTATION-TESTED against the previous file rather than
> merely run green. A suite that passes against both versions describes nothing.
>
> **The owner's question is untouched.** Rent a number or delete the SMS path is still a decision.
> What is no longer a judgement call is that the code says which of those two worlds it is in.

> Several of these — county vendors, ATTOM, Regrid, Tavily, CapSolver — serve deep research, which has
> been offline since at least 2 August. Usage-based ones cost nothing while idle; **subscriptions have
> been billing for a feature nobody could run.**

### S4 — Finish the Doppler consolidation ☐

**8 migrated 2026-08-26** (Doppler `prd`: 89 → 97): all four VAPID keys, `NEXT_PUBLIC_PUSH_VAPID_KEY`,
`GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `TWILIO_PHONE_NUMBER`, `NEXT_PUBLIC_ADMIN_PWA`.

**14 remain, Vercel-only and unreadable** (Sensitive). Copy from the Vercel dashboard into Doppler:

- **Worth doing:** `DATABASE_URL`, `AUTH_URL`, `CRON_SECRET`, `GOOGLE_MAPS_SERVER_KEY`
- **Only if keeping the feature:** `ELEVENLABS_*` (5), `TTS_PROVIDER`
- **Likely empty placeholders:** `GOOGLE_ADS_RESOURCE_INQUIRY` / `_QUOTED` / `_JOB_WON` / `_JOB_PAID`

`DOPPLER_CONFIG` / `_ENVIRONMENT` / `_PROJECT` **stay in Vercel** — they tell Vercel which config to
pull, and moving them would be circular.

### S5 — Rotate ☐

The Voyage key was **rotated** (Doppler holds a different value from the exposed one) — **revoke the
old one in the Voyage dashboard.** A Doppler CLI token now exists on the work laptop
(`doppler login revoke` when the migration work is done).

---

## 5. M — Website and marketing

### M0 — The three intake forms agree ✅ pinned 2026-08-27
**Pinned 2026-08-27.** `__tests__/leads/intake-forms-agree.test.ts`.

The site has **three separate hand-written intake forms** — the home page, `/contact`, and the
pricing calculator — plus the unrendered fourth copy noted on the orphan list. Checked by hand this
session: all three carry attribution capture, the honeypot, and a `trackConversion` call with its own
distinct source label. Nothing was broken.

That verification is now a test, because **the failure mode here is silent and expensive**. A form
that stops sending `attributionFormFields` still submits perfectly: the lead saves, the email
arrives, and the gclid is simply gone — so an ad-driven enquiry lands looking organic and Ads never
learns the click converted. Same for a dropped `trackConversion` (Smart Bidding optimising against a
funnel missing a third of its conversions) and a dropped honeypot (spam forwarded). Every one of
those looks like a working form.

Mutation-verified rather than trusted: renaming each of the five guarantees in one form is caught.
The first draft was **not** — a loose `/attributionFormFields/` still matched a renamed
`ZZattributionFormFields`, so the assertion would have survived the exact edit it exists to catch.
Word-boundary anchored now.


### M1 — Google Ads offline conversions ☐ built, switched off

Four conversion actions, created via **Import → Manual import using API or uploads** (not "Website"):

| Name | Category | Primary? | Window |
|---|---|---|---|
| `Lead — Inquiry` | Submit lead form | Secondary | Maximum |
| `Lead — Quoted` | Qualified lead | Secondary | Maximum |
| **`Job — Won`** | Converted lead | **Primary** | Maximum |
| `Job — Paid` | Purchase | Secondary | Maximum |

Only `Job — Won` is Primary — a dozen equal-weight goals degrades Smart Bidding. **Wait 4–6 hours after
creating them before the first upload**; earlier uploads can take two days to appear, which reads as a
broken integration.

Then the **CSV path** at `/admin/marketing/exports` → upload at Goals → Conversions → Uploads. **This
needs no developer token**, so it does not wait on Basic access. Put the resource names in **Doppler**,
not Vercel. `/admin/marketing` renders a banner that probes the API and names the exact problem.

### M2 — Search Console ☐

Resubmit `/sitemap.xml` (until this week it listed a redirecting host) · Rich Results Test on the
homepage · **Request indexing** for the five retitled pages (contact, pricing, credentials, resources,
service-area) — Google has them filed under the homepage's title · read Performance → Queries, which
decides M4.

### M3 — `sameAs` is deliberately empty ☐

The structured data lists no social profiles. It is one of the most valuable properties in the block —
how Google ties this site to the entity it already knows — and inventing URLs would publish claims to
pages that may not exist. **Owner to supply:** Business Profile link, Facebook, LinkedIn, BBB, trade
directories. One edit to `lib/seo/business.ts`.

### M4 — County landing pages ☐ largest unbuilt organic opportunity

The sitemap is nine generic URLs. Someone searching *"boundary survey Williamson County"* has no page
written for them. **Deliberately last:** building 46 pages on a guess produces 46 thin pages Google
ignores. Choose from real Search Console query data (M2), then build genuine pages — local context, the
services that county needs, real project references — not one template with the name swapped.

### M5b — The SEO work was VERIFIED AGAINST PRODUCTION ✅ 2026-08-29

Not re-read in the repo — fetched from `https://www.starr-surveying.com` and parsed.

| Claim | Verdict |
|---|---|
| `robots.txt` serves (was once a 404 page) | ✅ 200, correct `Disallow` set, `Sitemap:` and `Host:` both on `www` |
| Apex redirects consistently | ✅ 307 → `www`, no third spelling anywhere |
| Sitemap | ✅ 9 URLs, every one `www` |
| "5 pages served the homepage's title" | ✅ **fixed and live** — all 9 sitemap pages serve distinct, specific titles |
| LocalBusiness JSON-LD | ✅ live: a `@graph` of `[ProfessionalService, LocalBusiness]` + `WebSite`, with NAP, `legalName: Starr Technical Services Inc.`, hours and `areaServed` |
| GA4 `G-V8715QJGBX` | ✅ live, in `app/layout` chunk alongside the googletagmanager loader |
| Canonicals | ⚠ **two pages had none** — fixed, see below |

**`/privacy` and `/pricing/software` served no `<link rel="canonical">`**, and neither served
OpenGraph or a Twitter card either. Both hand-rolled a `metadata` object instead of calling
`pageMetadata()`, and both had a title and a description — which is exactly why it went unseen. A
raw metadata object looks finished because the two fields anybody thinks to check are present;
`alternates` is not a field you notice missing. Fixed, with a guard whose exempt list is derived
from the real `robots.txt` rules rather than hand-written.

> ### ⚠ FOUR FALSE NEGATIVES IN ONE VERIFICATION PASS, ALL OF THEM THE INSTRUMENT
>
> Every "this is missing" below was wrong, and each would have been filed as a defect if the control
> had not been run first. Recorded because the ratio is the point: in a single afternoon of checking
> a live site, the tool was wrong four times and the site was wrong twice.
>
> | What I concluded | Why it was wrong |
> |---|---|
> | "JSON-LD has `@type: undefined`" | Read `@type` at the top level of a document whose top level is `@context` + `@graph`. The types are one level down. |
> | "GA4 is not on the page" | `NEXT_PUBLIC_*` values are inlined into client JS chunks at build time, not into the served HTML. Wrong file. |
> | "`NEXT_PUBLIC_GA4_MEASUREMENT_ID` is not in Vercel" | Grepped `GA\b|GA_`, and neither matches `GA4`. It is set, and was three days ago. |
> | "the page references 0 JS chunks" | A `src="..."` regex that assumed an attribute order. There are 35 references and 22 script tags. |
>
> The one habit that caught all four is the same one: **before believing a negative, prove the
> instrument can produce a positive.** Counting `_next/static` occurrences took one command and
> turned "no chunks" into "my regex is wrong". See [[feedback_your_probe_can_be_the_bug]].

### M5 — Smaller open items ☐

- **Homepage has no self-canonical.** It is a client component whose only layout is the root, and a
  canonical there applies site-wide — the exact bug that once made every page a duplicate of the
  homepage. Low value, real risk; left alone deliberately.
- **Admin address autocomplete — ✅ SHIPPED 2026-08-27, and the finding was two bugs, not one.**

  The open question was *"is the symptom real?"*, and the answer turned out to be that **the component
  was structurally incapable of telling anyone.** `getPlacePredictions` reports every outcome through
  one status string, and the old code handled all of them in a single `else` branch: clear the list,
  render nothing. So `REQUEST_DENIED` — which is exactly what a Maps-JS-only key returns for a Places
  request — produced **the identical screen** to typing a rural address Google has never indexed.
  Neither the user nor this doc could distinguish them, which is why the item sat here as *"may be
  broken"* rather than as a yes or a no.

  Fixed without touching the key restriction, because the restriction may well be correct:
  `lib/maps/places-status.ts` classifies the status into `ok` / `empty` / `denied` / `transient` /
  `broken`, and the component shows a one-line notice where the dropdown would be. `empty` stays
  silent on purpose — a half-typed street has not matched *yet*, and warning on every keystroke would
  make the real warning unreadable. **The next person to type an address will be told which it is**,
  and the input remains a plain text box throughout, so a denied key degrades to typing rather than to
  a dead control.

  Three smaller failures shared the same silence and are also closed: a script `error` was never
  listened for (a 404 or a blocked request looked exactly like "still loading", forever); a
  `getDetails` failure left city/county/state/zip **silently blank**, which is how a job gets filed
  against the wrong county; and the component adopted *any* `maps.googleapis.com` script on the page,
  including one loaded without `libraries=places` — the ordinary way to load a map — after which
  `google.maps.places` stays undefined and it waits on a load event that can never help it.

- **The same component was rendering unstyled on `/admin/research`** — found while fixing the above,
  and independent of any API key. `.address-autocomplete__*` was defined in `AdminJobs.css`, which
  `app/admin/jobs/layout.tsx` imports, so it **loads on `/admin/jobs` and nowhere else.** The
  component has two callers, and the second is `app/admin/research/_tabs/ProjectsTab.tsx`. There, the
  suggestion list was a bare bulleted `<ul>` in normal document flow — no positioning, no background,
  no border — shoving the rest of the form down the page every time somebody typed three characters.
  Nothing errored, so nothing reported it.

  Moved to `app/admin/components/AddressAutocomplete.css`, imported by the component itself, so it
  reaches every consumer including ones not written yet. **This is the third time a shared class has
  been defined inside a route-scoped stylesheet in this repo** (see
  [[feedback_route_scoped_css_swallows_fixes]]); a test now asserts every class the component renders
  is defined beside it, and that no copy remains in `AdminJobs.css` to drift.

  17 tests, `tsc` and `next lint` clean.
- **~~One `research_documents.storage_url` returns 400 — probably a casualty, not a bug.~~
  ⚠ MEASURED 2026-08-30: it is 22, they share one cause, and it is a live bug.**

  Probed every one of the 347 distinct `storage_url` values with a HEAD request: **325 → 200,
  22 → 400.** A first pass reported 21 failures and 15 `429`s; the 429s are the probe being
  rate-limited, not the objects being broken, so they were retried with backoff until every URL
  gave a real answer. Reporting a throttle as a verdict would have invented one failure and hidden
  another.

  **All 22 are `map-images/` — `aerial_photo_*.png` and `topo_map_*.png`. Not one is an uploaded
  document.** That is a pattern, not a casualty of the storage migration.

  The cause is upstream and still active. `lib/research/map-image.service.ts` produces those
  artifacts, and the codebase calls **Maps Static API** from four places
  (`parcel-map-capture.service.ts`, `progressive-zoom.service.ts`, `lot-correlator.ts` ×2).
  Measured against the live key, with Maps JavaScript as a control:

  ```
  Maps Static API   HTTP 403  "This API is not activated on your API project"
  Maps JavaScript   HTTP 200  (control — proves the key itself is fine)
  ```

  So the research pipeline depends on an API that was never switched on, and every run that reaches
  the imagery step produces broken aerial/topo artifacts. This is not a "nice to have" alongside
  Places and Geocoding — **it is a dependency the code already has.** See the enablement list in
  §M5b; enabling it is the same one-click action.

  Also found while counting: **306 of 654 `research_documents` rows have `storage_url IS NULL`.**
  Not investigated here — a null may legitimately mean "indexed but not retrieved" — but it is
  recorded so the next person does not re-measure it, and it is 47% of the table.
- **Saturday hours stay unpublished.** `/contact` says "by appointment", which schema.org cannot
  express; stating times would send someone to a closed office.

---

## 6. G — Google Business Profile

**The listing already exists and appears already claimed** — no "Claim this business" link when signed
out. At the exact office coordinates, **4.2 ★**, category *Land surveying office*, correct phone and
website. So this was never a claim-and-verify job with a postcard delay; it is **get access and fill it
in**. Check ownership at business.google.com; Google offers "Request access" with a masked owner hint
if it is not yours.

**Owner has paused this deliberately** (2026-08-26): *"We will get more photos and enter the
descriptions. We are working on getting reviews slowly."* Not neglect — real-world effort on their
schedule.

### G1 — Address ☐ submitted, pending

Listing reads `3779 FM436`; correct is **`3779 W FM 436`** — missing the W and the space. An edit was
submitted 2026-08-26. Google reviews address changes (minutes to days). **If unchanged after ~48h, the
edit was rejected or never saved.**

### G2 — Reviews ☐ the single largest local ranking factor

4.2 with very few. Ask at delivery, when the customer is happiest — handing over the plat, not a week
later by email. Send the direct link by text. Reply to every review, including unflattering ones. Never
incentivise; Google removes those and can penalise the listing. **Aim ten to fifteen, steadily** — a
burst in one day looks bought.

### G3 — Photos ☐

One good crew shot exists; it needs about ten. Total station and GPS rig in the field · crew in hi-vis
mid-job · trucks with signage · office exterior and sign · a finished plat with client details redacted
· head-and-shoulders of Hank (the owner photo lifts trust more than any other single image).

### G4 — Description and services ☐ paste-ready

The ~690-character description, the 12 services, and the ≤20-county service-area shortlist are in the
published checklist: <https://claude.ai/code/artifact/ed859cbb-ab0d-448e-b232-ed0262baa68c>

**Hours are already correct at 9:00 AM on Google** — it was the website that was wrong.

---

## 7. Instrument failures this session — read before trusting a negative result

Three separate times, a confident "this is not wired" was **the tool, not the code**.

**`rg --include=*.ts` IS NOT A VALID FLAG.** ripgrep uses `-g`/`--glob`. Combined with `2>/dev/null`,
every such search errored, printed nothing, and read exactly like "no matches". On that basis the CAD
adapters, the county router and `GenericCADAdapter` were all nearly reported as dead code. **All three
are wired** — `runCountyResearch` at `worker/src/index.ts:17`, `GenericCADAdapter` in
`services/property-discovery.ts:31`.

**`vercel env pull` returns `""` for Sensitive variables.** A blank is not an empty value.

**A domain can hide the host.** The worker was probed at the raw IP from `.env.local` while production
uses `https://worker.starr-surveying.com`. It resolved to the same box — but it need not have, and the
conclusion would have been wrong for the right-looking reason.

> The rule this session earns: **when a search returns nothing, run the same search for something you
> KNOW exists before believing it.** See [[feedback_your_probe_can_be_the_bug]].

---

## 8. I — Browserbase and Tavily: measured, then planned

Opened 2026-08-27 at the owner's request: *"make sure we can use BrowserBase and Tavily… explore all
of the ways these things could be integrated."* Measured first, because both turned out to be in
states nobody would have guessed.

### I0a — Re-run this audit in one command ✅ SHIPPED 2026-08-27 · **hardened 2026-08-29 after re-running it**

> **Re-ran it, got a full sheet of `EMPTY`, and nearly filed that as a finding. It was my shell.**
>
> The script reads `process.env` and loads no `.env` file, so a bare local run prints `EMPTY` for
> all eighteen services in output **visually identical to a production run finding eighteen genuinely
> unset credentials.** The 08-27 run this section quotes plainly had real keys — it found Anthropic
> valid, Resend scope-limited and Browserbase billing with zero sessions. Nothing in either output
> said which environment it read.
>
> Same trap as the one already recorded here, from the other side: `vercel env pull` blanks
> encrypted values, so a blank proves nothing. Same script, opposite cause.
>
> The run now declares itself — with almost nothing present it says so, states that `EMPTY` means
> "not on this machine" rather than "not configured", and gives the command that actually audits
> production:
>
> ```bash
> doppler run --config prd -- npm run audit:vendors
> ```
>
> **⚠ So §S2b's "17 of 18 are empty" is worth re-confirming that way.** It was true on 08-27 and the
> owner has set keys since; the number in a heading is the thing most likely to be trusted without
> re-running it.
>
> #### And the control for that fix found a second bug
>
> Re-running with four deliberately fake keys — only to prove the banner disappears when credentials
> exist — printed:
>
> ```
> OK      Resend          HTTP 400
> ```
>
> The Resend check returned `OK` for **any** status that was not 401, and a malformed key gets a
> 400. A key invented thirty seconds earlier reported as working. The tool whose entire purpose is to
> distrust the config was trusting a value it had just been told was wrong — while its own footer
> instructs the reader to interpret the status rather than the marker.
>
> Only `200`/`404` count as proof now: the id requested is all zeroes and does not exist, so a 404
> means *authenticated, and that email is not here*. `401`/`403` are rejections, and anything else
> reports "cannot tell" rather than being rounded up to good news.
>
> **The other eight checks were already correct** — they branch on `r.ok`, so a 400 reads as
> rejected. Resend was the only one that inverted the logic. Worth recording as plainly as the bug:
> this was one loose check, not a house style. The sibling `worker/scripts/check-adapter-hosts.mjs`
> reads no environment at all, so it cannot have the ambiguity either.

```bash
doppler run --project starr-surveying --config prd -- npm run audit:vendors
```

`scripts/check-vendor-credentials.mjs`. Sibling of `worker/scripts/check-adapter-hosts.mjs` — that one
asks whether a hostname exists, this one asks whether a credential works. Both exist because the
answer was assumed for months and was wrong.

**Run it before switching a provider on, when auditing spend, and after any rotation.** Every endpoint
is free and read-only; nothing sends an email, solves a captcha, starts a browser session or bills a
request.

The states it distinguishes are the whole point — a pass/fail checker would collapse four of these
into "fail" and be wrong about three:

| | Meaning |
|---|---|
| `OK` | works |
| `OK*` | valid but **scope-limited** — healthy, not a fault (Resend's send-only key) |
| `UNUSED` | valid credentials, **zero usage** — money leaving for nothing (Browserbase) |
| `REJECT` | the account refuses the key (CapSolver) |
| `OFF` | deliberately disabled (Stripe, behind `PAYMENTS_LIVE`) |
| `EMPTY` | no value configured |

### I0b — Every third-party key, actually called ✅ MEASURED 2026-08-27

Read-only account endpoints, no writes, nothing billable. Three of the first three were broken, so
the rest were worth checking too.

| Service | Result |
|---|---|
| **Anthropic** | ✅ valid — HTTP 200. The most-used key in the repo (67 files) and it works |
| **Resend** | ✅ valid, **restricted to send-only** — correct practice, see the note below |
| **Browserbase** | ⚠ valid, **zero sessions ever**, billing since 2026-04-23 |
| **CapSolver** | ❌ **rejected** — `ERROR_KEY_DENIED_ACCESS`, identity refused |
| **Tavily** | ❌ no key in `prd`, `dev` or `stg` |
| **ElevenLabs** | — no key in Doppler at all (one of the 14 Vercel-only vars in S4) |
| **Mapbox** | — no key in Doppler at all (same) |

> ### ⚠ I nearly reported that email was broken
>
> Resend returned **401** on `/domains`, and a status-code-only check called that a dead key. The
> body said otherwise:
>
> ```json
> {"statusCode":401,"message":"This API key is restricted to only send emails","name":"restricted_api_key"}
> ```
>
> **The key authenticated and was refused for SCOPE.** A send-only key is exactly what a production
> mailer should hold. Reporting "your email provider is dead" would have sent somebody chasing a
> non-existent outage — while the real broken key (CapSolver, `ERROR_KEY_DENIED_ACCESS`, an identity
> refusal) sat two rows below it.
>
> **Two 401s, opposite meanings, and only the body distinguishes them.** Fourth time this session
> that the probe rather than the system was the fault. See [[feedback_your_probe_can_be_the_bug]].

**ElevenLabs and Mapbox being absent from Doppler is a finding, not a gap in the check.** They are
among the 14 Vercel-only variables in S4 — which means they are also the two easiest to retire: if
nothing has put them in the source of truth in four months, the case for keeping them is weak.

### I0 — What is actually true today ✅ MEASURED 2026-08-27

| | Finding |
|---|---|
| **Browserbase key** | **Valid.** Their API returns the project — "Production project", created **2026-04-23** |
| **Browserbase sessions ever run** | **ZERO.** Queried from their own API |
| `BROWSER_BACKEND` | `local` — switch one, off |
| `BROWSERBASE_ENABLED_ADAPTERS` | empty — switch two, off |
| **`TAVILY_API_KEY`** | **EMPTY in `prd`, `dev` and `stg`.** Never configured anywhere |

**Four months of paying for Browserbase, zero sessions.** Nothing errored, because nothing was
wrong: valid credentials the config forbade the code from touching. The only symptom of that fault
class is an invoice.

**And Tavily has never had a key at all** — so "Method 9" in `boundary-fetch.service.ts` has always
fallen through to `tryCountyCadPatterns()`, and the open-web layer built tonight (R1) reports
`not-configured` and does nothing.

### I1 — Both states now announce themselves ✅ SHIPPED 2026-08-27

`configWarnings()` gained the inverse of everything else it checks. Every other warning is a missing
key; these two are the opposite — **present, valid, billing, unreachable**:

- Browserbase credentials set while `BROWSER_BACKEND` is not `browserbase` → *"set and billing, but
  no session can ever start"*
- `BROWSER_BACKEND=browserbase` with empty `BROWSERBASE_ENABLED_ADAPTERS` → routes nothing. **It
  takes two switches, and fixing only the obvious one looks fixed while changing nothing.**
- `TAVILY_API_KEY` absent → *"open-web research is inert; runs see county sources only"*

Silent when Browserbase credentials are absent entirely — not owning it is a valid state, and
warning about it would train people to ignore the list. 5 new tests; 24 in the file.

### I2 — Turn Tavily on ✅ **DONE — but it took TWO keys, not one**

> **Closed 2026-08-29.** The owner set `TAVILY_API_KEY` in Doppler `prd` on 08-28 and the website
> half went live. The worker half did not, and the reason is worth keeping: **the worker is a
> different process on a different machine with its own `.env`.** It booted healthy and announced
> `TAVILY_API_KEY missing — open-web research is inert`, which reads as an owner who forgot a key.
>
> It was a defect in the setup procedure. `TAVILY_API_KEY` appeared nowhere in `worker/.env.example`
> and nowhere in the runbook, and the runbook builds a real `.env` by FILTERING that file — so the
> key could not be set by anyone following the documented steps. Fixed as a class:
> `env-example-documents-every-key.test.ts` now fails when code reads a name the example omits.
>
> ### ⚠⚠ AND THE WHOLE WORKER HALF OF THAT STORY WAS WRONG — corrected 2026-08-29
>
> **The worker does not read `TAVILY_API_KEY`.** Every consumer of `lib/research/open-web.ts` is an
> APP module — the four watches, lead enrichment, and the CAD-URL guess in
> `boundary-fetch.service.ts`. `grep -rn TAVILY worker/src` returns only the health warning itself,
> against a control showing the worker genuinely reads `ANTHROPIC_API_KEY` in four adapters. The deep
> pipeline has zero open-web references.
>
> So the worker's health check was reading its OWN environment to report on a DIFFERENT process's
> configuration, which it cannot observe. I read that warning, had the owner set the key on the
> worker, added a prompt for it to the runbook, and then reported the warning clearing as progress.
> It proved only that a string had been written to a file.
>
> The half above that stands: `TAVILY_API_KEY` was genuinely absent from `worker/.env.example`, and
> the runbook genuinely could not set it. Both true, and both about a key that should never have
> been there. **A correct fix to a false premise is still a false premise** — which is why
> `env-example-documents-every-key.test.ts` had a test pinning that "regression", and why it is now
> inverted.
>
> Warning, example entry, runbook prompt and verification-list line all removed. Tavily is set in
> Doppler for the app, which was done on 08-28 and was always the only thing required.

Sign up at tavily.com, take the free tier (1,000 searches/month), set `TAVILY_API_KEY` in **Doppler
`prd`**. That single variable activates the whole open-web layer shipped in R1: five search angles
per property — owner encumbrances, permits and planning, news and disputes, plat history,
environmental and utility — deduped, authority-ranked, and written into the run as an analyzable
document the AI reasons over.

**Cost check before spending:** at five angles per run, 1,000 searches is ~200 property researches a
month. Free tier is very likely sufficient; measure before upgrading.

### I3 — Where else Tavily earns its keep ✅ **ALL FIVE SHIPPED — item 2 closed 2026-08-29**

Explored per the owner's ask. Ordered by value, and honest about which are speculative:

1. **Lead enrichment** *(business — strong)*. ✅ **BUILT AND WIRED 2026-08-27.**

   `lib/leads/enrichment.ts` + `GET /api/admin/leads/[id]/enrichment` + a **Background** card on the
   lead detail page. Whoever rings a lead back can now see, before the call, whether they are talking
   to a builder with a live permit or a homeowner in a fence dispute.

   None of the searching was rewritten — `lib/research/open-web.ts` already ran the five angles,
   weighted domains by provenance and deduped across angles. What is new is the reading layer: ranked
   pages become a handful of signals (`commercial-operator`, `active-permit`, `subdivision-activity`,
   `dispute-context`, `encumbrance-context`), each with a confidence drawn from **provenance rather
   than volume** — ten content-farm pages about a name are not better evidence than one county agenda,
   they are usually the same syndicated page.

   **Four decisions worth not re-deriving:**

   - **It runs on a click, not on intake.** Enriching every submission would spend a search on the
     spam and put a third-party API on the critical path of saving a customer's quote request. Somebody
     opening a lead is the signal the lookup is worth doing.
   - **Company before personal name.** `ownerName` drives the encumbrance angle, and a lead's name is
     the person *asking*, usually but not always the owner. A company is the better search on both
     counts — it has a public record, and looking up a business is ordinary commercial diligence in a
     way that looking up a private individual by name is not. The personal name is used only when it
     is the sole identifier.
   - **No signal without a citation.** `LeadSignal.sources` is never empty; a lead-stated company
     cites *"Stated on the enquiry"* explicitly, so nobody mistakes it for an external finding.
   - **It never touches `ai-draft.ts`,** and a test asserts the import is absent. Per this section's
     own closing line: search results are unverified by construction, and this firm's product is a
     licensed professional's assurance.

   **It works today with no `TAVILY_API_KEY`** — and says so, which is the point. `status` separates
   `not-configured` / `insufficient-lead` / `search-failed` / `searched`, because an empty findings
   list means four different things and only one of them is *"we looked, and this is an ordinary
   enquiry"*. The card branches on status, never on `signals.length`; a blank must never read as a
   clean record. **This is the same defect as the address autocomplete in §M5, one floor up**, and the
   briefing's first line differs in all four cases — asserted directly, with `headers.size === 4`.

   So setting the key (START HERE #1) now lights up **both** the research pipeline and this. 27 tests,
   `tsc` and `next lint` clean.
2. **Competitor and market watch** *(business — moderate)*. ✅ **BUILT AND WIRED 2026-08-29.**

   `lib/leads/market-watch.ts` — the fourth profile over `announcement-watch`. Route
   `/api/admin/marketing/market-watch`, panel mounted in the Marketing portal's Leads tab.

   **The item as filed undersold it.** "Which surveyors are named in planning agendas" is the second
   subject. The first is the useful one: a subdivision plat on a commissioners' court agenda, a
   rezoning up for approval, a site plan filed with a city — each is a project that needs a surveyor
   **before it needs almost anything else**, and each is published days or weeks ahead on a public
   agenda. That is a lead source, not competitive curiosity.

   **The geography is derived, not copied.** `SERVICE_AREA_COUNTIES` in `lib/seo/business.ts` is the
   one list of where this firm works — the same array `/service-area` renders and the LocalBusiness
   JSON-LD publishes. The eleven core counties here are names FILTERED against it, so the two cannot
   disagree. A second copy is the defect this repo has hit repeatedly.

   > That filter DROPS what it cannot match, so a typo would produce a smaller watch rather than an
   > error — silently. A test pins the count at eleven for exactly that reason.

   **And it says how much it does not cover.** Eleven of forty-six service-area counties; all
   forty-six would be ninety-two searches a sweep to answer a question about places the firm rarely
   bids. `coverageNote()` ships with every response and renders above the results, because a bounded
   sweep that does not admit it is bounded reads as "nothing is being platted" when it means "we
   looked at a quarter of it".

   **Still true about M4:** this feeds it, and M4 remains correctly gated on Search Console data.
   Agenda hits tell you which counties have activity; they do not tell you what people search for.
3. **County portal change detection** *(research — strong)*. ✅ **BUILT AND WIRED 2026-08-27.**

   `lib/research/portal-watch.ts` + `GET /api/admin/research/portal-watch` + a **Portal migration
   watch** panel on `/admin/research` → Self-heal, directly above the review queue.

   The sweep next door probes an adapter and tells you it **broke** — lagging by construction. This
   asks the same question earlier: four searches per county (the clerk's own page, an effective-date
   announcement, the commissioners' court agenda where the contract is approved months ahead, and —
   when the incumbent vendor is known — a search for a switch *away* from it).

   **The only hard problem here was false positives, and that is where the whole module lives.**
   Searching *"<county> clerk records portal new system"* always returns something: the vendors sell
   exactly this product so their marketing matches perfectly, every county has a generic records-search
   page, and a 2019 announcement reads identically to last week's. A watcher that flags all of those
   gets muted within a fortnight — which leaves us **worse off than having no watcher**, because now
   there is an alert everyone has learned to skip.

   So four rules, every one of them a way of saying no: the county must be **named**; **migration**
   vocabulary must appear, not merely records-portal vocabulary (*"search records online"* is what a
   portal says every day of its life); a **vendor's own domain is evidence of marketing**, demoted and
   never promoted; and a **date must be present**, with old ones demoted. `likely` requires all four
   plus an official source. Everything else is `possible` or `noise`, and **nothing here ever
   concludes that a migration is happening** — the output is a ranked "worth ten minutes" list with
   the triggering sentence quoted, because the judgement is a person's.

   Verified by mutation rather than by the tests passing: gutting the vendor list, removing the stale
   demotion, and dropping the date requirement each break tests (2, 1 and 3 respectively). Every rule
   is load-bearing.

   **Noise is counted and displayed**, not hidden — a panel showing only its hits is indistinguishable
   from a panel whose search is broken, and *"nothing announced"* is only reassuring if you can see
   that something was checked. `status` separates `not-configured` / `search-failed` / `searched`
   for the same reason it does in §I3.1.

   **On demand, one county at a time — deliberately not a cron.** Four searches × 254 counties is a
   bill nobody approved, on a free tier, for a question that changes on the timescale of months. If it
   is ever scheduled, the right trigger is not the calendar but **the sweep flagging an adapter
   `degraded`**, at which point the watch has both a reason to run and a specific county to run against.

   One refactor came with it: the Tavily request was extracted from `searchOpenWeb` into an exported
   `tavilySearch` primitive that both callers share. A second copy would have grown its own relevance
   floor, its own content trim and its own notion of failure, and drifted inside a month — a test
   asserts `api.tavily.com` appears exactly once in the codebase. Behaviour-preserving: the full
   research + leads suite (1,038 tests) passes unchanged.

   29 tests, `tsc` and `next lint` clean.
4. **Learning content freshness** *(educational — moderate)*. ✅ **BUILT AND WIRED 2026-08-29.**

   `lib/learn/content-freshness-watch.ts` — the third profile over `announcement-watch`, watching
   four subjects: the NCEES FS Reference Handbook, Occupations Code 1071, 22 TAC Ch. 138, and the
   recording/platting statutes. Route `/api/admin/learn/content-freshness`; panel mounted in the
   Knowledge portal's References tab, beside the library of what we hold.

   **The risk this item names is enforced structurally, not by discipline.** The route has no
   `POST`, `PUT`, `PATCH` or `DELETE`, and a test asserts their absence. Exam content cannot be
   auto-edited from a search result because no code path exists that could. The output is a review
   queue with the triggering sentence quoted and the source linked; a person opens the document.

   **The subjects were COUNTED, not guessed** — grepped from what the material actually cites:
   22 TAC Ch. 138 appears 78 times, Occupations Code 1071 forty-six, the NCEES FS Reference Handbook
   thirty-two, Property Code 12/13 about twenty.

   > **⚠ That count immediately caught a defect in item 5, shipped two days earlier.** The regulatory
   > watch was tracking **22 TAC Chapter 663** — whose surveying standards HB 1523 (86th Leg.)
   > **repealed and merged into Chapter 138**, effective 2021. 663 is now the engineering chapter. For
   > a land surveying firm the watch was pointed at the one chapter that can no longer change the
   > rules it works under, and would have reported "nothing found" with complete confidence forever.
   >
   > The sentence explaining the repeal is in this repo's own course material. A subject list derived
   > from real citations found a defect that a subject list written from memory had shipped. Fixed in
   > the same commit; 663 stays in the terms because a notice about the merge names both.

   **The orphan guard caught its own author.** `npm run verify:orphans` went 61 → 62 the moment the
   library landed with no caller — four days after that guard was built, for exactly this defect.
   Wired properly rather than by raising the ceiling.
5. **Regulatory watch** *(business — moderate)*. ✅ **BUILT AND WIRED 2026-08-27.**

   `lib/compliance/regulatory-watch.ts` + `GET /api/admin/compliance/regulatory-watch` + a **"Has a
   rule changed?"** panel at the foot of the compliance tab (`/admin/jobs?tab=compliance`).

   Three topics, each with its reason written into the UI: **TBPELS rules** (seal requirements, CE
   hours, what a survey must show), **FEMA flood maps** (a revised panel changes the zone an
   elevation certificate reports for the same parcel), and **county recording fees** (filing fees
   appear on quotes; an increase nobody noticed comes out of the job, not the client).

   **The register next door answers "are we current". It cannot answer "has the thing we are current
   WITH moved"** — and none of those three send an email. They are published, and then they are in
   force.

   **This is the second consumer `announcement-watch.ts` was extracted for**, which settles the note
   in that file's header about a generic layer over a single caller being debt. A test asserts
   neither watch re-implements the classifier and neither builds its own Tavily request.

   **What is genuinely different is one number.** Portal migrations go stale in two years because the
   portal has already moved; a rule adopted in 2021 is still the rule, so `staleAfterYears` is 12 for
   TBPELS and a demotion for age would throw away the answer. Pinned by a test.

   **The false positive here is the CE industry.** Continuing-education providers sell courses *about*
   rule changes, so their pages name the board, use every change word, and announce nothing — the
   single most common hit for any query in this area. Demoted by host, never promoted. Board pages
   merely *describing* the rules that exist are rejected too: "rules", "requirements", "licensing" is
   what a board page says every day of its life.

   Not trusted because 21 tests passed first run — mutation-checked. Removing the CE hosts, making
   rules expire like portals, and dropping the alternate subject names each break tests.

   **Read-only and admin-gated from the start.** `GET /api/admin/compliance` once answered any
   signed-in account with the whole register of licences and insurance; a sibling that read more
   loosely would be a hole beside a door somebody already shut. And nothing here writes to the
   register — a search result must not change what the firm believes about its own licence.

**Not recommended:** using it to answer customer-facing questions directly. Search results are
unverified by construction, and this firm's product is a licensed professional's assurance.

### I4 — Turn Browserbase on, deliberately ☐ **the worker now exists — this is a pure decision as of 2026-08-29**

You are paying for it, so the question is no longer whether to cancel but **which adapters should use
it**. The per-adapter gate exists precisely so this is a decision rather than a global switch.

The honest sequencing, once netcup is up:

1. Run research on the new box with `BROWSER_BACKEND=local`. **The netcup IP is brand new and has no
   reputation** — it may work everywhere, or be blocked immediately. Nobody can know before it runs.
2. When a specific portal blocks the datacentre IP, add **that adapter's id** to
   `BROWSERBASE_ENABLED_ADAPTERS` and set `BROWSER_BACKEND=browserbase`.
3. Never make it the global default. It bills per session, and most portals will not need it.

**Do not enable it speculatively before the worker exists.** With no worker there is nothing to route,
and turning both switches on now would only convert "paying for zero sessions" into "paying for zero
sessions with the warnings silenced".

### I5 — Browserbase beyond scraping ☐ scoped, not built

1. **Design-walk screenshots at real viewports** *(platform — moderate)*. The design tooling drives a
   local browser today; hosted browsers would give consistent rendering across machines.
2. **Customer-facing portal capture** *(business — weak)*. Rendering a county portal page as evidence
   in a report. Local Chromium does this fine — no reason to pay unless the portal blocks us.
3. **Explicitly rejected: using it as "internet access for the AI".** It is a place to run a browser.
   It finds nothing and reads nothing. That is Tavily's job, and conflating them is what made
   Browserbase look like the important one.

---

## 8b. The full suite, run properly at last — and what it caught

**I merged to `main` twice tonight without running the full root suite.** Scoped runs and
`npm run build` were green, so nothing looked wrong. The full suite says otherwise, and the lesson is
already written down in this repo: *"module-singleton pollution only fails in the whole-suite run"* —
and so do ratchets.

`26,378 tests, 2 failing.` Both **pre-existing on `main`**, verified by checking out `main` and
running them there. Neither was introduced by this branch.

### The `starr-assumptions` ratchet — 176, ceiling 160

Named `lib/seo/business.ts` (6×) and `lib/seo/page-metadata.ts` (8×) among the worst offenders. Those
are mine, from tonight.

**Investigated before touching the ceiling, per [[feedback_ratchet_tests_before_re_baselining]] — and
it was a misclassification, not debt.** The `tenant` bucket is a **fallthrough**: any path matching
nothing in `CORRECT_FOREVER` is counted as tenant debt, so *every new own-website file joins the
backlog by default*. That is now the **third** time this exact fault has produced a red ratchet — the
first two were `app/privacy` and `app/components/GoogleAdsScript` on 2026-08-12.

`lib/seo/business.ts` is the firm's own identity consolidated into one file, precisely because it was
being spelled differently in four places. **That is the opposite of tenant debt** — you cannot
parameterise a value that is hand-written in four files, so consolidating it is the prerequisite for
ever making it per-tenant. Added to `CORRECT_FOREVER` beside `app/about`, `app/contact` and
`app/privacy`, which won the same argument.

**Result: 176 → 162. The ceiling was not raised and no debt was paid down; a measurement was
corrected.**

### ⚠ CORRECTION — the remaining 162 WAS mine, and the ratchet is now green at 160

I wrote above that the two-over "predates this session entirely", on the grounds that `760bd418e`
already read 162. **`760bd418e` is my own commit** — *"fix(seo): three spellings of one domain, and a
robots.txt that was a 404 page"* — and `git log --diff-filter=A` confirms it is the commit that
**created `app/robots.ts`**. Those two references were mine from the start.

So the true story is simpler and entirely self-inflicted: **all 16 excess references were own-site
files falling into the `tenant` fallthrough**, in two stages.

| | Count | Cause |
|---|---|---|
| before any of this work | 160 | green |
| `760bd418e` | 162 | `app/robots.ts` created |
| tonight's SEO merge | 176 | `lib/seo/business.ts`, `page-metadata.ts`, `StructuredData.tsx` |
| after reclassification | **160** | **green** |

`app/robots.ts` is `app/sitemap.ts`'s twin — both emit crawler directives for starr-surveying.com and
both name the host, because a robots.txt that does not state its own domain is useless. `sitemap.ts`
has been in `CORRECT_FOREVER` since the list was written; `robots.ts` simply did not exist yet.

**Four misclassifications, one root cause, and the fourth occurrence of it.** The ceiling was never
raised and no debt was paid down. Full root suite: **26,348 passing, zero failures.**

> The lesson is not "I made a mistake in the audit". It is that **a fallthrough default silently
> converts every new own-website file into debt**, and the correction has now been made three separate
> times by three separate people-shaped efforts. The classifier should probably ask rather than
> assume — a file matching `app/*.ts` at the repo's own public root is far more likely to be own-site
> than tenant surface. Left as an observation; changing the default is a bigger decision than tonight.

### `composition-serving` — pre-existing, diagnosed, ✅ FIXED 2026-08-27

The assertion was `/\} catch \(err\) \{[\s\S]{0,240}return null;\s*\}/` — a **character distance**
standing in for a behaviour. Measured: the gap is **244 characters against a 240 budget**.

**The code is entirely correct.** The catch logs and returns null, and the `console.error` count is
exactly 2 as the same test asserts. Somebody added a line of explanation inside the catch block, and
a comment growing four characters turned the test red.

Raising 240 to 300 was the quick fix and would have left the same trap armed one comment further out.
The property worth protecting is not proximity — it is that the catch **swallows and returns rather
than rethrowing**. The test now extracts the catch body and asserts exactly that, so the prose inside
it can grow to any length. 17 tests green.

**Both of the suite's two failures are now understood**: this one was the instrument, and the
`starr-assumptions` breach is genuine pre-existing tenant debt, two references over, deliberately
left visible.

---

## 9. F — Future work, tracked so it is not rediscovered

Everything named this session that is real, not yet done, and not on the critical path.

### F1 — Google ☐

- **Four Ads conversion actions** and the CSV upload path — see §M1. Needs no developer token.
- **Search Console**: resubmit the sitemap, request indexing on the five retitled pages, read
  Performance → Queries — §M2.
- **Business Profile**: address correction pending Google's review, plus photos, description,
  services, reviews — §G. Owner-paused deliberately.
- **`sameAs` URLs** for the structured data — §M3.
- **Google Ads API Basic access**: developer token still Test. Only blocks the *automatic* upload
  path; the CSV route works today.
- **Places API on the Maps key**: admin address autocomplete may be silently failing — §M5. Do not
  widen the key's API restriction unless the symptom is real.

### F2 — Facebook / Meta ☐ NOTHING EXISTS TODAY

Named by the owner 2026-08-27. Stated plainly so nobody assumes otherwise: **there is no Meta
integration of any kind** — no pixel, no conversions API, no page, no catalogue. `platform` in
`ad_spend_daily` is deliberately not a CHECK constraint precisely so Facebook spend can land in that
table the day anyone runs an ad, without a migration.

If it is ever wanted, the order that avoids wasted work:

1. **A Facebook Page first.** It is also a `sameAs` entry (§M3) and a local-SEO signal, and it costs
   nothing. Do this regardless of whether ads follow.
2. **Meta Pixel** on the site — same shape as the existing `gtag` component, and it must go behind
   the same production-hostname gate, or preview deploys pollute the ad account exactly as they
   nearly did with Google.
3. **Conversions API** only if ads actually run. The lead-to-cash spine built for Google
   (`lead_lifecycle_events`) is platform-agnostic; a Meta sink would sit beside the Ads one.
4. **Do not build 2 or 3 before 1.** A pixel with no page and no campaign collects data nobody reads
   — the exact shape of the Browserbase finding above.

### F2b — Stripe / taking payments ☐ OFF BY DESIGN, not broken

Checked 2026-08-27 while auditing keys, and it needed care not to be misreported.

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` **exist as names in Doppler `prd` with empty values**
— length 0, against Anthropic's 108 and Supabase's 219. In isolation that reads as a broken payment
integration on a business that invoices customers.

**It is not.** `PAYMENTS_LIVE` does not exist at all, and `lib/payments/live.ts` gates on
`env.PAYMENTS_LIVE === 'true'`. Payments are **switched off deliberately**, and empty Stripe
credentials are exactly the consistent state for that. The `/pay` portal, the composer and the
`customer_invoices` work are all built and waiting behind the gate.

**To take payments, three things together — and none alone is sufficient:**

1. Real `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Doppler `prd` (live keys, not test).
2. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to match — same account, same mode. A live secret with a test
   publishable key fails at the browser, after the customer has decided to pay.
3. `PAYMENTS_LIVE=true`.

Setting 1 and 2 without 3 changes nothing; setting 3 without 1 and 2 breaks the portal for real
customers. That is presumably why the gate exists.

> Sixth near-miss of the session. "Empty credentials for the payment processor" is a sentence that
> would have had somebody out of bed, and the difference between *broken* and *deliberately off* was
> one variable that is absent rather than present. **Absence carried the meaning.**

### F3a — ⚠ PAYMENT IN ADVANCE is the blocker, not the order review (2026-08-27)

Order accepted; account created. **Customer number 417617**, invoice `nc-5513706`, **€40.27**, due
**10 Sep 2026**. netcup states plainly: *"the payment must be made in advance."*

**So no server exists yet.** The provisioning email carrying the IP and Server Control Panel
credentials arrives only after payment clears. Everything in §2 (W2–W5) waits on this one step.

- **Pay by card or PayPal, not bank transfer.** A US wire to a German IBAN takes 2–5 business days
  and carries fees at both ends; card clears in minutes. The PayPal option sits beside the open
  invoice in the CCP.
- **VAT exemption held.** €39.77 + €0.50 = €40.27 exactly — the net figure. "Including VAT" in the
  email is boilerplate.
- **No SEPA mandate is set up**, so nothing renews by direct debit. Safer than the DigitalOcean card
  that vanished — but a missed monthly invoice suspends the box, which is *precisely* how the last
  worker died. Put the due date somewhere it will be seen, or set up the mandate deliberately.
- **Two panels, two logins.** CCP (`customercontrolpanel.de`) is billing, and its credentials arrived
  now. **SCP** (`servercontrolpanel.de`) is the server itself — power, reinstall, rescue, VNC — and
  its credentials come separately with provisioning.

**Security note recorded because it will matter later:** the CCP password arrived by plaintext email
and was pasted into a chat transcript. It should be rotated and 2FA enabled before that panel holds a
running server. netcup documents 2FA in the same welcome mail.

### F3b — netcup DPA ✅ EXECUTED 2026-08-27 03:04

`DSGVO-417617-20260827-87113.pdf`. Declarations as mapped below — customers plus property owners and
parties named in public land records; name, contact/address, location, customer contract, **photo/
video/audio** and criminal-law-relevant data; no Art. 9 special categories.

**Two follow-ups, neither blocking:**

1. **Download and archive the PDF.** It is a signed legal agreement and the CCP is not a records
   archive — if the account ever lapses, access to it lapses too. Store it with the insurance
   certificate and the RPLS licence.
2. **The Client is named "Starr Surveying", which is the TRADE NAME.** The legal entity is
   *Starr Technical Services Inc.* (as `/privacy` states, and as `lib/seo/business.ts` publishes in
   `legalName`). A contract naming a trade name is generally enforceable where the entity is
   identifiable, and the address is correct — so nothing is broken. But the legal entity is the
   cleaner counterparty for an agreement anyone might one day need to rely on. Set in
   **CCP → Master Data → company name**; it would flow into any regenerated contract.

*(Original guidance retained below — it is the record of what was declared and why.)*

### F3b-guidance — how the form was filled

The CCP prompts for a Data Processing Agreement (GDPR Art. 28(3)) at login and offers to defer for 14
days. **Conclude it.** Declining is not a neutral skip — netcup records that you do not process
personal data, and that would be false: the worker handles property **owner names**, addresses and
deed records naming individuals, and the open-web layer (R1) searches on owner names specifically.

**Scope it to the worker, not the whole platform.** netcup hosts only the research worker. Supabase
holds the database and Vercel serves the app; each is a separate processor with its own agreement.
Describing the entire system here overstates what netcup is responsible for.

| Field | What applies |
|---|---|
| Categories of data | Owner names and mailing addresses from public county records; property addresses and legal descriptions; names in deeds, plats and clerk records (grantors, grantees, adjoiners); client-supplied property details |
| Data subjects | Property owners, prior owners, parties named in public land records |
| Purpose | Automated retrieval and analysis of public land records for professional land surveying |
| Retention on netcup | **Transient only** — the worker's disk holds scratch; durable artifacts go to R2 and Supabase (see W1) |

**Caveat, stated because it should not be lost:** GDPR targets EU data subjects, and this is a Texas
firm serving Texas property owners, so its actual applicability is genuinely nuanced. netcup asks
because they are a German processor. None of that changes the action — the DPA is free and the
alternative is signing something untrue — but a real lawyer decides anything that turns on it. This
note exists so nobody declines by accident while clicking through a login prompt.

#### The form's checkboxes, mapped to what the worker demonstrably does

netcup's ANNEX 3 offers fixed categories and a free-text field. **The most important entries go in the
free text**, because their list has no box for the people this system actually handles.

**Data subjects** — ☑ Customers. Then, as additional data:
`Property owners and prior owners named in public land records` ·
`Parties named in deeds, plats and clerk records (grantors, grantees, adjoining owners)`

Leave unchecked: suppliers, website visitors (Vercel's), employees (Supabase's), external employees,
processors, newsletter subscribers. None of them reach netcup.

**Personal data** — ☑ Name data · ☑ Contact and address data · ☑ Location and geographic information ·
☑ **Photo, video, or audio data** · ☑ Customer contract data. Plus free text:
`Public land record documents (deeds, plats, liens, easements) naming individuals`

> **The photo box is the one that gets missed.** The worker captures portal screenshots, deed page
> images, aerial and satellite imagery and plat scans — 215 such documents already exist in
> `research_documents` for Bell County alone. Anyone reading "we process property records" would not
> think to tick it.

**"Data relevant to criminal law" — a real decision, not a default.** The open-web layer (R1) searches
owner names for *lien OR judgment OR lawsuit OR foreclosure OR probate*. Those are **civil** matters,
so strictly the answer is no. But a name-based web search can incidentally return criminal records,
and we do not control what the engine hands back. **Under-declaring is the costly error and
over-declaring costs nothing — lean towards checking it.**

**Art. 9 special categories: none.** Land records carry no racial origin, religion, genetic, biometric,
political, union, health or sexual-orientation data. That one is clean.

**Not legal advice** — a mapping of what the code does onto their form, so nobody under-declares while
clicking through at speed.

### F3c — CCP account state, 2026-08-27

**Done:** password rotated · **2FA activated** · **VAT rate confirmed 0%** (the business registration
held — €7.50/month) · address matches what the site publishes.

**⚠ The telephone number is malformed and should be corrected:**

```
+2543151123     ← parses as +254 → KENYA, then 3151123
+12543151123    ← correct: US country code +1, area code 254
```

254 is the Texas area code, not a country code, and the field explicitly asks for one. This is the
number netcup dials for account verification, fraud checks, or an incident on the server — as
written, it rings the wrong continent. **The same applies to both DPA contact numbers**, entered as
`2543151123` and `9366620077` with no `+1`.

A close cousin of the `www` bug that has bitten this project four times: a value that is correct as a
local string and wrong as a fully-qualified one.

**Company name is support-mediated.** The CCP shows "Starr Surveying" beside a *"How to change
ownership"* link rather than an editable field, so switching to the legal entity (*Starr Technical
Services Inc.*) means a support ticket. Low priority — but if it is ever done, ask netcup to
regenerate the DPA so the agreement names the entity rather than the trade name (see F3b).

### F3d — Paying netcup: the order matters, and SEPA is not an option

**SEPA direct debit is unusable for this business.** It requires an IBAN in the SEPA zone; a US bank
account has a routing and account number instead. The CCP offers the panel to everyone, so it looks
available and is not.

**And SEPA could not settle the first invoice regardless** — the CCP says so directly: *"Advance
payments must be settled manually"* and *"Invoices with advance payments already made cannot be
debited."* The first netcup invoice **is** an advance payment. Configuring any provider does not
settle it retroactively.

**So, in this order:**

1. **Pay `nc-5513706` directly** via the PayPal link beside the open invoice. A one-off payment
   against that specific invoice, no provider setup involved.
2. **Then** configure **Credit card** for future months — the only viable recurring option for a US
   account. Only one provider can be active at a time, so this is not hedgeable.
3. **Leave "Apply to existing invoices" unchecked** afterwards. Both panels warn *"make sure you have
   not yet initiated payment"*, and ticking it post-payment is how a double charge happens across a
   currency boundary.

*Card setup transmits the customer number and email to **Stripe**, netcup's processor — disclosed in
the panel, entirely normal, and mildly funny given Stripe sits dormant in this stack behind
`PAYMENTS_LIVE` (F2b).*

### F3 — netcup ☐

- **Order review** must clear → server IP + Server Control Panel credentials.
- **W2**: point `worker.starr-surveying.com` at the new IP. One A record.
- **W5**: the reboot test — `systemctl is-enabled docker`, reboot, then curl from your own machine.
- **Fill `worker/.env`** from Doppler `prd`, so `WORKER_API_KEY` matches by construction rather than
  by transcription.
- **Confirm the VAT 0% and business details** on the account (§2) — €7.50/month.
- **Cancel DigitalOcean** once the migration is proven; check for orphaned snapshots, volumes and
  reserved IPs, which bill independently of the destroyed droplet.
- **Watch the first month's invoice** against the €40.27 estimate; netcup bills in EUR and the card's
  FX fee is real.

### F4 — Bigger builds, deliberately not started ☐

- **R3 multi-tenancy.** Verified 2026-08-27: `org_id` appears nowhere in `lib/research`,
  `worker/src`, or the research API routes. Serving other firms is tenant scoping, per-firm quotas
  and billing attribution — software, not servers. **Do not size hardware for it yet.**
- **M4 county landing pages.** Largest unbuilt organic opportunity; choose the counties from real
  Search Console data rather than guessing across 46.
- **I3 items 1–5** above.

### F5 — 764 lines of orphaned pipeline ◐ the CLASS is now detected; this instance is still owner's call

`lib/research/prioritized-pipeline.ts` (378 lines) and `lib/research/prioritized-pipeline.service.ts`
(386 lines) — **two near-identical files, neither imported anywhere.** `runPrioritizedPipeline`,
`sortByPriority` and `recommendNextResources` all have zero callers outside their own definitions.

Verified with a control search first, because three "this is not wired" findings this session turned
out to be a broken ripgrep flag rather than broken code. `analyzeProject` returns callers from the
same query shape; these return only themselves.

The module describes something genuinely useful — analysing resources in order of expected
information richness, cross-validating each finding against the cumulative baseline, and detecting
conflicts early rather than after low-value sources have been paid for. The live path
(`analyzeProject`) does not work that way.

> ### ⚠ "NEAR-IDENTICAL" IS WRONG — measured 2026-08-29, and it changes the decision
>
> Nobody had diffed them. **They share ZERO exported names.**
>
> | `prioritized-pipeline.ts` (378 lines) | `prioritized-pipeline.service.ts` (386 lines) |
> |---|---|
> | `runPrioritizedPipeline`, `sortByPriority`, `recommendNextResources` | `executePrioritizedPipeline`, `classifyResourcePriority` |
> | `PipelineResult`, `PipelineStepResult` | `PrioritizedPipelineResult`, `PipelinePhaseResult`, `PrioritizedResource`, `ResourcePriority`, `ComparisonResult` |
> | imports `callAI` — makes its own model calls | imports `PipelineLogger` — structured run logging |
> | **5** priority steps: ArcGIS → deeds/plats → visual → tax/flood | **6** priority steps: ArcGIS → **tax** → plats → deeds → satellite → maps |
>
> Same *idea* — analyse resources richest-first, cross-validate each finding against the cumulative
> baseline. **Two independent implementations of it**, with different APIs, different type
> vocabularies, and **different answers to the question the feature exists to answer**: what order to
> read sources in. One puts tax records second; the other does not rank them until fourth.
>
> Both were committed on **2026-03-20**, in two separate commits, and neither has been touched since.
> Five months. Neither has a test of its own.
>
> **This kills option 3.** "Merge the two files first regardless" assumed a mechanical
> de-duplication. There is nothing to merge — no shared function to reconcile, no diff to resolve.
> It is a choice between two designs, and the substantive part of that choice is the ordering.
>
> **The fifth false premise checked this session, and the fifth to be false.** The pattern is now
> consistent enough to be a rule: a parked item's description records what somebody believed at the
> moment they parked it, and the cheapest possible first step is to measure the claim rather than
> act on it. See [[feedback_check_the_premise_before_building]].

**So the resolutions are two, not three, and it is still not mine to pick:**

1. **Wire it up** — if the prioritisation is what the pipeline should do, this is most of the work
   already written.
2. **Delete it** — if `analyzeProject` superseded it, 764 lines of plausible, well-commented dead
   code is worse than none, because the next person to read it cannot tell it never ran.
3. ~~**Merge the two files first regardless**~~ — **not available.** They share no exported name,
   so there is no de-duplication to perform. What looked like tidying is actually the whole decision
   in disguise: picking one design over another, and with it a resource ordering that determines
   what the pipeline reads first and therefore what it pays for.

**If it helps the choice:** `.service.ts` is the better-instrumented of the two (it has
`PipelineLogger`; the other logs nothing), and its ordering puts tax records second, which is the
cheapest authoritative source of owner and legal description in most Texas counties. That is an
argument, not a recommendation — neither has ever run.

Not touched tonight. Deleting working-looking code at 4am on the strength of a grep is exactly how a
real feature gets removed, and wiring an untested 764-line path into the analysis run is worse.
**◐ Partially addressed 2026-08-27 — the class of bug, not this instance.**

Not resolved: wiring or deleting these 764 lines is still the owner's call, and deleting
working-looking code on the strength of a grep is how a real feature disappears.

What did change is that **the shape is now detected**. `scripts/find-orphaned-modules.mjs`
(`npm run verify:orphans`, pinned by `__tests__/every-export-is-imported.test.ts`) finds every module
under `lib/`, `app/` and `components/` that exports something no product code imports — tests
excluded, because a module imported only by its own test is exactly the case worth catching.

**It found 62, across 3,080 modules.** Both halves of this pair are on the list. So is
`lib/hub/components/AddWidgetModal.tsx`, which I rebuilt on 2026-08-27 before discovering nothing
mounts it — an afternoon that would have cost ten seconds against this check. So is
`app/components/ContactForm.tsx`: 355 lines of a contact form, while `app/contact/page.tsx` renders
its own inline one. Given this session began with lead generation, that one is worth a look.

**It ratchets on the count, not on an allowlist.** Three of the 62 carry notes because I actually
investigated them; writing notes for the other 59 would be inventing them. The number may only go
down, and the check prints `scanned N modules; X% unreferenced` on every run so that a broken
scanner is visible rather than silent — 2% is plausible, 90% would mean the instrument is what
changed.

Verified by control: adding a deliberately unreferenced module makes it exit 1; removing it exits 0.


---

## 10. Owner-gated — nothing proceeds without these

1. **netcup order review** clears → server IP + SCP credentials
2. **DigitalOcean** balance settled, account closed
3. **Browserbase / Mailgun** cancelled (S2)
4. **Business Profile** access confirmed (G)
5. **`sameAs` URLs** supplied (M3)
6. **Voyage old key** revoked (S5)
7. **Captcha policy** — which counties we are willing to automate (R4)
