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
- [ ] **P2 — Persistence + hooks.** Store campaign prefs on the campaign row and player prefs on the
      character/user; a `useEffectivePreferences()` hook the sheets/rollers consume. Live-DB schema via seeds.
- [ ] **P3 — Player preferences page.** UI to set a player's own prefs (only where the DM hasn't locked them);
      locked settings show the DM's value, disabled, with "set by your DM".
- [ ] **P4 — DM / campaign preferences page.** Comprehensive: the DM sets every campaign-wide mechanic +
      which settings players may self-choose vs. are locked. Everything a player pref can be, the DM can force.
- [ ] **P5 — Tests:** the resolver clamps player→DM correctly; a locked DM setting can't be overridden;
      defaults are the vanilla model for every system.

### Area M — Configurable mechanics (depends on P)
Make the mechanics the prefs name actually swappable, VANILLA BY DEFAULT.

- [ ] **M1 — Exhaustion model selector.** `rollCheck`/speed read the effective `exhaustionModel`: default the
      correct-per-edition vanilla (2024 flat −2/level; **2014 the real tiered table**), plus the popular
      flat-−2/level option for systems that want it. (Resolves `BLOCKERS §A` exhaustion + the 2014-tiered gap.)
- [ ] **M2 — Long-rest model selector.** Default vanilla per edition; options: RAW-half hit dice, gritty
      realism, epic (short), etc. Pure `planLongRest(state, model)` + the store wires it.
- [ ] **M3 — Rage & other class mechanics** as they come up — same pattern (vanilla default + options).
- [ ] **M4 — Tests:** each model's numbers are golden-pinned; switching the pref changes the result; the
      default is vanilla.

### Area E — Equip rules, live + toggleable (depends on P; `canEquip` already built + tested)
- [ ] **E1 — Wire `canEquip`/`equipChecked` into the LIVE equip paths** (the `ItemBuilder` "Equipped"
      checkbox + the AI `equip_item`), gated on `equipLimits === 'enforced'`. Refuse-with-reason UX (surface
      the `canEquip` reason), not a silent no-op. (Resolves the `equip-enforcement-gap` + `BLOCKERS §A`.)
- [ ] **E2 — Toggle:** `equipLimits: off` skips the check entirely (the panel still shows the truth).
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
- [ ] **D1 — Style system.** A pluggable dice-roller theme (the existing "futuristic" is style #1) chosen per
      system via the `diceRollerStyle` pref. Add **rugged**, **natural**, **fantasy**, **medieval** themes.
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

- [ ] **MOB1 — Responsive header (first).** Collapse the nav into a mobile dropdown/hamburger menu; show the
      signed-in user's name and a working log-out; no overflow/overlap on narrow widths. Keep the desktop
      header intact.
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
- [ ] **MOB2d — Migrate remaining rich sections to per-entry collapsibles.** Reuse the MOB2c `entries` shape
      for ancestries (name → full trait text + `brief` teaser), feats-general/combat, stances, and powers/
      spells across all systems, so every long section is a scannable expandable list, not a wall of text.
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
