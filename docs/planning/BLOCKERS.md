# Blockers — what only you can unblock (as of 2026-07-18)

The four docs in `in-progress/` are each ~90% shipped. Everything that could be built, tested, and
verified autonomously **is** — the app test suites are green (the dnd suite alone is **2,269 passing** as of
2026-07-18). Per the project's own rubric (`docs/planning/README.md`), all four correctly REMAIN in
`in-progress/`: each still contains action items not yet done, and none meets the COMPLETED bar ("the feature
has shipped"). What remains in all four is genuinely gated on your input: **decisions only you can make,
content only you/Brendan have, and things that need eyes on a running app or a device build** — none of
it is "cost exceeds value" busywork that could be honestly deferred to empty the folder. This memo
consolidates every one of those into a single checklist so you can spend your input where it unblocks
the most, then hand it back.

Each item names the exact code impact and where it's detailed. None of these were guessed or faked —
attempting them without your input would either violate a ground rule (fabricating rules text) or
overwrite a deliberate design.

---

## A00. 2,591 lines of finished work are in a gitignored worktree — found 2026-08-29

- [ ] **Decide: merge `worktree-surveying-payments-2026-07-29`, cherry-pick from it, or delete it.**

> ```
> $ git worktree list
> C:/dev/STARR-SURVEYING                                       [claude/org-scope-backfill-2026-08-29]
> C:/dev/STARR-SURVEYING/.claude/worktrees/surveying-payments-2026-07-29  bbfef6094
> ```
>
> One commit, **2026-07-29 — a month old**, not an ancestor of `main`:
>
> `feat(business): Texas taxes surveying — so the invoice has to prove it`
>
> | File | Lines | In `main`? |
> |---|---|---|
> | `lib/compliance/records-catalogue.ts` | 1,138 | **No** |
> | `lib/payments/sales-tax.ts` | 387 | **No** |
> | `lib/compliance/deadlines.ts` | 308 | **No** |
> | `__tests__/compliance/records-deadlines.test.ts` | 291 | **No** |
> | `__tests__/payments/sales-tax.test.ts` | 279 | **No** |
> | `docs/planning/.../BUSINESS_RECORDS_AND_COMPLIANCE_2026-07-29.md` | 188 | **No** |
>
> **It is not urgent, and that is worth stating first.** `main` is correct by design, not broken:
> `lib/payments/invoice-number.ts` says so in as many words — *"`tax_cents` is the office-typed
> amount (we don't compute sales tax — the office knows the rate)"*. The invoice carries a
> `tax_cents` column and the office types the number. The worktree would compute it instead. That is
> an enhancement to a working decision, not a fix to a bug.
>
> **What makes it worth a blocker is that nothing would ever have found it.** `.claude/worktrees/` is
> in `.gitignore` (line 79), so `git ls-files` — which every scanner in this repo uses, including
> `verify:orphans` and the guards written today — cannot see it. It is on a branch nobody lists. It
> surfaced only because a `find` for an unrelated filename returned two copies of the same file, and
> the second path looked wrong.
>
> This is the pattern [[project_phone_calls_voicemail]] already records: work that is finished,
> tested, and simply never merged, reading as shipped because it exists on somebody's disk. The rule
> from that entry applies exactly — **`git merge-base --is-ancestor` before believing anything is
> live**, and here it returns false.
>
> **Three resolutions, and it is the owner's call:**
>
> 1. **Merge it.** Texas does tax surveying services, and a computed rate is harder to get wrong than
>    a typed one. 570 lines of its own tests came with it.
> 2. **Cherry-pick.** The compliance half — a 1,138-line records catalogue and a deadlines module —
>    is a separate concern from sales tax and may be wanted on a different timetable.
> 3. **Delete the worktree.** If the office-typed amount is the deliberate long-term answer, 2,591
>    lines of plausible unused code is worse than none, because the next person cannot tell it never
>    ran.
>
> Not touched here beyond reading it. Merging a month-old branch that predates the `org_id` work,
> the project layer and the page consolidation is not a decision to make on someone's behalf at the
> end of a long session.

## A0. Spend has a per-run ceiling and no aggregate one — recorded 2026-08-29, BEFORE it matters

- [ ] **Decide whether an aggregate spend cap is needed before `RESEARCH_QUEUE_POLLER=1` is ever set.**

> Filed the day the owner put a card and a balance on the TexasFile account, because that is the day
> "the worker can spend money" stopped being theoretical.
>
> **What already exists, and is well built** — `worker/src/infra/run-budget.ts`:
>
> | | |
> |---|---|
> | `maxCostUsd` | **$2.00** per run — AI, paid pages and captcha solves together |
> | `maxPaidPages` | **20** — a SEPARATE ceiling, because "one \$50 plat set can pass the dollar limit in a single purchase, and that decision deserves its own bound" |
> | `maxWallClockMs` | 25 minutes, clamped to 1–60 |
>
> It is enforced in the right place and the right way: `document-purchase-orchestrator.ts` calls
> `checkBudget(projectId, estCostNum)` **before** each purchase, on the estimate — checking after
> would mean the limit is discovered by exceeding it. And exceeding it SKIPS that document with
> `status: 'budget_exceeded'` and the numbers logged, rather than aborting: a run that died would
> waste the documents it had already paid for.
>
> **The gap: every one of those bounds is per run. There is no daily, weekly or account-wide cap.**
> Ten runs is ten times two dollars, and nothing in the system knows that.
>
> **Today that is fine, for one specific reason and not by design.** Runs are started by a human, so
> the human is the cap. `RESEARCH_QUEUE_POLLER` is unset, and `worker/.env.example` is explicit that
> turning it on "is a deployment decision, not a code change".
>
> **The trigger is exact: the day `RESEARCH_QUEUE_POLLER=1` is set.** The poller's own header calls
> it *"the one loop in the platform that spends money and touches other people's servers with no
> human in the loop"*. It has real admission control — concurrency, per-county serialisation,
> priority, back-pressure (R28/R29) — and **none of it is a spend cap**. Verified 2026-08-29 by
> reading `queue-poller.ts`: no reference to cost, spend or budget anywhere in it.
>
> So the decision is: before that flag is ever set, either add an aggregate ceiling, or accept
> per-run × unbounded-runs and rely on the TexasFile balance itself as the backstop — which is a
> legitimate answer, since a spent balance simply fails purchases. It is only a bad answer if nobody
> chose it.
>
> Not built here. An aggregate cap needs persistence and a reset window, and inventing a policy for
> a loop that is switched off would be guessing at the owner's risk appetite with their money.

## A. Decisions (each converts directly to shipped code)

- [x] **`auth.users` was empty while five NOT NULL FKs pointed at it — RESOLVED 2026-08-12 (R9).** Decision (owner): mirror the id — `auth.users.id == registered_users.id` — rather than repoint the FKs, because it satisfies the FKs AND keeps the four `user_id = auth.uid()` RLS policies on `receipts` correct. Shipped `seeds/582` (7/7 accounts backfilled, ids matching) + `public.ensure_auth_user()` (SECURITY DEFINER, service_role only) + `lib/auth/mirror-auth-user.ts` wired into all four creation paths, with the Google branch self-healing on every sign-in. **Proved end to end:** an `employee`-only account uploaded a receipt on a 390px viewport → 200, extraction `done` at 2c, every field plus 4 line items. *One trap recorded for anyone else inserting into `auth.users`: GoTrue reads eight token columns as non-nullable strings, so leaving them NULL makes its admin API 500 for every user — and that is the API the receipt upload uses to resolve the submitter. Details in the R9 note.* Original finding below, kept for the reasoning.
      **— original finding, 2026-08-12, kept because the reasoning is the useful part —**

      This blocked receipt upload for every person at the firm, the owner and every admin included. It was
      the reason `receipts` had zero rows: not "nobody tried", but "nobody could".

      **Measured against production, not inferred:**
      - `auth.users` held **0 rows**. `registered_users` held all **7** staff accounts.
      - `receipts.user_id` is `NOT NULL REFERENCES auth.users(id)`, so `/api/admin/receipts/upload` returned
        422 for every submitter. Verified live as a plain `employee` (`jacobmaddux96@gmail.com`).
      - **14 FKs across 10 tables** reference `auth.users`; **5 are NOT NULL** and so are hard blockers:
        `receipts.user_id`, `equipment_reservations.reserved_by`, and
        `location_pings` / `location_stops` / `location_segments`.`user_id`.
      - **Nothing in the codebase creates an `auth.users` row** — no `auth.admin.createUser` call exists.
        `/api/admin/invites`, `/api/auth/register`, and the Google auto-provision in `lib/auth.ts` all write
        `registered_users` only. So the old 422 message ("ask an admin to invite you") was impossible to act
        on; it has been rewritten to name the real cause.
      - Every affected table holds **0 rows** (receipts, receipt_line_items, equipment_reservations,
        location_*, field_media, maintenance_events) — the whole Supabase-Auth-shaped half of the schema has
        never been written to. That makes this cheap to fix now and expensive later.
      - `receipts` also carries 4 RLS policies keyed on `user_id = auth.uid()` (the mobile design), plus
        `service_role_full_access_receipts`, which is why the web route works around RLS but not the FK.

      **The decision — which identity is canonical?**
      1. **Point the FKs at `registered_users(id)`.** Matches what the app actually authenticates against, and
         there is precedent in the same table: `receipts.payment_card_confirmed_by` already references
         `registered_users(id)`. Cost: a migration on 5 tables, and the 4 `auth.uid()` RLS policies need
         rewriting — they would no longer match, which matters if the mobile app is ever pointed at Supabase Auth.
      2. **Create `auth.users` rows for staff, reusing `registered_users.id` as the auth id.** Keeps the mobile
         RLS design working *and* satisfies the FKs, because the two identity values would be the same. Needs
         registration/invite to create both from then on, or every new hire silently breaks again. **This looks
         like the design that was intended and never finished** — but it provisions real Supabase Auth
         identities for 7 real people, which is your call, not mine.

      Recommendation was **(2)**, and that is what the owner chose. See the R9 completion note in
      `completed/RECEIPTS_MOBILE_AND_ADS_2026-08-11.md` for what shipped and the end-to-end evidence.

      **Still open from this, and NOT fixed by the mirror:** the mirror makes the *other four* NOT NULL FKs
      satisfiable too (`equipment_reservations.reserved_by`, `location_pings`/`location_stops`/
      `location_segments`.`user_id`) — every staff account now has an `auth.users` row for them to point at.
      But none of those four write paths has been exercised end to end, and all four tables still hold zero
      rows. They are no longer *blocked*; they are *unverified*. Worth one pass each before trusting them.

- [x] **Attunement-alone activation — RESOLVED (2026-07-18).** Decision (owner): equipping is always required;
      attunement is auto (a preference) or manual. Shipped the `autoAttune` campaign preference (default on) and
      made `deriveAc` share the ledger's `isItemActive` rule, so an attuned-but-unworn item no longer moves AC
      while withholding STR — one rule for every stat. The split-brain is gone. *Pinned by `ledger-attunement.test.ts`.*
- [x] **Weak-form stat replacement — RESOLVED (2026-07-18).** Decision (owner): default fully changes stats.
      Shipped the `shapeshiftStats` preference (full | partial | none, default full): a form now REPLACES ability
      scores up OR down (a rat form drops a druid to STR 2) via a `formOverride` flag that bypasses the item
      highest-set-wins rule; 'partial' midpoints, 'none' leaves scores. *Pinned by `ledger-set-max.test.ts` +
      `shapeshift-feat-prefs.test.ts`.*
- [x] **Feat ability increase (+1) auto-apply — RESOLVED (2026-07-18).** Decision (owner): auto-apply, with a
      preference. Shipped `featAutoApply` (default on) — a feat feature's ability effects fold automatically; off
      withholds them for manual application. *Pinned by `shapeshift-feat-prefs.test.ts`.*
- [x] **Rangor / Pugilist — RESOLVED (2026-07-18).** Decision (owner): fully build them as 2024 custom options.
      Shipped Rangor as a `dnd5e-2024` species (custom-flagged, natural armor + traits) and Pugilist as a full
      1–20 `ClassDefinition` (Fisticuffs/Iron Chin/Moxie + the Sweet Science subclass, custom-flagged), both
      registered so the builder offers them. *Pinned by `dnd5e-2024-classes.test.ts` + `species.test.ts`.*
- [ ] **Intuitive Games class-vs-subclass taxonomy.** The site is 4 parent classes (Archon/Conduit/Fighter/
      Wizard) with subclasses; the app models a flat 13-class list. Restructure to match the site? (Touches
      the IG builder, provenance, and seeds.)
      *Detail: `INTUITIVE_GAMES_FULL_BUILDOUT`; `SITE_MASTER.md` item 3.*
- [ ] **Intuitive Games class-vs-subclass taxonomy.** The site is 4 parent classes (Archon/Conduit/Fighter/
      Wizard) with subclasses; the app models a flat 13-class list. Restructure to match the site? (Touches
      the IG builder, provenance, and seeds.)
      *Detail: `INTUITIVE_GAMES_FULL_BUILDOUT`; `SITE_MASTER.md` item 3.*
- [x] ~~**2014 exhaustion — flat-2024-model-for-all, or the real tiered table?**~~ **RESOLVED (verified
      2026-07-18): the sheet is now edition-aware.** When this was written the sheet applied the 2024 flat model
      to every character; the Phase-2 M-area work has since implemented `exhaustionD20Effect(kind, level, edition,
      model)` (`lib/dnd/mechanics/exhaustion.ts`) and the store's `rollCheck` now passes the character's real
      edition (derived from the system key) — so a 2014 character gets the tiered-disadvantage table (checks L1+,
      attacks/saves L3+) and a 2024 character gets flat −2/level, with `flat-2-per-level` also selectable as a
      house rule via the `exhaustionModel` preference. The sheet and the AI grounding now agree per edition.
      Tested (`mechanics-defaults.test.ts`, `exhaustion-d20.test.ts`). Nothing left for you here.
      *Detail: `DND_PLATFORM_PHASE2` Area M1.*
- [x] ~~**Wire `canEquip` into the live equip paths — needs a refusal UX.**~~ **RESOLVED (verified 2026-07-18) —
      your refusal-UX decision was made + shipped in Phase-2 Area E.** You chose the interactive CONFLICT DIALOG
      (2026-07-17), and it's wired into BOTH live paths via the newer `equipConflicts` engine (superseding the
      dead `canEquip`): the sheet's equip runs `equipConflicts` when `equipLimits === 'enforced'` and opens
      `EquipConflictDialog` (Cancel + a per-conflict swap), and the AI `equip_item` edit auto-swaps to a legal
      state (`applySheetEdits` + `resolveEquipSwap`); `equipLimits: off` skips the check. Tested
      (`equip-conflict-dialog.test.ts`, `equip-enforcement-gap.test.ts` incl. the hand-slot case). Nothing left
      for you here. *Detail: `DND_PLATFORM_PHASE2` Area E.*
- [~] **Long-rest hit-dice restore — LARGELY RESOLVED (verified 2026-07-18): now a configurable campaign
      preference, not a hardcode.** When this was written `longRest` hardcoded full restore; the Phase-2 P-area
      work has since extracted a pure, tested `hitDiceAfterLongRest(total, remaining, model)`
      (`lib/dnd/mechanics/long-rest.ts`) and wired the store's `longRest` to it via the `longRestModel` campaign
      preference — so `half-hit-dice` gives exactly the RAW-half (`min(total, remaining + max(1, ⌊total/2⌋))`)
      and `vanilla`/`gritty`/`epic` give full restore, DM-selectable per campaign. The only residual (a smaller
      call): should it AUTO-pick half for a 2014 character rather than leaving it a DM preference? Tell me if you
      want the auto-per-edition default and I'll add it. *Detail: `DND_PLATFORM_PHASE2` Area P/M; `mechanics-defaults.test.ts`.*
- [x] **PF2 damage while already downed — RESOLVED (2026-07-18).** Decision (owner): follow the official PF2
      rules, with an option. Shipped the `downedDamageModel` preference (official | off, default official):
      `apply_damage` now raises an already-dying creature's Dying value by 1 (2 on a crit) per RAW; 'off' leaves
      it to recovery saves. Threaded from the campaign through both PF2 edit routes. *Pinned by `pf2-edit.test.ts`.*

## B. Content only you / Brendan have (paste it and I fill it in)

- [x] ~~**26 Intuitive Games power effect texts.**~~ **RESOLVED (verified 2026-07-18): all 55 roster spells
      are in `IG_POWERS` with their full Description text** — the "26 missing" was stale (filled in an earlier
      session). Re-confirmed by a fresh **Playwright scrape of `/spell-list`** (the Squarespace accordions hold
      their content in the DOM even collapsed, so all Description/Advanced/Expert text pulls cleanly — saved to
      `docs/reference/intuitive-games/ig-spells-scraped.json`). `igSpellsMissingEffects()` now returns 0.
      **One enrichment available (queued):** the app stores only each spell's Description; the scrape ALSO
      captured the **Advanced + Expert tier text**, which could be added to enrich the powers with their tier
      progression — a follow-up, not a blocker.
- [ ] **9 off-roster IG powers to reconcile** — app carries them, the current site roster doesn't (renames/
      removals from the site). Kept, not deleted, until you confirm each is dropped or give its current name.
      Also in `SITE_MASTER.md` item 1.
