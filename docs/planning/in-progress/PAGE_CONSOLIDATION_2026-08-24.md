# One portal per job: consolidating 138 nav links into 29

**Status:** planning · written 2026-08-24 · no code written yet

> **How to run a slice.** Pick the top unchecked `- [ ]`. Ship it, verify it in a browser, tick it
> with what you actually did — including what you decided *not* to do and why.

---

## §0. What was asked for

> *"We need to really consolidate as many pages as we can… if we can consolidate all of the payment
> pages into a single payment portal, that would be great. The payment portal would look different
> depending on which role the user has… We need to have the same system for hour management too…
> the same for job management… equipment management… doing taxes… reviewing ads and conversions…
> There are just way too many links in all of the side navbar menu items… one portal for receipt
> management. This will handle adding receipts, reviewing receipts, and approving and denying
> receipts or specific items on receipts."*

Seven portals named explicitly: **payments, hours, jobs, equipment, tax, advertising, receipts.**
Plus the general instruction: go through everything and find the rest.

---

## §1. The measured picture

Not estimates. Counted from `lib/admin/route-registry.ts`, the 133 page dossiers derived on
2026-08-24, and every `page.tsx` under `app/admin`.

| | Count |
|---|---|
| `page.tsx` files under `app/admin` | **181** |
| Of those, dynamic detail routes (`/admin/jobs/[id]`) | 38 |
| Entries in the sidebar registry | **138** |
| Workspaces they are split across | 7 |
| Links in the biggest workspace (Office) | 33 |
| Links in the second biggest (Money) | 30 |
| Pages under 250 total lines including everything they import | **43** |
| Pages that ALREADY use tabs | **49** |
| Redirect stubs from a consolidation already done | 5 |

Two of those numbers are the whole argument.

**43 pages are under 250 lines.** A page that is one filtered table and a heading is not a page; it
is a tab that was given a URL. `/admin/receivables` is 160 lines. `/admin/payouts/search` is 201.
`/admin/pass-through` is 197. `/admin/billing/invoices`, `/admin/billing/plan-history` and
`/admin/billing/upgrade` are 200, 205 and 226 — three sidebar links for one subscription screen.

**49 pages already use tabs.** The pattern the owner is asking for is not a new idea in this
codebase. It is the majority idiom already; it has simply never been applied to the sidebar.

---

## §2. The pattern already exists, it shipped, and it was the same request

This matters more than anything else in this document, so it goes before the plan rather than inside
it: **do not invent a consolidation pattern. Extend the one that is already running in production.**

`/admin/marketing` absorbed three pages in a slice labelled A1. Its header says why:

> *"has tabs for the different advertising elements that we need to manage"* — an owner request,
> answered by moving four page bodies into `_tabs/` untouched and keeping `?tab=` in the URL.

And `app/admin/marketing/spend/page.tsx`, in full, is now:

