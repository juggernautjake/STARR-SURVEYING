# DND Platform — Phase 2: Rollers, Preferences, Configurable Mechanics, Homebrew, Art & Planets (2026-07-18)

**Owner directive (2026-07-18).** A large, explicit feature program. This doc captures the whole directive
verbatim-in-intent, breaks it into buildable slices with acceptance criteria, and sequences them by
dependency. Ground rules from `DND_RULES_PLATFORM` carry over (rules-legal defaults, no cross-system leak,
IG content only from Brendan's site + never invent, golden-pin verified data, PR workflow, one meaningful
slice per loop → typecheck+lint+commit+push+annotate).

> Owner, verbatim intent: build the in-app roller for the bespoke sheets (PF2 + IG); build the engines and
> connect them. Players can (a) use the roller to *effect* things (auto-apply mechanics), (b) manually input
> rolls, (c) manually change stats, (d) just record rolls they make IRL. UI + options for all of these + any
> good additions. Toggle the auto-mechanics on/off. Player preference page + a comprehensive DM
> preference/settings page that totally controls a campaign; player prefs auto-lock to the DM's. More dice
> roller interfaces/styles per system (keep the futuristic one; add rugged / natural / fantasy / medieval),
> ideally with real dice-rolling animations (d20s tumbling in a tray). All systems use DEFAULT (vanilla)
> rules for exhaustion / rage / long rests / etc., but the mechanics/settings are editable to popular
> alternatives (e.g. exhaustion −2/level as an option) — vanilla is the default. Implement equip rules but
> allow turning the limits off. Use the explicit IG class taxonomy and build it out (adjust ours to match).
> A custom/homebrew/DLC/extras section for EVERY system that lists custom/third-party content, well-formatted
> + searchable + AI-usable; seed it with the Rangor race + Pugilist class. Fully build + hook up the IG power
> effect texts (decide what to do with the 9 off-roster powers). A content-creation system: people build +
> post new weapons/items/potions/armor/spells/stances/effects/abilities/skills/feats/races/classes/subclasses,
> found on the site, attributed to their creator, usable on characters if the DM allows — fully built + wired.
> 3D planets: add surface/city lights; substantially improve the partially-destroyed/"dead" planet meshes
> (the holed planet is a cylinder clipping through with no real hole — model real holes + realistic meshes).
> Sun-angle terminator is fine as-is. IG race art: import the portraits the owner drew on Brendan's site,
> frame them nicely on the IG library page, give each race its character art (some races' art is pending).

---

## Areas & slices (sequenced by dependency)

### Area SQ — Sheet quality + full AI integration, ALL FOUR systems (owner 2026-07-17)
> Owner, verbatim intent: make the character sheets for **IG, Pathfinder 2e, D&D 2024, and D&D 2014** all
> styled well and looking good; make sure all the information is good; and make sure the **AI has complete
> integration into editing all of them and reading every component**.

This is a cross-system audit thrust (aligns with the planned final QA walkthrough). Per system:
- [ ] **SQ1 — Styling/layout pass** — each sheet reads well + looks good on desktop AND mobile (ties to MOB3);
      no broken/against-the-skin colors (the `sheet-contrast` guards already protect the 5e sheet — extend the
      spirit to IG/PF2).
- [ ] **SQ2 — Information completeness** — every field the system needs is present + correct on the sheet
      (cross-check vs each system's rules module; IG vs `SITE_MASTER.md`).
- [~] **SQ3 — AI reads every component** — audited the IG digest (`igCharacterDigest`): it already carries
      identity, ancestry TRAITS (with text), abilities, defenses (HP/DR/saves), resolved attacks, trained
      skills, active stance + effect, conditions + computed penalty, defensive power + effect, feats, and the
      companion. **Gap found + fixed:** POWERS were listed by NAME only — a ruling on "how does my power work?"
      needs the effect (the AI can't recall a bespoke IG power from its name), exactly like stances/conditions/
      defensive-powers already do. Powers now carry their `IG_POWERS` effect text; an unknown/custom power stays
      name-only (Ground Rule 2 — never invented). `ig-digest.test.ts` +1 & strengthened. **PF2 digest audited
      + fixed ✅** — `pf2CharacterDigest` carried identity/defenses/attributes/status/offense/strikes/skills but
      was MISSING the character's **FEATS** (now listed with their body text — a ruling on "what does your feat
      do?" needs it, and it's on-sheet content the AI can't recall from a name) and **SENSES** (darkvision etc.
      — a visibility ruling turns on them); both added (`pf2-digest.test.ts` +2). REMAINING: a spot-audit of the
      5e `characterDigest` (already the richest — attacks/features/spells/effects all resolved).
- [~] **SQ4 — AI edits every component** — audited the IG edit path (`applyIgEdit`): it could change
      stance/conditions/feats/powers/defensive-power but had **no way to adjust HP** — the single most common
      in-play edit, which the digest already surfaces (a ruling "you take 8 damage" couldn't be applied). Added
      `apply_damage` (raises lethal, or nonlethal with a flag; capped so currentHp floors at 0) and `heal`
      (removes lethal first, then nonlethal) — pure, immutable, clamped. Wired into the AI tool schema (`amount`
      +`nonlethal` props, enum auto-updated) + the tool instruction, and the character-scope guard now accepts
      the `apply_`/`heal` HP verbs. Golden-pinned (`ig-edit.test.ts` +5; ig-ai + ai-scope parity updated).
      **PF2 in-play edit path CREATED ✅** — PF2 had a build/picks tool but NO in-place edit at all. New pure
      `lib/dnd/systems/pathfinder2e/edit.ts` (`applyPf2Edit`): `apply_damage` (temp HP soaked first, floors at 0,
      and dropping to 0 sets Dying = 1 + Wounded per PF2), `heal` (caps at max; regaining HP clears Dying),
      `set_temp_hp`, `set_dying` (0–4), `set_wounded` — all pure/immutable, handling the `0 = full` stored-HP
      convention via the death track. Exposed as the `edit_pf2_sheet` AI tool (same parser). Golden-pinned
      (`pf2-edit.test.ts`, 6). **PF2 edit ENDPOINT wired ✅** — `app/api/dnd/characters/[id]/pf2-edit/route.ts`
      (the counterpart to `ig-edit`): write-gated at the character chokepoint (`requireCharacterWrite`), guards
      the PF2 sidecar, runs the same validated `parsePf2Edit` + pure `applyPf2Edit`, and persists only
      `data.pf2e` — so the manual sheet AND the AI's `edit_pf2_sheet` tool go through one endpoint
      (`pf2-edit-route.test.ts`, 3). **AI chat-loop dispatch wired ✅** — the `ai-edit` route now offers
      `edit_pf2_sheet` in its toolset for PF2 characters, instructs the AI it can change HP + the death track,
      and dispatches a returned call through `parsePF2EditToolCall` → `applyPf2Edit` → persists `data.pf2e` +
      audits to `dnd_sheet_edits` (mirroring the IG branch exactly). **PF2 now has full AI-edit parity with IG.**
      `pf2-edit-route.test.ts` +2. REMAINING for SQ4: a spot-audit of the 5e `applySheetEdits` (already the
      richest path — it edits every mechanical field).
- [ ] **SQ5 — Per-system verification** — a browser/QA pass per system (the memory-documented Slice-40
      walkthrough): build a character, exercise the sheet + AI edit + read, fix correctness + styling bugs.

### Area IGS — Intuitive Games full site mirror + build-out (owner 2026-07-17)
> Owner intent (several messages): scrape EVERY page of Brendan's IG TTRPG with Playwright, opening all
> collapsed DOM toggles so every word is captured; pull + analyze every IMAGE (some hold stat tables); flag
> every undefined/empty element as a WIP "needs definition" list (shareable with Brendan); download images and
> host them where they belong on our site; and BUILD OUT everything that's fleshed out into our app, well
> formatted. **Be discerning: Brendan has OTHER game projects on the site (e.g. the board game "Overrun") —
> pull ONLY the Intuitive Games TTRPG content, not the other projects.**

- [~] **IGS1 — DOM scrub of every TTRPG page.** IN PROGRESS. Reusable Playwright extractor pulls headings +
      prose + tables + accordion text (incl. hidden/collapsed) per page. DONE: spell-list, classes, skills,
      backgrounds, core-rules → `docs/reference/intuitive-games/*-scraped.md`. REMAINING pages: traits-
      ancestries, feats-general, feats-combat, stances, conditions, weapons, armor-shields, equipment, tools,
      magical-items, companion-creatures, redistribution, character-building, home. (Skip game-list = Overrun.)
- [~] **IGS2 — Image analysis + hosting.** IN PROGRESS. Stat data that lives only in images is transcribed by
      reading the pixels (Playwright download + vision). DONE: the Encumbrance table (STR 6–20 × 5 weight cols)
      → `stat-tables-from-images.md` + image hosted at `public/dnd/intuitive-games/tables/encumbrance.png`.
      Now also PROGRAMMATIC: `igCarryingCapacity(str, {quadruped})` in IG rules encodes the table
      (base×{1,2,4,6}, quadruped ×3), golden-pinned row-for-row by `ig-encumbrance.test.ts`.
      REMAINING: sweep remaining pages for content images, download + host + transcribe each.
- [x] **IGS3 — WIP "needs definition" report.** ✅ SHIPPED (living) — `WIP-needs-definition.md` auto-flags
      every EMPTY toggle found (4 so far: Craft's Manufacture/Repair Object, Perform's Entertain/Impress).
      Regenerates as more pages are scraped. This is the owner's shareable "what Brendan still needs to build".
- [x] **IGS4 — Wire spell texts.** ✅ SHIPPED — the 26 missing power texts closed in IG_POWERS (see IGP).
- [ ] **IGS5 — Build out the rest.** Wire the scraped class ladders (→ Area T taxonomy), skill mechanics,
      backgrounds/cultures, core-rules tables, equipment/armor/weapon/magic-item data into the app + library,
      well-formatted, each verbatim from the site; carry empty items as "coming soon".
- [x] **IGS4b — All content verbatim from the site (owner 2026-07-17).** ✅ SHIPPED — audited IG_POWERS vs
      the scrape and replaced 28 paraphrased roster effects with Brendan's verbatim text (all 54 roster spells
      verbatim; 9 off-roster kept + flagged, nothing invented). Art credit corrected to "Art by Jacob ·
      commissioned by Brendan". ONGOING: keep auditing every IG module (feats, ancestries, conditions,
      stances, items) against the scraped reference docs for any non-verbatim/invented text.
- [ ] **IGS7 — IG library page quality (owner 2026-07-17).** Owner: each section of the IG library must be
      (a) fully built, (b) contain ONLY correct site-sourced info, (c) be interactive where it should be, and
      (d) be formatted/styled in an intuitive, easy-to-read way — "right now it is not that way." A per-section
      pass: verify completeness vs the scrape, strip any non-site content, improve the formatting/interaction.
      (Overlaps Area SQ1/SQ2 for IG.)
- [ ] **IGS6 — EVERYTHING interactable on the character sheet (owner 2026-07-17).** Owner: make sure ALL
      actions, ancestry traits, stances, spells, class abilities/buffs, leveling, HP, attack, AC, armor,
      weapons, starting equipment, feats, conditions — literally everything — is built into the sheet and
      "accounted for in a dynamic, helpful, interactable way." This is the IG sheet's completeness+interactivity
      pass (a large multi-slice effort; overlaps Area SQ for all systems + Area R roller). Break down per
      component: each must (a) render its real data, (b) be rollable/usable where it's an action/roll,
      (c) be editable (manual + AI), (d) show its rules text (tooltip/expand). Track gaps as sub-slices.

### Area TH — Per-template color themes (owner 2026-07-17)
> Owner, verbatim intent: for EACH current character-sheet template, create multiple (3–4) color themes and
> tie ALL the colors in that template to the theme's color tokens, so a user picks a template and then picks a
> color theme. Every theme must keep ALL text fully visible + readable (verify this). Works like Susie's
> character having a pink version and a blue version — just extend that to all templates.

- [x] **TH1 — Theme-token audit per template.** ✅ CONFIRMED — every skin already drives its colours through the
      `SheetTheme` token map (`theme.ts` → `themeToCssVars` → CSS vars on the `.dnd-sheet` root); the new
      variants reuse that exact seam, no hardcoded colours introduced.
- [x] **TH2 — 3–4 color themes per template.** ✅ SHIPPED — `themeVariantsFor(skin)` in `theme.ts` returns the
      selectable palettes per template: the default (Hextech) skin now offers **4** — Hextech Gold, Shadow Isles
      (emerald), Noxus (crimson), Freljord (ice) — each a full `SheetTheme` reusing Hextech's readable dark
      grounds + parchment ink, swapping only the accent hues; streamer keeps its pink/blue pair; donata/rulebook
      expose their own. `resolveThemeVariant(skin, key)` is the persistence seam (bad key → first variant).
- [x] **TH3 — Theme picker.** ✅ SHIPPED — generalised the streamer's `SkinSwitch` into a colour-theme picker for
      ANY multi-palette skin: it renders every `themeVariantsFor(skin)` option as a labelled colour-swatch chip
      and persists the choice to `char.skinVariant` (widened `'pink'|'blue'` → `string`). App.tsx resolves the
      active theme via `resolveThemeVariant(config.skin, char.skinVariant)` — **with no chosen variant it keeps
      the sheet_type's own theme EXACTLY**, so every existing sheet is byte-for-byte unchanged; the base skin
      returns a single theme (no mismatched picker). The streamer's `.variant-<id>` class + per-variant art stay
      pink/blue-narrow. Source-anchored (`theme-variants.test.ts` TH3 block); full dnd suite green (2075).
      **Area TH complete.**
- [x] **TH4 — Contrast guarantee.** ✅ SHIPPED — `theme-variants.test.ts` computes the real WCAG contrast ratio of
      body ink vs the panel AND void grounds for **every** variant across every skin and asserts ≥ 4.5:1 (AA).
      All 15 checks green — the owner's "readable" hard requirement is now machine-guaranteed for any palette we
      add. (Complements `sheet-contrast.test.ts`, which guards the shared stylesheet's structural colours.)

### Area P — Preferences & campaign settings (FOUNDATION — build first; unblocks A/D/E)
The config layer everything else reads. A player-preferences store + a DM/campaign-preferences store, with
**player prefs clamped to the campaign's** (the DM's setting wins where it constrains). Owner emphasis
(2026-07-18): the preference pages (players AND DMs, at the campaign AND individual-character level) must
**handle ALL systems**, be **robust — expose every possible option**, and be **genuinely hooked up so they
actually affect mechanics + the character sheets** (not cosmetic toggles). Three resolution levels: campaign
(DM) → player → per-character override, each clamped by the one above (the DM can lock any of them). Every
setting is system-aware where the mechanic differs by system.

- [x] **P1 — Preference data model + resolver (pure, tested). ✅ SHIPPED (2026-07-18).** `lib/dnd/preferences.ts`:
      typed `CampaignPreferences` (each setting = `{ value, playerCanChoose }`) + `PlayerPreferences` (partial
      overrides) + pure `resolvePreferences(campaign, player) → EffectivePreferences` (each resolved value +
      `lockedByDM`). The DM clamps the player: a locked setting can't be overridden. `DEFAULT_CAMPAIGN_PREFERENCES`
      is all-vanilla, players free to choose. `normalizeCampaignPreferences`/`normalizePlayerPreferences` load
      safely from stored JSON (invalid → default/unset, never wedges). Initial fields: `autoMechanics`,
      `exhaustionModel`, `longRestModel`, `equipLimits`, `diceRollerStyle`, `recordMode` — extended per area as
      the mechanics land. `preferences.test.ts` (10): defaults are vanilla, clamp, lock, safe-load. **Next:**
      the per-character override layer + more system-specific fields as M/R/E build out.
- [~] **P2 — Persistence + hooks.** IN PROGRESS. **P2a ✅ SHIPPED — campaign-side persistence with NO schema
      migration:** DM preferences live in the existing `dnd_campaigns.theme` jsonb under a `preferences` key.
      New pure helpers `lib/dnd/campaign-preferences.ts` (`readCampaignPreferences` /
      `writeCampaignPreferencesToTheme`) are the single read/write path — legacy campaigns read as full
      vanilla, a partial/corrupt/hostile PATCH body is sanitised through `normalizeCampaignPreferences`
      before it touches the DB, and artUrl/notes/dmNotes are preserved untouched. Wired into
      `GET/PATCH /api/dnd/campaigns/[id]` (GET now returns normalized `preferences`; PATCH accepts a
      `preferences` patch, DM-only via the existing role gate). Guarded by `campaign-preferences.test.ts`.
      **P2c ✅ SHIPPED — the campaign's effective preferences now reach the sheet mechanics.** The character
      sheet server page (`characters/[id]/page.tsx`) reads the campaign's stored prefs and folds them with
      `resolvePreferences` (player object empty until P2b), passing the result down through `SheetRoot` into
      `CharacterProvider`'s new `preferences` prop. So the DM panel → campaign theme → `hitDiceAfterLongRest`
      chain is LIVE: a campaign set to the 2014-half long-rest model actually changes the sheet's rest.
      Proven end-to-end + source-anchored by `preferences-sheet-wiring.test.ts`; full suite green (1935).
      REMAINING: **P2b** player-side overrides (per-user-per-campaign store — needs a `dnd_campaign_members`
      jsonb column; the resolver already accepts the player object, it's just always empty today).
- [~] **P3 — Player preferences page.** IN PROGRESS. **P3a ✅ SHIPPED (read-only view)** — `HouseRulesPanel`
      renders on the character sheet (when the character is in a campaign), showing every effective preference
      with a human label and a 🔒 on any the DM locked. So a player can already SEE the rules in force, sourced
      from the live P2c resolution. Guarded by `house-rules-panel.test.ts`. REMAINING (P3b): make the unlocked
      rows editable — blocked on **P2b** (a per-player override store to save the player's choices into).
- [x] **P4 — DM / campaign preferences page.** ✅ SHIPPED — `CampaignPreferencesDm.tsx`, a comprehensive
      panel in the DM-only campaign controls (`CampaignPageClient`). Every configurable setting is exposed —
      auto-apply mechanics (toggle) + exhaustion / long-rest / equipment-limits / dice-roller-style / roll-
      recording-mode (each a select with ALL options), and **every one carries a "Players may choose" lock**
      that, when unticked, forces the DM's value on all players (🔒). Defaults to vanilla everywhere; persists
      via `PATCH /api/dnd/campaigns/[id]` (the P2a path, DM-only), optimistic with rollback + the server's
      normalized copy trusted back. Guarded by `campaign-preferences-panel.test.ts` (surfaces every setting,
      every lock, every option, PATCHes). NOTE: the panel WRITES the prefs; making each setting actually
      change mechanics/sheets is Areas M/E/R/D consuming them (+ P2b/P2c player side, P3 player page).
- [ ] **P5 — Tests:** the resolver clamps player→DM correctly; a locked DM setting can't be overridden;
      defaults are the vanilla model for every system.

### Area M — Configurable mechanics (depends on P)
Make the mechanics the prefs name actually swappable, VANILLA BY DEFAULT.

- **M1 — Exhaustion model selector. OWNER DECISION (2026-07-17):** the **2014 tiered table IS the main model
  for the 2014 edition**, implemented programmatically into the mechanics; **flat −2/level is a selectable
  option** (also fully hooked up). `vanilla` = per-edition RAW (2014 → tiered; 2024 → flat −2/level);
  `flat-2-per-level` = always flat −2/level.
  - [x] **M1a — Exhaustion pure core.** ✅ SHIPPED — `lib/dnd/mechanics/exhaustion.ts`
        `exhaustionD20Effect(kind, level, edition, model)` → `{ penalty, disadvantage }`: flat model / 2024
        vanilla = −2×level on every d20 test (no disadvantage); 2014 vanilla = the tiered table's disadvantage
        (ability checks at L1+, attacks & saves at L3+), no flat penalty. Plus `exhaustionSpeedPenalty` and
        `exhaustionCapsHpAt`/`exhaustionIsDead` for the non-d20 tiers. Golden-pinned by
        `mechanics-exhaustion.test.ts`.
  - [x] **M1b — Wire into the store.** ✅ SHIPPED — `rollCheck` now folds `exhaustionD20Effect(kind, exh,
        edition, model)` into the modifier + advantage mode (2024/flat → −2/level; 2014 vanilla → tiered
        disadvantage), and `rollDeathSave` + `InitiativePrompt` use the same helper. `edition` is derived from
        the system key and exposed on the store context; `exhaustionModel` reads the effective preference.
        Behavior change for 2014 chars is owner-authorized. `exhaustion-d20.test.ts` + `exhaustion-speed.test.ts`
        rewritten from the old "tracked gap" to assert the new edition/model-aware wiring; full suite green
        (1956).
  - [x] **M1c — 2014 Speed + HP tiers.** ✅ SHIPPED — `buildLedger` now takes the effective `exhaustionModel`;
        its exhaustion source is edition/model-aware: 2024/flat = −5 ft/level & HP untouched; 2014 vanilla =
        Speed halved at tiers 2–4 / 0 at tier 5+ (a computed `add`) and max HP halved at tier 4+. Store passes
        `exhaustionModel`. Golden-pinned by `exhaustion-2014-tiers.test.ts` (6); 2024 default unchanged
        (`exhaustion-speed.test.ts` still green). **Area M1 (exhaustion) complete.**
- [x] **M2 — Long-rest model selector.** ✅ SHIPPED — pure `hitDiceAfterLongRest(total, remaining, model)`
      in `lib/dnd/mechanics/long-rest.ts` (vanilla=full restore, half-hit-dice=2014 RAW half+min1, gritty/epic
      = amount unchanged), golden-pinned by `mechanics-long-rest.test.ts`. Wired into the sheet store's
      `longRest`. **Established the preferences seam:** `CharacterProvider` now takes an optional resolved
      `preferences?: EffectivePreferences` prop, defaulting to the full VANILLA set — the single place every
      swappable mechanic (exhaustion, dice style, record mode, equip) will read. Behavior-preserving today
      (no prop passed anywhere yet → vanilla → full restore); full dnd suite green (1930). REMAINING for M2:
      pass the real effective preferences into `CharacterProvider` once P2c resolves them at the sheet's
      mount (currently every caller omits the prop → vanilla).
- [~] **M3 — Rage & other class mechanics** — OPEN EXTENSION POINT (no discrete item currently pending). The
      vanilla-default-plus-options SEAM is fully built (exhaustion M1, long-rest M2, auto-mechanics gate R2, all
      reading `EffectivePreferences`); any future class mechanic (a rage-damage variant, an alt death-save rule,
      etc.) slots in as another pure `lib/dnd/mechanics/*` model behind a preference, following M1/M2 exactly.
      Left open (not deferred) because it tracks future mechanics as they arise, not a missing build.
- [x] **M4 — Tests.** ✅ SHIPPED — each model's numbers are golden-pinned and switching the model changes the
      result with vanilla as the default: long-rest (`mechanics-long-rest.test.ts` — vanilla full-restore vs
      half-hit-dice vs gritty/epic), exhaustion (`mechanics-exhaustion.test.ts`, `exhaustion-2014-tiers.test.ts`
      — 2024/flat −2/level vs 2014 tiered), and the R2 auto-toggle gate (`exhaustion-d20.test.ts`) proving the
      pref actually changes the folded roll. **Area M (configurable mechanics) is functionally complete.**

### Area E — Equip rules, live + toggleable (depends on P; `canEquip` already built + tested)
**OWNER DECISION (2026-07-17) — the refusal UX is an interactive CONFLICT DIALOG, not a plain refuse-with-reason.**
When equipping X conflicts with what's worn, a clearly-laid-out popup appears that (a) explains the conflict in
plain language ("you're already holding a sword and a shield"), and (b) offers **Cancel** plus a **swap** button
for EACH conflicting item ("Unequip the sword & equip the axe", "Unequip the shield & equip the axe"). The
player picks one and it executes immediately. Must be quick + easy to resolve for player/DM/user.

- [x] **E1a — Conflict-detection + swap core (pure, live `InvItem` model).** ✅ SHIPPED — `lib/dnd/equip-
      conflicts.ts`: `equipConflicts(items, id)` returns the currently-equipped items that would conflict
      (one-body-armor, one-shield, two-handed-vs-shield), each with a plain-language reason; `resolveEquipSwap
      (items, id, unequipIds)` unequips the chosen conflictor(s) and equips the target (pure, immutable).
      Golden-pinned by `equip-conflicts.test.ts`.
- [x] **E1b — Hand-slot conflict model (core).** ✅ SHIPPED — extended `equip-conflicts.ts` with a hands
      model (`handCost`: two-handed=2, other weapon/shield=1, else 0). `equipConflicts` now also flags
      hand-overflow, so the owner's sword+shield → equip a two-handed axe correctly returns BOTH the sword and
      shield as swap candidates; one-shield + one-body-armor rules kept. Added `handsToFree(items, id)` so the
      dialog knows whether unequipping ONE chosen conflictor suffices (dual-wield: free 1) or ALL are needed
      (two-handed over sword+shield: free 2). Golden-pinned (7 tests incl. the owner's case + dual-wield).
- [x] **E1c — Conflict dialog + wiring.** ✅ SHIPPED — `EquipConflictDialog` (a clear popup: explains each
      conflict, then Cancel + resolution buttons) wired into `Inventory.upsert`. When a save would equip an
      item and `equipLimits === 'enforced'`, the item is committed UNEQUIPPED and the dialog opens; the player
      resolves it deliberately. The dialog computes per-conflict single swaps (unequip just that item when it
      resolves — dual-wield → "swap the sword / the shield") and falls back to one "Unequip {all} & equip"
      when a two-handed weapon needs both hands freed — exactly the owner's UX. `equipLimits: off` skips the
      whole check (equip freely) = **E2 done too**. Guarded by `equip-conflict-dialog.test.ts` (gate/flow +
      swap-choice logic for both cases); full suite green (1961).
- [x] **E1d — AI equip_item routed through the core.** ✅ SHIPPED — `applySheetEdits` takes an optional
      `{ equipLimits }` (default enforced); on an enforced equip it auto-swaps (unequips conflicts via
      `equipConflicts`/`resolveEquipSwap`, then equips the target) so an AI-driven equip always lands on a
      legal state; `off` stacks freely. The ai-edit route resolves the character's campaign `equipLimits` and
      passes it. The AI acts on the instruction (auto-resolve) where the UI asks the player — same core.
- [x] **E3 — Tracker updated.** ✅ SHIPPED — `equip-enforcement-gap.test.ts` rewritten from "KNOWN GAP" to
      assert enforcement: the AI path auto-swaps a second body armour to one (enforced) and stacks with
      `equipLimits: off`; both live surfaces route through the equip-conflict core. **Area E complete.**
- [x] **E2 — Toggle:** ✅ SHIPPED with E1c — `Inventory.upsert` only runs the conflict check when
      `preferences.equipLimits.value === 'enforced'`; with `off` the equip commits unrestricted. The DM sets
      this on the campaign preferences panel (P4); it reaches the sheet via P2c.
- [ ] **E3 — Tests:** update the `equip-enforcement-gap` tracker → the live paths now enforce when on, allow
      when off.

### Area R — In-app roller for the bespoke sheets (PF2 + IG) (depends on P for the auto-toggle)
- [x] **R1a — Shared roll-resolution engine (pure core).** ✅ SHIPPED — `lib/dnd/roll.ts`:
      `resolveD20Roll({ natural, modifier, dc?, system? })` takes the natural face as INPUT (not rolled), so
      one function serves every input mode — auto (RNG face), manual (typed face), IRL (recorded face). Returns
      total + crit/fumble + (with a DC) the four-step `degree` for IG/PF2 (the shared ladder, extracted as
      `fourStepDegree`) or meet-or-beat `success` for others. `clampNatural` guards bad manual entry;
      `rollNaturalD20` isolates the only randomness. Golden-pinned by `roll-engine.test.ts` (8).
- [x] **R1b — Wire the engine into the bespoke sheets.** ✅ SHIPPED (IG + PF2). Both bespoke sheets now
      tap-to-roll on **ability checks (IG), saves, skills, attacks/Strikes (to-hit) AND damage** — d20 rolls
      via `resolveD20Roll`, damage via `rollDiceExpr` (dice-expression engine), shown in a shared
      `{label,total,detail,tone}` banner. Guarded by `ig-sheet-roller.test.ts` + `pf2-sheet-roller.test.ts`.
      REMAINING (R1b tail): a **target-DC field** to surface the four-step degree of success (the engine
      already returns `degree` when a DC is supplied) — a small follow-up.
- [x] **R2 — Auto-mechanics toggle.** ✅ SHIPPED — the store reads `prefs.autoMechanics.value`; every d20 fold
      site (rollCheck, manualD20, rollDeathSave) applies the exhaustion helper ONLY when auto-mechanics is on,
      else uses a stable `NO_EXH` no-op and tags the roll `EXH (apply manually)` so the player knows to apply it
      themselves. Default (on) behaviour is unchanged. Golden-anchored (`exhaustion-d20.test.ts` R2 block).
      (Conditions/adv-dis are already player-driven via `advMode`; exhaustion is the auto-folded mechanic on the
      generic sheet. IG stance auto-folding can extend the same gate later.)
- [x] **R3 — Manual roll input.** ✅ SHIPPED — pure `foldD20(face, mod, critMin)` in `_sheet/lib/dice.ts`
      folds a physically-rolled d20 face with the character's modifier (clamps 1–20, no randomness/advantage —
      the player chose the die), deciding crit/fumble like any roll. Store `manualD20(label, mod, face, opts)`
      layers exhaustion + crit range on top and STAGES it (the reveal + log play, landing on the entered face,
      tagged MANUAL). Golden-pinned (`manual-roll.test.ts`).
- [ ] **R4 — Manual stat / direct edit.** Already exists for 5e; ensure the bespoke sheets can be directly
      edited (stats/HP/etc.) — parity.
- [x] **R5 — Record an IRL roll.** ✅ SHIPPED — store `recordRoll(label, total, opts)` commits a
      physically-rolled result straight to the shared roll log (kind default `raw`, tagged IRL) — no folding,
      no animation. Both R3 + R5 are wired into a compact two-mode **"Enter a roll"** panel in the DiceTray
      (Manual d20: face + modifier → Fold; Record IRL: result → Log), themed to the tray palette, Enter-to-submit.
- [x] **R6 — Tests:** ✅ SHIPPED — `foldD20` golden-pinned (face+mod, crit/fumble, clamp, sign) in
      `manual-roll.test.ts`; the store's `manualD20`/`recordRoll` + the tray's two-mode entry panel are
      source-anchored there; the R2 auto-toggle gate is anchored in `exhaustion-d20.test.ts`. Full suite green.
- [ ] **R4 — Manual stat / direct edit (DEFERRED — needs a focused, browser-verified session).** The 5e sheet
      has full in-place edit (editMode number fields); the IG sheet edits via structured `postEdit` ops
      (stances/conditions/powers/feats). `PF2Sheet.tsx` is still largely a read-only display — adding true
      in-place stat/HP editing there is a substantial data-model + UI build best done where it can be exercised
      live, so it's parked rather than half-built at scale. Rationale documented per the README defer rubric.

### Area D — Dice roller interfaces & styles (depends on R)
- [x] **D1 — Style system.** ✅ SHIPPED — the dice tray's look is now driven by `preferences.diceRollerStyle`.
      The store exposes the effective preferences in its context; `DiceTray` stamps `data-dice-style` on the
      tray + minimized FAB; `theme.css` themes all four new looks (**rugged**, **natural**, **fantasy**,
      **medieval**) by re-skinning the frame/header/title, with **futuristic** as the default base look (no
      override). Guarded by `dice-style.test.ts`; the contrast guard exempts `[data-dice-style]` (a bespoke
      look like a `.skin-*`). Full suite green (1942). REMAINING D2 (animated 3D tumbling dice) is separate.
- [x] **D1b — In-tray style selector + auto-open (owner 2026-07-18).** ✅ SHIPPED — the dice tray has a style
      selector in its header (switch futuristic/rugged/natural/fantasy/medieval right from the roller; a
      per-session override of the preference), and it auto-opens when a roll is triggered from the sheet while
      minimized (watches `activeRoll.token`). Guarded by `dice-tray-ux.test.ts`.
- [ ] **D2 — Animated 3D dice tray.** Real dice-rolling animation (d20/dice tumbling in a tray) — a canvas/
      WebGL or CSS-3D roller. Themeable per D1. Falls back to a static roll on reduced-motion / no-WebGL.
- [x] **D4a — Header controls formatting (owner 2026-07-18).** ✅ SHIPPED — the tray-head style/sound/minimize
      controls align cleanly (the style `<select>`'s native chrome was breaking the row; now a clean pill).
- [ ] **D4 — Dice-roller skins: colors from the sheet, shapes/textures/number-display per skin (owner
      2026-07-18).** A substantial roller redesign, multi-slice:
  - [x] **D4b — Colors inherit the sheet palette.** ✅ SHIPPED — the four skins no longer hardcode hues; they
    inherit the sheet's tokens (border `--line-strong`, title `--ink`, panel `--panel-2-rgb`/`--void-rgb`,
    glow `--hotpink`/`--tealbright`), so the roller matches the sheet + its colour theme. Only shape/texture/
    glow/title differ per skin (rugged sharp+stone hatch/no glow, natural soft-round+teal aura, fantasy
    ornate+dual glow, medieval sharp iron+parchment weave+serif). Verified in-browser; no hardcoded hexes
    remain; dice-style + sheet-contrast tests green.
  - **D4c — Per-skin shape/texture/format/positioning.** Each of the 5 skins gets its own vibe — frame shape,
    textures, control layout/positioning — while keeping identical functionality.
  - [x] **D4d — Per-skin NUMBER-DISPLAY styling.** ✅ SHIPPED — `RollStage` takes the active skin (`roller`
    prop from `DiceTray`) and drives a per-skin `DISPLAY_MODE`: **futuristic** cycles colour + font + tilt
    (the screen vibe); **fantasy** shimmers colour on a steady font; **natural/rugged/medieval** are calm
    single-colour with a stable font (teal Rajdhani / gold Oswald / gold serif). Crit/fumble still read
    semantic gold/danger on every skin. Colours are sheet accent tokens (D4b). Guarded by `dice-tray-ux.test.ts`.
  - [x] **D4e — New animations + sounds per skin.** ✅ SHIPPED (owner: "new animations and things… new sounds
    too"). SOUNDS: `lib/audio.ts` now defines a per-skin VOICE (waveforms + pitch + grit); every SFX
    (tick/blip/whoosh/tada/errorBuzz) takes the skin, so rugged knocks low + gritty, natural taps soft + woody,
    fantasy chimes bell-like + shimmers, medieval is hornlike, futuristic keeps the original digital synth.
    `RollStage` passes the active `roller` into every call. ANIMATIONS: per-skin spinning-number keyframes
    (ruggedTumble / naturalBob / fantasyFloat / medievalStamp; futuristic keeps `jitter`) keyed off the tray's
    `data-dice-style`, with a `prefers-reduced-motion` fallback. The pure roll RESULT is untouched (crit/fumble
    stay gold/danger). Golden-pinned (dice-style +3). Full dnd suite green (2053). Remaining: D2 animated 3D dice.
- [ ] **D3 — Tests / visual:** the pure roll result is unchanged by the skin (source-anchored); visual polish
      is in-app.

### Area HIDE — Hide the non-playable systems site-wide (owner 2026-07-18)
> Owner: only four systems are ready — D&D 2024, D&D 2014, Pathfinder 2e, Intuitive Games. Every other system
> (PF1e, Starfinder, CoC7e, Blades, Cyberpunk RED, Shadowrun 6e) must be **fully hidden** everywhere — pages,
> buttons, mentions, transpose targets, builders. KEEP the code/data, just hide. The library shows "more
> systems + their character-sheet builders coming soon" in their place.

- [x] **HIDE1 — Library.** ✅ SHIPPED — `allLibraryPages()` filters to `isSystemAvailable`; the per-system
      library page 404s for non-playable keys; `generateStaticParams` only emits playable keys; the index
      shows a "◆ More systems coming soon" card. Guarded by `library.test.ts`.
- [x] **HIDE2 — Character builder / New Character.** ✅ SHIPPED — `NewCharacterForm`'s system `<select>` maps
      `GAME_SYSTEMS.filter(isSystemAvailable)`, so only the four are buildable.
- [x] **HIDE3 — System switcher / transpose.** ✅ SHIPPED — `SystemSwitcher`'s list is ambiguous + the four
      available + (defensively) the character's current system; a hidden system can't be a build/transpose
      target (was previously shown-but-disabled).
- [x] **HIDE4 — Campaign.** ✅ SHIPPED — `NewCampaignButton` dropped its "under construction (coming later)"
      optgroup; only the four available systems are offered.
- [x] **HIDE5 — Guards/tests.** ✅ SHIPPED — `hidden-systems.test.ts`: the available set is exactly the four,
      the others stay registered but hidden, the library only builds available pages, and each listing surface
      filters to available. **Area HIDE complete** (library HIDE1 + builder + switcher + campaign + guards).

### Area TR — Character transpose UX + AI custom-content build (owner 2026-07-17)
> Owner intent: when transposing a character into another system, show an **animation/confirmation** that it's
> working, then a clear **"done" notification**. If custom content is allowed for that character OR its
> campaign (incl. campaigns it's been invited to), first **prompt**: "OK for the AI to create custom content
> to make this character work in the new system?" If yes, the AI (a) reads the WHOLE target system first,
> (b) builds the character with the vanilla system as far as possible, (c) creates balanced custom
> classes/ancestries/feats/stances/spells/abilities only where needed to preserve the character's
> vibe/persona/abilities, and (d) validates every custom piece against the system's mechanics + balance before
> committing (as close to the system's mechanics as possible).

- [x] **TR1 — Transpose progress + completion UX.** ✅ SHIPPED — `SystemSwitcher` now runs a working→done
      lifecycle for a transpose (not an instant switch): a spinner + animated indeterminate progress bar
      (`.transposeBar`) with "The AI is reading {system}'s rules and rebuilding…" while it builds, then an
      obvious `role="status"` success banner ("✓ Transposed into {system} — now active!") with a dismiss.
      Guarded by `transpose-progress.test.ts`. REMAINING for TR1: a vanilla-vs-custom summary in the done
      banner (arrives with TR3 when the route reports what it built).
- [x] **TR2 — Custom-content consent prompt.** ✅ SHIPPED — before an AI transpose, when custom is allowed
      (the character's campaign isn't vanilla-only; no campaign → allowed), `SystemSwitcher` shows a
      `role="dialog"` prompt: "Transpose into {system} — allow custom content?" explaining vanilla-first +
      balanced custom, with **Yes — allow balanced custom / No — vanilla only / Cancel**. The choice is passed
      to the route as `allowCustom`. An instant switch (already-built system) skips the prompt; a vanilla-only
      campaign transposes best-effort vanilla without asking. The page passes `allowCustom` from the campaign's
      `allow_custom`. Guarded by `transpose-progress.test.ts`. REMAINING: **TR3** — the route/AI actually
      honoring `allowCustom` (read-system-first, vanilla-first, balanced custom, provenance).
- [x] **TR3 — Read-system-first + balanced custom build.** ✅ SHIPPED — the transpose route
      (`.../[id]/system`) now parses `allowCustom` (default false) and picks the prompt accordingly:
      `transposeSystemPrompt(allowCustom)` = a shared base ("READ the target system's rules first… PREFER
      vanilla") + either the strict **vanilla-only** suffix (never invent) or the **allow-custom** suffix
      (create BALANCED custom only where no vanilla option fits, in the system's own mechanics/format,
      balanced vs comparable vanilla, listed as "CUSTOM:" for DM review). The existing target-system grounding
      is loaded first; the existing provenance detection flags any custom element (it's not in the vanilla
      catalog); the response returns `allowedCustom`. Guarded by `transpose-custom.test.ts`.
- [x] **TR4 — Tests.** ✅ SHIPPED — `transpose-progress.test.ts` (consent gating + progress/done UX) +
      `transpose-custom.test.ts` (default-false, prompt-by-consent, read-first/prefer-vanilla, CUSTOM: listing,
      `allowedCustom` in the response). **Area TR complete.**

### Area MV — Multiple sheets per system: vanilla vs custom variants (owner 2026-07-18)
> Owner: allow MORE THAN ONE character sheet for the SAME character in the SAME system — e.g. a **vanilla**
> build and a separate **custom** build of the same character in that system. One sheet labelled "Vanilla",
> the other "Custom-built"; the user can switch between them like the cross-system variants.

> Owner (2026-07-18, expanded): in the system-selection element, add a **"+"** button to add a NEW sheet in
> any playable system, then choose vanilla or custom. Sheets are **explicitly nameable** (custom naming);
> otherwise a helpful default name. Track all of a character's sheets.

- [~] **MV1 — Variant model.** IN PROGRESS. **MV1a ✅ SHIPPED (label/name foundation)** — `system-variants.ts`
      now threads a `kind` ('vanilla' | 'custom', default vanilla — back-compat) AND an optional `name` through
      the variant model, `readVariants`, `snapshotActive`, `switchActive`, and `installTransposed(…, {kind,
      name})`; the transpose route labels the built sheet by the consent (custom→'custom'). Helpers
      `variantKind`/`variantKindLabel`/`defaultVariantName`. Golden-pinned by `system-variants.test.ts` (9).
      **MV1b ✅ SHIPPED (multi-slot model)** — `system_variants` is now keyed by an arbitrary **slot id** (not
      one-per-system); each variant carries its own `system` field. `readVariants` keeps the raw slot keys +
      derives each variant's system (legacy bare-system key → that system, kind vanilla). `builtSystems` /
      `hasVariant` now read `variant.system` (via `variantSystemOf`), so a system holding TWO slots is handled.
      New `listSheets(active, variants, systemLabelFn)` → the flat UI list of every sheet ({slotId, system,
      kind, name, active}) with default names. Golden-pinned incl. a two-sheets-per-system case; existing
      switch/transpose/campaign-port tests still green (back-compat). REMAINING: `switchActive`/`installTransposed`
      + the route to operate by **slot id** (so you switch to a specific sheet, and a custom transpose ADDS a
      slot instead of overwriting the system's) — that lands with MV2.
- [~] **MV2 — "+" add-sheet + switcher UI.** IN PROGRESS. **MV2a ✅ SHIPPED (slot ops model)** — pure
      slot-based functions in `system-variants.ts`: `newSlotId` (bare system for the first sheet, then `#2/#3`),
      `addSheetSlot(variants, {system,kind,name,…})` → adds a labelled sheet without touching the active,
      `switchToSlot(active, variants, slotId)` → swaps to a SPECIFIC slot, snapshotting the active back under
      its own `slotId` (no collision). `ActiveSheet.slotId` added for round-tripping. Golden-pinned (15 tests
      incl. two-sheets-per-system + round-trip). REMAINING **MV2b**: a route to add/switch/rename/delete a slot
      + the `SystemSwitcher` UI (the "+" add-sheet with vanilla/custom + name, and per-slot switch chips from
      `listSheets`); a custom transpose ADDs a slot instead of overwriting.
      **MV2b(route) ✅ SHIPPED** — the system route now: folds the persisted active-slot meta onto the live
      active sheet (`readActiveSlotMeta`); handles `{ slotId }` → `switchToSlot` (switch to a SPECIFIC sheet);
      handles `{ action:'add', system, kind, name? }` → `addSheetSlot` (add a blank sheet for a PLAYABLE
      system, `isSystemAvailable`-gated, without switching); and every persist path (switch/transpose too) now
      writes `withActiveSlotMeta` so the active kind/name/slotId survive. Guarded by `mv-route.test.ts`.
      **MV2c ✅ SHIPPED** — the `SystemSwitcher` now shows a **"Your sheets"** section: every sheet the
      character holds (from `listSheets`) as a switchable chip labelled with its name + a VANILLA/CUSTOM badge
      (active one highlighted), plus a **"＋ Add sheet"** form (pick a playable system + Vanilla/Custom + an
      optional name → posts `action:'add'`). Switching a chip posts `{ slotId }`. The page passes the sheet
      list + active-slot meta. Guarded by `mv-route.test.ts`; full suite green (2035). **Area MV is now
      user-visible end to end** (add/name/switch multiple vanilla+custom sheets per system).
      **MV rename/delete ✅ SHIPPED** — `deleteVariant`/`renameVariant` pure helpers + route actions
      (`rename` for the active-via-meta or a stored slot; `delete` for a NON-active slot only — the active can't
      be deleted); the switcher chips get an inline **✎ rename** (any sheet) and a **✕ delete** (non-active,
      with a confirm). Golden-pinned. REMAINING (minor): route a custom-consented TRANSPOSE to ADD a slot
      rather than overwrite the system's sheet.
      **MV UI overhaul ✅ SHIPPED (owner 2026-07-18: "make the add-sheet / system-select / name UI better,
      more appealing, more intuitive").** New hextech module classes: `.sheetAddCard` (a framed, animated
      gold-tinted mini-form) with **labelled fields** (`.sheetFieldLabel`) — a Game-system `<select>`, an
      optional Sheet-name input (dynamic placeholder + Enter-to-create), and a **segmented Vanilla | Custom
      control** (`.segmented`/`.segment`, replacing the cramped 2-item dropdown) with a one-line explainer of
      each choice and a clear "＋ Create sheet" primary. The sheet chips became `.sheetChip`/`.sheetChipActive`
      cards with `.kindPill` badges and round `.chipIcon` rename/delete buttons (active chip = teal border +
      dot, no more text clutter). All reuse existing `--hx-*` tokens + the shared `.input`. Golden-pinned
      (mv-route +1: card/labels/segmented/aria-pressed); contrast guard + full dnd suite green (2041).
      **MV transpose-as-new-slot + transpose QUALITY overhaul ✅ SHIPPED (owner 2026-07-18: "underwhelmed with
      the transpose — 1 HP bug; custom should recreate EVERYTHING the character can do, balanced, and clearly
      flag what's custom").** (1) `installTransposedNewSlot` pure helper + `action:'transpose'` route path so a
      transpose ADDS a sheet (keeping the system's existing one) — wired to the add card's new **Start from:
      Blank | ✨ AI transpose** control (custom segment ⇒ allowCustom). (2) **1-HP bug fixed** — `fallbackMaxHp`
      safety net repairs any sheet the AI left at the blank seed's 1 HP (from level + hit die + CON), starts it
      at full HP, and fixes hit dice. (3) **Rich digest** — the AI now receives the FULL source character
      (ability mods, save/skill proficiencies, every feature's rules text, attacks, spells, resources,
      inventory, feats) instead of names-only, and a thorough+balanced-for-(party-)level custom prompt. (4)
      **Custom manifest** — new optional `custom[]` on the edit tool; every invented element is flagged
      `customized: true` on the sheet AND listed (type · name · note) in the done banner, plus a "Built at N HP"
      line. Golden-pinned (system-variants +1, mv-route +6, transpose-custom updated). Full dnd suite green (2048).
- [x] **MV3 — Labels on the sheet + provenance.** ✅ SHIPPED — the switcher header shows the active sheet's
      **VANILLA/CUSTOM** badge, and (when the character has >1 sheet) an "Active sheet: {name}" line, so it's
      always clear which sheet is live. Custom variants' invented elements remain provenance-flagged via the
      existing approval/provenance path. Guarded by `mv-route.test.ts`.
- [ ] **MV4 — Tests:** two variants coexist for one system; switching preserves both; naming (custom +
      default); back-compat with single-variant data.

### Area T — IG class taxonomy (bounded data restructure)
- [x] **T1 — Restructure to the site's real taxonomy.** ✅ CANONICAL TAXONOMY SHIPPED — `lib/dnd/systems/
      intuitive-games/taxonomy.ts`: `IG_CLASS_TAXONOMY` = the 4 parents × subclasses VERBATIM from the site
      (Archon → Beastmaster/Eldritch Binder/Packmaster/Summoner; Conduit → Druid/Shifter/Witch; Fighter →
      Champion/Freebooter/Marksman/Sohei; Wizard → Arcanist/Magician/Shaman), plus pure helpers `igParentClasses`,
      `igSubclassesOf`, `igParentOf`, `igIsParentClass`/`igIsSubclass`, `igAllTaxonomyClasses`, `igClassLabel`
      ("Fighter · Marksman"). This is the single source the builder/grounding/provenance/library will read.
      **GROUNDING surface wired ✅** — `systemGroundingBlock` now appends an "INTUITIVE GAMES CLASS TAXONOMY"
      block for IG builds (each parent + its subclasses; "build a PARENT class + one of ITS subclasses only"),
      scoped so it never appears in another system's grounding (`ig-taxonomy.test.ts` +2). **LIBRARY surface
      wired ✅** — the IG library Classes section now renders the 4 parent families × their subclasses (a
      "Parent class → Subclasses" table) instead of the old flat `IG_CLASS_GROUPS` grouping, retiring the
      taxonomy-mismatch NOTE (it's reconciled now); `library.test.ts` updated. **BUILDER surface wired ✅** —
      `IGCharacterBuilder`'s Class dropdown now offers the four PARENT classes (`igParentClasses()`) and the
      Subclass dropdown is SCOPED to the chosen parent (`igSubclassesOf(className)`), disabled until a class is
      picked and cleared when the class changes — so you can only ever pick one of a parent's own subclasses,
      never a cross-family one (`ig-builder-ui.test.ts` +2). **T1 is now done across data, grounding, library,
      and builder.** (A future nicety: `igClassLabel` provenance strings on saved sheets — cosmetic.)
- [x] **T2 — Tests.** ✅ TAXONOMY GOLDEN-PINNED — `ig-taxonomy.test.ts` (5): the 4 parents + subclasses are
      pinned to the site; every subclass maps to exactly ONE parent (no leak / no cross-family duplicate);
      queries are case-insensitive + family-labelled; and the taxonomy is proven CONSISTENT with the mechanical
      `IG_CLASS_DETAILS` (every `classification: 'subclass of X'` row matches its taxonomy parent), and the
      **builder offers parent→subclass** (`ig-builder-ui.test.ts` — parent-only class list, scoped subclass
      dropdown). No leak proven at every surface. **Area T complete.**

### Area H — Homebrew / custom / DLC / extras (per system) + content-creation system
This is the "form editor" the owner clarified: a full **create-and-share** system, plus a browse section.

- [~] **H1 — Content model + store.** ✅ PURE MODEL SHIPPED — `lib/dnd/homebrew/model.ts`: `HomebrewContent`
      over all 13 kinds (weapon…subclass), each carrying its mechanical `payload` (the existing engine shapes),
      a normalized `system` scope (or `'any'`), a required `creator` (attribution — content is never anonymous),
      and a `status` lifecycle (draft→submitted→approved→rejected). Pure helpers: `normalizeHomebrew` (defensive
      parse, drops invalid rows), `validateHomebrew`, `homebrewKindLabel`, `homebrewInSystem`,
      `homebrewMatchesSearch`, `isHomebrewPublished`, **`canUseHomebrew`** (the H4 DM-allowlist gate:
      players only ever use APPROVED + allowlisted/allow-all pieces; a DM may use their own drafts), and
      `browseHomebrew` (published + in-system + query, newest-first). Golden-pinned (`homebrew-model.test.ts`,
      12). REMAINING for H1: the live-DB schema/store (a `homebrew_content` table via seeds) — deferred to a
      live-Supabase slice (needs the DB connection; the pure model is the reusable core the store + UI + AI
      grounding all build on).
- [~] **H2 — Custom section per system (browse + search + AI).** ✅ CORE SHIPPED — `lib/dnd/homebrew/projection.ts`
      turns the catalog into (a) a per-system **"Custom / Homebrew · Extras"** `LibrarySection` of collapsible
      entries (name + "Kind · by Creator" brief + full text), (b) an **AI-grounding** block (each piece + a
      "only if the DM has allowed it" caveat), and both are wired live: `libraryPageFor` appends the section
      when the system has homebrew, and `searchLibrary` indexes each piece (scoped to its system). Seeded with
      **Rangor (race)** + **Pugilist (class)** in `lib/dnd/homebrew/seeds.ts`, descriptions lifted verbatim from
      the existing `rangor.ts`/`jack.ts` sheet data (nothing invented), attributed to Jacob, scoped to 2024,
      approved. Golden-pinned (`homebrew-library.test.ts`, 6; library suite still green). **`homebrewGrounding`
      is now folded into the LIVE grounding builder** (`systemGroundingBlock` appends the system's approved
      homebrew with the DM-permission caveat, scoped so one system's homebrew never leaks into another's —
      `grounding.test.ts` +2), so the adjudicating AI already sees a system's homebrew everywhere it builds/edits.
      REMAINING (minor): a dedicated browse/filter chip in the library page UI — the section + search already
      work — plus the live-DB store (H1 tail) so user-created pieces (not just the seeds) flow through.
- [ ] **H3 — Creation UI.** Build-and-post forms for each content kind (reusing the effect builder / item
      builder / attack builder / weapon+armor builders), attributed to the creator on save.
- [~] **H4 — Use-on-character + DM gating.** ✅ PURE GATE SHIPPED — `lib/dnd/homebrew/policy.ts`: a
      `CampaignHomebrewPolicy` (`allowAll` | explicit `allowedIds`), a defensive `readHomebrewPolicy` (unknown →
      the CLOSED default, never an accidental open catalog), and the pure decisions `homebrewAllowedForCampaign`
      / `allowedHomebrewList` / **`canAdoptHomebrew`** (requires published AND campaign-allowed; a DM previews
      their own drafts), plus DM controls `toggleHomebrewAllowed` + `describeHomebrewPolicy`. Golden-pinned
      (`homebrew-policy.test.ts`, 7). REMAINING: the live wiring — a campaign column storing the policy, the
      adopt route calling `canAdoptHomebrew` through `getCharacterAccess`, and the DM's allowlist UI (all need
      the live DB / a browser, so parked with the H1-tail DB slice).
- [x] **H5 — Tests.** ✅ SHIPPED — the whole pure H pipeline is golden-pinned: **round-trip** — a homebrew piece
      with an `Effect[]` payload → `homebrewToActiveEffect` (`lib/dnd/homebrew/adopt.ts`) → the sheet ledger
      resolves the REAL number (a Belt-of-Bear sets STR to 19 via `buildLedger`), invalid effects refused at the
      boundary (`homebrew-adopt.test.ts`, 3); **attribution persists** (creator rides onto the effect `source`);
      **DM gate blocks a disallowed element** (`homebrew-policy.test.ts`, 7); **searchable + grounded**
      (`homebrew-library.test.ts` + `grounding.test.ts`). Plus the model itself (`homebrew-model.test.ts`, 12).
      **Area H pure core is complete** — model, browse/search, live grounding, DM gate, and the effect round-trip
      are all built + tested; only the live-DB store + creation/DM-allowlist UIs (browser + Supabase) remain.

### Area IGP — IG power effect texts (content; hook up what exists, flag Brendan's gap)
- [ ] **IGP1 — Hook up every power with effect text** end-to-end (already largely done: grounding + library +
      sheet). Ensure the full `IG_SPELL_ROSTER` is offered everywhere with WIP markers where text is pending.
- [x] **IGP2 — The 9 off-roster powers.** ✅ SHIPPED (owner-delegated decision executed) — the library's
      Powers & Spells section now LABELS each of the 9 powers we carry that aren't on the current
      intuitivegames.net spell-list roster (Mage Armor, Misdirection, Life Connection, Companion Shield,
      Material Shield, Detect Thoughts, Elemental Blast, Piercing Element, Wide Blast): the brief gets
      "· not on the current site roster", the detail opens with a ⚑ "kept, pending reconcile" note, and the
      section summarises the count. They are KEPT (Jack's characters use some), not dropped, so nothing silently
      disappears; reconciled if the site adds/renames them. Golden-pinned (`library.test.ts`, IGP2 block +
      existing power test updated). The builder catalog already grouped them ("Powers · Unlisted"); the library
      now matches. tsc + eslint clean; full dnd suite green (2118).
- [ ] **IGP3 — Missing 26 power effect texts:** these still need Brendan's verbatim text (Ground Rule 2 — never
      invented). Owner may paste them; until then they render with the honest WIP marker. *(Not blocked on me
      inventing — blocked on the source text.)*

### Area ART — IG race art (owner drew it; licensed) — extends the shipped gallery
- [ ] **ART1 — Import all available race portraits** the owner drew from Brendan's site into
      `public/dnd/intuitive-games/ancestries/`, manifested in `art.ts`, credited "Art · <owner> (Intuitive
      Games)". (8 already shipped in A20; add any remaining that exist.)
- [ ] **ART2 — Frame each race with its character art** on the IG library Ancestries section + the IG sheet
      ancestry panel; a race whose art is not yet available degrades gracefully (no broken frame).
- [ ] **ART3 — Tests:** each manifested art file exists; the gallery renders the credited frames.

### Area MOB — Mobile responsiveness (HIGH PRIORITY — runs in parallel; owner-reported)
The header and many elements don't work on phones. Make the library, ALL character sheets, login, character
building, campaign control, and every page look and work well on mobile as well as desktop.

- [x] **MOB1 — Responsive header (first).** ✅ SHIPPED — `DndHeader.tsx` now wraps the nav in a native
      `<details>`/`<summary>` (stays a server component, zero client JS). Desktop: the summary/hamburger is
      `display:none` and the nav shows inline as before. Mobile (≤640px): the nav collapses behind a
      "☰ {name}" toggle that opens a right-anchored dropdown, so the signed-in name is visible without
      opening and Log out sits one tap inside; the centered brand drops its diamond clusters + shrinks so it
      can't collide with the back button/toggle. **Verified in a real browser at 1200px and 375px** — desktop
      nav visible with `<details>` closed (author `display:flex` overrides the UA closed-hide), mobile shows
      the toggle + hidden nav, open reveals the dropdown. Guarded by `header-responsive.test.ts`.
- [ ] **MOB2 — Library page mobile pass.** Tables/section grids/galleries reflow + scroll within their own
      container (no page-level horizontal scroll); tap targets sized for touch.
- [x] **MOB2b — Collapsible library sections (owner 2026-07-18).** ✅ SHIPPED — every system-library section
      in `app/dnd/library/[key]/page.tsx` is now a native `<details>`/`<summary>` accordion, **all default
      CLOSED** (no `open` attr), so the page opens as a scannable list of section headers you expand on demand.
      Native HTML → no-JS, accessible, keyboard-toggleable, mobile-friendly. Guarded by
      `library-collapsible.test.ts`. NEXT (owner 2026-07-17 follow-up): per-ENTRY expansion *within* a section
      (a race/feat shows a brief line, expands to full detail) — needs the section data model to carry
      per-entry brief+detail; tracked as MOB2c below.
- [x] **MOB2c — Per-entry expand within a section (owner 2026-07-17).** ✅ SHIPPED (pattern) — added a
      `LibraryEntry { name; brief?; detail }` shape + optional `entries` on `LibrarySection`, rendered as
      nested default-closed `<details>` inside the section `<details>` (name/brief on the summary, full
      Rich-formatted detail on expand). First real migration: **IG Conditions** — the 18-row effect table is
      now 18 individually-expandable entries (scannable name list → tap for full effect; the effect text still
      reaches the AI via the digest). Guarded by `library.test.ts` (conditions = `entries`, 18, full text) +
      the two completeness predicates now count `entries`. NEXT (MOB2d): migrate the remaining wall-of-text
      sections to `entries` the same way — ancestries (name + trait detail), feats, stances, powers.
- [x] **MOB2d — Migrate remaining rich sections to per-entry collapsibles.** ✅ SHIPPED — the five worst
      walls-of-text on the IG page are now per-entry `entries` (scannable name list → tap to expand):
      **Ancestries** (trait names as the brief → full trait text; portrait gallery kept), **Feats** (all
      151 General+Combat — prerequisite as the brief → category+effect), **Stances** (Basic/Advanced folded
      into the detail), **Powers & Spells** (school as the brief → effect; roster body kept), and **Defensive
      Powers**. Search + AI grounding unaffected (they read the underlying content, not the section shape) —
      full dnd suite green (1913). Guarded by the updated `library.test.ts` assertions (each section renders
      `entries`, table undefined, content preserved). REMAINING walls (PF2 spell table, class tables) are
      already their own `<details>` or genuinely tabular — left as tables deliberately.
- [ ] **MOB3 — Character sheets (5e + IG + PF2) mobile pass.** The multi-column sheet stacks legibly; the
      dice tray / roller is reachable; editors + pickers usable one-handed.
- [ ] **MOB4 — Login + character builder + campaign control mobile pass.** Forms, steps, and controls fit and
      are usable on a phone.
- [ ] **MOB5 — Global sweep.** A responsive audit of remaining pages; relative units, flex/grid, `max-width`
      on media, `overflow-x: auto` on wide content; a shared set of breakpoints/utilities.
- [ ] **MOB6 — Tests / visual:** source-anchored guards for the header structure (menu/user/logout present,
      no fixed desktop-only widths); visual confirmation is in-app.

### Area PL — 3D planets (map studio) — sun-angle is fine per owner
- [ ] **PL1 — Surface / city lights.** Emissive night-side city-light layer on the 3D planet models
      (procedural or texture), visible on the dark hemisphere.
- [ ] **PL2 — Destroyed / dead planet meshes.** Replace the "hole = cylinder clipping through" hack with a
      real modeled hole (boolean/carved geometry + interior walls) and improve the partially-destroyed/dead
      planet meshes + polygons toward realism (craters, exposed core, debris).
- [ ] **PL3 — Tests / visual:** geometry-builder units where feasible; visual polish is in-app.

---

## Sequencing
**MOB (mobile — high priority, interleaved from the start since it's owner-reported and affects everything
already shipped) alongside: P (preferences foundation) → M + E + R (mechanics, equip, roller — all read P) →
D (dice skins/animation) → T (IG taxonomy) → H (homebrew + creation) → IGP + ART (IG content/art) → PL
(planets).** P first among the feature areas because the
auto-mechanics toggle, exhaustion/long-rest models, and equip toggle all hang off it. Within each area, ship
the smallest meaningful slice, verify (typecheck+lint+test), commit, push, annotate here. Deferred/gated bits
(Brendan's 26 power texts; visual confirmation of dice animation / planet meshes) are recorded honestly, not
faked.

## Not-in-scope-yet (owner deferred)
- Building a full character per system for QA ("we'll test that later" — the B8 walkthrough).