- [x] **Per-class detail (IG) — RESOLVED (2026-07-18):** re-Playwrighted `/classes` (all 18 classes/subclasses,
      incl. Champion/Magician/Shaman) → `ig-classes-scraped.json`, then INTEGRATED: `IG_CLASS_POWER_EFFECTS` (99
      powers/specializations with verbatim effect text) + `igClassPowerEffect()`; Magician & Shaman filled from
      WIP stubs; the builder preview, sheet feature bodies, library, and AI grounding all now show what a class
      power DOES, not just its name. The site has no per-level 1–10 table (classes are power-list based), so
      that "ladder" was a misread. *Pinned by `library.test.ts` + `ig-content.test.ts`.*
- [x] **IG companion creatures — RESOLVED (2026-07-18):** Playwright-scraped `/companion-creatures` (the system
      the old stub said was "unpublished" — it's fully published) → the complete catalog in `companions.ts`:
      4 types, 11 features + 7 aspects (with effect text), the size table, the statistics rules, the Tiger
      example, and the `igCompanionHp`/`igCompanionSize`/`igCompanionAbility` derivations. Exposed in the library
      (browsable + searchable) and tied into the on-sheet companion panel (HP derivation + feature/aspect
      tooltips). *Pinned by `ig-companions.test.ts`.*
- [ ] **Other IG unpublished content** — combat-skill mechanics beyond Dirty Trick, named weapons,
      equipment/tools tables, FAQs, companion combat rules, Sprite/Human race art. `SITE_MASTER.md` items 4–11.

## C. Needs eyes on a running app, or a device build

- [ ] **Map studio: city-lights/lava terminator.** The plumbing is correct + guarded; the sun-angle so the
      night-side glow shows needs the shader's light convention read + eyes on the preview.
      *Detail: `DND_RULES_PLATFORM` Slice 29.*
- [ ] **Form-editor UI** (author an arbitrary foreign statblock as a form) — the only heavier half of
      transform left; `Forms.tsx` is display+toggle today. *Detail: Slice 18.*
- [~] **PF2 general conditions + focus points — CONDITIONS RESOLVED (2026-07-18); focus points remain.** Shipped
      the PF2 penalty model (`lib/dnd/conditions/pathfinder2e.ts`) with PF2's non-stacking rule (worst status +
      worst circumstance apply; same-type don't stack), a `conditions` field on the PF2 combat model + a
      `set_condition` edit op (AI-callable), the PF2 sheet's `rollLine` auto-folding active conditions (naming
      the sources), and an active-conditions strip on the sheet. *Pinned by `pf2-conditions.test.ts`.* **Residual:**
      **focus points** (the Focus pool + Refocus) still aren't modeled — a smaller follow-up.