```tsx
// /admin/marketing/spend — kept as a redirect, not deleted. A1.
//
// The page body moved into the tabbed shell at /admin/marketing (see `_tabs/`). This file stays so
// that every bookmark, every link in an old email, and every `// Spec:` reference to the old URL
// still lands in the right place instead of 404ing.
import { redirect } from 'next/navigation';
export default function Page(): never { redirect('/admin/marketing?tab=spend'); }
```

Four properties of that slice are worth copying exactly:

1. **The tab lives in the URL, not in component state.** A reload keeps you where you were, the back
   button steps between tabs, and — the one that actually matters — a tab is a link somebody can
   send. *"Look at the upload log"* should be a URL, not four instructions.
2. **The page bodies moved untouched.** Rewriting a page in the same slice that relocates it means
   any bug that appears afterwards has two possible causes. Move first; improve later, separately.
3. **The old routes still exist**, as one-line server redirects. No bookmark breaks, no email link
   404s, and the `middleware.ts` role gate on the old prefix still applies on the way through.
4. **It is already proven at this scale** — and `/admin/marketing` is 1,932 lines across four tabs,
   which is larger than most of the portals proposed below.

**One consequence for §0: advertising is already done.** `/admin/marketing` has `overview`, `spend`,
`conversions` and `uploads` tabs today. The only work left in that domain is folding `/admin/leads`
in, which is P6 below. The owner asked for something that already exists, which is worth saying
plainly rather than building twice.

**A second precedent, and a warning with it.** `/admin/schedule` is a redirect to `/admin/calendar`,
and `/admin` is a redirect to `/admin/me`. Both are correct. But on 2026-08-24 the design tracer
followed `/admin/schedule` and stored 72 elements of the CALENDAR as the locked "1:1 with what is
served" default of the SCHEDULE route. **Every redirect this plan creates is a place some other tool
can quietly file the wrong page under the wrong name.** The tracer and the dossier deriver were both
taught to refuse a route that forwards; anything new that walks routes needs the same check.

---

## §3. The rule: when a page becomes a tab, and when it does not

A rule stated once here, so that forty decisions below are not forty arguments.

**Merge when all four are true:**

- **Same subject.** The pages are about the same nouns — the same table, or the same money.
- **Same session.** A person doing one of these jobs is plausibly about to do the other. Approving
  hours and locking the pay period are one sitting; approving hours and editing the CAD catalogue
  are not.
- **The nav entry is a filter.** If the only difference between two pages is a `WHERE` clause, they
  are one page with a control on it. Six of the thirty money links are this.
- **The merge does not make a page nobody can load.** See the risk in §8.

**Do NOT merge when any of these is true:**

- **It is a detail route.** `/admin/jobs/[id]` is not a tab of `/admin/jobs`; it is a record. All 38
  dynamic routes are out of scope, permanently.
- **The roles genuinely differ in KIND, not in degree.** A tab a role cannot see is fine. A whole
  portal where every tab is hidden is a broken page — see §5.
- **It is a full-screen tool.** `/admin/cad` renders its own shell and never mounts
  `.admin-layout__content` at all. It is an application that happens to live at a URL.
- **It is a creation flow that is long enough to be its own place.** `/admin/receipts/new` is 2,424
  lines with a camera in it. It stays a route; it just also becomes reachable as a button.
- **Merging only helps the sidebar.** If the pages have nothing to do with each other and the merge
  exists to make a number smaller, the number was the wrong target.

---

## §4. The consolidation map

**138 nav links → 29**: 111 absorbed into 17 portals, 27 links surviving, plus the two portals
that are new routes (`/admin/pay`, `/admin/hours`).

> **This number is counted, not estimated.** `node scripts/nav-consolidation-count.mjs` runs the
> map below against the live registry and prints the result. Re-run it after every slice; it goes
> stale loudly rather than quietly.
>
> **The first draft of this document said 24, guessed rather than counted, and was wrong by nine.**
> That is recorded rather than tidied away because it is the same defect this repository keeps
> finding in its own instruments — a confident number nobody derived.

Each portal below lists what it absorbs and what it does with it.

### P1 — Pay & Payouts · `/admin/pay` (absorbs 11)

The owner's headline example. Eleven links, one question: what is somebody owed and how do they get
it.

| Absorbed | Becomes | Today |
|---|---|---|
| `/admin/payroll` | tab `runs` | 1,370 lines, already tabbed |
| `/admin/payouts` | tab `ledger` | 478 |
| `/admin/payouts/runs` | tab `runs` (same tab) | — |
| `/admin/payouts/ad-hoc` | a button on `ledger` | 300 |
| `/admin/payouts/search` | the search box on `ledger` | 201 |
| `/admin/payouts/withdrawals` | tab `withdrawals` | 266 |
| `/admin/payout-log` | tab `history` | 353 |
| `/admin/pay-rates` | tab `rates` | 269 |
| `/admin/pay-progression` | tab `rates` (same tab) | 2,622 |
| `/admin/my-pay` | **the employee's view of this portal** — see §5 | 345 |
| `/admin/rewards`, `/admin/rewards/admin`, `/admin/rewards/how-it-works` | tab `rewards` | 348 + 784 + 247 |

`/admin/payouts/search` is the clearest case in the whole document: a 201-line page whose entire job
is to search a table that another page already lists. It is a search box that was given a sidebar
link.

- [x] **P1.1** — the shell, the tab set, and `?tab=` in the URL. Bodies moved untouched.
- [x] **P1.2** — redirect stubs for all 11 old routes.
- [x] **P1.3** — the role views (§5).

### P2 — Receipts & Spending · `/admin/receipts` (absorbs 4)

Named explicitly: *"one portal for receipt management… adding receipts, reviewing receipts, and
approving and denying receipts or specific items on receipts."*

**Most of this already exists.** `/admin/receipts` is 5,517 lines with `pending / approved /
rejected / exported / needs_review` tabs and bulk approve. What is missing from the owner's sentence
is **per-ITEM approval** — today the decision is per receipt.

| Absorbed | Becomes |
|---|---|
| `/admin/receipts/new` | stays a route, and becomes the `+ Capture` button on the portal |
| `/admin/cards` | tab `cards` — the card registry receipts are matched against |
| `/admin/pass-through` | tab `rebilled` — costs paid on a customer's behalf |
| `/admin/mileage` | tab `mileage` — the other reimbursable |

- [x] **P2.1** — absorb cards, pass-through and mileage as tabs. Shipped 2026-08-25 with C5.
- [x] **P2.2a — surface the per-line editor on the approval queue.** **Shipped 2026-08-25.** §10.1.

      **It was never blocked.** P2.2a sat in the group §13.4 calls "the one blocked item since before
      this plan began" — blocked on *how a partly-deductible receipt should total*. That question is
      P2.2b's, and P2.2a does not ask it: the editing capability already ships to approvers today,
      one click away in the slideshow. What was missing was the mounting, not the answer. Fifth time
      in this plan a parked item's premise turned out to be narrower than its parking note.

      `ReceiptLineItems` is a three-prop client component mounted in exactly one place
      (`ReceiptSlideshow.tsx:434`), and the slideshow's own comment says it *"replaces the read-only
      table that used to sit here"*. The queue still had that table. This is the second half of a
      swap made once already.

      **The `> 0` gate had to go, and that is the substantive part.** The old table was hidden when
      `row.line_items.length === 0`, which is correct for a table and wrong for an editor: *"we need
      to be able to add items too, just in case they do not show up properly on the receipt, or the
      AI hallucinates"* is the owner's own words, and a receipt whose lines the AI missed entirely is
      exactly the case that needs typing into. Mounting the editor behind the old condition would
      have looked like shipping P2.2a while leaving its motivating case unreachable.

      **Two things checked rather than assumed**, both because this repo has been bitten by each:
      · the `rli__`/`rcv__` classes live in `ReceiptSlideshow.css`, which `QueueTab` pulls in through
      its static import of the slideshow — so the CSS is in the same client chunk and applies. A
      component authored against another screen's stylesheet is how `/admin/settings` rendered
      unstyled earlier in this plan. Measured in the browser: `list-style-type: none`, `margin: 0`,
      `0.72rem` titles — **rem**, not em, so the queue's denser typography cannot shrink it.
      · a green suite is not a rendered screen, so the row was expanded in a real browser at 1440 and
      390. Editor, totals and Add-item all present; zero overflow at both.

      **The note under it was kept and rewritten, not deleted.** The editor prints totals of its own
      — "counted as business", "not claimed" — a few lines above Approve, so the screen now shows
      more than one number and must say which the button acts on. That is P2.2c's warning arriving
      early, and the honest answer until P2.2c lands is: the printed total.

      Ratchet: QueueTab 34 → 31 inline hexes. Seven were deleted and three counted — the scanner
      strips `var(--token, #fallback)` on purpose, so only raw literals move it. **This corrects a
      standing note of mine that said the opposite**; the scanner was changed after that note was
      written, and quoting the deletion count as the ratchet delta would have overstated the fix.
- [ ] **P2.2b — a per-line tax treatment**, beside the per-line accept. Deductible · partial ·
      not deductible. `receipts.tax_deductible_flag` is the receipt-level answer and stays as the
      default a line inherits until somebody says otherwise.
- [ ] **P2.2c — `approvedTotal()` and `deductibleTotal()`, exported, used everywhere.** Once a line
      can be rejected there are three numbers — spent, approved, deductible — and every screen that
      says "the receipt amount" has to say which. This is the `effectiveHours` defect waiting to
      happen: four files summed raw hours while a fifth summed the approver's adjustment, and the
      two disagreed across the very decision that created them. One definition, before the first
      screen reads `total_cents` again.

      **Premise checked 2026-08-25, and it is better than written — see §13.4.** One function turns
      the flag into a number: `deductibleFraction()` in `app/api/admin/finances/tax-summary/route.ts`.
      `ScheduleCTab` consumes that route's numbers rather than recomputing them. So the split this
      item exists to repair **has not happened yet**, and P2.2c is a guard, not a rescue. **Not
      blocked on the owner's question** — a guard cannot change a number — so it went before P2.2b.

      **Guard shipped 2026-08-25**: `__tests__/receipts/one-definition-of-deductible.test.ts` fails
      the moment a second converter appears, and pins the fact that the 50 lives in two places — the
      fraction, and a sentence in `lib/finance/tax-summary.ts` that a search for arithmetic will
      never find. Writing the guard while the count is one is worth more than the reconciliation
      would be once it is two.

      **Move shipped 2026-08-25 — and it went to `lib/finance/`, not `lib/receipts/`.** The reason is
      the thing the guard had just found: `lib/finance/tax-summary.ts` already owned the
      `DeductibleFlag` type AND the sentence stating the same 50% to a person. Sending the fraction
      to `lib/receipts/` would have put the two copies of one number in two different libraries.

      So `DEDUCTIBLE_FRACTION` lives beside the sentence, as a map rather than a switch **so the
      sentence can read it** — `Deductible at ${asPercent(DEDUCTIBLE_FRACTION.partial_50)}%`. The two
      copies are now one. The route imports the function and no longer contains the flag at all,
      which is why the allowlist went from six files to five.

      A relocation that alters a tax figure is not a relocation, so the behaviour is asserted rather
      than assumed: the old `switch` had a `default:` arm catching `review` and everything else, the
      new form is a map plus `?? 0`, and both are checked against every flag **and** every non-flag —
      `''`, `'FULL'`, `'partial'`, `null`, `undefined`. Plus a bound nobody had written down: no
      fraction may exceed 1, because a rate above 100% claims more than was spent.

      **Sixth comment-broke-my-own-assertion.** The new assertion checked that the literal
      `Deductible at 50%` is gone — and failed on the comment two lines above it, which quotes the
      old sentence to explain why it went. The file already had a `code()` helper for exactly this.
      Six times in one plan is not carelessness about one comment; it is a property of writing tests
      that read source. **Any assertion over source text should strip comments by default**, and the
      helper should be reached for first rather than after the failure.

      ── **C14e — THREE FIXES, TWO OF THEM AIMED AT GUESSES, 2026-08-25** ──

      C14b closed this with "the sweep's window was too short" and called the three singletons
      explained. **Two of the three were re-verified and the third never was**, and it failed again
      on the next sweep. What followed is worth recording as a method failure before it is recorded
      as a bug fix.

      | run | the tab that failed |
      | --- | --- |
      | sweep 1 | `cleanup-queue` |
      | sweep 2 (after the polling fix) | `cleanup-queue` |
      | equipment alone | `maintenance` |
      | after the click-retry fix | `supplies` |
      | with diagnostics on | `valuation` |

      **Exactly one per run, at a different address each time.** Ruled out along the way, each by
      measurement rather than argument: an id/label mismatch (`plan-history` is one and works); the
      first-text-match hazard (exactly one match per tab, and it is the tab); a nested tab group
      (equipment has a single strip); the sequence and the viewport order (all ten replayed in order
      at both widths — all ten passed); a dev error overlay (the new guard reports none).

      Then I stopped arguing and instrumented it. `DESIGN_TRACE_DEBUG=1` prints what the page looked
      like at the moment of failure, and two runs answered what four theories had not:

      ```
      · valuation: TimeoutError: page.goto: Timeout 60000ms exceeded.
      !! openState(/admin/equipment · supplies) failed — showing "null"
      ```

      **Two real causes, neither of them about tabs.**
      1. The dev server stalls for over a minute roughly once per portal run, and whichever
         navigation lands inside the stall dies. The `goto` is now retried once after a pause.
      2. `selectedStateKey` returning **null** means there is no tab strip on the page *at all* — so
         the page was up (`waitForPageReady` is satisfied by the shell's heading and buttons) while
         the tabs were still arriving. A failed click waited a flat `settle`, giving a late strip
         about **eight seconds** in total rather than the generous budget the poll below it implies.
         A failed click now waits for a strip to APPEAR.

      Result: `/admin/equipment` 10/10, the first clean run after four consecutive runs each losing
      one. One run is not proof for an intermittent fault, and this entry does not claim it is —
      unlike C14b, which claimed exactly that and was wrong.

      **The lesson is not about tabs.** Three fixes shipped here: a fixed wait replaced by polling, a
      single click attempt replaced by three, and these two. All three closed genuine gaps. **Only
      the third was aimed at the actual failure**, and it is the only one that came after a reading
      rather than a theory. Two plausible diagnoses in a row, each confirmed by a green run that was
      really just the flake landing elsewhere. *An intermittent failure will confirm any fix you ship
      the moment it moves — so a fix for one is only evidence when you knew the cause before you
      wrote it.*

      Also noticed and NOT chased: `overrides` captured 42 desktop elements in one run and 50 in
      another. Element counts drift between runs for the same tab, which is a question about capture
      stability rather than reachability, and it deserves its own slice rather than a guess at the
      end of this one.

      ── **C14f — A STATE'S RECORD WAS REPLACED IN SILENCE, 2026-08-25** ──

      Chasing that drift found why nobody could have known about it. The tracer carries an emphatic
      note about re-tracing: replacing the record silently *"is the version of this feature that
      helps nobody — you re-trace precisely BECAUSE the page changed, and if the tool will not say
      how, the only way to find out is to compare two screenshots by eye."* It then prints, per
      viewport, what was added, removed and moved.

      **That rule was written for routes and never reached states.** The state branch fetched the
      same API, received the same `changes` payload — `writeDefault` scopes its previous-record
      lookup by `state_key`, so it has been computing them correctly all along — and threw it away.
      Every per-state default since V4 has been overwritten without a word.

      The `overrides` 50 → 42 was only noticed because both numbers happened to be on screen in one
      session, and the earlier row was already gone when I went looking: a state re-trace REPLACES
      rather than archives, so there is no history to reconstruct. One shared `reportChanges()` now
      serves both, and the first run with it said:

      ```
      cleanup-queue mobile: 36 → 34 elements · −1 gone: .strong
      ```

      Which reframes the drift: a `<strong>` appearing and disappearing between runs looks like a
      count or badge that renders only when non-zero — **the page's data changing, not the capture
      wobbling**. That is a different and much less alarming question than "the instrument is
      unstable", and it could not be asked at all until the tool named the element.

      **And the flake is not fixed.** The same run lost `overrides` — 9 of 10, after the 10 of 10
      that C14e deliberately declined to call proof. That restraint was right. Three fixes have made
      it rarer without ending it, and the honest state is: one state per portal run still fails
      intermittently, the cause of the remaining occurrences is not established, and
      `DESIGN_TRACE_DEBUG=1` is how the next one should be approached.

      ── **C14m — MEASURE AFTER THE REPAIR, NOT BEFORE IT, 2026-08-25** ──

      The conformance pass was started and then **stopped at 20 of 194**, deliberately. Its first
      twenty rows are the reason:

      | row | reading |
      |---|---|
      | `/admin/design · compare` | default/desktop **4%** · mobile 100% |
      | `/admin/design` · `· pages` | 99% / 99%, flagged |
      | `/admin/design · dossiers` | could not open the tab |
      | `/admin/billing · plan-history` | desktop 93% |

      A record at 4% is not a page that drifted. It is the same premature capture C14i found, in the
      form the lopsided check **cannot see**: when BOTH viewports are captured early the record is
      uniformly small and looks perfectly balanced. `recaptureIfLopsided` only ever catches asymmetry,
      and that limitation is worth stating in the doc rather than leaving for whoever trusts it next.

      Every one of those records was captured **before `captureStable` existed**. So the run in flight
      was measuring the distance between the live page and a set of records already known to be
      stale, at roughly four minutes a page, and every row it produced would have to be thrown away
      after the re-trace. **Measure after the repair.** The same reasoning that held conformance back
      while 59 states had no default applies again for a different reason.

      Full portal re-trace running now with `captureStable` and the readiness fix; conformance goes
      after it.

      ── **A NULL RESULT WORTH RECORDING, BECAUSE THE PROBE WAS THE PROBLEM** ──

      Before stopping the run I tried to find uniformly-thin records without the browser, by comparing
      each default's element count against its DOSSIER's inventory — two independent walks of the same
      page. It reported zero, and zero was meaningless: a dossier's `elements` is a curated inventory
      (24 for `/admin/design`) while a capture is a DOM census (597). A capture would have to be
      catastrophically small to fall under half the dossier's count.

      **The two numbers do not measure the same thing, so their ratio was never going to say
      anything.** Recorded so nobody builds a guard on it: the dossier cannot cross-check capture
      completeness, and conformance — comparison against the live page — is the only instrument that
      catches this class.

      ── **C14l — THE FLAKE, DIAGNOSED: THE PAGE NEVER ARRIVED, 2026-08-25** ──

      Four fixes had been aimed at this and it kept moving. The instrument settled it in one run:

      ```
      !! openState(/admin/equipment · templates) failed — showing "null"
         {"tabCount":0,"keys":[],"selected":[],"url":"?tab=templates","bodyChars":13}
      ```

      **Thirteen characters of text in the content root, and not one tab.** The URL had been applied.
      Nothing was wrong with the tab, the strip, the click or the navigation — **the page had not
      rendered.**

      The cause is one discarded return value. `openState` called `await waitForPageReady(page);` and
      threw the boolean away, while the route walk twenty lines further on does
      `if (!await waitForPageReady(page)) stillLoading = true`. So a page that never arrived was
      treated as ready, and the code went looking for a tab on it — then reported *"could not reach
      it"*, which says the tab is the problem.

      **Every earlier fix aimed at the last step of a sequence whose first step had silently failed.**
      A fixed wait replaced by polling, one click attempt replaced by three, a navigation retried on
      timeout — all real gaps, all downstream of this. And each one looked correct afterwards,
      because an intermittent fault confirms whatever ships the moment it lands elsewhere.

      Fixed by reading the answer: a page that does not render is a failed attempt and is retried
      like one, and it now says so in **its own words** rather than borrowing the tab's. That
      mislabelling is not cosmetic — "could not reach the tab" is exactly what sent an afternoon
      looking for a structural cause behind three tabs that were merely cold.

      **The lesson, stated once and plainly:** *when a diagnosis keeps needing another fix, stop
      fixing and start reading.* Four attempts cost more than the instrument would have, and the
      instrument was fifteen lines.

      ── **C14k — ALL FIVE LOPSIDED RECORDS REPAIRED, 2026-08-25** ──

      **Zero lopsided defaults remain**, and every repair was reported rather than assumed:

      | record | what came back |
      |---|---|
      | `learn · card-bank` | mobile 21 → 598 · `−1 gone: .admin-empty` |
      | `research · data-sources` | desktop 19 → 252 |
      | `marketing · connection-uploads` | desktop 28 → 283 · `+8 new: .mu__connect .mu__pending` |
      | `hours · field-team` | desktop 22 → 106 · `+1 new: .article` |
      | `finances · job-profitability` | desktop 29 → 92 · `+5 new: .section .article .header .admin-table-wrap` |

      Those right-hand columns are the point. Before C14f a state's record was replaced in silence,
      so all five of these repairs would have been indistinguishable from all five of the failures
      that created them — a number changing, with nothing to say whether the page or the instrument
      had moved.

      **Conformance now measures something real.** Validated on `/admin/equipment` before the full
      pass: 11 records compared, **0 defaults no longer 1:1**, every one at 100% except
      `cleanup-queue` mobile at 94% and `schedule`, which hit the open-the-tab flake. That flake is
      the one thing in this walk still without an established cause, and it now shows up in three
      tools — the tracer, the dossier deriver and the conformance sweep — which is itself the
      argument for fixing it properly rather than retrying around it.

      ── **C14j — SEVEN BROKEN ANCHORS IS A TOOL PROBLEM, 2026-08-25** ──

      Seven assertions in this plan have failed because a piece of source text moved while the rule
      they guard did not. That is not seven careless edits; it is the cost of a idiom, and the idiom
      has a second problem that is worse than the inconvenience:

      ```js
      expect(src.indexOf('X')).toBeGreaterThan(src.indexOf('Y'))
      ```

      When `Y` is absent, `indexOf` returns -1, the assertion becomes `toBeGreaterThan(-1)`, and it
      **passes for any X that exists at all** — the order never checked. A test that cannot fail
      looks exactly like a test that is passing, which is the same shape as the comment-stripper
      eating the evidence for a `not.toMatch`.

      Measured first, as with the stripper: **24 such assertions across the suite, 0 currently dead.**
      So `expectOrder()` prevents a class rather than repairing a hole — written while the count is
      zero, for the same reason the deductibility guard was.

      It also fixes the legibility half. Every one of those seven reported something like *"expected
      -1 to be greater than 45"*, which says nothing about WHICH anchor went missing. `expectOrder`
      names it.

      **And the measurement produced a false positive of its own — the second this turn.** It flagged
      `bestiary-canonical.test.ts` for an anchor `'CASE c.system'` that appears in nothing the test
      reads. It appears in `seeds/468_dnd_creatures_canonical.sql`; my corpus regex collected
      `.ts/.tsx/.mjs/.css` and never looked at `seeds/*.sql`. Twice in one turn a script I had just
      written manufactured a finding out of its own blind spot — once by inheriting the tracer's stub
      regex, once by forgetting a file extension. **The rule that keeps holding: when a measurement
      finds exactly one anomaly, suspect the measurement before the code.**

      ── **C14i — THE LOPSIDED RECORDS WERE EMPTY STATES, 2026-08-25** ──

      C14g caught five records where one viewport held a fraction of the other and re-captured the
      short one. `/admin/learn · card-bank` refused to be fixed that way, and reading its 21 stored
      mobile elements is what finally explained the whole class:

      > `admin-empty` — the EMPTY STATE — a search box, a title, and 617px of content, against
      > desktop's 5230px and 587 card elements.

      **Mobile was not a different layout. It photographed the page before its rows arrived**, and
      filed "nothing here" as the record of what that tab looks like. Then the guard's retry could
      not re-open the state at mobile — the intermittent `openState` failure, landing where it did
      the most damage — so the bad reading stayed:

      ```
      ⟳ card-bank: 600 desktop vs 25 mobile — re-capturing mobile
      ⟳ card-bank: could not re-open at mobile; keeping the first reading
      ```

      **The root cause is the same one this plan keeps re-buying at a higher price.** Everything
      before this waited for a PROXY and then captured once: `waitForPageReady` waits for a heading
      or a button; `openState` waits for the right tab to be selected. A shell that has fetched
      nothing satisfies both. Every fixed wait in this file has been too short for somebody — the
      route walk (4 of 51 pages), the state opener (three tabs), the re-capture — and each fix
      lengthened a guess.

      `captureStable()` stops guessing at a duration and watches the thing itself: capture, wait,
      capture again, and while the count is still climbing the page is still arriving. It is used at
      **all four** capture sites, so the fix lands on the FIRST capture rather than depending on a
      retry that may not get a turn.

      ```
      · card-bank: 598 desktop · 598 mobile
        card-bank mobile: 21 → 598 elements · +1 new: .div · −1 gone: .admin-empty · 4 moved
      ```

      `−1 gone: .admin-empty` is the proof, and it is only legible because C14f taught state records
      to say what they replaced. **28.5x → 1.0x**, and the three slices now read as one argument:
      make the replacement speak, notice the asymmetry it reveals, then find that the asymmetry was
      never about viewports at all.

      ── **C14h — THE COMPLETENESS QUESTION, ANSWERED IN NUMBERS, 2026-08-25** ──

      C14's first line is "re-derive the dossiers and re-trace the defaults", and until now nobody had
      stated what finished would look like. Measured against the route inventory:

      | artefact | present | missing, decomposed |
      |---|---|---|
      | route-level default | 61 of 200 | 83 redirect stubs + 56 public/non-admin + **0 admin pages** |
      | dossier | 137 of 200 | 7 redirect stubs + 56 public/non-admin + **0 admin pages** |
      | portal tab default | **107 of 110** | the three on `/admin/support`, traced at the end of the sweep |

      **"139 routes have no default" is the alarming way to say "the consolidation worked."** 83 of
      them are stubs this plan created, and a stub SHOULD have no default — the tracer retires the
      design and skips the route, because a record of a forward is a record of somebody else's page.
      The other 56 are public and `/AndrewAsh` routes that this admin sweep never claimed.

      **Zero admin pages are genuinely without either artefact**, and no record points at a route that
      no longer exists.

      ── **AND A FALSE POSITIVE OF MY OWN, WHICH IS THE ENTRY'S REAL LESSON** ──

      The first decomposition reported exactly one genuine gap, `/admin/design/dossiers`, and it was
      wrong. That page IS a stub; my script copied the tracer's stub regex, which requires a
      no-argument component and a single-quoted literal, and this one takes `searchParams` and
      redirects to a COMPUTED target — deliberately, so `?route=` survives the forward. The doc
      already recorded that this detector declines three pages of that shape. **I copied a detector
      along with its documented blind spot, and wrote a comment justifying the copy.**

      The tracer itself was never wrong: it navigated, saw the forward and skipped the route. Only the
      ad-hoc measurement was. Widening the test to "imports `redirect`, renders no JSX" took the count
      from 1 to 0. No product change was needed, which is the point — *the finding was in the ruler
      again, and this time I had written the ruler ten minutes earlier.*

      ── **A NUMBER FOR §13.3, FALLING OUT OF THE SAME MEASUREMENT** ──

      83 stubs have no default; only 7 stubs have no dossier. So **76 stubs still carry a dossier for
      a route that now forwards** — because a default can be archived and a dossier cannot: the table
      has no `status` and no `deleted_at`. That is exactly the question §13.3 puts to the owner, and
      it now has a size rather than an adjective.

      ── **C14g — FIVE RECORDS WERE HALF A PAGE, AND THE BIAS WAS SYSTEMATIC, 2026-08-25** ──

      A line went past in the sweep's output — `data-sources: 19 desktop · 251 mobile` — and thirteen
      times more content on a phone than on a desktop is not a layout. Measured across all 191 stored
      defaults, five have one viewport at 3x the other or worse:

      | record | desktop | mobile | |
      |---|---|---|---|
      | `/admin/learn · card-bank` | 21 | 598 | 28.5x |
      | `/admin/research · data-sources` | 19 | 251 | 13.2x |
      | `/admin/marketing · connection-uploads` | 28 | 282 | 10.1x |
      | `/admin/hours · field-team` | 22 | 105 | 4.8x |
      | `/admin/finances · job-profitability` | 29 | 91 | 3.1x |

      **All five short on desktop — the viewport the walk captures FIRST.** That is a systematic bias
      rather than five accidents: the first capture happens straight after the navigation, and the
      second inherits everything the first waited through. The same fault is already recorded in this
      tool with the viewports reversed — `/admin/work` once traced 70 desktop and 2 mobile, and the
      note called it *"a capture taken while the page was still arriving."*

      And it is not harmless drift. `connection-uploads` measured **283** desktop elements when its
      portal was traced alone, and **28** when the full sweep re-traced it. A good record was replaced
      by a bad one — the specific harm a locked default exists to prevent.

      `recaptureIfLopsided()` now re-takes the short viewport before storing, at both capture sites.
      3x is deliberately generous: a table becoming cards is layout, a multiple is a half-drawn page.
      The better reading wins, because this failure only ever makes a capture too SMALL — nothing
      renders extra elements by waiting. When the second reading is no better it says so out loud
      rather than swallowing it, because then the asymmetry is real and belongs to the page.

      Verified live on the worst offender it could reach:

      ```
      ⟳ connection-uploads: 31 desktop vs 285 mobile — re-capturing desktop
      ⟳ connection-uploads: desktop 31 → 286 elements
        connection-uploads desktop: 28 → 283 elements · +8 new: .mu__connect .mu__pending
      ```

      **Two slices compounding, which is worth noting as a pattern.** C14f made a silent replacement
      speak; C14g is what the speaking revealed. Neither would have found this alone — the guard
      needed a number to compare against, and the reporting needed something worth reporting.

      Pinned by `__tests__/design/lopsided-capture.test.ts`. The assertion worth mentioning counts
      the CALL SITES and expects exactly two, and it only means that because it reads the source
      through the shared `code()` stripper: there are four mentions of `recaptureIfLopsided` in the
      file and two of them are comments. That is the first time in this plan the stripper has earned
      its keep rather than tripping an assertion up.

      **`grep` buffered again — the fourth time in this plan**, in a background command written after
      the trap had been recorded twice. The note plainly is not working, so the rule is now
      structural rather than remembered: **read progress from the database, never from a pipeline.**
      The rows are the deliverable; stdout is commentary, and buffered commentary is silence that
      looks like a hang.

      ── **C14d — THE STRIPPER ITSELF WAS WRONG, IN SIX PLACES, 2026-08-25** ──

      Acting on that last line turned up something bigger than the tidying it was meant to be.
      **32 test files strip comments before asserting, and there were SIX different implementations
      of it** — the same "two copies of one rule" shape this plan keeps finding in the product,
      sitting in the tests that exist to catch it.

      Five of the six shared a bug:

      ```js
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      ```

      eats the rest of any line containing `//` **inside a string**. Measured:
      `const u = 'https://example.com/x';` becomes `const u = 'https:`.

      For a positive assertion that is a false negative and someone investigates. **The dangerous
      direction is the other one:** a `not.toMatch()` over stripped source PASSES when the stripper
      has deleted the evidence — and a test that cannot fail looks exactly like a test that is
      passing. That is the same family as the `--stale` queue reporting zero, which this repo already
      paid for once: *nobody investigates zero.*

      Shipped `__tests__/helpers/source.ts` — one implementation that tracks string state instead of
      pattern-matching, preserves line numbers so failures still point at the right place, survives
      an escaped quote and an unterminated block comment, and offers `cssCode()` for stylesheets
      where `//` is not a comment at all. Nine tests, and the one that matters is the URL case every
      hand-rolled version fails.

      Adopted in the two files this plan owns. **The other 30 are deliberately not converted here** —
      each needs its assertions re-read against the new (correct) stripping, several are in areas
      this plan has not touched, and a mechanical sweep of 30 test files inside a consolidation slice
      is how an unrelated regression arrives wearing this plan's name. Left as a follow-up with the
      hazard written down rather than done badly in passing.
- [ ] **P2.2d — teach `/admin/finances` the difference.** Its Schedule-C report totals approved
      receipts today. Per-line exemption changes what it is allowed to count, so P2.2 and P7 are
      one data model seen from two ends.

### P3 — Hours & Time · `/admin/hours` (absorbs 4)

| Absorbed | Becomes |
|---|---|
| `/admin/hours-approval` | tab `approvals` (admin) |
| `/admin/my-hours` | tab `my-time` — **the same portal, employee view** |
| `/admin/time-off` | tab `time-off` |
| `/admin/availability` | tab `availability` |

The dossiers show `/admin/my-hours` and `/admin/hours-approval` already call the same three APIs —
`time-logs`, `time-logs/advances`, `time-logs/lock-period`. They are one screen with two permission
levels, built twice.

### P4 — Jobs & Projects · `/admin/jobs` (absorbs 6)

| Absorbed | Becomes |
|---|---|
| `/admin/projects` | tab `projects` |
| `/admin/projects/new` | a button |
| `/admin/jobs/new` | a button |
| `/admin/jobs/import` | a button on the `jobs` tab |
| `/admin/calendar` | tab `calendar` |
| `/admin/timeline` | tab `activity` |
| `/admin/field-data` | tab `field-data` |

`/admin/jobs/[id]` (8,734 lines) is **not** touched. It is a record, not a tab.

### P5 — Equipment · `/admin/equipment` (absorbs 10)

The most mechanical merge in the document — fourteen links about one cage.

`today` · `checked-out` · `timeline` · `maintenance` · `consumables` · `templates` ·
`templates/cleanup-queue` · `overrides` · `fleet-valuation` · `inventory` · `import` →
tabs `today / check-in-out / schedule / maintenance / supplies / templates / valuation / audit`,
with `inventory` and `import` as buttons on the catalogue tab.

`/admin/vehicles` (1,302 lines) joins as tab `vehicles` — it is fleet, and the dossiers show
`/admin/equipment` already calls `/api/admin/vehicles`.

`/admin/personnel/crew-calendar` moves to **P3 (Hours)**, where it belongs. It is filed under
Equipment today, which is worth noticing as evidence that the current grouping is not load-bearing.

### P6 — Growth · `/admin/marketing` (absorbs 1)

Already has `overview / spend / conversions / uploads`. Add `/admin/leads` as tab `leads`.
**`/admin/leads/[id]` (3,348 lines) stays a record.**

### P7 — Books & Tax · `/admin/finances` (absorbs 3)

| Absorbed | Becomes |
|---|---|
| `/admin/finances/overview` | tab `overview` — money in vs money out |
| `/admin/finances/reconcile` | tab `reconcile` — the bank CSV queue |
| `/admin/payouts/tax-report` | tab `payroll-tax` |
| `/admin/finances` (Schedule-C summary) | tab `schedule-c` |

### P8 — Customer Money · `/admin/invoicing` (absorbs 4)

`/admin/invoices/new` (890) → a button · `/admin/invoicing/categories` (an admin list) → tab
`categories` · `/admin/receivables` (160) → tab `collections` · `/admin/payments/inbox` → tab
`incoming`.

### P9 — Subscription · `/admin/billing` (absorbs 3)

`billing/invoices`, `billing/plan-history`, `billing/upgrade` — 200, 205 and 226 lines. Three
sidebar links for one subscription screen that **already has tabs**. This is the cheapest slice in
the plan and should probably be done first as the pilot.

### P10 — People · `/admin/people` (absorbs 6)

`/admin/employees` · `/admin/employees/manage` · `/admin/users` · `/admin/invites` ·
`/admin/roles/custom` · `/admin/role-requests` → tabs `directory / accounts / invites / roles /
requests`.

**Care needed:** `/admin/employees` and `/admin/users` are different nouns — a person who works here
versus a login. They are adjacent, not identical, and the tab labels have to keep that clear.

### P11 — Messages · `/admin/messages` (absorbs 3)

`messages/contacts` · `messages/new` · `messages/settings` → a directory pane, a compose button and
a settings tab. `/admin/email/new` and `/admin/email/sent` join as tab `email`.

### P12 — Knowledge · `/admin/learn` (absorbs 8)

19 links today. `roadmap` · `modules` · `knowledge-base` · `flashcards` · `flashcard-bank` ·
`quiz-history` · `search` · `references` · `practice` → tabs. **`exam-prep` and its four children
stay separate** — an exam sitting is a session you do not want a tab bar in.
**`learn/manage` and its two children stay separate**: authoring is a different job from studying,
done by a different role, and `manage/lesson-builder` is 3,199 lines.

### P13 — Research · `/admin/research` (absorbs 5)

`coverage` · `library` · `pipeline` · `sites` · `self-heal` · `billing` → tabs.
**`/admin/research/[projectId]` (22,112 lines — the largest page in the product) is untouched**, and
so is `/admin/research/testing` (a lab) and `/admin/cad` (its own shell).

### P14 — Company · `/admin/settings` (absorbs 5)

`org-settings` · `orgs` · `announcements` · `notifications` · `me/privacy` → tabs.

### P15 — System · `/admin/support` (absorbs 3)

`support/new` · `error-log` · `audit` → tabs. Developer-facing; low traffic; low risk.

### P16 — Files · `/admin/files` (absorbs 1)

`/admin/my-files` is the same filesystem scoped to one person — a role view, not a page. §5.

### P17 — Page Designer · `/admin/design` (absorbs 5)

`design/compare` · `design/dossiers` · `design/versions` · `design/conformance` · `design/serve`
→ tabs.

**This one contradicts the first draft**, which said the design tool should be left alone because
consolidating an internal tool "helps nobody who does the firm's actual work". That was wrong on
its own terms: six sidebar links for one internal tool is exactly the complaint being answered,
and the fact that the tool is mine to maintain is not a reason to exempt it from the rule in §3.

### P18 — Exam Prep · `/admin/learn/exam-prep` (absorbs 3)

`exam-prep/sit` · `exam-prep/sit/mock-exam` · `exam-prep/rpls` → tabs on the prep landing.
**The exam itself still opens as its own route** — §3 says a sitting is not a thing to put a tab
bar in, and that still holds. What is being merged is the four ways IN to it, not the exam.

### P19 — Learning Content · `/admin/learn/manage` (absorbs 2)

`manage/media` · `manage/question-builder` → tabs. Authoring stays separate from studying (P12);
this merges only the authoring surfaces with each other.

### Also folded in while verifying the count

These were "left alone" in the first draft and do not survive the rule in §3 on a second look:

| Route | Goes to | Why the first draft was wrong |
|---|---|---|
| `/admin/contacts`, `/admin/discussions` | P11 Messages | all three are "talking to people" |
| `/admin/notes` | P14 Company | company notes are a settings-adjacent company record |
| `/admin/team`, `/admin/assignments` | P3 Hours | who is working, and on what — the same session as approving their hours |
| `/admin/schedule` | P3 Hours | it is **already a redirect stub** to `/admin/calendar` and should never have been a sidebar link |
| `/admin/weather`, `/admin/compliance` | P4 Jobs | both are "can we work, and may we" |
| `/admin/reports` | P7 Books & Tax | it is a financial report |

### Left alone deliberately (and why)

| Route | Why it stays |
|---|---|
| `/admin/me` | the Hub. It is the thing portals are reached FROM. |
| `/admin/search` | searches everything; belongs to no portal. |
| `/admin/profile` | 1,199 lines, already tabbed, personal. |
| `/admin/cad` | own full-screen shell, outside `.admin-layout` entirely. |
| `/admin/design` + 5 children | an internal tool with its own IA; consolidating it helps nobody who does the firm's actual work. |
| `/admin/files` | 2,249 lines, a filesystem. `/admin/my-files` is its personal view — §5. |
| `/admin/install` | one screen, one job |
| `/admin/research/testing` | a lab, not a view |
| `/admin/office`, `/admin/work`, `/admin/money`, `/admin/research-cad` | the four workspace landings. They exist to make 138 links navigable and may not survive C13 — but removing them is an IA decision, not a merge. Dropping them takes the total from 29 to **25**. |
| all 38 `[id]` routes | records, not tabs |

---

## §5. The role axis — one portal, several views

> *"The payment portal would look different depending on which role the user has."*

**This is already how the product is built — it is just built as separate PAGES instead of separate
views.** Four pairs:

| Employee page | Admin page | Same data? |
|---|---|---|
| `/admin/my-pay` | `/admin/payroll` + `/admin/payouts` | yes — dossiers show shared `payroll/balance`, `payouts/search` |
| `/admin/my-hours` | `/admin/hours-approval` | yes — shared `time-logs`, `advances`, `lock-period` |
| `/admin/my-files` | `/admin/files` | yes |
| `/admin/my-notes` | `/admin/notes` | yes |

Collapsing each pair into one portal with a role-chosen default view is the owner's request answered
exactly. **Three rules for doing it without breaking anything:**

1. **The API is the boundary, not the tab.** A tab hidden in the UI is a convenience; the route
   behind it must still refuse. This repo already learned that — `middleware.ts` carries the note
   that the gate "keeps out roles the product never offers the page to at all" while "the API is the
   real boundary". Consolidation must not quietly widen a gate: a portal reachable by six roles
   whose tabs are gated to one is a **wider** door than six separately-gated pages, and it is the
   single most dangerous thing in this plan.
2. **Never render an empty portal.** If a role can see no tab, the portal must not be in their
   sidebar at all. The registry already computes per-route role visibility; the portal's entry needs
   to be visible only when at least one of its tabs is.
3. **The default tab is per role, and the URL still wins.** A field crew member landing on
   `/admin/pay` gets `my-pay`; an admin gets `runs`. But `/admin/pay?tab=runs` sent to either of
   them opens `runs` — or refuses, if they may not see it. A default is a courtesy; it is not a
   permission.

---

## §6. What this does to the sidebar

| | Now | After |
|---|---|---|
| Nav links | 138 | **29** (25 if C13 drops the four workspace landings) |
| Workspaces | 7 | 5 or 6 (see below) |
| Deepest nesting | 3 levels | 2 |

With 29 destinations, **the 7-workspace split may stop earning its keep.** Workspaces exist to make
138 links navigable; 29 links fit in one grouped list. That is a judgement call for the owner and it
should be made AFTER a few portals ship, not designed up front on a guess.

**Do not delete the workspace concept in the same slice as the merges.** Two large IA changes at
once means any complaint afterwards has two possible causes.

---

## §7. Risks, named

1. **A portal that is slower than the page it replaced.** Four tabs' data fetched on mount is four
   times the work for a person who wanted one. **Fetch per tab, on demand.** `/admin/marketing`
   already does this; copy it.
2. **The widened door.** §5.1. The most dangerous item here. Every merged route's role list must be
   re-derived as the UNION of what it absorbs — and then each tab gated to its own original list, at
   the API. A test should assert that no tab is reachable by a role its old route refused.
3. **Bookmarks and deep links.** Solved by the redirect-stub pattern — but there are ~150 of them
   after this plan, and every route-walking tool has to know they forward. §2.
4. **Losing a page by absorbing it.** A tab nobody clicks is easier to lose than a link nobody
   clicks. Before merging a page, check whether anyone actually uses it — `lib/admin/nav-telemetry.ts`
   exists and should be read first.
5. **The 22,112-line page.** `/admin/research/[projectId]` and `/admin/jobs/[id]` (8,734) are not in
   scope, but they IMPORT from the pages being moved. Check imports before moving any body.
6. **Doing it all at once.** 15 portals is a quarter's work. §8 orders them so the cheapest and least
   risky comes first and the plan can be abandoned after any slice with the product in a coherent
   state.

---

## §8. Slices, in the order they should be done

### Where this stands — 2026-08-25

**138 nav links → 42.** C0–C14 shipped; §12 answered the workspace question §10 delegated.
What is left is four items, and three of them are decisions rather than work:

| Item | State |
|---|---|
| **C14** | the only thing still being *built*: defaults re-traced, dossiers and conformance next |
| **P2.2a–d** | blocked on the owner's accounting answer, and has been since before this work started |
| **C12c-files**, **C13f** | one decision each, both written up with options — see §13 |
| **C12d-exam** | deferred by §8's own rule: two of its three routes are the exam itself |

**Four boundaries were closed on the way** — research reads, the compliance register, company
notes (reads AND writes), and the door on `/admin/team`. Each is recorded under the slice that
found it. One more, `/api/admin/contacts`, is deliberately NOT closed and is in §13: the client
list is readable by any signed-in account, and closing it would be a new policy rather than an
existing one reaching the data.

**Five rules came out of this work** and are worth carrying into the next plan:

  1. A registry row survives anything that still names the route — a child, a notification, an API
     mirror, a frozen receipt. `showInRail: false` is the part a consolidation needs (C13d).
  2. A portal must not be a wider door than the pages it absorbs, and when it is, the boundary has
     to be checked rather than assumed (§5, and four endpoints that failed the check).
  3. Check the premise before building on it. Four §8 items had premises that did not survive
     measurement, and one of them was a section of this document.
  4. A tab cannot carry its own bundle: absorbing a bundle-exempt route into a gated portal always
     changes its packaging (C11b).
  5. Your probe can be the bug. Four times here, each caught by reading the field the code reads
     rather than a pattern that usually matches it.

Ordered by *risk-adjusted value*: the pilot is small and reversible, the owner's named portals come
early, and the internal tooling comes last.

- [x] **C0 — Get real usage data before absorbing anything.** Shipped 2026-08-24. The product
      could not answer "which of these 138 links does anyone open"; now it can, and the answer
      arrives in two weeks rather than being argued about.

      **What shipped.** `nav.route.view`, one row per admin route opened, through the telemetry
      that already existed — `trackNavEvent` → `POST /api/admin/nav-events` → `nav_events`. Four
      files: the event name added at both ends (the emitter can post whatever it likes;
      `KNOWN_EVENTS` decides what is stored, and a name added at one end only is dropped with a
      400 nobody reads), `RouteViewTelemetry` mounted app-wide beside the two existing
      effect-only components, and `lib/admin/route-usage.ts` holding the rule.

      **One rule, exported, used at both ends.** A raw pathname cannot be counted:
      `/admin/jobs/58a62727-…` and `/admin/jobs/8d787d88-…` are two visits to one page. The
      emitter writes `props.route` and the report groups by it, both through
      `normaliseRoutePath`. That is deliberate rather than tidy — the design conformance check
      shipped with two matching rules, one at each end, and they disagreed about the name of the
      same element; 220 of 266 defaults were reported stale and the score was really measuring
      class-attribute order. The same shape here would be a report counting a route the emitter
      never wrote, and it would look exactly like a page nobody opens.

      **The reading half shipped with it.** `scripts/nav-usage-report.mjs` — a slice that writes
      rows nobody can read is not a slice, it is a table. It ranks what was opened and lists what
      was not **next to the roles that could have opened it**, because there are three reasons a
      route can be missing and only one of them is a finding: nobody opened it, nobody who could
      was in the window, or it was never reachable at all — and the third is a bug, not a
      deletion candidate.

      **Off in development** unless `NEXT_PUBLIC_ROUTE_TELEMETRY=1`. A developer reloading
      `/admin/jobs` forty times while working on it would drown the signal from the people this
      plan is about.

      **Verified end to end in a browser**, not just wired: the guard compiles to `if (false)`
      with the flag set, a route load and a real in-app `<Link>` click both reach `nav_events`
      with the right normalised route, and neither fires twice. **The first probe reported zero
      events and was wrong** — `sendBeacon` sends a Blob and Playwright could not read the body.
      Seventh time in this repository that the instrument was the defect; the database settled
      it. The eight QA rows were deleted afterwards, because synthetic views would poison the
      first read of the very data this exists to produce.

      **One thing this deliberately does not measure:** which TAB gets used. `?tab=` is stripped
      by the normaliser, so `/admin/marketing?tab=spend` counts as `/admin/marketing`. That is
      right for the question C0 asks — is this ROUTE worth keeping — and it becomes the wrong
      answer the moment portals exist. **C13 should revisit it.**

      **Still to do, and it is not code:** deploy, then leave it alone for two weeks. Nothing in
      this plan should be deleted on the strength of a shorter window than that.
- [x] **C1 — Pilot: P9 Subscription. 4 links → 1**, shipped 2026-08-24. One better than planned,
      and smaller than planned, because the page had already done half of it.

      **What was already there.** `/admin/billing` has had real in-place tabs since
      `billing-real-tabs-2026-06-21`, and both surfaces already shared one fetcher. The missing
      piece was not the tabs — it was the URL. `useState` became `?tab=`, which is the one property
      of the marketing precedent worth copying above all others: a reload keeps you where you were,
      the back button steps between tabs, and a tab becomes a link somebody can send.

      **It is also what makes the redirects honest.** Without a URL for the tab, forwarding
      `/admin/billing/invoices` could only land on the overview — which looks exactly like the
      invoices having gone missing.

      **`/admin/billing/upgrade` is removed from the nav and KEPT as a route**, and the distinction
      is the one real judgement in this slice. It is not a view of your subscription; it is the
      interstitial the bundle gate sends you to, from anywhere, carrying `?requiredBundle=` and
      `?returnTo=`. The sidebar row was the accident: "Upgrade Plan" rendered **"Unknown bundle"**
      when clicked, because the parameters that give the page meaning only exist when the gate
      sends you. Making it a tab would have been worse than leaving it alone — somebody blocked
      from `/admin/research` would land on a billing portal with a tab bar instead of on a sentence
      explaining what happened. §3's "merging only helps the sidebar" rule, applied.

      **Three guards fired, and all three were right.**

      - `orphan-routes` — *"a page nobody can reach is a page nobody built"*, the ratchet against
        this repo's most common defect. Removing the upgrade page's registry entry made it an
        orphan by that test's model, and the model was incomplete rather than the change wrong:
        it knew about pages you navigate to and pages that forward, and not about **pages the code
        sends you to**. That third kind now exists in the sweep as a NAMED list whose value is
        where-from, checked against the source on every run — a stale exemption would silently
        keep a genuinely orphaned page off the report.
      - `consolidation` — asserted `/admin/billing/upgrade` is in the Money workspace. It is in no
        workspace now, deliberately. The invariant it guards (the firm's money surfaces live in
        ONE workspace, not scattered across two) is untouched; the sample was updated with the
        reason inline.
      - `inline-style-hex-ratchet` — the two pages became stubs, so the baseline over-recorded.
        Re-baselined DOWN: 2308 → 2306.

      **Verified in a browser, 12 checks**: both old bookmarks land on the right tab with it
      actually selected, a pasted `?tab=` opens that tab, a reload keeps it, a mistyped tab falls
      back to the overview instead of rendering nothing, clicking a tab writes the URL, and the
      upgrade interstitial still resolves its bundle from its query parameters.

      **The first run showed 1 of 3 redirects failing and that was the dev server, not the code.**
      A control against `/admin/marketing/spend` and `/admin/schedule` — two stubs that have been
      in production for months — showed them behaving identically to mine, which is what proved
      the mechanism was fine. Warm, it is 12/12. Worth writing down because every future slice in
      this plan will make redirect stubs, and each one will look broken on its first cold compile.

      **Not done here: the reusable shell.** The plan expected C1 to produce it. It did not, and
      should not have — `/admin/billing` already had a tab implementation, so extracting a general
      shell from a page that needed almost no change would have been designing it from one
      example. C2 extracts it from this plus `/admin/marketing`, which is two.
- [x] **C2 — Extract the shell** as `lib/admin/portal/` — tab set, `?tab=` routing, per-role
      default, per-tab gating, per-tab lazy fetch, and the toggle read from §11.6. Shipped
      2026-08-25. **Everything after this is configuration.**

      Extracted from `/admin/billing` and `/admin/marketing` **together**, as the slice insisted.
      Both are now callers: billing's page lost its `?tab=` reader, its unknown-value fallback, its
      `replace`-not-`push` rule and its "default tab has no query string" rule, and kept a
      three-entry list of tabs — the only part that was ever about billing.

      **The one thing they disagreed about is the whole reason this is not a five-line helper.**
      Marketing keeps a date range in the URL beside the tab and had one writer for the entire query
      string, precisely because each of its four predecessor pages owned its own pair of date inputs
      and changing the tab dropped the period. A shell that owned `?tab=` alone would have
      re-created that bug **inside the thing extracted from the page that had it**, in every portal
      that later grew a second parameter. So `portalHref` takes the other parameters as an argument:
      preserving them is the caller's declaration, not the shell's guess.

      Browser-verified, both pages:

      | | result |
      |---|---|
      | `/admin/billing` default | no `?tab=` — the canonical URL |
      | click Invoices | `?tab=invoices`, panel swaps, no navigation |
      | `?tab=nonsense` | falls back to Overview |
      | `/admin/billing/invoices` | still forwards to `?tab=invoices` |
      | marketing `?preset=last-month` → Spend | `?tab=spend&preset=last-month` — **period kept** |
      | marketing custom range → Spend | `?tab=spend&preset=custom&from=…&to=…` — **kept** |
      | back to the DEFAULT tab | `?preset=last-month` — period kept, no `?tab=` left behind |

      **The first probe reported the period being DROPPED** — the exact bug the shell exists to
      prevent, apparently reproduced by the extraction. It was not: the probe used
      `?preset=this-month`, and `this-month` **is** `DEFAULT_PRESET`, so `rangeToParams` correctly
      returns `{}` and the redundant parameter is normalised away. Confirmed against `HEAD` that the
      old code did exactly the same thing on the same input. Tenth time this session the instrument
      was the defect, and the first one where the false alarm was about the very property the slice
      was written to protect.

      **What the shell adds that neither example had**, and each is a real case the tests pin:

      · **A per-role default** (§5's *"one portal, several views"*) — a crew member lands on their own
        hours, a manager on the approval queue. One portal with two front doors rather than two
        portals. A default that is itself gated off falls through to the first visible tab, or the
        portal would render empty for exactly the people it was defaulted FOR.
      · **Per-tab gating on three independent axes** — the firm switched it off, the firm has no
        bundle, you do not have the role. Asked separately because they have three different
        remedies, and one boolean for all three makes *"why is this tab missing"* unanswerable. An
        admin bypasses the role check and does NOT bypass the bundle: the firm has not paid.
      · **Requesting a gated tab by URL lands on one you can see.** The normal way this happens is
        somebody sending a link from an account with more access — not an edge case.
      · **`null` when a viewer can see no tab at all**, rather than a guess. Every tab switched off is
        a real state and the caller has to say something rather than draw an empty strip.

      §11.6's toggle read comes free: `canSeeTab` calls `isDestinationEnabled`, so a tab switched off
      in Settings → Pages leaves the strip — **including for admins**, because an easier sidebar is
      the whole request — and switching off the portal takes its tabs with it.

      The decidable half is pure and has no React, no router and no fetch in it. C3–C12c are
      seventeen portals standing on this; a mistake here is not one wrong page, it is the same wrong
      page seventeen times, discovered after they all exist.
- [x] **C3 — P5 Equipment.** Shipped 2026-08-25. **Thirteen nav destinations became one**, which is
      the biggest single reduction in the plan and the first portal built entirely as C2 configuration.

      | | before | after |
      |---|---|---|
      | Equipment workspace rows in the registry | 12 | **4** (three are `showInRail: false`) |
      | in the sidebar / rail | 11 | **1** |
      | plus `/admin/vehicles` in Work | 1 | 0 — it is a tab |

      Ten tabs: `today · check-in-out · schedule · maintenance · supplies · templates · cleanup ·
      valuation · vehicles · audit`. Ordered operationally rather than alphabetically — somebody
      opening this at 6am is answering *"what goes out today"*, and somebody opening it in the office
      is answering *"what did that cost"*. The first is the default; the second is three tabs along.

      **The components moved untouched** — nine `page.tsx` files and `/admin/vehicles`, ~7,400 lines,
      byte for byte apart from one import path in `CleanupTab`. `/admin/marketing` set that precedent
      and gave the reason: *"Rewriting them in the same slice that re-arranged them would have made a
      regression impossible to attribute."* Each still fetches on mount, and only the active panel is
      mounted — which is C2's per-tab lazy fetch with no coordination at all.

      **All ten old routes still exist and forward to their tab.** Verified in a browser, every one.
      Deleting them would break every bookmark and every link in an old email; a 404 says the page is
      gone and it is not.

      **`inventory` and `import` stay routes and became buttons**, as §4 says. Both were already
      `showInRail: false` — editors you arrive at from the thing you are editing — and `inventory`
      imports three sibling modules relatively, so moving it would have been the one move in this
      slice that was not mechanical.

      **`/admin/personnel/crew-calendar` moved out of the Equipment workspace.** §4 called it
      *"evidence that the current grouping is not load-bearing"*, and it was: a crew calendar is
      about PEOPLE and it sat in the cage because that is where somebody filed it. It is in Work
      until C4 takes it into the Hours portal.

      ── **THREE GUARDS FIRED, AND ALL THREE WERE RIGHT** ──────────────────────────────────────────

      · **`api-bundle-gate`** — three `/api/admin/vehicles/*` routes became unclassified. They had
        been classified by MIRRORING `/admin/vehicles` in the page registry, and removing that nav
        row broke the mirror. The gate fails closed on unclassified, correctly. The answer is written
        out rather than invented: that page was `internalOnly` with no `requiredBundle`, so it
        already resolved to *"always-available or operator-only"* — it just no longer depends on a
        nav row a later consolidation can remove.
      · **`route-registry`** — a test asserted `equipment_manager` can reach
        `/admin/equipment/maintenance`. The invariant holds and its SAMPLE moved; re-pointed at the
        portal rather than deleted, because what is being guarded is that the role reaches the
        workspace at all.
      · **`inline-style-hex`** — ten files "got worse" and ten "improved". Investigated before
        touching the ceiling, per the standing rule, and it was a pure rename: every new count equals
        its old one, and the repository total is **2306 before and 2306 after**. Nothing was added;
        285 hexes changed path. Re-baselined, and the old paths are gone from the file.

      **The first redirect probe reported all ten FAILING.** They were all fine: `redirect()` in
      these pages resolves as a client navigation after hydration, and the probe's fixed 1,500 ms
      wait was shorter than a cold dev compile. Waiting for the destination instead of for a number
      turned ten red lines green without a line of product code changing. Eleventh time this session
      the instrument was the defect — and the same fixed-wait mistake the design walks made, in a
      different tool.

      One consequence worth recording: `/admin/equipment` no longer renders `WorkspaceLanding`, so it
      is no longer one of the five routes a W4 composition can replace. That is the right trade — it
      is a real portal now rather than a card grid — but C13 should notice that consolidating a
      workspace landing removes a composition slot.
- [x] **C4 — P3 Hours, including the role split.** Shipped 2026-08-25. Four nav rows became one, and
      this is the slice that **proves §5**.

      `/admin/hours` — a new canonical route — with tabs `my-time · approvals · time-off ·
      availability`. §4's observation was right: *"the dossiers show `/admin/my-hours` and
      `/admin/hours-approval` already call the same three APIs. They are one screen with two
      permission levels, built twice."*

      **Verified with two real accounts, same URL:**

      | | tabs | lands on | `?tab=approvals` opens |
      |---|---|---|---|
      | admin | My time · Approvals · Time off · Availability | **Approvals** | Approvals |
      | employee | My time · Time off | **My time** | **My time** |

      That table is §5's three rules in one screenshot. The employee does not see the approval queue,
      lands on their own week, and a link to a tab they may not open gives them their own timesheet
      instead — *"a default is a courtesy; it is not a permission."*

      ── **§5's FIRST RULE IS THE DANGEROUS ONE, AND IT NEARLY BIT** ───────────────────────────────

      *"A portal reachable by six roles whose tabs are gated to one is a WIDER door than six
      separately-gated pages, and it is the single most dangerous thing in this plan."*

      The four pages had four different gates: three were open (`my-hours`, `time-off`,
      `availability` — each shows you your own week) and `hours-approval` carried a **middleware role
      gate**. Merging them means the portal cannot be gated to the approvers without taking every
      employee's timesheet away, so the route is open and **the gate moved down a level rather than
      away**:

      · each tab carries the exact role list its page carried — asserted by **reading the old lists
        out of `git show HEAD:` rather than retyping them**, because retyping would only test that I
        typed the same thing twice, which is the mistake being guarded against;
      · `resolveTab` refuses to open a tab the viewer may not see, browser-verified above;
      · every time-log endpoint keeps the check it had — this slice moved components between files
        and did not touch a handler.

      The middleware guard caught the change and asked the right question — *"reachable by ANY
      authenticated user and nobody has said whether that is intended"* — and the answer is written
      into `INTENTIONALLY_OPEN` with all of the above, rather than silently added to a list.

      §5's second rule comes free and not by luck: `/admin/time-off` was **ungated**, so the union of
      the four role lists is everybody, and every viewer has at least that tab. The registry row is
      therefore ungated too — which is the honest expression of the union rather than a widening. A
      row gated tighter would have removed access while claiming to merge.

      ── **NINE TEST FILES WENT RED, AND THAT WAS THE SLICE WORKING** ─────────────────────────────

      Four were samples that moved with the code — the nav label, the drawer parity list, and two
      hours tests reading the approvals file by path. Five were findings:

      · **`notify-links-audit`** — the real one. **Thirteen files** sent notifications and widget
        footers to `/admin/my-hours` and friends. They all still WORK, but each is a link somebody
        taps from a phone notification or an email, where a redirect costs a navigation and a flicker
        on the slowest connection any of them is used on. All repointed at the tab.
      · **`api-bundle-gate`** — `/api/admin/time-off` and `/api/admin/availability` lost the page
        mirror they were classified through. **Second consolidation in a row to break a mirror**, so
        both answers are now written out explicitly rather than inherited from a nav row.
      · **`employee-can-reach-their-own-things`** — *"My Hours is no longer in the nav at all."* The
        invariant holds and its sample moved; re-checked rather than assumed, since the portal is
        ungated and defaults an `employee` to `my-time`.
      · **`widget-links`** — the tab pattern was `[a-z]+`, written when the hub's tabs were single
        words. Portal ids are kebab-case everywhere. **A pattern that predates the convention it
        checks is a fossil, not a rule** — widened.
      · **`widget-and-page-links-resolve`** — banned every query string, for a right reason: *"a 'Go
        to my hours →' whose meaning lives in a query is one page pretending to be another"*, written
        about `/admin/me?tab=…` because **the Hub ignores `tab`**. A portal built on `usePortalTabs`
        does not. The rule was broader than its concern, so it is narrowed to *"a query string the
        destination does not read"* — checked by looking for `usePortalTabs` in the destination's
        page. Still catches the Hub; no longer forces widget footers back onto redirect stubs.

      And the inline-hex ratchet fired again for the same reason as C3 — two files moved, total
      **2306 before and 2306 after**. Investigated before re-baselining, as the standing rule says.

      **What this deliberately does NOT do:** merge `my-time` and `approvals` into one screen with
      conditional bits. They are the same data at two permission levels, and §5 says to collapse the
      pair into one portal with a role-chosen default — not to interleave two large components and
      hope the conditionals are right. The merge that matters is the one in the sidebar.
- [x] **C5 — P2 Receipts, tabs only.** Shipped 2026-08-25 as **P2.1**. Four nav rows became one.
      **Per-item approval is P2.2 and remains blocked** on the owner's accounting answer — see below.

      `/admin/receipts` with tabs `queue · cards · rebilled · mileage`, browser-verified:

      | tab | renders |
      |---|---|
      | queue | the approval queue, 3,366 chars, its own status filters intact |
      | cards | the card registry |
      | rebilled | pass-through costs |
      | mileage | the trip log |

      **Two kinds of tab, and why they do not collide.** The queue has its own strip — pending /
      approved / rejected / exported / needs review — and it stays inside the queue, on `useState`.
      Those are FILTERS of one list; the portal's are different subjects. Nothing collides because
      the filter was never in the URL, so `?tab=` was free. Verified rather than assumed: the queue's
      filters still read *"Pending 23 | Approved 0 | Rejected 0 | Exported 0 | Needs review 21"*
      under the portal strip. **The first portal to hit a filter that also wants the query string
      will have to name one of them, and it will not be this one.**

      **The role split is narrower here than in C4 and still had to be checked.** `/admin/cards` and
      `/admin/pass-through` were **admin-only**; the queue and mileage were admin / developer /
      tech_support. The union is the queue's own list, so the registry row is unchanged and the two
      admin-only tabs carry their own gate — a developer opening this portal sees two tabs, not four.

      **`/admin/receipts/new` keeps its own registry row**, and that is the one real judgement in the
      slice. It is the only surface here **anyone at the firm can reach** — a crew member holding a
      fuel receipt is not an admin — so folding it into an admin-gated portal would have taken it
      away from the people who file most of them. It is the `+ Capture` button AND a nav row.

      ── **THE MIRROR BROKE FOR THE THIRD TIME, AND THAT IS NOW A PATTERN** ────────────────────────

      `api-bundle-gate` lost `/api/admin/mileage`, exactly as it lost `vehicles` in C3 and `time-off`
      + `availability` in C4. **A group classified BY MIRRORING a nav row loses its classification
      the moment that row is merged away**, and the gate fails closed — correctly, and noisily, every
      single time. Named in the file now, because every remaining portal in §8 will do it again.

      ── **AND A TEST I WROTE YESTERDAY WAS TIME-BOMBED** ─────────────────────────────────────────

      `hours-portal.test.ts` read the pre-C4 role lists from `git show HEAD:` — which was right for
      exactly one commit and wrong the next morning. **A test that reads "the previous version" from
      a moving reference is not pinned to anything**: it silently starts comparing the code against
      itself and passes forever. Pinned to `3aef7ec5f` now, and an unreachable commit makes the first
      assertion fail loudly rather than letting four comparisons pass against `undefined`.

      Worth recording as its own lesson, separate from the slice: the clever version of that test —
      read the old values from git rather than retyping them — was the right instinct and the wrong
      reference. C6 onwards should pin the SHA from the start.

      Six other files went red and were samples that moved: the Money-workspace list, the registry
      label, two finance tests reading the queue by path, and the mileage form. The inline-hex
      ratchet fired for the third consecutive slice — **2306 before and 2306 after**, investigated
      before re-baselining.

      ── **WHAT IS STILL OPEN, AND IT IS THE HALF THE OWNER NAMED FIRST** ─────────────────────────

      *"…and approving and denying receipts or **specific items on receipts**."* P2.2a–d are
      untouched: the per-line editor exists and is mounted only in the slideshow, there is no
      per-line tax treatment, `approvedTotal()`/`deductibleTotal()` do not exist, and `/admin/finances`
      still totals whole approved receipts. Shipping the tabs did **not** ship per-item approval, and
      the portal's own header says so where somebody will read it.
- [x] **C6 — P1 Pay & Payouts.** Shipped 2026-08-25, all three sub-items. **Ten nav rows became one**
      — the owner's headline example, and the portal with the most at stake: every tab decides money.

      `/admin/pay` with ten tabs: `my-pay · payroll · ledger · payout-runs · withdrawals · history ·
      rates · rewards · rewards-admin · how-rewards-work`. All ten browser-verified rendering live
      data; all ten old routes verified forwarding to their tab.

      **§5 proven where it matters most, with two real accounts on one URL:**

      | | tabs | lands on | `?tab=payroll` opens |
      |---|---|---|---|
      | admin | **10** | Payroll | Payroll |
      | employee | **1** — My pay | My pay | **My pay** |

      An employee sees their own pay and nothing else. Nine money screens are invisible to them, and
      a link to the payroll run gives them their own payslip.

      ── **THE ROUTE-SCOPED STYLESHEET TRAP, WALKED INTO AND CLOSED** ──────────────────────────────

      `app/admin/payroll/layout.tsx` and `app/admin/rewards/layout.tsx` exist for **one reason each**:
      to import `AdminPayroll.css` and `AdminRewards.css`. A Next layout loads its stylesheet for its
      route TREE and nowhere else — the trap this repository has been caught by twice.

      Moving those bodies into tabs without their stylesheets would have rendered two tabs unstyled
      with **nothing failing**: no error, no red test, just a payroll screen that looked broken. The
      portal imports both, and it is verified rather than assumed — a `.payroll-overview` rule is
      present in the document, and `rewards__hero` computes to `radius=14px pad=32px` rather than to
      browser defaults.

      ── **AND WHAT DELIBERATELY DID NOT BECOME A TAB** ───────────────────────────────────────────

      **`/admin/pay-progression` is `parked: true`.** The plan's table maps it to tab `rates`, and
      doing that would have **silently un-parked it**: `accessibleRoutes` hides a parked route from
      everybody *including admins* — *"a parked feature is deliberately out of circulation"* — and a
      tab has no such flag. 869 lines of a deliberately-withdrawn feature would have come back in
      front of people as a side effect of a navigation change. It stays a parked route, untouched.

      `/admin/payouts/tax-report` is **P7's**, not P1's. `ad-hoc` and `search` are buttons, as the
      plan says — §4 calls search *"the clearest case in the whole document: a 201-line page whose
      entire job is to search a table another page already lists"*, and taking away its sidebar row
      is the slice.

      **One row went back in after being dropped.** `/admin/payouts/runs` is the parent of
      `/admin/payouts/runs/[id]` and `.../[id]/dispatch` — **records**, which §4 says are not touched
      — and the cron that prepares a batch links straight at one. With no ancestor in the registry
      that record has no breadcrumb and the notification audit cannot resolve the link. It is back
      as `showInRail: false`: not a nav row, just the parent of a record.

      ── **SEVENTEEN TEST FILES WENT RED. TWO WERE FINDINGS THAT MATTERED.** ──────────────────────

      · **`bundle-gate`** — `bundleForRoute('/admin/payroll')` fell to `null`. **This is the packaging
        gate**, and the question is whether a paid feature was given away. It was not: the portal
        resolves to `office`, the same bundle the money workspace always defaulted to, so a firm that
        could reach payroll yesterday reaches it today and one that could not, still cannot.
      · **`api-bundle-gate`** — twelve `/api/admin/payroll/*` and `/api/admin/rewards/*` routes lost
        their classification. **The fourth mirror break in four slices**, and the first where the
        answer was a real bundle rather than `null`: they carried `office` by mirroring pages in the
        `money` workspace. Unclassified fails CLOSED so nothing leaked — but that is luck about which
        direction the file errs, not a reason to leave it. Written out at the value they had.

      Everything else was a sample that moved: the Money-workspace list, the `paycheck → Payroll`
      ranker, two drawer parity lists, and **thirteen source files** whose notification and widget
      links pointed at the absorbed routes — all repointed, because each is tapped from a phone where
      a redirect costs a navigation.

      **A deliberate narrowing, recorded rather than smuggled.** `/admin/my-pay` was
      `INTENTIONALLY_OPEN` in middleware; `/admin/pay` is not. A `guest` who typed the old URL used
      to reach it and is now bounced. That is right: the registry never offered that page to a guest,
      so the only way in was typing the URL — and an ungated portal would have shown them a strip
      with **zero visible tabs** and the message *"every part of Pay is switched off for this
      company"*, which is a lie about a permission problem.

      The inline-hex ratchet fired for the fourth consecutive slice — **2306 before, 2306 after**.

- [x] **P1.1** — the shell, the tab set, `?tab=` in the URL, bodies moved untouched. Shipped with C6.
- [x] **P1.2** — redirect stubs for all ten absorbed routes. Shipped with C6, each verified in a browser.
- [x] **P1.3** — the role views (§5). Shipped with C6; see the two-account table above.
- [x] **C7 — P4 Jobs & Projects.** Shipped 2026-08-25. **Seven nav rows became one** — three absorbed
      as tabs, three demoted to buttons. `/admin/calendar` is **deliberately not among them**; see
      below, because the reason is the most interesting thing in this slice.

      `/admin/jobs` with tabs `jobs · projects · field-data · activity`, all browser-verified, plus
      `New job`, `Import` and `New project` as buttons that kept their routes and their admin gates.

      **The roles needed no union and no middleware change** — all three absorbed pages carried
      exactly `['admin','developer','tech_support']`, the same list the portal already had. The first
      portal in this plan where the four tabs simply agree about who may see them.

      ── **WHY `/admin/calendar` IS NOT A TAB** ───────────────────────────────────────────────────

      §4's table lists it. Absorbing it needed one of two things and §5's first rule refuses both:

      · **`/admin/calendar` has no `roles`.** Every signed-in person sees it in their nav today. This
        portal sits at `/admin/jobs`, whose middleware gate is
        `['admin','developer','field_crew','researcher','tech_support']`. Absorbing the calendar under
        that gate **takes it away from everybody else** — the narrowing C4's note called *"the same
        sin as widening it, and harder to notice because nobody complains about access they never
        had."*
      · **Widening `/admin/jobs` is worse.** Middleware matches by PREFIX, and `/admin/jobs` is the
        prefix of `/admin/jobs/[id]` and `/admin/jobs/[id]/field` — **job records**, which §4 says are
        not touched. It would open a customer's job record to every role in the product as a side
        effect of a navigation change.

      There is no third option: middleware cannot express *"this path but not its dynamic children"*.
      So the calendar keeps its route and its reach, and **C13 is the right place to decide where it
      belongs** — that slice revisits the workspaces with the whole picture, which is exactly the
      information this decision needs and does not have yet.

      ── **THE STYLESHEET TRAP, AND THIS TIME THE CODEBASE HAD ALREADY WRITTEN IT DOWN** ──────────

      `app/admin/projects/layout.tsx` carries a note from the last time somebody hit it:

      > *"The projects pages were first written against `jobs-page__*`, which is declared in
      > AdminJobs.css — a stylesheet imported by app/admin/jobs/layout.tsx and therefore scoped to the
      > /admin/jobs route tree. Nothing under /admin/projects ever loaded it, so every header, button
      > and title rendered as raw browser default **while reporting zero horizontal overflow**."*

      Moving projects into this portal reverses the direction and re-creates the identical failure.
      The portal imports `AdminProjects.css`, and it is **verified against the source rather than
      eyeballed**: `.proj-page` computes to `margin: 0 0 24px`, and the stylesheet says
      `.proj-page { margin-bottom: 1.5rem; }`. Same number, so the sheet is loaded and applying.

      `AdminJobs.css` comes free — the portal lives inside `app/admin/jobs/`, whose layout still
      loads it for the job records.

      ── **AND ONE INVARIANT THAT HAD TO MOVE RATHER THAN BE DROPPED** ────────────────────────────

      §2.6 of the platform audit found **five places answering "what happened and who did it"**, and
      its fix was to make each one say which question it answers. `/admin/timeline`'s registry
      description carried the sentence *"a working feed, not a compliance record: the Audit Log is
      that"* — and a registry description dies with the row.

      It is the `activity` tab's hint now, which is where a person actually reads it: above the feed
      rather than in a menu tooltip. The test moved with it rather than being deleted, because a
      consolidation that quietly lost that sentence would put the product back to four logs and no
      map. The audit page's cross-link points at the tab too.

      Eight test files went red; all were samples that moved, plus **two API groups** —
      `/api/admin/timeline` and `/api/admin/field-data` — losing their page mirror. **Fifth mirror
      break in five slices.** Both carried `office` via the `work` workspace and are written out at
      that value. The mechanism is not going to stop being true, and the note in the file now says so.

      *(One of my own repairs was wrong first: the Work-bundle sample swapped `/admin/timeline` for
      `/admin/field-data`, which C7 absorbed in the same breath. Two absent routes is not an
      improvement on one. It asserts `/admin/calendar` now — a Work route this slice deliberately
      kept, so it is a real third case.)*
- [x] **C8 — P7 Books & Tax + P8 Customer Money.** Shipped 2026-08-25. **Nine nav rows became two.**

      | portal | tabs | absorbed |
      |---|---|---|
      | `/admin/finances` → **Books & Tax** | overview · job profitability · reconcile · payroll tax | 3 rows |
      | `/admin/invoicing` → **Customer Money** | invoices · collections · incoming · categories | 3 rows + 1 button |

      All eight tabs browser-verified with live data; all six redirects verified landing.

      **Both labels had to change, and §2.2 is the reason.** "Job Profitability" was the whole page
      and is one tab of four now; "Customer Invoices" widened the same way. Leaving either would have
      been §2.2's own defect re-made by a slice that cites §2.2 — *a name that describes a fraction of
      what the row opens*. The three money words still cannot be mistaken for each other, which is
      what the test guards: **Software Subscription · Customer Money · Books & Tax**.

      ── **THE ROLE MOVES, IN BOTH DIRECTIONS** ───────────────────────────────────────────────────

      · **A widening, declared.** `/admin/payouts/tax-report` was admin-only under the `/admin/payouts`
        prefix; as a tab its ROUTE gate becomes `/admin/finances`'s three roles. The tab carries
        `roles: ['admin']`, `resolveTab` will not open it for anyone else, and the report's endpoint
        is untouched. What a developer gains is a portal whose tax tab they cannot open.
      · **A narrowing refused.** `/admin/receivables` was `['admin','developer']` — no `tech_support` —
        against the other three rows' three roles. Rounding it up to the portal's list would have
        handed somebody a list of what every customer owes as a side effect of a navigation change
        nobody would review for that. The `collections` tab keeps the narrower list.

      ── **THE ORPHAN GUARD FIRED, AND IT WAS THE RIGHT ONE TO FIRE** ─────────────────────────────

      `orphan-routes` asserts the **three go-live dashboards are on the RAIL, not merely registered** —
      they exist because three pages were BUILT to close go-live gaps and nothing linked to them, the
      sharpest version of *authored but not wired*. All three are tabs now.

      A tab of a railed portal is **more** findable than a rail row, not less: you reach it by opening
      the thing it belongs to. So the assertion moved one level up — the portal is on the rail, its
      keywords carry `overview`, `reconcile` and `payroll tax`, and each old route still resolves as a
      redirect rather than a 404.

      ── **AND A REAL KEYWORD LOSS, CAUGHT BY A TEST ABOUT PROPOSALS** ────────────────────────────

      `proposals.test.ts` asserts the aging report is findable *by the jargon* — `keywords: ['ar',
      'aging'…]`. The Customer Money portal's first keyword list **did not carry `ar` or `aging`**, so
      somebody typing either would have got nothing, which reads as the feature having been deleted.
      Every absorbed row's keywords are on the portal now, including `venmo`, `pledge` and `past due`.

      That is the second time this plan's keyword-carrying has been load-bearing rather than tidy, and
      the first time a test in an unrelated area caught it.

      ── **FOUR BACK-LINKS THAT BECAME LINKS TO THEMSELVES** ──────────────────────────────────────

      Three absorbed bodies carried *"← Finances"* / *"← Back to invoicing"* headers. Inside a tab OF
      that portal, those point at the page you are standing on — **a no-op navigation that reads as
      broken**. Removed; the tab strip is the way back.

      The fourth, *"← Payouts"* on the tax report, is a genuine cross-link to a DIFFERENT portal, so
      it is kept and repointed at `/admin/pay?tab=payout-runs` rather than left to bounce through
      C6's redirect.

      **This is a new defect class, not a one-off.** Every portal from here should check the absorbed
      bodies for back-links to their old parent — the merge turns them into self-links silently, and
      nothing fails.

      The API mirror broke for the **sixth time in six slices** (`/api/admin/payments/*`), carried
      across at `office`. The inline-hex ratchet fired for the fifth — **2306 before, 2306 after**.
- [x] **C9 — P10 People** + **P11 Messages** (9 → 2). **DONE 2026-08-25.**

      `/admin/people` gains five tabs beside its directory — Employees, Accounts, Invites, Roles,
      Requests — and `/admin/messages` gains Directory, Email and Settings beside its Inbox. Nine
      registry rows became two; three editors (`employees/manage`, `messages/new`, `email/new`) kept
      their routes and became buttons on the tabs they belong to.

      **§4's warning about the two nouns is in the tab labels.** `/admin/employees` is a person who
      works here and `/admin/users` is a login; they are **Employees** and **Accounts**, and each
      hint says which is which in its first clause, because a tab strip is read at a glance.

      **§5, on the product's most sensitive surface.** `/admin/people` is ungated and cannot become
      gated — middleware's own note says a gate here "would remove a feature rather than protect
      one" — and `role-requests` is open for a stronger reason still: asking for a role cannot
      require the role. So every administrative tab carries its page's exact list, and the
      replacement was **checked rather than asserted**: `/api/admin/users` calls `isAdmin` on GET and
      POST, `/api/admin/roles/custom` answers 403 to a non-admin, `/api/admin/invites` scopes by
      `resolveAdminOrg`. Two signed-in accounts on one URL confirmed it: an `employee` is offered two
      tabs of six, and `?tab=accounts` lands them on Directory rather than on a panel they may not
      have. One narrowing is recorded in the Messages portal's header — `/admin/email/*` had **no**
      middleware entry at all, so as a tab it is narrower at the door than it was, of a path the nav
      never offered.

      **The bug the suite could not see.** `RolesTab` arrived as an async **server** page — `auth()`,
      a redirect, a direct `supabaseAdmin` read — and the portal is a client component, so importing
      it put `@/lib/auth` and `node:async_hooks` into the browser bundle. 26,194 tests were green and
      `tsc` was clean; **the page simply did not load**, and only a browser said so. The read moved
      to `GET /api/admin/roles/custom`, which already answered 401 and 403 — the same two refusals
      the redirect made, made by the server instead. The redirect was the third of three gates and
      the weakest of them: a redirect is a suggestion to a browser and a 403 is an answer. Every
      other absorbed tab across C3–C9 was checked afterwards; this was the only one.

      **The C8 back-link class recurred, and one variant is new.** Contacts and Settings both linked
      "← Back to Messages" from inside Messages. `EmailTab` carried a third shape: a **back arrow on
      a forward link** (`← New Email` → the composer), now duplicated by the portal's own Compose
      button. The duplicate went rather than the arrow — two controls for one action is how one of
      them ends up stale.

      **A dead parameter the merge surfaced.** `app/api/admin/learn/credits/route.ts` notified with
      `/admin/employees?manage=<email>`, and **nothing has ever read `?manage=`** — the employees
      page reads no query parameter; it is `/admin/employees/manage` that reads `?email=`. That
      notification has been landing on a list rather than on the person it is about for as long as it
      has existed. The link audit could not resolve the route any more, and that is what made
      somebody look at the parameter. Repointed at the editor.

      The API mirror broke for the **seventh time in seven slices** (`/api/admin/role-requests`).
      The inline-hex ratchet fired for the sixth — **2306 before, 2306 after**, a pure rename. All
      eight redirect stubs verified signed-in, each landing on its own tab. `npm run build` clean.
- [x] **C10 — P6 Growth** (1 → 0 new links; leads into marketing). **DONE 2026-08-25.**

      `/admin/leads` is the `leads` tab of `/admin/marketing`, second in the strip so it reads in the
      funnel's order. `/admin/leads/[id]` stays a record, as §8 said. The portal is **Growth** in the
      nav now — it holds the lead queue, so "Advertising" described four of its five tabs; both words
      are in the keywords, so the old name still finds it.

      **§5's arithmetic came out backwards here, and the answer was to fix the door.** Every slice
      before this asked whether the portal opened wider than the pages it absorbed. Here the absorbed
      page had the wider door: middleware let `admin`, `developer` and `tech_support` into
      `/admin/leads`, and the nav offered it to all three, while `/admin/marketing` has always been
      `admin` alone. So the plan's move looked like a narrowing — and checking rather than assuming
      is what showed it was not: **all nine `/api/admin/leads/*` endpoints call `isAdmin`, which is
      `admin` alone.** A `developer` who followed that nav link got the page and a 403 from every
      fetch on it. The door has been wider than the boundary for as long as both have existed, and
      what the two extra roles were offered is an empty board. §5.1 says the boundary is the
      refusal; moving it is a product decision about who may see leads, so the door came to the
      boundary instead: `/admin/leads` is `['admin']` in middleware. Verified with two accounts —
      admin renders and gets 200, non-admin is sent to `/admin/me` and gets 403.

      **A packaging leak this slice was about to make for the sixth time.** Absorbing a page has
      meant dropping its registry row. `bundleForRoute` resolves an unknown path by its deepest
      REGISTERED prefix, so dropping the row takes the bundle gate off everything beneath it.
      Measured across all 182 admin routes, C6–C9 had already done this five times:

      | Record route | Was | Had become |
      |---|---|---|
      | `/admin/employees/[email]` | `office` | **no gate** |
      | `/admin/leads/[id]` | `office` | (about to be) |
      | `/admin/field-data/[id]` | `office` | **no gate** |
      | `/admin/projects/[id]` + `/edit` | `office` | **no gate** |
      | `/admin/payroll/[email]` | `office` | **no gate** |

      Five record pages a firm that had not paid for the bundle could open. This is the same leak
      `bundle-gate.ts` already documents from 2026-08-01 — where the research index was gated and
      every individual research project was not — arriving by a different road. The fix is that an
      absorbed parent with live children stays **registered** and goes `showInRail: false`, which
      hides it from the rail, the flyout and the workspace landing and is all the consolidation ever
      needed. C9's own `/admin/employees/manage` was already doing this; the rule was just never
      stated. All five restored and re-measured back to `office`.

      **The rule for every remaining slice: before dropping a row, look for a dynamic child.**

      The range picker is absent on Leads as well as on uploads — the board filters by STATUS and
      reads no date range, so a period control above it would have been the honestly-absent rule
      broken by the slice that quotes it. Browser-verified: five tabs, 11 real leads on the tab,
      picker present on three and absent on two. Inline hexes **2306 before, 2306 after**.
      `npm run build` clean.
- [x] **C11 — P12 Knowledge** + **P13 Research** (13 → 2). **Split; BOTH DONE 2026-08-25.**
      Thirteen routes across two portals was not one slice. C11a is Knowledge; C11b is Research.

      **C11a — P12 Knowledge (9 → 0 new links). DONE.** `/admin/learn` has ten tabs: the hub's card
      grid plus roadmap, modules, knowledge base, references, flashcards, card bank, practice, quiz
      history and search. Ordered the way studying goes rather than the way the files were written.
      Six rail links become none; nine routes forward.

      **What deliberately did not come, re-read rather than assumed.** `exam-prep` and its four
      children stay separate — an exam sitting is a timed session, and a tab strip above it is an
      invitation to leave mid-question with no way to say what that did to the clock. `learn/manage`
      and its two children stay separate: authoring is a different job from studying, done by a
      different role. `students` is not on §8's list and belongs with `manage` for the same reason —
      a teacher looking at other people, not a learner looking at themselves.

      **§5 cost nothing here, and that is worth writing down rather than skipping.** All nine
      absorbed rows were ungated, and middleware gates only `/admin/learn/manage` and
      `/admin/learn/students`, neither of which is here. The portal opens exactly as wide as what it
      holds. No role list moved.

      **C10's rule paid for itself on its first outing.** Three of the nine — `modules`,
      `knowledge-base`, `flashcards` — have record children: a lesson, an article, a deck. Their rows
      stay registered with `showInRail: false`, so `/admin/learn/modules/[id]/[lessonId]` and its
      siblings still resolve to the `academy` bundle. The other six have nothing beneath them and
      their rows are gone. Measured after, not assumed: all nine record paths still answer `academy`.

      **The back-link class, at its largest yet: nine self-links in eight of the ten bodies.** Every
      absorbed page carried "← Back to Learning Hub", and every one of them now points at the portal
      it renders inside. Practice carried a second on its results screen. A tenth control was a
      different shape and worth separating: References links to `/admin/learn/exam-prep/sit`, which
      is a real route and deliberately unabsorbed — what stopped being true there is the ARROW, since
      nobody arrives from exam prep any more. Same fix as C9's "← New Email". **Three slices running
      have found this; it is not a one-off but a property of absorbing a page that knew its parent.**

      **The migration receipt needed a decision, not an edit.**
      `__tests__/admin/sidebar-registry-parity.test.ts` failed twice and both readings were correct:
      three hrefs stopped being registered, and three were "quietly demoted to palette-only" — which
      is precisely what C10's rule requires them to be. Answered the way C4, C6 and C8 answered it:
      the drawer offers one row and all six are one click from it, which is where they were.

      Browser-verified: ten tabs render, nine redirects land on their own tab, the four unabsorbed
      routes are untouched, no page errors. Inline hexes **2306 before, 2306 after**. `npm run build`
      clean.

- [x] **C11b-0 — the research read boundary.** **DONE 2026-08-25.** Not in the plan; found while
      writing C11b and shipped ahead of it, because C11b's whole shape depended on the answer.

      C11b was going to make six research pages into tabs, each carrying its registry row's role
      list. §5.1 says a tab list is a courtesy and the API is the boundary, so the lists were worth
      measuring before writing. Against a running server, with a plain `employee` token holding no
      research role of any kind:

      | Endpoint | plain `employee` |
      |---|---|
      | `GET /api/admin/research/coverage` | **200** |
      | `GET /api/admin/research/library` | **200** |
      | `GET /api/admin/research/pipeline` | **200** |
      | `GET /api/admin/research/billing` | **200** |
      | `GET /api/admin/research/sites` | **200** |
      | `GET /api/admin/research/self-heal/proposals` | 403 |

      **Five of six answered anybody who was signed in.** They call `auth()` and stop there.

      The cause is structural rather than careless: `middleware.ts`'s `ROUTE_ROLES` has only ever run
      on PAGE paths. `/api/admin/*` goes through the bundle gate alone, and four of these routes are
      deliberately bundle-exempt because they are operator tools. So the six-role gate everyone can
      see on `/admin/research` was in front of the screen, never in front of the data.

      **Why fixing it is not a product decision, when C10 said the opposite.** C10 met the mirror
      image — a door wider than its boundary — and left the boundary alone, because who may see leads
      is the owner's call. The asymmetry: there the extra roles reached a page that refused them
      everything, so narrowing the door took nothing from anybody. Here the boundary is wider than
      the product's own intent, stated twice and in agreement — middleware gates the pages to six
      roles and the registry rows say the same or narrower, and a plain `employee` is in neither.
      Refusing them is the existing policy finally reaching the data.

      `lib/research/access.ts` therefore enforces the **widest** of the product's own statements —
      the page gate — rather than the narrower per-row lists, so nobody who can open a research page
      loses anything. Verified both ways against the running server: after the change all six refuse
      a plain employee, and a real `field_crew`-only account (no admin) still gets 200 from all five.

      `__tests__/research/api-access.test.ts` pins the role list to middleware's literal entry —
      that mirror has broken seven times in seven slices — and pins each route's guard.

      **And the probe was the bug, in a new way worth recording.** The test's comment-stripping
      helper reported the `sites` guard missing when it was plainly there: the guard's own comment
      contains an api path with a star in it, which the block-comment regex read as an opening
      `/*` and followed to a closing marker sixty lines below, deleting the code under test. Line
      comments have to be stripped FIRST. The same latent bug was in C9's helper and is fixed there
      too.

- [x] **C11b — P13 Research** (7 → 1). **DONE 2026-08-25.** With C11a, C11 is complete.

      `/admin/research` has seven tabs: the projects list plus coverage, library, data sources, site
      health, pipeline and billing. Six routes forward.

      **What stayed, and the one that had a rule of its own.** `/admin/research/[projectId]` (3,654
      lines) is a record. `/admin/cad` is its own shell. `/admin/research/testing` is a lab — and it
      also has its **own middleware entry, three roles instead of six, listed before
      `/admin/research` so it wins the prefix match.** Absorbing it would have widened it from three
      roles to six, which §5 forbids outright. §8 wanted it separate anyway; this is the second
      reason, and the stronger one.

      **§5's door did not move at all.** All six absorbed pages already sat behind the same
      middleware prefix — none had a narrower entry — so their narrower registry rows expressed nav
      visibility, never a gate. **C11b-0 is what makes carrying those rows onto tabs worth anything:**
      before it, five of the six endpoints behind these screens answered any signed-in account. A tab
      list is now a courtesy over a boundary that holds rather than a courtesy over nothing.

      **A packaging consequence worth knowing before a portal causes it by accident.**
      `bundleForRoute` reads a PATHNAME, so a tab cannot carry its own bundle — everything here
      resolves as `/admin/research`, which is `recon`. Pipeline and billing were deliberately
      bundle-EXEMPT in `ROUTE_BUNDLE_OVERRIDES` ("operator-only, no customer bundle gate") and are
      now inside a gated path. Safe for the audience they have — `middleware.ts` skips the bundle
      check entirely for `isOperator` — and a non-operator without Recon is also not offered the tab
      and is refused by the API since C11b-0. **Absorbing a bundle-exempt route into a bundled portal
      always costs this.** Recorded in the portal's header.

      **C10's rule, checked and found not to apply.** Not one of the six has a dynamic child, so none
      needed a kept row. The record in this tree is `/admin/research/[projectId]`, whose parent is the
      portal itself. Checking is the rule; the answer being "no" is a result, not a skip.

      **The C9 server-component trap, avoided rather than hit.** `coverage` was a genuine server
      component. Its own header says "pure rendering of compile-time data; no client state, no
      network", `clerk-registry.ts` imports nothing, and both panels it mounts were already
      `use client` — so it became a client component honestly, with no endpoint needed. Its
      `metadata` export went with the page file: a module that is not a route cannot set a title, and
      leaving it would be a line that looks load-bearing and is not. `sites` was a four-line server
      wrapper around `SitesClient`; the wrapper WAS the page, so the tab is the client component.

      **The back-link class again — five of seven bodies.** Fourth slice running.

      **And the ratchet had been lying, in a way only a file move could expose.** The scan reported
      2306 → **2317** and named `CoverageTab.tsx` as "0 → 11". Nothing had regressed:
      `scan-inline-style-hex.ts` had `'coverage'` in `SKIP_DIRS`, meant for the test-coverage OUTPUT
      directory — and `scanRepo` only ever walks `app` and `lib`, so **that entry could never have
      matched the thing it was for.** All it did was exclude `app/admin/research/coverage/`, a
      product directory, from the ratchet entirely. Measured: the file held 12 hexes before the move
      and holds 11 after, so the code got one BETTER while the number went up eleven. The baseline is
      2317 now because that is what the codebase has always had. The ratchet's blind spot has been
      bigger than its count before; this is the same shape, keyed on a directory NAME rather than a
      path.

      Browser-verified: seven tabs render, six redirects land on their own tab, `testing` untouched,
      no page errors and no self-links left. `npm run build` clean.
- [x] **C12 — P14 Company** + **P15 System** (8 → 2). **Split; BOTH DONE 2026-08-25 — but P14 is
      two of its five, not five. C12a is System, C12b is Company; the reasons are under each.**

      **C12a — P15 System (3 → 1). DONE.** `/admin/support` has three tabs: Support, Errors, Audit
      log. `/admin/support/new` keeps its route and is the New-ticket button, as §8 asks.
      `/admin/support/tickets/[id]` is a record and stays.

      **§5 goes the OTHER way here.** `/admin/error-log` has its own middleware entry — admin,
      developer, tech_support — and `/admin/support` has none at all, so the portal is a **wider**
      door than a page it absorbs. §5 allows that only when the boundary is elsewhere and holds, so
      it was measured, and the measurement is more interesting than a 403 would have been:

      | Endpoint | plain `employee` | what actually protects it |
      |---|---|---|
      | `GET /api/admin/errors` | 200 | filters rows to `user_email` unless an admin asks for the admin view |
      | `GET /api/admin/audit` | 200 | returns `{ rows: [] }` unless you are an admin OF THE ORG |

      **Both protect with a row filter, not a status code** — a legitimate pattern, and one that a
      probe reading only status codes reports as a hole. It is not one; C11b-0 was, and the
      difference is the handler body, not the response line. Non-admins have always been allowed to
      read their own error reports; what they could not do is reach the page that draws them. The tab
      list still carries both rows' three roles, because being offered an audit tab that can only
      ever be empty is its own small lie. Browser-verified: a plain employee is offered one tab and
      `?tab=audit` puts them back on Support.

      **The IA test earned its keep.** §2.6 says five surfaces answer "what happened and who did it"
      and each must say WHICH question it answers. Those sentences lived in the registry descriptions
      of the two rows this slice deleted, and the portal's first draft summarised them into "what has
      gone wrong in the app" — putting the product back to four logs and no map. Nothing else in the
      repo would have noticed. The sentences are now the tab hints, verbatim, which is where C7 put
      the Activity feed's and is better placed anyway: read above the log, not in a menu tooltip.

      **A syntax error survived 26,209 tests.** An apostrophe in `the Jobs portal's Activity feed`
      closed a single-quoted hint early. `tsc` would have caught it; the suite did not, because every
      assertion on these files reads them as TEXT. Only loading the page did. Swept all 180 admin
      page files afterwards for the same shape — every hint/label/description literal closes cleanly.
      **Run `tsc` after the last edit, not before it.**

- [x] **C12b — P14 Company** (3 → 1). **DONE 2026-08-25. Two of §8's five, deliberately.**

      `/admin/settings` absorbs `org-settings` (tab `org-profile`) and `orgs` (tab `orgs`) — the two
      that genuinely are the COMPANY's settings, both already admin-gated. Nine tabs now, and its own
      sections became URL-driven tabs beside them.

      **The other three are not here and must not be.** `announcements`, `notifications` and
      `me/privacy` are ungated and personal: the current user's alerts, the current user's privacy,
      and the release archive the Hub's WhatsNewBanner sends every employee to with "Read full
      notes →". `/admin/settings` is middleware-gated to `['admin']`, so absorbing any of them would
      DELETE it for everyone who is not an admin — the banner included. §8 grouped by what sounds
      like settings rather than by whose settings. They belong with `/admin/me`; recorded for C13,
      because moving a page between workspaces is a decision about the product, not a tidy-up.

      **The page has been rendering unstyled, and nothing would ever have said so.** Every class in
      `settings/page.tsx` — `.jobs-page`, `.job-detail__tabs`, `.job-detail__content`,
      `.job-form__grid`, `.job-form__submit` — is defined in `AdminJobs.css`, which
      `app/admin/jobs/layout.tsx` imports and which therefore loads on the JOBS tree. This page never
      imported it. Measured in a browser, before and after the one-line fix:

      | | before | after |
      |---|---|---|
      | `.job-detail__tabs` display | `block` | `flex` |
      | `.job-detail__tabs` border-bottom | `0px` | `2px` |
      | `.job-detail__tab` display / padding | `inline-block` / `0` | `flex` / `8px` |
      | `.job-detail__tab--active` background | none | brand navy |
      | `.job-form__grid` display | `block` | `grid` |

      A tab strip that was a column of bare words, a form that was one column, and a submit button
      that looked like a link — **on the page the owner asked to hold the page-visibility control.**
      This is the route-scoped-CSS trap in its other direction: not a fix written in the wrong sheet,
      but a page written against a sheet it does not load. The import restores what the markup always
      assumed. Unpicking the coupling — this page has no business wearing `.jobs-page` — is real work
      and belongs in C14, not in the slice that found it.

      **The tabs are URL state now.** They were `useState`, which is why the two redirects could not
      have worked: forwarding to `?tab=org-profile` would have landed on General. Nine tabs, both
      redirects and the restored chrome all browser-verified, no page errors.

- [x] **C12c — P17 Page Designer** (4 → 1, +2 kept). **DONE 2026-08-25.**

      `/admin/design` has four tabs: Pages, Compare, Dossiers, Site versions. Three routes forward.

      **§8's stated reason for this slice is not true, and it is recorded rather than repeated.**
      §8 says *"six sidebar links for one internal tool is exactly the complaint being answered."*
      Measured before building on it: **the rail showed ONE.** Five of the six rows were already
      `showInRail: false`. §8 also implies the boards are hard to move between; checked, and every
      one of them already carried a back-link to the hub.

      The slice is still worth doing on a smaller, true reason: the Studio was the only surface in
      this plan that made you go back to a hub between its boards, and four tabs is one click where
      there were two, in the shape a person has now learned on nine other pages. §8's other argument
      survives intact and is why the premise being wrong is not used as a way out: *"the fact that
      the tool is mine to maintain is not a reason to exempt it from the rule in §3."*

      **Two of the five keep their routes, structurally rather than by preference.**
      `design/serve` renders a design AT REAL SIZE with no chrome — that is the whole point of it,
      and a tab strip above a design pretending to be a page would make the thing it exists to show
      untrue (§8's own exam-sitting reasoning). `design/conformance` is a server component that reads
      `conformance.generated.json` with `node:fs` at request time; as a tab it would need either
      `node:fs` in the browser bundle — the exact trap C9 hit — or the numbers frozen into the build.
      It is offered as a toolbar link from every tab instead, which is more than it had.

      **A deep link I broke and caught.** Three of the four wrappers were `return <Board />` and the
      wrapper WAS the page. The fourth was not: `dossiers/page.tsx` read `searchParams.route` and
      passed it as `initialRoute`, because — its own header — *"the link that brings most people here
      is the one in the editor's checklist panel."* Rendering `<DossierBoard />` with no prop
      compiles, typechecks, passes 26,209 tests, and silently lands every one of those links on an
      unfiltered board. The tab reads the parameter client-side, the stub forwards it rather than
      dropping it, and both were browser-verified to SELECT the route rather than merely carry it.

      Fifth slice running with self-links: three boards linked back to the portal they now render
      inside. §5 cost nothing — all six rows and the middleware prefix are `['admin', 'developer']`.

- [~] **C12c-files — P16 Files** — **WAITING ON THE OWNER** (one of the four personal-vs-company
      pages; see §13).  (`/admin/files` absorbs `/admin/my-files`). **Same shape as P14's
      three, and blocked on the same decision.**

      | | workspace | roles |
      |---|---|---|
      | `/admin/my-files` | `hub` | **ungated** |
      | `/admin/files` | `office` | admin, developer, field_crew, drawer, researcher, equipment_manager, tech_support |

      §8 argues my-files is *"the same filesystem scoped to one person — a role view, not a page"*,
      and as a rendering question that is right. As a NAVIGATION question it is not: a plain
      `employee`, a `teacher` and a `student` are in none of those seven roles, so folding my-files
      into `/admin/files` takes their own files out of their nav entirely. Personal surface, company
      page — exactly what stopped `announcements`, `notifications` and `me/privacy` in C12b.

      Doing it properly means deciding whether the company file explorer is offered to everyone with
      per-node permissions doing the work — which is a product decision about the file explorer, not
      a consolidation step. Grouped with C13 alongside P14's three, so the four personal-vs-company
      cases are decided once and together rather than four times by whoever happens to hit them.

- [x] **C12d — P19 Learning Content** (3 → 1). **DONE 2026-08-25.**

      `/admin/learn/manage` holds twelve tabs now: the ten it already had, plus Media and Question
      Builder. Two routes forward.

      **§8 asked for a portal above this page, and that was the wrong shape.** The page has read
      `?tab=` for its own ten-tab bar since it was written. A portal would have put a second strip
      above the first AND a second claim on the same parameter — and `?tab=questions` already means
      "the question LIST", while `?tab=articles` and `?tab=lessons` are live links from the article
      editor and the lesson builder. One URL would have meant two things. So the two absorbed
      surfaces are two more entries in the bar that was already there: the result §8 wanted, one
      strip instead of two, and every existing link still meaning what it meant.

      **A link that would have silently done nothing.** The Question Builder's "← Back to Questions"
      pointed at `/admin/learn/manage?tab=questions`. That was a DIFFERENT route until this slice, so
      the page remounted and re-read `?tab=` in `useState(initialTab)`. Same route now: Next soft-
      navigates, nothing remounts, the initialiser never runs again, and the link would have changed
      the URL while the screen stayed on the builder. A working link with broken behaviour, and
      nothing in a test would see it. It is a callback the page owns now — browser-verified to move
      the strip from Question Builder to Questions. `MediaTab` uses `router.back()`, which walks real
      history and is correct either way; left alone deliberately rather than converted for symmetry.

      §5 cost nothing: all three rows carried `CONTENT_MGMT_ROLES` + `tech_support`, middleware gates
      the whole `/admin/learn/manage` prefix to the same four, and both absorbed rows were already
      `showInRail: false`. C10's rule checked — neither has a dynamic child, and the records
      (`lesson-builder/[id]` at 1,978 lines, `article-editor/[id]`) hang off the row that stays.

      **One ratchet re-based with its reason.** `admin-route-gates` guards "did my regex match
      nothing?" with a floor of 40 registered gated rows, and the registry reached **exactly 40** —
      C3–C12d have folded about fifty gated rows into tabs. Lowered to 15, with a note saying to
      check the pattern before assuming rows vanished. Twelve tabs and both redirects
      browser-verified; `npm run build` clean.

- [x] **C12d-exam — P18 Exam Prep** — **DEFERRED 2026-08-25, by §8's own rule rather than by
      cost.** (`/admin/learn/exam-prep` absorbs `sit` · `sit/mock-exam` ·
      `rpls`). **§8 contradicts itself here, and only one of the three is a way in.**

      §8's own prose says: *"The exam itself still opens as its own route — a sitting is not a thing
      to put a tab bar in. What is being merged is the four ways IN to it, not the exam."* Its table
      then lists two sittings among the three:

      | Route | What it actually is |
      |---|---|
      | `exam-prep/sit` | the FS study landing — **a way in**, and absorbable |
      | `exam-prep/sit/mock-exam` | a **timed sitting**, 439 lines with a clock |
      | `exam-prep/rpls` | a `QuizRunner` that **starts a 10-question test on load** — also a sitting |

      So what remains is `exam-prep` + `sit` — a two-tab portal, which is most of a slice's cost for
      almost none of its benefit, and `sit` is the landing people reach from the hub card anyway.
      Not deferred for cost: deferred because **the plan's own rule excludes two of the three**, and
      the third is not worth a portal by itself. Worth revisiting only if C13 gives exam prep more
      ways in than it has today.
- [x] **C13a — §4's addendum, first three.** **DONE 2026-08-25.** Weather and Compliance into the
      Jobs portal; `/admin/schedule` demoted out of the rail.

      **§6 predicted 29 nav links after the merges. Measured today: 50.** The gap is §4's addendum —
      the table of nine routes the first draft left alone and which "do not survive the rule in §3 on
      a second look". It was never in the C-numbered checklist, so it never got done. C13a starts it;
      the remaining six are listed below with what each still needs.

      **A read boundary closed before the merge that needed it.** `/admin/compliance` has its own
      middleware entry — admin, developer, tech_support — and `/admin/jobs` is gated to five roles,
      so as a tab it sits behind a **wider** door. §5 allows that only when the boundary is elsewhere
      and holds, so it was measured: **`GET /api/admin/compliance` answered any signed-in account** —
      the firm's whole register of licences, insurance and instrument calibration — while every write
      on the same route already called `isAdmin`. Only the read had nothing. Same structural cause as
      C11b-0: `ROUTE_ROLES` has only ever run on page paths, so the gate everyone can see sat in
      front of the screen and never in front of the data. Closed, pinned by
      `__tests__/admin/compliance-access.test.ts`, and verified from a browser: admin 200, plain
      employee 403.

      Weather went the other way and is recorded as such: it had **no** middleware entry at all, so as
      a tab it is narrower than it was — of a path the nav never offered to the roles losing it.

      **A nav link to a redirect.** `/admin/schedule/page.tsx` is fifteen lines that
      `redirect('/admin/calendar')`, and it had a rail row in `hub` labelled "My Schedule" while
      `/admin/calendar` had one in `work` labelled "Calendar" — one destination, two names, two
      workspaces, nothing telling anyone they land in the same place. `showInRail: false`; the route
      and its middleware entry stay, because the URL is live in old links.

      **The API mirror broke for the EIGHTH time in eight slices** (`/api/admin/compliance`). Noted
      in `api-bundle-gate.ts` as a missing mechanism rather than eight mistakes: the gate classifies
      by mirroring the page registry, so deleting a page row silently unclassifies its endpoints and
      only that one test notices.

- [x] **C13b — §4's addendum, contacts and discussions.** **DONE 2026-08-25.** Both into Messages.
- [x] **C13c — §4's addendum, reports; and the company-notes boundary.** **DONE 2026-08-25.**
- [x] **C13d — §4's addendum, assignments.** **DONE 2026-08-25.** Rail links **44 → 43**.

      `/admin/assignments` is the Hours portal's `assignments` tab, second in the strip beside My
      time — the same question asked two ways: what am I meant to be doing, and what did I do.

      **This is the merge the personal-vs-company line ALLOWS, and the contrast is the useful part.**
      Four pages in this plan have been stopped at that line — `announcements`, `notifications`,
      `me/privacy`, `my-files` — because folding a personal surface into a company page gated more
      narrowly deletes it for the people it is for. Assignments is the opposite case: the API scopes
      a non-admin to `.eq('assigned_to', session.user.email)`, so you see your own work and nobody
      else's, and the Hours portal is already the `hub` workspace's personal surface. Personal into
      personal. Browser-verified with a real `field_crew` account holding no admin: it sees My time,
      **Assignments**, Time off, and `?tab=assignments` lands on it.

      ── **C10's KEEP-THE-ROW RULE IS WIDER THAN IT WAS WRITTEN** ──

      C10 said: keep the row when a **dynamic child** hangs off the route, or the child loses its
      bundle gate. `/admin/assignments` has no child — the directory held one file — so the row was
      dropped. **Four separate guards objected at once, and not one of them was about a child:**

      | Guard | Why it needed the row |
      |---|---|
      | `notify-links-audit` | assignment notifications link at this URL |
      | `api-bundle-gate` | `/api/admin/assignments` is classified by MIRRORING the row |
      | `sidebar-registry-parity` | the hand-written drawer showed it |
      | `employee-can-reach-their-own-things` | it is on the self-service list |

      So the rule is not *"a row survives its children"*. It is: **a row survives anything that still
      names the route** — a child, a notification, an API mirror, a frozen receipt. `showInRail:
      false` removes the nav entry, which was always the only part a consolidation needs. Dropping
      the row was doing more than the merge asked for, and the four guards are the reason it took
      minutes rather than months to find out.

      **This supersedes C10's wording for every remaining slice, C14 included.**

- [x] **C13e — §4's addendum, `team`.** **DONE 2026-08-25.** Rail links **43 → 42**.

      `/admin/team` is the Hours portal's `team` tab, after Approvals — the same session: who is on
      the clock right now, and whose timesheet is waiting on you. `/admin/team/[email]` is one
      person's day and keeps its own route.

      **The door came to the boundary, which is C10's move and takes nothing from anybody.** The row
      and the middleware entry both said admin, developer, tech_support. The API has never agreed:
      `GET /api/admin/team` admits `isAdmin` **or** `tech_support` and answers 401 to everyone else,
      and `/api/admin/team/[email]/today` does the same. So a `developer` has always been offered a
      page that refused them every fetch. Fourth time this plan has met a door wider than its
      boundary; same answer each time — move the door, not the boundary, because who may see the crew
      list is a product decision. Tab and middleware are both `['admin', 'tech_support']` now.
      Browser-verified: a `field_crew` account is not offered the tab, and `GET /api/admin/team`
      answers it 401.

      **A fourth open endpoint that turned out not to be one.** `/api/admin/team/status` answers any
      signed-in account, which matches the shape of the three real holes this plan has closed. It is
      not one: three Hub widgets — `daily-briefing`, `field-pulse`, `team-status` — render it on
      `/admin/me`, which everybody has. **Not every 401-only route is a hole**, and the check that
      tells them apart is who calls it, not what it returns.

- [~] **C13f — `/admin/notes` → Company** — **WAITING ON THE OWNER.**  §4's last addendum row, and the only one left. It is a
      decision because the merge would **remove something that works**, unlike every other narrowing
      in this plan:

      `/admin/settings` is middleware-gated to `['admin']`. `/admin/notes` is gated to admin,
      developer and tech_support — and since C13c its API enforces exactly those three, so all three
      have a working page today. Folding notes into Settings takes company notes from two roles that
      can use them. That is not a door coming to a boundary; it is a boundary moving.

      **Options, for the owner:** (a) leave `/admin/notes` as its own route — one rail link, and the
      only cost is that §4's table stays one row short of done; (b) absorb it and accept that only
      admins keep company notes; (c) absorb it and widen `/admin/settings` to the three, which means
      deciding whether a `developer` should see the company's settings page at all.
- [x] **C13 — the workspace decision itself.** **ANSWERED 2026-08-25 — see §12 at the end of this
      document.** §10 said *"Workspaces — DELEGATED to me. My answer is in §12"* and §12 was never
      written; it is written now.

      **The answer: keep the seven and change nothing structurally; revisit below 30 rail links.** 42 rail
      links across 7 workspaces is six per group, which is a navigable list, and §6's threshold of
      ~29 is not met — what remains to absorb will not get it there.

      §12 first proposed two fixes and then WITHDREW both: `knowledge` does have a landing
      (`/admin/learn`; my probe looked for a route named after the workspace instead of reading
      `WORKSPACES[ws].href`), and `equipment` holding one rail link is C3 succeeding rather than a
      defect. Both the claim and the correction are in §12, in that order. The trigger to revisit is
      stated so it can be checked rather than felt: **rail links below 30.**

      Measured after C3–C13e: **42 rail links across 7 workspaces**, ALL SEVEN of which have a
      registered landing page. §6 said the 7-way split stops earning its keep at ~29 links and that
      the call should be made after a few portals ship. It is not 29 yet, and C13b is what closes
      most of the remaining gap — so the honest state is **not ready to decide**, rather than decided.

      Two things are already clear and worth writing down now:

      · **`knowledge` has no landing page** while the other six do, so the workspace concept is
        already applied inconsistently.
      · **Four pages are stuck on the personal-vs-company axis**, and they are the same question four
        times: `announcements`, `notifications`, `me/privacy` (from C12b) and `my-files` (from C12c).
        Each is ungated and personal; each has a company-shaped page it "belongs" to that is gated
        more narrowly; and folding any of them in removes it from the nav of everyone outside those
        roles. **They should be decided once, together, as one question: does the Hub own the
        personal view of a thing, or does the company page render a personal view of it for whoever
        opens it?** §5.2's role-driven rendering is the second answer; the first is what the `hub`
        workspace already is. That is the decision §12 owes.
- [ ] **C14 — Re-derive the dossiers and re-trace the defaults.** **IN PROGRESS 2026-08-25 — the
      defaults pass is running; the dossiers pass and one decision remain.**

      Every merge in this plan invalidated a dossier and a locked default. Measured against the live
      database before starting, so the size of the job is on the record rather than estimated:

      | | count |
      |---|---|
      | Registered admin rows | **75** |
      | Routes with a locked default | 138 — **67 orphaned**, 4 missing |
      | Routes with a dossier | 133 — **63 orphaned**, 5 missing |

      **`--since` is the right selector here, not `--stale`.** `staleRoutes` compares each page's last
      COMMIT time against its record's timestamp, so after a day of committing it matches nearly the
      whole tree — the first attempt ran fourteen minutes without finishing. `routesChangedSince` is
      the flag written for "what did this work touch": **115 routes changed since the branch point,
      98 of them traceable**, and roughly eighty of those are redirect stubs the tracer skips in a
      second each. The real work is the sixteen portals.

      **Re-traced so far** (each writes as it goes, so this is durable progress rather than a
      pending batch): `/admin/design` (597 elements at both viewports), `/admin/jobs`,
      `/admin/finances`, `/admin/learn`, `/admin/learn/manage`, `/admin/equipment`,
      `/admin/equipment/templates/new`, `/admin/files`, `/admin/invoicing`, `/admin/marketing`,
      `/admin/billing`, `/admin/jobs/import`, `/admin/employees/manage`. The tracer reports what
      moved: `/admin/jobs/import` shifted 2 elements, worst `.admin-page-header__trail` by 43px.

      ── **FOUR PAGES THAT WILL NOT COMPLETE A WALK, WHICH IS A FINDING RATHER THAN NOISE** ──

      | Route | What the tracer says |
      |---|---|
      | `/admin/discussions` | never finished loading |
      | `/admin/equipment/consumables` | never finished loading |
      | `/admin/equipment/timeline` | never finished loading |
      | `/admin/learn/flashcard-bank` | crashed the browser context |

      "Never finished loading" is expected on a redirect and unremarkable there — but these are live
      pages. A page that never settles is a page with a request that never resolves or a spinner that
      never clears, and the tracer is the only thing in the repo that would ever notice. Worth its
      own slice; flashcard-bank is the 130k-character page that also timed out a browser walk during
      C11a, so that one at least is a size problem rather than a hang.

      ── **CORRECTION: THE FOUR PAGES ARE NOT LIVE PAGES, AND THE REAL BUG IS IN THE TRACER** ──

      The note above this one recorded four routes that "will not complete a walk" and called it a
      finding about the pages. **That was wrong, and checking it is what found the actual bug.** All
      four are redirect stubs this plan created:

      | Route | Really is |
      |---|---|
      | `/admin/discussions` | → `/admin/messages?tab=discussions` |
      | `/admin/equipment/consumables` | → `/admin/equipment?tab=supplies` |
      | `/admin/equipment/timeline` | → `/admin/equipment?tab=schedule` |
      | `/admin/learn/flashcard-bank` | → `/admin/learn?tab=flashcard-bank` |

      The tracer asked `stillLoading` **before** it asked "did this route forward?", and a stub whose
      DESTINATION is slow trips the first question — the portal it lands on has not gone quiet inside
      the budget. So it reported a hang for a page that does not exist.

      **The cost was not a wrong log line.** The forward branch is where S2 lives: the block that
      RETIRES the locked default a forwarding route no longer has. It was unreachable for exactly the
      routes this plan created, so every one of those stubs kept a design claiming to be a 1:1 record
      of a page that now serves a redirect — the precise rot S2 was written to prevent, reintroduced
      by the order of two ifs.

      Where the browser ended up is known the moment navigation resolves; it never needed the page to
      settle. The forward is answered first now, and `stillLoading` only speaks for routes that are
      really trying to be a page. Verified on all four: each reports `redirects to …` and retires its
      live default. Seven designs archived.

      **And the correctness fix did nothing about the cost, which is why the first pass never
      finished.** The forward check moved above `stillLoading`, but it still sat below the viewport
      loop — so every stub paid two page loads, two 25-second readiness waits and two 15-second
      network-idle waits before anything looked at the URL. After the consolidation **roughly eighty
      of the ninety-eight routes in a `--since` pass are stubs**, which is most of an hour spent
      measuring redirects.

      The destination is known as soon as navigation resolves, so it is read on the FIRST navigation
      and the rest of the walk is skipped. Measured: **20 routes — 16 stubs and 4 real traces — in
      under 400 seconds**, against 8 routes in several minutes before. That is what makes the full
      pass a thing that can be run rather than a thing that gets killed.

      ── **AND THE SPEED FIX WAS RACY, WHICH ONE ANOMALY IN A LATER RUN EXPOSED** ──
      ── **AND THE FOURTH FIX IS THE ONE THAT SHOULD HAVE BEEN FIRST: READ THE FILE** ──

      Three fixes went into detecting a forward by NAVIGATING — ask before the readiness check, ask
      on the first navigation, then wait a bounded moment because the redirect is client-side. Each
      was right, and the third still left a flake: **`/admin/learn/flashcard-bank` reported a hang
      again.** Its destination is the Learn portal's 130,000-character tab, which in dev does not
      finish compiling inside the eighty seconds two viewports allow, so the client redirect had not
      fired by the time the walk gave up. The report was accurate and useless — "never finished
      loading" about a page that does not exist.

      **More timeout is the wrong answer to that.** The source says so with certainty, in a
      millisecond: a page whose body is `redirect('/admin/learn?tab=flashcard-bank')` is a stub
      however slow its destination is. `redirectTargetOf()` reads the page file before a browser is
      ever pointed at the route, retires the stale default, and moves on.

      Deliberately narrow — it matches only the shape C9–C13 wrote, a component whose whole body is
      the forward. A page that redirects *conditionally* still renders something the rest of the
      time, and a check that silently stopped tracing a real page would be a worse bug than the one
      it fixed.
      **The narrowness was measured rather than trusted.** Of 182 admin pages, 84 contain a
      `redirect(` call. The fast path matches **81** and declines 3 — and all three are the case it
      was deliberately written to decline:

      | Page | Why it correctly falls back |
      |---|---|
      | `app/admin/me/page.tsx` | the Hub. A real page that redirects **conditionally** — matching it would have silently stopped tracing the busiest page in the product |
      | `app/admin/people/[email]/page.tsx` | a record with a conditional redirect (and dynamic routes are skipped anyway) |
      | `app/admin/design/dossiers/page.tsx` | a stub, but one that forwards `?route=` and therefore has two branches |

      Those three fall through to the navigation path, which still works — slower, and correct. The
      danger in this optimisation was never missing a stub; it was matching a real page and quietly
      dropping it from the walk. **81 of 84, with the 3 misses being the 3 that should miss**, is the
      shape that says the rule is drawn in the right place.


      Measured: 16 stubs in a 20-route slice identified from source with **no navigation at all**,
      and `/admin/learn/flashcard-bank` now says "redirects to /admin/learn" rather than hanging. In
      a full `--since` pass that is roughly eighty of ninety-eight routes that no longer touch a
      browser.

      **Four commits to answer one question, and the last one did not need a browser.** The first
      three were all improvements to the wrong instrument.
      **And the sibling got it in the same slice this time.** `derive-dossiers` navigates to every
      stub as well, so it carries the identical flake — "still loading after 25s" about a page that
      does not exist — and it would have been found the same way: by something going wrong later.
      The ordering bug already taught that lesson once, when fixing the tracer and then reading its
      sibling turned up the same defect a second time. Applying it without waiting to be bitten again
      is the whole of what that lesson is worth.

      Verified on the same route: `/admin/learn/flashcard-bank` reports "redirects to /admin/learn —
      not a page of its own", counted as *not a page* rather than a failure, with no navigation.


      ── **THE "FOUR HANGING PAGES" THREAD, CLOSED** ──

      That claim started this whole sub-investigation and every part of it was wrong, in three
      different ways. For the record, because the wrong version is above and a reader deserves the
      end of the story:

      | Route | Reported as | Actually |
      |---|---|---|
      | `/admin/discussions` | a live page that hangs | a stub — the ordering bug |
      | `/admin/equipment/consumables` | a live page that hangs | a stub — the ordering bug |
      | `/admin/equipment/timeline` | a live page that hangs | a stub — the ordering bug |
      | `/admin/learn/flashcard-bank` | crashed the browser | a stub — the ordering bug |
      | `/admin/billing` | a hang, in a later run | traces fine warm: **42 desktop · 41 mobile** |
      | `/admin/finances` | a hang, in a later run | traces fine warm: **66 desktop · 58 mobile** |

      **Not one of the six is a defective page.** Four were the tracer asking the wrong question
      first, and two were a cold dev-server compile exceeding the readiness budget — `/admin/billing`
      renders a spinner for eleven seconds by its own code comment.

      What the thread produced instead was three real fixes to the tooling — the ordering, its cost,
      and a race in the fix for the cost — plus the test that now pins all three. The original claim
      was worth nothing; chasing why one route disagreed with the others was worth all of it.


      The short-circuit read `page.url()` immediately after `goto`. A later pass reported four hangs;
      two of them — `/admin/invites` and `/admin/equipment/templates/cleanup-queue` — are **stubs**,
      which the fix was supposed to have handled.

      Measured rather than dismissed as flake: **every redirect stub this plan created answers a
      document GET with 200, not a 307.** `redirect()` in a server component is performed by the
      CLIENT router after hydration, so at `domcontentloaded` the URL is still the stub. Reading it
      there is a race — it worked for stubs whose destination compiles quickly and failed for the
      rest, which is why `/admin/discussions` reported "redirects to /admin/messages" and
      `/admin/invites`, four rows later in the same run, reported a hang.

      Fixed with a **bounded** wait: `waitForURL` for four seconds, far short of the 25s readiness
      budget the short-circuit exists to avoid. Verified on the route that failed — `/admin/invites`
      now reports "redirects to /admin/people". `derive-dossiers` does not need it: it calls
      `waitForPageReady` before reading the URL, so it is slow rather than racy, and adding churn
      there would be fixing something that is not broken.

      **Three commits on one twenty-line branch, each fixing what the previous one exposed** — a
      wrong report, then its cost, then a race in the fix for the cost. Each was found by asking why
      one route disagreed with the others rather than filing it as noise, which is the only reason
      the chain ended somewhere true.

      **The same bug was in the sibling script, and fixing one is how it was found.**
      `derive-dossiers.mjs` computed `problem = 'still loading after 25s'` **before** it asked whether
      the route forwarded, and gated the forward check on `!problem`. So a stub whose destination is
      slow was never recognised as a forward at all — it went into the "not derived" queue as a
      failure with nothing to do about it, **which is the exact failure the comment sitting above
      that check records being fixed once already.** Same order, same door, second script. Fixed the
      same way and verified on `/admin/discussions`: "redirects to /admin/messages — not a page of
      its own", counted as *not a page* rather than as a failure.

      A 4xx is still checked below rather than above, deliberately: that is a real answer from a real
      request, and a stub forwarding to a page that answers 500 should say so.
      **A test now pins the order, because a comment did not.** The dossier walker re-created a
      failure recorded as fixed in the comment directly above the check that had it — so
      `__tests__/design/retire-forwarded-routes.test.ts` gained four assertions: the forward is asked
      before the readiness question in BOTH walkers, neither forward check is gated on there being no
      problem, and the tracer's in-loop exit precedes the capture so a stub is not measured anyway.

      Proved to fail, not assumed to: the `!problem &&` guard was reintroduced, the suite went red on
      exactly that assertion, and the file was restored to a clean diff. A green test nobody has seen
      fail is a green test that might be asserting nothing — this plan has caught three of those.


      **And a third probe that was the bug.** The retire left three rows per route still marked
      `default`, which looked like duplicate defaults — 163 route/state combinations holding 578 rows
      between them. `design_mockups` has a unique index for exactly this,
      `idx_design_mockups_one_default_per_state`, whose predicate includes `deleted_at IS NULL`; my
      query did not. Re-measured with the index's own predicate: **zero live duplicates.** The extra
      rows are soft-deleted history and the retire archived the one live default, correctly. Apply
      the predicate the constraint applies before calling its absence a defect.

      ── **THE DEFAULTS HALF IS DONE, AND THE PREDICTION HELD** ──

      Final pass: **23 traced · 0 failed · 152 skipped**, zero hangs.

      | | when C14 started | now |
      |---|---|---|
      | Orphaned defaults | 67 | **2** |
      | Designs retired | — | **105** |

      The two that remain are **exactly the two predicted**: `/admin/billing/upgrade` and
      `/admin/login`. Both are live pages that were never in `ADMIN_ROUTES`, so they were never
      orphans — they are what was left when "orphaned" stopped meaning "unregistered" and started
      meaning "absorbed". **Zero real orphans.**

      Nothing decided this. S2 retires a default the moment a walk finds its route forwarding, so
      105 designs went as a side effect of measuring, and the only reason it took four attempts is
      that the walk kept mistaking a slow stub for a broken page. The fix that finally worked reads
      the file.

      The dossiers pass is running behind it. That half cannot self-heal — no status, no
      `deleted_at`, §13.3 — so its 63 will still be 63 when it finishes, correctly derived and still
      describing pages that are now tabs.
      ── **93 OF 110 TABS HAD NO DESIGN AT ALL, AND THE FLAG WAS OFF** ──

      The question this plan was started next to — *"do the design pages work fully?"* — has an
      answer that none of the counts above would have given. Measured:

      | | |
      |---|---|
      | Portals with a route-level default | **17 / 17** |
      | **Tabs with their own traced default** | **17 / 110** |

      Every portal has a design of the tab it opens on. **The other 93 tabs have no record at all** —
      the Page Designer knows what `/admin/jobs` looks like and nothing about its Field data, Weather
      or Compliance tabs.

      The cause is one flag. `trace-defaults` takes `--states`, it is **off by default**, and no pass
      today used it — not the `--since` runs, not `--missing`. The data it needs was already there:
      the dossier walker records the tabs it finds as `states`, and it had found them correctly —
      jobs 6, people 6, learn 10, equipment 10, pay 14, across 29 dossiers.

      **This reorders the rest of C14.** The conformance run was stopped mid-walk, because it scores
      route/state rows that HAVE a default: with 93 states missing one, it would have measured a
      fifth of the surface and finished looking complete. Trace the states, then measure. (Checked
      before stopping: it had not written, so the existing record is intact and still the "before".)

      **How `--states` actually has to be driven, because the obvious way does nothing.** The flag on
      its own cannot reach a portal: the walk excludes routes that already have a default — the run
      says so, *"62 already had a default"* — and a portal's route-level design is exactly what puts
      it in that set. So `--since --states` and `--missing --states` skip the pages whose tabs are
      the entire point.

      What works is **`--only <route> --states`**, which bypasses the filter. Confirmed on one portal
      before running seventeen:

      ```
      [ 1/1] /admin/jobs        ✓  84 desktop ·  83 mobile
             · jobs        84 · 83      · weather     119 · 118
             · projects    60 · 59      · compliance   24 ·  23
             · field-data  38 · 37      · activity     could not reach it — not stored
      ```

      ── **CORRECTION: `--states` DOES WORK ON ITS OWN. I READ A HEADER AND KILLED THE RUN** ──

      The paragraph above says `--states` cannot reach a portal because the walk excludes routes that
      already have a default. **That is wrong.** Reading the code rather than the header:

      ```js
      let todo = MISSING_ONLY ? wanted.filter((p) => !hasDefault.has(p.route)) : wanted;
      ```

      The exclusion applies **only with `--missing`**. `--area admin --states` traces every route and
      its states. The header line *"62 already had a default"* is a count, not a filter, and I read it
      as one — then killed the run three routes later, saw no state lines yet, and called it proof.
      The output I killed had already written one: `/admin/billing · overview: 42 desktop · 42 mobile`.

      So `--only <route> --states` is not required; it is simply what I ran. It produces the same
      records one portal at a time and one browser launch each, which is slower and not wrong. The
      records in the table above are unaffected — the method was clumsy, the data is the data.

      **The mistake worth keeping: a count in a header is not a filter, and an absence three lines
      into a killed run is not evidence.** This is the same shape as reading a silent pipe as a hung
      process, earlier in this same section.

      **The `activity` miss was chased rather than filed.** Loading `/admin/jobs?tab=activity` and
      reading the DOM the way `SELECTED_STATE` does: the tab IS selected, its label is `Activity`,
      and it slugs to `activity` — the key the tracer was looking for. Nothing is wrong with the tab
      or with the matcher. It reads as a sixth timing artifact, and the sweep will say: if it traces
      on the second attempt, it was the clock.

      **Progress, read from the database rather than the console** — which lags, because the sweep is
      piped through `grep` and grep buffers. That is the third time that trap has bitten in this
      session, twice in commands written after learning it.

      **71 of 110 tabs have their own default** (17 before this sweep began). The walk is alphabetical
      and still short of the eight portals sitting at zero, so those are ahead of it rather than
      skipped. The informative rows are the partials, each missing exactly one tab:

      | Portal | covered |
      |---|---|
      | `/admin/equipment` | 9 / 10 |
      | `/admin/jobs` | 5 / 6 |
      | `/admin/marketing` | 4 / 5 |

      One unreachable tab each, which is what the running failure count says too. Whether those three
      share a cause is worth knowing once the sweep finishes and the list is complete — two data
      points already ruled out the obvious theory, since `cleanup-queue` is an id/label mismatch and
      `plan-history` is one as well and captured fine.

      **The per-tab captures are distinct, checked rather than assumed.** The failure worth ruling
      out was `openState` clicking and the capture happening before the new tab rendered — which
      would store the DEFAULT tab's content ten times under ten different keys and look like
      complete coverage.

      | `/admin/design` | desktop | | `/admin/billing` | desktop |
      |---|---|---|---|---|
      | (route) | 597 | | (route) | 42 |
      | `pages` | 597 | | `overview` | 42 |
      | `compare` | 543 | | `invoices` | 17 |
      | `dossiers` | 364 | | `plan-history` | 15 |
      | `site-versions` | 18 | | | |

      The route-level capture equalling the default tab's is correct, not a duplicate: the route
      opens on that tab. Every other tab differs, which is what says the click landed and the capture
      waited.

      Testing one portal cost a minute and stopped a 144-route walk that would have produced no
      states at all.

      One more instance of the same principle, and the sharpest: **a state missing from a record
      cannot have a bad row in it.** Three walks, two ratchets and a conformance score all reported
      health on a set that silently excluded 93 tabs.

      ── **THE THIRD PIECE: THE CONFORMANCE RECORD, MEASURED AND STALE** ──

      C14 asks for "the conformance record with them", and it had not been looked at. Measured:

      | | |
      |---|---|
      | Last measured | **2026-08-25 07:22** — before the merges |
      | Routes in the record | 206 |
      | …no longer registered | **136** |
      | Registered routes never measured | **5** |

      The 136 are absorbed routes whose scores compare a live page against a design that has since
      been **archived** — a number that looks like a measurement and is a comparison between two
      things that no longer face each other.

      The 5 never measured are more interesting, because two are portals this plan built:
      **`/admin/hours`** (C4) and **`/admin/pay`** (C6). Both have existed for a day with no
      conformance score at all, and neither would have been noticed by the score itself — a route
      that is missing from a record cannot have a bad row in it. `/admin/schedule` is a redirect;
      `design/conformance` and `design/serve` are the two the Page Designer keeps as routes.

      ── **AND THE REASON TWO PORTALS WERE NEVER MEASURED: THE TOOLING COULD NOT SEE THEM** ──

      `/admin/hours` and `/admin/pay` had no conformance score, no traced default and no dossier.
      Not because three walks each skipped them — because all three read
      `lib/design/pages.generated.json`, and **they were not in it.** Seven routes were missing: those
      two and the five design routes.

      Why those two and no others: every other portal REUSED an existing route. C4 and C6 created
      `/admin/hours` and `/admin/pay` as new directories, and the inventory has not been regenerated
      since.

      **The generator's own header predicted this and then did it anyway:**

      > *"A hand-kept list of 168 pages is wrong the day after somebody adds a route, and the failure
      > is silent: the page you forgot to add is the page you never review."*

      Generating the list moved that failure up one level rather than removing it. The FILE is wrong
      the day after somebody adds a route, unless a person remembers to run the script — and nothing
      asked anyone to. Two portals were invisible to the entire design system for a day, and **none
      of the three tools could have reported it: a route missing from a record cannot have a bad row
      in it.** The same shape as the ratchet that was silently skipping a whole product directory.

      Regenerated, and `npm run verify:page-inventory` now exits 1 when the file is behind the
      filesystem. Exit codes measured — and the first probe was wrong in a way worth keeping: a test
      route named `__scratch_probe` reported CURRENT, because a leading underscore is a private
      folder the App Router ignores. The check was right and the probe was testing nothing.
      **And with the inventory fixed, the two invisible portals finally have records.** Traced and
      derived in the same slice that found them:

      | Route | default | dossier |
      |---|---|---|
      | `/admin/hours` | ✓ | 15 elements · 3 functions · 17 checklist items |
      | `/admin/pay` | ✓ | 25 elements · 2 functions · 24 checklist items |
      | `/admin/design/conformance` | ✓ | 9 elements · 1 function · 12 checklist items |
      | `/admin/design/serve` | ✓ | 6 elements · 1 function · 10 checklist items |

      The dossiers pass reports **"4 derived · 0 not derived · 7 not a page"** — the 7 being stubs it
      recognised from source without a browser, which is the fix from earlier in this section doing
      its job on its first real outing.

      **Checked that the new dossiers describe the page and not a spinner**, which is the failure
      mode this walker was built to avoid and the reason it waits rather than counting to 2.5s:

      · `/admin/hours` — 15 elements; observed `GET /api/admin/time-logs`,
        `/api/admin/employees/options`, `/api/admin/payroll/owed`.
      · `/admin/pay` — 25 elements; observed `GET /api/admin/payroll/employees`,
        `/api/admin/clock-session`.

      Both list **"Switches between sections"** among their functions. That is the portal tab strip,
      observed rather than described — the consolidation showing up in the measurement of its own
      result.

      One more cold-compile artifact on the way, recorded because it is now the fifth: the first
      attempt died on *"Could not read the catalogue index (500). Is the server up and the account a
      developer?"* — a question whose two suggestions were both wrong. The server was up and the
      account was an admin; the endpoint was still compiling. It answered 200 a moment later and the
      walk ran clean. **A dev-server walk needs its endpoints warm, and an error message that guesses
      at causes will guess wrong.**


      **Not re-run yet.** It is a third browser walk over ~75 routes at two viewports and the dossiers
      pass is still using the server. Queued behind it; the numbers above are what it will be measured
      against.


      **Measured progress, 2026-08-25** — from the database rather than the console, because the
      console lies when a pipe buffers:

      | | count |
      |---|---|
      | routes re-traced today | **81** |
      | designs retired as their route now forwards | **59** |
      | dossiers re-derived today | **127** |
      | orphaned defaults | **67 → 28** |
      | orphaned dossiers | 63 → **63** |

      The defaults half is largely self-healing: S2 retires a stale default whenever the walk finds
      the route forwarding, so 59 went without anybody deciding anything, and the remaining 28 are
      routes the pass has not reached. The dossiers half cannot do this — `design_page_dossiers` has
      no status and no `deleted_at`, so nothing in the schema can express "retired". That asymmetry
      is now §13.3, and it is a smaller and sharper question than the one §13 first asked.

      ── **THE 67 ORPHANS ARE A DECISION, NOT A CLEANUP** ──

      67 locked defaults and 63 dossiers describe routes that no longer have a registry row. It is
      tempting to delete them and it should not be done without asking, for two reasons: **every one
      of those URLs still resolves** — they forward to a tab — and those records are the only
      remaining picture of what each page looked like before it was absorbed. Deleting them makes the
      numbers tidy and throws away the before-half of every comparison this plan could ever be judged
      by. Options for the owner: (a) leave them, and let the page list show them as orphans;
      (b) re-point each at the tab that absorbed it, so the design follows the content; (c) delete.

      ── **TWO METHOD MISTAKES, BOTH MINE, BOTH WORTH RECORDING** ──

      · **`grep` buffers when its output is not a terminal.** Two background runs reported zero bytes
        for many minutes and looked hung. They were not — the pipeline was holding the lines. The
        fix is `--line-buffered`, and the lesson is that a silent pipe is not evidence of a silent
        process. Progress here is measured from the DATABASE instead, which is the honest check
        anyway: the rows are the deliverable, stdout is commentary.
      · **I killed the dev server believing it was the runaway trace**, on nothing better than its
        3.8 GB working set. The next run died on ECONNREFUSED. Identify a process by its command
        line, not by which one looks expensive.

      **Remaining — rewritten 2026-08-25, because three of the five items had already been done or
      answered and the list was quietly wrong about its own state:**

      | the original item | where it actually stands |
      |---|---|
      | finish the defaults pass | **107 of 110 portal tabs**, up from 51; only `/admin/support`'s three outstanding, and it is last in the alphabetical walk |
      | run the dossier deriver for the same set | done — the sweep runs `derive-dossiers` and `trace-defaults` per portal, in that order |
      | refresh the conformance record | **still to do**, and now worth doing: it was deliberately held back while 59 states had no default, because scoring a fifth of the surface would have finished looking complete |
      | chase the four pages that will not settle | **already answered, directly beneath this entry** — all four are redirect stubs this plan created, and the bug was the tracer's ordering, not the pages. The line survived the correction that refuted it |
      | put the orphan question to the owner | **§13.3** — asked, re-measured, and the question changed in the asking |

      That third row is the only real remainder. A list that outlives its own resolution is the same
      failure as a stale comment, and it is worth noting that it sat directly above the correction
      that made it wrong.

      ── **C14b — THE SIX TABS THAT "COULD NOT BE REACHED", 2026-08-25** ──

      The per-portal states sweep reported six tabs it could not open. They looked like a finding.
      **Five of the six were not.** Taking them one at a time is what separated them, and the three
      answers were three different things:

      | reported | truth |
      | --- | --- |
      | `hours · pending`, `all-entries`, `advances`, `bonuses` | never states of the route |
      | `equipment · cleanup-queue`, `jobs · activity`, `marketing · connection-uploads` | reachable; the sweep's window was too short |
      | `hours · assignments` | captured in one run, failed in the next — the same flake, caught red-handed |

      **1 — A state of a state is not a state of the route.** `/admin/hours` has six portal tabs, and
      its Approvals panel has a tab bar of its OWN — Pending, All Entries, Advances, Bonuses, class
      `tl-tabs__btn`. Rule 3 of the observer matches any element whose class looks like a tab, so all
      ten were recorded as states of `/admin/hours`. The inner four cannot be opened by anything the
      tracer does, and correctly so: `?tab=pending` means nothing to the outer strip, and after
      clicking one the selected tab is still Approvals.

      **The verify step refusing to store them is the system working.** Without it the route would
      now hold four identical captures of Approvals filed under four different names — worse than
      four missing ones, because they look like a finished job. Fixed by gating rule 3 on
      `hasRealTablist`: when a page declares a genuine `role="tab"` list, that list IS its states.
      `/admin/learn/manage`, whose twelve-tab strip is CSS-only, is untouched — checked, not assumed.

      **2 — The fixed-wait trap, again.** The other three opened FIRST TRY when probed one at a time.
      Nothing was wrong with any of them. `openState` slept a flat 1200ms after clicking and then
      judged; a dev server compiling a panel on demand does not answer in 1200ms, so the check read
      the tab that was still showing. This is the same trap that once took the route walk from 4 of
      51 pages to 26 — and it is nastier here, because its failure is **indistinguishable from a tab
      that genuinely cannot be opened**. It now polls for the state it asked for until a deadline.

      Result: marketing 4/5 → **5/5** (`connection-uploads` captures 283 elements against overview's
      263 — a different page, not a re-photograph of the same one), jobs 5/6 → **6/6**.

      ── **THE METHOD NOTE, WHICH IS THE POINT OF THIS ENTRY** ──

      I had already written down that the three partials — equipment 9/10, jobs 5/6, marketing 4/5 —
      were worth checking for a shared cause. They had one. It was **the measuring instrument**, for
      the second time in this plan, and for the same reason both times: a sleep long enough on a warm
      machine is not long enough on a cold one.

      The near-miss worth recording: three unrelated singletons in three unrelated portals is exactly
      the shape a structural defect makes, and I was one step from filing it as one. What stopped it
      was re-running the three ALONE before believing the batch. **A failure that disappears when you
      isolate it was never a property of the thing you isolated.**

      ── **C14c — A COMPILE ERROR IS NOT A DESIGN, 2026-08-25** ──

      `waitForPageReady` asks whether something rendered. A Next dev error overlay renders — heading,
      buttons, links — so it answers yes, the capture proceeds, and the route's **locked default**
      holds a stack trace. Nothing downstream could tell: the element count is plausible and the page
      "loaded". A default is supposed to be evidence; this is the one way it could quietly become the
      opposite.

      The existing answer was a rule for people — *never edit files mid-run, the dev server
      recompiles and the sweep sees 500s and 404s*. That rule has shaped three days of sequencing in
      this plan: slices held back, a sweep stopped and restarted twice, and a docs-only slice chosen
      over a code one purely to keep out of the compile graph. It treats the instrument as something
      to tiptoe around. `devErrorOn()` is the version a machine can enforce — the overlay is detected
      by its custom element, by its dialog scaffolding, and by the four phrases a build failure puts
      on screen, and the capture is refused rather than stored.

      Asked at **both** capture sites, and before the capture at each: the route, and every state.
      A tab's default is exactly as wrong to fill with a stack trace as a page's.

      **The two failures are also no longer allowed to wear the same words.** "Could not reach it"
      says the TAB is the problem — the sentence that sent an afternoon looking for a structural
      cause behind three tabs that were merely cold. A broken server now says so in its own words.

      Guarded by `__tests__/design/dev-error-is-not-a-page.test.ts`, whose real work is the negative
      case: the failure mode of a check like this is not missing an overlay, it is firing on a
      healthy screen and quietly refusing good captures. Five sentences a working admin page says
      about errors — a column header, an empty state, a validation hint, a log page, a retry — are
      asserted NOT to trip it.

      **Two tests broke, and only one of them was mine to expect.**
      · The tracer's import line was pinned verbatim and broke when `devErrorOn` joined it. Fifth
        assertion in this plan to fail because source text moved while the thing it asserts did not.
        Now matched by name.
      · `staleness.test.ts` asserted `routesChangedSince(..., 'HEAD~40')` finds something. **`HEAD~40`
        is a moving target.** It was true when written and decayed silently afterwards; five
        docs-and-tests commits pushed the window past the route change it depended on, and the test
        then reported a property of recent history as a fault in the function. Re-anchored on the
        commit that last touched `app/admin/billing/page.tsx` — a fixed point later history cannot
        slide past. Worth naming as its own defect class: **a test whose fixture is "N commits ago"
        has an expiry date nobody wrote down.**

      And one number in the previous entry was wrong: "71 of 110 tabs" compared every per-state
      default in the table (73, of which 22 are on non-portal routes) against the portal-tab
      denominator. The real figure at that moment was **51 of 110**. Same shape as the 163 phantom
      duplicate defaults earlier in this plan — a count that answers a different question than the
      one being asked, reported as though it answered this one.
---

## §9. What the usage data does and does not say

Checked rather than assumed, because "nobody uses that page" is the kind of claim that justifies
deleting somebody's tool.

`nav_events` holds **239 rows spanning 2026-05-29 → 2026-08-24**. It records workspace clicks,
command-palette opens and persona switches — **not page views**. There is no `page_views` table and
no `route_visits` table; `activity_log` (213 rows) records domain actions, not navigation.

**So the product cannot currently answer "which of these 138 links does anyone open."** That is a
gap worth closing before deleting anything, and it is C0.

Two things it CAN say, both worth acting on:

**Workspace clicks over three months:**

| Workspace | Links in it | Clicks |
|---|---|---|
| Hub | 14 | 66 |
| Work | 18 | 47 |
| Office | 33 | 40 |
| Knowledge | 19 | 36 |
| Research & CAD | 10 | 33 |
| Equipment | 14 | 7 |
| **Money** | **30** | **3** |

**Money is the second-largest workspace in the product and was opened three times in three
months.** It is also the one the owner most wants consolidated. Those two facts together are the
strongest argument in this document — not that the pages are badly grouped, but that thirty links
were built for a job nobody has yet done in the app.

**Distinct paths seen at all: 52**, out of 138 nav links plus 38 detail routes. The top of that
list is `/admin/me` (58), `/admin/work` (24), `/admin/office` (19), `/admin/messages` (12),
`/admin/receipts` (9), `/admin/jobs` (7).

**The honest caveat, stated so nobody over-reads the number:** `pathname` is recorded only when a
nav event fires, so it is a sample of "where someone was when they clicked a workspace", not a
visit log. A page missing from those 52 is **not proven unused** — it is unobserved. That
distinction is exactly why C0 exists, and why no page in this plan is marked for deletion yet.

---

## §10. The owner's answers — 2026-08-24

Asked in the first draft, answered the same day. Recorded here rather than in a chat log, because
these are the decisions the rest of the plan rests on.

**1. Per-item receipt approval — ANSWERED, and it is bigger than approve/deny.**

> *"It can be that some items on the receipt are accepted and some are rejected. There would need to
> be a way to fully flesh out the costs of a given receipt and determine what all should be tax
> exempt and what should not."*

So a receipt is not a decision, it is a **list of decisions**, and each line carries two independent
ones:

| Per line | Values | Who decides |
|---|---|---|
| accepted? | accepted · rejected | the approver |
| taxable? | taxable · exempt | the approver, and it is an accounting fact |

Three consequences the first draft did not anticipate:

- **The receipt total stops being the receipt total.** Once a line can be rejected there are three
  numbers — what was spent, what was approved, and what is deductible — and every screen that shows
  "the receipt amount" has to say WHICH. That is the same defect shape as `effectiveHours`, where
  four files summed raw hours while a fifth summed the approver's adjustment and the two disagreed
  across the very decision that created them. **One function, `approvedTotal(receipt)`, exported,
  used everywhere** — decided now, before the first screen reads `receipt.amount_cents` again.
- **Tax-exempt is not a UI flag, it is a Schedule-C input.** `/admin/finances` already builds a
  Schedule-C-shaped report from approved receipts. Per-line exemption changes what that report is
  allowed to count, so P2.2 and P7 are the same slice's data model seen from two ends.
**CHECKED, 2026-08-24 — and most of this is already built.** The first draft said to find out
before designing the screen. Found out:

| Piece | State |
|---|---|
| `receipt_line_items` table | **exists**, 93 rows, AI-extracted, position-ordered |
| per-line accept/reject | **built** — `is_business_expense`, nullable by design: TRUE claim it, FALSE do not, NULL undecided |
| the editing UI | **built** — `app/admin/receipts/ReceiptLineItems.tsx` |
| the API | **built** — `PATCH /api/admin/receipts/[id]/line-items` |
| an audit trail | **built** — `added_by`, `removed_by`, `edited_by`, and their reasons |
| per-line TAX treatment | **missing.** `tax_deductible_flag` exists on the RECEIPT, not the line |
| anybody having used it | **no.** All 93 rows are `NULL` |

So P2.2 is not "build per-item approval". It is three much smaller things:

1. **Put the existing editor where the deciding happens.** `ReceiptLineItems` is mounted in
   `ReceiptSlideshow` only — the review carousel — and not on `/admin/receipts`, which is the
   approval queue. It is one click away rather than absent, but the queue is where somebody sits
   down to approve twenty receipts, and that is where the per-line decision belongs.
2. **Add the second axis.** Accepted and deductible are not the same question: a client meal can be
   approved and only half deductible; a parking fine can be approved and not deductible at all.
   `is_business_expense` answers the first. The second needs its own per-line column.
3. **Decide what the receipt total means** once lines disagree — below.

That every one of those 93 rows is still `NULL` is the finding underneath the finding: this is the
repository's most common defect, a feature authored and never wired to the place it was for.

**2. Roles — ANSWERED, with one gap.**

> *"users could be employees, students, teachers, admin, marketing team, etc."*

`ALL_ROLES` already carries `admin`, `developer`, `teacher`, `student`, `researcher`, `drawer`,
`field_crew`, `employee`, `guest`, `tech_support`, `equipment_manager` and a money-handling role.
Everything named is there **except `marketing`** — advertising is gated to `admin` today. Adding a
role is a small change; noting that it is missing before designing a Growth portal around it is the
point.

**3. Rewards — ANSWERED. Part of pay.** It stays as a tab of P1, which is where the first draft put
it. No change; the question is closed.

**4. Workspaces — DELEGATED to me.** My answer is in §12, with the reasoning, as a later slice.

**5. Deleting rather than absorbing — still open, and now measurable.** C0 shipped; two weeks of
`nav.route.view` will produce the candidate list. Nothing gets deleted before that.

**6. NEW — page and feature toggles.** A requirement, not an answer. §11.

**7. NEW — role-driven rendering.**

> *"I want it so that pages load elements dynamically based on the role of the user."*

This is §5 stated more strongly, and it extends past the tab bar to what is INSIDE a tab. The rule
in §5.1 does not change and gets more important the finer the granularity: **hiding an element is a
courtesy, refusing the request is the boundary.** A portal that renders fewer widgets for a field
crew member and an API that would happily answer all of them is not a permission model.

---

## §11. Toggling pages and features on and off

> *"I want it so that we can have full control in the settings as to what all pages are visible and
> what pages are not… Maybe we don't want to use a page or feature right now, so we would toggle it
> off so that navigating the webpage is easier, but if we decide to use that page/feature in the
> future, then we can turn it back on and make sure it is hooked up correctly."*

### 11.1 This is a FOURTH question, and that is why it deserves its own switch

Three gates already decide whether somebody sees a route, and the toggle must not become a fourth
copy of any of them. They answer genuinely different questions:

| Gate | Where | The question |
|---|---|---|
| `roles` | `route-registry.ts` + `middleware.ts` | **may you?** |
| `requiredBundle` | `lib/saas/bundle-gate.ts` | **did the firm pay for it?** |
| `internalOnly` / `showInRail` | registry flags | **is this for staff, and does it belong in the rail?** |
| **`enabled`** | NEW | **does this firm use it at all?** |

A page can be one you may see, that you paid for, that is meant for staff — and that this firm has
simply decided not to run yet. None of the existing three can express that, which is why the answer
is a new switch rather than a new role or a new bundle.

### 11.2 Where it lives: no new table

`app_settings` is already an org-scoped key/value store (`key`, `value` JSONB, `org_id`) with a
route at `/api/admin/settings`. One row:

```
key:   'feature_toggles'
value: { "/admin/payouts/search": false, "/admin/pay#rewards": false, … }
```

**Absent means ON.** Not "absent means off" and not an exhaustive list written at install time: a
toggle system that ships with anything off is one that broke something on day one, and a new page
added next year must appear without anybody remembering to enable it.

### 11.3 The unit is a nav destination OR a portal tab

This is where §11 and §4 turn out to be the same shape. After consolidation most of what the owner
would want to switch off is not a route any more — it is a tab. "We do not do pass-through billing"
should turn off the `rebilled` tab of the receipts portal, not a URL that no longer exists.

So a toggle key is either a route (`/admin/vehicles`) or a route-plus-tab (`/admin/pay#rewards`),
and the portal shell reads it in the same breath as the role check.

**Consequence worth stating: the toggle system should be built INTO the portal shell (C2), not
bolted on after.** Building it against 138 routes and then rebuilding it against 29 portals is the
work done twice.

### 11.4 What a switched-off page actually does

The owner's own sentence settles the hardest question here: *"turn it back on and make sure it is
hooked up correctly."* An admin has to be able to REACH a disabled page to check it. So:

| Surface | Behaviour when off |
|---|---|
| Sidebar, rail, palette, search | gone. This is the whole point. |
| A link from another page | rendered, but marked — a dead link is worse than a visible one |
| Direct URL, ordinary user | a plain "this feature is turned off" page. **Not a 404** — a 404 says the thing does not exist, and it does |
| Direct URL, admin | **the page, working**, behind a banner saying it is off for everyone else, with a Turn on button |
| The APIs behind it | **unchanged.** See 11.5 |

### 11.5 The thing this must never become

**A toggle is not a permission.** It is a visibility control, and the moment somebody believes
otherwise it becomes a security hole with a friendly name: *"we turned payroll off, so the crew
cannot see wages"* is false the second anyone types the URL, and it is exactly the kind of false
belief that goes unexamined for a year.

So the APIs keep every check they have, the middleware role gate is untouched, and the toggle is
read in the UI layer and in a redirect — never as the reason a request is refused. **A test should
assert that turning a page off changes no API's answer.**

### 11.6 Turning something off should say what it breaks

Pages link to each other. Switching off `/admin/vehicles` leaves the mileage screen pointing at a
page nobody can open, and the person flipping the switch has no way to know that.

The registry plus a link scan can answer it, so the settings screen should: **"3 other pages link
here — Mileage, Equipment, Field Team."** Not a refusal, a sentence. The owner is allowed to break
a link on purpose; they are not well served by doing it invisibly.

### 11.7 Slices

- [x] **T1 — The switch, read-only.** Shipped 2026-08-25. `lib/admin/feature-toggles.ts`: `isEnabled`,
      `isDestinationEnabled`, `togglesFrom`, `toggleKey`/`parseToggleKey`, `withToggle`,
      `disabledKeys`. Stored in `app_settings` under `feature_toggles`, and **absent means ON**.

      Three decisions the tests pin, each about a failure mode rather than taste:

      · **A broken row is the harmless state.** Nothing, a string, an array, a number — every one of
        them reads as "everything is on". A parse that threw here would take out the sidebar of every
        page that reads it, and the whole point of "absent means on" is that the broken state does no
        damage.
      · **A non-boolean is dropped, never coerced.** `"false"` the string is TRUTHY in JavaScript and
        would silently mean ON — the reverse of what whoever wrote it intended. A toggle doing the
        opposite of the stored data is worse than one ignoring it.
      · **Turning something back ON deletes its key** rather than storing `true`. A map that
        accumulated `true` for everything ever toggled would slowly become the exhaustive inventory
        this design exists to avoid, including entries for routes that stopped existing.

      **The whitelist caught itself.** `/api/admin/settings` writes through `ALLOWED_KEYS`, and its
      own header says why: *"a new section written to the table by a seed but not named here reads
      back fine and silently 400s on save. That is the 'authored but not wired' failure this codebase
      hits most often."* A reader with no writer is exactly that, on the very list that warns about
      it. `feature_toggles` is on the whitelist, by importing `TOGGLES_KEY` rather than retyping the
      string — two spellings of one key is how a writer and a reader end up pointed at different rows,
      and the symptom would be a switch that saves successfully and changes nothing.

- [x] **T2 — The nav respects it.** Shipped 2026-08-25, and **in one place**, because
      `AdminSidebar`'s own header already states the rule: *"gating happens once, in
      `accessibleRoutes`, off the registry."*

      `accessibleRoutes` takes an optional `toggles` map and drops what is off. Four surfaces read
      it — the sidebar (which is also the mobile drawer, and the only nav a phone has), the icon
      rail, the command palette and the workspace flyout — and filtering in each separately is four
      places for a switched-off page to stay visible in one of them.

      The check sits **above the role logic**, beside `parked`, so `isAdmin` cannot short-circuit
      past it. Hiding it from admins too is the request itself: *"so that navigating the webpage is
      easier"*. An admin reaches a disabled page by URL (§11.4), where they get the working page
      behind a banner — the nav does not keep offering it.

      One fetch per page load, not four. React renders these concurrently, so an effect in each
      would fire four identical requests on every navigation; `useFeatureToggles` shares a
      module-level promise. It starts **everything ON** while the read is in flight rather than
      showing a loading state — a nav that waited would flicker its whole list into existence on
      every page load, and the unfiltered list is a superset, never a lie about what exists.

      Browser-verified on `/admin/equipment`: **10 cards → 9** with `/admin/equipment/timeline`
      switched off, and **back to 10** when switched on.

      *(The first probe of this reported "no change" three times and was wrong — it had picked
      `/admin/vehicles`, which is not in that workspace at all, so nothing could have changed. Ninth
      time this session a throwaway script's own bad input looked like a defect in the thing it was
      testing.)*
- [x] **T3 — The settings screen.** Shipped 2026-08-25 as a **Pages** tab on `/admin/settings` —
      where the owner asked for it — plus `GET /api/admin/feature-toggles` for the half a browser
      cannot compute.

      Browser-verified: **134 destinations in 7 workspace groups**, grouped and labelled exactly as
      the sidebar groups them. That is not cosmetic: the person using this screen is looking at their
      own sidebar deciding what to remove from it, and any other ordering makes them translate
      between two views of the same thing while flipping switches they cannot immediately verify.

      **Every switch saves on its own.** No Save button: forty switches behind one button is a page
      where a misclick loses all of it, and where *"did that take?"* is unanswerable until you
      navigate away and come back. The cost is paid honestly — a failed write puts the switch BACK,
      because a control that stays flipped after a failed save leaves the screen disagreeing with the
      product about which pages exist.

      §11.5's sentence is **on the screen**, not only in a code comment nobody using the product will
      read: *"This hides pages; it does not lock them. Permissions are set by role, not here."*

      §11.6's warning names the pages rather than counting them, and appears only once a page is OFF
      — a link count on all 134 rows is noise, and it is only a consequence after the switch.

      **The link count was wrong on its first run, and reading the output is what caught it.**
      `AdminSidebar` and `AdminLayoutClient` link to every route in the registry *by construction*,
      so counting them made every destination look like it had two or three more dependants than it
      has: `/admin/me` reported **19**, most of them the navigation itself listing it. That is worse
      than a wrong number — the sentence exists to say what you are about to break, and an inflated
      warning is one people learn to skip. Only links from a file that BELONGS to a page count now,
      and `/admin/me` reads **11**, every one a real page.

      Two smaller rules the tests pin:

      · **Every route, not only the ones this admin can open.** `accessibleRoutes` would be the
        obvious call and would be wrong — this screen decides what the FIRM uses, not what the person
        looking at it may open, and a switch you cannot find is indistinguishable from one that does
        not exist.
      · **Matched on a QUOTED href.** `"/admin/jobs"` must not be found inside `"/admin/jobs/new"`,
        or every parent route absorbs its children's inbound links — wrong in the direction that
        matters.

      The scan runs per request rather than from a generated file. Every other derived inventory here
      is generated, and every one of them has at some point been stale and believed; a link count is
      advisory, so being a request slower is free and being WRONG is the failure that matters.
- [x] **T4 — The off page**, and the admin bypass with its banner (11.4). Shipped 2026-08-25 as
      `PageOffGate`, wrapped around `children` inside the admin shell's error boundary.

      Browser-verified, one route, four states:

      | | what they see |
      |---|---|
      | ON / admin | the page |
      | OFF / admin | **the page, working**, behind a banner saying it is off for everyone else |
      | OFF / employee | *"Weather is turned off"* — no page data |
      | OFF / employee, nav | gone from their workspace list |

      Not a 404, deliberately. A 404 says the thing does not exist; it does, and somebody switched it
      off. The person who followed a link here needs to know which of the two it is, because one is a
      bug worth reporting and the other is a decision their company made. For the same reason there
      is no *"request access"* — offering a permission remedy would teach the wrong thing about what
      happened.

      It resolves the ROUTE, not the pathname, so switching off Jobs covers `/admin/jobs/abc123` too.
      Matching the raw URL would leave every detail page reachable while its parent was off — the
      sort of gap somebody finds by accident and then stops trusting the switch.

      ── **AND IT DID NOT WORK FOR ANYONE BUT ME** ────────────────────────────────────────────────

      The first browser pass showed the admin banner correctly and showed an **employee the full
      page**. The cause was one line: the toggle map was read from `/api/admin/settings`, which is
      `isAdmin`-only — as it should be, it carries the company's details and its billing. So a
      non-admin's browser got a **403**, `togglesFrom` correctly answered *"everything is on"*, and
      **both halves of this feature silently did nothing for non-admins**: the nav kept every
      switched-off page, and the off-page notice could never appear for the people it exists for.

      It worked perfectly for the one account I had been testing with, which is exactly why it took a
      second signed-in browser to find. Nothing errored, nothing logged, and every source-level test
      still passed — the fetch failing was indistinguishable from a firm that had switched nothing
      off. The values now come from `/api/admin/feature-toggles`, readable by any signed-in user
      (which pages a firm uses is not a secret — it is visible in the menus of everybody who has
      them); the link scan stays admin-only, because it is the settings screen's working data.

- [x] **T5 — The test that keeps 11.5 true**. Shipped 2026-08-25, and stronger than the slice asked
      for.

      §11.5 asks that turning a page off change no API's answer, for every role. Testing one endpoint
      would prove one endpoint. The guarantee is instead structural: **no route handler in the
      product may consult the toggle map at all**, except the one whose job is to serve it. An API
      that never reads it cannot be changed by it, for anybody.

      The test walks every `route.ts` under `app/api` (200+), collects the ones importing
      `feature-toggles`, and asserts the list is exactly two — the endpoint that serves the values,
      and the settings endpoint that imports `TOGGLES_KEY` so the writer and the reader cannot end up
      pointed at two different rows. Neither derives a 401 or 403 from `isEnabled`, and the
      middleware does not mention toggles at all: a read there would apply to every request in the
      product at once, which is the largest possible version of this mistake.

      The walk asserts it found **more than 100 route files** before checking anything. A scan that
      quietly matched nothing would pass this test forever while proving nothing — the exact shape of
      four separate bugs already recorded in this session.
- [x] **T6 — Tab-level toggles** — **DONE 2026-08-25. The deferral's premise expired and was checked
      before building on it.**

      §11.3 parked this: *"Building it against 138 routes and then rebuilding it against 29 portals
      is the work done twice."* The portals exist now — **17 of them, holding 110 tabs** — so the
      reason to wait is gone.

      **What was actually missing is not what the deferral implied.** The READ half was already here
      and already tested: `canSeeTab` calls `isDestinationEnabled(toggles, spec.route, tab.id)` and
      `toggleKey` builds `route#tab`. What was missing is that **nothing ever produced such a key** —
      `/api/admin/feature-toggles` listed routes only, so the control could not be reached from
      anywhere and the mechanism sat there answering a question nobody could put to it. This
      repository's most common defect, authored-and-not-wired, sitting in its own settings page.

      The endpoint now emits one switch per tab, labelled by its portal ("Growth → Leads"), and the
      settings UI needed **no change at all**: it renders destinations generically and saves by
      `dest.key`. §11.3 predicted that — *"C2 has to call one function, not design a mechanism"* —
      and it was right about the shape while wrong about which half was missing.

      **The tab list is generated, not imported and not hand-written.** Portal specs live in
      `'use client'` pages, and a Route Handler that imports one gets a client-reference proxy: the
      object is not there and nothing throws, which is how C9 lost an afternoon with 26,194 tests
      green. So `scripts/derive-portal-tabs.mjs` writes `lib/admin/portal/tabs.generated.json`, has a
      `--check` mode, and a test regenerates and compares — a second copy of a list is what broke the
      API bundle mirror **nine times in nine slices**, and the only thing that has ever helped is a
      test that notices.

      **`npm run verify:portal-tabs`** — the `--check` mode, reachable the way this repo's other
      verifiers are (`verify:inline-style-hex`, `verify:org-scope`, `verify:fs-questions`). The test
      already regenerates and compares; the script makes the same check runnable without the suite,
      which is what a hook or a CI step needs.

      Exit codes measured rather than assumed: **stale → 1, current → 0.** A verifier that prints a
      warning and exits 0 is a verifier nothing acts on, and the first attempt to check this measured
      `tail`'s exit code instead of the script's — which would have recorded exactly that lie.

      **The parser was wrong twice before it was right, and both cases are kept as tests:**

      | Symptom | Cause |
      |---|---|
      | `/admin/messages` had `contacts` twice | a comment in that page discusses `id: 'contacts'` in prose — the parser read a sentence about the code as the code |
      | `/admin/marketing` lost `uploads` | that entry carries a comment BETWEEN its `id` and its `label`, and the first attempt required them adjacent |

      Comments are stripped first, line before block — the same lesson this plan learned in
      `__tests__/research/api-access.test.ts`, arriving in a third place.

      **Verified end to end in a browser rather than from the source.** `/admin/jobs` showed Jobs ·
      Projects · Field data · Activity · Weather · Compliance; switching off `/admin/jobs#weather`
      through the same API the settings page uses left Jobs · Projects · Field data · Activity ·
      Compliance; restoring put Weather back and the stored row byte-for-byte to what it was.
      **And then the screen it shipped into had to be fixed, because I measured it.** 74 destinations
      became 184, rendered flat: the Pages tab measured **11,233 pixels tall — eleven screens — with
      368 rows.** "Switch off anything this company does not use" stops being possible when finding
      the thing takes eleven screens of scrolling, so a control nobody can find is not a control.

      Tabs are nested under their page now, behind a disclosure that is closed by default and says
      how many tabs there are and how many are off. Measured after: **5,019px, 160 rows** — back to
      roughly what the screen was before T6 — with 17 disclosures, and expanding one shows that
      portal's tabs by their own names ("My time · Assignments · Approvals · Field team · Time off ·
      Availability") rather than repeating the portal name in every row. Verified reversible: it
      closes again.

      Tab switches are offered only when the PAGE is on, because switching a page off already takes
      its tabs with it — offering controls that cannot change anything is worse than offering none.

      **The theme ratchet caught the CSS on the way past.** The hover used
      `var(--theme-bg-subtle, …)`, a token nothing defines, which would paint its literal fallback
      identically on all eleven palettes. That test exists for exactly this and it earned its keep on
      a stylesheet written the same hour.


## §12. The workspaces — the answer §10 delegated

§10 said *"Workspaces — DELEGATED to me. My answer is in §12, with the reasoning, as a later slice."*
§12 was never written. This is it, written on 2026-08-25 with the consolidation far enough along to
answer with measurements instead of a guess.

### What §6 said to wait for

> With 29 destinations, **the 7-workspace split may stop earning its keep.** Workspaces exist to make
> 138 links navigable; 29 links fit in one grouped list. […] it should be made AFTER a few portals
> ship, not designed up front on a guess.

### What is actually there now

**42 rail links across 7 workspaces**, down from 138.

| Workspace | Rail links | Landing page | Sections |
|---|---|---|---|
| `hub` | 8 | yes | none |
| `work` | 6 | yes | none |
| `equipment` | **1** | yes | none |
| `research-cad` | 4 | yes | none |
| `knowledge` | 6 | **no** | none |
| `money` | 7 | yes | 4 |
| `office` | 10 | yes | 4 |

### The answer: keep the seven, and fix the two that make the idea look arbitrary

**42 links across 7 groups is six per group.** That is a navigable list, and §6's threshold of ~29 is
not met — C13f and whatever the owner decides about the four personal-vs-company pages will move it a
little, not to 29. Deleting the workspace concept now would be re-arranging navigation for the second
time in one week on a number that has not arrived.

**But two of the seven are anomalies, and they are why the split reads as arbitrary rather than as a
map:**

1. **`equipment` holds exactly one rail link — its own portal.** Three more routes are registered and
   hidden. A workspace whose entire visible content is its own landing page is not a room; it is a
   door with a sign saying "door". Either `/admin/equipment` moves into `work` — it *is* work, and
   `work` would go to 7, still the smallest group but a real one — or the concept is admitting that a
   workspace can have one thing in it, which makes the other six harder to defend.

2. **`knowledge` has no landing page while the other six do.** `/admin/learn` is its landing in
   everything but registration: it is the first link, it is the portal, and C11a gave it ten tabs.
   The inconsistency is bookkeeping, not design.

**Neither is a big change, and neither should be made in the same slice as a merge** — §6's own
warning, which held all the way through C3–C13e and should hold for one more step.

### CORRECTION, 2026-08-25 — one of the two "anomalies" was my measurement, not the registry

The table above said `knowledge` has **no landing page** while the other six do, and the section
below built a recommendation on it. **That was wrong.** Every one of the seven workspaces has a
landing, registered and reachable:

| Workspace | `WORKSPACES[ws].href` | registered |
|---|---|---|
| `hub` | `/admin/me` | yes |
| `work` | `/admin/work` | yes |
| `equipment` | `/admin/equipment` | yes |
| `research-cad` | `/admin/research-cad` | yes |
| `knowledge` | **`/admin/learn`** | yes |
| `money` | `/admin/money` | yes |
| `office` | `/admin/office` | yes |

My probe did not read `WORKSPACES[ws].href`. It looked for a ROUTE NAMED AFTER the workspace —
`/admin/knowledge` — which four of the seven happen to follow and which is a naming convention, not a
requirement. `knowledge` is named `/admin/learn` because the product calls it Learning, and that is
the only thing wrong with it. Fourth time in this plan that the probe was the defect, and the check
that caught it is the same one every time: read the field the code reads, not a pattern that usually
matches it.

**The second anomaly does not survive either, on re-reading rather than re-measuring.** `equipment`
holding exactly one rail link is the consolidation WORKING: C3 absorbed ten pages into that portal,
so one link is the correct number. The observation that does survive is smaller and belongs to all
seven — every workspace's rail repeats its own landing as its first row, which in `equipment`'s case
is the entire group. That is a cosmetic redundancy in the rail, not a case for retiring a workspace,
and retiring one for it would be exactly the "re-arranging navigation on a number that has not
arrived" this section warns against two paragraphs later.

### So the answer is simpler than the section above concluded

**Keep the seven, change nothing structurally, revisit below 30 rail links.** The two changes
proposed above are withdrawn: one rested on a broken measurement and the other on reading a success
as a defect. What is left is the part that was always the answer — 42 links across 7 groups is a
working navigation, and the reason to delete the split was never elegance but a link count that no
longer exists and is not coming.

The trigger stands, and it is the only thing here worth acting on later: **rail links below 30.**

### The trigger, stated so it can be checked rather than felt

Revisit the seven-workspace split when **rail links fall below 30**, which needs roughly a dozen more
absorptions than remain. If that never happens, the split stays: seven groups of six is a working
navigation, and the reason to delete it was never elegance but a link count that no longer exists.

### What this does not decide

Four pages are stuck on the personal-vs-company question and they are one decision, not four —
`announcements`, `notifications`, `me/privacy` and `my-files`. Each is ungated and personal; each has
a company page it "belongs" to that is gated more narrowly; folding any of them in removes it from
the nav of everyone outside those roles. The question is: **does the Hub own the personal view of a
thing, or does the company page render a personal view of it for whoever opens it?** §5.2's
role-driven rendering is the second answer; the `hub` workspace already is the first. That is a
product decision about the shape of the app and it is not delegated — it is in §13 for the owner.

---

## §13. What is waiting on the owner

Four things in this plan are decisions rather than work. None is blocked on effort — each is a short
change once decided — and each is here because deciding it is not mine to do. §12 is the one that
WAS delegated; these are the ones that were not.

---

### 13.1 The four personal-vs-company pages — one question, not four

`announcements` · `notifications` · `me/privacy` · `my-files`

Each is **ungated and personal**. Each has a company page it looks like it belongs to, gated more
narrowly. Folding any of them in removes it from the nav of everyone outside that page's roles:

| Page | What it is | Where §8 sent it | What that costs |
|---|---|---|---|
| `/admin/notifications` | *"the current user's alerts"*, its own words | Settings (admin only) | every non-admin loses their alert inbox |
| `/admin/me/privacy` | already in the `hub` workspace | Settings (admin only) | every non-admin loses their privacy settings |
| `/admin/announcements` | the release archive the Hub's WhatsNewBanner links every employee to | Settings (admin only) | the banner lands most of the firm on a refusal |
| `/admin/my-files` | the file tree scoped to one person | Files (7 roles) | `employee`, `teacher`, `student` lose their own files |

**The question:** does the **Hub** own the personal view of a thing, or does the **company page**
render a personal view of it for whoever opens it?

- **Hub owns it** — leave all four where they are. The `hub` workspace already is this answer, and
  the cost is four rail links that look like duplicates of company pages.
- **The company page renders it** — absorb all four and widen each destination's roles so nobody
  loses access. §5.2's role-driven rendering is this answer, and the cost is that a page like
  Settings then means two different things depending on who opens it.

Answer it once and all four follow. Answering it page by page is how they ended up inconsistent.

---

### 13.2 `/api/admin/contacts` — the client list is readable by any signed-in account

Names, phones and emails of every realtor, client and repeat customer. A `student` account can read
it. Measured, not inferred.

**Deliberately not closed**, and the reason is the one thing that separates it from the four
boundaries this plan DID close. Research, compliance, company notes and `/admin/team` each had a
narrower statement somewhere in the product — a middleware entry, a registry row — that the API was
not enforcing; closing those was the existing policy finally reaching the data. **Contacts had no
such statement**: the registry row was ungated too, so closing it would be a *new* policy about who
may read the CRM.

Since C13b it sits behind `/admin/messages`, gated to eight roles — but that statement is one this
plan's own merge created, which is not a sound basis for narrowing something on the owner's behalf.

**If the answer is "close it":** gate `GET /api/admin/contacts` to the eight roles on
`/admin/messages`. Verified safe — every caller (the CRM tab, the Hub contacts widget at
`admin`/`developer`/`tech_support`, the job and invoice link dialogs) is used by roles inside those
eight, so nothing that works today stops working.

---

### 13.3 The orphaned designs — RE-MEASURED, and the question changed

When this was written it was "67 locked defaults and 63 dossiers describe routes that no longer have
a registry row". Both halves have moved, and only one of them moved on its own:

| | when §13 was written | after today's walks |
|---|---|---|
| Orphaned **defaults** | 67 | **28** |
| Orphaned **dossiers** | 63 | **63** |

**The defaults are fixing themselves and nothing had to decide anything.** `trace-defaults` retires a
default when it finds the route forwarding — the S2 branch — so walking the tree archived **59
designs** today without being asked. The remaining 28 are simply routes the pass has not reached yet;
finishing it should take most of them.

**And 2 of the 28 are not orphans at all — my definition over-counted.** "Orphaned" here means *not
in `ADMIN_ROUTES`*, and two live pages qualify without having been absorbed by anything:

| Route | What it is |
|---|---|
| `/admin/login` | a real page, deliberately not in the nav registry — you do not navigate to login from a menu |
| `/admin/billing/upgrade` | a real page that was never registered |

Classified: of the 28, **26 are redirect stubs** the pass retires on sight, and 2 are these. So the
defaults half of this question resolves to **zero real orphans** once the walk finishes — and the
count I first put in §13 was measuring "unregistered" while calling it "absorbed".

That leaves 13.3 as one question about dossiers, below.

**The dossiers cannot fix themselves, because there is no mechanism.** `derive-dossiers` skips a
forwarding route — it does not record that the dossier it left behind now describes a redirect — and
`design_page_dossiers` has **no status and no `deleted_at`**: nothing in the schema can express
"retired". So a dossier for an absorbed page sits there looking exactly as current as one for a live
page, which is the rot S2 exists to prevent, on the other half of the same tool.

**So the decision is narrower than §13 first put it.** Not "what do we do about 130 orphans" — the
tracer answered that for its half. It is: **should a dossier be retirable at all?**

- **Yes, by schema** — a `retired_at` column and the same S2 treatment in `derive-dossiers`. Costs a
  migration; makes the two halves of the tool behave alike.
- **Yes, by derivation** — no migration; the dossier board marks any route that is no longer in
  `ADMIN_ROUTES`. Cheaper and cannot go stale, but it says "not in the navigation registry" rather
  than "this forwards now", and those differ for a few routes such as `/admin/login`.
- **No** — a dossier is a description of a page that existed, and an archive of descriptions is
  worth keeping undecorated. Then the orphan count is expected rather than a defect, and should
  stop being counted as a gap.

**One of the three answers is now built, because it decides nothing.** Option (b) — the board says
so — is additive information, reverses freely, and does not foreclose (a) or (c): the dossier list
marks any route with no registry row **"not in the navigation"**. Nothing is retired, no data
changes, and if the answer turns out to be a `retired_at` column the badge is still true.

Verified in a browser: **63 of 133 rows flagged**, which is exactly the measured orphan count, and
the examples are the absorbed routes — `/admin/audit`, `/admin/availability`,
`/admin/billing/invoices`, `/admin/billing/plan-history`.

The wording is deliberately *"not in the navigation"* rather than *"this forwards now"*, because
those differ: `/admin/login` is a real page that is deliberately unregistered, and a badge claiming
it had been absorbed would be a new false statement replacing an old silent one.

**(a) and (c) are still open**, and the badge does not lean on either. What it removes is the part
that was indefensible whatever the answer: 63 dossiers sitting there looking exactly as current as a
dossier for a live page.

Whichever, the asymmetry itself is worth knowing: **one half of this tool retires its stale records
and the other cannot.**

---

### 13.4 P2.2b–d — the receipt per-line accounting question

**Narrowed 2026-08-25: P2.2a was in this group and did not belong.** It shipped. The blocker here is
how a partly-deductible receipt should total, and P2.2a never asked that — it mounted an editor that
already ships to approvers one click away, in the slideshow. Checking the premise cost ten minutes
and returned a whole item.

That is now **five of five** parked premises in this plan that were false or narrower than their
parking note said. The pattern is worth stating as a rule rather than a tally: *a group is blocked
only as far as its blocking question actually reaches, and items get swept into a group by adjacency
rather than by dependency.* Re-read what the question is before believing what it stops.

**P2.2b–d remain blocked — but on a much smaller question than this section has been claiming.**

Checked 2026-08-25, and the framing was wrong. "It needs the answer about how a partly-deductible
receipt should total" describes something **already decided, already implemented, and already on
screen**:

| link in the chain | where |
| --- | --- |
| the enum — `full` · `partial_50` · `none` · `review` | schema CHECK, documented at `app/api/admin/receipts/[id]/route.ts:11` |
| a person sets it | `/admin/receipts` queue, `QueueTab.tsx:85`, labelled **"50% (meals)"** |
| the arithmetic | `deductibleFraction()` → 1.0 / 0.5 / 0.0, `review` → 0.0 *"so the bookkeeper sees a conservative total"* |
| the number reaches a report | `deductible_cents` → `/admin/finances` → `ScheduleCTab` |

So a partly-deductible receipt has totalled correctly for some time. P2.2b even says so in its own
text — *"`receipts.tax_deductible_flag` is the receipt-level answer"* — which means this section
has been quoting a blocker its own action item had already resolved.

**`deductibleFraction()` is the only place that turns the flag into a NUMBER.** Six files know the
flag; five are a `<select>` option, a documented enum, a type union, what the AI may propose and what
an edit may set. That inverts P2.2c's premise — the `effectiveHours` defect it fears has **not**
happened here. P2.2c is a guard against a second definition, not a repair of an existing split.

**One qualification, because the first version of this note overstated it.** The *arithmetic* has one
home; the **constant does not**. `lib/finance/tax-summary.ts` separately tells a person *"Deductible
at 50% — meals and entertainment limit"*, and its own comment says why it is spelled out: *"partial
without the number is the kind of thing that gets re-derived wrongly at filing time."* So the 50 is
written down twice, and the second copy is prose — invisible to any search for a computation. That
is the effectiveHours shape before it has cost anything: not two answers yet, but two places one
answer has to be changed, one of which nobody would think to look at.

**Shipped 2026-08-25 — `__tests__/receipts/one-definition-of-deductible.test.ts`.** Three assertions:
exactly one file pairs `case 'partial_50'` with a numeric return; that fraction is `0.5` and the
sentence still says 50%; and the six files that know the flag are a named list, so a seventh is a
deliberate edit. The predicate was checked against a synthetic second converter, a `<select>` option,
a prose branch and a commented-out case — it catches the first and ignores the other three. A guard
that has never been shown to fail is a guard nobody has tested.

The remaining half of P2.2c — moving the definition into `lib/receipts/` where a second author would
find it — is ergonomics, and can follow at any time.

**What is actually open is one question, and it is narrow:**

> When individual lines carry their own treatment, and the transcribed lines do not add up to the
> printed total — which they routinely do not — what is the receipt's deductible amount?

- **(a) sum the lines.** Honest per line, but it silently replaces the printed total with the AI's
  transcription, and the queue states the opposite: *the receipt's own total is what gets approved*.
- **(b) printed total × the receipt's flag**, lines informational only. Safe, and makes per-line
  marking decorative — which defeats P2.2b.
- **(c) printed total, apportioned by the share the lines say is deductible.** ← **recommended.**
  The printed total stays authoritative; the lines decide the *share*, not the *amount*. Its
  strongest property: with no line overridden, every line inherits the receipt flag, the share
  collapses to that one fraction, and the number produced is **byte-identical to today's**. A change
  that cannot alter any existing figure until somebody deliberately marks a line is the version of
  this that can ship without a reconciliation.

That is a decision, not an accountancy question, and (c) has a defensible default — but it changes
what a tax report claims, so it stays the owner's to make. **P2.2c is not blocked by it** and can be
done first, since it only relocates the single definition that already exists. P2.2d follows P2.2b.

One thing P2.2a leaves behind, stated precisely because it is easy to overstate. `AdminReceiptRow
.line_items` is now read by **nobody**: the queue was its only consumer, and `ReceiptLineItems`
fetches its own from `/api/admin/receipts/{id}/line-items`. Checked across `app` and `lib` — every
other `line_items` in the tree is an *invoice* line item, an unrelated concept with the same name.

So `app/api/admin/receipts/route.ts` still runs an extra `receipt_line_items` query per page of
receipts (lines 253–279) and attaches the result at line 422, to populate a field nothing reads.
`receipt-types.ts` records that adding it there had a measured cost — *"the predicted bill arrived"*.

**Not removed, and deliberately not.** It is outside what P2.2a was asked to do, the query is
best-effort and cannot take the queue down, and P2.2c has to open this file anyway. Deleting a
payload field is also the kind of change that is cheap to make and expensive to be wrong about — the
right moment is when something else is already proving what reads these totals.

---

### 13.5 Checked and clean: nothing was stranded by the consolidation

Two sweeps were run over the finished state, because absorbing forty pages is exactly how a page
stops being reachable without anybody noticing.

**Every `/admin` link still resolves.** 183 routes on disk, and zero `href=` / `router.push` targets
that go nowhere. The first version of this scan reported **17 broken links and every one was a false
positive** — twelve were API paths (`hub-data` maps a widget id to a `path` and fetches
`${origin}/api${path}`, so `/admin/pto` is really `/api/admin/pto`), two were legacy-redirect
SOURCES, one a service-worker scope. A fetch target is not a link.

**Every page can still be got to.** Of 182 admin pages — 75 registered, 106 linked to, the rest
records or stubs — exactly one is neither registered nor linked: `/admin/billing/upgrade`.

It is not stranded. `middleware.ts` sends people there through `upgradePromptUrl()` when a firm hits
a page whose bundle it has not bought, and a constructed URL is invisible to a scan for string
literals. **The check that mattered was the next one:** if that page were itself bundle-gated, a firm
without the bundle would be redirected to it and refused — a loop, and the worst kind, because it
only happens to a customer who is trying to give you money. Measured: `/admin/billing/upgrade`
resolves to `null` and is reachable with no bundles at all.

**One wrinkle in §8 worth recording.** P9 called `billing/upgrade` one of "three sidebar links" and
asked for it to be absorbed. It had a registry row, but functionally it is a destination you are SENT
to rather than one you browse to, and C1 removed the row without making it a tab. That was the right
call for the wrong-looking reason, and it is why this page is the only unregistered one in the tree.

### 13.6 The four closed boundaries broke no caller — checked afterwards, which is late

Five endpoints were gated across C11b-0, C13a and C13c. Each change was verified against the *roles*
it refused, and none was verified against the *callers* it might break. That is the wrong order, and
it is the same omission that nearly cost something on `/api/admin/team/status` — where the check
before the change is what showed the endpoint was open on purpose, because three Hub widgets need it.

Done properly now. Every caller of every gated endpoint:

| Endpoint | Callers outside the route | Inside the gate? |
|---|---|---|
| `/api/admin/notes` | the notes page | yes |
| `/api/admin/compliance` | the Jobs portal + its Compliance tab | yes |
| `/api/admin/research/coverage` · `library` · `billing` · `sites` | their own tabs and panels | yes |
| `/api/admin/research/pipeline` | **`lib/hub/widgets/pipeline-status`** | yes — `['admin','developer','researcher','tech_support']`, all inside `RESEARCH_READ_ROLES` |

The one that mattered is the widget, because the Hub is ungated and this repository's `allowedRoles`
is read by the Add-Widget modal rather than at render — so a widget already on somebody's dashboard
draws for whoever opens it. Checked: on a non-OK response it sets its state to `empty` and renders
its empty state. A refusal degrades to "nothing to show" rather than an error or a blank.

**So nothing broke.** Recorded anyway, because "it turned out fine" and "it was checked" are
different claims, and only one of them was true at the time each change was committed.

### 13.7 The portals on a phone — 17 swept at 390px, all clean

Every browser check in this plan until now was at 1440. That is the gap between *"the tabs render"*
and *"a person on a phone can use them"*, and a strip that pushed the page sideways would have been
invisible to the desktop walks, to `tsc`, and to all 26,226 tests.

| | result |
|---|---|
| Portals swept | **17** (110 tabs) |
| Body horizontal overflow | **0px on every one** |
| Strips that overflow their box but cannot be scrolled | **none** |
| First tab visible on load | **all** |

The ones most likely to break were the crowded ones — `/admin/learn/manage` at **12 tabs**, and
`/admin/equipment`, `/admin/learn` and `/admin/pay` at **10**. All scroll the strip horizontally
without the page moving. That is the reformat-vs-scroll rule `/admin/marketing` set for four tabs,
still holding at twelve.

Nothing to fix. Recorded because a check nobody knows happened is a check that gets asked for again.

### 13.8 A design's state key does not round-trip to a URL — 23 of 110 tabs

**Measured, not inferred:**

```
/admin/billing?tab=history        opens: Plan history    ← the tab's id
/admin/billing?tab=plan-history   opens: Overview        ← the STORED state key
```

The design system derives a state key by **slugging the tab's visible label** (`SELECTED_STATE` in
`scripts/lib/design-observe.mjs`). The URL accepts the tab's **id**. For most tabs those coincide.
For **23 of 110 they do not**:

| Portal | tab id | stored state key |
|---|---|---|
| `/admin/billing` | `history` | `plan-history` |
| `/admin/finances` | `schedule-c` | `job-profitability` |
| `/admin/equipment` | `audit` | `overrides` |
| `/admin/hours` | `team` | `field-team` |
| `/admin/learn` | `flashcard-bank` | `card-bank` |
| …18 more | | |

**Nothing is visibly broken today**, and that is why it is worth writing down. `openState` survives
it by falling back to clicking the label when the URL does not select the state — so the traces
succeed and the record fills up with keys that cannot be turned back into a link. Anything that
reconstructs a URL from a stored key — a "view this tab" action, a deep link out of the designer,
`design/serve` for a state — opens the DEFAULT tab and looks like it worked.

**The blast radius, bounded — this is smaller than it first reads.** The design tools are internally
consistent, because they never depend on the URL working:

· `SELECTED_STATE` derives a key by slugging the label · a design is stored under that key ·
  `clickState` finds a tab by matching the slug of its text against the key.

Derive, store and re-open all speak label-slugs, so they agree. `openState` tries `?tab=<key>` first
and falls back to clicking — for these 23 the URL silently fails and the click carries it, which is
why traces and conformance runs both succeed. The conformance sweep even passes **only** the key,
with no label, and `clickState` handles exactly that case on purpose.

So nothing in the design system is broken today. **What is broken is the assumption that a state key
is a URL**, which is the one thing the key looks like it should be. Any link built from a stored key
— out of the designer, into a report, in a message to somebody — opens the default tab and looks
correct. That is the cost, and it is why this is written down rather than left to be discovered by a
link that goes to the wrong place.

**Two further consequences worth naming.** A key derived from a label means **renaming a tab orphans
its design**, silently. And one label is a template literal, so its key came out as
`recycle-bin-recyclebin-length-0` — a key that is not a slug of anything a person will ever see.

**One half of this was mine and is fixed.** The `recycle-bin-recyclebin-length-0` key came from the
tab catalogue storing a label raw: the label is a template literal, `` `Recycle Bin${n > 0 ? …}` ``,
and a non-greedy match to the first backtick truncates it mid-expression. `derive-portal-tabs.mjs`
now cuts at the first `${` and keeps the fixed part — the part a person actually reads. The
catalogue's label is `Recycle Bin`, and no label in any of the 17 portals still carries an
interpolation.

That does not fix §13.8: the key for that tab is already stored under the old garbage slug, and
changing how keys are derived is the migration described above. What it fixes is the catalogue
producing a new one.

**The fix is available and is a migration, so it is not being made here.** The portal buttons already
carry the id in the DOM — `id="msg-tab-directory"`, `aria-controls="msg-panel-directory"` — so
`SELECTED_STATE` could read the id instead of slugging the label, and the key would round-trip. Doing
that changes the key for those 23 tabs, which orphans the designs already stored under the old ones.
That is a data migration on the design tables, and it belongs to whoever owns that call.
