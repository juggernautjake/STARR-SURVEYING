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

## A. Decisions (each converts directly to shipped code)

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
- [~] **In-app roller for the bespoke sheets — MOSTLY RESOLVED (verified 2026-07-18): both bespoke sheets now
      ROLL in-app.** When this was written PF2Sheet/IGSheet were display-only; Area R1b has since wired both to
      the shared `resolveD20Roll` engine: tapping a check/save/skill/strike rolls a d20 + its modifier (and a
      strike's damage via `rollDiceExpr`), with an optional **target-DC field** that resolves the four-step
      degree of success (`pf2Degree` now has call sites; IG's ladder too), shown in a result banner. Tested
      (`pf2-sheet-roller.test.ts`, `ig-sheet-roller.test.ts`). **The one residual — a genuine product call:** the
      bespoke rollers pass the BASE modifier and show the condition/stance penalty **legibly** for the player to
      apply (a deliberate transparency choice — see `IGSheet` "not folded into base numbers"), whereas the 5e
      dice tray AUTO-FOLDS its exhaustion. Do you want the IG/PF2 rollers to auto-fold the displayed condition/
      stance penalty into the rolled total like 5e, or keep the current show-and-apply pattern? (Only this
      auto-fold choice is left; the roll surfaces themselves are shipped.)
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
- **PF2 has no in-app roller (SURFACED, §C).** `pf2Degree` is built + fully tested but has zero call sites;
  `PF2Sheet` is display-only. Product call.

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