- [x] **In-app roller for the bespoke sheets — RESOLVED (2026-07-18; owner "real mechanics affecting checks/
      rolls" + standing make-all-decisions directive → decided AUTO-FOLD, matching the 5e dice tray).** Both
      bespoke sheets ROLL in-app via the shared `resolveD20Roll` engine (Area R1b): tapping a check/save/skill/
      strike rolls a d20 + modifier (+ strike damage via `rollDiceExpr`), with a target-DC field resolving the
      four-step degree of success. **The auto-fold product call is now made and implemented:** the rollers fold
      the mechanics INTO the rolled total, not just display them —
      • **Conditions (both IG + PF2):** `rollLine` passes `modifier + cond.penalty` and rolls at disadvantage when
        the active conditions impose it (`igConditionRollEffect` / `pf2ConditionRollEffect`), naming the sources.
      • **Stance (IG):** `igStanceRollEffect` folds the active stance's advantage/disadvantage into the die too;
        opposing advantage+disadvantage cancel to a straight roll (the 5e rule). `ig-stance-roll.test.ts`.
      So the IG/PF2 rollers now auto-apply like 5e's exhaustion — the mechanics are real, not hand-applied, while
      still naming every source on the result so the player sees WHY. Nothing residual.
- [ ] **Mobile upload runtime** — every decision in the capture→save→send→drain→notify→delete flow is a
      pure, tested function; the Expo runtime (true background upload task, MediaLibrary, notifications, the
      queue screen) can only be built + verified on real iOS/Android by you. *Detail: `SURVEYING_WORKMODE`
      Area C.* (Update 2026-07-17: the prompt-*resume*-on-foreground half of C2 now ships in-JS —
      `useUploadQueueDrainer` drains immediately when the app returns to the foreground, via the pure
      `appStateDrain.ts` decision — so only true background execution, bounded by iOS background windows,
      remains device-gated.)

## D. Deploy-time security config — do these BEFORE /dnd is public (surfaced 2026-07-18)

These are operational, not code changes — the code is hardened + warns at startup, but the deploy has to be
configured and the owner accounts provisioned, or the /dnd hub ships with an open door.

- [ ] **Set `DND_OWNER_KEYS` + provision the owner account(s).** Owner status is "your login key ∈
      `DND_OWNER_KEYS`", and a `name:<name>` key is exactly what registering that display name produces. If the
      var is UNSET in production it falls back to the hardcoded dev keys (`name:jacob`/`quick:jacob`), so
      whoever registers "jacob" FIRST — if the real owner hasn't claimed/seeded it — gains owner (trust-on-first-
      use). Code now logs a loud startup warning when it's unset (parallel to the `DND_SESSION_SECRET` warning),
      but you must set it to the real owners AND register/seed those accounts before going public.
