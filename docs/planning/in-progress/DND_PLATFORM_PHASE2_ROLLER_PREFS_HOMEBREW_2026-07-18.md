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

- [ ] **M1 — Exhaustion model selector.** `rollCheck`/speed read the effective `exhaustionModel`: default the
      correct-per-edition vanilla (2024 flat −2/level; **2014 the real tiered table**), plus the popular
      flat-−2/level option for systems that want it. (Resolves `BLOCKERS §A` exhaustion + the 2014-tiered gap.)
- [x] **M2 — Long-rest model selector.** ✅ SHIPPED — pure `hitDiceAfterLongRest(total, remaining, model)`
      in `lib/dnd/mechanics/long-rest.ts` (vanilla=full restore, half-hit-dice=2014 RAW half+min1, gritty/epic
      = amount unchanged), golden-pinned by `mechanics-long-rest.test.ts`. Wired into the sheet store's
      `longRest`. **Established the preferences seam:** `CharacterProvider` now takes an optional resolved
      `preferences?: EffectivePreferences` prop, defaulting to the full VANILLA set — the single place every
      swappable mechanic (exhaustion, dice style, record mode, equip) will read. Behavior-preserving today
      (no prop passed anywhere yet → vanilla → full restore); full dnd suite green (1930). REMAINING for M2:
      pass the real effective preferences into `CharacterProvider` once P2c resolves them at the sheet's
      mount (currently every caller omits the prop → vanilla).
- [ ] **M3 — Rage & other class mechanics** as they come up — same pattern (vanilla default + options).
- [ ] **M4 — Tests:** each model's numbers are golden-pinned; switching the pref changes the result; the
      default is vanilla.

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
- [ ] **E1b — Conflict dialog + wiring.** The popup component (Cancel + per-conflict swap), shown from the live
      equip toggle (`ItemBuilder` "Equipped" + inventory equip) when `equipLimits === 'enforced'` and conflicts
      exist; wire the AI `equip_item` path to the same core.
- [ ] **E2 — Toggle:** `equipLimits: off` skips the check entirely (equip freely; the panel still shows truth).
- [ ] **E3 — Tests:** update the `equip-enforcement-gap` tracker → the live paths now enforce when on, allow
      when off.

### Area R — In-app roller for the bespoke sheets (PF2 + IG) (depends on P for the auto-toggle)
- [ ] **R1 — Roll engines wired.** A shared roll surface for PF2 (`pf2Degree`/`pf2AttackBonus`/…) and IG
      (`igResolveAttack`/`igConditionSummary`/`igStanceMechanicNote`/`igDegreeOfSuccess`), so tapping a
      check/save/attack/skill on the bespoke sheet rolls it in-app with the mechanics folded in.
- [ ] **R2 — Auto-mechanics toggle.** When on, active conditions/stances/exhaustion fold into every roll;
      when off, the sheet shows the modifiers but the player applies them. Reads the `autoMechanics` pref.
- [ ] **R3 — Manual roll input.** Enter a d20/dice result by hand; the sheet folds the character's modifiers.
- [ ] **R4 — Manual stat / direct edit.** Already exists for 5e; ensure the bespoke sheets can be directly
      edited (stats/HP/etc.) — parity.
- [ ] **R5 — Record an IRL roll.** Log a roll the player made physically (result + what it was for) to the
      roll history without the app rolling it. Feeds the same log/undo.
- [ ] **R6 — Tests:** each mode produces the right logged entry; auto-toggle changes whether mechanics fold.

### Area D — Dice roller interfaces & styles (depends on R)
- [x] **D1 — Style system.** ✅ SHIPPED — the dice tray's look is now driven by `preferences.diceRollerStyle`.
      The store exposes the effective preferences in its context; `DiceTray` stamps `data-dice-style` on the
      tray + minimized FAB; `theme.css` themes all four new looks (**rugged**, **natural**, **fantasy**,
      **medieval**) by re-skinning the frame/header/title, with **futuristic** as the default base look (no
      override). Guarded by `dice-style.test.ts`; the contrast guard exempts `[data-dice-style]` (a bespoke
      look like a `.skin-*`). Full suite green (1942). REMAINING D2 (animated 3D tumbling dice) is separate.
- [ ] **D2 — Animated 3D dice tray.** Real dice-rolling animation (d20/dice tumbling in a tray) — a canvas/
      WebGL or CSS-3D roller. Themeable per D1. Falls back to a static roll on reduced-motion / no-WebGL.
- [ ] **D3 — Tests / visual:** the pure roll result is unchanged by the skin (source-anchored); visual polish
      is in-app.

### Area T — IG class taxonomy (bounded data restructure)
- [ ] **T1 — Restructure to the site's real taxonomy:** 4 parent classes (Archon / Conduit / Fighter /
      Wizard) each with subclasses (Archon → Beastmaster/Eldritch Binder/Packmaster/Summoner; Conduit →
      Druid/Shifter/Witch; Fighter → Champion/Freebooter/Marksman/Sohei; Wizard → Arcanist/Magician/Shaman),
      replacing the flat 13-class list. Update `content.ts` class data, the IG builder, provenance, grounding,
      library. (Resolves `BLOCKERS §A` taxonomy + IG doc A10/B2.)
- [ ] **T2 — Tests:** the taxonomy is golden-pinned to the site; the builder offers parent→subclass; no leak.

### Area H — Homebrew / custom / DLC / extras (per system) + content-creation system
This is the "form editor" the owner clarified: a full **create-and-share** system, plus a browse section.

- [ ] **H1 — Content model + store.** A `homebrew_content` model: a typed union over every content kind
      (weapon, item, potion, armor, spell, stance, effect, ability, skill, feat, race, class, subclass),
      each carrying its mechanical payload (reusing the existing `Effect`/attack/armor/etc. shapes), a
      `system` scope, a `creator` (attribution), and a visibility/approval state. Live-DB schema via seeds.
- [ ] **H2 — Custom section per system (browse + search + AI).** Every system's library gets a
      **Custom / Homebrew / Extras** section listing its homebrew, well-formatted, searchable (`searchLibrary`),
      and projected into the AI grounding (so the AI can explain + use it). Seed with **Rangor (race)** +
      **Pugilist (class)** from Jack's existing hand-authored data.
- [ ] **H3 — Creation UI.** Build-and-post forms for each content kind (reusing the effect builder / item
      builder / attack builder / weapon+armor builders), attributed to the creator on save.
- [ ] **H4 — Use-on-character + DM gating.** A character can adopt a homebrew element **iff the DM allows it**
      (a campaign allowlist / approval), threaded through the same provenance + `getCharacterAccess` path.
- [ ] **H5 — Tests:** a posted item round-trips to real effects the ledger resolves; attribution persists;
      the DM gate blocks a disallowed element; searchable + grounded.

### Area IGP — IG power effect texts (content; hook up what exists, flag Brendan's gap)
- [ ] **IGP1 — Hook up every power with effect text** end-to-end (already largely done: grounding + library +
      sheet). Ensure the full `IG_SPELL_ROSTER` is offered everywhere with WIP markers where text is pending.
- [ ] **IGP2 — The 9 off-roster powers:** owner delegated the decision — plan: keep them under a clearly
      labeled **"Powers · not on the current site roster"** subsection (attributed as such) rather than
      dropping them, so nothing Jack's characters use silently disappears; reconcile if the site adds/renames.
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
