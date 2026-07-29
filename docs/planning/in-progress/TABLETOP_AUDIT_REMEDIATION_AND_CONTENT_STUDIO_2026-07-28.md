# Tabletop — audit remediation + the Homebrew Content Studio

**Status:** IN PROGRESS · opened 2026-07-28 · **this is the stop-hook doc — work it slice by slice until done**
**Origin:** the 28 Jul 2026 structural audit (41 findings, `~/Downloads/starr-tabletop-audit-2026-07-28.html`)
plus the owner's Content Studio brief of the same day.

> **How to work this doc.** Take the **lowest-numbered unchecked slice** in the lowest unchecked phase and
> do it. One slice = one commit. Each slice ends green: `tsc --noEmit`, `vitest run __tests__/dnd`, `eslint`.
> UI slices are **driven in a browser** before being ticked — this repo's standing rule, and the audit's own
> finding is that a green suite misses rendering bugs. Tick the box, write one line of what actually shipped
> (including anything the slice turned out to be *bigger* than written), and move on.
>
> **Do not renumber slices.** IDs are referenced from commits and from the audit. Insert as `P3-4b` rather
> than shifting everything below.

## ⚑ Priority order — set by the owner, 2026-07-28

> *"For now let's focus on getting all of the classes built, the homebrew building stuff built and surfaced,
> and fix all of the things you noted before. Let's fully build all of that and then once everything is fully
> built and formatted like we want, and everything looks good and mechanics are good and the styling is good,
> then we can work on building a totally interactive map/game session experience."*

**Work the phases in this order**, which is not the order they are written in:

1. **Classes** — P5-8 … P5-12 (below, in Phase 5).
2. **The Content Studio** — Phase 6, built *and surfaced*. "Surfaced" is the operative word: this
   project's characteristic defect is finishing something nobody can click.
3. **The audit findings** — Phases 0 → 5, then 8 → 10.
4. **Then, and only then, Phase 7** — the live synced session.

**Phase 7 is DEFERRED to a future project by owner directive.** Its design stays in this doc because it was
worked out with the owner and re-deriving it later would be waste — but **no Phase 7 slice is to be started**
until the four items above are done and the owner has signed off on mechanics and styling. The stop hook
should skip Phase 7 entirely.

---

## Ground rules (inherited — these bite constantly in this work)

1. **Never invent a rule.** Source-verify every number. Where a source is missing, the item is BLOCKED and
   pinned by a test that flips when the data arrives — not filled in from the shape of its neighbours.
2. **Provenance is not eligibility.** `vanilla` hard-blocks, `custom` flags, `dm-granted` marks. The Content
   Studio must not become a bypass for any of it.
3. **A payload that does not validate is refused, never coerced.** Explain the refusal at authoring time;
   never weaken the validator to make a form pass.
4. **Authored is not shipped.** The audit's single most common defect is *reachable-from-nowhere*. A slice is
   not done until a user can get to it by clicking, starting from the lobby.
5. **Partial is a first-class state.** A class built to level 5 is `partial` — rendered as such, adoptable to
   the level it covers. Not an error, not a blocker.

---

## ⚑ QA log

- [x] **QA-1 — First browser/server pass over everything shipped on this branch. 2026-07-28.**
      Run because ~30 slices had shipped verified only by `tsc` + vitest, and this repo's own record is that
      a green suite misses rendering-condition bugs. Dev server on :3011 (3000–3009 are dead zombie
      sockets), session minted rather than creating live test data — both per the project's QA notes.
      **Result: clean. No defects found**, across 8 compiled routes and 0 server errors or warnings.
      Verified: `/dnd`, `/dnd/library`, `/dnd/content` (+ `?tab=mine`, `?kind=`), `/dnd/content/new` (+ 4
      kinds), `/dnd/characters` (+ system and query filters). The kind picker renders **all 18** kinds; the
      creature form renders the **statblock**, **list** and **effects** editors and the artwork field; the
      class form renders **Level by level**, **Build from scratch** and the partial-build message; a
      prose-only kind shows the **"not adopted onto a sheet"** notice. All four new header doors
      (`/dnd/characters`, `/dnd/content`, `/dnd/content/new`, `/dnd/profile`) and all three lobby content
      buttons are in the rendered HTML.
      **One genuinely useful negative result:** `/dnd/content` returns 200 and shows "No custom content has
      been published yet" against a database where **`dnd_homebrew` does not exist** (seed 455 unapplied).
      The defensive loaders degrade exactly as designed rather than 500-ing the page.
      **What this pass did NOT cover, and it matters:** it drove HTTP and read rendered HTML. **No
      JavaScript executed and nothing was clicked.** Tab switching, the AI "help me" button, file upload,
      the transposer's retry loop, adopt, and every form submission are unverified. That is QA-2.

- [ ] **QA-2 — Interaction pass.** Drive the same surfaces with a real browser: switch a sheet tab, press
      "help me", upload a file, save a piece, adopt it onto a character, run a transpose and retry it. Needs
      seeds 455–457 applied to a scratch database first, since most of these write.

## Phase 0 — Do these first (hours, not days)

- [x] **P0-1 — ~~Merge the edit-history exposure fix.~~ ALREADY DONE — and this slice was written on a false
      premise. Closed 2026-07-28 with a correction rather than a commit.**

      `git merge-base --is-ancestor 6a014d6b main` → **true**. The gate is live in
      `edits/route.ts` (GET returns 403 when `!canWrite`, checked before any row is read), and
      `__tests__/dnd/edit-history-access.test.ts` covers it in eight assertions including the
      public-character case and the ✎-tooltip consumer's graceful degradation.

      **Where the false premise came from, because it is the interesting part.**
      `DND_OWNER_DECISIONS_2026-07-27.md` §1 says the commit is *"sitting unmerged on
      `fix/variant-ux-2026-07-25` behind ~250 others"* and calls it *"the only live exposure"*. The audit
      restated that verbatim as finding F-4 and ranked it first on the roadmap. **Neither checked git.** It
      had been merged; the doc simply went stale after it was written.

      That is precisely the defect that same doc warns about twice in its own header — *"a figure that has to
      be maintained by hand will go stale"* and *"prose kept asserting what the evidence had moved past"* —
      so the audit reproduced the failure mode it was reading about. **The rule this earns: a planning doc's
      claim about the state of the code is a lead, never a finding.** Verify against the code or the history
      before repeating it, especially when the claim is alarming enough to reorder a roadmap.
      §1 of the decisions doc is corrected in place so the next reader does not inherit it.

- [x] **P0-2 — Widen the homebrew kind vocabulary.** `HOMEBREW_KINDS` gains `creature`, `background`,
      `condition`, `action`, `rule` (13 → 18), with labels. Prerequisite for the whole Studio.
      **Shipped 2026-07-28.**

- [x] **P0-3 — The kind registry.** `lib/dnd/homebrew/kinds.ts` — the declarative field schema that makes the
      builder adjust to the chosen kind, plus `kindIsMechanicalIn` / `proseOnlyNotice` (the honesty layer:
      a kind that cannot carry mechanics in a system SAYS SO instead of pretending), `blankDraftFor`,
      `validateDraftFields`, `isPartialBuild`. **Shipped 2026-07-28.**

- [x] **P0-4 — Link the three homebrew designers. Shipped 2026-07-28.** New `HomebrewDesignerLinks`
      (server component — three links and a system check need no client JS), mounted on the character sheet
      page inside the existing `canWrite` guard. Gated on `isSharedEngineSystem`, and the gate ships in the
      SAME slice as the link on purpose: the designer pages carry no system guard of their own (they never
      needed one while nothing linked to them), so wiring the link without gating it would have converted a
      harmless orphan into a live trap — a PF2 character authoring a 5e `ClassDefinition` its engine cannot
      resolve. PF2/IG get an honest explanation plus a pointer at the escape hatch that does work there.
      8 assertions in `homebrew-designer-reachability.test.ts`, deliberately about WIRING rather than
      behaviour: the link exists, the component is *mounted* (the half A-3 was missing — a link component
      nobody renders is the same defect one level up), and the gate holds in both directions.
      *Original slice text below.*

- [ ] ~~**P0-4 — Link the three homebrew designers.**~~ *(audit A-3 — the highest value-per-hour item found.)*
      `/build/class`, `/build/subclass` and `/build/feat` are complete, tested, working, and **nothing in the
      codebase links to them**; a repo-wide search returns only their own header comments. Add entries to
      `CharacterBuildKit` and to the escape hatch's homebrew tier.
      **Design:** they are gated on `isSharedEngineSystem` — they emit the 5e `ClassDefinition`/`CustomFeat`
      shapes, and a PF2/IG character reaching them would author content its engine cannot consume. Show the
      Studio link instead for those systems.
      **Done when:** a 5e character can reach all three by clicking from the sheet, a PF2 character cannot,
      and a test asserts the reachability matrix in both directions.

- [x] **P0-5 — Delete the orphaned components; restore the format preview.** *(A-1, A-2.)* `TemplateBrowser`
      and `SheetStyleBrowser` are rendered nowhere — `SheetChrome` replaced them — while
      `format-preview.test.ts` still asserts against `TemplateBrowser`'s source, keeping dead code green.
      Delete both; move `<FormatPreview id={t.id}/>` into `SheetChrome`'s template row so players stop
      choosing between Classic / Codex / Dashboard / Play blind; re-point the test at `SheetChrome`.
      **Done when:** the four formats show their layout diagram in the picker, and no `_ui/*.tsx` default
      export is unreferenced (add the guard in P4-6).

      **Done 2026-07-28** — shipped across P0-5 and P4-6, and only the checkbox was outstanding. Both
      orphans are deleted, `SheetChrome:150` renders `<FormatPreview id={t.id} />` in the template row, and
      `format-preview.test.ts` was re-pointed at `SheetChrome` with the two deleted paths pinned as
      must-stay-gone. The guard this slice asked for is `no-orphan-components.test.ts`.

---

## Phase 1 — Quick wins (each ≤ half a day)

- [x] **P1-1 — Initiative HP for every system.** *(B-3.)* `encounters/[id]/entries` seeds HP from
      `c.data?.combat` — the 5e shape — so PF2 (`data.pf2e`: `ancestryHp` + `classHpPerLevel` + CON/level)
      and IG (`data.ig.hitPoints`) combatants enter the tracker with **null HP, silently**.
      **Design:** a `maxHpFor(system, data)` dispatcher beside the per-system `resolve.ts` modules; both
      systems already compute final HP, so this is wiring, not rules. **Done when:** adding a PF2 and an IG
      character to an encounter seeds correct HP, with a test per system.

      **Done 2026-07-28.** `lib/dnd/combat-hp.ts` — `resolveHp(system, data)`, dispatching to `pf2MaxHp` and
      `igMaxHp` rather than re-deriving either formula. The route now selects `system` too; without it the
      resolver would fall back to 5e for everyone, which is the original bug wearing a new function's name.
      Four decisions worth recording, three of them found only by reading the models rather than trusting
      the plan:

      · **PF2 stores `currentHp`, not damage-taken.** I wrote the resolver assuming `combat.damage` counted
        up from zero. `combat.damage` is a **weapon's** damage die (`"1d8"`); PF2 characters carry
        `combat.currentHp` like 5e. Caught by checking `model.ts` before running anything.
      · **`system` decides, never sidecar-sniffing.** A transposed character can keep a stale `data.pf2e`
        after switching back to 5e, so "use whichever sidecar exists" would seed the tracker from the dead
        one. Pinned with a both-sidecars test.
      · **A blank sheet resolves to null, not to 1 HP.** `pf2MaxHp` floors at 1 and `igMaxHp` at 0; both are
        arithmetically right and useless as combat stats. Seeding them would put a 1-HP combatant in the
        tracker looking like real data — null is what the route already does when it finds nothing.
      · **`currentHp: 0` on a fresh PF2 sheet means "unset", so it seeds FULL.** Read literally it means
        unconscious. A character joining an encounter is joining a fight, and PF2 tracks genuinely-dying
        characters on `dyingValue`, so nothing is lost.

      Scope checked, not assumed: `entries/route.ts` was the only HP-seeding caller in the codebase, and
      `InitiativeTracker` sends `hp` only when the DM types one, so the auto-seed path is live. An explicit
      value still wins. Suite 1274 files / 18,250 tests green; typecheck and lint clean.

- [x] **P1-2 — Currency on the PF2 and IG sheets.** *(C-3.)* `lib/dnd/currency.ts` + `Character.currencies`
      is 5e-only; neither bespoke sheet can hold a copper piece. The module is already system-agnostic in
      shape — lift it to a shared sidecar field and render it in each sheet's equipment area (PF2's arrives
      with P5-1). **Done when:** a PF2 and an IG character can hold and spend coin, and the AI
      add/set/remove-currency tools work on both.

      **Done 2026-07-28**, and the slice was bigger than the entry implies for a reason worth recording.

      **The PF2 "half" that already existed was decoration.** The PF2 sheet has been rendering a money row
      since an earlier pass, and `currencies?: Currency[]` sits on both bespoke models. But **nothing in the
      codebase could write either field** — no edit op, no builder input, no route. `grep currencies
      lib/dnd/systems` returned exactly two lines: the two type declarations. Both sheets rendered
      `defaultCurrencies(system)` and always would have. That is the failure mode this audit keeps finding,
      in its most flattering disguise: the feature is visible on the sheet, showing 0 gp, forever.

      So the real work was the **write path**, and it is now shipped end to end:
      · `applyCurrencyEdit` / `matchCurrency` in `lib/dnd/currency.ts` — the add/set/remove semantics, once.
      · `add_currency` / `set_currency` / `remove_currency` on **both** `applyPf2Edit` and `applyIgEdit`,
        delegating whole. Op names match 5e's deliberately so the AI's vocabulary for money is one
        vocabulary rather than three.
      · Both `parsePf2Edit` and `parseIgEdit` needed their own branches — field parsing is a per-op
        whitelist in both, so without them the ops would pass the enum check and reach the engine stripped
        of every field.
      · Both AI tool schemas gained `currency` / `abbrev` / `rate`; without them a model could name the op
        and never say which coin or how much.
      · IG's model gained `currencies`, and its equipment panel renders the purse — with `hasCoin` folded
        into `hasEquipment`, because otherwise a character who owns money but wears nothing would have the
        whole panel hidden and their purse with it. That is the buried-control bug this sheet has had before.

      **5e is deliberately NOT re-pointed** at the shared helper. Its inline implementation is well-tested
      and re-pointing it is a behaviour-preserving refactor that deserves its own slice, so the guard
      against drift is a test that runs the same inputs through both and compares — which also proved the
      new helper matches 5e exactly. **P1-2b** if that refactor is ever wanted.

      One test correctly broke: `ig-edit`'s "accepts every valid op" sweep assumed every non-HP op is
      identified by `name`. `set_currency` uses `currency`, because a coin is matched by name, abbrev **or**
      id. Taught the sweep rather than renaming the field.

      Suite 1275 files / 18,273 tests green; typecheck and lint clean.

- [x] **P1-3 — Explain the 2014 feat catalogue.** *(C-8.)* `FEATS_2014` holds exactly one entry (Grappler)
      and can never hold more — the rest is PHB-only content outside the CC-BY licence, so **homebrew is that
      edition's only real feat route**. One line of copy at the 2014 ASI slot pointing at "＋ Add a different
      feat". **Done when:** the 2014 ASI step reads as a constraint rather than as an empty list.

      **Done 2026-07-28.** A 2014-gated note under `AsiFeatPicker`'s select: one official feat, the rest is
      outside the open licence and so *deliberately absent rather than missing*, use **✎ Custom feat…**, and
      custom picks are *flagged for DM review, not blocked* — that last clause matters, or "use custom"
      reads as a dead end to anyone on a vanilla-only table.

      **The explanation already existed; nothing rendered it.** `FEATS_2014_STATUS` has carried
      `completeForSources: true`, `completeForEdition: false` and a full paragraph of reasoning for a long
      time, and its only consumer was a code comment in this very file. The data was never the gap. This is
      the same shape as P1-2 and P5-6 — the third slice running where the work was already done and simply
      had no door — and the picker needed a new `system` prop before the note could render at all, which is
      pinned by a test for exactly that reason.

      The note is gated to 2014 by equality, not by exclusion: it would be false for 2024 (full catalogue)
      and a category error for PF2/IG (own feat tracks, no ASI slot). A test asserts the other three systems
      cannot reach it, and another asserts `FEATS_2014` still holds exactly one feat — so if a legitimately
      licensed 2014 feat is ever added, the copy is forced to be revisited rather than quietly going stale.

      Suite 1276 files / 18,280 tests green; typecheck and lint clean.