- [ ] **Confirm `DND_SESSION_SECRET` is set in production.** Already warned at startup; without it the session
      cookie is signed with an insecure shared default (forgeable + non-persistent).
- [ ] **Decide `DND_REQUIRE_LOGIN`.** /dnd is PUBLIC by default (passwordless "enter as" for the demo/campaign
      roster; password-protected accounts still can't be entered passwordlessly). To lock it down set
      `DND_REQUIRE_LOGIN` to a truthy value — the gate was hardened 2026-07-18 to accept `1`/`true`/`yes`/`on`
      (it previously required the literal `1`, a fail-OPEN footgun), so any obvious spelling now works.
- [ ] **Live-Supabase demo-character `system` seed (idempotent; not run autonomously).** The demo characters
      (Jacob/Susie/Sarah/Jack/Andrew) sit at `system = ambiguous`; the idempotent seed sets them to `dnd5e-2024`
      so the sheet chip + AI grounding are specific. It's a live production-DB write, so I did NOT run it
      unattended — apply/verify it (or tell me to) when you want it. *Detail: `DND_RULES_PLATFORM` Slice 21.*

---

## QA-readiness ledger — pure/data layers audited + confirmed green (this session)

So the list above reads as "the tail," not "the work" — and so the upcoming QA walkthrough can spend its
browser time on the UI/integration/visual layer instead of re-verifying pure logic. Each of these was
read against its rules + its tests this session and confirmed **correct and comprehensively covered**:

- **Effect ledger** — resolution (set/add/adv/disadv, suppression), non-mutation invariant, attunement
  consistency, every registry target either renders at a real home or is a tracked+guarded gap.
- **Transforms** — overlay-not-mutation (anti-"permanent bear"), carry-over policies (keepFeatures/
  keepMental/separateHp), form HP pool.
- **Identity + grant overlays** — name/species/class overlay without writing base; cross-class
  `grant_feature`/senses/defenses resolve + render, gone on unequip; condition-immunity kept distinct
  from damage-immunity.
- **Rules-legal level builder** — feat eligibility (slot→category, minLevel/ability/needs prereqs,
  Epic-Boon L19, repeatability, custom escape hatch), ASI cap-at-20, edition-correct ASI cadence
  (2014 has an ASI at 19; 2024 makes 19 an Epic Boon; Fighter +6/14, Rogue +10 — both editions).
- **Provenance** — vanilla/custom/dm-granted classification, conservative "untracked → vanilla" fallback
  that protects vanilla-only campaigns.
- **Intuitive Games** — every mechanic displayed, hover-explained, editable with identical sheet/builder/AI
  parity; WIP honestly labeled; condition + stance mechanics guarded against drift from their verbatim text.
- **Currency / calculator / media helpers** — canonical 5e/PF2 coin economy pinned; safe evaluator
  (div-by-zero, non-finite, unbalanced parens); media thumb-vs-icon branches.
- **Roll-target application (a whole class of bugs fixed)** — every registered ROLL target now reaches its
  actual roll: `<ability>_saves`/`all_saves`, `skill.<key>`/`all_skills`, `attack_roll`/`damage_roll`/
  `attack_and_damage`, `death_save`, `carrying_capacity` — numeric AND advantage/disadvantage — plus the
  same folds mirrored into the AI character digest. These were resolved only by the dead `deriveCharacter`
  engine and silently never reached the ledger-driven sheet; now folded at each live roll site + guarded.
- **AI digest ↔ sheet parity (completed 2026-07-17)** — the character digest (the facts block the librarian
  adjudicates from) now carries EVERY effect-derived fact CombatPanel renders: non-walking speeds (fly/swim/
  climb/burrow), granted senses, movement traits (hover/ignore-difficult-terrain), and the full Defenses card
  (resistance/immunity/vulnerability, condition-immunity kept distinct, and advantage-on-saves-vs-condition).
  Previously walk-speed-only, so the AI was blind to whether a character could fly, see in the dark, or resist
  fire. Reads the same ledger as the sheet, so they can't drift; guarded by `character-digest.test.ts`.
- **AI feat grounding for Intuitive Games (2026-07-17)** — asking the librarian "how does the IG <feat> work?"
  now grounds on that feat's full effect text (query-scoped, so no prompt bloat). Previously the query-scoped
  feat retrieval was 2024-only and the always-on IG rules block lists feats by name only, so no path supplied
  IG feat effect text. Guarded by `grounding.test.ts`.
- **Dice / combat core** — rollD20 advantage=max/disadvantage=min, crit doubles dice not the flat modifier
  (now guarded on BOTH paths: `rollDamage` AND the typed `rollTyped`/`weaponSegments` path the everyday
  weapon crit actually takes — the ability mod is added once, never doubled); exhaustion −2/level on every
  d20 (checks/saves/attacks/death-saves/initiative) + speed −5/level, capped at 6 — **2024-only model,
  applied to all editions (tracked gap, see §A exhaustion decision)**; AC by armor category incl. the
  negative-DEX edge; HP adjust (temp-first, heal-cap at effective max); short/long rest resets; spell save
  DC unified to one store source (header == cast).
- **Pathfinder 2e rules** — proficiency (untrained=0, else rank+level), all four degrees of success with the
  nat-20/nat-1 step-and-cap, AC/DCs/HP/strikes/MAP, level clamp — a focus system, fully covered.
- **Mobile upload decision layer** — the drain brain (`nextDrainStep`: paused/manual/upload/blocked/idle,
  Wi-Fi/backoff/maxed→idle/empty→idle) and post-upload plan are pure + comprehensively tested; only the
  device-side Expo runtime remains (Section C).

### Second deep-audit pass (2026-07-17, this session) — findings + hardening

A fresh mechanic-by-mechanic audit of the rules engine and the mobile upload core. **Real bugs found:**
- **Artificer multiclass rounding (FIXED).** `multiclassCasterLevel` rounded every `half` caster down;
  the Artificer is the one 5e half-caster that rounds UP — odd Artificer levels were under-counted a caster
  level. Modelled the exception (`spellcasting.roundHalfUp`) + `roundUp` param. `class-engine.test.ts`.
- **AC equipped-TAG split-brain (FIXED).** `deriveAc` honored the `equipped` tag for +ac EFFECTS but not
  for the armour/shield BASE selection, so a tag-equipped armour showed the unarmoured AC. One `isWorn`
  predicate now. `derive-ac.test.ts`.
- **2014 exhaustion edition-merge (TRACKED, §A).** The sheet applies the 2024 flat −2/level to 2014
  characters, whose exhaustion is a tiered table — a Ground-Rule-2 violation. Owner-gated; guarded so it
  can't drift (`exhaustion-d20.test.ts`).
- **PF2 in-app roller — RESOLVED (§C).** `PF2Sheet` now rolls in-app via `resolveD20Roll` (`pf2Degree` has call
  sites), auto-folding the worst status/circumstance condition penalty + disadvantage into the total. Done.

**Safety/security hardening (no behavior change; invariants pinned or made future-proof):** death-save
state transition extracted to a pure `applyDeathSave` + guarded; weapon-crit "double dice not the flat"
now guarded on the typed path too; mobile backoff schedule extracted + made NaN-safe; the delete-safety
upload-result classification extracted + guarded (a transient error can never read as "uploaded" and
delete a capture); `sanitiseName` pinned against Unicode/null/control-char injection vectors; the "no
failure choice deletes the file" sweep made exhaustive-by-construction.

**Re-verified correct + already comprehensively tested (no change needed):** the effect-ledger core
resolution (`resolveAgainst` highest-set-wins + adds), transform separate-HP pool (`routeFormDamage`
overflow/exactly-empty/base-floor), PF2 MAP + spell-slot progression, currency economy, HP adjust,
`uploadRetention`'s confirmed-only delete guard, `queueOrder` eligibility/ordering, `cameraRollSave`
fail-safe default.

### Third pass (2026-07-18, this session) — findings + hardening

**AI-adjudication surface COMPLETED across all three systems.** A cross-system symmetry sweep of the three
character digests (the fact-blocks the librarian rules from) found several real blind spots and closed them,
so the AI can now resolve any check / save / attack end-to-end in 5e, IG, or PF2: every digest now carries
the character's **identity** (incl. background/deity/alignment), **raw abilities/attributes** (a bare STR
check reads these), **defenses** (+ PF2 speed — positioning-critical), **skills**, and **attacks/strikes with
resolved to-hit AND damage** (IG had no attacks line at all; PF2 strikes had no damage). The one remaining
asymmetry — PF2 general conditions (Frightened/Clumsy) + focus points — is NOT a digest gap: conditions set
on the base `Character` (e.g. by the AI's `edit_sheet add_condition`) already reach the librarian via
`characterDigest`. What's missing is the bespoke `PF2Sheet` UI to see/manage them + a PF2-specific numeric
penalty model (see §C for the corrected scope). Guards: `ig-digest.test.ts`, `pf2-digest.test.ts`,
`character-digest.test.ts`.

**Real bug FIXED — consumed-buff snapshot aliasing.** `planConsume`'s buff branch returned its effects
array BY REFERENCE, and `Inventory.consume` spreads the seed (shallow), so a running `ActiveEffect` aliased
the item's own effects array. A buff potion at qty 2 (drink one, item stays), then edit that item → the buff
ALREADY running silently rewrites itself — the exact "editing the item must not mutate a running effect"
invariant, violated. Fixed by snapshotting in `planConsume`; `consume-plan.test.ts`.

**Feature shipped — concentration-save roll.** The last unrendered ROLL target: a CON save (DC 10 or ½
damage) that folds `concentration_save` + `con_saves` + `all_saves` through the shared `rollCheck` (so
exhaustion + adv/dis apply), surfaced as a "🎲 Save" button on the ConditionTracker, gated to 5e. Every
registered roll target now reaches an actual roll. `concentration-save.test.ts`.

**IG AI-legibility COMPLETED (read side).** The AI can now both SEE and EXPLAIN everything on an IG character
from IG source: the `igCharacterDigest` gained ancestry traits (Cave Vision → darkvision), a DEFENSES line
(HP/DR/the three saves), trained skills, the defensive power's EFFECT, and the companion; the grounding
gained query-scoped power + defensive-power effect text and the always-on companion rules. So "can you see
in the dark?", "am I still up?", "how does my Sidestep work?", "how does my beast advance?" are all
answerable from source now. `ig-digest.test.ts`, `grounding.test.ts`, `ig-content.test.ts`.

**Explainability + attribution guarded.** The ★ marker now lights for the save/skill bonus targets the roll
folds (a Cloak of Protection's `all_saves` was moving the number but lighting no star) and for the Bio
identity overlays (Helm of Opposite Alignment); granted rows' source badges are now guarded from regression.
`effect-star.test.ts`, `identity-overlay.test.ts`, `grant-render-paths.test.ts`.

**Invariant holes closed** (documented behaviors with zero coverage — each a spot a plausible refactor would
break silently): `set_base` resolution (pooled with `set`, untested), one-body-armour-at-a-time (deriveAc
`.find`, untested), identity last-writer-wins, the 15-effect "one boot" generalization, IG degree-of-success
nat-20/1 clamps (out-of-bounds guard), PF2 skill total + the armor-check-penalty conditional, and mixed-
half-caster multiclass rounding (Artificer up + Paladin down in one character).

**New tracked gap (→ §A above):** equip validation is correct + tested but wired only to the dead reducer,
not the live paths — `equip-enforcement-gap.test.ts` pins the reality until you make the refusal-UX call.

**Mobile operational-correctness layer brought under test** (pure modules that shipped with ZERO tests, each
high-consequence for a surveying business): `csvCoords` (Trimble/Carlson P,N,E,Z,D coordinate import),
`dataPointCodes` (179-code point-name intelligence + auto-numbering), `money` (receipt cents↔dollar math),
`timeFormat` (payroll duration/date formatters), `parseAuthUrl` (auth-callback token parsing — the tokens
live in the fragment, not the query). The RN/Expo/PowerSync-importing modules remain device-QA-gated
(react-native doesn't resolve in the node test env).

### Fourth pass (2026-07-18, this session) — access-control + security sweep

A focused sweep of the auth/access surface and the parallel bespoke subsystems. **Real fixes shipped:**
- **Grounding false-ground (FIXED).** `systemGroundingBlock` only guarded `null`, so a non-canonical `row.system`
  (a typo/legacy value — `ai-edit`/`ingest` pass it straight from the DB) was trusted as a real system: the AI
  was told "you are built for `<raw>`" and grounded on lookups scoped to a key nothing matches (empty rules,
  false confidence — the exact hallucination this exists to prevent). Now `normalizeSystem`s throughout.
  `characterDigest` got the same fix (a raw typo could reach the AI prompt as a rulebook). `grounding.test.ts`,
  `character-digest.test.ts`.
- **`DND_REQUIRE_LOGIN` fail-OPEN footgun (FIXED).** The public-vs-login gate checked `=== '1'` exactly, so a
  deployer setting `=true`/`=yes` (intending to lock /dnd) stayed OPEN. Now accepts the obvious truthy
  spellings, failing toward the more-secure state. `auth.test.ts`.
- **Roster-role un-validated leak (FIXED).** The effective-role fallback was inlined at 4 sites, 2 skipping the
  validity check, so a corrupt stored `roster_role` leaked through as a phantom group. Extracted one validated
  `rosterRoleOf`. `roster.test.ts`.

**Security hardening + invariants pinned (no behavior change unless noted):** the character read/write access
DECISION extracted to a pure, exhaustively-tested `resolveCharacterAccess` (owner/player/DM/member × visibility);
session-token forgery resistance made explicit (a swapped payload + stolen signature can't escalate identity);
`DND_OWNER_KEYS`-unset production warning added (see §D); the homebrew shared-content boundary pinned against a
mixed valid+malformed effects payload; the demo `join-character` self-join gates (demo-only + ownership) guarded;
every `supabaseAdmin` (RLS-bypassing) route audited + confirmed gated; PF2 edit op-handler drift guard added at
parity with IG; the cross-system routing isolation completed (a 5e sheet can't mis-route to the PF2 digest/tool).

**Re-verified correct + already comprehensively covered (no change):** the AI edit-scope boundary (every
vocabulary character-scoped, privilege-escalation op names refused), grounding cross-system isolation
(article/feat/power), `parseAuthCallbackUrl` (fragment-only, never-partial), character/campaign PATCH+POST
(field whitelists — no mass-assignment — DM/owner-gated), `dev/enter` (open-access-flag + roster + password-guard).

Full app test suite green (the dnd suite alone is now **2,269 passing**, grown with each guard). What's
left is only Sections A–D above (owner decisions, Brendan's content, eyes-on-app / device work, and the
deploy-time security config).

---

## Payroll S9c — re-verified 2026-08-16, still blocked, and blocked on one sentence from an accountant

C40 of `CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md`, re-checked against the code rather
than against the row that describes it, because that row was written after the precondition it
depends on had already been dropped once.

**The verification, so nobody has to repeat it:**

| Claim | Checked | Result |
|---|---|---|
| `POST /api/admin/payroll/runs` is the only producer of `pay_stubs` rows | `grep "from('pay_stubs')"` across `app/` and `lib/` | Six references, **all in that one file**, and exactly one is an `insert` (route.ts:404) |
| It is the only caller of `buildStubTotals` | `grep buildStubTotals` | Two references: the import and the call, both in that file. The definition is `lib/payroll/pay-stub.ts:125` |

So S9c's own condition — *"once nothing unique lives behind it"* — is **not met**, and closing the
route today would leave the firm with no way to produce a pay stub at all. That is the same finding
the payroll doc records in its own header, and it has not changed.

### What would actually unblock it, in order

1. **An accountant answers one question: does the firm withhold?** This is the whole blocker and it
   is not an engineering question. The legacy engine carries flat 12% / 6.2% / 1.45% **estimates**;
   porting those onto a wage statement would print invented tax figures on a document an employee is
   legally entitled to rely on. The surviving path withholds nothing and pays gross.
2. **If yes — real withholding is a build**, not a port: federal and state tables, filing status per
   employee, YTD accumulators, and the statement itself. S9b becomes real work.
3. **If no — S9b is nearly done.** `lib/payroll/payment-statement.ts` already ships the honest half:
   a payment statement that states gross pay and withholds nothing, because that is what happened.
   What remains is moving stub generation onto the batch path so `POST /payroll/runs` stops being
   the only producer.
4. **Only then S9c**: close `POST`, keep `GET` (historical runs and stubs are records of real
   payments) and keep `PUT` (an existing run must still be finishable).

### What was deliberately NOT done

No stub-generation code was written against either answer. Building the withholding path would bake
in a tax policy nobody has chosen; building the gross-only path *first* would make step 1 look
answered when it is not. The row's own phrasing is the right one: **the cost here is a conversation,
not engineering.**

---

## Two decisions left by CAD_EXCELLENCE_AND_PLATFORM_COMPLETION (2026-08-16)

That document is now in `completed/`. Every slice in it shipped or is listed here; these two are the
only things in it that were deliberately **not** decided, because deciding either unilaterally would
have picked an answer on the owner's behalf.

### 1. One API key, and address→address mileage starts working

- [ ] **Set `GOOGLE_MAPS_SERVER_KEY`.**

The slice that needed it (C0b1) was parked for months as *"owner-gated: needs a maps API key and
billing enabled"*, and the planning table recorded *"Nothing. No geocoding, no distance-matrix, no
maps provider anywhere."* Probing the real project on 2026-08-16 says the gate is much smaller:

- the legacy **Distance Matrix** API is off (Google's own error points at the Routes API instead);
- the **Routes API is enabled and billed** — a `computeRoutes` call gets past every enablement and
  billing check and fails only at `API_KEY_HTTP_REFERRER_BLOCKED`.

That is not a spending decision. The only key in the environment,
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, is a **browser** key restricted by HTTP referrer, and a
server-side call has no referrer to send. It is also, being `NEXT_PUBLIC_`, readable by every
visitor — using it for a billed API would put the firm's quota behind a public value.

**What to do:** Google Cloud Console → Credentials → Create credentials → API key → Application
restrictions **None** (or IP addresses) → API restrictions **Routes API**. Put it in
`GOOGLE_MAPS_SERVER_KEY` (Vercel + `.env.local`).

**Until then nothing is broken**: the trip form takes a typed distance, and the "Look up from
addresses" button explains that the key is unset rather than failing silently. The adapter, the
route, the UI and 15 tests are already shipped — the key is the entire remaining step.

### 2. `fieldbook_notes.is_current` means two incompatible things — DECIDED 2026-08-16

- [x] **Decided: `is_current` means SOFT-ARCHIVE.** `true` = active, `false` = archived. The
      per-user "note I have open" pointer is retired, and the sweep that maintained it is deleted.

Owner delegated the call. What decided it:

| meaning | readers |
|---|---|
| **archive** (kept) | 5 — `mobile/lib/fieldNotes.ts` (its header already said "soft-archive flips to false"), `mobile/lib/jobs.ts`, `/admin/field-data/[id]`, `/admin/jobs/[id]/field`, `JobNotesPanel` |
| pointer (retired) | 1 — `action=current` in the learn fieldbook route |

The count was not the real argument. The pointer was per-user **private** state stored in a
**shared** column that shared screens render as "archived for everyone": writing a note flipped your
previous note to `false`, and three other surfaces then showed it to the whole crew as archived.

Removing it cost nothing. `action=current` already ordered by `updated_at desc limit 1`, so it
returns the same answer — and a better one on the day you archive the note you had open, when the
pointer version returned nothing. Seed 099's `(user_email, is_current) WHERE is_current` is a plain
partial index, not unique, so no constraint depended on the pointer, and the index still serves the
archive meaning ("this user's active notes"). Pinned by
`__tests__/field/is-current-means-archived.test.ts`.

<details><summary>The original write-up, kept for context</summary>

Both meanings are live and both are load-bearing:

| Meaning | Who believes it |
|---|---|
| **Soft-archive flag** (true = active) | `mobile/lib/fieldNotes.ts` says so outright and filters its lists on it; `/admin/jobs/[id]/field` and `/admin/field-data/[id]` both render `!is_current` as an **"archived"** badge |
| **Per-user "the note I have open" pointer** (exactly one true per user) | `POST /api/admin/learn/fieldbook` ("unmark any current entry for this user"); seed 099's `(user_email, is_current) WHERE is_current = true` partial index is shaped for it |

They coexisted only because nothing ever wrote a **job** note through that route. C0d2 added an
office compose box, which would have made creating one clear the pointer on the author's *previous
job note* — and the job page would have badged it "archived" in front of the whole crew, for no
reason anybody could see.

**Shipped as a containment, not a decision:** the pointer sweep is now skipped for job notes, so the
bug cannot fire. The column still means two things.

**Why this needs you:** picking the archive meaning changes what the personal notebook considers
open; picking the pointer meaning changes what mobile lists and makes the "archived" badge wrong on
two admin screens. Either is a small change; choosing is not a code question.

**Update 2026-08-16:** the containment now extends to the READER as well. `JobNotesPanel` replaced
the field page's notes list, and that list rendered an "archived" badge which the new panel did not
— so an archived note became indistinguishable from a live one on the surface that replaced it. The
route now returns a resolved `archived` boolean and the panel badges it, restoring the old
behaviour. This still decides nothing: `archived` is only what all three existing readers already
render `is_current === false` as.

</details>

---

## `org_id` drift — 10 tables the tenant filter does not cover (found 2026-08-16, **re-measured 2026-08-27**)

- [x] **Apply `seeds/517_org_default.sql`, backfill, then add the 10 tables to `ORG_SCOPED_TABLES`.**
      ✅ **DONE 2026-08-29 — `npm run verify:org-scope` is green for the first time since it was written.**

> ### ✅ RESOLVED 2026-08-29 — all three steps, in the order this entry insisted on
>
> | | 2026-08-16 | 2026-08-25 | 2026-08-27 | **2026-08-29** |
> |---|---|---|---|---|
> | carry `org_id`, not in `ORG_SCOPED_TABLES` | 7 | 10 | 10 | **0** |
> | no `org_id` DEFAULT | 2 | 5 | 5 | **0** |
> | `design_mockups` rows sitting unowned | — | 1,263 | 1,371 | **0** |
>
> **The first thing measured was the count, and it had stopped growing.** 1,371 on 08-27 and 1,371
> on 08-29 — flat across two days, where this entry predicted continued growth. That does not change
> what needed doing, but it is worth recording that the extrapolation from 108-rows-in-two-days did
> not hold. Re-run the check; do not trust the trend line.
>
> **Order, which was the entire point of parking this:**
>
> 1. **Snapshotted first.** Every row with a NULL `org_id` across all 168 tables carrying the column
>    — it was `design_mockups` and nothing else, 1,371 ids — written to a file before anything was
>    written to the database, so the backfill is reversible by id rather than by "everything stamped
>    today".
> 2. **`seeds/517_org_default.sql` applied to the live database.** 1,371 → 0 unowned; tables with a
>    DEFAULT 163 → 168. The seed is self-undoing and guarded on `count(*) FROM organizations = 1`,
>    so it stays correct on the day a second firm exists.
> 3. **Then the ten names.** `lib/saas/org-scope.ts` 158 → 168, inserted by script that asserts the
>    list is still sorted and unique and that the count rose by exactly ten — the list is alphabetical
>    so its diffs read as diffs, and a hand-insert is how that quietly stops being true.
>
> **The verifier was mutation-tested rather than trusted.** Green on a check nobody has seen pass is
> the least believable green there is, so both directions were forced: removing `design_mockups`
> from the list reports it unscoped; adding a name for a table that does not exist reports it would
> fail with 42703. Both caught, then restored, then green.
>
> **What this entry got right, and it was the whole call:** enrolling first would have filtered all
> 1,371 design records out of every scoped session at once, with the app working perfectly. Parking
> it for a fortnight to do it in three steps was correct.
>
> Still true, and the reason this will drift again: the verifier reads the LIVE database, so it is
> not part of vitest and no branch can cause or fix what it finds. All ten stragglers came from work
> done after the list was written. Run `npm run verify:org-scope` after any migration that adds a
> table.

> ### RE-MEASURED 2026-08-25 — THE DRIFT KEPT DRIFTING
>
> This entry was written against 7 tables. `npm run verify:org-scope` today:
>
> | | 2026-08-16 | 2026-08-25 |
> |---|---|---|
> | carry `org_id`, not in `ORG_SCOPED_TABLES` | 7 | **10** |
> | no `org_id` DEFAULT | 2 | **5** |
> | rows already sitting unowned | not reported | **`design_mockups` — 1,263** |
>
> New since the entry was written: **`design_mockups`, `file_comments`, `projects`.**
>
> Two things follow that the original entry could not have said.
>
> **The drift is not historical, it is ongoing.** Every one of the three additions came from work
> done AFTER this blocker was filed — `projects` from the project layer, `design_mockups` from the
> design studio. A blocker describing a fixed set of seven reads as a finished list of past
> mistakes; it is actually a leak that admits a new table every few weeks, and the number in the
> heading is the thing most likely to be trusted without re-running the check.
>
> **`design_mockups` is now the worst of them**, and it is the table this session has spent the day
> writing to: 1,263 rows with no `org_id`, growing with every trace. It has no DEFAULT, so nothing
> stamps them. That is exactly the ordering trap this entry already describes — enrolling the table
> before backfilling would make every design record invisible at once, which looks like data loss
> rather than a filter.
>
> Still correctly parked, for the reason below: seed, backfill, verify, and only then enrol. Not a
> line in a merge. **But re-run the check before acting on any count in this entry** — it has been
> wrong by three tables for over a week.
> ### RE-MEASURED AGAIN 2026-08-27 — the table count held, the row count did not
>
> | | 2026-08-16 | 2026-08-25 | **2026-08-27** |
> |---|---|---|---|
> | carry `org_id`, not in `ORG_SCOPED_TABLES` | 7 | 10 | **10** |
> | no `org_id` DEFAULT | 2 | 5 | **5** |
> | `design_mockups` rows sitting unowned | — | 1,263 | **1,371** |
>
> **No new tables in two days** — the first re-measure to say that, and worth recording, because the
> 08-25 note reasonably read the trend as "a new table every few weeks". Two days is not evidence
> the leak is closed; it is evidence the count is worth re-running rather than extrapolating.
>
> **`design_mockups` grew by 108 rows in two days** with nothing stamping them. That is the half of
> this entry that is not waiting on a decision — it gets worse on its own, and every one of those
> rows is invisible to every scoped session the moment the table is enrolled.
>
> The ordering is unchanged and still the whole point: **seed the DEFAULT, backfill the 1,371, verify,
> and only then enrol.** Enrolling first makes every design record vanish at once, which reads as
> data loss rather than a filter.
>
> Measured with `npm run verify:org-scope` against the live database. It reads environment state, not
> code — no branch can fix or cause it, which is why it sat unnoticed through a full-suite run: it is
> not part of vitest.


`npm run verify:org-scope` fails, and it is **not** a regression from any recent branch —
`lib/saas/org-scope.ts` and the verifier are byte-identical to `main`. The live database drifted
past the list: tables added by later work carry `org_id` but were never enrolled in the filter.

```
7 table(s) carry org_id but are NOT in ORG_SCOPED_TABLES:
  calls · hours_notification_preferences · job_briefings · pay_advance_repayments
  research_runs · time_log_pay_decision_history · time_log_pay_decisions

2 table(s) have no org_id DEFAULT (rows written by webhooks/cron land unowned):
  calls · job_briefings
```

**Impact today is nil and that is the whole reason it is easy to miss.** One organisation exists, so
"unfiltered" and "filtered to Starr" select the same rows. It becomes a cross-tenant read the day a
second firm exists.

**Why this was not just fixed in the merge that found it.** The order matters and getting it wrong
hides data. `calls` and `job_briefings` have no `org_id` DEFAULT, so rows written by the Twilio
webhook and by cron are already sitting with `org_id` NULL. Adding those tables to the filter
*first* would make every one of those rows invisible to every screen — the exact failure
`org-scope.ts` warns about ("a filter alone would make every row this app writes invisible … which
is a worse failure than not enforcing it, because it looks like data loss"). Seed first, backfill
the NULLs, verify 100% coverage, and only then enrol the tables. That is a slice with a live-database
step, not a line in a merge.

---

## Phone calls — built, never merged, and DELIBERATELY PARKED (2026-08-17)

- [ ] **Owner's call: leave phone calls working exactly as they do today.** Revisit when there is a
      reason to automate. Nothing is broken; nothing needs configuring.

### What exists

The `calls` table is live in the database (seeds 594/595) with **0 rows**, and **no code in `main`
touches it** — verified two ways on 2026-08-17: a repo-wide search for `provider_call_sid` /
`is_voicemail` / `transcript_status` returns nothing, and `git merge-base --is-ancestor` puts every
phone commit outside `main`.

The system itself is finished and was tested against a real call. It sits on
**`origin/claude/job-lifecycle-2026-08-14`**:

| commit | what |
|---|---|
| `3df2e6ff8` | the plan, and the foundations a webhook needs |
| `bd36b47d1` | a call comes in, gets answered or recorded, and is written down |
| `ca0c5fd4c` | ledger — P0, I1-I3, T1 shipped; D2 resolved as an adapter |
| `a900e0fcb` | transcript, summary, the call log, calling people back |
| `675162f0e` | three defects browser QA **and a live call** found; doc → completed/ |

The same branch also carries work worth having independently: receipt **slideshow review with zoom**
and **re-run the AI across a whole filtered set** (`38d04cada`, `c47647650`), job **briefings** and
deliverables (`3e95de70c`, `06383c2ed`), one notifier for job events (`112188865`), and a real UI fix
— `--color-danger` is not a token, so those colours rendered as nothing (`a35a5c20b`).

### Why parking it is the right call, and what it costs

Merging would put a Twilio webhook in charge of the business number. The owner wants calls to keep
behaving exactly as they do now, so shipping it would change how a live phone answers — the one thing
that must not surprise anybody. **Not merging is the safe default here, not the lazy one.**

The cost is drift. Measured 2026-08-17: the branch is **17 commits ahead / 119 behind**, touching 118
files of which only **8** have also changed on `main` —
`__tests__/lib-orphan-ratchet.test.ts`, `app/admin/jobs/[id]/page.tsx`,
`app/admin/receipts/page.tsx`, `app/api/admin/jobs/[id]/instructions/route.ts`,
`app/api/admin/receipts/[id]/route.ts`, `app/api/admin/settings/route.ts`,
`lib/admin/route-registry.ts`, `lib/saas/api-bundle-gate.ts`. Four of those eight were edited on
2026-08-16/17 (receipts editing, the job-notes mount, the instructions org-scope check), so the
conflicts are known rather than mysterious. That number only grows.

### To pick it up later

1. Merge `main` into the branch, resolving the 8 files above; run the full gate.
2. Drive one real call in a browser before merging to `main`.
3. Then, and only then, the two owner settings: point the Twilio number's **voice webhook** at the
   deployed URL, and set the one staff number that should ring.

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_PHONE_NUMBER` are already set; the code reads
`TWILIO_FROM_NUMBER`, which is **not** the same variable — reconcile that during the merge.

---

## ~~Large video uploads~~ — RESOLVED the same day (2026-08-22)

**The owner raised the project ceiling to 2 GB. Re-measured by transferring real bytes, not by
reading a config:**

```
 51 MB  → accepted (22s)      the old 50 MB wall is gone
500 MB  → accepted (202s)     starr-field-videos
500 MB  → accepted (199s)     starr-field-files
```

The app cap is now **500 MB**, set in `lib/jobs/file-storage.ts` rather than left to an env var —
one number in one place beats a variable that has to be right in three environments.

**500 MB and not 2 GB, deliberately.** The project ceiling stopped being the binding constraint the
moment it was raised; the two BUCKETS are, and both cap at 500 MB. Setting the app cap to 2 GB would
put the client limit above the server's again — the exact shape of the failure that spent every byte
of a 375 MB video before refusing it. The chain is `app 500 MB ≤ buckets 500 MB ≤ project 2 GB`, and
every link was measured.

There is now 1.5 GB of headroom above the buckets, so going higher needs no dashboard trip: raise
both buckets in a seed FIRST, then the constant. Never the reverse. Prove it with
`node scripts/check-upload-ceiling.mjs --expect <MB>`.

**The Files area was the same defect waiting in a second place.** `lib/files/upload.ts` had capped
the File Explorer at 100 MB since F3, over a `file-explorer` bucket **that had never been created**
— no seed made it, and `ensureStorageBucket` would have created it on the first upload at its 50 MB
default. Measured rather than assumed: `storage.buckets` held no such row, and all 24 `file_nodes`
rows had `storage_bucket IS NULL`, so nothing had ever been stored there. A 60 MB video would have
transferred in full and been refused at 100%, exactly as the job video did.

Seed 608 creates it at 500 MB, both upload routes now pass `fileSizeLimit` explicitly rather than
inheriting the 50 MB fallback, and the cap itself moved to `lib/storage/uploads.ts` — one number for
the job page, projects, the File Explorer and the mobile app (which was refusing at 100 MB on its
own, the tightest limit in the platform and the one a surveyor actually hits).

Two things the Files area also needed before a long video was really usable: it now PLAYS video in
the viewer instead of only offering a download, and its inline signed URL lasts a viewing session
rather than 60 seconds. A download is one request and only has to start in time; `<video>` issues a
fresh range request on every seek, so a 60-second link died the moment somebody scrubbed.

An unexpected first attempt is worth recording: the ceiling did not move on the first change, and
three probes across two minutes ruled out propagation delay. Supabase has two "file size limit"
settings — the per-bucket one (Storage → Buckets → Edit) and the project one (Settings → Storage →
Upload file size limit) — and only the second one is the override. The per-bucket field was already
at 500 MB and could never have taken effect on its own.

The original write-up is kept below, because the reasoning is the part that stays useful.

### — original entry, kept for the reasoning —

## Large video uploads — one dashboard setting, and it is the only thing left (2026-08-22)

Owner: *"Can we make it so that we can upload much larger videos? ... Can we just make it so that we
can have videos up to 500MB?"*

**Everything in code is done and merged. The cap is 50 MB because of a setting no code can reach.**

### What was already true before this session

`starr-field-videos` has had `file_size_limit = 524288000` (500 MB) since seed 605. It has never
mattered, because **Supabase caps every upload at the PROJECT level and that ceiling overrides every
bucket.** It is currently **50 MB**, proven by uploading real bytes on 2026-08-19:

```
50 MB exactly (52,428,800)  accepted
50 MB + 1 byte              REJECTED — "The object exceeded the maximum allowed size"
```

A bucket's limit can only ever be LOWER than the project ceiling, never higher. That is why raising
it in seed 605 changed nothing, and why a 375 MB video transferred all 375 MB and was refused at
100%.

### The one thing to do

**Supabase dashboard → Storage → Settings → Upload file size limit → set to 1 GB.**

Requires a paid plan; the project is at ~1.19 GB of storage, which is already past the free tier's
1 GB, so this should simply be a slider. 1 GB rather than 500 MB deliberately: the app's own cap
sits *below* the project ceiling, and headroom means the next raise needs no dashboard trip.

Then, in Vercel (Production + Preview) and `.env.local`:

```
NEXT_PUBLIC_MAX_UPLOAD_BYTES=524288000
```

### Prove it rather than trust it

```
node scripts/check-upload-ceiling.mjs --expect 500
```

It uploads real bytes at escalating sizes and reports the number storage actually accepted. Written
because the check that missed this last time asserted the API returned a *signed URL* for a 250 MB
file — it never PUT the bytes, so the route was happy and the transfer was always going to fail.

### Do not set the env var before raising the ceiling

The app cap must stay **at or below** the project ceiling. Setting it higher is precisely the defect
of 2026-08-19: the server signs the URL, the client sends every byte, and storage refuses the object
at the very end. If it happens anyway, the client now says so by name instead of `Upload failed
(400)` — see `explainPutFailure` in `lib/jobs/upload-client.ts`.

### What ships regardless of the setting

Seed 607 raised `starr-field-files` from 100 MB to 500 MB to match the video bucket, because the app
has one cap constant for both. Without that, raising the app cap would have recreated the
fail-at-100% defect for every non-video file (a 200 MB point cloud). Every number in the chain now
agrees: app cap ≤ both buckets ≤ project ceiling.