- [x] **P1-4 — Gate the dev routes.** *(D-5.)* `/dnd/hextech-demo`, `/dnd/preview/edit-flow` (self-described
      DEV-ONLY), `/dnd/Lazzuh_Gun` and `/dnd/login` all ship to production unlisted and indexable. Gate the
      two harnesses behind `NEXT_PUBLIC_E2E_HARNESS`; add `noindex` metadata to all four.

      **Done 2026-07-28 — but D-5 was mostly wrong, and the corrections are the valuable part.** Checked
      against the source, three of the four named routes dissolved and so did the "indexable" claim:

      · **`/dnd/hextech-demo` — the one real defect.** Its own header read *"Auth-gated with the rest of
        /dnd (it's an internal style guide)"*, and that stopped being true on **2026-07-06**, when the owner
        made /dnd public by direct link — `dndGate` returns `NextResponse.next()` for everything unless
        `DND_REQUIRE_LOGIN=1`. An internal style guide, live to anyone with the URL, describing itself as
        protected. The stale comment is precisely why nobody re-checked. Now gated + comment corrected.
      · **`/dnd/preview/edit-flow` — already gated**, and more strictly than this slice proposed
        (`NODE_ENV === 'production'` → `notFound()`). Re-pointed at the shared rule so the two harnesses
        cannot drift, which also gives it the `NEXT_PUBLIC_E2E_HARNESS` escape for deployed screenshots.
      · **`/dnd/login` — not a page.** A four-line `redirect('/dnd')` kept so old bookmarks resolve.
      · **`/dnd/Lazzuh_Gun` — not a dev route.** The owner's personal sheet, deliberately public and
        localStorage-backed, explicitly exempted in `middleware.ts`. **Gating it would have broken it**, so
        there is now a test asserting it stays ungated — the opposite of what the slice asked for.
      · **"indexable" was wrong for all four.** `app/dnd/layout.tsx` sets `robots: { index: false, follow:
        false }` on the whole subtree, and the two pages that could matter re-declare it themselves.

      `lib/dnd/dev-routes.ts` holds the rule once. This is the second time this audit has had a finding
      largely evaporate under checking (after F-4), and the standing lesson holds: **a planning doc's claim
      about the state of the code is a lead, never a finding.** Suite 1277 files / 18,291 tests green.

- [x] **P1-5 — Session scheduling, surfaced.** *(B-5.)* `dnd_sessions.scheduled_at` exists in the schema and
      is in the PATCH route's `WRITABLE` list. **Nothing sets it and nothing renders it.**
      **Design:** a datetime field on session create/edit; a "Next session" banner on the campaign hub for all
      members; store UTC, render in the viewer's locale. RSVP is out of scope (P3-5).

      **Done 2026-07-28**, and B-5 was accurate — a welcome change after D-5. The column was even further
      along than the entry says: the campaign GET already `SELECT`ed it and passed it through untouched.
      **The client type simply omitted it**, so it was invisible to every consumer on that page. Adding one
      optional field to an interface is what made the data appear. Fourth "ready and unreachable" find in
      this audit, after the currency fields, `FEATS_2014_STATUS`, and the PF2 builder's `picks.languages`.

      `lib/dnd/session-schedule.ts` holds the logic, pure, because the timezone half is what fails quietly:
      · `toLocalInputValue` deliberately does NOT use `toISOString().slice(0,16)` — that renders the UTC
        wall clock into a control that means local time, so a 19:00 session shows as 18:00 for half the year
        in London and nobody notices until someone arrives an hour early. Tested as a round-trip so it holds
        in whatever zone CI runs in, plus one explicit wall-clock assertion.
      · An empty field maps to `null`, which is what lets a DM UNSCHEDULE rather than being stuck with
        whatever they first picked.
      · `nextSession` excludes `done` (a session finished early is not what the party is doing next) but
        keeps a `live` session whose start time has passed — that is the one happening right now, and hiding
        it is exactly when the banner matters most.

      The control is DM-only; the banner is for **every** member, since knowing when to show up is the one
      scheduling fact a player needs. Suite 1278 files / 18,311 tests green; typecheck and lint clean.

- [x] **P1-6 — One upload-limit module.** *(F-6.)* Six different ceilings (5/8/12/15/20/25 MB) hard-coded
      across eight routes. One constants module; keep the per-route values, stop duplicating them.

      **Done 2026-07-28.** The count was understated: **seven distinct values across twelve routes**, and
      two of those routes were added *by this audit* — the duplication was still growing while the finding
      sat open. `lib/dnd/upload-limits.ts` now holds all of it.

      **Named by PURPOSE, not by size.** `AVATAR` / `IMAGE` / `DOCUMENT` / `HANDOUT` / `MEDIA` / `AUDIO` /
      `LARGE_FILE`. Three routes share `LARGE_FILE` because they take big arbitrary files for the same
      reason, two share `HANDOUT` because they show things mid-session. That is what makes "raise the map
      limit" a one-line change rather than a grep-and-hope. The values themselves stay distinct, per the
      slice's own instruction — an avatar and a battle map should not share a budget.

      **The limit was written TWICE per route**, which the finding did not mention: once as arithmetic and
      once as English ("Image must be 8 MB or smaller."). The prose copy is the one that goes stale
      silently, because no test reads an error string — so `tooLargeMessage(MAX_BYTES, 'Image')` now builds
      it. The wording is preserved verbatim; the /dnd routes already agreed on it, and inventing new copy
      inside a refactor is how a consolidation becomes unreviewable.

      **The risk in this slice was re-tuning while consolidating**, so a test pins every one of the twelve
      routes to the exact byte value it enforced beforehand, and another fails if any route reverts to
      inline `N * 1024 * 1024`. Also pinned as intent: the two bulk routes (`characters/import`,
      `characters/[id]/uploads`) deliberately SKIP oversized files rather than failing the whole upload,
      which someone tidying for consistency would otherwise "fix".

      Not touched: the admin-side ceilings (`app/api/admin/**`, 25/5/8/10/40/50 MB). Out of this audit's
      scope, and worth their own module rather than being annexed into a /dnd one.

      Suite 1279 files / 18,352 tests green; typecheck and lint clean.

---

## Phase 2 — Safety, privacy & cost

- [x] **P2-1 — A rate limiter. Shipped 2026-07-28.** `lib/dnd/rate-limit.ts` + `seeds/456_dnd_rate_limits.sql`,
      applied to all six AI routes and to login.
      **Postgres, not an in-memory map.** The obvious implementation is a module-scope `Map`; on serverless
      that is worth roughly nothing — every cold start gets a fresh one and concurrent instances each keep
      their own, so the effective limit becomes `limit × instances`. It appears to work in development and
      does not in production.
      **Fixed window, not a sliding log:** one row per (bucket, subject, window) and a single upsert on the
      hot path, at the cost of a boundary burst. For "stop someone looping an expensive endpoint" that is
      the right trade. Old windows are swept opportunistically (~1 request in 200) rather than by a cron
      that could silently stop running.
      **It fails OPEN, and the file argues why:** a broken limiter must not take the tabletop API down with
      it. A limiter is a cost-and-abuse control, not an authorization gate — and the authorization gates,
      which fail closed, are deliberately separate from it.
      **Login is limited on the address AND the name being attempted** (address alone misses a distributed
      attack on one account; name alone misses one password sprayed across many), and the attempt is counted
      **before** the password is verified — counting only failures would let an attacker holding one correct
      credential reset their own budget.
      Buckets: `ai` 30/hour · `login` 10/15min · `write` 300/5min. **`write` is defined but not yet applied**
      — the AI routes and login were the exposure; broad write throttling is P2-1b.
      *Original slice text below.*

- [x] **P2-1b — Apply the `write` bucket to ordinary write routes.** The policy exists and is tested; what
      is left is opting the ~100 write handlers in. Low risk, mechanical, and genuinely lower value than the
      two surfaces already covered.

      **Done 2026-07-28 for the ELEVEN UPLOAD ROUTES**, which is deliberately not all 124 write handlers —
      see the scope note below. `enforceRateLimit(bucket, userId)` in `lib/dnd/rate-limit.ts` makes opting
      in one line and returns **a ready 429 or null**, so the call site is a guard clause; a boolean would
      let a caller forget to `return` and sail past its own refusal.

      **"Low risk, mechanical" was wrong, and the way it went wrong is the lesson.** The scripted edit added
      the import to eleven routes and the guard to **three** — the regex assumed LF and eight of the files
      are CRLF. Typecheck passed (an unused import is not an error), lint passed, every route still worked,
      and eight upload endpoints were completely unthrottled while looking done. Caught by checking each
      file for the guard rather than for the import. That check is now `every importer also GUARDS`, plus a
      second test that every `const limited = …` has a matching `if (limited) return limited;` — a
      half-applied security control is invisible in every other signal.

      Scope, chosen rather than defaulted: **uploads first, because abuse there costs stored bytes**, not
      just rows. The remaining ~113 write handlers are row-creating and cheap, and blanket-wrapping them is
      a large mechanical diff with real regression surface (each has its own auth idiom — three of the
      eleven here already needed bespoke handling: `auth` instead of `session`, and `CharacterAccess`, which
      carries no user id at all). **P2-1c** if the row-creating routes are ever wanted.

      One test of mine was wrong and fixed rather than loosened: "auth precedes throttle" took `Math.max` of
      two markers, which compared the throttle against an `res.status` in a *different handler* further down
      the same file. Earliest marker, not latest.

      **Inert until seed 456 is applied** — `checkRateLimit` fails OPEN when `dnd_rate_limits` is missing,
      by design, so nothing breaks in the meantime and nothing throttles either. Suite 1280 files / 18,380
      tests green.

- [ ] ~~**P2-1 — A rate limiter.**~~ *(F-1 — critical.)* There is **no throttling anywhere** across 113 routes,
      nine of which call a paid model. Anyone can register with a 4-character name and password and loop them.
      **Design:** `lib/dnd/rate-limit.ts` — a fixed-window counter keyed on `session.userId` (falling back to
      IP for unauthenticated routes), stored in a small Postgres table so it survives the serverless
      cold-start problem an in-memory map has. A `withRateLimit(handler, { bucket, limit, windowSec })`
      wrapper so a route opts in with one line. Return 429 with `Retry-After` and a human message.
      **Apply first to:** `ai/test`, `characters/[id]/ingest`, `characters/[id]/variants`, `library/chat`,
      `sessions/[id]/{ai-notes,recap}`, `stream/{direct,mood-refresh,spam}`, and every Studio AI route.
      **Done when:** an over-budget caller gets a 429 that says when to retry, and a test proves the window.

- [x] **P2-2 — A per-user AI spend ceiling.** Building on P2-1: a daily token/call budget per user, surfaced
      honestly in the UI ("AI assists: 34 of 50 today") rather than failing opaquely. **Done when:** the
      ceiling is visible before it is hit, not only after.

      **Done 2026-07-28.** An `ai-daily` bucket (120/24h), `enforceAiLimits` on all ten AI routes,
      `GET /api/dnd/ai/budget`, and `AiBudgetMeter` mounted on the librarian and the Content Studio.

      **"Visible before it is hit" is what forced the design.** A meter cannot be built on `checkRateLimit`,
      because that function INCREMENTS — it is the enforcement path. A UI calling it would spend a unit of
      allowance every time the number rendered, and a component that polled would exhaust the budget by
      displaying it. Hence `peekRateLimit`, a non-consuming read, and a test asserting the budget endpoint
      never calls the enforcing form. That bug writes itself if the only available function is the
      enforcing one.

      **Why a daily bucket is a second control, not a tighter one.** Someone pacing themselves at the
      hourly limit spends 30 × 24 = **720 calls a day** without ever tripping it. The test asserts
      `daily.limit < hourly.limit * 24`, so this can never quietly become decoration. Checked hourly-first,
      because "give it a few minutes" is actionable and "wait 24 hours" is not.

      **A bug found while writing it:** the opportunistic sweep deleted rows older than a hard-coded 24h,
      which exactly EQUALLED the new `ai-daily` window. A sweep firing late in a day would have been minutes
      from deleting the row it was still counting against — silently refunding someone's whole daily budget.
      `SWEEP_RETAIN_SEC` is now derived as twice the longest bucket, so a future weekly bucket cannot
      outgrow it.

      Seven tests failed correctly and were **re-pointed, not loosened** — five named `checkRateLimit('ai',
      …)`, which would now fail against code that is strictly *more* limited than before, and the `status:
      429` assertion had to follow the literal into the wrapper (asserting it per-route would be asserting
      the duplication came back). My own P2-1b guard also needed widening: it listed two call shapes and
      `enforceAiLimits` was a third, so it reported eleven false positives.

      The meter stays silent below 25% of either window — "0 of 120" on every page is noise, and noise is
      how a warning stops being read. Inert until seed 456. Suite 1281 files / 18,406 tests green.

- [x] **P2-3 — Login throttling + a real password floor.** *(F-2.)* No attempt counter, no lockout, no
      backoff, against a 4-character minimum. Exponential backoff per name and per IP (same limiter);
      raise the minimum to 8 for **new** accounts only, so no existing player is locked out of their own
      characters. **Done when:** repeated failures back off, and the uniform "Invalid name or password"
      response is preserved (it already correctly avoids enumeration).

      **Done 2026-07-28, and it found something considerably worse than F-2 described.**

      **P2-1's login throttle was on the route nobody uses.** It limited `app/api/dnd/auth/login` — the
      LEGACY email route. Every real sign-in goes through **`auth/quick`** ("SIGN IN / CLAIM NAME"), which
      verifies a bcrypt hash and had **no throttle at all**. Nor did `auth/signup` or `auth/register`. Three
      of the four password doors were wide open the entire time F-2 was recorded as addressed by P2-1. All
      four are now counted, on shared subjects (`loginSubjects`), before verification.

      **Raising the minimum in the obvious place would have locked existing players out.** `auth/quick` is
      ONE handler that both claims a name and signs in to an existing one, and its length check ran *before*
      that branch. Changing `MIN = 4` to `8` there — the natural edit — would have rejected every existing
      player whose password is four characters, at sign-in, on their own account, with a message about
      password length. The floor now sits on the create path only, `MIN_SIGNIN_PASSWORD_LENGTH = 0` is
      exported as a named decision so it does not read as an oversight, and a test asserts the floor appears
      *after* the `if (existing)` branch.

      **The same trap exists client-side and is worse there.** `HubSignIn` posts to `auth/quick` and cannot
      know whether a name is new until the server answers. Its `minLength` stays **4** — raising it would
      block an existing player in the browser, before any request was made, which no server-side fix could
      undo. A hint names the 8-character floor for new names instead.

      Exponential backoff was NOT added: the fixed-window counter already refuses after 10 attempts per
      15 minutes per name *and* per address, which is a harder wall than backoff and simpler to reason
      about. Backoff would matter if the limit were generous; at 10 it is not. **Not deferred quietly —
      this is a decision that the existing control is sufficient.**

      Three tests were re-pointed rather than loosened, one of which was pinning the OLD policy outright
      (`expect(ROUTE).not.toContain('at least 8 characters')`). Suite 1282 files / 18,429 tests green.

- [x] **P2-4 — Account recovery.** *(F-3.)* Identity is `name:<normalized>` with no email; a forgotten
      password means every character, variant and membership on that account is **permanently unreachable**,
      with no admin path.
      **Design:** (a) a change-password control that knows the old one; (b) a one-time recovery code shown
      once at signup and on demand, stored hashed; (c) *optional* recovery email — offered, never required,
      preserving the no-email design. **Done when:** a user who forgets their password has a route back that
      does not involve the owner editing the database.

      **Done 2026-07-28.** `seeds/458_dnd_account_recovery.sql`, `lib/dnd/recovery.ts`, three routes
      (`auth/password`, `auth/recovery-code`, `auth/recover`), `AccountSecurity` on the profile page, and
      `/dnd/recover` linked from the sign-in form.

      **(a) shipped, and it was worse than "no reset flow" — there was no way to change a password AT ALL.**
      Not a missing recovery path; a missing change control, for a signed-in user who knew their password
      and wanted a different one. It requires the old password anyway: a session on a borrowed machine must
      not be enough to lock the real owner out.

      **(b) shipped as a single-use hashed code.** The design constraint worth recording: the code must not
      become a *second password*. Redeeming clears `recovery_hash` **in the same update** that sets the new
      one, so there is no window where the code has been spent and still works. A permanent secondary
      credential on every account forever would be strictly worse than no recovery, because it looks
      responsible.

      Three details that would each be a plausible-looking bug:
      · **Rejection sampling.** A naive `byte % 27` over 0..255 skews the first few letters. Tested by
        feeding only bytes from the biased tail and asserting no code is produced.
      · **Forgiving about layout, strict about content.** Case, hyphens and spaces are normalised; glyphs
        are never guessed. A typed `0` is not read as `O` — guessing would let a wrong code match.
      · **Uniform refusal.** Unknown name, no code issued, wrong code and malformed code all return one
        message. Anything else confirms which names exist and which are recoverable, on an unauthenticated
        endpoint.

      **`/dnd/recover` is exempted in middleware**, because everyone who needs it is locked out by
      definition — gating it behind a session would redirect them to the sign-in page they cannot get past.
      That is a recovery route that only works for people who do not need it, and it is the exact shape of
      failure this audit keeps finding.

      **(c) optional recovery email — DEFERRED**, and this is a decision rather than an omission: /dnd has
      no mail infrastructure at all (no sender, no templates, no verification flow), so it is a
      multi-slice build for a feature whose entire value is duplicated by the code above. The no-email
      design is preserved either way. **P2-4b** if the owner ever wants it.

      My own P2-3 test caught the three new password routes and failed until they were added to its list —
      the guard working exactly as intended. Suite 1283 files / 18,453 tests green.

- [x] **P2-5 — Campaign visibility, archive and delete. Shipped 2026-07-28.** *(Audit D-2, the last privacy
      item.)* `seeds/457_dnd_campaign_visibility.sql`, a filtered/bounded/ordered public index, a `DELETE`
      handler, and a DM control on the manage page.
      **The backfill decision is what makes this real rather than decorative.** Existing campaigns become
      **`unlisted`, not `public`** — backfilling to public would preserve the exact leak the column exists
      to close. And `unlisted` is not destructive: every link keeps working, members see no change, and only
      strangers stop reading a roster off a public index. New campaigns default to unlisted too.
      **The index was worse than "unfiltered":** it also ordered *ascending*, so a growing site pushed every
      live table below years of abandoned ones, and it had no bound at all. Now public + non-archived,
      newest first, capped — **plus the viewer's own campaigns whatever their visibility**, because "where
      did my table go" is a worse experience than a slightly longer list, and it is their data.
      **Archive is the default; the hard delete needs `?hard=1` and a second confirmation** that names what
      it destroys. A campaign cascades to sessions, recaps, roll history, invites and the roster — and the
      hard delete **detaches characters first**, because they belong to their owners and the FK cascade
      would otherwise let a DM closing their table delete other people's characters. Pinned by test.
      The control rolls its highlight back if a save fails: a toggle showing the state you *asked for*
      rather than the state that *saved* is how someone believes their campaign is private when it is not.

- [x] **P2-6 — A route-gate guard test.** *(F-5.)* RLS is enabled on the D&D tables with **zero policies**,
      so all authorization is app-code-only across 113 routes with no database backstop. Writing real
      policies is the fuller answer; the cheap 90% is a test that every `route.ts` under `app/api/dnd`
      references one of the known gate helpers (`getDndSession`, `getCampaignRole`, `getCharacterAccess`,
      `requireCharacterWrite`, `isDndOwner`), failing loudly on a new ungated route.
      **Done when:** adding an ungated route turns the suite red.

      **Done 2026-07-28.** `__tests__/dnd/route-gate-sweep.test.ts` scans all 126 routes.

      **The "done when" was VERIFIED, not assumed.** I dropped a deliberately ungated
      `app/api/dnd/__gate_probe/route.ts` that calls `supabaseAdmin...delete()` with no auth, confirmed the
      suite went red naming that exact file, then removed it. A guard nobody has watched fail is a guard
      nobody knows works — and this repo has already shipped two tests (`hidden-systems`,
      `under-construction-gating` in P4-6b) that passed while asserting against dead code.

      **Good news from the sweep: there are no ungated routes.** Nine are exempted, every one an auth
      endpoint or public read-only catalog, each with its reason recorded. Three secondary assertions keep
      the exemption list from rotting into permission to skip the check: exemptions must be auth-or-catalog
      paths (a `characters/` entry appearing there would be a bug), the public ones must never write, and
      every auth exemption must be **rate limited instead** — trading a session gate for no control at all
      is the failure this would otherwise hide.

      **My first draft produced a false positive**, and the fix mattered. `isDndOpenAccess` was missing from
      the helper list, so `dev/enter` was reported ungated. Reading it showed the opposite: it requires
      open-access mode, restricts to the demo roster or a real campaign member, *and* refuses any
      password-protected account. An incomplete helper list makes this test cry wolf, and a test that cries
      wolf gets exemptions added to silence it rather than bugs fixed.

      Scope: this proves a gate is PRESENT, never that it is correct — `character-mutation-authorization`,
      `delete-route-authorization` and the other targeted tests do that. Presence is the failure mode that
      scales with route count. Real RLS policies remain the fuller answer and are **not** this slice;
      logged as **P2-6b**. Suite 1284 files / 18,462 tests green.

- [x] **P2-7 — Per-user storage quota.** *(F-6.)* No cap on total stored bytes; one account can fill the
      media bucket. A total-bytes check on upload with a clear message.

      **Done 2026-07-28 — Phase 2 complete.** `seeds/459_dnd_storage_ledger.sql`, `lib/dnd/storage-quota.ts`
      (pure) + `lib/dnd/storage-ledger.ts` (I/O), wired into all seven upload routes and all three delete
      paths. 500 MB per account.

      **A ledger, not a column.** Neither `dnd_media` nor `dnd_character_uploads` records a byte count, and
      they are not the only writers — avatars, homebrew art and soundboard audio land elsewhere or are not
      recorded at all. Summing what those tables happen to know would undercount by construction and drift
      further with every new upload surface.

      **THE RELEASE PATH IS THE POINT.** A quota that only counts upward looks perfectly healthy for months
      and then locks every active account out permanently, all at once — a failure a reviewer never sees and
      a user cannot work around. So `releaseStorage` is wired into every delete path, it sits **outside** the
      try/catch around the storage removal (the row is gone and the user cannot reach the file, so
      continuing to charge them is the worse error), and it gets more tests than the ceiling itself.

      Three decisions that would each be a plausible bug the other way:
      · **The incoming size is included** in the check. `used >= limit` alone lets every account overshoot
        by one file — at a 25 MB per-file ceiling that is not a rounding error.
      · **`object_path` is UNIQUE and the ledger upserts on it**, so a retried upload updates one row rather
        than double-counting bytes that exist once. A duplicate would leak quota nothing could free, because
        release deletes by path.
      · **Fails OPEN**, consistent with `rate-limit.ts`. A broken cost control that blocks every upload is
        worse than a brief window with no ceiling, and `recordStorage` never throws — the bytes are already
        in the bucket by then, so failing would show an error for an upload that worked.

      **A wiring mistake worth recording:** my first pass put the quota guard beside the rate-limit guard,
      which runs *before* the multipart form is parsed — `file` was not in scope and it did not compile. The
      check belongs beside the per-file size test, the first point the size exists, and a test now pins that
      ordering. Typecheck caught it; no test would have.

      Suite 1285 files / 18,488 tests green; lint clean.

---

## Phase 3 — Play at the table

- [x] **P3-1 — Sheet rolls reach the shared campaign log. Shipped 2026-07-28.** *(Audit B-2 — the item I
      called the best value-per-day in the whole audit, three times, before building it.)*
      `lib/dnd/roll-publish.ts` + one line in `commitRoll`. **Every roller funnels through `commitRoll`,
      which is why one line fixes all four of them.** The route's own header had claimed *"Every sheet /
      quick-sheet / quick-action / DM roll posts here"* since it was written — designed, then never wired,
      so the DM's "shared feed" showed only rolls the DM typed in.
      **A roll must never fail because the network did.** `publishRoll` returns `void`, not a promise, so
      there is nothing a caller can accidentally `await` — a d20 that hangs on a timed-out POST would be a
      worse bug than the one being fixed. Both failure paths are swallowed, and `keepalive` is set so a roll
      made as the tab closes still reaches the table.
      **The payload is what the log already holds** — the sheet's own breakdown doubles as the formula.
      Inventing a second representation is how a shared feed starts disagreeing with the sheet about what
      was rolled, which is the one thing it must never do. Rolls on a character with no campaign are not
      published: no table, no feed.
      The *decision* is pure and exhaustively tested; the *sending* is deliberately unobservable.

- [x] **P3-2 — The roll feed where players can see it. Shipped 2026-07-28.** `RollFeed` was mounted only
      inside the DM-facing session console, so players never saw a roll history and a campaign without an
      active session had none at all — which matters rather more now that their own rolls arrive there. Now
      on the campaign hub for every member.
      **Still owed:** the same feed on the sheet's floating dock (P3-2b), so a player sees the table without
      leaving their character.

- [x] **P3-3 — Roll statistics.** Falls out of P3-1 for almost nothing: per-player nat-20s, average d20,
      luckiest session. High delight per line.

      **Done 2026-07-28.** `lib/dnd/roll-stats.ts` (pure) + `RollStatsPanel` on the campaign hub. The "almost
      nothing" held: **no migration and no new route** — `dnd_roll_log` already had every column, and
      `/api/dnd/rolls` is already campaign-scoped, membership-gated and capped, so the panel computes
      client-side from the existing endpoint.

      **"Average d20" is the statistic that is easy to get wrong, and it fails silently.** `result` is the
      TOTAL — after ability modifier, proficiency, bless, guidance. Averaging it produces a number that
      *rises when a character levels up* and says nothing about luck. The natural face lives in the
      breakdown, so it is parsed from there and `averageD20` is **null**, never a guess, when no face can be
      read. A luck number quietly derived from totals is worse than none, because it looks right.

      **Two real bugs, both mine, both found by writing the tests:**
      · **Advantage rolls were silently dropped.** The breakdown has two shapes — `d20[14]` straight,
        `d20[7,18]→18` for adv/dis — and my first regex required `]` immediately after the digits. Most
        attacks at most tables are made with advantage, so this was not a rounding error: it was a biased
        sample still rendering a confident number. Now reads the KEPT die, matching `SigilStack`'s existing
        parse of the same format.
      · **`\bd20\b` cannot match `1d20`.** There is no word boundary between the digit and the `d`, so
        every DM-typed `1d20+5` was excluded. `dieShape.ts` documents this exact trap — second time it has
        bitten this repo.

      Two smaller judgement calls, both pinned: `crit`/`fumble` are the authoritative flags but are counted
      **only on d20 rolls**, or a critical hit's damage roll reports a second nat-20 for one lucky attack;
      and "luckiest session" is a **count** (nat-20s − nat-1s, min 5 rolls) rather than a rate, because the
      memorable night is the one where the 20s kept coming, not a two-roll session that went well.

      The panel renders nothing until the table has actually rolled. Suite 1286 files / 18,510 tests green.

- [x] **P3-4 — Experience points. Shipped 2026-07-28** *(the per-character half; the DM award tool is
      P3-4b).* `lib/dnd/xp.ts`, `meta.xp` (optional — no migration), a narrow merge path on the character
      PATCH, and an Experience section on the sheet.
      **The finding was not "no XP field" — it was that nothing ever told a player it was time to level.**
      Levelling is the moment the builders exist for, and the level walker had no route in from a sheet
      other than knowing it was there. So the panel is two things, and the second is the part that was
      missing: a number you can set, and a **link that appears only when the XP has genuinely outrun the
      sheet**. Never a permanent "level up!" button, which would train people to ignore it.
      **Ground Rule 3 did real work here.** A threshold table is easy to write from memory and subtly
      wrong, and a wrong one silently levels a whole campaign at the wrong time. 5e's is the SRD table,
      tested at **every one of its twenty boundaries** rather than spot-checked — a transposed row is
      exactly what a hand-typed table gets wrong — and shared by both editions from one array so two copies
      cannot drift. PF2 is a flat 1000/level. **Intuitive Games has no sourced table, so it is milestone and
      says so**, rather than borrowing 5e's numbers; its cap is IG's own 10, not 20.
      **Milestone is a first-class answer, not a degraded one.** Plenty of tables never touch XP, so those
      get one explanatory line and no bar rather than an empty gauge implying someone forgot to fill it in.
      And `levelForXp` **refuses to derive a level** on a milestone system: that XP is not a level, and
      inferring one from a number nobody agreed on is worse than ignoring it.
      When the sheet's level and the XP disagree — a milestone table, or a character built above their XP —
      the label **says so** instead of silently preferring either. The player is the one who knows which.
      The PATCH path merges **one field** into the existing `meta`: rebuilding `data` from a partial body is
      how a sheet loses everything it did not mention.

- [x] **P3-4b — The DM's award tool.** "Award XP to the party" / "Level the party" across a mixed-system
      table, plus a notification with a deep link into each character's level walker. The per-character
      model and display are done; this is the DM-facing half.

      **Done 2026-07-28.** `lib/dnd/xp-award.ts` (pure planner), `POST /api/dnd/campaigns/[id]/award-xp`,
      and `AwardXpControl` on the campaign hub, DM-only.

      **"Across a mixed-system table" is what makes this more than a loop.** The systems disagree about what
      XP *is*: 5e uses cumulative thresholds, PF2 a flat 1000/level, and **Intuitive Games has no XP table
      at all** — `xp.ts` says so plainly rather than borrowing 5e's numbers. Writing XP to an IG character
      would store a value nothing reads and no rule interprets, and it would look real. So the award is
      **planned before it is written**, and reports per character what happened, including *"Kesh levels by
      milestone, so no XP was added"*. Silently skipping would leave the DM believing the whole party was
      awarded; silently writing would be worse. A milestone character is not touched at all — not even
      written with an unchanged value, which would bump `updated_at` and imply something happened.

      **A real bug caught before it shipped:** my first query filtered `dnd_characters.campaign_id`. The
      roster is the **join table ∪ that legacy column**, so it would have silently missed every character
      attached through `dnd_campaign_characters` — most of them — and the DM would have had no way to tell
      which players were skipped. Now uses the shared `characterIdsInCampaign`, with a test forbidding the
      narrow filter.

      Smaller decisions, all pinned: NPCs excluded (*"award XP to the party"* never means the monster
      roster); negatives allowed and floored at 0, since correcting an over-award is real and refusing it
      sends the DM back to editing sheets by hand; the amount bounded at 100k so a typo cannot jump someone
      to level 20; and level-up detection compares against the level the XP **already implied**, so a
      character whose stored level lags their XP is not reported as levelling on an award that changed
      nothing.

      Each level-up **deep-links into that character's level walker** — telling a DM "Vex levelled up" and
      leaving them to find Vex's sheet is most of the work still undone.

      One of my tests asserted 1000 XP leaves a 5e character at level 1; it is level 3 (thresholds
      300/900/2700). The test was wrong, not the code — corrected to assert the two systems land on
      *different* levels, which is the property that actually matters.

      Suite 1287 files / 18,532 tests green.

- [x] **P3-5 — Session RSVP + reminders.** Builds on P1-5: members mark yes/no/maybe; the hub shows the
      count. (A Discord webhook is P10-4.)

      **Done 2026-07-28.** `seeds/460_dnd_session_rsvps.sql`, `lib/dnd/rsvp.ts` (pure),
      `GET|POST /api/dnd/sessions/[id]/rsvp`, and `SessionRsvp` on the next-session banner.

      **"Hasn't answered" is not "no", and most of the design follows from that.** A player who has not
      replied and one who has said they cannot come are different facts; collapsing them lets the banner
      claim a decision nobody made. So: no rows are pre-seeded (a member with no row simply has not
      answered), `awaiting` is computed by comparing against campaign membership rather than against the
      RSVP rows, and clearing an answer **deletes the row** rather than storing "no". Pressing your current
      answer again clears it — without that, "maybe" is a one-way door.

      **Membership is passed in, not derived from the rows**, because the useful number is the one the rows
      cannot contain. A tally built only from RSVPs can never say *"two people haven't answered"*, which is
      the single thing a DM most wants from this.

      Safety falls out of the shape rather than needing a check: the route takes **no user id** — you can
      only answer for yourself — so campaign membership is a sufficient gate. Upsert on
      `(session_id, user_id)` with a matching unique constraint, or a player who reconsiders twice is
      counted three times and the tally only ever grows.

      **A structural bug fixed rather than worked around:** the P1-5 banner was one large `<button>`, so
      putting the RSVP controls inside it would have nested interactive elements — invalid HTML, and in some
      browsers a click on "Going" also navigates. My first attempt reached for `stopPropagation`; the right
      fix was to make the banner a `<div>` with the heading as its link and the RSVP row as a sibling. A
      test now counts JSX button tags in that region.

      **Reminders are NOT included** and this is a scope decision, not an oversight: there is no delivery
      channel. Email does not exist here by design (P2-4), and the Discord webhook is already scheduled as
      P10-4 — which is where a reminder belongs, since it needs somewhere to send one.

      Suite 1288 files / 18,552 tests green.

- [ ] **P3-6 — Encounter builder with a difficulty budget.** Add N copies of a creature at once; compute the
      encounter's difficulty against the party using each system's own budget. Depends on P8-1 (bestiary).

      **BLOCKED, not deferred — checked 2026-07-28.** Two independent reasons, either of which is
      sufficient:
      · **Its stated dependency is unbuilt.** P8-1 (the bestiary) is still unchecked. "Add N copies of a
        creature" needs creatures to copy; without a catalogue this is a form with nothing to put in it.
      · **The 5e budget data is not licensed to us.** Encounter-building — the XP thresholds by character
        level and the multipliers for group size — is **Dungeon Master's Guide** content and is *not* in
        SRD 5.1. Ground Rule 3 applies exactly as it did to the 2014 feat list: we would be inventing
        numbers that look authoritative. PF2's encounter budget *is* available, so a PF2-only version is
        possible later, but shipping a difficulty rating for half the systems and silence for the other
        half is worse than waiting.
      Revisit after P8-1. Nothing here is a cost judgement, so it stays unchecked rather than being marked
      done or deferred.

- [x] **P3-7 — The DM party overview.** Every PC's AC, passive Perception, saves, HP and conditions on one
      screen. All of it is already computed by the per-system resolvers — this is a new arrangement of
      existing data, and it is the single most-used DM screen in every comparable tool.

      **Done 2026-07-28.** `lib/dnd/party-overview.ts`, `GET /api/dnd/campaigns/[id]/party`, and
      `PartyOverview` on the campaign hub, DM-only.

      **"A new arrangement of existing data" is true, and the arrangement was the hard part**, because the
      systems do not share columns. The slice's own wording — "every PC's AC" — does not survive contact
      with the roster: **Intuitive Games has no armour class at all.** `IGCombat` carries
      `damageReduction` and a `defensivePower`; there is no to-hit target. A fixed AC column would print
      blanks for IG (reads as missing data) or a number derived from something else (Ground Rule 3). So
      defence is a **labelled** value — "AC 17" / "DR 3" — and the save columns are the **union** across the
      party, or a lone 5e character would lose four of their six saves to the presence of a PF2 one.

      **Three real bugs, all mine, all caught before shipping:**
      · **The 5e proficiency model is not a boolean.** Skills store `{ prof: 'none' | 'proficient' |
        'expertise' }`; I read `.proficient` and `.expertise` as booleans, which would have reported every
        skilled character as unproficient — passive Perception 13 instead of 16, plausible and wrong. Now
        uses the sheet's own `profContribution`/`profBonusForLevel`, so panel and sheet cannot disagree.
        Saves genuinely DO use a boolean `proficient`: two shapes in one character.
      · **PF2 conditions are an array of `{ name, value? }`, not a record.** `Object.entries` over it
        iterates indices and renders `"0 [object Object]"`. It typechecked, because the blob arrives as
        `unknown`.
      · **The panel crashed on a half-built PF2 sidecar.** `pf2PerceptionTotal` does `char.perception.rank`
        with no guard, so one malformed character took down the ENTIRE table rather than one row. Guarded,
        and non-finite results are now stopped at the boundary — "AC NaN" mid-combat is worse than "—".

      Computed **server-side** so no full sheet blob crosses the wire: a client-side version would have
      shipped every player's private notes, backstory and inventory to render a row of numbers.

      Suite 1289 files / 18,574 tests green.

---

## Phase 4 — Navigation & information architecture

- [x] **P4-1 — `/dnd/characters`, a real character index. Shipped 2026-07-28.** *(Audit D-1.)* A server page
      with URL-driven filters and no client JavaScript — system chips with counts, free-text search over
      name/class/subclass/system, newest first, campaign name resolved in one batched lookup.
      **The obstacle was never the page.** "What class is this and what level" lives in three different
      places depending on the system (`data.meta`, `data.pf2e.identity`, `data.ig.identity`), so every
      surface that wanted it re-derived it inline — which is why the lobby grid showed name and portrait
      and nothing else. `lib/dnd/character-card.ts` reads all three and returns one shape.
      It reads the **sidecar first**, so a stale `system` column cannot mislabel a character, and it is
      defensive throughout: it is pointed at raw jsonb, and a listing that dies on one malformed row shows
      the user *nothing*, which is worse than a name with no class beside it. The summary line is built from
      what is present rather than a template with holes, so a half-built character reads "Level 1" or
      "Fighter" and never "Level  ()".
      Filter counts come from the **unfiltered** set, or a chip reading "Pathfinder 2e · 3" would say "· 0"
      the moment you filtered to another system.
      **Also closes most of P4-2 / D-3:** the header menu now points at *My Characters* and at **Profile**,
      which was linked only from `CampaignDashboard` — the branch that does not run in open-access mode, so
      in the default configuration nothing pointed at it at all.

- [x] **P4-1b — Per-row actions on the index.** Duplicate, new variant, export and delete, consolidated from
      where they are scattered across the sheet page. The index lists and finds; it does not yet manage.

      **Done 2026-07-28.** `CharacterRowActions` on every card, plus a new
      `POST /api/dnd/characters/[id]/duplicate` — the only one of the four that had no route at all.

      **"New variant" is deliberately NOT on the index**, and that is a correction to the slice rather than
      an omission. A variant is another VERSION inside one character (same row, git-like lineage, up to 20)
      and a fork needs a **source version** — a grid card cannot say which one you meant. It stays on the
      sheet where the VERSIONS picker shows what you are branching from. Duplicate, which makes a genuinely
      separate character, is what the index actually needed.

      **The authorization guard caught me, and it was right.** My first version of the duplicate route
      accepted READ access, reasoning that copying someone else's public character is harmless since the new
      row is owned by the caller. `character-mutation-authorization` flagged it. That guard's own header
      warns its failure mode is *"loosening a guard to make a correct route pass"* — and I was weakening a
      character-scoped write to enable a capability **nobody asked for**. P4-1b is about managing your own
      index. Tightened to `requireCharacterWrite`; copying a public character can have its own slice and its
      own thinking about visibility.

      What the copy deliberately does NOT inherit, each for a reason: ownership (resets to the caller, or
      you get a character you cannot delete), campaign (a duplicate would land unapproved in a roster),
      NPC/roster role (a DM's editorial call about *that* table), and artwork (the images belong to the
      original's P2-7 upload ledger — sharing them means deleting one character strips the other's
      portrait).

      **The card was one big `<Link>`**, so buttons inside it would have nested interactive elements inside
      an anchor — invalid HTML, and a click on "Delete" would also navigate. Same structural bug as the P1-5
      session banner, same fix: a `<div>` with the Link inside and the actions as its sibling. Delete is
      hidden from a non-owner, mirroring the server rule, which meant the page also had to SELECT
      `owner_user_id` — without it the gate silently reads false for everyone, and the button vanishes for
      its rightful owner with nothing to indicate why.

      Suite 1290 files / 18,589 tests green.

- [x] **P4-2 — Menu completeness.** *(D-3.)* The header offers five links. `/dnd/profile` is linked **only**
      from `CampaignDashboard`, the branch that does not run in open-access mode — so in the default
      configuration nothing links to it. `/dnd/suggestions` is linked only from a footer control.
      Add Profile, My Characters, My Content (P6-7) and Requests; badge the toggle with the notification
      count.

      **Done 2026-07-29.** Profile, My Characters and Custom Content were linked by P4-1; this closes the
      last two — a **Requests** link with an unreviewed badge.

      **The badge is owner-only, decided on the SERVER.** `?count=1` returns `{ count: 0 }` to everyone
      else rather than the badge being hidden client-side, because hiding it locally would still SEND every
      player the number. A player shown "12" on a board they cannot action is handed a number they can do
      nothing with; the owner is the only person for whom it is a to-do list.

      Three smaller decisions: the count includes rows whose `status` is NULL (legacy submissions predating
      the review lifecycle — the ones most likely to still need reading, and an `eq('untouched')` would have
      silently skipped them); it uses `head: true` so the header does not ship the whole board on every
      navigation; and it fails to 0 rather than erroring, because the header mounts on every /dnd page and a
      nav item that errors is worse than one with no badge.

      **The token guard caught a real mistake.** I wrote `var(--hx-void, #06050c)` — a token that does not
      exist anywhere in the palette. A `var()` with a fallback fails **silently**, so the badge would have
      rendered in the fallback colour forever and looked deliberate. That is precisely why
      `hx-token-references` sweeps for undefined tokens instead of trusting fallbacks. Now `--hx-navy-0`.

      Verified in the browser: the menu renders ten links including Requests → `/dnd/suggestions`, with no
      badge for a non-owner — which is the server-side rule working.

- [x] **P4-3 — Group the character page's surrounding panels. Shipped 2026-07-28 (first group).**
      *(Audit D-4.)* `SheetSections` takes **already-rendered server nodes**, so every panel keeps its own
      server-side data fetching and gains a tab strip without becoming a client component. **Only the active
      section is mounted** — twenty always-mounted panels is also twenty panels' worth of effects and
      fetches on every visit to a sheet.
      **The sheet is deliberately NOT tabbed**, and a test enforces it: the sheet is why the page exists and
      stays exactly where it is. Only the surrounding panels are grouped, which is where the twenty were.
      First group is **Manage** — visibility, campaigns, the campaign-override promote, and export: the four
      that all answer *"who can see and use this character, and how do I get a copy out"*, and all four sat
      below the sheet where nobody found them.
      An empty section is dropped rather than offered as a tab onto nothing (a read-only viewer has no
      Manage content), and the strip hides itself at one section — a single tab is furniture pretending to
      be a choice. A test pins that each moved panel renders **exactly once**, because the failure mode of
      this refactor is leaving the old copy behind.

- [x] **P4-3b — The Build group.** Build kit, homebrew designers, adopt-content, variants, DM grants and
      build questions into a second section. Left for its own slice because those panels are interleaved
      with the three system sheets in the JSX, and moving them is a genuinely riskier edit than the four
      trailing ones — worth doing with a browser open rather than at the end of a batch.

      **Done 2026-07-29, with the browser open as the slice asked.** Measuring first changed what I built.

      **The number that made the case:** on a real 2014 sheet, **the sheet itself started 1103px down** —
      more than a full 889px viewport of tools above the character the page exists to show. Moving the two
      largest movable panels (the designers at 214px, adopt-content at 58px) into a **Build** tab brought
      that to **807px**, verified by re-measuring rather than by assuming.

      **The browser also corrected my first attempt.** Build was initially the FIRST section, and
      `SheetSections` opens `live[0]` — so its 214px of designers still painted on arrival and the sheet
      moved up only 101px. Ordering is a default, not a ranking: Experience leads because it is a *glance*,
      Build is a task you go to, Manage is settings. That is a mistake a source-level test would have called
      a pass.

      **Deliberately NOT moved**, against the slice's own list, because burying them trades one
      discoverability problem for another:
      · **the Build Kit** — the primary "build this character" action, and the entry point for the whole flow;
      · **SheetChrome** — U-4's entire point is that STYLE · TEMPLATE · THEME sit in the SAME spot on every
        character and system;
      · **VERSIONS** — a picker for what you are looking AT, not a tool you visit.
      Variants, DM grants and build questions were likewise left where they are; the two panels moved here
      are the ones that were both large and genuinely "go and do a task".

      A test pins that neither moved panel ALSO renders inline — otherwise the page grows back and the tab
      quietly becomes a duplicate rather than a home. One existing test was re-pointed: the `canWrite &&
      (…)` guard became `node: canWrite ? (…) : null`, which is slightly stronger, since `SheetSections`
      drops a null section entirely and a read-only viewer now gets no Build tab at all.

- [x] **P4-4 — A ⌘K command palette.** *(D-6.)* The library has excellent search; nothing else does. One
      palette spanning characters, campaigns, NPCs, custom content and library articles, reusing the
      library's keyword engine as the index.

      **Done 2026-07-29 — Phase 4 complete.** `lib/dnd/palette.ts` (pure ranking), `GET /api/dnd/search`,
      and `CommandPalette` mounted in the /dnd layout for signed-in users.

      **The slice said "reusing the library's keyword engine as the index", and that is only half right.**
      `searchLibrary` scores long PROSE by keyword coverage — correct for a rules article, wrong for a name.
      Typing "vex" must put the character Vex first, not a paragraph that happens to say "vexing" three
      times. So library hits still come from `searchLibrary` (they *are* prose) while entities are ranked by
      how well the query matches a NAME, in coarse tiers: exact › prefix › word-prefix › substring, with
      hidden keywords scoring below every title match so a character named "Rogue" outranks every rogue.

      **Browser QA caught a real quality bug that no test would have.** My first version passed `hit.body`
      as an article's keywords, so any substring anywhere in its prose matched. Searching **"orin"** returned
      *Restoring Touch*, *Spell-Storing Item* and *Confused* above the character actually named Orin —
      **seven rows of noise under one right answer**. A palette that returns plausible-looking rubbish is
      worse than one that returns less, because you stop trusting the first result. Library items are now
      scored on their name; full-text belongs in the library page, which is built for reading rather than
      jumping. Re-measured live: 8 rows → 3, character first.

      **Known and accepted:** two substring rows survive that query ("Rest**orin**g", "St**orin**g"), because
      the lowest tier matches mid-word — which is also what lets "mere" find "Sallowmere". Tightening it to
      word boundaries would lose more than it gains, so it stays, noted rather than silently tuned.

      **Scoping is the route's real job.** Characters are owned-or-played (not every character in your
      campaigns — a DM should not have every player's sheet in their palette), campaigns come from
      membership, content is yours-or-published, and the library is public. A missing `dnd_homebrew` table
      (seed 455) degrades that one source instead of failing the search.

      The palette renders no DOM and issues no fetch until summoned, and guards the classic search race
      where a slow response for "v" overwrites the results for "vex".

- [x] **P4-5 — Lobby depth.** `MyTable` has no "＋ Character" button of its own, no Profile link, and no
      link to the library from the page body. Fix all three while P4-1 and P6-7 are in flight.

      **Done 2026-07-29.** A second button row on `MyTable`: **＋ Character** (primary), My characters,
      Rules library, Profile. Taken ahead of P4-4 because it is the smaller slice — third time in this phase
      I have gone out of numeric order, and each time for the same reason: the hook asks for the *smallest
      meaningful* slice, and P4-4 is a cross-entity search build rather than a tidy-up.

      **Why this matters separately from P4-2's header work.** The menu is behind a toggle. A player who has
      never opened it had, from the lobby — the page they LAND on — no visible way to make their first
      character. The lobby could start a campaign and build content but not make a character, reach a
      profile, or open the library; all three pages existed and none was linked from the page body.

      Kept as a **second row** rather than lengthening the existing one: that row is about CONTENT you
      author, this one is about YOU and your characters. Merging them makes a seven-button wrap with no
      grouping. Verified in the browser — all four render in the lobby body, outside the header.

- [x] **P4-6 — An orphan-component guard. Shipped 2026-07-28.** `__tests__/dnd/no-orphan-components.test.ts`
      — the `lib/dnd` orphan guard, applied to components. **A unit test proves a component renders; this
      proves someone can get to it**, and this repo has repeatedly shipped the first while believing the
      second.
      **It found seven orphans on its first run, all real:**
      *Deleted (superseded, left behind):* `SkinSwitch`, `LayoutSwitch`, `CampaignGallery`.
      *Wired — the valuable half:* **`CampaignCustomPolicyToggle`**, the DM's vanilla-only switch, which
      meant `allow_custom` has been gating content submission on every campaign while **no DM could set
      it**; and **`PartyGallery`**, whose own header says it "mounts on the campaign page" and never did, so
      the party roster has been unreachable since Phase D5.
      *Exempt, each with a reason and a slice:* `SystemLibrary` (a builder surface nothing mounts —
      the Content Studio wants exactly it), and `SystemSwitcher`.
      **`SystemSwitcher` is the interesting one.** It is genuinely dead — retired at consolidation C3, and
      the character page says so in a comment — but deleting it turned **four test files red**, two of which
      (`hidden-systems`, `under-construction-gating`) read its source as a proxy for the unbuilt-system
      gate, a real safety property. That is the `format-preview.test.ts` pattern again: a test pinning an
      orphan. Restored and exempted rather than rushing a re-point of the gating suite while removing dead
      code.

- [x] **P4-6b — Re-point the gating tests that pinned `SystemSwitcher`. Shipped 2026-07-28, and it found
      something.** The two safety-critical tests — `hidden-systems` and `under-construction-gating` — were
      asserting that the *system switcher* refuses an unbuilt system, by reading `SystemSwitcher.tsx`. That
      component has been **rendered by nothing** since consolidation C3. **So the client-side unbuilt-system
      gate has been verified against code that never runs**, and the guard looked complete with a hole
      exactly where an orphan sat — the audit's whole thesis, inside the gating suite itself.
      What is actually live is better in shape: the character page passes `VariantBrowser` only
      `availableSystems()`, so the picker **cannot offer an unbuilt system even by mistake** — there is
      nothing to filter because nothing unbuilt ever arrives. Both tests now assert that, and the
      hard-coded-keys sweep reads the character page instead of the orphan.
      (The server route was, and remains, the gate that actually matters — every UI above it can be
      bypassed with a direct POST, and that assertion never moved.)

- [x] **P4-6c — Re-point the three transpose tests, then delete `SystemSwitcher`.** `mv-route`,
      `transpose-custom` and `transpose-progress` still read its source, but they assert its **transpose UI**
      rather than a gate — behaviour that moved to `VariantBrowser`/`EditFlow` and needs each assertion
      checked against its new home rather than sed-ed across. **Nothing unsafe rides on it now**, which is
      why this is a tidy-up rather than the blocker it was yesterday.

      **Done 2026-07-29. `SystemSwitcher.tsx` is deleted.** Taken ahead of P4-4 because it is the smaller
      slice and closes debt I took on rather than adding new surface.

      **It was FOUR describe-blocks, not three** — `mv-route` alone had four, and the fourth only surfaced
      after deleting the file, because each block reads it in its own `const`. Worth knowing for the next
      component retirement: `grep -l` finds the files, not the number of places inside them.

      **Each assertion was checked against its new home rather than sed-ed across**, because the behaviours
      did NOT survive one-for-one:
      · chips → the whole card is the switch target (`VariantBrowser`);
      · "+ Add sheet" (blank, pick a system) → **fork from an existing version**;
      · a `phase: 'working' | 'done'` state machine → `busy` plus the step the flow is already on;
      · the `transposeBar` sweep → a spinner **with a sentence**, which answers "has this hung?" better;
      · "Active sheet: <strong>" → the active card is outlined where you are already looking.

      **Two assertions were DROPPED with a note rather than reworded**: the add-form's markup
      (`styles.sheetAddCard`, `styles.segmented`, an `addKind` toggle) has no equivalent, because the picker
      has no such form. Re-pointing them would have meant inventing a claim about `VariantBrowser` to keep a
      test name alive, which is worse than deleting them — the capability they guarded is covered by the
      fork assertions and by `variant-tracker`/`transpose-custom`.

      **And one old assertion would now be WRONG if carried over**: `!sh.active &&` encoded "delete only on
      non-active sheets". That rule changed deliberately — refusing to delete the version you are viewing is
      what made versions feel undeletable — so it is replaced by `canDelete = !c.origin`, which protects only
      the original.

      The `no-orphan-components` exemption did exactly its job: it bought the time to re-point coverage one
      assertion at a time instead of deleting the component and its tests together. That is what an
      exemption is for — a deadline with a reason attached, not a permanent pass. `SystemLibrary` remains,
      still looking for its slice.

---

## Phase 5 — Cross-system parity

- [x] **P5-1 — Pathfinder 2e inventory + Bulk. Shipped 2026-07-28.**
      `lib/dnd/systems/pathfinder2e/inventory.ts` (pure), `PF2Character.inventory` + `.currencies` — both
      optional, so every stored character stays valid with no migration — and an Equipment panel.
      **Bulk is modelled properly rather than stored as pounds**, because it is a core mechanic with combat
      consequences — Encumbered costs 10 feet of Speed and −1 to Str/Dex checks — and that is exactly what
      5e's weight number cannot express. The penalty is returned as DATA in the game's own words, so the
      sheet renders it and a future engine bridge can apply it without either writing its own sentence.
      **Two arithmetic traps, both pinned by test.** Ten Light items must make exactly **1.0** Bulk — summing
      0.1 ten times in floating point gives 0.9999999999999999, so a character with ten torches would read
      0.9 and sit one rounding error from the wrong encumbrance; summing first and rounding once fixes it.
      And PF2 encumbers you for carrying **more than** 5 + Str, so `>` not `>=` — a `>=` would penalise a
      legal load, which is the kind of off-by-one nobody notices until a player argues about it mid-session.
      **Equipment is ALWAYS in the nav**, not gated on carrying something: Bulk applies either way, and a
      hidden Equipment section is precisely how a player concludes PF2 has no inventory.
      **Also closes P1-2 / audit C-3 for PF2**: `lib/dnd/currency.ts` was built system-agnostic and already
      shipped `DEFAULT_CURRENCIES_PF2` — it had simply never been wired to anything but 5e.
      **Still owed:** the item PICKER fed from `data/equipment.ts`, and editing inventory from the sheet
      (P5-1b). The model, the maths and the display are done; adding gear currently goes through the edit
      flow. **P6-9a (the PF2 engine bridge) is now unblocked.**

- [x] **P5-1b — PF2 item picker + sheet-side inventory editing.** Wire the existing weapon/armour/shield/
      rune/item catalogue into an add-item control, and allow quantity/location/invested edits in place.

      **Done 2026-07-29.** An `＋ Add gear…` picker over `PF2_ITEMS` and per-row quantity / location /
      invested / drop controls on the Equipment panel, plus a new `update_inventory_item` op.

      **THE PARSER HAD NO INVENTORY BRANCH AT ALL.** `parsePf2Edit` is a per-op whitelist, and neither
      `add_inventory_item` nor `remove_inventory_item` was in it — so `add_inventory_item` passed the enum
      check and reached the engine with **every field except `op` stripped**: a "Rope" with no quantity, no
      Bulk, no location. The op existed, the engine handled it correctly, and nothing could ever send it a
      complete payload. Exactly the currency-op shape from P1-2, and found the same way — by adding a
      sibling op and asking where it would be parsed.

      **Why the picker rather than a text field:** choosing from the catalogue carries the item's REAL Bulk
      across, and Bulk is what the encumbrance line above it computes from. Hand-typed gear is how a sheet
      ends up with a rope of unknown weight and an encumbrance number that quietly means nothing.

      Two boolean/zero traps, both avoided deliberately and pinned: quantity `0` is a real value (an item
      you have run out of but still track), so the op checks `Number.isFinite` rather than truthiness; and
      `invested` is checked with `!= null`, because a truthiness check makes un-investing an item
      unsendable.

      **NOT visually verified, and I want that on the record.** The PF2 shells mount panels lazily and I
      could not get the Equipment section into the DOM in the time available — the sheet rendered, but only
      `pf2-defenses` and `pf2-strikes` were present. The wiring is verified by typecheck and tests, which
      after today's run of browser findings is *weaker evidence than it sounds*. Worth opening a PF2 sheet
      and clicking through the Equipment panel before trusting it.

- [x] **P5-2 — Pathfinder 2e shields. Shipped 2026-07-28.** `lib/dnd/systems/pathfinder2e/shield.ts` (pure),
      `PF2Combat.shield` (optional — no migration), three edit ops, the bonus wired into `pf2ArmorClass`,
      and a Raise/Lower control on the Defenses panel. `pf2Shield()` finally has a caller.
      **The bonus is added in `pf2ArmorClass`, NOT folded into `acItemBonus`** — the tempting shortcut,
      since that field already exists. Two reasons, both silently wrong if you take it: the bonus applies
      **only while raised** (folding it in hands every shield user a permanent +2 and shifts every DC they
      face), and it is a **circumstance** bonus, which PF2 does not stack with itself — putting it in the
      *item* slot would let it stack with things it must not.
      **Broken means no bonus**, which is what makes Shield Block a real decision rather than free damage
      reduction. Hardness reduces the damage for *both* the shield and its bearer, so blocking a big hit
      still hurts — and a refused block (lowered, broken, destroyed) changes **nothing** rather than falling
      through to a normal hit the player never chose to take.
      **A guard caught the op name.** `shield_block` was refused by `assertCharacterScopedOps` — correctly,
      since op names must read as sheet mutations. Renamed to `apply_shield_block` rather than widening the
      rule, which is the fix that keeps the boundary meaningful.
      *Original slice text below.*

- [ ] ~~**P5-2 — Pathfinder 2e shields.**~~ *(C-2.)* `PF2_SHIELDS` is catalogued with hardness/HP/BT and
      `pf2Shield()` is exported and **never called**; the rules engine has no Raise a Shield (+2 circumstance
      AC — the most-used defensive action in the game), no Shield Block, no shield damage, no broken
      threshold. Depends on P5-1.

- [x] **P5-3 — PF2 archetype multiclassing. Shipped 2026-07-28.** *(Audit C-4, the last PF2 finding.)*
      **The finding was half wrong, and checking first saved most of the work.** The audit said PF2 "gets
      nothing" for multiclassing. In fact the dedication feats were fully catalogued with `archetype` tags,
      the tracks were modelled, and rule 5 of `pf2FeatEligibility` already required a Dedication before any
      of its archetype's feats. What was genuinely missing was the **commitment rule** — *"you can't select
      another dedication feat until you have gained two other feats from the archetype you already have"* —
      so nothing stopped a character collecting six Dedications and following through on none of them,
      which is exactly the buffet that rule exists to prevent.
      **It counts through the CATALOGUE, not through names**, and that is the whole difficulty. Barbarian
      Dedication's follow-ups include **"Basic Fury"**: a name-prefix test would miss it entirely and
      under-count every archetype whose feats are named for their effect rather than their class — which is
      most of them. The tests guard that fixture explicitly, so the rule cannot start passing for the wrong
      reason.
      The Dedication does not count toward its own two, and another archetype's feats do not pay the debt.
      Re-taking a dedication you hold is still caught by the pre-existing duplicate rule, not this one — a
      test pins *which* rule refuses it, because two rules that both say no are indistinguishable until one
      of them is wrong.

> **Every Pathfinder 2e audit finding is now closed** — C-1 (inventory + Bulk), C-2 (shields), C-3
> (currency) and C-4 (multiclassing), plus the P6-9a engine bridge.

- [x] **P5-4 — PF2 companions and familiars.** *(C-7. The eidolon is split out as P5-4b.)* Companions exist
      for 5e 2024 and IG only. PF2 animal companions are a compact three-tier data shape and close most of
      the gap; the Summoner's eidolon is a second statblock and can reuse the creature model from P6-13.

      **Done 2026-07-29.** `lib/dnd/companions/pathfinder2e.ts` — the animal-companion ladder and the
      familiar feats, wired into AI grounding and the rules store.

      **Nothing in the module is authored.** Every rule string is the `effect` of a feat already catalogued
      in `data/feats-class.ts`, carrying that feat's own `source`. The tests check this in both directions,
      character for character, and assert the file contains no literal `rules: ['…']` array at all. A
      hand-written companion rule looks exactly as plausible as a correct one, and six months later there
      is no way to tell them apart — the same argument that made P5-6 derive PF2's languages from ancestry
      data rather than typing a list.

      **Deriving it is the only reason a real gap is visible.** The ladder comes out 1 → 4 → 8, ending at
      Incredible Companion. The rules have a **fourth** rung — Specialized Companion, around 14 — and there
      is no feat row for it in the repo, so there is none here. An authored ladder would have listed four
      rungs from memory and looked finished. `PF2_COMPANION_STATUS.laddersComplete` is therefore `false`,
      and says which rung it stops at.

      Also derived rather than declared: **which classes get what.** Druid and Ranger take the companion;
      Alchemist, Druid, Sorcerer and Wizard take a familiar; a Druid is the only class that can have both.
      A class with neither gets `[]`, never a generic ladder — "every class has the same one" is precisely
      the plausible default that becomes a Fighter being shown a companion they cannot take.

      **Wired, not just written.** `matchCompanions` in `grounding.ts` was hardcoded `if (system !==
      'dnd5e-2024') return []`, and `systemRulesEntries` had a 2024-only branch — so this would have been
      the fifth "working code with no door" in this audit. Both now dispatch by system and neither falls
      back to another system's sets, because answering a Pathfinder question with 5e's familiar rules is
      worse than answering nothing. The grounding match also searches the rule TEXT, since all four rungs
      live under one set named "Animal Companion" and "how does my companion mature" has to reach the
      level-4 rung.

- [ ] **P5-4b — The Summoner's eidolon.** *(Split from P5-4.)* A second full statblock plus its own
      subsystem (shared actions, shared HP, the eidolon's own attack and defense tracks). Blocked on the
      same creature model the bestiary needs — see P8-1 — rather than on effort. Recorded in
      `PF2_COMPANION_STATUS.eidolonCatalogued`.

- [ ] **P5-4c — PF2 companion statblocks and familiar abilities.** *(Split from P5-4.)* The per-animal
      statblocks (bear, bird, wolf, … — size, six modifiers, unarmed attack, senses, Support benefit) and
      the list a familiar picks its abilities from. **Blocked on source material, not effort**: transcribing
      a dozen statblocks from memory is exactly what Ground Rule 3 forbids — the numbers would look right,
      feed a sheet that computes from them, and be wrong in ways nobody would catch.

- [x] **P5-5 — 5e 2014 companions.** Find Familiar, the Ranger's beast, the Paladin's steed.

      **Done 2026-07-29.** `lib/dnd/companions/dnd5e-2014.ts` — familiar, steed, Ranger's Companion and
      Wild Shape, plus a shared `companions/index.ts` dispatcher.

      **The 2024 list was not reused, and that was the whole risk.** Copying it is the obvious shortcut and
      it is wrong in precisely the places a player looks the rule up for: 2024 made touch-spell delivery a
      **Reaction**, made Wild Shape a Bonus Action granting **temporary** hit points rather than replacing
      your statistics, and swapped the Beast Master's "any beast of CR 1/4 or lower" for three fixed Primal
      Companion shapes. Each of those three differences is now asserted against **both** modules at once, so
      a future "tidy these into one file" fails loudly.

      Unlike P5-6's languages, no refusal was needed — **2014's own text was already in the repo.** Every
      rule string is either a 2014 SRD spell summary or a 2014 class-feature body, each carrying its own
      source. Deriving the Beast Master's rules from the subclass is what keeps its levels at 3/7/11/15,
      which is the single most likely 2014-vs-2024 confusion in this area.

      **One gap 2024 does not have, and it is the rules' fault rather than ours:** 2014 defines its familiar
      and beast companion by a *constraint* ("any beast of CR 1/4 or lower"), not by an enumerable list. A
      form list here would be a choice made by this file rather than by the book, so `formListsComplete` is
      `false` and says why.

      **The dispatch moved before it could drift.** Three callers now need "which companion rules does this
      system have?" — grounding, the rules store, the term index — and each had (or was about to grow) its
      own `if (system === …)` chain. That is exactly the shape that left `PF2LevelBuilder` type-checking
      against a stale hand-copy in P5-10b. It lives in `companions/index.ts` now, returns `[]` rather than
      another edition's rules, and a test asserts PF2's ladders never appear in a 5e system's entries —
      because the failure that matters here is not "nothing appears" but "the **wrong** thing appears", and
      a 2014 player reading Pathfinder's Incredible Companion has no way to know it is not theirs.

- [x] **P5-6 — Languages beyond 2024.** *(C-9.)* `lib/dnd/languages/` holds one file. PF2 already carries
      languages inside its ancestry stat lines — surfacing them is nearly free; 2014 and IG need a picker.

      **Done 2026-07-28.** `lib/dnd/languages/index.ts` — `languageCatalogFor(system)` / `languageNamesFor`
      / `pf2BonusLanguageSlots`. Three things worth recording:

      · **PF2's catalogue is DERIVED, not authored.** It aggregates `PF2_ANCESTRIES_FULL[].languages`, which
        is already verbatim Player Core data. Two tests lock the derivation in *both* directions — every
        granted language is offered, and nothing is offered that no ancestry grants — so the list cannot be
        hand-extended without a real source. Each entry names the ancestries it came from, so a wrong entry
        is visible rather than merely wrong.
      · **2014 gets NOTHING, deliberately, and the estimate above was wrong to imply otherwise.** The plan
        said 2014 "needs a picker"; what it needs first is a *source*. Reusing the 2024 list would have been
        the easy move and would have been wrong in four places — 2024 added Common Sign Language, made Orc
        standard, and counts Druidic and Thieves' Cant as languages where 2014 treats them as class
        features. Those four wrong entries would have looked completely plausible in a picker. So 2014 and
        IG return `catalogued: false` with a note saying exactly why, same as `xp.ts` does for IG's missing
        XP table. **P5-6b** if a 2014 list is ever sourced.
      · **The actual C-9 defect was a missing door, not missing data.** `parsePF2Picks` has always parsed
        `picks.languages` and `assemblePF2VanillaCharacter` has always unioned them over the ancestry's own
        — the entire server path worked. `PF2CharacterBuilder`'s POST body just never included the field.
        A unit test of the builder function would have passed throughout. This is the fourth time this
        audit has found working code with no way to reach it, and it is why the tests here assert the
        *wire* (the field is in `picks:`, the block renders in **both** layouts) rather than the logic.

      The picker shows ancestry-granted languages as fixed chips and offers extras up to
      `pf2BonusLanguageSlots(INT)`, greying the rest when the budget is spent rather than hiding them.
      Suite 1273 files / 18,231 tests green; typecheck and lint clean.

### Class completeness — the owner's first priority

**Measured 2026-07-28, before planning any of it.** The headline is better than expected and the remaining
work is narrow and specific — which is exactly why it was worth measuring rather than assuming:

| System | Classes | State |
|---|---|---|
| **5e 2014** | 14 | **Complete.** All 13 official (incl. Artificer) + Pugilist, each authored 1–20 with subclasses. |
| **5e 2024** | 13 | **Complete for what is published.** All 12 PHB classes × 4 subclasses each + Pugilist × 6 Fight Clubs. |
| **Pathfinder 2e** | 20 | **All of Player Core + Player Core 2** — Alchemist through Wizard. Gaps are enumerated in `PF2_CLASS_PROGRESSION_GAPS` (11 entries), not hidden. |
| **Intuitive Games** | 17 | Full taxonomy; **Champion alone lacks powers/specializations** (blocked on the site). |

So "get all the classes built" is **mostly already true**. What is actually left:

- [ ] **P5-8 — IG Champion.** *(Blocked on data — see the blocked table.)* The single genuine content hole in
      any of the four systems' class lists. Every other IG subclass carries `powers[]` + `specializations[]`
      verbatim from the scrape.
- [ ] **P5-9 — Magus and Summoner spell slots.** *(Blocked on data.)* `slotTableModelled: false` for both;
      `pf2MaxSpellRank` returns 0 until the published reduced-caster tables are supplied. Everything else
      about both classes is modelled.
- [x] **P5-10 — PF2 Cleric doctrine.** *(Split: the Monk half is now P5-10b.)* Not blocked — *chosen*. Both
      classes' progressions branch on a player choice, so an assembled Cleric or Monk keeps its level-1 base
      ranks. **Design:** make the choice a slot (the S1–S6 model already does this), then apply the chosen
      track's increases. The most mechanically wrong thing left in PF2's classes.

      **Done 2026-07-29.** Structured `tracks` on `PF2Subclass`, filled for both doctrines, read through a
      new `pf2EffectiveTracks(className, subclass)` that the builder now uses in place of the base tracks.

      **The Cleric never needed a new choice.** The doctrine was collected by the builder, stored on the
      character, and printed on the sheet — nothing ever *read* it. So a level-20 warpriest sat at trained
      Fortitude (they are expert at 1 and master at 15) and a trained spell DC (expert at 11, master at 19):
      a four-point error on the DC of a class that is supposed to be hard to save against. The two doctrines
      also end at different **ceilings**, not merely different times — a warpriest never reaches legendary
      spellcasting at all.

      Overrides **replace** the base track rather than merging into it, and the warpriest is why: they are
      expert in Fortitude *from level 1*. A merge keeps `initial: 'trained'` and reads a rank low forever.

      Only rank-moving steps became data. "Trained in martial weapons at 3" widens *which* weapons, not the
      rank, so it stays prose in `progression`. The warpriest's level-19 master is favored-weapon-**only**,
      so it carries a per-step `note` and the builder leaves the general attack rank at expert — the same
      under-count-rather-than-over-count rule the Fighter's weapon groups already follow.

      **What this slice actually found is worse than what it fixed.** Every proficiency rank on a PF2 sheet
      was written exactly once, at build time. `/api/dnd/characters/[id]/pf2-levels` moved `identity.level`
      and projected feats, and left every rank alone — so a Wizard walked from 1 to 9 kept level-1 saves and
      a level-1 spell DC. Correct if you *built* at 9, stale if you *walked* there. The same character
      reading differently depending on how it arrived is worse than both paths being wrong, because only one
      of them looks broken. Fixed by extracting `pf2RanksAtLevel` (shared by both paths) and
      `pf2ReprojectRanks`, which the route now calls on commit. Pinned by asserting the walked character
      matches the built one rank for rank.

      And under *that*: the walker accepted a `subclass` choice, wrote it to the ledger, and never touched
      `identity.subclass` — so a doctrine chosen at level 1 through the level walker never appeared on the
      sheet, and after this slice could not have driven the ranks either. Now projected, ledger-first.
      Three layers of the same defect, each one only visible once the one above it worked.

- [x] **P5-10b — Monk Path to Perfection.** *(Split from P5-10.)* At 7 one save becomes master, at 11 a
      second, at 15 one of those two becomes legendary — but **which** is the player's choice, it is
      collected nowhere, and it cannot be guessed, so a level-20 Monk still reads expert in all three.
      Unlike the Cleric — whose doctrine was already recorded and merely never read — this one needs the
      choice **captured** first: a new `PF2ChoiceKind` prompted by `pf2PlanLevelUp` at 7/11/15, with the
      15 prompt constrained to the two saves already mastered.

      **Done 2026-07-29.** `chosenSaves` on the class table, a prompted `save` choice, a picker, a
      server-side value gate, and `pf2ApplyChosenSaves` folding the picks into the ranks.

      **The third step is the whole reason this needed modelling rather than approximating.** At 15 a monk
      raises one of the two saves they already **mastered**. A picker offering all three lets a player build
      a monk who is legendary in a save they are only expert in — a state the rules cannot reach and the
      sheet cannot depict as wrong. So each step records the rank it upgrades **from**, and the legal set is
      computed from the picks as they stand.

      That `from` also removes the special case nobody would have maintained. Nothing anywhere says "not the
      save you picked at 7" — the level-11 step wants a save standing at *expert*, and the level-7 save is
      master by then, so it drops out on its own. The rule and the model came out the same shape.

      And it is re-checked at **apply** time, not only at record time. A ledger goes stale: change the
      level-7 answer and a previously legal level-15 pick is suddenly sitting on an expert save. Re-checking
      means the ranks are legal for the picks *as they stand*, in whatever order they arrived.

      **The walker was type-checking against a hand-copy of the plan.** `PF2LevelBuilder` declared its own
      `Outstanding` interface instead of importing `PF2OutstandingChoice`, and the copy had already drifted —
      widening `PF2ChoiceKind` left the component's union at three kinds, so the new branch compiled as
      *unreachable* and the `options` the server sends did not exist there at all. It now aliases the real
      type. A duplicated type is a type that stops agreeing the first time the original changes, and it
      fails silently in the direction of "this code is dead".

      **Honest remaining gap, recorded in `PF2_CLASS_PROGRESSION_GAPS`:** only the *walker* collects these
      picks. Foundations assembles a character *at* a level without walking to it, so a monk built directly
      at 15 has no picks and reads expert in all three. `pf2RanksAtLevel` already accepts them — closing it
      is a builder-UI change, not a rules one.
- [x] **P5-11 — PF2 Fighter weapon-group attack ranks.** The builder advances attack proficiency through
      unscoped steps only, so a Fighter's general attack rank stays EXPERT past 13. It **under**-counts,
      which is the safe direction, and the gaps list says so. Needs weapon-group tracking.

      **Done 2026-07-29.** And the premise above was wrong, which is the finding.

      **The Fighter's level-13 and level-19 steps were never group-scoped.** Weapon Legend and Versatile
      Legend raise simple, martial and unarmed attacks for *every* fighter. They were being skipped because
      the rule was **"a step carrying a `note` is scoped"** — and both notes happened to also describe the
      group-scoped half of the same feature. So a Fighter was expert in attacks from level 1 to level 20: a
      two-rank, four-point under-count on every Strike past 19, sitting behind a **test that asserted it was
      deliberate**. That test is rewritten; it now pins the correct ranks and says why it changed.

      Scope is now `limitedTo` — a field naming the subset, not an inference from prose. The old rule made
      documentation load-bearing: adding an explanatory note to any step would have silently suppressed a
      real rank bump and nothing would have failed.

      **Advanced weapons got their own track.** A Fighter is the only class that trains them at level 1 and
      they stay exactly one rank behind for all twenty levels — so a single `attackRank` could only ever
      tell one of the two truths, and it told the martial one. Each Strike now takes the rank for *its*
      weapon's category.

      **Which exposed that you could not equip one.** The builder resolved weapon names against content.ts's
      ~30-row starter seed, which contains **no advanced weapons at all** — so the class that trains them
      could not pick one, and the track they follow had nothing to apply to. The full table has been in
      `data/equipment.ts` the whole time; only the door was missing. The picker now offers it, grouped by
      proficiency category, which is not cosmetic — the group *is* the thing that decides your attack rank.

      **Still open, and now the only Fighter attack gap:** weapon GROUPS. A Fighter picks a group at 5
      (master) and again at 13 (legendary); a warpriest's level-19 master is favored-weapon-only. Every such
      step is marked `limitedTo` and left unapplied, so those weapons read one rank low — the safe
      direction. Closing it needs a per-character weapon-group choice, which is a slot, not a data fix.
- [ ] **P5-12 — The 2024 Artificer.** *(Blocked on data.)* Published after the 2024 PHB; the repo has the
      2014 one. Needs the owner to supply the revised text, exactly as the Pugilist was.

Everything above except P5-10 / P5-10b and P5-11 is **blocked on source material, not on effort** — worth
saying plainly so this priority is not mistaken for a large build. The unblocked ones are real rules bugs.

- [ ] **P5-7 — The guided builder's per-level flows.** *(C-6.)* `/dnd/characters/[id]/builder` is still B1
      for all four systems: Foundations is the existing all-at-once builder embedded whole. The page's own
      comment says the per-level flows are owed.
      **Design:** the slot model from S1–S6 is exactly the substrate — each slot becomes one screen with a
      live preview panel. Sequence: 5e first (most slots modelled), then PF2, then IG.

---

## Phase 6 — The Homebrew Content Studio

> **The owner's brief, 2026-07-28.** A Content Builder button on the user page → a page to homebrew items,
> feats, classes and anything else, saved to public or private content; **shareable**; **addable to
> characters** with **the actual effects showing up on the character sheets for the different systems**,
> fully integrated with the system engines and represented on the sheet, in the library and on users' lobby
> pages; **a way to view all custom content**. Pick the KIND and the SYSTEM first, then the building options
> **totally adjust**. Classes can be **based on another class** or wholly new, built **level by level** with
> **custom feats authored inline** and offered at chosen levels; a class can stop at any level and be marked
> **partially built** — save whenever. **On save the AI writes an assessment.** AI can help at **each step**,
> but everything must be buildable **from scratch** in any system. **Upload a PDF/file** and have AI build
> from it. **Upload an image** — a creature gets a full statblock beside its art. Later: a **simple sheet for
> creatures** tracking attacks, abilities, feats and conditions, and a **complete creature builder**. Then a
> **system translator** that transposes a piece into another system as a variant, which the user
> **approves / denies / retries with notes**, looping until satisfied, or hand-edits if close.

### What already exists (measured — do not rebuild)

`lib/dnd/homebrew/` is a complete, tested, pure foundation that **nothing is wired to**: `model.ts` (kinds,
attribution, system scope, `draft/submitted/approved/rejected`, search, browse), `policy.ts` (the campaign DM
allowlist), `adopt.ts` (`adoptHomebrew` → `ClassDefinition` / `CustomFeat` / `ActiveEffect`, validated through
the real engine validators, refusing invalid payloads, idempotent), `projection.ts` (library section + AI
grounding). Its entire data source today is a **two-entry hard-coded array** in `seeds.ts`.

Separately, `dnd_content` + `/api/dnd/content` is an older, working, DB-backed system (9 kinds, campaign or
global, `data.effects[]` → `engine/content.ts` → real equipment and effects) with no attribution, no system
scope, no lifecycle, no images and no browse page. And `/build/*` produces a third, character-embedded kind
of homebrew.

**Decision: `lib/dnd/homebrew/*` becomes THE system.** `dnd_content`'s engine-payload contract is kept
(`payload.effects`); the `/build/*` designers become authoring modes inside the Studio.

- [x] **P6-1 — The kind registry.** See P0-3. **Shipped 2026-07-28.**

- [x] **P6-2 — The table. Shipped 2026-07-28.** `seeds/455_dnd_homebrew.sql`. `kind` is deliberately NOT a
      CHECK constraint — the vocabulary lives in `model.ts` and widened 13 → 18 the same day, so a
      constraint would mean a migration per kind with the failure landing at INSERT time in production;
      `normalizeHomebrew` already drops an unknown kind rather than coercing it. `dnd_content` is left
      alone (P6-19 migrates it) because bolting five columns onto a table in active play to serve a feature
      that does not exist yet is the wrong order.

- [x] **P6-3 — The store. Shipped 2026-07-28.** `lib/dnd/homebrew/store.ts` — row↔model mapping,
      `canReadHomebrew` / `canWriteHomebrew` / `isBrowsable` / `visibleHomebrew` / `pickCreatorWritable`,
      27 tests over the whole visibility × status product.
      **A design bug was caught in authoring and is pinned as a regression test.** `isBrowsable` was first
      written as `visibility === 'public' && status === 'approved'` — two plausible conditions that multiply
      into a permanently false one, because with public self-serve nothing ever *sets* `approved`. The
      catalog would have been unbrowsable forever. Resolved by making **`visibility` the publish action**
      (`status` only ever excludes, on `rejected`) with `statusForVisibility` keeping `isHomebrewPublished`
      — which the library section and AI grounding read — in agreement.

- [x] **P6-4 — The API. Shipped 2026-07-28.** `/api/dnd/homebrew` (GET with mine/system/kind/q filters,
      POST) and `/api/dnd/homebrew/[id]` (GET / PATCH / DELETE). Three validation layers reported together
      so an author fixes everything in one pass: identity (`validateHomebrew`), the kind's own schema
      (`validateDraftFields`), and the mechanics against the **engine's own** validators
      (`validateHomebrewPayload`). A private piece 404s rather than 403s, so it does not confirm its
      existence to someone guessing ids. Delete leaves adopted copies and transposed variants alone —
      adoption copies the payload onto the sheet, so deleting a catalog entry must not reach into someone
      else's character and remove a class they are playing.
      **Two orphan exemptions came off the list** (`kinds.ts`, `adopt.ts`) because the API imports them, and
      the pin asserting the shared catalog *had no surface* flipped and was replaced. `policy.ts` stays
      exempt and is now the only piece owed — P6-8 is its only intended caller.
      **Still to do here:** rate-limiting (P2-1) — the routes ship ungated like the other 113.

- [x] **P6-5 — The Studio: browse. Shipped 2026-07-28.** `/dnd/content` + `/dnd/content/[id]`. A **server**
      page with `searchParams`-driven filters and **no client JavaScript**: the filters are links and search
      is a plain GET form, so the page works on first paint and — the part that matters — a filtered view is
      *linkable*, so a DM can paste "every public PF2 creature" into their table's chat. It queries Postgres
      directly rather than fetching its own API (an RSC calling its own route pays a round trip to redo work
      it could do inline), but shares the authorization: both call `visibleHomebrew`, the module with the 27
      tests, so page and API can never disagree about who sees what. A system filter includes `'any'`-scoped
      pieces, or system-agnostic content vanishes from exactly the lists it was scoped to appear in.

- [x] **P6-6 — The Studio: build. Shipped 2026-07-28 (form; the five bespoke editors are still owed).**
      `/dnd/content/new` is the picker with no `?kind=` and the form with one. Both are **generated from the
      registry** — the picker from `KIND_GROUPS`/`kindsInGroup`, the form from `fieldsForKind` — with a test
      asserting no kind is hard-coded in either, because a hand-written list is how a new kind gets added to
      `kinds.ts` and silently never appears.
      **Honest about the gap:** `effects`, `levels`, `statblock`, `image` and `list` need bespoke editors
      (P6-8/11/12/13). Each renders a labelled placeholder naming the slice that builds it, rather than a
      text box that looks like it captures a statblock and silently drops it — a form that appears to accept
      input it discards is worse than one that admits the gap, since the author only finds out after saving.
      The prose-only notice from the registry shows *before* an author starts, not after.

- [x] **P6-7 — The doors. Shipped 2026-07-28.** 🔨 Content Builder + "My custom content" + "Browse
      everyone's" on the lobby (`MyTable` — the user page the owner meant), and header-menu entries with
      browsing above the sign-in split (reading is open, like the library) and building below it.
      **Caught mid-slice:** the lobby buttons were added pointing at `/dnd/content/new` *before that page
      existed* — the exact defect this whole plan is about, nearly reintroduced while fixing it. Both pages
      shipped in the same commit, and `content-studio-reachability.test.ts` now asserts every link the browse
      page emits points at a page that exists.

- [x] **P6-8 — Adopt onto a character. Shipped 2026-07-28.** `POST /api/dnd/homebrew/[id]/adopt` plus
      `AdoptContentPanel` on the sheet. **Three gates, answering three different questions** — character
      write access, the DM's allowlist (`canAdoptHomebrew` + the campaign policy), and the engine's own
      validators via `adoptHomebrew`, which refuses a payload rather than storing a class the level builder
      cannot level. The system match is checked *before* the DM gate on purpose: "this is Pathfinder content
      on a 5e character" tells a player what is wrong, where "your DM hasn't allowed this" would send them
      to ask for something that could never have worked. A character with no campaign has no DM and so no
      allowlist — otherwise the closed-by-default policy would make the Studio unusable outside a campaign,
      which is where most authoring happens. Audited under a batch id, so adopting undoes like any other edit.
      **`policy.ts` finally has its only intended caller.** It had been orphan-exempt since the day it was
      written — a DM gate nobody invoked, indistinguishable from no gate, the same shape as the PF2
      rules-gate bug. **Every module under `lib/dnd/homebrew/` is now reached by shipping code, for the
      first time.** Two more pins flipped and were rewritten.
      The client never predicts a gate — it asks and shows the server's message verbatim, because each of
      the three refusals needs a different action from the player.

- [x] **P6-9 — The effects editor. Shipped 2026-07-28.** *(The per-system bridges are split out below.)*
      The `effects` field now has a real editor, so homebrew stops being prose and starts changing numbers
      on a 5e sheet — `adoptHomebrew` already converts a validated payload into an `ActiveEffect` the ledger
      resolves. **Generated entirely from `lib/dnd/effects/targets.ts`**, which its own header calls "a
      contract, not a list" precisely so a hand-written menu can never leave a capability unreachable; a
      test asserts no target key is hard-coded here and that every group is reachable from the picker.
      Changing a target **resets the operation** to one the new target allows, or switching from an ability
      (add/set/set_base) to a roll (add/advantage/disadvantage) would leave an illegal pair that only fails
      at save. The engine's own `validateEffect` runs live in the form, so what the form accepts and what a
      sheet will apply cannot disagree. Added `TARGET_GROUPS` to the registry, derived from the labels.
      **Every field type any kind declares now has an editor** — `OWED_BY` is empty, and a test asserts the
      set of declared types is covered rather than trusting the list. The placeholder branch is *kept*, so
      the next field type someone adds lands there instead of silently rendering nothing.
      Flipped the P6-12 pin that said "effects is the only placeholder left".

- [x] **P6-9a — Pathfinder 2e engine bridge. Shipped 2026-07-28.**
      `lib/dnd/systems/pathfinder2e/adopt.ts` + two inventory edit ops, and the adopt route now branches on
      the **sidecar** (`isPF2Character`) rather than the system column, because the column can disagree with
      what is actually stored.
      **The bug it fixes looked like it worked**, which is the worst shape a bug can have: `adoptHomebrew`
      writes 5e shapes onto the shared `Character`, so adopting onto a PF2 character wrote into a blank 5e
      projection — the save succeeded, the sheet showed nothing, and nothing said why.
      **Carries:** gear → an inventory line (possible only since P5-1; before it there was nowhere to put a
      rope), a weapon with damage → a Strike, a feat → the **archetype** track (not `class`, or it would be
      counted against a budget it was never granted by), a spell → a known spell.
      **Refuses, loudly:** a class or subclass, because PF2 advancement is four feat tracks and proficiency
      ranks rather than a hit die and an ASI ladder — converting produces something that *levels wrongly*,
      which is worse than a refusal. The refusal explains itself and points at the transposer.
      **The interesting decision: 5e `effects[]` are NOT translated, only flagged.** A `str_score +2` is a
      statement about ability *scores*, which PF2 does not have in play; mapping it would silently rebalance
      every piece that crossed. The player is told in plain words and pointed at P6-18, which is the honest
      route between systems and says out loud that it produces a new variant.
      A test asserts no effect leaks into a PF2 edit, and that the route preserves the rest of `data` when
      writing the sidecar back — rebuilding from the sidecar alone would delete the 5e projection and the
      custom sections stored beside it.
- [x] **P6-9b — Intuitive Games engine bridge. Shipped 2026-07-28.**
      `lib/dnd/systems/intuitive-games/adopt.ts` + two equipment ops. **All three systems now resolve
      adopted homebrew natively** — the adopt route branches PF2 → IG → 5e on the sidecar.
      **Not the PF2 file twice**, and the differences are the point: IG has **stances**, which land natively
      here and are meaningless in either other system; its gear is a loose `equipment.other` list rather
      than a Bulk-tracked inventory (**no weight field, deliberately** — Bulk is a Pathfinder concept and
      importing it would invent a rule IG does not use); and its **powers and spells are one list**, so both
      kinds converge on `add_power`.
      A stance is **learned, not entered** — adopting one adds it to the known set and must not silently
      change what the character is currently holding. Pinned by test.
      Same refusals as PF2 (class/subclass, prose-only kinds), phrased in **IG's own terms** — "per-level
      schedule of powers and specializations" rather than Pathfinder's feat tracks — and the same
      flag-don't-translate rule for 5e `effects[]`.

> **Homebrew now works on every playable system.** Author it, share it, adopt it, and it resolves as real
> mechanics on a 5e, Pathfinder 2e or Intuitive Games sheet — or is refused with a reason and a pointer at
> the transposer. That closes the owner's second priority ("the homebrew building stuff built and surfaced").

- [x] **P6-10 — Library + grounding surfacing. Shipped 2026-07-28.** Published content now appears in its
      system's library page, in library search, and in the AI librarian's grounding.
      **The interesting constraint was keeping `library.ts` pure.** Its header states the library "needs no
      DB round-trip and works with no embeddings key", and that is load-bearing: the rules reference renders
      and searches correctly on a cold deploy with an empty database, which is why the six
      under-construction systems can be fully documented while nothing is seeded for them. So the catalog is
      **injected** — `libraryPageFor` / `allLibraryPages` / `libraryCatalogFor` / `searchLibrary` take an
      `extraHomebrew` argument defaulting to `[]` — and `lib/dnd/homebrew/published.ts` is what callers use
      to fill it. Pass nothing and the behaviour is byte-identical to before. A homebrew-table failure costs
      the community extras and never the official rules.
      **`revalidate = 300` on `/dnd/library/[key]`.** It has `generateStaticParams`, so with pure static
      generation the catalog read would happen **once at build time** and newly published content would
      never appear until the next deploy — a subtle bug to diagnose. `force-dynamic` would fix it by
      re-rendering hundreds of kilobytes of rules catalog on every request; ISR is the trade.
      **A test caught the RSC change**, correctly: `library-deep-links.test.tsx` rendered the page with
      `renderToStaticMarkup`, which cannot render an async component — it renders the returned Promise as a
      child. It now awaits the component and renders its element tree, with the id map filled in
      `beforeAll` rather than at module scope.
      **Still owed here:** a creator's public content on their lobby page. Small; folded into P6-11.

- [x] **P6-11 — Images. Shipped 2026-07-28.** `POST`/`DELETE /api/dnd/homebrew/[id]/image` on the existing
      `dnd-media` bucket pattern, the `image` field wired in the builder, and rendering on the browse card,
      the detail page and the lobby strip. Also closes P6-10's remainder: `MyContentStrip` puts a creator's
      six most recent pieces on the lobby, and renders **nothing** when they have authored nothing — an
      empty "you have no content" section would just repeat the Content Builder button three inches above it.
      **Two orderings are pinned by test, because reversing either silently loses artwork:** the row is
      updated *before* the old file is deleted (reversed, a failed update leaves the piece pointing at an
      object that no longer exists — an orphan costs storage, a broken reference costs the picture), and the
      image is uploaded *after* the piece is created, never staged before it. A failed image upload reports
      as "saved, but the image did not upload" rather than as a failed save, because the content is already
      in the database and saying otherwise would have the author redo stored work.
      **`delete-route-authorization.test.ts` caught a real weakness.** The first version put the permission
      check inside a shared loader, invisible to a guard that scans each DELETE handler's own body. The guard
      is right on the substance too — on a destructive handler the authorization should be readable at the
      point of use, not one indirection away — so the check was inlined in both handlers rather than the
      guard being widened.
      Rendered on the browse card, the statblock and the library entry. *(The owner's creature-with-artwork
      case is the acceptance test.)*

- [x] **P6-12 — The class studio. Shipped 2026-07-28** *(inline feat authoring split out as P6-12b).*
      The `levels` editor (per-level name, rules text and choice-kind, with the choice kinds matching
      `ClassFeature['choice']` so marking a level "asi" genuinely tells the walker to prompt there), the
      partial-build state surfaced **while authoring** rather than discovered on save, and base-class
      derivation via `GET /api/dnd/homebrew/base-class`.
      **Derivation is a route, not shipped data:** `classesForSystem('dnd5e-2024')` is thirteen classes with
      full rules text at twenty levels — hundreds of kilobytes to fill one dropdown. It returns
      **draft-shaped keys** matching the `class` field schema, so there is no translation layer to drift.
      Three deliberate omissions, each pinned by test: **subclass features are excluded** (copying them in
      produces a class that grants one subclass's features to every character who takes it); **the source
      description is not inherited** (every derived class reading "The Fighter is a master of martial
      combat…" is worse than a blank one); and the **author's own name and prose survive a derivation**,
      because overwriting a name they had already typed with "Fighter" would be actively hostile.
      **`effects` is now the only placeholder left in the builder** — it ships with P6-9's engine bridges.

- [ ] **P6-12b — Inline feat authoring inside the class studio.** *(Split from P6-12.)* The owner's *"they
      might even be able to homebrew custom feats while making the class to make those feats available at
      certain levels."* Deliberately separate because it is a genuinely different problem from the rest of
      P6-12: it creates a SECOND piece from inside an unsaved draft, which needs a decision about what
      happens to that feat if the class is never saved. Cheap to build, easy to get wrong quietly.

- [x] **P6-13 — The creature builder + statblock. Shipped 2026-07-28.** `lib/dnd/homebrew/statblock.ts`
      (pure model + normalizer), the `statblock` and `list` editors in the builder, and a rendered statblock
      beside the uploaded art on the detail page. With P6-11's images, **the owner's creature case now works
      end to end**: stats, abilities, actions, description and artwork on one page.
      **Building the `list` editor for creatures also unlocked species lineages/traits and class resources**
      — the payoff of a registry-driven form, and the detail page renders list sections from
      `fieldsForKind` rather than naming creature fields, so a new list field on any kind prints with no
      change to that page.
      **The statblock DROPS what it cannot trust rather than clamping it.** A statblock is read off the page
      mid-combat, so a typo'd AC must render as absent, not as a plausible number the DM will use.
      **A test I wrote caught a real falsy-zero bug in my own code:** `isStatblockEmpty` used `!s.ac`, which
      treats **AC 0** as an empty statblock — legal, unusual, and invisible until the one creature that has
      it renders blank. Every numeric field now tests `=== undefined`.
      **Deliberately system-neutral:** only the shared skeleton (AC, HP, speeds, six abilities) is modelled;
      size, type, CR, senses and the rest stay their own fields, because the four systems disagree about
      what those numbers mean and a universal creature model would be subtly wrong for all of them.

- [ ] **P6-14 — The creature sheet.** *(the owner's "simple character sheet for creatures".)* A playable
      sheet tracking attacks, abilities, feats, conditions and HP — reusing the encounter/initiative model so
      a creature dropped into a fight and a creature opened from the Studio are the same object.

- [x] **P6-15 — AI assist, per field. Shipped 2026-07-28.** `lib/dnd/homebrew/assist.ts` (pure prompts +
      output cleaning), `POST /api/dnd/homebrew/assist`, and a ✨ button on each prose field.
      **Stateless, and that constraint shaped the design.** Assist matters most while writing the *first*
      draft — before the piece exists and therefore before it has an id — so the route takes the
      draft-in-progress in the body and loads nothing. A pleasant side-effect: it **writes nothing**, so
      "never auto-applies" is true at the API level rather than only in the component.
      **The proposal is held outside `values`.** A suggestion living in the form state is one refresh away
      from becoming the author's own text. It renders above the field with their existing content still
      visible, and they choose: *Use it · Replace mine · Add to mine · Another · Dismiss*.
      **Offered only on prose fields.** A number or a dropdown is faster to type than to review, and an
      assist button on every field turns a form into a slot machine. The route re-checks the field against
      the **registry** rather than trusting the client, or `field` is an arbitrary string interpolated into
      a prompt whenever the UI misbehaves.
      **The buttons are hidden, not disabled, when AI is unconfigured** — a disabled control says "you are
      missing something"; an absent one says "this form is complete". The owner's second half ("the user can
      fully build everything from scratch") is a requirement, not a fallback.
      Temperature 0.8, above the transposer's 0.7: pressing "Another" must give a genuinely different
      option, not the same sentence reworded.

- [ ] **P6-15b — Whole-draft assist.** *(Split from P6-15.)* "Fill in everything from the name and a
      sentence." Deferred because a multi-field proposal needs a per-field accept/reject UI to stay honest —
      one all-or-nothing button would quietly become the auto-apply this slice exists to avoid.

- [x] **P6-16 — File ingest. Shipped 2026-07-28.** `lib/dnd/homebrew/ingest.ts` (pure prompt + normalizer +
      merge), `POST /api/dnd/homebrew/ingest`, and an upload at the top of the builder.
      **This is the path the owner used to get the Pugilist into the repo**, so the bar is not "extract some
      text" — it is that the *wording survives*. Temperature 0.1, and the prompt is pinned as saying
      *"TRANSCRIBING, not designing"*, *"do not paraphrase rules text — a reworded rule is a different
      rule"*, and *omit rather than guess*. The failure it prevents is silent: an author reads a plausible
      sentence and does not notice it is not the one their book contains.
      **PDFs and images go to the model as native content blocks**, not OCR-to-plaintext. A class PDF's
      layout carries meaning — a level table *is* a table — and flattening it is exactly where a twenty-level
      ladder turns to mush.
      **The review step is that it fills the FORM, not the database.** The route writes nothing; the author
      sees every field before pressing Save. And `mergeIngest` fills only **empty** fields and reports which
      ones it touched, so it is safe to press twice, safe to press after you have started typing, and nobody
      is left diffing a form by eye.
      **Structured editors are deliberately out of scope** (statblock, levels, effects, lists): a level
      ladder subtly wrong from a PDF is worse than a blank one, because the author would have to check all
      twenty levels to find the drift. Those read as normal text in `description` and get entered
      deliberately. An unknown key from the model is dropped, not merged — the builder spreads this into
      form state, so a stray key would become a stray key in the saved payload.

> **The owner's original Content Studio brief is now complete.** Build anything, for any system, from
> scratch or from a document; with mechanics, artwork, statblocks and level-by-level classes; private,
> unlisted or public; adoptable onto characters; present in the library and the AI librarian; reviewable by
> AI; and translatable into another system with a full approve / retry-with-notes / hand-edit loop.
> What remains in this phase is depth and cleanup (P6-9a/b, P6-12b, P6-15b, P6-19), not the brief.

- [x] **P6-17 — AI design review. Shipped 2026-07-28.** `lib/dnd/homebrew/assess.ts` (pure prompt +
      normalizer), `POST /api/dnd/homebrew/[id]/assess`, and a creator-only panel.
      **On demand rather than on save**, which is a deliberate departure from the literal ask. A model call
      on the save path makes saving slow and makes it *fail when the model does* — against this Studio's
      central promise that an unfinished piece is kept, not thrown away. It also lets an author re-review
      after edits without re-saving, and keeps the expensive call behind its own rate-limit bucket instead
      of making every save cost AI budget. The button is one click on the piece.
      **The advisory boundary is enforced by tests, not just intent:** the update writes `assessment` and
      nothing else (no status, no payload, no name), and deliberately does **not** bump `updated_at` — a
      robot having an opinion is not a change to the piece, and bumping it would reorder the author's
      library *and* instantly mark the review stale against the very piece it described.
      **Tone is structural, not just prompt-deep:** strengths render first (a review that opens with
      problems reads as a rejection of work someone just finished), the verdict is a word rather than a
      score (a number invites optimising for it), and the prompt is pinned as saying *"not to gatekeep"* and
      *"rather than inventing a comparison"* — Ground Rule 3 applied to a reviewer.
      The prompt carries the two contexts that decide whether a review is fair: a **partial build is a
      supported state**, and a **prose-only kind is not missing its mechanics**. Without those, a model
      reliably reports both correct states as flaws.
      An unusable response is refused rather than stored as a fragment — a half-parsed review is worse than
      none, because it is shown as a considered opinion.

- [x] **P6-18 — The system transposer. Shipped 2026-07-28.** `lib/dnd/homebrew/transpose.ts` (pure prompts
      + normalizer), `POST /api/dnd/homebrew/[id]/transpose`, and a review panel with all four exits the
      owner described: **Keep it · Try again with notes · Open & edit · Discard**.
      **The loop is the feature, not the generation.** A retry sends the model *its own previous attempt*
      alongside the notes — without that it cannot tell what the author is reacting to and reliably
      reproduces the thing they just rejected — and it **rewrites the same draft** rather than stacking
      another, so a fussy author ends with one variant they like instead of nine they rejected. It runs
      hotter than the design review (0.7 vs 0.3), because a retry returning nearly the same text is useless
      to someone who just asked for something different.
      **The loop needed no new lifecycle:** approve is "it is already your private draft, stop reviewing",
      discard is the ordinary DELETE, retry is this route again. Bespoke endpoints would have meant two sets
      of rules about who may edit what.
      **`variantId` is guarded as the write primitive it is** — the target draft must be *yours* and must
      actually descend from *this* source, or "retry" becomes an arbitrary-row overwrite.
      **Provenance travels in the DESCRIPTION**, not just the UI: the description is what reaches the
      library, an export and the AI grounding, so a note living in one component is not provenance. The
      draft is created **private**, so a machine translation cannot reach a library or a sheet before a
      human has read it — the worst outcome here is a bad translation nobody knows is a translation.
      Needs only READ on the source: translating someone's *published* content into your system is
      reasonable, the result is yours with the original credited, and nothing modifies the source.

- [ ] **P6-19 — Migrate `dnd_content`.** Once the Studio is proven, move the existing campaign content into
      `dnd_homebrew` with attribution inferred from `created_by`, and retire the old route. Deliberately last
      so nothing in active play breaks early.

---

## Phase 7 — The live synced session (the Roll20-shaped table)

> **The owner's vision, 2026-07-28:** *"a Roll20 kind of session thing where people can fully build maps and
> stuff and add their character tokens to the maps and be able to actually keep track of initiative and hp
> and stats and movement and all of that in real time for the DM and each player. Everything and everyone in
> a campaign will be totally synced up."*
>
> *(Supersedes audit finding B-1, which described only the missing battle map. The real ask is bigger: the
> map is the surface, but **synced session state** is the product.)*

### What exists, and what "totally synced up" actually requires

Nearly every *piece* exists; what is missing is a **shared authoritative session state** and the canvas that
renders it. Today: `useCampaignChannel` (realtime), `useCampaignPresence`, `dnd_encounters` +
`dnd_initiative_entries` (per-instance HP, turn order), `NpcLibrary`, `RevealOverlay`/`RevealTrigger`,
`TokenFramer` (token art), `dnd_roll_log`, `SessionConsole`. The Map Studio is stellar cartography with
**zero tokens, grid, fog or measurement** — the string "token" appears 0 times in its 2,826 lines — and it is
a same-origin vanilla iframe, so it cannot reach the realtime channel. **The battle map is a new React
surface, not an extension of it.**

### The three design decisions everything else follows from

**1. Authority — who owns truth for each piece of state.** Get this wrong and you get two players dragging
one token forever. The rule:

| State | Authority | Why |
|---|---|---|
| Map, grid, fog, DM-hidden tokens | **DM** | Players must not be able to reveal what the DM hid — enforce server-side, not by hiding the UI. |
| A token's position | **its controller**, DM overrides | The player moving their own character is the whole feel of a VTT; a DM veto covers grapples, forced movement, shoves. |
| Initiative order, HP, conditions | **server** (`dnd_initiative_entries`) | Already the durable model; two clients must never disagree about whose turn it is. |
| A character's sheet | **the sheet's existing write gate** | Do not fork sheet state into the session — the map reads the sheet, it does not own it. |

**2. Two transports, deliberately.** Ephemeral high-frequency events (a drag in progress, a cursor, a ping)
go over **Realtime broadcast only** — never persisted, lost on reload, and that is correct. Durable state
(committed position, HP, conditions, fog) is a **Postgres write that then broadcasts**. Writing every
mouse-move to Postgres is the mistake that makes these things unusable.

**3. Optimistic local, reconcile on echo.** The mover sees their token move at 0ms; everyone else sees it on
the broadcast; the durable write reconciles. A token carries a `version` so a late echo cannot rubber-band a
newer local move.

### Slices

- [ ] **P7-1 — The session state model.** `seeds/456_dnd_battle.sql`: `dnd_battle_maps` (campaign, name,
      image, grid size/offset/unit, scale) and `dnd_battle_tokens` (map, character_id or initiative_entry_id,
      x, y, size, controller_user_id, hidden, version). Plus `lib/dnd/battle/model.ts` — pure: grid
      snapping, pixel↔grid conversion, and `canControlToken(token, viewer)`. Pure first so the rules are
      testable without a canvas.
- [ ] **P7-2 — The map surface.** `/dnd/campaigns/[id]/battle` — upload or pick an image, pan/zoom, and set
      the grid by **dragging across two known squares** (never by typing a pixel size, which nobody knows).
      Pointer Events from the start, so it works on a tablet — do not repeat P10-1.
- [ ] **P7-3 — Tokens on the board.** Seeded from the encounter's initiative entries, so HP, conditions and
      turn order are correct on arrival rather than re-entered. Portrait/token art from `TokenFramer`. Drag
      to move with snapping; DM can add, remove, resize and hide.
- [ ] **P7-4 — Realtime sync.** The two transports above, over the existing campaign channel. Includes the
      unglamorous parts that decide whether it feels alive: presence (who is looking at this map), a late
      joiner receiving full state, and reconnect-after-sleep without a stale board.
- [ ] **P7-5 — Movement tracking.** Distance as you drag, measured in the map's own units, against the
      creature's speed — with **each system's own diagonal rule** (5e 2014 optional 5-10-5, 2024 flat, PF2's
      every-other-diagonal). Do not average them into one wrong rule. Shows remaining movement this turn.
- [ ] **P7-6 — Turn integration.** The current combatant is highlighted on the board; ending a turn advances
      the tracker and resets that token's movement budget. **This is what makes the map a tool rather than a
      picture**, and it is the slice most likely to be skipped.
- [ ] **P7-7 — Fog of war.** A DM-painted reveal layer; players receive only revealed regions — filtered
      **server-side**, because a client-side mask is a screenshot away from being no mask at all.
- [ ] **P7-8 — HP, conditions and stats on the board.** Token HP bars (DM sees numbers, players see a band
      unless the DM opts in), condition icons, and click-through to the full sheet. Two-way: damage applied
      on the board lands on the sheet through the existing edit path, so it is undoable like any other change.
- [ ] **P7-9 — Templates and area effects.** Cone / circle / line / emanation per the system's geometry,
      with the creatures caught in one highlighted.
- [ ] **P7-10 — Player-side polish.** Pings ("look here"), a shared drawing layer, and per-player token
      control so a player moves only their own — the difference between a DM demo and a table everyone plays
      at.
- [ ] **P7-11 — Map building.** Layers, a stamp/asset palette, and import of the existing published campaign
      maps so the Map Studio's galaxy maps can be used as battle backdrops. *(The owner's "fully build maps
      and stuff".)*
- [ ] **P7-12 — The session shell.** One `/dnd/campaigns/[id]/play` that puts the board, the initiative
      tracker, the roll feed (P3-1) and chat in a single synced screen for DM and players — the thing the
      vision actually describes. Everything before this is a component of it.

> **Sequencing note.** P7-1 → P7-4 is the spine; stop there and you have a shared board, which is already
> most of the value. P7-5/6/8 are what make it a *rules* tool rather than a shared whiteboard. P3-1 (rolls
> reaching the shared log) should land before P7-12, or the session shell will have a roll feed showing
> nothing.

---

## Phase RO — The roller: every roll fully explained, on every system and template

> **Owner, 2026-07-28**, across four messages while the audit work was running:
> *"I am rolling a 1d4 and getting a 5… Maybe characters get a bonus on every roll at certain levels or
> whatever. Please figure it out. Make sure to have tool tips or something that come along with the dice
> roller to explain exactly why certain things are added and where certain bonuses/buffs/penalties/debuffs
> are coming from. We should be able to see the fully explained breakdown of a given roll with any system
> and any template if we want."*
>
> Plus: *"re-evaluate the sigil stacker to make sure it makes sense for each system"*, *"make sure the
> impact version… animates properly"*, and *"look at the rules and all of the different kinds of rolls that
> IG has"*.

**THE ORGANISING PRINCIPLE, learned from the 1d4 bug.** That roll was not wrong by accident — it was the
Offensive stance's real *"+half your level to damage rolls"* applied to a dice-pad roll that is not a damage
roll. The number was defensible and the **explanation was absent**, so it read as a bug. On a rules engine
those are the same failure: *a total nobody can trace is indistinguishable from a total that is wrong.*
Every slice below serves that one rule.

- [x] **RO-7 — Switching template must not re-roll.** Shipped 2026-07-28 (`3775a53e`). Each roller seeded
      `lastToken` with `-1`, so a freshly-mounted roller replayed the roll sitting in the store — and
      re-committed it, duplicating rolls in the shared feed and skewing P3-3. Now seeds from
      `adoptedToken(activeRoll)` and renders the adopted roll settled.

- [x] **RO-8 — One window size; no resizing.** Shipped 2026-07-28. Fixed 396×560, resize corner removed,
      stored sizes discarded on load. Height tokens unified the three bespoke stages.

- [x] **RO-9 — A raw die is raw.** Shipped 2026-07-28 (`d9dc75ca`). The dice pad routed through
      `rollDamage`; it now uses `rollRaw`. `buildDamageActiveRoll` gained `boosts`/`penalties` so a folded
      bonus is NAMED — the foundation everything below builds on.

- [x] **RO-10 — Damage rolls name their sources on EVERY system.** The gap RO-9 exposed is not IG-specific:
      **d20 rolls pass `boosts`/`penalties`; damage rolls pass neither.** `usePf2Panels.rollDamage` and the
      5e store's damage path both drop them, so a striking rune, a weapon specialisation, a rage bonus or a
      stance appears only as an unexplained term inside the breakdown string. All three rollers already
      RENDER these (▲/▼ tiles, cards, rows) — the plumbing exists and nothing feeds it. **Done when:** each
      system's damage path passes the named sources it already knows about, with a test per system.

      **Done 2026-07-28 for IG and PF2.** The find worth recording: **`PF2StrikeResult.notes` documents
      itself as *"Human-readable reasons, so the roller can show its work like the IG sheet does"* — and
      nothing had ever passed it anywhere.** The striking rune, the potency bonus, the attribute applying to
      damage: all resolved, all named, all invisible. One extra argument surfaced the lot. PF2's dice pad
      also routed through `rollDamage` like IG's; unlike IG the NUMBER was never wrong there (PF2 folds
      nothing extra in) but the log called an arbitrary die "damage", so both now use `rollRaw`.

      **Still open, deliberately: IG weapon damage's own ability modifier.** `igResolveAttack` folds it into
      the expression string (`1d6+3`) and returns no name for it, so surfacing it means widening a tested
      rules function's return type. That is a real change to the engine rather than to the roller, and it
      belongs in its own slice rather than riding along here. The stance bonus — the one that caused the
      1d4→5 report — IS named. **RO-10b.**

      Two tests re-pointed rather than loosened: both pinned the exact `rollDamage(...)` call signature,
      which gained its third argument. The properties they guard (tap-to-roll, and rolling the RESOLVED
      expression rather than the stored die) are unchanged.

- [x] **RO-11 — A "why?" affordance on the total.** The owner asked for *tool tips… to explain exactly why
      certain things are added*. The breakdown string answers *what*; this answers *where from*. One shared
      component reading `entry.boosts` / `entry.penalties` / `entry.tag`, mounted by all four rollers, so
      the explanation cannot differ per template. **Done when:** hovering (or tapping) the total on any
      roller, on any system, names every contributing source.

      **Done 2026-07-28.** `RollWhy` + `rollWhy.css`, a disclosure that renders the arithmetic, then the
      NAMED sources with ▲/▼ glyphs, then the system tag — and nothing at all when there is nothing to
      explain, so a plain d6 does not grow an empty box.

      **The find: Dice Core — the DEFAULT roller — rendered no named sources at all.** Sigil Stack, Roll
      Board and Impact had each grown their own version; the template most people use had none, so *"any
      system and any template"* was already false where it mattered most. Its `reveal` state did not even
      carry `boosts`/`penalties` from the entry.

      **And I found a bug in my own RO-7 fix while doing it.** RO-7 fixed the re-roll-on-template-switch in
      the three bespoke rollers and **missed `RollStage`**, which had the identical `useRef(-1)` seed. The
      test passed because it listed the three files I had edited rather than sweeping every roller. Both are
      fixed: Dice Core adopts too, and the guard now covers all four — including allowing `useRef<number>(…)`,
      since the bare substring check would have excused the annotated form anyway.

      The CSS is scoped to `.rw`, deliberately NOT under `.dnd-sheet`: PF2 and IG do not import theme.css,
      and a `.dnd-sheet`-scoped rule renders unstyled there — the exact bug RO-5 fixed for the Dice Core
      stage, and the easiest one to reintroduce.

- [x] **RO-12 — Catalogue the IG roll kinds and check the roller against each.** *"Look at the rules and
      all of the different kinds of rolls that IG has."* IG has skill checks, saves (Fort/Ref/Will),
      attacks, damage, and stance/condition-modified variants with advantage and disadvantage from
      `igStanceRollEffect` / `igConditionRollEffect`. Write the list down FIRST, then verify each renders
      correctly in all four rollers. **Not** a refactor until the list exists — this is the slice that finds
      out whether "revamp" means anything more than RO-10 + RO-11.

      **Done 2026-07-28, and writing the list first is what found the bug.** The catalogue, from
      `IgRollKind`: `attack · reflex_save · fortitude_save · will_save · save · perception · str_dex_check ·
      skill · ability_check · any`, where `any` matches every d20 roll and `save` is a bucket over the three
      specific saves.

      **Nine of the ten were reachable. `skill` and `perception` were not.** The skills list called
      `rollLine(label, total)` with no kind, so **every skill fell to the default `ability_check`** — and
      IG's conditions target kinds by name. Blind, Deaf, Fascinated and Prone each impose disadvantage on
      **`perception`** specifically, so **a blinded character rolling Perception got a clean d20.** The
      condition was on the sheet, the rule was implemented and unit-tested, and the roll never asked for it.

      That is the same shape as `PF2StrikeResult.notes` in RO-10 and Dice Core's missing sources in RO-11 —
      three consecutive slices where the engine was right and the caller asked the wrong question. Worth
      naming as a pattern: **in this codebase, "the rule is implemented" and "the rule applies" are separate
      claims, and only the second one matters to a player.**

      Perception now routes to its own kind and every other skill to `skill`. A test asserts all ten kinds
      are either sent by a surface or reached as a bucket, so a new roll surface that forgets its kind fails
      rather than silently rolling as a generic check.

      **Not a revamp.** With RO-10, RO-11 and this in place, IG's rolls carry the right kind, name their
      sources, and explain themselves on every template. What remains is visual (RO-13), not structural.

- [x] **RO-13 — Browser QA the rollers.** Four templates × four systems × idle/rolling/settled. **This is
      the one that cannot be skipped**: RO-7 through RO-9 are verified by tests and by reading, and the
      owner's reports were all VISUAL — "too tall", "animates properly", "seems like something is off".
      A green suite has repeatedly missed exactly this class of defect in this repo. Needs a working
      `dnd_session` cookie; the mint attempt during RO-9 kept redirecting and was abandoned rather than
      faked.

      **Done 2026-07-28 — and it immediately found a real bug the whole test suite could not see.**

      **First, the session.** The earlier mint failed because `exp` is written in MILLISECONDS
      (`Date.now() + MAX_AGE * 1000`) and checked with `Date.now() > p.exp`. Minting it in seconds made
      every token read as long expired, which presents as a silent redirect to `/dnd` rather than an error —
      indistinguishable from "not signed in". Recorded here because it will cost the next person an hour.

      **THE FIND: the roller window could never show its content, at any height.** The PF2/IG roller nodes
      wrap themselves in `.dnd-sheet` to pick up the theme tokens — but `.dnd-sheet` is also the PAGE
      wrapper, carrying `min-height: 100vh` and four full-page background gradients. Inside a 560px window
      that stretched to the full viewport: **measured 889px of "content" for 312px of actual roller**, so
      the body always reported an overflow and always showed a scrollbar. Making the window taller could
      never have fixed it — the content was not big, the wrapper was *claiming* to be. `.fld-body
      .dnd-sheet` now resets those two page-level properties; the tokens, which are the entire reason for
      the wrapper, are inherited and untouched. Re-measured: **347px content in a 532px body, no overflow.**

      **What browser QA CONFIRMED working:** the d4 rolls 1 and displays **1**, not 5 (RO-9); switching
      Sigil Stack → Impact keeps the same value with no re-roll (RO-7); the stage measures exactly 176px on
      IG (RO-8); the window is 560px and the resize corner is gone; all four template buttons and the dice
      pad render on the IG shell.

- [x] **RO-14 — Impact renders a phantom `flat` row for a bare die.** Found during RO-13 and deliberately
      left open rather than guessed at.

      **Done 2026-07-29, root-caused rather than patched.** `rollDiceExpr` returns
      **`"1d4[1] = 1"`** — the total is appended to the breakdown for readability. Both damage tokenisers
      split on whitespace and treat any bare number as a flat modifier, so **the trailing total was read
      back as a `+1` term**. `stripTotalTail` (shared, in `rollerAnim.ts`) removes only a trailing
      `= <number>`; an `=` anywhere else is left alone rather than guessed at.

      **What made it findable was the inconsistency, not the duplicate.** `1d4[1]` plus `+1` is 2, and the
      total row correctly said 1 — so the phantom did not sum with its own siblings. **A term that does not
      agree with the total was never a term**, which is what ruled out the expression parsers and pointed
      at render-time tokenising.

      **And it was in TWO places at once.** `buildDamageRows` (Impact) and `buildDamageTiles` (Sigil Stack)
      are near-identical, and the Sigil Stack showed the same phantom — which is how the shared cause was
      identified. Fixing only the roller the bug was reported against would have left the other wrong and
      looking correct. Both now call the shared helper, and a test asserts both do.

      Verified in the browser on the IG sheet: rows are now `1d4 +1` and `Total 1`, with no `flat`.

      **The evidence, measured in the DOM** (IG sheet, Impact template, dice pad `d4`):
      ```
      .ir-row.ir-r-die    "1d4 +1"
      .ir-row.ir-r-mod    "flat +1"     ← phantom
      .ir-row.ir-r-total  "Total 1"
      ```
      The **total is correct**; only the decomposition double-counts. Note it is also self-inconsistent —
      `1d4[1]` plus a `+1` flat would total 2, and the total row says 1 — so the flat row is invented at
      RENDER time, not carried in the roll.

      **What has been ruled out.** There are TWO `rollDiceExpr`s in this codebase and the roller uses
      `lib/dnd/roll.ts`, not `app/dnd/_sheet/lib/dice.ts` (the `1d4` label rather than `d4` is what
      identifies it). Both were read line by line: `parseDiceExpr('1d4')` yields `dice: [{count:1,sides:4}],
      modifier: 0`, and the emitter only appends a flat part `if (parsed.modifier)`. So **the breakdown
      string is `1d4[1]` with no flat token**, and the fault is downstream — in `ImpactRoller`'s
      `buildDamageRows`, or in what `buildRows` appends around it.

      **Why it is not fixed here.** `buildDamageRows` feeds three rollers and every damage breakdown on
      every system. Changing its tokenising on a hypothesis, at the end of a long session, is exactly the
      kind of edit that trades a cosmetic duplicate row for a wrong number somewhere I am not looking. The
      next session should start by printing the actual `entry.breakdown` at the Impact call site — one
      `console.log` settles it — rather than reasoning about it further.

---

## Phase 8 — Content coverage

- [ ] **P8-1 — A bestiary.** *(E-1.)* No monster catalogue exists in any system; NPCs are hand- or AI-built
      per campaign and reusable only within it. Every other content axis is catalogued — monsters are the
      conspicuous omission, and they are what a DM needs most between sessions.
      **Design:** `lib/dnd/monsters/<system>.ts` from the CC-licensed subsets (5e SRD; PF2 Monster Core),
      sharing the creature model from P6-13 so a homebrew creature and an official one are the same shape.
- [ ] **P8-2 — Magic items.** *(E-4.)* SRD magic items for 5e; PF2's runes are already modelled and are the
      equivalent surface there.
- [ ] **P8-3 — The IG glossary.** *(E-2.)* Intuitive Games has 32 terms — fewer than **every** unbuilt system
      (Blades 60, Shadowrun 55, CoC 51) and a third of PF2's 96. Another scrape pass of intuitivegames.net.
      Ground Rule 3: scrape, do not invent.
- [x] **P8-4 — PF2 spell coverage + an explicit gaps list.** *(E-3.)* 208 spells against 5e's 382, roughly
      half of Player Core. Extend the `PF2_*_GAPS` convention to spells so an absent spell reads as "not
      catalogued yet" in the picker rather than as "does not exist".

      **Done 2026-07-29.** `data/spell-gaps.ts` — `PF2_SPELL_GAPS`, a derived `pf2SpellCoverage()`, and
      `pf2SpellSearchMiss()`; the PF2 content picker now uses all three.

      **The data layer was already honest; nothing carried it to a person.** Both spell status blocks have
      said it outright since they were written — *"a missing spell here means 'not catalogued yet', NEVER
      'does not exist in Pathfinder 2e'"* — and the one place a user could have discovered that said
      **"Nothing matches that search."** That is a claim about Pathfinder. The replacement is a claim about
      *us*, which is the only one we can actually make, and it carries the count. The feat picker got the
      same sentence, and the gaps list is now reachable from the picker behind a **what's missing?**
      disclosure — the feat, ancestry and class-progression gaps lists have existed since those catalogues
      were written and were reachable only by reading the source.

      **Every number is counted, not recorded** — a hand-written coverage summary is right the day it is
      written and quietly wrong afterwards, which is worse than none because it reads authoritative.

      **Two ways a derived number still misled, both caught before commit and both now pinned.** Counting
      focus spells in `byRank` made rank 1 read **125** against rank 2's 12 — most focus spells are rank 1,
      so it looked like superb first-rank coverage and was nothing of the sort. And the focus-spell gap
      derived over content.ts's `PF2_CLASSES`, which holds 14 of the 21 classes, so it emitted *"Every
      spellcasting class has catalogued focus spells"* — **flatly false**, since Magus and Summoner are
      exactly the ones missing and the catalogue's own note has said so all along. A derived claim is only
      as honest as the set it derives over. An earlier draft also listed Alchemist, Barbarian, Fighter and
      Rogue as missing focus spells; they have none to be missing, and a gaps list carrying four non-gaps
      teaches the reader to distrust the rest of it.

      Reads now: 208 spells (117 slot-cast, 91 focus); no focus spells for **Magus, Summoner**; ranks 3 and
      5–10 under ten slot-cast entries each.

---

## Phase 9 — Data lifecycle

- [x] **P9-1 — JSON import.** *(H-1.)* Export produces a genuinely loss-less JSON; **nothing reads it back**.
      `/api/dnd/characters/import` is a different thing entirely (file upload → AI ingestion), so a user's own
      perfect backup can only be re-ingested by having a model guess at it.
      **Design:** `POST /api/dnd/characters/import-json` validating the exported shape, normalising the
      system, creating the character with its sidecar intact — **plus a round-trip test** (export → import →
      deep-equal), which is also the strongest possible guard on the export's completeness claim.

      **Done 2026-07-29.** Built to the design above. `lib/dnd/export/character-import.ts` (pure parser),
      the route, and an `⇪ Import JSON` button beside **＋ New character** on the characters hub.

      **The round-trip test earns its place twice.** It is the import's correctness test *and* the first
      thing that has ever checked the export's "literally everything" claim against anything but a person
      looking at the file. The fixture is built out of the values a helpful normaliser eats: `quantity: 0`,
      `invested: false`, `notes: ''`, `age: 0`, and a `null` five levels down. A **second** round trip is
      asserted byte-identical to the first, which is the real guard — a character that degrades slightly
      with every backup would pass a single-pass test forever.

      Parsing is a **pure module**, not route code, which is the only reason any of that is testable without
      a database.

      **Three decisions worth their comments.** *Missing* `data` and *damaged* `data` are different errors,
      because they mean different things to whoever is holding the file — "wrong file" versus "broken file",
      and collapsing them sends someone hunting the wrong problem. The system goes through
      `normalizeSystem`, so a hand-edited file cannot create a character in a system the rest of the app
      does not believe in. And the export's `updatedAt` is **reported, never written** to `updated_at`: a
      restore claiming last March sorts wrong in every list the user has.

      A restored character lands **private** and campaign-less by default. Restoring a backup when the
      campaign it belonged to is gone has to work, or the backup is useless in the one situation you
      actually need it; and un-sharing something already seen is not a thing you can do.

      **`ROUND_TRIP_FIELDS` makes an omission a decision.** `artSrc`/`tokenSrc` are on `CharacterExport` for
      the HTML path only and `characterToJson` never emits them. The list is asserted against the export's
      real key set, so if the export grows a field, this fails until someone says whether it round-trips.
- [x] **P9-2 — Campaign export.** *(H-2.)* Roster, session notes, recaps, maps, handouts, NPCs, roll log and
      chat. With P2-5, this is what makes deleting a campaign a safe action rather than a destructive one.

      **Done 2026-07-29.** `lib/dnd/export/campaign-export.ts`, `GET /api/dnd/campaigns/[id]/export`, and
      an **⇩ Export everything** button in the same panel as Archive and Delete — sixteen tables in one
      JSON file.

      **The manifest is the whole design, and a test is what makes it true.** A hand-written export that
      reads six tables is right until someone adds a seventh, and then it silently returns an incomplete
      backup — the worst failure available here, because it *looks* complete and is discovered only when
      somebody tries to restore. So every campaign-scoped table is listed with **how** it links to the
      campaign, every omission with **why**, and a test derives the candidate set by parsing `CREATE TABLE`
      blocks out of `seeds/*.sql`: a new table declaring a `campaign_id` fails the suite until it is
      exported or excluded. That test also asserts the scan finds something, because a regex that matched
      nothing would make every other assertion vacuously true — which is how a guard like this dies quietly.

      **Characters are excluded, and it is a privacy decision rather than an oversight.** They already
      survive a campaign's deletion by design (the delete handler detaches them first, precisely so a DM
      closing their table cannot destroy other people's sheets), each has its own loss-less export that its
      *owner* controls (P9-1), and bundling every player's full sheet into a file the DM downloads hands one
      person a copy of everyone else's character. The roster **link** is exported, so a restore still knows
      who played. The reason travels *inside* the file, not just in this repo.

      Four smaller decisions: every manifest key appears with an **empty array** rather than being omitted,
      because "not read" and "had nothing in it" are different facts to whoever is restoring; row **counts**
      ride along so the file states its own completeness; a missing table yields `[]` rather than a 500,
      since an export that dies because the soundboard was never migrated is useless in exactly the
      situation it exists for; and recaps, encounters, RSVPs and initiative resolve **through sessions**,
      because a `campaign_id` filter on those returns nothing and reads as "this campaign had no recaps".

      The export is offered **again inside the delete confirmation**. Someone who reached that dialog did
      not read the toolbar, and one extra line is the difference between a warning and a way out.
- [ ] **P9-3 — Pathbuilder import.** *(H-3.)* A deterministic adapter for Pathbuilder's JSON — fast, exact,
      free of model cost, and aimed at PF2 players, who are currently the least-served.

---

## Phase 10 — Accessibility, devices & polish

- [ ] **P10-1 — Pointer events + responsive map studio.** *(G-1.)* 18 `mousedown`/`mousemove` handlers,
      **zero** touch or pointer handlers, **zero** media queries across 2,826 lines — so the DM's only map
      tool is unusable on a tablet or phone, while the player console it embeds *does* have touch handling.
      Convert to Pointer Events (largely mechanical) plus `touch-action` CSS; add a breakpoint collapsing the
      tab rail and inspector into drawers below ~900px.
- [ ] **P10-2 — Hold the line on inline styles.** *(G-2.)* 3,111 inline `style={{…}}` objects against 658
      CSS-module class uses — which is why every theming pass has been expensive: an inline colour cannot be
      reached by a token, a media query, a print stylesheet or a contrast audit. **Not a rewrite:** a lint
      rule flagging hex literals inside `style={{}}`, and opportunistic migration whenever a file is touched.
- [ ] **P10-3 — A native print stylesheet for the live sheet.** The HTML export already carries print CSS;
      applying the same rules to the live sheet makes Ctrl-P produce something real.
- [ ] **P10-4 — Discord webhook.** Rolls and session reminders out to where tables already are. Nearly free
      once P3-1 lands.
- [ ] **P10-5 — Offline / PWA sheet.** Sheets are already client-rendered from one JSON blob, so the hardest
      part of offline is already true.
- [ ] **P10-6 — An i18n passthrough.** *(G-3.)* No message catalogue anywhere. If it will ever matter, the
      cheap move now is a `t()` passthrough for new user-facing strings; retrofitting after another 100k
      lines is materially harder.

---

## Blocked on the owner — data, not effort

Each is pinned by a test that **flips when the data arrives**, so none can be quietly forgotten or quietly
filled in from the shape of its neighbours.

| Item | Needs | Where |
|---|---|---|
| ~~**Pugilist / Street Saint / Down but Not Out**~~ | **UNBLOCKED + SHIPPED 2026-07-28** — see below. | — |
| **IG Champion** | Champion's powers and specializations. Not in the intuitivegames.net scrape; every other subclass has them verbatim. | `slot-plan-blockers.test.ts` |
| **Magus / Summoner** | The published *reduced*-caster spell tables. Every full caster is handled. | `slot-plan-blockers.test.ts` |
| **IG level-1 feat count** | The site says "starting feats" without a number. The builder allows exactly one and errs permissive. | `slot-plan-blockers.test.ts` |
| **PF2 prepared cap** | A decision, not data: whether to *enforce* it. Everything needed is in place. | — |
| **Six unbuilt systems** | One scrapeable source per system, one at a time. | `under-construction-gating.test.ts` |

### Pugilist — resolved 2026-07-28, and what it taught

The owner supplied the full 2014 class text, the author's Street Saint PDF, and the 2024 Down but Not Out
text. Three things shipped, and a fourth is now a recorded conflict rather than a silent guess:

1. **The shipped 2014 data was verified, not changed.** Every feature at every level, the Moxie table
   (—/2/2/3/3/4/4/5/5/6/6/7/7/8/8/9/9/10/10/12) and the Fisticuffs ladder (1d6 → 1d8@5 → 1d10@11 → 1d12@17)
   all matched the source exactly. *A source arriving and confirming what you already had is the good
   outcome, and it is worth writing down that it happened.*
2. **Street Saint is written out in full.** Transcribed verbatim from `street-saint_redux.pdf` — Channel
   Divinity (Fists of Faith · Grace of the Gods) + Lay on Hands at 3, Hallowed Hands at 6, Ravaged but
   Resolute at 11, Aura of Resilience at 17. It is an **eighth 2014 Fight Club**, not a 2024-only one: its
   features key off Bloodied but Unbowed (3) and Dig Deep (4) and it uses the 2014 ladder.
   **The pin flipped exactly as designed** — `pugilist-class.test.ts` required the body to say "under
   construction", and filling it in turned that test red, which is the signal to replace it with assertions
   on the real thing. That is the pin mechanism paying for itself.
3. **Down but Not Out was missing from the 2024 class entirely** and is now at level 7.
4. **A genuine edition divergence, recorded rather than averaged.** The two editions disagree about this
   feature, and about Street Saint's Channel Divinity:

   | | 2014 (class document) | 2024 (D&D Beyond printing) |
   |---|---|---|
   | Down but Not Out | level **9**, adds **proficiency bonus** | level **7**, adds **CON modifier + current exhaustion levels** |
   | Street Saint CD | Fists of Faith — crit on 19–20 | an earlier note described "+d4 per attack, once per short rest" |

   The 2024 Street Saint wording has **not** been supplied, so its entry carries the 2021 text with an
   explicit caveat in its own description. **Do not reconcile these by picking the average** — that produces
   a version matching neither book.

- [ ] **P0-6 — The 2024 Street Saint's own text.** *(Blocked on data.)* Needed to resolve row 4 above.
      Until it arrives the 2024 entry correctly reuses the 2021 text and says so.

**Author's name corrected repo-wide: Benjamin *Huffman*, not Hoffman** (per the PDF's own credits and the
community homebrew repo). It was wrong in three files and two tests.

---

## Open questions — answered with a recorded assumption rather than blocking

1. **Who approves public content?** Assumption: **public is self-serve**, with the per-campaign DM allowlist
   (which already exists) as the gate that actually matters for play. The `submitted`/`approved` states stay
   in the model for a curator flow if one is ever wanted.
2. **`'any'` system scope.** Assumption: **offered, but only for kinds whose mechanics are prose** — an
   `'any'` class is not a meaningful object when every engine's class model differs. Encoded in
   `KindSpec.allowAnySystem`.
3. **Milestone vs XP.** Assumption: XP is opt-in per campaign (P3-4), so tables that do not use it never see
   it.
