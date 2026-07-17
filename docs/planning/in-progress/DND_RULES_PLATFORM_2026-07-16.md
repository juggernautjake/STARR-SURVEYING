# D&D Rules Platform — full buildout

**Status:** IN PROGRESS · started 2026-07-16
**Goal:** every supported game system fully written out, searchable, AI-explainable, and wired
into the character sheets — so a player or DM can build a character to level 20 exactly as the
system's designers intended, look any rule up instantly, and ask the AI how it applies in a
specific situation. Homebrew is a first-class citizen throughout.

Work in **slices**, in order. Each slice ends green: `npx tsc --noEmit`, `npx vitest run
__tests__/dnd`, `npx eslint`, and — for anything with a UI — **driven in the running app**, not
just unit-tested. Commit per slice. Do not mark a slice done with failing tests or an unverified
UI.

> **⏸ STATUS (2026-07-17): the vast majority of slices are ✅ SHIPPED.** The remaining open items are NOT
> unattended-buildable — each needs one of: **an owner product decision** (Rangor/Pugilist as a real custom
> class; setting the demo characters' system `ambiguous`→`dnd5e-2024`, a live-DB write); an **absent
> `VOYAGE_API_KEY`** (Slice 8 semantic search — keyword search is the working fallback); or **specialized UI
> needing visual verification** (Slice 29/35 map-studio 3D controls + the city-lights day/night design call;
> Slice 39 player-console drawer; Slice 18 transform polish). Recent unattended progress: **Slice 37**
> browser-Back history-pollution fixed (`JumpNav`); **Slice 8b** IG library massively expanded (see
> `INTUITIVE_GAMES_FULL_BUILDOUT_2026-07-17.md`); and the previously-**untested map studio** gained regression
> guards for its four documented fixes (cloud-field translation, image handles, 2D/3D size parity, canvas
> sizing). No open item can move this doc to `completed/` without the owner.

---

## Ground rules (these are why the platform exists — do not violate them)

1. **A system's rules never leak into another system.** The same word means different things in
   different games (a Blades "score" is a heist; PF2's Frightened is numeric, 5e's is binary; a 5e
   proficiency bonus is not PF2's level-added proficiency). Everything is keyed by system.
2. **Editions are different systems.** 2014 vs 2024 Exhaustion, Surprise, Grappled, Prone,
   Inspiration and feats all have two different *correct* answers. Never merge them.
   *(Known tracked violation, surfaced 2026-07-17: the sheet's roll-time exhaustion applies the 2024
   flat −2/level model to EVERY character, including 2014 ones, whose exhaustion is a different tiered
   table — the AI grounding already distinguishes them, so only the sheet merges them. The fix is a
   player-facing behavior change → owner-gated (BLOCKERS §A); pinned meanwhile by `exhaustion-d20.test.ts`
   so it can't drift further or be mistaken for edition-correct.)*
3. **Never invent a rule.** If the reference doesn't cover it, say so. Accuracy beats completeness
   — omit a number rather than guess. (Authoring agents have already caught several errors in
   briefs by verifying against sources instead of recall — keep doing that.)
4. **Custom content is the same shape as official content.** A homebrew class is a
   `ClassDefinition`; it levels through the same engine and is checked by the same validator.
5. **No hardcoded palette values in the shared sheet.** Use theme tokens
   (`var(--ink)`, `rgba(var(--hotpink-rgb), .2)`). The base stylesheet was originally one
   character's dark neon sheet; every literal left in it breaks the light skins.
6. **A character can't level past a choice it hasn't made** (`lib/dnd/classes/levelup.ts`).

---

## What is already built (do not redo)

- **10 systems** in `lib/dnd/systems.ts` + `lib/dnd/system-rules.ts` / `system-rules-extra.ts`:
  D&D 5e 2014, D&D 5e 2024, Pathfinder 2e, Pathfinder 1e, Starfinder 1e, Call of Cthulhu 7e,
  Blades in the Dark, Cyberpunk RED, Shadowrun 6e, Intuitive Games.
- **415 glossary terms** across 9 systems (`lib/dnd/glossary/`) — full articles, not stubs.
- **D&D 5e 2024 classes, complete**: all 12, level 1–20, 48 subclasses (`lib/dnd/classes/dnd5e-2024/`).
- **Class engine** (`lib/dnd/classes/engine.ts`), shared slot tables (`slots.ts`), custom-class
  builder + DM review (`custom.ts`), level-up gate (`levelup.ts`), registry (`registry.ts`).
- **Library**: `/dnd/library` (index) + `/dnd/library/[key]` (per-system, fully written out),
  keyword search that works with no embeddings key, and a system-focused AI chat with
  cross-system detection (`lib/dnd/system-detect.ts`).
- **Level builder**: `/dnd/characters/[id]/levels` + its API; the sheet's `+/-` stepper is gone,
  replaced by **Manage Levels**.
- **Seeds are idempotent** (010/020 fixed); 258/268 apply; 445 registers the new systems.

---

## Slice 1 — Sheet contrast: finish the sweep ✅ SHIPPED 2026-07-16

The base stylesheet still has hardcoded colours that break on light skins. Several rounds of this
have already landed; this slice is to finish it and make regressions impossible.

- [x] Audit **every** `color: #fff` / hardcoded hex / `rgba(<literal>)` left in
      `app/dnd/_sheet/styles/theme.css` outside the `.skin-*` blocks and the token block. For each,
      decide: theme token (panel text ⇒ `var(--ink)`, accent text ⇒ the accent token) or genuinely
      on a solid dark fill (leave, and comment why).
- [x] Same audit for **inline styles in components** (`app/dnd/_sheet/components/*.tsx`) — CSS
      tests can't see these. `RollStage.tsx` and `CharacterGallery.tsx` are known offenders.
- [x] Extend `__tests__/dnd/sheet-contrast.test.ts`: assert the base stylesheet contains **no**
      hardcoded `color: #fff` outside `.skin-*`/`::selection`/`.stream-*`, so this can't regress.
- [x] Drive each skin in the app (Jack=rulebook, Susie=streamer, Sarah=donata, Lazzuh=neon,
      a default Hextech character) and read every tab.

**Completion note (2026-07-16).** Measured contrast in the BROWSER for every text node on every
tab of all four characters, compositing each translucent tint over its ancestors — not by reading
CSS. Two false starts worth recording so nobody repeats them:

* a naive walk compared text against its own `rgba()` tint and reported 1.0 for same-hue text;
* `backgroundColor` is transparent for gradient-painted elements, so measuring "through" a
  gradient produced 168 bogus failures on Sarah's skin. The scan now skips what it can't measure.

Fixed, all found by measuring rather than by grep:

* **A global leak, not a sheet bug:** the marketing site's `globals.css` sets a bare
  `p { color: var(--text-secondary) }` (#4B5563). Every unclassed paragraph in the sheet — bio
  prose, feature text — rendered mid-grey: **2.54:1** on Lazzuh's near-black card. Fixed with a
  `.dnd-sheet p { color: inherit }` reset at the sheet boundary.
* **White-on-white:** `.skin-donata .tray-dice .btn.solid` set `color: #fff` but inherited
  `background: #fff` from the rule above it, so "Flat d20" was invisible on Sarah's sheet.
* **`pink` is not just a fill.** All three light skins documented `pink` as "a background fill",
  but `.apill.primary .am` renders it as the PRIMARY ability's modifier — so it was 2.79–2.86:1
  on Jack's, Sarah's and Susie's sheets. Same root cause, three themes.
* Susie's `tealbright` was commented "a deep gold that stays legible on the light panels"; it
  measured **2.86:1**. Deepened, along with the other text-bearing accents on all three light
  themes (each retuned by iterating against the browser measurement, not by eye).
* Remaining shared-CSS literals themed: `select option` text, the fumble/crit stage animations,
  `.rv-flag.crit`, `.apill .asc`, `.inline-edit`, `.tab.on`, plus `RollStage`'s idle colour and
  two `CharacterGallery` badges.

**Result:** Jack, Lazzuh and Sarah measure **0 contrast failures** across every tab. The two
`#fff` left in components are correct (a solid accent fill; a fixed dark lightbox scrim) and are
now commented as such.

**Deferred — Susie's fake-Twitch chat badges (VIP magenta `#e005b9`, MOD green `#00ad03`, white
letter, 3.0–4.3:1).** These deliberately replicate Twitch's real badge colours inside an in-fiction
Twitch clone; the meaning is carried by their `title`, and they are decorative single letters, not
rules text. Restyling them would break the thing they exist to imitate. Rationale: authenticity of
a fictional UI outweighs AA on a decorative badge.

**Regression guard:** `sheet-contrast.test.ts` now fails the build on ANY hardcoded text colour in
the shared sheet, naming the line and selector. Verified it actually fails by injecting a
violation, then restoring.

## Slice 2 — Clickable rules on the sheet ✅ SHIPPED 2026-07-16

Everything on a sheet that names a rule should open its explanation.

- [x] `RuleTip` component: wraps a term, opens a popover with the glossary article
      (`findTerm(system, term)`), with **See also** links and an **Ask the AI** fallback.
- [x] Auto-link feature/feat/condition/attack bodies via `termsMentionedIn(system, text)`
      — longest match wins, never inside a longer word.
- [x] Conditions in `ConditionTracker`, traits in `CombatPanel`, features in `Features`.
- [x] For a term with no glossary entry (homebrew), the popover says so and offers
      "Ask the librarian", pre-filled and focused on the character's system.

**Completion note (2026-07-16).** The sheet did not know its own system, so this slice starts by
plumbing it: page → `SheetRoot` → `App` → `SheetConfigProvider` (which already carried the
sheet_type config). `useSheetSystem()` exposes it, and the sheet root now carries `data-system`
so the ruleset is visible in the DOM. **A character with no system gets NO auto-links** — we don't
know which rulebook its words belong to, and linking to another system's article would be worse
than linking to nothing.

Verified in the app on Jack: **38 rule links** on his Features tab; clicking "AC" opens the real
*Armor Class (AC)* article (543 chars) with See-also links and a pre-filled, system-scoped
"Ask the librarian" link.

Two real bugs found by driving it, both invisible to unit tests:

* **Markdown was being torn apart.** The first `RichRules` split the raw string on term
  boundaries and ran `md()` over the slices, so a `**bold**` span containing a term rendered with
  its asterisks showing ("**not wearing armor**"). It now tokenizes markdown FIRST and links terms
  inside each token, so bold text stays bold and still links.
* **Invalid HTML nesting.** The popover rendered `<div>`/`<p>` inside a `<span>` inside the
  feature's `<p>`. HTML forbids that: the browser force-closes the paragraph, which physically
  tears the surrounding text out of its element (and triggers a hydration error). The popover is
  now inline-safe markup — all `<span>`, block-displayed via CSS. **Worth remembering: this is a
  likely cause of "text not contained in its element" reports elsewhere.**

Also fixed in passing: `ConditionTracker` hardcoded the 5e condition list for **every** system —
it offered "Paralyzed" to a Call of Cthulhu investigator and hid PF2's numeric conditions. It now
reads `systemConditions(system)`, falling back to a generic list only for a system-less character.

**Deferred to Slice 3:** attack notes and level-builder features aren't linked yet — the level
builder renders server-side outside the sheet's provider, so it needs its own system context.
That's cheaper to do alongside Slice 3's character-context work than to bolt on here.

## Slice 2b — Sheet layout + gallery upload ✅ SHIPPED 2026-07-16

Reported while Slice 2 was in flight.


- [x] **Hit Points, reformatted.** The Damage/amount/Heal row and the Temp HP row were plain flex
      rows mixing `.btn`, `.step` and bare `<input>`, each with its own padding and border — so the
      inputs floated off the buttons' baseline. Every control in those rows now shares one height
      (`--hp-ctl-h`), number spinners are suppressed (they pulled digits off-centre), and Death
      Saves' SAVE/FAIL no longer drift to opposite edges. Verified in the browser: every control in
      each row reports an identical `top` and `height`. Applies to every skin — it's the shared sheet.
- [x] **Gallery upload.** The Gallery tab could list, promote and delete images but had no way to
      ADD one — it told you to "upload art or a token" with no button. Added a multi-file uploader
      (a new `gallery` kind on `POST /api/dnd/characters/[id]/media`, which points no character
      column) with per-file results, so one bad file doesn't fail the batch. Works for every
      existing, template and future/custom sheet, since it lives in the shared Gallery component.
- [x] **Hextech: the ART section label is misaligned.** ROOT CAUSE FOUND (2026-07-16). The skin's
      gold accent bar is `.skin-hextech .card::before` with `margin: -14px -16px 12px` — negative
      margins meant to bleed a 2px bar out to the card's edges. On a `display: flex` card (the ART
      uploader) that `::before` becomes a **flex item**, so its `-16px` left margin dragged the
      whole row out of the card's padding. The offsets were also hardcoded to a padding the cards
      don't have (base card is `20px 22px`, the ART card `12px 16px`), so the bar never reached the
      edges anyway. It's decoration → now `position: absolute` pinned to the top edge, out of
      layout entirely. Verified on the Hextech sheet: "ART //" now sits at its card's padding edge,
      matching every sibling.
- [x] Sweep the Hextech skin for other out-of-position / overflowing text. Measured every text node
      across all 8 tabs: **0 contrast failures, 0 overflowing elements.**
- [x] **DM controls**, all skins. ROOT CAUSE: four shared components pinned an **inline**
      `style={{ color: 'var(--gold)' }}` on their `.sec-num` label (`DmOverridePanel`,
      `AiSheetEdit`, `StreamControl`, `StreamOwnerControls`). An inline style beats every
      stylesheet rule, including a skin's — so on the candy skin, whose `.sec-num` is a filled
      magenta pill with white text, those labels painted dark bronze onto magenta. Exactly the
      reported "purplish background, brownish text". Removed the inline colours so each skin styles
      its own labels: candy now renders them white-on-pill at **5.87:1**, and the neutral skins
      inherit their own accent (Lazzuh 5.49:1) instead of the shared gold.

      Note this was invisible to the automated sweep — the pill is a gradient, and the scan skips
      what it can't measure. It took a screenshot to see. A new guard now fails the build on any
      inline `color` on a `.sec-num` (verified by injecting a violation).

## Slice 3 — AI situational adjudication ✅ SHIPPED 2026-07-16

The chat can already answer rules questions. It must also rule on *this character in this moment*.

- [x] Pass character context into `POST /api/dnd/library/chat` (already accepts `characterId`):
      load the sheet, build a digest (class, level, features, conditions, resources, gear).
      → `lib/dnd/character-digest.ts`. **Facts only, deliberately small**: no bio prose (not
      evidence for a ruling, and it burns the window), bodies trimmed to a reminder (the full text
      is already in the grounding block), nothing inferred. Features are filtered by `unlockLevel`
      so a level-7 sheet can never be ruled on as if it had its level-20 capstone.
- [x] Adjudication prompt: given the character + the grounded rules, answer questions like
      "can I cast this while grappled?", "does my feat apply here?", "what happens if I shove a
      creature two sizes larger?". It must reason to a ruling, cite the rule it used, and say
      plainly when the rules genuinely don't settle it (then suggest a DM call).
      → `adjudicationInstruction()`: ruling first, then why (citing the rule *and* the thing on
      the sheet it turns on), concede when the rules don't settle it, name what's missing when the
      character simply can't do the thing.
- [x] Mount the chat on the character sheet with the character's system pinned.
      → `app/dnd/characters/[id]/page.tsx`. The route **re-checks access itself** (`getCharacterAccess`)
      — a chat endpoint must not become a way to read a sheet you can't open — and the *character's*
      system overrides the client's focus, since a ruling for this sheet must use this sheet's rulebook.
- [x] Tests: the prompt carries the character digest; the cross-system hint still fires; the
      chat refuses to invent a rule. → `__tests__/dnd/character-digest.test.ts` (11 tests).

**Done when:** on Jack's sheet you can ask "can I use Cross Counter while grappled?" and get a
grounded, character-aware answer.

**Note — the absence of a fact is a fact.** `CONDITIONS: none` is stated explicitly rather than
left implicit: a model reading silence about conditions will happily assume whichever answer it
already wanted. Same reasoning behind `(+N more not listed)` — a silent truncation reads to the
model as "this is the complete list", which is exactly how a ruling ends up ignoring a feature.

## Slice 4 — 5e 2024: feats, backgrounds, species, languages ✅ SHIPPED 2026-07-16 (species→live-numbers is a follow-up)

The classes are done; the rest of character creation is not.

**Feats scaffold + the Origin category ✅ SHIPPED (commit pending).** `lib/dnd/feats/dnd5e-2024.ts`
now defines the shared `Feat` shape (category, prerequisites, `abilityIncrease`, grants, full benefit
text) and the **complete 10-feat Origin category** — Alert, Crafter, Healer, Lucky, Magic Initiate,
Musician, Savage Attacker, Skilled, Tavern Brawler, Tough — each with full PHB rules text, plus
`featsByCategory` / `findFeat` / `featGrantsAbilityIncrease` helpers. The 2024 trap is baked into the
type and the tests: **Origin feats carry NO `abilityIncrease`** (the +1 lives only on General/Epic
feats), and `feats.test.ts` (7) asserts exactly the invariant the slice names — "no feat grants an
ability increase it shouldn't" — plus no-prerequisites, full-list coverage, no-stub text, unique keys,
and repeatability flags. General / Epic Boon categories, and the level-builder wiring,
are the remaining bullets below.

**Fighting Style category ✅ SHIPPED (commit pending).** All ten 2024 Fighting Style feats (Archery,
Blind Fighting, Defense, Dueling, Great Weapon Fighting, Interception, Protection, Thrown Weapon
Fighting, Two-Weapon Fighting, Unarmed Fighting) with full rules text. This is the **second no-ASI
category**, so the invariant now generalises: `NO_ASI_CATEGORIES = ['origin', 'fighting-style']` and
`feats.test.ts` asserts no feat in ANY exempt category carries an ability increase — the guard no
longer depends on which specific feats exist. Tests: `feats.test.ts` (10 total, +3). General (the +1
categories) and Epic Boon remain.

- [x] **Feats** as structured data (`lib/dnd/feats/dnd5e-2024.ts`) — **all four categories present** ✅:
      Origin (10, complete), Fighting Style (10, complete), General (starter set — the +1, minLevel 4,
      ability/spellcasting prerequisites; the full ~45 fill in later), and **Epic Boon ✅ SHIPPED (commit
      pending)** — all ten 2024 Epic Boons (Combat Prowess, Dimensional Travel, Energy Resistance, Fate,
      Irresistible Offense, Recovery, Skill, Spell Recall, Night Spirit, Truesight), each with the
      standardized **+1 ability increase to a max of 30** (above the normal cap) and its signature
      capstone effect, gated to level 19 by `featEligibility`. Tests: `feat-eligibility.test.ts` (level-19
      gate + to-30 increase + never-at-level-4). *Epic Boon benefit wording is concise and captures each
      boon's signature effect — flagged with the doc's other "uncertain rules" to verify against the PHB
      before release; the category/gate/ability-cap are the load-bearing parts.*
- [x] **Rules-legal feat granting ✅ SHIPPED (commit pending)** — per the user's directive that builders
      only allow what the rules permit unless explicitly custom. `lib/dnd/feats/eligibility.ts`
      (`featEligibility` / `eligibleFeats` / `validateFeatKey`) gates a feat by SLOT (Origin only in a
      background/origin slot, Fighting Style only from a class feature, General/Epic only at an ASI
      slot), minLevel, ability + `needs` prerequisites, and repeatability. Wired into `validateChoice`
      (levelup.ts) and the `/levels` API (now passing `abilities` + `takenFeatKeys` + spellcasting).
      The level builder's ASI feat picker (`LevelBuilder.tsx`) is now a **filtered dropdown** of only
      the legal General/Epic feats (level-gated, prereq shown) with a **"✎ Custom feat…"** escape hatch
      — replacing the old free-text box that accepted any feat. Unknown keys pass as custom/homebrew.
      Tests: `feat-eligibility.test.ts` (14) + updated `levelup.test.ts` (Origin-feat-at-ASI now
      rejected; prereqs enforced; unknown = custom). See the `feedback_rules_legal_builders` memory.
      **Audit 2026-07-17:** re-read `featEligibility` end-to-end — the slot→category gate, epic-boon-@19,
      all three prereq types (minLevel/ability/needs, conservative-block on missing ability context), and
      the unknown-key custom escape hatch are all correct and comprehensively covered. Added one missing
      DATA-invariant guard: every Origin feat is now asserted to carry NO `minLevel` prereq — one would make
      it silently un-offerable at the level-1 origin slot, and only `alert` was spot-checked. All 16 clean.
      `feat-eligibility.test.ts` +1.
- [x] **Backgrounds** (16) ✅ SHIPPED (commit pending) — `lib/dnd/backgrounds/dnd5e-2024.ts`. All
      sixteen PHB backgrounds (Acolyte … Wayfarer), each with its three ability options (the 2024 rule
      that the **background** carries the increases, not the species — encoded and tested), Origin feat,
      two skills, one tool, and the "Choose A or B" equipment line. Magic Initiate backgrounds name
      their spell list (Acolyte→divine, Guide→primal, Sage→arcane). The feats refactor made Magic
      Initiate one generic feat so backgrounds reference it with a list. Tests: `backgrounds.test.ts`
      (5) — 16-with-unique-keys, **every background's Origin feat resolves in the feats data** (the
      invariant the slice names, now real because the feats shipped first), 3-distinct-abilities,
      2-valid-skills+1-tool, and the Magic-Initiate spell-list check.
- [x] **Species** (10) ✅ SHIPPED (commit pending) — `lib/dnd/species/dnd5e-2024.ts`. All ten PHB
      species (Aasimar, Dragonborn, Dwarf, Elf, Gnome, Goliath, Halfling, Human, Orc, Tiefling) with
      creature type, size, speed, darkvision, lineage choices, and named traits (full text). **No
      ability score increases** — the `Species` type has no ability field and `species.test.ts` (4)
      asserts no species object carries one under ANY name (`abilityScores`/`asi`/`str`/… — the
      2014-vs-2024 trap made un-reintroducible). Spot-checks the distinctive numbers (dwarf/orc 120-ft
      darkvision, goliath 35 speed, halfling Small).
      **All 10 species' size/speed/darkvision golden-pinned (2026-07-17):** the spot-checks covered only a
      few; verified every species against 2024 RAW and pinned each — importantly the edition-specific
      changes a typo would most likely hit: Dwarf & Gnome speed 30 (up from 2014's 25), Dragonborn now HAS
      darkvision 60, Goliath 35, and `darkvision` undefined for the species without it (Goliath/Halfling/
      Human). All correct. `species.test.ts` +1.
- [x] **Languages** + tool proficiencies as lists ✅ SHIPPED (commit pending) —
      `lib/dnd/languages/dnd5e-2024.ts`. All 2024 languages with the Standard/Rare split (Primordial
      carries its Aquan/Auran/Ignan/Terran dialects) and all tools across the four families (Artisan's
      Tools ×17, Gaming Sets, Musical Instruments, standalone kits), with `languagesByRarity` /
      `toolsByFamily` / `isKnownTool` helpers. Tests: `languages.test.ts` (5) — including the connective
      check that **every background's named tool resolves** here (specific tool or category phrase), so
      a typo in either file fails the build. **Standard/Rare membership pinned EXACTLY (2026-07-17):** the
      split was spot-checked (Common/Draconic std, Abyssal/Undercommon rare); now the full 10-standard /
      9-rare lists are pinned, catching the 2024-specific tells a regression would hit — Orc is now STANDARD
      (Rare/different in 2014) and Common Sign Language is a new Standard entry. Correct.
- [~] Wire into the level builder: an ASI choice offers real feats with prerequisites checked ✅
      (see the rules-legal feat granting note above); character creation offers backgrounds/species —
      **species picker ✅ + background picker ✅ SHIPPED (commit pending)**. **Rules-legal
      background application core ✅ SHIPPED:** `lib/dnd/backgrounds/apply.ts`
      (`validateAbilityAssignment` / `backgroundGrants` / `applyAbilityIncreases`) enforces the 2024
      +2/+1-or-+1/+1/+1 spread across only the background's three abilities, and returns the feat +
      spell list + skills + tool it grants. Tests: `background-apply.test.ts` (8).
  - **Species picker on the sheet ✅ SHIPPED (commit pending).** For a 2024 sheet in edit mode, the
    Hero's species token is now a **dropdown of the 10 real species** (`SPECIES_2024`) with a
    **"✎ Custom…"** escape hatch (rules-legal-unless-explicitly-custom). Once the species matches a
    known one, the sheet shows a **traits panel** — creature type, size, walk speed, darkvision, and
    each named trait's text — so a vanilla build can SEE what the species grants. Tests:
    `species.test.ts` (+2 anchors).
  - **Species mechanics as LIVE numbers ✅ SHIPPED 2026-07-16 (the follow-up above, now closed).** A
    chosen 2024 species now flows through the effect ledger as a first-class **`species` source**
    (`lib/dnd/species/apply.ts` → `speciesEffects`): its **size** and **creature type** (identity
    sets), **darkvision** (a granted sense, "Darkvision 60 ft."), and **walk speed** all render on the
    Combat panel and appear in the Active Effects list sourced to the species — instead of being prose
    the reader applies by hand. **System-scoped by construction** (Ground Rule 1): the ledger gains a
    `ctx.system` and only adds the species source for a `dnd5e-2024` sheet whose species resolves in
    `SPECIES_2024` — an ambiguous/other-system sheet, or a homebrew species, contributes nothing (a
    coincident "elf" in another game is untouched). Walk speed is emitted **only when it differs from
    the stored base** (Goliath's 35 shows + stars; a 30-speed species stays silent) so no 2024 sheet
    gets a false "modified" star (the Slice 13 hazard). `system` is threaded `SheetRoot → CharacterProvider
    → buildLedger`. **Verified in the running app** (fresh `next dev`): a 2024 Elf renders Size Medium +
    Darkvision 60 ft. + a Species source; an ambiguous-system sheet shows none (leak-safety confirmed
    live). Tests: `species-live-numbers.test.ts` (9 — the ledger outputs the render reads, the false-star
    guard, and the no-leak gating). Class/species *feature* effects remain their own follow-up (a
    feature carrying `effects` already works; wiring each species' named traits to effects is separate).
  - **Background picker on the sheet ✅ SHIPPED (commit pending).** The Bio now has a 2024 **Background**
    card (distinct from the narrative `bio.background` prose): a dropdown of the 16 real backgrounds
    (`BACKGROUNDS_2024`) with a **"✎ Custom…"** escape hatch, storing `meta.background`. When a real one
    is chosen it shows exactly **what it grants** — the three ability options (assign +2/+1 or +1/+1/+1),
    the Origin feat (resolved to its name + spell list), skill proficiencies, tool, and equipment.
    Both creation pickers now mirror the feat picker's rules-legal-with-custom-escape shape.
  - **Spread application on the sheet ✅ SHIPPED 2026-07-16 (the final follow-up above, now closed).**
    The Background card now carries an **interactive spread chooser**: click each of the background's
    three abilities to cycle 0 → +1 → +2, then **Apply to sheet**. The button only enables on a legal
    2024 spread (validated live by `validateAbilityAssignment`; the error/preview is shown inline), and
    applying writes `char.abilities` through the new **`reconcileBackgroundIncreases`** core — which
    SUBTRACTS the previously-applied spread before ADDING the new one, so switching background or
    re-spreading is exactly reversible (the applied spread is remembered on `meta.backgroundAbilities`;
    `abilities` are running totals like ASIs, so it must be to be undone). Changing or clearing the
    background dropdown reverses its spread automatically; a **Clear** control undoes it by hand; a
    read-only viewer sees the applied increases as a plain "+2 STR, +1 CON" line. Deliberately UNCLAMPED
    so A→B→A is byte-identical (at creation the totals never approach 20). Tests:
    `background-apply.test.ts` (+4 — fresh apply, switch, round-trip exactness, clear-to-empty) and
    `backgrounds.test.ts` (+1 wiring anchor: the Bio applies the spread via the tested core, reversibly).
    ⚠️ Live browser drive of the picker was NOT performed this pass — the running preview server on
    :3000 is serving a stale build (its client bundle 404s, on-disk `.next` predates this edit), so the
    interactive click-through belongs to Slice 40's full-app QA. Core is fully unit-tested; tsc + eslint green.
- [x] Tests: no feat grants an ability increase it shouldn't (`feats.test.ts` — Origin + Fighting Style
      + the `NO_ASI_CATEGORIES` invariant); every background's feat exists (`backgrounds.test.ts`);
      species grant no ASIs, the 2014-vs-2024 trap (`species.test.ts`).

**Slice 4 status: ✅ COMPLETE for D&D 5e 2024** — feats (all four categories), backgrounds (16, with
rules-legal ability-spread application), species (10, with **live size/type/darkvision/speed through the
ledger**), languages + tools are all shipped and tested. The only remaining species nicety — wiring each
named species *trait* to a mechanical effect — is a separate feature (traits are authored prose today),
not a Slice-4 gap.

## AI full control over the character (requested 2026-07-17)

> "The AI should be able to have full control over every element and aspect of a player's character…
> add anything, remove anything… edit and change the html/css and hardcoded numbers and words for the
> character sheet and save it… totally revamp and restyle and reformat the character sheet."

Most of this is already built (Slices 14/17/20/23/32): the AI edits through `applySheetEdits` (a wide
op vocabulary — attacks, features, items/weapons/potions/armor with real effects, resources, tags,
abilities/combat/level/skills/saves) AND through `LAYOUT_EDIT_TOOL` it rewrites the character's
`custom_css` + `custom_layout` (HTML/CSS) and saves them (`sheet_type: 'custom'`), which the browser
renders. The one clear gap — spells — is now closed.

**Vocabulary↔handler drift guarded, both directions (2026-07-17):** audited that all 31 `SheetEdit` ops
are actually applied — an op the AI can EMIT but that `applySheetEdits` doesn't HANDLE would report
success while changing nothing (the AI's edit silently lost), directly breaking "the AI can edit
everything." No live gap (all 31 handled), but the switch had no exhaustiveness guard. Added a compile-time
`never` guard (a new union op without a handler now fails to compile) AND a source-scan test mirroring the
existing revert guard (every tool-schema op has an apply case) — so the AI's edit vocabulary and what the
sheet actually applies can never silently diverge. `sheet-edits.test.ts` +1. **Same guard applied to the
other two AI edit vocabularies (2026-07-17):** `applyIgEdit` (the IG stance/condition/feat/power/defensive-
power ops — `ig-edit.test.ts` +1) and `applyLayoutEdits` (the AI's HTML/CSS restyle vocabulary — set/append
CSS, add/remove/move/update block, retitle — `layout-edits.test.ts` +1). All three now carry a compile-time
`never` exhaustiveness guard + a tool-schema↔handler source-scan, so NONE of the three ways the AI changes
a sheet — mechanics, IG mechanics, or layout/style — can ever have an op that silently no-ops.
**Scoping boundary extended to all three vocabularies (2026-07-17):** the `assertCharacterScopedOps` guard
(`ai-scope.ts` — every AI op must be a character-sheet-scoped mutation, never reaching a page/campaign/map/
user/other character) was verified against `edit_sheet` and `customize_layout` but NOT the IG `edit_ig_sheet`
vocabulary — and `ai-scope.ts`'s own doc still claimed `edit_sheet` was "the only mutation tool" (stale since
the IG + layout tools shipped). Both fixed: `ai-scope.test.ts` now asserts ALL THREE vocabularies pass the
scoping check (all do — no live violation), and the boundary doc lists all three. So the security boundary
can't silently lapse for the IG or layout surface as it did in coverage. `ai-scope.test.ts` +1.

- [x] **`add_spell` / `remove_spell` ✅ SHIPPED 2026-07-17.** The AI could rename or item-grant spells but
      not add/remove them directly. Added both to the edit vocabulary + the AI tool schema (full spell
      shape: level 0–9, school, casting time, range, components, duration, concentration, ritual, attack
      vs save resolution, higher-level scaling). Upserts by name, clamps level, revertible. Matches the
      `add_`/`remove_` allow-list prefixes automatically. Tests: `sheet-edits.test.ts` +3.
- [x] Custom **classes/subclasses** as first-class AI ops ✅ — the Slice 5 homebrew builders make them
      exactly that (AI-drafted, engine-validated, saved, resolved in the level builder). Custom
      **conditions** ✅ — `add_condition`/`remove_condition` sheet-edit ops (`9376ec81`) let the AI apply/
      clear any named (incl. homebrew) condition on `combat.conditions`; richer per-condition mechanics
      remain expressible via the existing effect/`define_tag` vocabulary (no separate registry needed).

## Slice 5 — Custom class / subclass / feat builder UI

The engine (`lib/dnd/classes/custom.ts`) is built and tested; there is no UI.

- [x] `/dnd/characters/[id]/build/class` — define a class from scratch. **✅ SHIPPED** (`dadb68a5`,
      `d1facdbe`, `7fa1a665`, `253e42f9`): AI-assist endpoint → drafts + reviews via the existing engine;
      the page is a prompt box → "Draft with AI" → the built definition + features + the engine's review
      (errors red/block, warnings gold/advise) → **Save to my character** (persists, gated on a clean
      review) → the saved class **resolves in the level builder like an official one**. **Remaining (nice-
      to-have):** a manual field-by-field edit form on the draft (today you iterate by re-prompting).
- [x] **Homebrew subclass + homebrew feat builders. ✅ SHIPPED** (`1ceae899`, `f6ada419`, `656a256c`).
      All three designers ship as prompt→draft→review pages on the existing engine: `/build/feat`
      (`buildCustomFeat`+`reviewCustomFeat`) and `/build/subclass` (`buildCustomSubclass`, checks the
      parent class resolves incl. saved homebrew). **All three persist + resolve in the level builder**:
      class (`7fa1a665`/`253e42f9`), feat (`b03c65f7`/`20d93339` — shows in the ASI picker), subclass
      (`1da93c4a` — `subclassesFor(..., extra)` offers it under its parent class). **Nice-to-have
      remaining:** manual field-by-field edit forms on the drafts. **Save-route security guarded**
      (`68f2b10a`): the three `*/save` routes persist into a character's data, so they're write-gated
      (session 401 + `requireCharacterWrite`) and rebuild from PARSED input server-side (never trust a
      client-supplied built definition); `homebrew-save-access.test.ts` (6) pins both so a future edit
      can't drop the gate.
- [x] **AI assist: prose → a draft the player edits. ✅ SHIPPED** (`279e502f`). `lib/dnd/classes/custom-ai.ts`
      — `CUSTOM_CLASS_TOOL` (structured-output schema) + `parseCustomClassDraft` (defensive normalizer →
      a valid `CustomClassDraft`) that flows through the existing `buildCustomClass` + `reviewCustomClass`,
      so the AI proposes and the engine adjudicates/flags balance. 5 tests incl. the full round-trip.
      **Remaining for this item's UI:** the `/build/class` page wiring a prompt box to this.
- [x] **Persist to the character; flag as custom. ✅ SHIPPED** (`7fa1a665`). `homebrew-store.ts` (pure:
      upsert-by-key/remove/system-filter/read) + `Character.homebrewClasses` + a save endpoint that
      rebuilds+re-reviews server-side, rejects errors, upserts + persists (stamps author, flagged custom),
      and a Save button on `/build/class` (disabled while errors exist). 4+ tests.
- [x] **A custom class appears in the level builder like an official one. ✅ SHIPPED** (`253e42f9`). The
      levels route (which the LevelBuilder reads) passes `readHomebrewClasses(data)` to `findClass` as
      `extra` at both call sites, so a saved custom class walks a real level table. +1 test proving it
      resolves via extra and stays system-scoped (Ground Rule 1).

## Slice 6 — Full class data for the remaining systems

One system per slice — depth-first, verified against sources. In priority order:

- [x] **6a — D&D 5e 2014 ✅ COMPLETE** — all 12 PHB classes + the Artificer, L1–20, with every
      subclass. The 2014/2024 differences are locked by tests (subclass levels differ per class; ASI at
      19 not Epic Boon; no Weapon Mastery; Ranger's Favored Enemy/Natural Explorer; Ki not Focus; etc.).
      **Verified end-to-end in the running app 2026-07-16**: a 2014 Barbarian built through the real
      Manage Levels UI reports `classKnown: true`, and its level-3 subclass choice offers exactly the
      **2014** paths (Berserker, Totem Warrior) — the 2024 paths (Wild Heart/World Tree/Zealot) do NOT
      appear. This drives both the class-table render (the doc's "in the running app" bar) AND the
      cross-system integrity guard in the live builder, not just in unit tests.
      **Artificer multiclass rounding fixed (2026-07-17):** `multiclassCasterLevel` halved every `half`
      caster with `Math.floor` — correct for Paladin/Ranger but WRONG for the Artificer, the one 5e half
      caster whose multiclass levels round UP (ceil). Because Artificer shares `kind: 'half'`, the function
      couldn't tell them apart, so an Artificer at odd levels was under-counted by one caster level (an
      Artificer 3 gave caster level 1, not 2 — a missing spell slot when combined with another caster).
      Recorded the exception at the source (`spellcasting.roundHalfUp: true` on the Artificer def, a new
      optional `ClassSpellcasting` field) and taught `multiclassCasterLevel` to honor it via an optional
      per-part `roundUp`; Paladin/Ranger (no flag) still round down. Latent today (multiclass slot-merging
      isn't wired to the sheet yet) but the utility + its test enshrined the wrong rule; now RAW-correct.
      `class-engine.test.ts` +2 (ceil at odd levels; the Artificer def carries the flag, Ranger doesn't).
      **Slot tables pinned cell-by-cell against RAW (2026-07-17):** `FULL_CASTER_SLOTS` + `HALF_CASTER_SLOTS`
      (`slots.ts`) drive EVERY 5e caster (2014 + 2024). The existing tests guarded rank ARRIVAL levels + the
      L20 corner, but not the intermediate COUNTS — a typo like L11's rank-1 "3" instead of "4" would slip.
      Verified all 20 rows of both tables against the PHB and added a golden-reference guard for every cell
      (ranks 1–9 full; 1–5 half + "no rank 6+"), so a change to these shared tables must be intentional.
      Both matched RAW exactly (no bug — locks the data). `class-engine.test.ts` +2. **Warlock pact tables
      pinned too (2026-07-17):** `PACT_SLOTS` + `PACT_RANK` were spot-checked at the corners but their
      rank-TRANSITION levels (rank 2 at L3, 3 at L5, 4 at L7, 5 at L9) weren't, and `MYSTIC_ARCANUM_LEVEL`
      (ranks 6–9 at L11/13/15/17) was UNguarded — a typo there would hand the Warlock its capstone Arcanum at
      the wrong level. Golden-pinned all three against RAW (all correct). `class-engine.test.ts` +2. **Third
      caster (EK/AT) golden-pinned too (2026-07-17):** `THIRD_CASTER_SLOTS` was arrival-guarded but not
      cell-pinned; verified against the PHB (opens 2× rank-1 at L3, caps at rank 4 by L19) and pinned every
      level (ranks 1–4 + "no rank 5+"), all correct. `class-engine.test.ts` +1. Every 5e caster table (full /
      half / third / pact / arcanum) is now GENUINELY locked cell-by-cell. **Proficiency-bonus
      table pinned at EVERY level too (2026-07-17):** `PB_5E` (the +2→+6 progression behind every attack/save/
      skill) was tested at the tier corners, but `expectedProfBonus` reads it as a table lookup so an interior
      cell (L6/7/10/11/…) could drift. Pinned all 20 levels for both editions against the RAW formula
      `floor((level−1)/4)+2` — correct. `system-rules.test.ts` +1.
      **Per-class hit die pinned to RAW (2026-07-17):** every class's `hitDie` (drives max HP + the hit-dice
      pool) was validated only as "one of 6/8/10/12" — so a Barbarian typo'd to d10 or a Wizard to d8 would
      pass. Verified all 25 defs (12 classes ×2024 + 13 ×2014 incl. Artificer) against RAW and pinned each to
      its correct value (Barbarian 12; Fighter/Paladin/Ranger 10; Sorcerer/Wizard 6; rest 8) — all correct.
      `dnd5e-2024-classes.test.ts` / `dnd5e-2014-classes.test.ts` (the per-class hit-die assertion tightened
      from "a valid die" to "the RAW die").
      **Per-class SAVE proficiencies pinned too (2026-07-17):** same shape of hole — the tests checked
      "exactly 2 saves" but not WHICH two, so a wrong pair (Barbarian STR/CON → STR/DEX) would pass while
      breaking every save the class rolls with proficiency. Verified all 25 defs against RAW and pinned each
      pair order-independently (Barb STR/CON, Bard DEX/CHA, Cleric WIS/CHA, Druid INT/WIS, Fighter STR/CON,
      Monk STR/DEX, Paladin WIS/CHA, Ranger STR/DEX, Rogue DEX/INT, Sorc CON/CHA, Warlock WIS/CHA, Wizard
      INT/WIS, Artificer CON/INT) — all correct.
      **2014 SUBCLASS levels pinned (2026-07-17, edition-sensitive):** 2024 puts every subclass at L3 (already
      pinned), but 2014 varies — Cleric/Sorcerer/Warlock choose at L1, Druid/Wizard at L2, the rest at L3. The
      test only checked a subclass feature SITS at `subclassLevel` (consistency), not that the level is
      RAW-correct — a Cleric typo'd to 3 would offer its Domain 2 levels late and still pass. Pinned every
      2014 class's subclass level to RAW (all 13 correct). This is the same edition-sensitive category as the
      exhaustion gap, so worth nailing down.
      **ASI cadence pinned EXACTLY, both editions (2026-07-17):** the checks used `toContain([4,8,12,16])` +
      `not.toContain(19)`, which verify the expected levels are present but NOT that there are no extras — a
      spurious ASI at 14 would slip. Pinned the full `asiLevels` array per class: 2024 = 4/8/12/16 (Fighter
      +6/14, Rogue +10; L19 is an Epic Boon, never an ASI), 2014 = the same PLUS L19 (the edition tell). All
      25 correct — a missing OR spurious ASI level is now caught.
      **2026-07-16 — ALL 12 PHB CLASSES SHIPPED ✅** (`lib/dnd/classes/dnd5e-2014/`): Barbarian, Bard,
      Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard — each L1–20 with
      every PHB subclass, all edition-differences vs 2024 locked by `dnd5e-2014-classes.test.ts` (71
      tests). The Wizard closes it with all eight Arcane Traditions (schools), Arcane Recovery, Spell
      Mastery at 18, Signature Spells at 20. Highlights across the set: martials + Ki/Rage resources;
      Ranger/Paladin half-casters; Sorcerer/Bard/Cleric/Druid/Wizard full casters (known vs prepared
      handled per class); Warlock pact magic + invocations + Mystic Arcanum. The build also FIXED a
      latent cross-edition subclass-leak bug (`subclassesFor`/`findSubclass` are now system-scoped). Cleric L1–20 (WIS full-caster
      preparer, Divine Domain at level 1) with Channel Divinity/Turn Undead (1→3/rest), Destroy Undead,
      Divine Intervention, and **all seven PHB domains** (Knowledge, Life, Light, Nature, Tempest,
      Trickery, War) — each with always-prepared Domain Spells and Divine Strike/Potent Spellcasting at 8. Bard L1–20 (full caster, spells
      known, any 3 skills) with Bardic Inspiration (d6→d12), Jack of All Trades, Expertise ×2, Magical
      Secrets at 10/14/18, and both PHB colleges (Lore, Valor). Sorcerer L1–20 (full caster; Sorcerous
      Origin at level 1, Font of Magic, Metamagic, Draconic/Wild Magic). Warlock L1–20 (**pact caster** —
      few slots, all highest-rank, short-rest) with Eldritch Invocations, Pact Boon at 3, Mystic Arcanum
      at 11/13/15/17, and all three PHB patrons (Archfey, Fiend, Great Old One), patron chosen at level 1. Paladin L1–20 (half-caster, CHA, spells PREPARED) with Divine
      Smite as a class feature, Lay on Hands, the Auras (10 ft → 30 at 18), and all three PHB oaths
      (Devotion, Ancients, Vengeance) carrying always-prepared Oath Spells. Monk L1–20 + all three PHB traditions (Open Hand, Shadow, Four
      Elements); the resource is "Ki" (2024 renamed it Focus), equal to Monk level from level 2. Ranger
      L1–20 (first **half-caster** — spells known from 2, no cantrips) with the 2014 **Favored Enemy +
      Natural Explorer** at 1 (a 2024 rewrite) and both PHB archetypes (Hunter, Beast Master).
      Barbarian L1–20 + both PHB Primal Paths (Berserker, Totem Warrior). Fighter L1–20 + all three PHB
      Martial Archetypes (Champion, Battle Master, Eldritch Knight — the EK third-caster block exported
      like the 2024 one, restricted to Abjuration/Evocation). Rogue L1–20 + all three PHB archetypes
      (Thief, Assassin, Arcane Trickster — AT third-caster block, Enchantment/Illusion focus); Sneak
      Attack, Expertise ×2, Cunning Action, extra ASI at 10. Registered under a new `dnd5e-2014` entry in
      the class registry; **resolution is per class**, so the system offers its finished classes and
      falls back to the AI/homebrew path for the rest (a partial system is not a broken one). Locked
      the 2014 tells vs 2024: ASI at 19 (not Epic Boon), Barbarian Brutal Critical (not Brutal Strike)
      + unlimited Rage at 20 + STR/CON cap 24, Fighter Fighting-Style-as-feature at 1 + extra ASIs at
      6/14 + Extra Attack to 4 by 20, no Weapon Mastery anywhere.
      **Fixed a latent cross-edition bug this surfaced:** `subclassesFor`/`findSubclass` filtered
      subclasses by key across ALL systems, so once a `barbarian`/`berserker` existed in two editions a
      2024 sheet could be offered the 2014 Totem Warrior (Ground Rule 1/2 violation, dormant while only
      2024 existed). Both are now **system-scoped**; all three callers (levels API ×2, library page)
      pass the class's system. Tests: `dnd5e-2014-classes.test.ts` (11 — structural validity, L1→20,
      the edition tells, per-class fallback, no-leak) + the 2024 suite updated to the scoped signature.
      **6a DONE** — 12 PHB classes + Artificer, all L1–20 with subclasses (77 tests). Next: 6b (Pathfinder 2e).
- [x] **6b — Pathfinder 2e ✅** (a FOCUS system): the **dedicated per-system model** (the
      `intuitive-games` module pattern) is now built in full at `lib/dnd/systems/pathfinder2e/`:
      - `model.ts` — typed `PF2Character` sidecar (character.data.pf2e): attributes as MODIFIERS,
        proficiency RANKS (untrained→legendary) with `PF2_RANK_BONUS`, identity, skills, saves, combat
        (ancestryHp/classHpPerLevel/armorRank/dexCap/classDc), Remaster spellcasting traditions, and
        four-track feats. `isPF2Character` guard.
      - `rules.ts` — pure math: proficiency = rank bonus + level (trained+), the four degrees of success
        (nat 20 up / nat 1 down), HP, Dex-capped AC, saves, perception, class/spell DC, Strike bonus,
        the multiple attack penalty, and the level-based DC table.
      - `content.ts` — the vanilla library: 16 core skills, the **14 Remaster classes** (level-1
        proficiency ranks + key attribute + HP/level + subclass mechanism + spellcasting), the **8 core
        ancestries** (HP/size/speed/boosts/heritages), and 17 backgrounds.
      - `builder.ts` — `buildPF2Character` + `assemblePF2VanillaCharacter` (projects onto the shared
        Character engine so sheet/provenance/switcher keep working, plus the pf2e sidecar);
        `pf2ApplyBoosts` honors the +4 partial-boost rule.
      - `catalog.ts` — the library grouped for UI pickers; `ai.ts` — `PF2_PICKS_TOOL` + `parsePF2Picks`
        + `pf2BuilderSystemPrompt` (grounded, cross-system-leak-proof).
      - **Builder UI**: `PF2CharacterBuilder.tsx` (guided pickers + AI-build box), `PF2Sheet.tsx`
        (bespoke Remaster sheet, all numbers from the rules engine, U/T/E/M/L rank pills), the
        `pf2-build` + `pf2-build/ai` write-gated routes, and page wiring (`app/dnd/characters/[id]`).
      - **63 tests** (rules 15 + builder 18 + ai 6, plus the existing dnd suite); tsc + eslint clean.
      Remaining polish (deferred): per-level rank/feat progression tables (level-1 legal today; higher
      levels set initial ranks + accept manual/AI edits), heritage/class-feat mechanical bodies.
      **Audit finding 2026-07-17 — the degree engine is built but unwired to any roll.** `PF2Sheet` is
      display-only: it shows every +modifier (skills/saves/AC/Strike, all from the rules engine) but has NO
      roll surface, and `pf2Degree` (the four degrees + the nat-20/nat-1 step, fully tested at
      `pathfinder2e-rules.test.ts`) has **zero call sites** — so a PF2 player can't roll a check/Strike and
      see "critical success" the way the 5e sheet rolls and shows a crit. The hard part (the resolver) is
      done; only a PF2 roll UI + a `pf2Degree` call is missing. Whether PF2 should roll in-app like 5e or
      remain a reference sheet is a product call — tracked in `BLOCKERS.md §C`.
      **AI adjudicates with the PF2 character's derived numbers now (2026-07-17):** the "Ask the Librarian"
      route built its per-character digest with the general `characterDigest`, which reads the 5e `Character`
      model and NEVER the `data.pf2e` sidecar — so a ruling on a PF2 character was blind to its AC, save
      totals, Class/Spell DC, Strike + skill bonuses (it had the PF2 rulebook but not the DC to answer "does
      the target save?"). Added a pure `pf2CharacterDigest` (`digest.ts`) that states AC/HP/saves/Perception,
      Class DC, Spell DC+attack (casters), the MAP schedule, Strike to-hits, and trained+ skill totals — all
      from the same `rules.ts` the sheet uses; the `library/chat` route appends it when `data.pf2e` is
      present. Parallel to the IG `igCharacterDigest` shipped the same day. `pf2-digest.test.ts` (6).
      **Completed with the dynamic state (2026-07-17):** the first pass showed only MAX HP — a ruling needs
      how HURT the character is. Now shows CURRENT/max HP + temp (matching the sheet's `currentHp || maxHp`)
      and a STATUS line for PF2's death track (Dying/Wounded) when live — the only dynamic combat state PF2
      models (it has no other named-condition field). `pf2-digest.test.ts` +1.
      **PF2 level-based DC table pinned at every level (2026-07-17):** `pf2LevelBasedDc` (the GM Core baseline
      DC behind every untrained/environmental check) was spot-checked at L0/1/5/20 — but NONE of the
      +2-jump levels (3,6,9,12,15,18), the irregular part of the progression, was tested; a typo in a jump
      would give a whole tier of tasks the wrong DC. Verified the full 0–20 table against GM Core and pinned
      every level (correct). `pf2-rules.test.ts` +1. (`PF2_RANK_BONUS` — trained+2…legendary+8 — was already
      fully covered via `pf2Proficiency`.)
      **8 PF2 ancestries golden-pinned (2026-07-17):** HP/size/speed/boosts were only spot-checked (Dwarf/Elf
      HP via the HP formula, Dwarf speed via the armor test). Verified all 8 against Player Core and pinned
      each — the distinctive values a typo would hit are Dwarf speed 20 and Elf speed 30 (rest 25), the
      6/8/10 HP tiers, and the boost patterns (Human = two free, Orc = STR + two free). All correct.
      `pathfinder2e-builder.test.ts` +1.
      **All 14 PF2 CLASSES' key attribute + HP/level pinned (2026-07-17):** only Fighter/Wizard HP was
      exercised (via the HP formula). A wrong key attribute mis-computes the class DC + spell attribute; a
      wrong HP/level mis-sizes every level. Verified all 14 vs Player Core and pinned each (Barbarian STR/12,
      martials STR-or-DEX/10, casters INT-or-CHA/6, the 8-HP mid tier) — all correct. `pathfinder2e-builder.test.ts` +1.
      **12 PF2 armors' AC-critical values pinned (2026-07-17):** `acBonus` + `dexCap` + `speedPenalty` drive
      `pf2ArmorClass` (AC = 10 + min(Dex, dexCap) + prof + acBonus), and only Full Plate's str/speed was
      spot-checked. Verified all 12 against Player Core's standard progression (light acBonus 1–2 / dexCap
      3–4 / speed 0; medium 3–4 / 1–2 / −5; heavy 5–6 / 0–1 / −10) and pinned each + a category→speed-penalty
      cross-check — all correct. (Left the `strength` requirement unpinned — not independently re-verified,
      and pinning unverified data isn't verification.) `pathfinder2e-builder.test.ts` +1.
      **18 PF2 weapons' damage die + type pinned (2026-07-17):** a wrong die (Greataxe 1d10 vs 1d12?) or
      B/P/S type mis-rolls every Strike with that weapon; only Longsword was spot-checked. Verified all 18
      (8 simple + 10 martial) vs Player Core and pinned each. All correct. `pathfinder2e-builder.test.ts` +1.
- [~] **6c–6h — the other six systems → MOVED to `docs/planning/pending/DND_SYSTEMS_UNDER_CONSTRUCTION.md`**
      (2026-07-16, per the user's scope call). The platform is focused on **four** systems first — D&D
      5e 2024, D&D 5e 2014, Intuitive Games, Pathfinder 2e. PF1e, Starfinder 1e, Cyberpunk RED, Shadowrun
      6e, Call of Cthulhu 7e, and Blades in the Dark are now seeded as **🚧 under construction**
      (`GameSystem.status === 'under-construction'`): offered but not selectable, listed in the campaign
      picker's "Under construction" group and disabled in the SystemSwitcher. They will be built out
      later — see the pending doc for what each needs.

For the level-less systems the model must NOT invent a level table — extend the builder to express
"advancement by spend" (Karma/IP/skill checks) instead. `registry.ts` already reports
`classKnown: false` honestly for these; that is the behaviour to replace, not to paper over.

## Ground Rule 1 enforcement — cross-system content integrity ✅ SHIPPED 2026-07-16

Per the user's directive that no character is ever given the wrong system's version of a shared name
(a "berserker" subclass, a "Frightened" condition, a shared class key), the content architecture is
now audited and guarded:

- **Every content type is system-tagged**: classes, subclasses, feats, backgrounds, species all carry
  a `system` field; the glossary is keyed by system.
- **Every multi-system lookup is system-scoped**: `findClass`/`subclassesFor`/`findSubclass` (the
  subclass ones fixed this session — they were leaking across editions once 2014 shipped) and
  `findTerm` all take a system and never return another system's content.
- **Single-system lookups** (`findFeat`/`findBackground`/`findSpecies`) are 2024-scoped by construction
  (2024-only modules, call sites gate on the sheet's system); each is commented that a system-keyed
  dispatcher must be added when another system gains that content.
- **`system-integrity.test.ts` (8) is the guardrail**: it fails the build if any content is mistagged
  or any shared name resolves to the wrong system — including the exact 2014-vs-2024 Barbarian/berserker
  and 5e-vs-PF Frightened cases.

## Slice 7 — Everything connected

- [~] Choosing a system on a character drives: available classes, skills list, conditions,
      the sheet's ability model, and the glossary the sheet links to. **Mostly SHIPPED** — `system-rules.ts`
      exposes `systemClasses`/`systemClassNames`/`systemConditions`/`systemSpecies`/`systemSkills` for all
      four focus systems; the class/species pickers + the `ConditionTracker` (system conditions, PF2's
      numeric Frightened 2 etc.) + the glossary are all system-scoped, and PF2 has its own bespoke sheet +
      ability model. **Cross-system leak guard added** (`8f34eed9`): `system-conditions-skills-scope.test.ts`
      (8) extends Ground Rule 1 to the condition + skill lists — PF2's Clumsy/Enfeebled/Off-Guard stay out
      of 5e, 5e's Charmed/Restrained out of PF2, IG's Heatstroke + Bluff-not-Deception unique — so a new
      condition/skill can't be authored without scoping it. **Remaining gap (deferred — data-model work):** the STANDARD sheet's `SavesSkills`
      still renders the hardcoded 5e `SKILLS`. That's correct for both 5e editions (identical lists) but
      wrong for **intuitive-games**, whose skills differ (Arcane/Appraise/Bluff…). System-scoping it needs
      a system-keyed skill-proficiency store (today `char.skills` is a fixed 5e-keyed shape), which is
      larger than a drop-in and risks the primary 5e path — so it's deferred rather than rushed.
      **Correctness fix shipped in passing** (`0295bdf2`): Passive Perception + Save DC on that card were
      reading base abilities, not the ledger-effective ones — now fixed (see Slice 10). `saves-skills-effective.test.ts` (2).
- [x] `system-validate.ts` runs against the class data (not just the catalog). **✅ SHIPPED** (`67f40793`,
      `90d6a967`): the validator includes the character's saved homebrew classes (no false flag), and
      cross-references features against both 5e editions' class data so an edition-EXCLUSIVE feature
      (e.g. a 2014-only feature on a 2024 sheet) is warned — conservatively (shared + homebrew features
      never flag).
- [x] **The sheet's Progression tab renders from `progressionTable(def, sub)`. ✅ SHIPPED** (`82375dae`,
      `0b2fd295`): `progressionRows(def, sub, level)` maps the class data to the 20 `ProgressionRow`s
      (faithful level/prof/per-level-features; middle columns from resources/spell info) + `progressionColumns`
      for the labels. The levels route computes it server-side (no client-bundle hit) and the Progression
      component fetches `/levels` and prefers that class-DATA table over the hand-authored array — falling
      back to the stored array for a custom/ambiguous character. 7 tests total.
- [ ] Jack: decide whether Rangor/Pugilist become a real custom class + subclass through the Slice-5
      builder (they are currently hand-authored sheet data with `system: ambiguous`).

## Slice 8b — Library buildout for the four focus systems ⏳ IN PROGRESS 2026-07-16/17

Per the user's directive to focus on **four** systems (D&D 5e 2024, D&D 5e 2014, Intuitive Games,
Pathfinder 2e) and fully flesh out each system's library — every rule/term/action defined,
searchable, and AI-navigable so a player or the AI gets correct answers. The other six systems are
seeded **🚧 under construction** (`GameSystem.status`), grouped/disabled in the pickers, with their
build plan parked in `docs/planning/pending/DND_SYSTEMS_UNDER_CONSTRUCTION.md`.

- [x] **D&D 5e 2024 ✅** — added the full action economy (all 12 standard actions + Bonus Action) and
      core combat (Cover, Temp HP, Damage Types & Resistance, Difficult Terrain, Vision & Light,
      Bloodied), **plus rich overview articles for all 12 classes** (identity, hit die, key ability,
      saves, signature feature, subclass at 3) and an **Epic Boon** article. Class articles carry only
      the class name as an alias so they don't outrank the searchable per-level features (verified:
      "wizard" → class article, "action surge" → the Action Surge feature). ~67 → ~80 terms.
- [x] **D&D 5e 2014 ✅** — its own edition-correct action economy (Cast a Spell / Use an Object, not
      the 2024 renames; 2014 Hide with no DC 15) + the same core mechanics, **plus overview articles for
      all 12 classes** (edition-correct: ASI at 19 not Epic Boon, no Weapon Mastery, Ki not Focus, and
      2014 subclass levels — Cleric/Sorcerer/Warlock at 1, Druid/Wizard at 2, the rest at 3). Class
      articles aliased by class name only, so they don't shadow the searchable features (verified:
      "barbarian" → class article, "brutal critical" → the feature). A `stealth` alias on Hide had been
      outranking the Stealth skill — caught + removed. ~72 terms.
- [x] **Pathfinder 2e ✅** — the actual actions of the 3-action economy (Strike/Stride/Step/Interact/
      Raise a Shield/Seek/Aid + Demoralize/Grapple/Trip/Shove/Escape) and core mechanics (Flat Check,
      Persistent Damage, Bulk, Free Action & Reaction/Activity), **plus rich articles for all 14 core
      classes** (Alchemist…Wizard) — each with its HP/level, key attribute, save proficiency, and
      signature mechanic (Fighter's Reactive Strike at 1, Rogue's Sneak Attack + Racket, Wizard's
      thesis + spellbook, etc.), authored from the catalog's authoritative facts. The library prefers
      these over the one-line catalog stubs. **Plus all 8 Player Core ancestries** (Dwarf, Elf, Gnome,
      Goblin, Halfling, Human, Leshy, Orc) as rich articles — HP, Size, Speed, senses, and signature
      trait (Human's versatility, Orc's Ferocity, Leshy's no-food/water/air), certain facts stated and
      exact ability boosts kept general per Ground Rule 3. 44 → 82 terms. **Verified in the app**:
      searching pathfinder2e for "fighter" returns the class article and "dwarf" the ancestry article.
      **Plus the 10 class "subclass" mechanisms** — Instinct, Racket, Bloodline, Doctrine, Mystery,
      Order, Muse, Research Field, Cause, Hunter's Edge — each a searchable article (so "what is a
      Rogue's Racket" resolves). 44 → 92 terms; verified "racket" → the article.
      **Plus (6b follow-up) the 17 PF2 backgrounds** now surface in the library — `searchLibrary`
      projects them as `background` hits (matched by name or "background") from the new
      `pathfinder2e/content.ts`, and `libraryPageFor` renders a PF2-only **Backgrounds** table (boosts /
      trained skill+Lore / skill feat). Backgrounds were consequential level-1 data that lived only in
      the builder before; now a player or the AI can browse them. System-scoped (no 5e leak);
      `library.test.ts` +1 (Acolyte → Religion; absent from 5e pages).
      **Plus (6b follow-up) per-class subclass options** — each of the 14 classes now carries its
      Remaster subclass line-up as structured `subclassOptions` (instincts, muses, causes, doctrines,
      orders, mysteries, hunter's edges, rackets, bloodlines, patrons, theses, research fields; Fighter
      and Monk empty by design — no formal subclass). The PF2 builder drives its subclass field from a
      per-class `<datalist>` (real options as suggestions, freeform kept as the custom escape hatch).
      `pathfinder2e-builder.test.ts` +1.
      **Plus (6b follow-up) correct full-caster spell slots** — `pf2SpellSlots(level)` replaces the
      builder's hardcoded `[5]` with the real Player Core progression (5 cantrips; a rank opens at level
      2r−1 with 2 slots, rises to 3 at 2r; the single 10th-rank slot at level 19). The PF2 sheet renders
      slots per rank. All 7 caster classes are full casters on this table. `pathfinder2e-rules.test.ts`
      +5 (table verified vs Player Core), builder +2.
      **Plus (6b follow-up) worn armor → correct AC/Dex-cap/speed** — every PF2 character previously
      showed UNARMORED AC because the builder never applied armor. Added `PF2_ARMORS` (11 Player Core
      armors, unarmored→heavy, with AC item bonus / Dex cap / Strength req / check + speed penalties);
      the builder applies the picked armor's Dex cap + AC bonus (full plate now caps Dex to 0 and adds
      +6) and the speed penalty (correctly reduced by 5 ft when the Strength req is met). Armor picker in
      the builder UI + name shown under AC on the sheet; the AI parse/schema accept `armor`.
      `pathfinder2e-builder.test.ts` +6.
      **Plus (6b follow-up) the armored-skill check penalty** — now applied to the four armor-affected
      skills (Acrobatics/Athletics/Stealth/Thievery) when the Strength requirement is unmet, and waived
      when met. `PF2Skill.armorPenalty` + `PF2Combat.armorCheckPenalty`; `pf2SkillTotal` takes the
      penalty and applies it only to flagged skills; the sheet marks penalized skills with ▲. This
      CLOSES the PF2 armor mechanics (AC + Dex cap + speed + check penalty all correct). +3 tests.
      **Plus (6b follow-up) a PF2 weapon catalog → real Strikes** — a built character's only Strike was
      an unarmed Fist. `PF2_WEAPONS` (19 Player Core simple+martial weapons: damage die/type, traits,
      group, hands, range) + `pf2WeaponStrike` (ranged/finesse use DEX when it beats STR; melee adds STR
      to damage; attack rank = class attack proficiency). The builder prepends a picked weapon's Strike
      (Fist kept as fallback); weapon picker in the UI; AI parse/schema accept `weapon`. +5 tests.
      **Plus (6b follow-up) PF2 armor + weapons in the library** — the new gear catalogs, builder-only
      before, now surface in `searchLibrary` as `armor`/`weapon` hits (AC/Dex-cap/Str; damage die+type+
      traits) and as PF2-only **Armor** and **Weapons** tables on the library page. System-scoped (no 5e
      leak). `library.test.ts` +1 (Full Plate +6 AC, Longsword 1d8 slashing).
      **Plus (6b follow-up) a PF2 spell catalog** — the last missing PF2 content. `PF2_SPELLS` (25
      cantrips + iconic spells across ranks 0–6 and the four traditions, with cast cost + factual effect)
      surfaces in `searchLibrary` as `spell` hits and a PF2-only **Spells** table (marked representative,
      not exhaustive). System-scoped; `library.test.ts` +1 (Fireball rank 3 arcane, Shield cantrip).
      **Plus (6b follow-up) gear/spells/subclasses in `pf2Catalog()`** — the catalog (which feeds the AI
      builder's grounding prompt) now also groups Subclasses, Weapons, Armor, and Spells, so an AI PF2
      build references a real bloodline/longsword/breastplate/Fireball instead of inventing one. +1 test.
      **Plus (6b hardening) a content-integrity guard** — `pathfinder2e-content-integrity.test.ts` (9)
      locks the whole PF2 library internally consistent: no duplicate names per catalog, valid ranks/
      attributes, backgrounds train real skills, spells rank 0–10 with valid traditions, gear categories/
      damage types valid — so future edits can't silently introduce a dangling reference or bad rank.
      **Plus (6b hardening) a test on the assemble seam** — `assemblePF2VanillaCharacter` (the projection
      the `pf2-build` routes persist and the character page reads) is now covered by
      `pathfinder2e-assemble.test.ts` (8): the sidecar passes `isPF2Character`, identity→meta/chips,
      modifier→score mapping, projected HP/AC equal the rules engine, the weapon Strike + Fist land in
      the shared attacks, and the route's `summarizeCharacterProvenance` pass runs and tags vanilla
      content — the same seam a browser build would exercise, minus the browser.
      **Plus (6b follow-up) ancestry senses + initiative on the sheet** — ancestry senses (Darkvision,
      Low-light vision) lived on `PF2_ANCESTRIES` but were dropped at build; the builder now carries them
      onto `PF2Character.senses` and the sheet shows them. The sheet also shows an Initiative stat (PF2
      rolls initiative with Perception by default). `pathfinder2e-builder.test.ts` +3.
- [x] **Intuitive Games ✅** — closed the gap found 2026-07-16 (its content lived only in the builder
      module, not the searchable glossary). Authored `lib/dnd/glossary/intuitive-games.ts` (26 articles)
      from the engine's own numbers (igProficiency = level, igDegreeOfSuccess, igSaveTotal, igMaxHp) and
      the content module — Core Roll, Degrees of Success, the Three-Action Economy + its actions
      (Attack/Stride/Step/Interact/Combat Skills/Support Ally/Redistribution/Attack of Opportunity),
      Proficiency (= level), the three Saves, HP, Stances, Flanking, Sneak Attack, Powers/Defensive
      Powers, Advantage & Disadvantage, DR, Weapon Classes, Feats, Subclasses, Ability Scores — and
      wired it into `glossary/index.ts` `BY_SYSTEM`. **Verified in the running app**: library search for
      "stance" under intuitive-games returns Stances / Advantage & Disadvantage / Damage Reduction. All
      four focus systems are now searchable + AI-navigable in the library.
      **↑↑ MASSIVELY EXPANDED 2026-07-17** — the IG library is now the most complete of the four focus
      systems: a full **site scrub** of intuitivegames.net into **25 library sections** (core rules +
      damage/cover/movement, character-building, classes + per-class detail, skills + combat skills, 10
      ancestries w/ art, 10 backgrounds, 10 stances, 18 conditions, **151 feats**, powers + full spell
      roster, redistribution, companions, weapons/armor/shields/equipment/tools/magical items), all
      full-text + searchable + AI-grounded, plus the interactive sheet (tooltips + mechanics + manual & AI
      edit) and Brendan's race art. Tracked in its own doc **`INTUITIVE_GAMES_FULL_BUILDOUT_2026-07-17.md`**
      + the master reference **`docs/reference/intuitive-games/SITE_MASTER.md`**. So Slice 8b's IG portion is
      not just "26 glossary articles" — it's a complete system build (with the owner-gated remainder — spell
      effect text, class ladders, taxonomy decision — tracked in that doc's gaps list).
- [x] **The AI now answers FROM the library ✅** — closed the gap where `systemGroundingBlock` grounded
      the AI (librarian, builder, adjudication) on the rules catalog + DB store but NOT the in-code
      glossary. It now does deterministic, **system-scoped** glossary retrieval (no key needed): the
      top matching articles for the question are injected into the grounding block, with stopwords
      stripped so natural-language questions retrieve the right article. **Verified end-to-end**: asking
      the librarian "how does the multiple attack penalty work if I Strike three times?" (PF2e) returned
      the exact numbers from the article (−5/−10, −4/−8 agile), `grounded > 0`. So the AI now gives
      correct, system-accurate answers quoting the library rather than recall. Tests:
      `grounding-glossary.test.ts` (5 — glossary in the block, natural-language retrieval, no
      cross-system leak, empty-query still deterministic, and a source-anchor that **every** AI route
      feeds the grounding block). Because the fix lives in `systemGroundingBlock`, it benefits ALL AI
      paths at once — the **librarian**, the **character/item builder** (`ai-edit`: building a feat/
      spell/weapon now grounds on the system's articles), **ingest**, and **cross-system transpose** —
      exactly the user's "help the AI when explaining, editing, finding, or building anything."
- [x] **Definitive Ground-Rule-1 proof in the AI ✅** — asked the librarian "how does Frightened work?"
      for two systems: **PF2e** answered the NUMERIC version ("status penalty equal to its value — all
      checks and DCs; Frightened 2 = −2 to everything") and **D&D 5e 2024** the BINARY version
      ("disadvantage while the source is in line of sight; can't willingly move closer"), each
      `grounded: 6` on its own system's article. Same question, two correct, system-specific answers —
      the AI never gives the wrong game's version.
- [x] **Guardrails**: `glossary.test.ts` now includes a no-duplicate-terms integrity check per system;
      `system-integrity.test.ts` enforces no cross-system leakage. Every entry carries seeAlso links +
      search aliases and resolves through the no-key keyword search.
- [x] **Full 2024 FEATS project into library search ✅** — `searchLibrary` only exposed a one-line
      "sample" of feats; now a system-keyed `featsForSystem` projects the whole **`FEATS_2024`** registry
      (Origin / Fighting Style / General / Epic Boon) with each feat's **real benefit text + category**,
      so "tavern brawler", "alert", "archery" return the actual rules, not a stub. **Verified in the
      app** (Tavern Brawler → its full 662-char benefit). `library.test.ts` +2.
- [x] **Grounding retrieval made reliable for natural questions ✅** — the library search AND-matches
      every word, so a real question ("how many hit points does a Fighter get per level?") retrieved
      NOTHING (no article contains all those words) and the AI answered from recall — correct only by
      luck. Grounding now uses a **lenient scorer** (`retrieveGlossary`: term > alias > body, require ≥1
      keyword) so the right article is reliably surfaced. **Verified**: the same PF2e Fighter question
      went from `grounded: 0` (recall) to `grounded: 6` (article-grounded, correct 10 HP/level + STR/DEX).
      Also confirmed PF2e characters degrade gracefully in the level builder (`classKnown: false` → the
      AI/homebrew path) since PF2e has no deterministic class table yet. `grounding-glossary.test.ts` +2.
- [x] **AI grounds on the full feat text too ✅** — `systemGroundingBlock` now also retrieves the feats
      NAMED in the question (`matchFeats`, system-scoped) and injects their real benefit text, so the
      librarian/builder answer feat questions from the rules, not recall. **Verified end-to-end**: asking
      the librarian "what does Tavern Brawler do in 2024?" returned the exact 2024 benefit (Enhanced
      Unarmed Strike, 1d4+STR bludgeoning), `grounded: 2` — the 2024 version, not the 2014 one.
      `grounding-glossary.test.ts` +2.
- [x] **Classes project into library search ✅** — confirmed `searchLibrary` already surfaces **every
      class feature by name + level** via `classesForSystem(key)` for any system with full class data, so
      the whole **2014 roster (built this session) is automatically searchable** alongside 2024
      ("brutal critical", "sneak attack", "action surge" all resolve to the real rules text), and a
      feature never leaks across systems (2014 Brutal Critical is not a 2024 result). Stale
      "currently dnd5e-2024" comment fixed; `library.test.ts` +2. **Resolved (6b):** the dedicated PF2e
      model now exists (`lib/dnd/systems/pathfinder2e/`), so PF2 classes/ancestries/backgrounds have
      structured builder data + a bespoke sheet; the PF2 catalog projects them into the library picker.

## Slice 8 — Semantic search (optional, needs a key) — ⏸ DEFERRED pending `VOYAGE_API_KEY`

- [~] Backfill embeddings for `dnd_system_entries` + the glossary once `VOYAGE_API_KEY` exists
      (`scripts/dnd-seed-system-rules.ts` already embeds when configured). **DEFERRED — blocked on the
      absent `VOYAGE_API_KEY`:** the backfill literally cannot run or be verified without the key, and it's a
      pure retrieval-QUALITY enhancement (not a correctness path). The embedding code is already written and
      runs automatically once a key is present — so this is a config/ops step, not a build task.
- [~] Project the glossary into the store so semantic retrieval reaches the full articles. **DEFERRED for the
      same reason** — semantic retrieval is inert without embeddings, which need the key.
- [x] Keyword search must remain the fallback — it is the only thing that works without a key. **✅ SHIPPED /
      verified throughout:** `searchLibrary` (`lib/dnd/library.ts`) is pure + DB-free and is what actually
      runs today (no key, no seeded rows) — the whole four-focus-system library + IG's 25 sections are
      searchable by keyword, proven across the `library.test.ts` suite. So the SEARCH VALUE is delivered; only
      the semantic-ranking upgrade waits on the key.

---

# Part II — Living items & the effect ledger (requested 2026-07-16)

> "Any item could literally effect anything… It could be a sword that does this, or a single boot.
> Really, the image and the name and category really don't matter all that much, the mechanics of
> the item/weapon/potion/spell matter way more."

## What is actually wrong today

Three findings, from reading the code rather than the symptom:

1. **The effects engine is not in the render path.** `app/dnd/_sheet/engine/effects.ts` already models
   `{ target, operation, value, condition, source }`, and `deriveCharacter()` (engine/character.ts)
   already pools item + feature effects and resolves them. **Nothing the player looks at calls it.**
   The sheet components read `char.abilities[k]`, `char.combat.ac` and `char.meta.name` *directly*
   from the stored model. So an item's effects are, today, decoration: they are stored, and they are
   ignored. This is the root cause and Slice 10 is about exactly this.

2. **The AI cannot express an item's mechanics, so it correctly refuses to invent them.** The reported
   "the AI made no edits" is not a bug in the model — it is the schema being honest.
   `lib/dnd/sheet-edits.ts` defines `add_item` as `{ name, desc?, qty? }`. There is no field for an
   effect, a category, a duration, or art. Asked for "a pendant that grants a Barbarian ability", the
   model can emit a *label* for one, and nothing more. Widening the vocabulary (Slice 14) is the fix;
   prompt-tuning would only produce prettier lies.

3. **Nothing shows what is currently modifying you.** `ActiveEffect[]` exists on the type and the store
   has add/remove reducers — with no UI. So the potion-of-strength-still-active-next-session scenario
   in the request is not hypothetical, it is the current behaviour.

## The one architectural rule for Part II

**Effects are overlays. They are NEVER baked into the base character.**

When the pendant makes you a different person, it must not *write* `meta.name`. It contributes an
identity effect that the ledger *overlays* on top of the stored name. Everything follows from this:

- Taking the pendant off is free and always correct — remove the source, re-derive, you are you again.
  No "undo" bookkeeping, no snapshot to restore, no drift when two items both touch the same field.
- Two items touching one field resolve by one documented rule instead of by whoever wrote last.
- The ledger can always answer *why* a number is what it is, because it never lost the base.

The tempting shortcut — mutate on equip, restore on unequip — is how you end up with a character
permanently named "Zul the Devourer" because the sheet saved between the two halves of the swap. Do
not take it.

## Slice 9 — AI chat box: resizable, and a send button that behaves ✅ SHIPPED 2026-07-16

Small, reported, independent of the rest. Ship first.

- [x] The chat transcript is resizable (drag handle, remembered per-user, sane min/max).
      → `app/dnd/_ui/useResizable.ts`. Deliberately NOT CSS `resize`: the builder dock is anchored
      bottom-right and the native resizer only ever lives on the bottom-right corner, so dragging it
      would shove the panel off-screen. The hook inverts both axes for a top-left grip. Restores in
      an effect, never during render (seeding `useState` from localStorage hydrate-mismatches).
      Arrow keys work — a drag-only affordance is unreachable on the tablet this is used on at the
      table. Verified in the app: 390×540 → 438×588, persisted.
- [x] The send button is sized to its content and aligned with the input — it is currently a slab.
- [x] Apply to every chat surface, not just the one that was noticed.

**The send button was a symptom, not the bug.** It was `align-self: stretch`, but that only explains
why it *matched* the input — not why it was huge. Measuring in the browser found the real cause:

    app/styles/globals.css:299   textarea { min-height: 140px }

The marketing site's **contact form**, applied via a bare element selector, leaking into every
textarea in the app. The `rows={2}` chat input was rendering 140px tall and the button dutifully
matched it. Reset at the boundary; button now 62×34.

**This leak has now been found three times** — `p { color }` into sheet prose (Slice 1),
`textarea { min-height }` into the chat (here), and `p { color }` again into the *librarian's
answers* (Slice 21, 2.32:1 → 14.15:1, because Slice 1's reset stopped at `.dnd-sheet` and the D&D
chrome was never covered). Both boundaries are now reset and guarded. If a fourth turns up, the
real fix is to scope `globals.css` to the marketing site rather than resetting downstream.

## Slice 10 — The effect ledger (the spine of Part II) ✅ SHIPPED 2026-07-16

**Shipped:** `lib/dnd/effects/targets.ts` (the registry / Appendix A contract),
`lib/dnd/effects/ledger.ts` (`buildLedger`), and the store now exposes `abilities` (effective) +
`ledger` (why). `Abilities`, `StatRail`, `SavesSkills` and `Attacks` read them. 55 tests.

**Verified in the app, not just in units:** a +2 STR belt added to Jack's real sheet moved STR
17 → 19★, the modifier +3 → +4, with the tooltip `STR 17 base · +2 STR — Belt of the Bear · = 19`
— and no code anywhere knows what a belt is. DEX/CON showed no star. Jack was restored and the
restore verified by reading it back.

Decisions that stuck:
* `InlineNumber` **edits the base, displays the effective** (via its `display` prop). Editing the
  effective score would fold the item's bonus into the base on every touch.
* The rail and the Abilities tab both **read the ledger** rather than each doing the arithmetic —
  two components computing the same number will eventually disagree, and the sheet can't say which
  is right.
* Target keys **match the engine's existing names** (`dex_saves`, `skill.stealth`) rather than a
  parallel vocabulary plus a translation layer.

**Still open in this slice** (moved to the slices that own them):
- [ ] Equipping routes a weapon into Attacks / armour into AC automatically (`attacksFromInventory`
      and `computeAC` already do this correctly and are still uncalled) → belongs with Slice 15.
- [ ] AC / speeds / HP max / save DC / initiative read the ledger (abilities, saves, skills and
      attacks now do).
- [x] Equip validation (attunement limits, one body armour). **✅ SHIPPED 2026-07-17.** Attunement was
      already validated (`canAttune` + `ATTUNEMENT_CAP`); added the equip-slot rules to
      `engine/equipment.ts`: `canEquip(items, id)` enforces **one body armour at a time**, **one shield**,
      and **two-handed-weapon vs shield mutual exclusion** (both directions), returning a reason string;
      re-equipping something already on is a harmless no-op; unknown id → not ok. `equipChecked` equips
      only when valid (a no-op on conflict, exactly mirroring `attune`). The character reducer's `equip`
      case now routes through `equipChecked`, so the single mutation path can never reach an illegal
      equipped state. Systems without a hard rule still return ok (per the ground rule). `equipment.test.ts`
      +5. **Deferred within this item:** surfacing the `canEquip` reason as a toast in the Inventory UI is a
      visual-polish follow-up — the invariant is already enforced at the reducer.

---

### Original spec

One pure function that every later slice reads. Nothing else in Part II can be built first.

- [ ] `lib/dnd/effects/ledger.ts`: `buildLedger(char, ctx) → EffectLedger`. It walks EVERY source —
      equipped/attuned inventory items, `activeEffects[]` (consumed potions, spells cast on you, DM
      boons), features gated by `unlockLevel`, the active form/transform, conditions — and returns,
      **per target**: the base value, every contributing effect with its `source`, and the final value.
- [ ] Resolution order is documented and tested, not emergent: `set_base` → `set` (highest wins) →
      `add` (all stack) → advantage/disadvantage (both → flat). Ties broken deterministically.
- [ ] The ledger explains itself: every entry carries `{ source, sourceKind, label, delta }` so the
      tooltip in Slice 13 and the panel in Slice 12 are *reads*, not re-derivations. Two components
      computing "why is my STR 22" independently will drift; there must be one answer.
- [x] Swap the sheet's reads onto the ledger: abilities, AC, speed, HP max, save DC, initiative,
      skills, proficiency. This is the change that makes item effects real. **✅ COMPLETED** — most
      landed with Slice 10, and a base-vs-effective audit of the derived-value paths (`0295bdf2`,
      `ef5240b2`) caught the stragglers that still read BASE scores while the ability pills beside them
      showed effective: **Passive Perception + Save DC** (SavesSkills), **AC** (CombatPanel — derived from
      base DEX, so a DEX item never moved AC), **Initiative** in the StatRail *and* CombatPanel *and* the
      InitiativePrompt (the last one submitted the wrong encounter turn-order bonus), **CON-mod regen**,
      and **hit-die healing**. All now read effective abilities; initiative folds the `initiative` ledger
      target. `saves-skills-effective.test.ts` (2) + `derived-effective-abilities.test.ts` (7) guard
      against regression to the base scores. **Spellcasting + weapon + form sweep** (`4b5d7825`): the
      spell **Save DC** and **spell attack** (both `castSpell` and the `SpellsPanel` header) derived from
      BASE spellcasting ability, so a Headband of Intellect / CHA item never moved them — now effective,
      folding `spell_save_dc`/`spell_attack`; **weapon damage** flat mod used base STR/DEX; the StreamChat
      WIS save and the transform **FormAbilities** DC used base too (the form DC now correctly uses the
      form's imposed STR). `derived-effective-spellcasting.test.ts` (5). A repo-wide grep confirms no
      derived value still reads `abilityMod(char.abilities…)`. **AC unified to one source** (`537d770c`):
      the always-visible StatRail showed the manual `combat.ac` while the Combat panel showed the DERIVED
      AC — an armored character saw two different numbers. AC is now derived once in the store (`acInfo`,
      effective DEX + equipped armor/shield + AC effects) and both surfaces read it, satisfying Slice 13's
      "one answer" rule. The rail shows the derived AC (read-only, sourced) when equipment drives it,
      editable manual AC otherwise. `ac-single-source.test.ts` (5). **AC honors the equipped TAG**
      (`fc1e1200`): `deriveAc` checked only the `equipped` flag, so an item equipped via the `equipped`
      TAG applied its STR/speed bonuses (ledger's `isEquipped` honors the tag) but NOT its AC bonus — a
      split-brain result; fixed. **Same fix extended to the armour BASE (2026-07-17):** `fc1e1200` taught
      `deriveAc`'s +ac EFFECT sum to honor the tag, but the body-armour/shield SELECTION that sets the base
      AC still checked only the `equipped` flag — so a tag-equipped breastplate had its ring/effect bonuses
      counted while its own base AC was ignored, and the sheet showed the unarmoured/manual AC. Both halves
      of `deriveAc` now use one `isWorn` predicate (`equipped` flag OR `equipped` tag = the ledger's
      `isEquipped`; attuned-alone is not worn). `derive-ac.test.ts` +1 (a tag-equipped armour+shield sets
      the base). **⚠️ OPEN FINDING (needs a product call, not an autonomous guess):** the
      codebase disagrees on whether attunement ALONE (attuned but unworn) activates an item's effects —
      the ledger's `isItemActive` reduces to equipped-only, while `deriveAc`, `equipment.collectItemEffects`,
      and the ItemBuilder's "effects while equipped/attuned" label all say equipped-OR-attuned. So an
      attuned-but-unequipped item's AC currently applies but its STR does not. Left unchanged pending a
      decision on the intended rule; both paths should then use one shared predicate. **Ledger consistency
      pinned (2026-07-17):** verified the LEDGER itself — the source of truth for the sheet's displayed
      numbers — is internally consistent (an attuned-but-unworn item contributes NOTHING, neither STR nor
      AC; a worn item contributes everything), so the sheet can't show the split-brain on a single item.
      `ledger-attunement.test.ts` (3) characterizes this so a change to the ledger's attunement handling
      (i.e. implementing the eventual decision) fails loudly and gets reviewed. The cross-path decision
      (whether attunement ALONE activates effects, unifying the older `collectItemEffects`/`deriveAc` paths
      with the ledger) remains the owner's call — confirmed consolidating them is NOT behavior-preserving
      (`deriveAc` also honors the equipped TAG that `collectItemEffects` doesn't), so it can't be done blind. **Save DC unified the same way**
      (`4fcef838`): the StatRail honored the manual override while the Saves & Skills card recomputed
      8+PB+STR and ignored it — two Save DCs on one sheet. Now derived once in the store (`saveDc` =
      override ?? 8+PB+effective STR); both cards read it. `save-dc-single-source.test.ts` (3).
      **Max HP tone/display unified** (`42ceb2c8`): the rail showed BASE max HP and coloured its low-HP
      tone from it while the panel showed the effective max — a +HP buff moved one, not the other. The
      rail now reads the effective max (edit base, show effective with ★). `statrail-effective-maxhp.test.ts`
      (3). **Speed unified too** (`e1ad8caf`): the rail showed base `combat.speed` while the panel showed
      the ledger walk speed (items + the exhaustion −5ft/level penalty) — so exhaustion's speed hit, the
      mechanic the user asked to be real, was invisible in the rail. Now effective. `statrail-effective-speed.test.ts`
      (2). With AC, Save DC, Max HP, and Speed, the StatRail and the detail panels no longer disagree on
      any derived value — every prominent number on the sheet reads one ledger-effective source.
- [ ] **An equipped item lands in the right place, automatically.** Equipping routes by what the item
      *is*, with no per-item code: a weapon appears as a row in **Attacks** with its computed to-hit
      and damage; armour drives **AC** (respecting DEX cap / STR requirement / stealth disadvantage);
      a shield stacks; a consumable is usable from **Inventory**; a granted feature (Slice 11) appears
      in **Features**; a granted spell in **Spells**; a granted resource as a **resource track**.
      Each carries a badge naming the item it came from, and each disappears on unequip.
      `engine/weapons.ts` (`attacksFromInventory`) and `engine/armor.ts` (`computeAC`) already do this
      work correctly — they are simply not called by anything the player sees. Same root cause as
      above; same fix.
- [ ] Equipping is validated, not blind: attunement limits, "one body armour at a time", two-handed
      vs shield. Where a system has a hard rule, enforce it; where it doesn't, allow it and let the
      panel show the truth.
- [ ] Tests: base with no sources == the stored character (the no-op case must be exact, or every
      existing sheet silently changes); two items adding to one target stack; two `set`s take the
      highest; removing a source restores the base *exactly*.

**Done when:** equipping a +2 STR belt on any sheet changes the displayed STR, its modifier, the
athletics check, and the carrying capacity — with no code that knows what a belt is.

## Slice 11 — Effects can target anything (identity + grants) ✅ SHIPPED 2026-07-16

**Complete.** Grants: proficiencies, resistances/immunities/vulnerabilities, senses, movement modes +
flags, features, resources, attacks, spells — all resolve through the ledger and render sourced.
Identity: name/species/class/subclass, size/creature-type, portrait/token, and gender/pronouns/
profession — all overlay the display over an untouched base and revert on unequip. The one remaining
follow-up is `size` → carrying-capacity/grapple MECHANICS (it already displays); everything the request
named — "an item could literally turn the character into a completely different character" — works.
Details of each piece below.

The request's real ask: *"it could literally turn the character into a completely different character."*

**Identity header overlay ✅ SHIPPED (commit pending).** The ledger already resolved identity effects
(`ledger.identity(target)`) but nothing rendered them. The Hero header now reads the overlay for
**name, species, class, and subclass**: the display shows the imposed value (a worn "Pendant of Zul"
renders the character as *Zul*, class Barbarian), the editable name input still binds to the base
(edit writes base, display shows overlay), and each imposed field carries the ★ marker + its
why-popover. It's a true overlay — `applySheetEdits` never touches stored `meta`, so dropping/
unequipping the source restores the character byte-for-byte (tested). The Slice 14 item plumbing
already accepts identity effects (`{target:'name',operation:'set',value:'Zul'}`), so an AI-authored
pendant works end-to-end today. Tests: `identity-overlay.test.ts` (6) — impose-over-untouched-base,
null-when-none, gone-on-unequip, + Hero wiring anchors. 843 pass.

**Grant: proficiencies ✅ SHIPPED.** `grant_proficiency` (weapons/tools/languages — both the
`proficiency` and `grant_language` targets, which share that op) was collectable by the ledger but
rendered nowhere. `SavesSkills` now lists granted proficiencies under Skills, each badged "from
<source>", shown only when non-empty, and gone the moment the item comes off. Tests:
`grant-proficiency.test.ts` (4).

**Grant: damage resistances / immunities / vulnerabilities ✅ SHIPPED (commit pending).** Same
pattern: `collected('resistance'|'immunity'|'vulnerability')` was available but unrendered. The
Defenses card in `CombatPanel` now lists each, per-type, tagged with its source (vulnerabilities in
the danger colour), gated on non-empty. Tests: `grant-defenses.test.ts` (3) — collected+sourced,
gone-on-unequip, render wiring. **Condition-immunity conflation fixed (2026-07-17):** `condition_immunity`
is a DISTINCT target (a named condition — Frightened, Poisoned) but shares the `immunity` OPERATION with
damage immunity, and `collected('immunity')` filters by operation — so an authored condition immunity
rendered mislabeled inside the damage "Immune — fire, poison" list. Now each is collected by TARGET via
`explain('immunity')` / `explain('condition_immunity')` (with a local value-dedup) and condition
immunities get their own "Immune to conditions" line — the distinct Defenses home the registry promises.
`grant-defenses.test.ts` +2 (ledger keeps them on separate targets; the panel renders the new line).

**Grant: senses ✅ SHIPPED (commit pending).** `grant_sense` (darkvision 60, tremorsense…) uses op
`set`, so it's read via `ledger.explain('grant_sense')` rather than `collected`. The Defenses card
now shows a Senses line, each sense tagged with its source, gated on non-empty. This closes the
doc's explicit "senses… need somewhere to render" item. Test added to `grant-defenses.test.ts`.

**Still open in this slice (each its own render site / mechanic, deliberately not bundled):**
- *`size`/`creature_type` ✅ SHIPPED (display, commit pending).* Imposed size/creature-type now render
  in the Defenses card, sourced (an Enlarge potion → "Size — Large (Potion of Enlarge)"), gone on
  unequip. The size→carrying-capacity/grapple MECHANICS are still a follow-up; this makes the change
  visible so it isn't a lie. Tests: `identity-size.test.ts` (4).
- *`image`/`token` (portrait + map token) ✅ SHIPPED (commit pending).* Applied at the DISPLAY site
  only: `App.tsx` computes `artUrl = ledger.identity('image')?.value ?? vArt?.art ?? media.artUrl`
  (and the same for `token`), so a worn "Mask of Zul" overlays the shown portrait/token. The
  MANAGEMENT sites — `CharacterGallery`'s "which image is set as art" and `TokenFramer` — deliberately
  keep reading base `media`, so they still manage the character's OWN art, not the costume (the
  display-vs-management split this note flagged). The Slice-14 item plumbing already accepts identity
  effects (`{target:'image',operation:'set',value:'<url>'}`), so it works end-to-end. Tests:
  `identity-overlay.test.ts` (+2).
- *`gender`/`pronouns`/`profession` ✅ SHIPPED (commit pending).* Added as optional `meta` fields with
  a render home — a **Details** line in the Bio (Gender · Pronouns · Profession), editable in place by
  the owner/DM and overlay-aware (`ledger.identity(field)?.value ?? char.meta[field]`), so a Guise Ring
  can change your recorded profession over an untouched base. `set_meta` gained the three fields so the
  AI sets them too. Tests: `identity-overlay.test.ts` (+3). **Every identity field now has a render home
  and overlays correctly.** (The only identity follow-up left is `size` → carrying-capacity/grapple
  MECHANICS — size already *displays* the imposed value; wiring it to the number is a small mechanical
  add, not a missing overlay.)
- *`grant_feature` ✅ SHIPPED (commit pending).* An item can grant a feature (the pendant that gives
  a Wizard a Barbarian ability). `Features` reads `ledger.explain('grant_feature')` and renders each
  as a read-only card badged "granted / Granted by <source>" — no ⋯ menu (it's on loan), never baked
  into the stored features list, gone on unequip. Its mechanics ride on the item's other effects
  (already ledger-resolved); this is the human-readable card. Tests: `grant-feature.test.ts` (4).
- *`grant_resource` ✅ SHIPPED (commit pending).* Because a resource is a STATEFUL pool (charges +
  reset), it rides on a structured `grantsResource?: Resource` sub-object on the item (not a
  string-valued Effect). `add_item`/`update_item` accept + normalise it (current → full, sane
  colour/reset); a new exported `isItemActive` gates it on equipped (and attuned when attuned) with
  the SAME rule the effect collector uses; `Resources` renders it read-only, badged to its source,
  gone on unequip. Rendered without in-panel spend (the pool is on loan) — live spend + rest-reset
  is a follow-up. Tests: `grant-resource.test.ts` (5).
- *`grant_attack` ✅ SHIPPED (commit pending).* A full, rollable `grantsAttack?: Attack` on the item,
  normalised on ingest (id minted; ability→str and damage→1d6 fallbacks so a bogus grant never
  renders `-NaN`). `Attacks` builds one unified `rows` list (owned + granted) so both go through the
  SAME to-hit/damage path and can't drift; granted rows are badged to their item, carry no ⋯ menu
  (on loan), and vanish on unequip. Tests: `grant-attack.test.ts` (4).
- *`grant_spell` ✅ SHIPPED (commit pending).* A `grantsSpell?: Spell` on the item, normalised on
  ingest (id minted, level clamped 0–9, marked prepared). `SpellsPanel` no longer early-returns for a
  non-caster when an item grants a spell: the caster header/levels are guarded behind `sc && …` and a
  read-only "Granted Spells" block (name · level · school/range/components · description, badged to
  source) renders below, gone on unequip. Casting from granted slots is a follow-up. Tests:
  `grant-spell.test.ts` (4).

**All grant targets are now shipped.** The grant-half of Slice 11 is complete: proficiencies,
resistances/immunities/vulnerabilities, senses, movement modes + flags, features, resources, attacks,
and spells all resolve through the ledger (flat grants) or a structured item sub-object
(resource/attack/spell), render on the sheet badged to their source, and revert on unequip.
  `grant_feature` rendered cleanly because a feature card is fundamentally descriptive: a name + a
  source badge is a complete, honest card. An attack/spell/resource is *interactive* — an attack you
  roll needs its ability + damage dice; a spell you cast needs a level, components, and (for a
  non-caster granted a spell) a whole caster header the `SpellsPanel` currently bails out of; a
  resource track needs a max + reset rule. A single string-valued `Effect` can't carry any of that.
  The right shape is an item that carries a full sub-object (`grantsAttack?: Attack`,
  `grantsSpell?: Spell`, `grantsResource?: Resource`) which the ledger surfaces as an overlay — a
  focused slice with its own type work, not a one-line read. Documented here so it is scoped, not
  skipped.
- *A speeds block ✅ SHIPPED (commit pending)* — `speed_fly`/`swim`/`climb`/`burrow` now render in
  the Defenses card, each on its own ledger target (a fly speed exists independently of walk speed,
  and only shows once something grants it), starred + sourced. `hover`/`ignore_difficult_terrain`
  (flags) now render in the same block with their source, so the movement grant surface is fully
  covered. Tests: `grant-speeds.test.ts` (6).

Original action items (kept for the remaining work):

- [ ] **Identity targets**: `name`, `image`/`token`, `species`, `className`, `subclass`, `gender`,
      `profession`, `size`, `pronouns`. Operation `set_identity`. Overlaid by the ledger (see the rule
      above), never written to the model.
- [~] **Size** is mechanical, not cosmetic. **Carrying capacity ✅ SHIPPED** (`05bbe5b6`):
      `sizeCapacityMultiplier` scales `carryingCapacity`/`encumbranceLevel` (Tiny ½ … Gargantuan ×8), so a
      Large character carries double; +1 test. **Now visible ✅ SHIPPED** (`5c28bbdf`): the Inventory tab
      renders a "Carrying X / Y lb · <encumbrance>" line reading the ledger-effective STR + size (so a
      STR item or a size-change updates it live), `InvItem` gains an optional per-unit `weight`, and the
      item builder exposes a Weight (lb) input; `inventory-carrying.test.ts` (4) locks the wiring.
      (Weapon-damage-die scaling for some effects remains a later item.) The `size` effect target was
      already wired.
- [~] **Size** — weapon damage dice / grapple-shove legality. **Bonus-dice path ✅ SHIPPED**
      (`85a39e6e`): a new `weapon_bonus_dice` roll target (dice-valued, add-only) lets any effect add
      DICE to weapon damage — `damage_roll` only added a flat number, so Enlarge's +1d4, a flametongue's
      +1d6 fire, an elemental brand's +2d6 all had no home. `rollWeaponDamage` collects every
      non-suppressed ledger contribution, parses each into a typed segment (`parseBonusDamageSegment`),
      and rolls it into the weapon's damage with a BONUS DICE tag. So `size` now has a real mechanical
      route: **Enlarge = the size identity-set bundled with a +1d4 `weapon_bonus_dice` effect** — an
      authored, citable rule, not an invented auto-scaling of the base dice (which is not a PHB rule for
      PCs and would violate Ground Rule 3). Also fixed a latent `describeEffect` bug (dice-add rendered
      as "+0 <label>"). `weapon-bonus-dice.test.ts` (13).
      **DEFERRED — generic size→base-dice auto-scaling + grapple/shove legality gating.** Auto-doubling
      a PC's weapon dice by size is a Monster-Manual design convention, not a PHB rule for player
      characters, so deriving it automatically would invent a rule; the real mechanic is per-effect
      bonus dice, now shipped above. Grapple/shove size legality is a real rule but has **no home on the
      sheet** (no grapple/shove action UI to gate) — wiring a target that renders nowhere is exactly the
      "a target with no home is a lie" failure this doc forbids. Both revisit if/when a grapple UI or a
      per-system oversized-weapon rule lands.
- [ ] **Grant targets**: `grant_feature`, `grant_attack`, `grant_spell`, `grant_resource`,
      `grant_sense`, plus the existing `grant_proficiency`. This is the pendant that gives you an
      ability from another class entirely — the granted feature appears in Features with a badge
      naming the item it came from, and vanishes when the item comes off.
- [x] **Movement is not one number. ✅ SHIPPED** — `speed_fly`/`swim`/`climb`/`burrow` (+ `hover`,
      `ignore_difficult_terrain`) each render in CombatPanel's speeds block, shown only once granted
      (base 0 hidden), and **the AI digest now mirrors them** (2026-07-17): a granted non-walking mode
      surfaces as `STATE: … · Movement fly 60 ft, swim 30 ft`, so a ruling on "can you fly to the ledge?"
      sees what the sheet shows. `character-digest.test.ts` covers fly/swim + the base-0-hidden case.
- [x] **Senses ✅ SHIPPED** — `grant_sense` renders on CombatPanel's Senses line AND in the digest
      (`STATE: … · Senses darkvision 60 ft`), closing the "do you see in the dark?" blind spot for the AI.
- [x] **Every new target must have a home on the sheet, or it is a lie. ✅ (sheet + AI)** — the sheet was
      the first home; the AI digest is the *second*, and it was silently missing movement, senses and the
      whole Defenses card (resistance/immunity/vulnerability/condition-immunity). All four now project into
      the digest, reading the ledger with CombatPanel's exact logic (damage- vs condition-immunity kept
      distinct, not lumped). So the AI is no longer blind to capabilities the player can plainly see.
      **Digest↔CombatPanel parity completed (2026-07-17):** the first pass left two sheet facts still absent
      from the AI's copy — the movement FLAGS (`hover`, `ignore_difficult_terrain`; presence = the effect)
      and `condition_advantage` (Dwarven Resilience / Fey Ancestry "advantage on saves vs poison/charm",
      listed-not-auto-applied, so the AI must be *told* it exists). Both now emit (`Movement traits: …`,
      `DEFENSES: … · Advantage on saves vs: …`), so every effect-derived fact CombatPanel renders is now in
      the digest. `character-digest.test.ts` +2.
- [ ] A single item carries **any number of effects of any mix** — the "one boot that rewrites you"
      case is just an item with fifteen effects and must need no special code.
- [x] Tests: an item granting a Barbarian feature to a Wizard shows it in Features, sourced to the
      item, and gone on unequip; identity effects never mutate stored `meta`; a save-then-unequip
      round-trip leaves the model byte-identical to before it was equipped. **✅ SHIPPED 2026-07-17.**
      Identity-overlay non-mutation + unequip-drops-overlay + last-writer-wins were already covered
      (`identity-overlay.test.ts`); the gap was the **grant_feature BEHAVIOUR** — the render-path test
      only proved `Features.tsx` reads `explain('grant_feature')`, not that the ledger actually resolves
      one. Added three behavioural cases (`grant-render-paths.test.ts` +3): a Wizard wearing a
      `grant_feature` pendant sees "Rage (Barbarian)" in `explain()` sourced to the item and
      `isModified('grant_feature')`; the grant vanishes on unequip; an unworn pendant grants nothing.
      Full suite 1661 green.

## Slice 12 — The Active Effects sheet (every template) ✅ SHIPPED

`ActiveEffects` is mounted in `App.tsx` above the tabs, so it's on **every** template. It groups the
ledger's contributions by SOURCE (worn · attuned · consumed · spell · form · condition · DM · feature),
shows each source's resolved effect via the shared `describeEffect` (not the item's advertised text),
surfaces a suppressed contribution as "overridden — doing nothing", carries per-source duration and a
one-click **End effect** (which removes the CAUSE — unequip for a worn item, drop the ActiveEffect for
a consumed one), states "nothing active" rather than vanishing, and now shows each source's art
thumbnail (Slice 28). This is a READ of the ledger — it re-derives nothing.

**Consumption decision extracted + tested (2026-07-17):** the "Use" handler's decision — what a
consumable DOES (resolve an instant heal/temp now vs. snapshot a lasting condition/buff into an
ActiveEffect that outlives the item vs. note-only, and whether to decrement) — was tangled with the
I/O inside `Inventory.consume()`. Pulled the pure part into `lib/dnd/effects/consume.ts`
(`planConsume(item) → { instant, activeEffect, consumes }`), behaviour-preserving; the component now
just executes the plan (roll + apply, push the ActiveEffect, decrement). This is what makes Slice 12's
acceptance cases unit-testable: `consume-plan.test.ts` (9) pins that a **pure-heal potion leaves NO
ActiveEffect**, a **buff snapshots its label + effects + duration** (surviving the consumed item), a
status records the named condition, a note-only still consumes, and a missing-consumable item is a
no-op. Full suite 1655 green.

- [ ] A new tab/panel on **every** template listing every source currently modifying the character:
      each item/spell/ability/potion/form/condition, what it is, and **the exact effect it is having**
      — resolved values from the ledger, not the item's advertised text. If the belt's +2 is being
      overridden by the gauntlets' `set 21`, the panel must say the belt is contributing nothing.
      That divergence is precisely what the panel exists to surface.
- [ ] Group by source kind (worn · attuned · consumed · spell · form · condition · DM), each with its
      duration and a one-click **end effect**.
- [ ] **Consumption: the effect outlives the item.** This is the case the data model must get right,
      and it is why an `ActiveEffect` is a *separate source* from the item that produced it rather
      than a pointer back into inventory:
      - Using a consumable **decrements qty / removes the item immediately** — you drank it, it's gone.
      - Its **instant** effects (heal 2d4+2) resolve once and leave nothing behind. A healing potion
        therefore vanishes completely and never appears in the panel: there is nothing to show.
      - Its **lasting** effects become an `ActiveEffect` that *survives its item*, carrying a snapshot
        of what it grants, its label, its art and its duration — so the panel can still show
        "Potion of Storm Giant Strength · STR set to 29 · 1 hour" hours after the potion left the
        inventory. Clicking it shows exactly what it is doing.
      - A potion with **both** (instant heal + a 12-hour buff) does both: consumed and gone from
        inventory, still listed in the panel for its buff.
      - Because the snapshot is taken at use time, later editing the *item* must not retroactively
        change an effect already running on a character. That's a feature, not a bug.
      - **Ending** a consumed effect just drops the `ActiveEffect` — the item is long gone. Ending a
        *worn* item's effect unequips the item, because there the item IS the cause and an effect
        that is "off" while its cause is still worn would be a lie about the sheet.
- [ ] Durations are shown as authored ("12 hours", "3 rounds") and are **not** silently expired by a
      timer. This is a table aid, not a simulation; the DM decides when time passes. But the panel is
      what lets you *notice* at the start of next session — which is the whole point.
- [ ] A **Use** control on any consumable in Inventory runs the above. It is the only path that
      consumes, so there is one place where "drank it" is implemented.
- [ ] Tests: an item with effects always appears; a pure-heal potion is consumed and leaves NO panel
      entry; a buff potion is consumed and its effect still shows with its label and duration; a
      heal+buff potion does both; editing the item afterwards does not mutate the running effect;
      ending a worn effect unequips, ending a consumed effect does not resurrect the item; the
      panel's numbers equal the ledger's (one source of truth).

## Slice 13 — Show me what's touched: the star + the tooltip ✅ SHIPPED 2026-07-16

**Shipped as a reusable, accessible marker (commit pending).** `EffectStar` (`components/ui/EffectStar.tsx`)
is one component every affected value uses: it reads the ledger (`isModified`/`explain`/`byTarget`),
renders nothing when nothing is active (no false-positive stars on a vanilla stat), and when
something is, renders the value in the teal `is-modified` tint plus a ★ **button** — keyboard- and
touch-reachable, not the old hover-only `title`. Clicking it opens an inline-safe popover (all
`<span>`s, reusing RuleTip's `.ruletip-pop` chrome so it can live inside a `<p>` without the
paragraph-force-close trap) that lists every contribution — base → each source → resolved total,
suppressed contributions struck through so "my belt does nothing" has an answer. The native `title`
+ `aria-label` carry the same summary for the hover/SR path. Token-driven throughout (the contrast
guard would fail a literal). Wired into: **abilities** (Abilities tab), **saves + skills + custom
checks** (keyed to the governing ability — what actually moves the roll), **passive perception**
and **save DC** (lead line), and **attack to-hit + save DC** (Attacks table). `StatRail`'s ability
pills keep their lightweight title-star because they sit inside a roll `<button>` (button-in-button
is invalid HTML). Tests: `effect-star.test.ts` — ledger no-false-positives / stars-exactly-that /
names-every-source / suppressed-surfaced, plus source anchors for the accessible-button, inline-safe,
token-only, and per-stat wiring invariants (826 pass).

**Scope note — the ledger-folding of raw combat numbers.** The star marks values whose *displayed
number already reflects the ledger* (abilities and everything derived from them). Progress on the
raw combat numbers:
- **Walk speed ✅ folded + starred** (commit pending). `CombatPanel` now shows
  `ledger.value('speed_walk', combat.speed)` and stars it — a Boots of Striding +10 renders 40 ft
  with the ★. Speed is display-only, so this has none of max-HP's heal-clamp interaction.
- **Max HP ✅ folded + starred (commit pending).** The clamp entanglement is solved: a store helper
  `effMaxHp(c) = buildLedger(c).value('hp_max', c.combat.maxHp)` is now the heal ceiling at ALL three
  clamp sites (`adjustHp`, the feature heal, the cast heal), and `CombatPanel` shows the effective max
  (starred) with the displayed current clamped to it. Pure overlay: stored `maxHp` is never written,
  so a Belt of Vitality (+10) heals you to 78 and dropping it re-derives you to 68 without leaving you
  "over max". Tests: `hp-fold.test.ts` (4).
- **AC ✅ already folded via `deriveAc`.** The Defenses AC line and the AI digest both run `deriveAc`
  (equipped armour/shield + AC effects), so AC is effective everywhere it's shown — the ledger's `ac`
  target composes into that path rather than double-counting. No separate work needed.

### Original spec

> "effected stats numbers and stuff will just get a little star or something we can hover over."

- [ ] Any ledger-modified value renders a marker (★) beside it and a highlight ring: abilities, AC,
      speed, HP, saves, skills, attacks, DC, granted features.
- [ ] Hover/focus → tooltip listing **every** contributing effect and its source, base → final
      ("STR 18 base · +2 Belt of the Bear · +2 Rage · = 22"). Reuse `RuleTip`'s inline-safe `<span>`
      popover — the invalid-nesting bug from Slice 2 (a `<div>` inside a `<p>` gets force-closed by
      the browser, tearing text out of its element) is already solved there; do not re-solve it.
- [ ] Keyboard + touch reachable. A hover-only affordance is invisible on a tablet at the table,
      which is where this is actually used.
- [ ] The marker must be theme-token driven (`var(--gold)` etc.), never a literal — the contrast
      guards in `sheet-contrast.test.ts` will fail the build otherwise, and correctly so.
- [ ] Tests: an unmodified sheet has zero stars (no false positives — a star that's always on is
      noise); modifying one ability stars exactly that ability; the tooltip names every source.

## Slice 14 — The AI generates real items, not labels ✅ SHIPPED 2026-07-16 (mechanical effects)

**Shipped: items carry real, ledger-resolved effects (commit pending).** `add_item` (and the new
`update_item`) now take the full `InvItem` — `kind`, `equipped`, `attuned`, `image`, `weapon`/
`armor`/`consumable` stats, `tags`, and crucially **`effects: Effect[]`** — through one shared
`ItemPayload` shape, so a generated item and a hand-built one are indistinguishable. `equip_item`
toggles whether the effects apply. The end-to-end test that matters passes: an AI-emitted "Belt of
the Bear" (`{target:'ability_str',operation:'set',value:19}`) actually moves STR to 19 through the
ledger while the base stays 16 (overlay, not bake), and unequipping gives the character back exactly.

**Rejected, never coerced.** Effects are validated at the boundary against the registry
(`cleanEffects` drops any unknown target / illegal operation / non-numeric value so no NaN or
garbage reaches the ledger), and `validateSheetEdits` reports what was dropped — the ai-edit route
appends "⚠ Dropped N invalid effect(s): …" to its summary so a bonus that didn't take is *visible*,
not silently missing. The tool schema documents the effect shape and the registry keys; `equip_`
was added to the ai-scope prefix allow-list. Tests: `ai-items.test.ts` (10) — round-trip to a
changed number, unequipped contributes nothing, +N AC/attack stack, unknown target dropped+reported,
illegal op rejected, non-number rejected, update/equip refine without rebuild, schema exposes it.

**Still open (tracked elsewhere, not this slice):**
- *Identity/grant effects on items* (a pendant that renames you or grants a class/level) ride on
  **Slice 11** (identity + grant vocabulary). The item *plumbing* is ready — those targets validate
  and resolve the moment Slice 11 lands; nothing more is needed here.
- *The manual "Add effect" builder* (a player authoring the same `Effect[]` by hand) is **Slice 17**.
  The AI path and the manual path must produce the same shape — this slice defined that shape.
- *Item art generation* is deliberately deferred (the spec: art is the least important part and must
  never block mechanics). `image` is accepted and stored; generating one is future work.
- *DM provenance/approval* for generated items reuses the existing `summarizeCharacterProvenance`
  path (Slice 5); no new approval surface was added.

### Original spec (superseded above for the shipped parts)

- [ ] Widen `add_item` in `lib/dnd/sheet-edits.ts` to the full `InvItem`: `kind`, `desc`, `qty`,
      `image`, `weapon`/`armor`/`consumable` stats, `attuned`, and **`effects: Effect[]`** — the whole
      point. Add `update_item` and `equip_item`.
- [ ] Validate hard at the boundary: unknown target/operation → reject the edit, don't coerce it. An
      item whose effect silently didn't parse is worse than a refused one, because the player believes
      it works.
- [ ] Prompt: given "a random potion that gives proficiency in something", the AI emits a real item
      with real effects, appears in inventory, and works. Ground it in the character's system so a
      generated item obeys that rulebook's vocabulary.
- [ ] **Art**: generate/attach item art (`dnd-media`, `kind='item'`), falling back to a kind icon.
      Per the request, art is the *least* important part — it must never block the mechanics.
- [ ] Balance guard: DM-facing provenance. Generated items route through the existing
      `summarizeCharacterProvenance` / approval path (Slice 5's) rather than a new one — a player
      generating a +10 sword is a table problem, and the DM approval surface already exists.
- [ ] Tests: a described item round-trips to effects that the ledger resolves; an invalid effect is
      rejected, not coerced; a generated item changes the sheet's numbers end-to-end.

**Done when:** "give me a pendant that makes me a Level 3 Barbarian named Zul with +2 STR and a
different portrait" produces one item that does all of it, and taking it off gives you back exactly
the character you were.

## Slice 15 — Attack, weapon & armor builders (+ reactive effects) ✅ SHIPPED 2026-07-16

> "We might have an enemy that when they attack us and hit us, the armor does a certain amount of
> damage back to them… even a piece of armor could potentially have a roll to attack and a roll for
> damage."

**Builders ✅ SHIPPED:** attacks are editable/creatable by hand (`AttackEditor` + "Add attack",
Slice 20/27) with name/ability/proficiency/to-hit+damage bonuses/range/typed damage/save-DC; the
`ItemBuilder` is the weapon builder (damage dice + type, ability, range, proficient, bonus typed
dice) and the armor/shield builder (category, base AC, DEX cap, stealth) with the full `effects`
vocabulary (Slice 11), so "armour that changes your species" is just armour with an identity effect.
**`Trigger` concept — core ✅ SHIPPED (commit pending).** The reactive-effects data model + resolution
+ surfacing are done: a `Trigger` type (`{on, condition?, label, action, limit}`) on items and
features, where `on` is one of eleven events (`hit_by_melee`…`reduced_to_zero`) and `action` is a
prompt-shaped payload (roll damage/heal/temp-HP, apply a condition, grant an effect, spend a resource,
or DM-adjudicate). `lib/dnd/effects/triggers.ts` collects the ACTIVE triggers (equipped items +
unlocked features, condition-gated by the same rule the ledger uses — now LITERALLY shared: triggers
imports the ledger's exported `isItemActive` instead of a hand-kept copy that could drift, `19cad91e`,
+1 test proving agreement on the attuned-but-unequipped edge), filters them by event
(`triggersForEvent`), and describes them (`describeTrigger`). A **Reactions & Triggers** panel on
every sheet lists them grouped by event ("When hit by a melee attack — Spiked Barbs: 1d6 piercing,
from Spiked Armour"). Kept firmly a PROMPT, not automation — nothing auto-applies damage to a creature
the app can't see. Tests: `triggers.test.ts` (8) — collection, equip/level/condition gating,
per-event filter, description, render wiring.

**AI authoring ✅ SHIPPED (commit pending).** `add_item`/`update_item` now accept a `triggers` array
(the tool schema documents the events, action kinds, and limit), validated at the boundary by
`cleanTriggers` — a bogus event or missing label is dropped, a bad action kind falls back to a DM
prompt, never coerced into something wrong. So "give me spiked armour that hits back for 1d6 when I'm
hit in melee" produces a real, surfaced trigger. Tests: `triggers.test.ts` (+2, 10 total).

**Manual builder ✅ SHIPPED (commit pending).** `TriggerRows` (mounted in `ItemBuilder`) authors the
SAME `Trigger` shape by hand — an event picker from the registry, a name, an action kind with its
dice/type/condition fields, and a live `describeTrigger` preview — so a hand-built and an AI-built
reaction are indistinguishable, validated by `cleanTriggers` on save. Player/AI parity, exactly like
the effect builder. Tests: `triggers.test.ts` (+1, 11 total).

**Player-initiated resolution ✅ SHIPPED (commit pending).** Each dice-bearing reaction in the panel
has a **🎲 Roll** button that fires it into the log (damage → `rollDmg`, heal/temp → `rollExpr`); a
condition/note reaction is shown but not rolled (a DM adjudication). This is the correct model, not a
compromise: the app deliberately doesn't model the enemy that hit you, which is exactly WHY the doc
mandates triggers are PROMPTS not automation — so the player fires the reaction when its event occurs.
The trigger system is now complete end-to-end: author (AI + manual) → surface (grouped by event) →
resolve (roll on demand). Tests: `triggers.test.ts` (12).

**Optional refinement (not blocking):** auto-*surfacing* the few events the app CAN detect (a natural
20 → `you_crit`) by highlighting the matching reaction in the log. Most events (hit_by_melee, you_hit
against an AC the app doesn't know) are inherently player-declared, so this is a small polish on top
of a complete loop, not a gap.

**The gap this exposes.** Every effect in the engine today is a *continuous overlay*: it is true for
as long as its condition holds, and the ledger's job is to resolve it into a number. Retaliation
damage is not that. It is an **event-triggered action** — it fires *when something happens*, it rolls
dice, and it targets someone who is not you. The ledger cannot express it, and stretching `Effect`
to cover it would wreck the thing that makes the ledger tractable (pure, order-independent, always
re-derivable). So triggers are a **separate concept** that lives beside effects, not inside them.

- [ ] **Attack editing** (the plain ask, first): edit and create attacks directly on the sheet —
      name, ability, proficiency, to-hit and damage bonuses, range, typed damage, crit range/dice,
      notes. Today `add_attack` exists for the AI but the player cannot author or edit one by hand.
- [ ] **Weapon builder**: define a weapon's mechanics — damage dice + type, properties (finesse,
      versatile, reach, two-handed, thrown, loading, ammunition), mastery (2024), range bands,
      attack/damage effects, and **on-hit riders** (extra typed damage, a save-or-condition, a
      resource cost). The derived attack row comes from the weapon, so changing the weapon changes
      the attack — no double authoring.
- [ ] **Armor / clothing builder**: base AC, armour category, DEX cap, STR requirement, stealth
      disadvantage, resistances, and arbitrary `effects` (Slice 11's full vocabulary — armour that
      changes your species is just armour with an identity effect).
- [ ] **`Trigger` — the new concept**: `{ on, condition?, action }`.
      - `on`: `hit_by_melee` · `hit_by_ranged` · `hit_by_spell` · `you_hit` · `you_crit` ·
        `you_are_crit` · `save_failed` · `turn_start` · `turn_end` · `damaged` · `reduced_to_zero`.
      - `action`: roll damage (typed, with its own dice + optional attack roll), heal, apply a
        condition, grant a temporary effect, spend/restore a resource, or a DM prompt.
      - Triggers may carry their own limits (`once per turn`, `N per long rest`, a resource cost) —
        unlimited retaliation is the failure mode here, and the data model must be able to say no.
- [ ] **Triggers are prompts, not automation.** When a trigger's event happens, the sheet *surfaces*
      it ("Spiked Barbs: 1d6 piercing to the attacker — roll?") and the player/DM resolves it. It must
      not silently apply damage to a creature the sheet does not model. Guessing that a hit landed, or
      auto-resolving against an enemy the app has never seen, is how the sheet starts lying about the
      table's actual state — and a wrong automatic ruling is worse than a visible reminder.
- [ ] Triggers surface in the Slice 12 panel and are starred by Slice 13 like anything else, so
      "why did my armour just do something" always has an answer on the sheet.
- [ ] The AI (Slice 14) can author all of it: "armour that burns anyone who hits me" → an armour item
      with a `hit_by_melee` trigger rolling fire damage, in the inventory, working.
- [ ] Tests: a weapon's edits flow to its attack row; an armour's DEX cap is respected by the ledger's
      AC; a trigger fires only on its event and only within its limit; a trigger with no limit is
      flagged; retaliation never mutates another character's sheet.

## Slice 17 — The effect builder: "Add effect" by hand ✅ SHIPPED 2026-07-16

> "We basically need to create an item, click 'add effect' to it, then select effects and define the
> numbers for those effects."

The AI path (Slice 14) and the manual path must produce the **same `Effect[]`**. If they diverge,
the AI becomes the only way to make a good item and hand-authoring becomes second-class.

**Registry-driven picker ✅ SHIPPED (commit pending).** `ItemBuilder`'s `EffectRows` (the "+ Add
effect" control on every item) was a free-text target field — you typed the target string yourself,
and its own hint suggested `str_score`, which isn't a registry key, so a typo produced an effect the
ledger silently rejected. It's now **built from `EFFECT_TARGETS`**: the target is a `<select>`
grouped by `TARGET_GROUP_LABELS` (abilities → … → special), the operation dropdown is constrained to
that target's allowed `ops`, and the value control is chosen by the target's `valueType` (number
input · text input · none for a flag). Picking a target resets op+value to valid defaults, and the
target's `help` + `rendersAt` show as a live hint. Because it shares `EFFECT_TARGETS` with the AI's
tool schema and the ledger, the manual and AI paths now emit the same validated shape — a new target
appears in the picker automatically and can't be forgotten. Tests: `effect-builder.test.ts` (4),
including a guard that EVERY registry target's default (first op + type-appropriate value) validates.

**Plain-English preview line ✅ SHIPPED (commit pending).** Each effect row now shows a live preview
from `describeEffect` — the SAME renderer that drives the ★ tooltip and the Active Effects panel — so
what you author reads exactly as the sheet will describe it ("+2 STR", "advantage on Stealth",
"Resistance: fire"). One renderer, three readers, no drift.

**Validate-on-save with a reason ✅ SHIPPED (commit pending).** `save()` runs every effect (item +
consumable-buff) through the same `validateEffect` the AI path uses and refuses with a readable
message ("Effect "Resistance: ": …needs a value.") rather than saving a broken effect the player
would believe works.

**Per-effect condition gate ✅ SHIPPED (commit pending).** Each row has an optional "if… (raging)"
field wired to the engine's `condition` — blank = always on (while equipped), a named condition
applies only while active — and it flows into the `describeEffect` preview ("+10 Walking speed (while
raging)"), so the preview and the ★ tooltip read it identically. (Timed durations for *passive* item
effects don't apply — an item effect lasts while worn; timed durations live on consumables/
ActiveEffects, which have their own duration field.)

**Reused in the feature editor ✅ SHIPPED (commit pending).** `EffectRows` is now exported and mounted
in `FeatureEditor`, so a class/species feature authors real effects through the SAME builder as items
(a feature that grants +1 AC or a fly speed changes the sheet like an item would). One builder, no
second implementation to drift.

**SpellEditor mount ✅ SHIPPED 2026-07-16** (as the `Spell.effects` slice under Slice 15/25). A spell
now carries `effects` authored through the same `EffectRows`, snapshotted into an `ActiveEffect` on
cast so the ledger resolves it like a potion. The builder is now on item + feature + spell +
consumable-buff editors — the whole authoring surface.

- [ ] On any item/spell/feature editor: an **Add effect** button → pick an effect type → fill in its
      numbers. Repeatable; an item holds any number of effects.
- [ ] The picker is **built from the effect vocabulary**, not a hand-written menu, so a new operation
      shows up in the UI automatically and cannot be forgotten. Grouped for humans:
      - *Modify a number* — ability, AC, speed, HP, save DC, initiative, a skill, attack, damage.
        `add` (stacks) or `set` (overrides). **Negative values are first-class** — a cursed item that
        gives −2 DEX is the same machinery as a +2 belt, and the UI must not fight it.
      - *Advantage / disadvantage* — on a named roll.
      - *Grant* — proficiency, expertise, a feature, an attack, a spell, a resource, a sense.
      - *Resistance / immunity / vulnerability* — to a damage type.
      - *Identity* — name, art/token, species, class, subclass, gender, profession, size, pronouns.
      - *Instant* — heal, temp HP, damage, restore a resource. (Fires once on use; see Slice 12.)
      - *Duration* — permanent while worn · while attuned · timed ("12 hours") · until ended.
      - *Trigger* — Slice 15's event actions.
      - *Transform* — Slice 18.
- [ ] Each effect gets a **plain-English preview line** as you build it ("+2 STR while equipped",
      "disadvantage on Stealth"). An effect builder whose output you can't read is how you end up
      with items nobody trusts.
- [ ] **Condition/gating** per effect: unconditional, while equipped, while attuned, or gated on a
      named condition (`raging`, `bloodied`) — the engine's `condition` field, exposed.
- [ ] Validate on save: unknown target → refuse with a reason. Never silently drop an effect; the
      player will believe it works.
- [~] Tests: every operation in the vocabulary is reachable from the picker (a guard that fails when
      someone adds an operation and forgets the UI); a hand-built item and an AI-built item with the
      same mechanics produce identical `Effect[]`; a negative modifier round-trips.
      **Reachability guard ✅ SHIPPED** (`5f0ec149`): `EFFECT_OPERATIONS` — a runtime roster kept
      exhaustive at compile time (`satisfies Record<EffectOperation, 1>`) — plus a test that each op is
      offered by ≥1 target (the picker renders `def.ops`, so unlisted = unpickable). +10 tests. The
      negative-modifier round-trip is covered by `effect-targets.test.ts` (validate + describe of a −2);
      the hand-vs-AI identical-`Effect[]` guard is the existing "builder produces the same Effect[] the
      AI emits" registry-driven suite.
      **Description-coverage companion guard ✅ SHIPPED (2026-07-17):** reachability proves an operation is
      PICKABLE; this proves it's DESCRIBABLE. `describeEffect` is the plain-English label shown in the ★
      tooltip / Active Effects panel / builder preview ("hover tooltips on every in-play effect") — but its
      `operation` is typed `string`, so an op with no explicit case falls through to the generic `${label}`
      default, rendering the effect's bare target name instead of what it DOES. Added an `it.each` over
      `EFFECT_OPERATIONS` asserting `describeEffect` has an explicit case for each — so a new operation can't
      ship a meaningless tooltip. All 10 covered. `effect-builder.test.ts` +10.

## Slice 18 — Transform: become a different character entirely ⏳ PARTIAL 2026-07-16

> "maybe a spell turns us into a bear, then we would suddenly have the bear character sheet. We would
> need to be able to end the effect and revert back to our normal character sheet."

**Transform-by-effect core ✅ SHIPPED (commit pending).** A `transform` effect on an item/spell/potion
now IMPOSES a form: the ledger resolves it (`imposedTransform` / `ledger.transform()`), and that
imposed form's OWN effects (a bear's STR 19, +10 speed, fly speed…) apply through the ledger — so an
equipped "Wild Shape Focus" actually transforms you *mechanically*, and unequipping reverts exactly.
It's a true overlay: the character's stored `activeFormId` and base stats are NEVER written (the
anti-"permanent bear" guarantee — a save mid-transform can't strand a druid as a bear). Last transform
wins; the base form never contributes. Tests: `transform.test.ts` (5) — impose, apply, base-untouched,
revert-on-drop, and manual-form-still-works.

**Render threading ✅ SHIPPED (commit pending).** The store now exposes an EFFECTIVE `activeFormId`
(`ledger.transform()?.value ?? char.activeFormId`), and the six form-reading components — Attacks
(strikeDie + form-only gating), DiceTray, FormAbilities, Forms (active highlight), SavesSkills (form
stealth), StatRail (form label) — read it instead of `char.activeFormId`. So an imposed transform now
shows the form as active across the whole sheet, while the Forms toggle still writes the BASE id (the
transform stays an overlay). Combined with the resolution + ledger-effect overlay, a character's own
form can now be triggered by an item/spell, renders fully, and reverts exactly. Tests:
`transform.test.ts` (8).

**Carry-over policy — `keepFeatures` ✅ SHIPPED (commit pending).** Ground Rule 1 made real: a form
declares its own `carryOver` policy (`{ keepFeatures?, keepMental?, separateHp? }` on `CharForm`)
rather than the engine hardcoding one game's answer. `keepFeatures: false` is a **true polymorph** (5e
Polymorph): while the form is worn, the ledger drops the character's OWN sources — equipped/attuned
gear and class/species features — so their kit "melds away", but externally-imposed sources (a Bless
still on you, a DM boon, a condition) persist, and the form's own effects apply. Omitted/undefined =
Wild Shape-style "keep everything you have" — the ORIGINAL behaviour, so every existing form is
byte-for-byte unaffected. It stays a pure overlay: the moment the form drops, the full unfiltered base
is derived again (the anti-"permanent bear" guarantee holds through the stricter policy too). Filter
lives in `collectSources` (`EXTERNAL_KINDS`); tests: `transform.test.ts` (+3 — Wild-Shape default keeps
gear+features, polymorph drops them but keeps Bless, drop-form restores the full base).

**Carry-over policy — `keepMental` ✅ SHIPPED (commit pending).** The second policy flag: `keepMental:
true` means the form doesn't change your MIND — the form's own effects targeting INT/WIS/CHA are
dropped, so your base mental scores stand while you still take the form's body. It matters when a form
would *raise* a mental stat (an Archmage form, INT 20): the existing set-max rule already stops a dumb
beast from *lowering* you, so keepMental is specifically the "your intellect is your own even in a
smarter shape" rule. Omitted = the form sets whatever it sets (today's behaviour). `MENTAL_TARGETS`
guard in `collectSources`; tests: `transform.test.ts` (+2).

**Carry-over policy — `separateHp` ✅ SHIPPED (commit pending).** The third and last policy flag, and
the one that needed real state rather than an overlay: a `separateHp` form gets its OWN HP pool
(`char.formHp = { formId, current, max }`, a scratch field — base `combat.currentHp`/`maxHp` stay
frozen underneath). Pure core in `lib/dnd/effects/form-hp.ts` (`routeFormDamage`): damage hits the pool
first; when it empties the form ENDS and the overflow returns to your real HP; healing tops up the pool,
not the base. Wired at a single point — the store's `adjustHp` — which lazily seeds the pool to the
form's effective max HP (its `hp_max` effect, resolved by the ledger) on first hit, so no form-entry
path has to know about it, and clears it (with `endTransform` / `nextTurn`) when the form ends. Still
honours the anti-"permanent bear" guarantee for HP: your base HP is only ever reduced by true overflow,
never overwritten, so ending the form leaves the real you exactly where you were. `isFormHpLive` guards
a stale pool from a form you already dropped. Tests: `form-hp.test.ts` (9 — inside-pool, exact-empty,
overflow-to-base, floor-at-0, heal-the-pool, over-heal-clamp, stale-pool guard, + store wiring anchors).
**All three carry-over flags (`keepFeatures` / `keepMental` / `separateHp`) now ship.**

**And the pool is VISIBLE ✅ SHIPPED (commit pending).** The HP card (`CombatPanel`) now surfaces a live
`separateHp` pool: when the effective active form owns `char.formHp`, it shows "**<Form> HP <cur> /
<max> · your own <n> HP is held until the form ends**" under the main number — so the draining
form-HP is what the player watches, and it's plain that the real character is safe underneath. Gated
on `char.formHp.formId === activeFormId` (the effective, imposed-aware id), so a stale pool never shows.
Tests: `form-hp.test.ts` (+2 anchors). The mechanic is now player-facing, not just correct-in-core.

**Remaining — only the arbitrary foreign-statblock swap.** "Become a bear you don't have as a form /
become another PC entirely" (a whole foreign sheet, not one of your own `forms`) still needs a form
authored as a full sheet (Slice 17's builder over a form) — there is no form-editor UI on the sheet yet
(Forms.tsx is display+toggle only), so forms + their carry-over policy are authored in data for now.
That authoring UI is the only heavier half left; transforming into your OWN defined forms — the common
case — is done end-to-end, now with the complete carry-over policy (true-polymorph `keepFeatures`,
keep-your-mind `keepMental`, and separate-pool `separateHp`).

### Original spec

Slice 11 overlays *fields*. This overlays the **whole sheet** — and it is the strongest argument for
the overlay rule, because "you are a bear now" must be perfectly reversible.

- [ ] A `transform` effect names a **form**: a stored sheet (a statblock, a creature, another
      character). While active, the sheet **renders the form**.
- [ ] The base character is **never overwritten** — it is the thing underneath. Reverting is dropping
      the source, exactly like any other effect. (If transform mutated the sheet, an autosave
      mid-transform would leave a druid permanently a bear, with their real character gone. This is
      the failure this whole design exists to prevent.)
- [x] **What carries over is a per-form rule, not a guess.** (`keepFeatures` + `keepMental` +
      `separateHp` ✅ all shipped.) 5e Wild Shape keeps INT/WIS/CHA,
      personality, and your own features; it takes the beast's STR/DEX/CON, AC, speed and attacks; HP
      is a separate pool and damage overflow returns to you. Other systems and homebrew differ. So a
      form declares its own carry-over policy (`keepMental`, `keepFeatures`, `separateHp`, …) rather
      than the engine hardcoding one game's answer — Ground Rule 1.
      **⚠️ OPEN FINDING — a weak form can't lower physical stats (needs a rules call, not an autonomous guess).**
      The ledger resolves `set` as `Math.max(base, override)`, so a `set` RAISES but never LOWERS below the
      base. That's correct for ITEMS (a Belt of Giant Strength "has no effect if your STR is already higher"),
      but a FORM by RAW REPLACES physical stats even when lower — a STR-20 druid who Wild Shapes into a rat
      should be STR 2, yet today stays 20. The transform code even leans on the max rule ("stops a dumb beast
      from lowering you") though `keepMental` is the real mechanism for the mental case. Fixing it means giving
      form-sourced `set` REPLACE semantics while items keep max — a change to the ledger's core resolution
      (55+ tests), so it's the same shape of deliberate call as the attunement question, left for the owner.
      Current behavior is now pinned by `ledger-set-max.test.ts` (3), so any future change is explicit +
      reviewed.
- [ ] Forms are **authored with the same builder** as characters (Slice 17) — a form is a sheet. A DM
      can define a bear once and reuse it; a player can be turned into another PC.
- [ ] The Active Effects panel (Slice 12) shows the transform as the source it is, with **End
      transform** — and, per the request, that is how you get back.
- [ ] While transformed, the panel and the star markers (Slice 13) still explain the *form's* numbers,
      so "why is my AC 11" has an answer while you are a bear.
- [~] Damage taken in form, resources spent in form, and duration are tracked on the form instance,
      not on the base sheet. (HP ✅ — `char.formHp` pool via `separateHp`, base frozen; duration already
      on `combat.transformTurnsLeft`. Form-scoped RESOURCE pools remain a follow-up under the
      foreign-statblock authoring UI.)
- [x] Tests: transform → the sheet renders the form; the stored base character is byte-identical
      throughout (the anti-"permanent bear" guard); revert restores exactly; carry-over policy is
      honoured per form; a save while transformed does not corrupt the base. **✅ SHIPPED 2026-07-17.**
      `transform.test.ts` covered resolution, the form's own effects, the two-field overlay check, revert,
      and the keepFeatures/keepMental/separateHp policies; **strengthened the byte-identical guard at the
      resolver** — three new cases assert `buildLedger` leaves its input deep-equal (base form, imposed
      transform active, and your own bear form), i.e. the render path itself never bakes an overlay into
      the base. This is the general invariant the "STR stays 10" symptom rides on; a future refactor that
      cached derived state back onto the character fails these loudly. `transform.test.ts` +3 (16 total).
      **Deferred (the only heavier half):** the arbitrary foreign-statblock authoring UI (Forms.tsx is
      display+toggle only) — transforming into your OWN defined forms is done end-to-end.

## Slice 20 — Edit everything on the sheet, and mark what's been customized ✅ SHIPPED 2026-07-16

**Edit in place ✅** — attacks, items, features, spells, resources and traits all have in-place
editors reached via the ⋯ menu (Slices 27/33); add/duplicate/delete too. All route through the store's
`setChar` (→ autosave + `dnd_sheet_edits` audit), not a parallel path.

**✎ customized marker ✅ (commit pending).** The user's ask verbatim: *"If the stats are edited, then
there should be some kind of marker showing that the thing has been customized."* Shipped exactly
that: a `customized?: boolean` on Attack/InvItem/Spell/FeatureBlock, set by each in-place editor via
`nextCustomized(original, draft)` — which flips on only when a save actually **changed** the element
(a no-op save doesn't false-trigger; the flag ignores itself when comparing; once set it stays). A
shared `EditMark` renders ✎ (gold, token-driven) next to the element name on all four tabs, with a
"hand-customized" tooltip, and it is a DISTINCT marker from ★ (nothing shared — ★ = modified now, ✎ =
differs from how it came). **The AI edit path marks ✎ too** — `applySheetEdits`' `rename_*` and
`update_item` set `customized`, so an AI edit is flagged the same as a hand one. Tests:
`customized-marker.test.ts` (14). Verified the whole session's cross-cutting changes compile in a
production `next build` (the server digest safely imports `deriveAc`/`buildLedger`).

**Deferred — "what changed" detail + Revert to official.** The hover showing "damage 8d6 → 10d6" and
a one-click revert need the ELEMENT'S OFFICIAL source values to diff against, which requires a
per-system content catalog with full stats (the vanilla catalog tracks names, not values) — its own
slice. The shipped marker answers the user's literal ask ("this has been hand-customized"); the
diff/revert is the planner's gold-plating on top.

### Original spec

> "I want to be able to edit attacks and abilities and spells and stuff in the character sheet. If the
> stats are edited, then there should be some kind of marker showing that the thing has been
> customized."

- [ ] **Edit in place**: attacks, abilities/features, spells, resources, skills, inventory items,
      traits. Add · edit · duplicate · delete · reorder. Every one of these already exists as *data*;
      most have no editor.
- [ ] **The two most-reported cases, called out so they can't be lost in the list** (asked for three
      separate times, with screenshots of Jack's Attacks table and Gear list):
      - **Attacks**: rename "Backless Park Bench", and edit its range, to-hit, damage die, damage
        type and description — from the Attacks table itself. Right now the whole table is read-only
        prose; the only editable thing on it is the roll buttons.
      - **Inventory items**: rename an item and edit its description, quantity, kind and stats from
        the Gear list. Same story — the rows render, nothing about them opens.
      Both rows already carry everything needed (`Attack`, `InvItem`); what's missing is purely the
      way in (Slice 27's ⋯) and the editor behind it.
- [ ] Editing routes through the SAME structured-edit vocabulary the AI uses
      (`applySheetEdits`) rather than a parallel path — one place where a sheet changes, so the audit
      trail (`dnd_sheet_edits`) and the DM's view of "what changed" stay true.

### The customized marker is NOT the star

These are two different facts and the UI must not merge them:

| Marker | Means | Answers |
|---|---|---|
| ★ (Slice 13) | Something is **modifying this right now** | "Why is my STR 22?" |
| ✎ (this slice) | This **differs from its source** — homebrewed or hand-edited | "Is this still the real Fireball?" |

A hand-edited Fireball that nothing is currently buffing has ✎ and no ★. A vanilla STR score under a
Belt of Giant Strength has ★ and no ✎. Same element can carry both. Conflating them produces a
marker that means "something, somewhere, maybe" — i.e. noise the reader learns to ignore, which
costs more than having no marker at all.

- [ ] ✎ appears on anything edited away from its source: a modified official spell, a hand-tuned
      class feature, an attack with adjusted numbers, an off-table ability score.
- [ ] Hovering ✎ shows **what changed** — "Fireball · damage 8d6 → 10d6 (edited by Jacob,
      2026-07-16)" — and offers **Revert to official**. Reuse `summarizeCharacterProvenance`, which
      already distinguishes vanilla / custom / DM-granted content; this is its natural UI.
- [ ] The DM's approval surface (Slice 5) reads the same provenance, so ✎ is also what a DM scans
      when reviewing a sheet. A player quietly editing Fireball to 10d6 must not be invisible.
- [ ] Tests: an untouched sheet has zero ✎; editing a value marks exactly that value; revert clears
      the marker and restores the source value; ★ and ✎ are independent (one never implies the other).

## Slice 21 — System designation on every sheet (even customized ones) ✅ SHIPPED (verified 2026-07-16)

> "flag character sheets as being built for a specific system, even if the sheet has customizations…
> Then if we ask the AI questions, it will see what system we are using, and it will see that the
> character has customizations, and it will roll with it and not freak out."

**Verified shipped:** the Hero header renders a `system-chip` (`systemName`) on every template (Hero is
shared), the seed set the demo characters to `dnd5e-2024` (DB check: 5 of 6 sheet characters are
`dnd5e-2024`; only a stray generic "Donata" is `ambiguous`), and the AI digest reports `SYSTEM:`
alongside the ledger-resolved stats — so the librarian has a rulebook AND sees the customizations
(Slice 20's ✎ / provenance). The chip is independent of homebrew: a sheet is "D&D 5e (2024)" *and*
customized, exactly as the request asks.

- [ ] **Display the system** on every sheet — a badge in the hero header, on every template, plus
      the Overview. Today you cannot tell what game a sheet is for by looking at it.
- [ ] **Customization does not weaken the designation, and this is the point.** A sheet is "D&D 5e
      2024" *and* homebrewed. The system says which rulebook adjudicates; the ✎ markers (Slice 20)
      and `summarizeCharacterProvenance` say which parts are house-ruled. These are orthogonal, and
      collapsing them (an "it's custom so it's systemless" fallback) is what leaves the AI with
      nothing to reason from — the current bug.
- [ ] **Set Jacob, Susie, Sarah, Jack and Andrew to `dnd-5e-2024`.** They are `ambiguous` today, so
      the librarian answers edition-neutrally on the very sheets it should be most useful on. A seed,
      idempotent like the rest.
- [ ] Jack's Rangor/Pugilist content stays exactly as-is — it becomes *2024 with homebrew*, not
      *no system*. That is the whole distinction this slice draws.
- [ ] The AI gets both facts (Slice 22).
- [ ] Tests: every demo character has a real system; the badge renders on every template; a
      customized sheet still reports its system.

## Slice 22 — The AI meets customization without flinching ✅ SHIPPED 2026-07-16

> "it will see that the character has customizations, and it will roll with it and not freak out."

**Shipped (commit pending).** The digest now runs `summarizeCharacterProvenance` and emits a
`PROVENANCE —` line naming the character's homebrew and DM-granted content as **REAL for this
character, to be adjudicated WITH** (only when there IS custom content — a vanilla sheet gets no
noise). And `adjudicationInstruction` gained a `HOMEBREW IS REAL` rule: the sheet is the source of
truth for its own content, don't disclaim it as "unofficial", only flag it when the player asks
whether it's official or when a homebrew element contradicts a system rule in a way that changes the
answer — while the "never invent" honesty rule is kept but scoped to "neither on the sheet nor in the
rulebook". Tests: `character-digest.test.ts` +3. This is the fix the request named: the librarian
rolls with a homebrew sheet instead of freaking out.

The current prompt was tuned for a *rules librarian*: "never invent a rule; if it's not in the
reference, say so." Pointed at a homebrew sheet it did the wrong thing — disclaiming the character's
own content as unofficial. The fix wasn't to weaken "never invent"; it was to tell the model **which**
things are settled by the rulebook and which are settled by the sheet itself.

- [ ] The digest (Slice 3) reports, per element, whether it is **vanilla, homebrew, or DM-granted**
      (`summarizeCharacterProvenance` already computes exactly this — it just isn't in the prompt).
- [ ] Prompt rule: **homebrew content on the sheet is REAL for this character.** Rangor's Living
      Momentum is not "unofficial" — it is this character's rule, and the sheet is its source of
      truth. Adjudicate *with* it. Only flag it when the player asks whether something is official,
      or when a homebrew element contradicts a system rule in a way that changes the answer.
- [ ] Keep the honesty rule where it belongs: never invent a rule *that isn't on the sheet or in the
      rulebook*. Homebrew being on the sheet is exactly what makes citing it honest.
- [ ] Tests: a homebrew feature is described as the character's own, not disclaimed; the digest
      carries provenance; an official-rules question still gets the official answer.

## Slice 23 — The AI edits anything, and it sticks ✅ SHIPPED 2026-07-16

> "if I ask the AI to change the name of a weapon from Backless Park Bench to just Park Bench, then
> it should actually do that, save it, and then from then on whenever I load into the page it shows
> the new edited name… I could also ask it to change the damage die."

**Shipped (commit pending).** Rename now covers **every** element type — `rename_attack`/`_feature`/
`_item` plus the new `rename_spell` and `rename_resource`, matched by current name. Retune-in-place is
the new `update_attack` (the literal reported case: "change my sword's damage die" merges just that
field, keeping the rest — no stat-loss), alongside `update_item` and the `set_*` ops for stats. Every
one lands in the model via `applySheetEdits`, persists through autosave, re-derives through the ledger,
is audited in `dnd_sheet_edits`, and marks the element ✎ (Slice 20). Manual parity holds — the player
does all of this by hand through the same vocabulary (Slice 20). Presentation edits go through the
existing `customize_layout`/`custom_css` path; mechanics never as CSS (the ai-scope guard). Tests:
`sheet-edits.test.ts` (+5 for rename_spell/resource + update_attack).

- [ ] **Rename anything**: `rename` ops for attacks, items, features, spells, resources — matched by
      current name or id. This is the literal reported case and it is one op away.
- [ ] **Retune anything**: change a damage die, a range, a to-hit bonus, a resource max, an effect's
      value. Every edit lands in the model, persists, and re-derives through the ledger — so
      "make my sword do more damage" moves the actual attack row.
- [ ] **Manual parity**: everything the AI can do here, the player can do by hand (Slice 20), through
      the same vocabulary. If the AI is the only way to rename a weapon, the feature is a toy.
- [ ] Per-character CSS/HTML: `custom_layout` / `custom_css` already exist and are already applied
      per-character — extend the AI's reach to them for *presentation* changes ("make the headers
      gold"), and keep mechanics in the structured vocabulary. **Do not let the AI express mechanics
      as CSS.** A damage die written into a stylesheet is invisible to the ledger, to the digest and
      to the DM — it would look right on screen and be wrong everywhere else that matters.
- [ ] Every AI edit is audited (`dnd_sheet_edits`) and marked ✎ (Slice 20).
- [ ] Tests: rename persists across a reload; a retuned damage die changes the derived attack; the
      AI cannot smuggle a mechanic through CSS.

## Slice 24 — Chat UX: never block the typist ✅ SHIPPED 2026-07-16

> "even when the AI is thinking, I can still type into the chat box."

- [x] The input stays **enabled** while a request is in flight. `disabled={busy || !aiConfigured}`
      locked the box for the whole round-trip. The request is in flight, not the person. Only a
      missing API key disables it now.
- [x] Submitting while busy **queues** rather than dropping, and the queue is visible.
      Both chats did `if (busy) return`, which silently ate what you typed — worse than refusing it,
      because it looks like it was sent.
- [x] Tests + verified in the app with a stalled fetch: input enabled while busy, typed text
      survives, "1 queued — will send next" shows, the queued request fires on its own.

**Why a queue and not just concurrent sends:** sheet edits MUST stay serial. Two concurrent
`ai-edit` calls each read the sheet, apply their own change and write back — the second silently
erases the first (a lost update). The queue is exactly what makes "type while busy" safe rather
than corrupting.

**Deferred:** cancel/stop the in-flight request, and restoring text on a failed request (the text
is already preserved for queued sends; the failure path still drops it). Both are small; neither
was the reported problem.

## Slice 26 — Who may change what: DM omnipotence, player autonomy, DM review ✅ SHIPPED 2026-07-16

> "As the dm of a campaign I need to be able to actually have full and complete control to edit
> everything and change all numbers everywhere. Players will also have a lot of customizations…
> The dm will just need to be able to fully see what a player has modified or customized and can
> say yay or nay."

Three rules, and they are not in tension — the DM's control comes from *review*, not from *locking*.

**Permissions + visibility ✅ SHIPPED** (verified): the DM can edit any sheet in their campaign and a
player can edit every field on their own — no field is read-only, because every element now has an
editor (Slice 20) and `getCharacterAccess`/`requireCharacterWrite` already grant DM + owner/assigned
write. The AI obeys the same gate (the ai-edit route resolves through `requireCharacterWrite`), every
edit is audited in `dnd_sheet_edits`, and edited elements carry ✎ — hand and AI alike (Slice 20/23).
**`old_value` recording ✅ SHIPPED (commit pending)** — the audit foundation the review queue's Revert
needs. `editOldValue(current, edit)` reads the PRE-edit value for every op (a scalar for set_*, the
whole prior element for rename/update so a revert is exact, null for creates), and the ai-edit route
now writes it to `dnd_sheet_edits.old_value` instead of null. Tests: `sheet-edits.test.ts` +3. This
unblocks both this slice's Revert and Slice 20's diff/revert.

**Revert engine ✅ SHIPPED (commit pending).** `revertSheetEdit(current, edit, oldValue)` — a pure
function that undoes one edit exactly: a scalar `set_*` writes `oldValue` back; a collection edit
restores the whole prior element in place (so a reverted rename brings back every field, not just the
name); a reverted ADD drops the element it created. Pinned by a round-trip property test across all
nine op families (apply → capture → revert = original) + the add-removal + all-fields-restored cases.
This is the mechanism the review queue's Revert needs, done carefully as a tested pure function
BEFORE any UI drives it (a buggy reverse-apply corrupting a sheet is the exact failure to avoid).

**Review queue ✅ SHIPPED (commit pending).** `EditReviewPanel` mounts on every sheet (write-gated —
DM or owner; a plain viewer never sees it), lists the edit history newest-first ("what changed, by DM
or player, when"), and offers per-edit **⟲ Revert** → the `/edits/revert` endpoint (write-gated,
scoped to the character) reverses that edit through `revertSheetEdit`, persists, pulls the sheet back
in, and audits the revert itself. So the DM can *fully see what a player modified and say nay* — the
literal request. **"Yay" is now explicit too ✅**: an **✓ Approve all (N)** button in the panel clears
every ✎ on the sheet ("I've reviewed this and it's fine"), persisting through autosave — whole-sheet
granularity, which is exactly what a DM review pass wants. (The alternative phrasing below noted this
as optional; it's shipped.) ("Yay" is also implicit: leave it, and the ✎ marks on the sheet keep saying which
elements differ.) The **Approve-to-clear-✎** action is shipped as a whole-sheet **✓ Approve all** (the
granularity a review pass actually wants). Tests: `edit-review.test.ts` (6) + the `revertSheetEdit`/
`editOldValue` suites.

- [ ] **The DM can edit anything, anywhere, on any sheet in their campaign** — every number, die,
      name, and word. No field is read-only to the DM. `getCharacterAccess` already grants DM write;
      what's missing is that most fields have no editor at all (Slice 20).
- [ ] **The player can edit everything on their own character** — hit dice, damage dice, stat
      numbers, HP, AC, names, wording, titles. Not a locked-down sheet with a request form: they
      just change it. This is the design the request asks for, and it's the right one — a table
      where the DM must type every player's changes is a table that stops using the tool.
- [ ] **Every change is visible to the DM, and reversible by them.** This is what makes player
      autonomy safe:
      - Each edited element carries ✎ with **what changed, from what, by whom, when** (Slice 20).
      - A **campaign-level review queue**: every ✎ across every player, newest first, each with
        **Approve** / **Revert** — the literal "yay or nay". Approving clears the flag (it is now
        blessed); reverting restores the source value.
      - `dnd_sheet_edits` already records the audit trail, and `SheetApprovalPanel` already exists
        for custom content — extend those rather than inventing a parallel mechanism.
- [ ] **Nothing is silently lost.** A revert restores the prior value into the model; the player
      sees it reverted and why. A DM edit to a player's sheet is itself marked and attributed, so
      the player is never gaslit by a number that changed with no explanation.
- [ ] **The AI obeys the same permissions** — it writes through `getCharacterAccess` like everything
      else. Its edits are marked ✎ too, so a DM reviewing a sheet sees AI-generated content exactly
      as clearly as hand-made content (Appendix C).
- [ ] Tests: a player can edit every field on their own sheet and none on another's; a DM can edit
      any sheet in their campaign; every edit appears in the review queue with its diff and author;
      Approve clears the flag; Revert restores the exact prior value; a non-DM cannot approve.

## Slice 27 — A clear way in: the ⋯ menu on every element ✅ SHIPPED 2026-07-16

The ⋯ menu is on every editable element that HAS an editor — attacks, items, features, spells,
resources, traits — each with Edit / Duplicate / Delete + the built-in "Ask AI about this", through
the shared `EditDialog`/`ElementMenu`. **Deferred (redundant / blocked):** the "Change art" and "Add
effect" menu extras are now redundant — Edit opens the editor, which carries both the Slice-28 art
control and the Slice-17 effect builder; ⋯ on active effects is redundant with their dedicated
End-effect action; ⋯ on forms is blocked on a forms editor (its own slice). None is a gap in "how do
I change this" — every element with something to change has a way in.

**Shipped:** `ElementMenu` (⋯) on **attacks and inventory items** — Edit / Duplicate / Delete —
plus `EditDialog` + `AttackEditor`, and an **Add attack** control. Verified on Jack's live sheet:
renamed "Backless Park Bench" → "Park Bench" and retuned 1d8 → 1d12, both reflected immediately;
Jack restored afterwards and the restore verified by read-back. 19 tests.

The item path **reuses the existing `ItemBuilder`** rather than adding a second editor — it already
upserted by id and was merely gated behind `editMode`, so the editor existed and no row could reach
it. (I started a parallel `ItemEditor`, then deleted it: two things editing the same data is the
drift this codebase keeps paying for.)

Also shipped here: **item tag tooltips** — `tagInfo.ts` explains every tag on hover, because
"FLAVOR" told the reader nothing. One definition per tag, shared by the Gear list and the editor.
A homebrew tag returns null rather than a fabricated definition.

**⋯ now on:** attacks, items, features, **spells** (`SpellEditor`), **resources**
(`ResourceEditor` + "Add resource"), and **traits** (`TraitEditor` + "Add trait", index-addressed
since traits are plain strings). Each with Edit / (Duplicate) / Delete, through the shared
`EditDialog`/`ElementMenu`.

**"Ask AI about this" ✅ SHIPPED 2026-07-16 (commit pending).** Added as a built-in on the shared
`ElementMenu`, so it appears on every element at once (attacks, items, spells, features, resources) —
it opens the Slice-3 librarian pre-filled with the element (same `/dnd/library/<system>?ask=…#chat`
target as RuleTip), defaults its subject to the element's `label`, hides itself when the sheet has no
system (no rulebook to ask against), and is opted out on the generic-labelled trait row. Tests:
`element-menu-ask-ai.test.ts` (4).

**Still open:** ⋯ on active effects and forms; the "Change art" / "Add effect" menu extras. ("Add
effect" is largely redundant now — Edit opens the builder with its effect rows; "Change art" needs
the per-element art of Slice 28.)

### Original spec

> "I either need to be able to click on the attack or item or spell or effect or whatever, and it
> will give me the option to edit it. Maybe we have a menu or edit button or three dots on each
> element."

Slice 20 makes everything editable; this is **how you get there**. A feature nobody can find is a
feature that doesn't exist — and today most of these elements have no affordance at all.

- [ ] A **⋯ menu** on every editable element: attacks, items, spells, features, resources, traits,
      active effects, forms. One consistent control in one consistent place, so the answer to "how
      do I change this?" is the same everywhere.
- [ ] Menu: **Edit · Duplicate · Delete · Change art · Add effect · Ask AI about this**.
      "Ask AI about this" reuses the Slice 3 adjudicator, pre-filled with the element.
- [ ] Opens the right editor for the element's kind (Slice 15's attack/weapon/armor builders,
      Slice 17's effect builder). One editor per kind, reached from everywhere that shows one.
- [ ] Only for `canWrite`. A viewer sees no ⋯ — an affordance that errors on click is worse than
      no affordance.
- [ ] Reachable by keyboard and touch, like Slice 13's markers. Never hover-only.
- [ ] Tests: every element kind exposes a ⋯; a viewer sees none; each menu opens its editor.

## Slice 28 — Art and thumbnails for everything ✅ SHIPPED 2026-07-16

Every element the request named can carry art and shows it: items, attacks, spells, features — upload
via one shared control, rendered as a thumbnail everywhere they appear (lists + Active Effects panel),
with a kind-icon fallback for art-less items. **Deferred (cost > value / blocked):** generating a real
square crop ON UPLOAD instead of CSS-scaling (an image-processing pipeline for a marginal quality
gain — the CSS square is correct today); a thumbnail inside the text ⋯ menu (odd fit, low value); and
form/effect art (forms have no editor yet — rides on that slice). None is a correctness gap.

> "we need to be able to upload item and weapon and spell and etc for everything and have it be able
> to be displayed… We will need to be able to create little thumbnail tokens for everything."

The upload path already exists (Slice 2b shipped character-gallery upload; the `dnd-media` bucket
and `kind='item'` are already modelled). What's missing is that nothing but the character has art.

- [x] **Items: upload ✅ (was already there) + render ✅ SHIPPED (commit pending).** The ItemBuilder
      has always uploaded and stored an item `image`; the Gear list never showed it. Now a `.inv-thumb`
      thumbnail renders inline next to the item name from the stored `image` (token-driven border,
      falls back to nothing when unset). The classic "data was there, nothing rendered it" gap. Tests:
      `item-thumbnail.test.ts` (3).
- [x] **Attack / spell / feature art ✅ SHIPPED (commit pending).** A single shared `ImageUpload`
      control (posts to the media endpoint, `kind='item'`, current-art + change/remove, self-reporting
      errors) is now mounted in AttackEditor/SpellEditor/FeatureEditor — one uploader, not three
      copies of the ItemBuilder's inline one. Each type gained an `image` field, and the Attacks table,
      Features cards and spell list each render the thumbnail. An image edit also trips the ✎ marker
      (it's a change). Tests: `element-art.test.ts` (6). (Forms/effects art + generating thumbnail
      crops on upload remain; forms have no editor yet.)
- [x] **Thumbnail tokens ✅ (mostly)**: rendered inline next to the element in inventory rows, attack
      rows, spell lists, feature cards, and the **Active Effects panel** (the source's own item/feature
      art, looked up by sourceId — no new ledger plumbing). Still open: the ⋯ menu, and generating a
      real square crop ON UPLOAD rather than CSS-scaling the full image each render (a perf/quality
      nicety, not a correctness gap).
- [x] **A kind icon fallback ✅ SHIPPED (commit pending)** — for items: a row with no uploaded art
      shows its kind icon (⚔ 🛡 🔰 ⚗ ✨ 🎒, matching the builder) in the same square, so the Gear list
      always reads as intentional. (Other element types get theirs when their art field lands.)
- [ ] AI-attached art (Slice 14) uses the same path — no second mechanism.
- [ ] **Art never gates mechanics.** Per the request, "the image and the name and category really
      don't matter all that much" — an upload failure must never block creating or using the item.
- [ ] Reuse the map-token pipeline where it already exists rather than inventing a parallel one.
- [ ] Tests: an element with art shows its thumbnail; one without shows its kind icon; an upload
      failure leaves the item working.

## Slice 29 — Map studio: every control actually drives the preview

> "The clouds are not increasing in the preview whenever I crank the slider up… make sure all of the
> options and toggles and sliders have actual effects on the object and that those effects render in
> real time in the object editor viewer."

Reported against the object editor. The 3D framing fix shipped 2026-07-16 (see the note below);
this is the remaining half.

- [x] **Clouds** — the editor wrote `cloudAmount`/`cloudColor`/`cloudStyle`; the model reads
      `cloudCov`/`cloudTint`. Nothing translated, so the slider moved, saved, rebuilt the model and
      never told it anything. Fixed in `_genericPlanetCfg` (where every caller funnels through), plus
      style→shape mapping so banded/storm/heavy/wispy look like themselves in 3D. Verified by
      screenshot: bare continents at 0, fully overcast at 100.
- [x] **Water** — the deeper version of the same disease, and the slider was *inverted*: 2D painted
      a LAND disc and dotted WATER on it, with opacity driven by `1.35 - sea`. So water-down painted
      more blue, and no slider position could ever drown the planet. 2D now models sea the way 3D
      does (ocean disc, land on top, land recedes as water rises). Land ink 74376 → 20815 → 0 across
      sea 0/0.5/1.
- [x] **2D/3D size parity** — an SVG lets its glow spill outside the box; a WebGL canvas cannot, so
      the camera pulled back and the 3D body rendered far smaller. Both now render the body at ~78%
      of the viewer with halos fully visible (2D 78.0%, 3D 1/1.28 = 78.1%; the constants
      cross-reference each other). **Guarded** (`map-viewer-handles.test.ts`): a test asserts both the 2D
      `.pv2d{width:78%}` and the 3D `1/1.28` constant are present, so one can't drift without the other.
- [~] **City lights and lava are invisible in the 3D preview — but they are NOT missing.** Checked
      rather than assumed: `_genericPlanetCfg` forwards `city`/`lava`/`lightColor`, and
      `planet3d-model.js` consumes all three (`cfg.city` at :244, `cfg.lava` at :86/:147/:194).
      **Plumbing now GUARDED (2026-07-17):** `map-studio-config.test.ts` +1 asserts `_genericPlanetCfg`
      forwards `lava`/`city`/`lightColor` onto the assembled config AND that `planet3d-model.js` reads
      `cfg.lava`/`cfg.city`/`cfg.lightColor`, so a future edit can't silently drop them and recreate the
      clouds/water "slider does nothing" bug for these controls. **Still deferred (visual, device-verified):**
      the sun/terminator angle so the night-side glow is actually visible in the preview — the doc's own
      note warns not to eyeball the sun vector without first reading the shader's light convention, and the
      day/night-mask agreement between 2D and 3D is a rendering decision that needs eyes on the preview.
      They are **self-lit and only glow on the NIGHT side** — and the editor's sun sits nearly
      behind the camera (`SUN = (3,2,4)`), so the planet renders almost fully lit and there is no
      night side to see them on. 2D draws city dots across the whole disc with no day/night mask,
      which is why 2D looks right and 3D looks broken.
      **Do not fix by eyeballing the sun vector:** tried `(3.2,1.1,1.35)` and it rendered a dark
      crescent — the model's sun convention is not "direction to the sun" as assumed, and the render
      said so immediately. Read the shader's convention in `planet3d-model.js` first, then either
      angle the preview sun for a real terminator, or give the preview a light-direction control.
      Decide too whether 2D should gain a day/night mask, or 3D should show city lights unmasked —
      they cannot both be right, and the editor promises the two views agree.
- [ ] **Audit every remaining control against both renderers.** For each kind (planet, moon, star,
      station, galaxy…), list every slider/toggle and confirm it changes (a) the 2D art and (b) the
      live 3D model. Two of these have now been mapping gaps; assume more are.
- [ ] The likely cause, worth checking first: `edPreview()` hands `edWork` to
      `EditorPreview3D.update()`, which rebuilds via `cfgFor(look)` →
      `Map3D._genericPlanetCfg({kind, look})`. Any field that mapping drops never reaches the model,
      so the slider moves, the value saves, and the preview is simply never told. A control that
      silently does nothing is worse than a missing control — you think you tuned it.
- [ ] Both renderers must honour the SAME field. The editor already promises this in its own copy:
      "These drive both the 2D art and the live 3D model." Where a field genuinely cannot exist in
      one renderer, say so in the UI rather than leaving a dead control.
- [ ] Real-time: every control re-renders on `input`, not on release.
- [~] Test: a fixture asserting every editable field of every kind reaches the 3D config — so a new
      *(Regression guard shipped for the fixed cloud-field translation: `map-studio-config.test.ts` (4)
      source-anchors `_genericPlanetCfg` and asserts it translates the editor's cloudAmount/cloudColor into
      the model's cloudCov/cloudTint, maps cloudStyle "none"→0 cover + banded/storm→shape knobs, and keeps the
      rich pass-through allowlist — so the "slider silently does nothing" bug can't regress. The FULL
      every-field-of-every-kind audit still needs the per-field 2D-only-vs-3D classification, which is
      judgment work best paired with the visual pass.)*
      slider cannot be added without wiring it.

**Shipped 2026-07-16 — the 3D clipping half.** The preview camera sat at a fixed `z=4.6` with a 34°
FOV: a half-height of `tan(17°)×4.6 ≈ 1.41` at the origin, while a planet is radius **1.3 before its
atmosphere and glow**. So the glow overran the frustum and the body was sliced flat on every side. No
fixed distance can be right for every subject (a star's corona is bigger; rings are wider than tall),
so the camera now measures the model's bounding sphere and frames it — `r/sin(fov/2)` for both the
vertical and horizontal FOV, larger wins, re-framed on every build and resize. The viewer also went
66% → 88% of its column, so the subject renders *larger* than before while fitting completely.

⚠️ **Verification trap, recorded so nobody repeats it:** reading pixels back off the WebGL canvas
with `drawImage` does **not** work — the drawing buffer is cleared after compositing unless
`preserveDrawingBuffer` is set. The readback comes back empty, so a "no lit pixels on the border ⇒
not clipped" check passes for *any* input, including a badly clipped one. Verify by screenshot.

## Slice 30 — Campaign roster: PCs, special NPCs, generic NPCs ✅ SHIPPED 2026-07-16

- [x] `roster_role` column on `dnd_characters` (`pc` | `special_npc` | `generic_npc`), seed 448,
      default `pc`, backfilled from `is_npc`. Applied + verified idempotent.
- [x] The DM roster (`CampaignPageClient`) groups characters by category with a header + count per
      group, and each card has a category selector to move it. Optimistic local update jumps the
      card to its new group instantly.
- [x] Editorial, not mechanical — the same `Character`, same engine; changing category is a field
      change. The character PATCH accepts `roster_role` (validated to the three values) and keeps
      `is_npc` in sync. Promoting a generic NPC never touches its sheet.
- [x] Verified end to end against the live API with a fresh DM session: detail returns `rosterRole`,
      a new character defaults to `pc`, PATCH → `special_npc` sticks and sets `is_npc: true`, an
      invalid role is rejected (400). Test data cleaned up.

**Deferred to Slice 31:** the roster grouping is DM-side; the player hub still lists all characters
flat. And "quick vs full" NPC builders are the Slice 31 work proper.

### Original spec

> "for the campaign character management, I want to split it up so that we can have multiple
> categories of characters. We will have generic npcs, special npcs, and then pcs."

- [ ] A `role` on each character: `pc` · `special_npc` · `generic_npc`. A column + a seed, defaulting
      existing characters to `pc` (they all are).
- [ ] The campaign page groups the roster by role, each section collapsible with a count.
- [ ] The distinction is **editorial, not mechanical** — a generic NPC is the same `Character` on the
      same engine, just triaged differently. Do NOT give generic NPCs a cut-down model: the moment a
      guard becomes important, the DM must be able to promote them without rebuilding them, and
      "promote" should be a field change, not a migration.
- [ ] Move a character between categories from the roster.
- [ ] Tests: every existing character reads as a `pc`; promoting a generic NPC preserves its sheet
      byte-for-byte.

## Slice 31 — The NEW button, and two ways to build a character ✅ SHIPPED 2026-07-16

Both paths + roster grouping shipped: player-hub + DM roster grouped by PC/Notable/Generic (roster
grouping note below), the DM's ⚡ Quick NPC generator (a sentence → a full NPC saved to the campaign
under a role), and the full builder via ＋ Character — same `Character` shape, quick promotable to
full. Details per item below.

**Player-hub roster grouping ✅ SHIPPED (commit 5ce871a1).** The DM's `roster_role` now flows to
the player-facing `CampaignHub` "The Table": `campaign-summary` selects `roster_role`, `HubCharacter`
carries `rosterRole`, and the roster renders in three groups — Player Characters / Notable NPCs /
NPCs — mirroring the DM-side grouping shipped in Slice 30. Single-group tables stay flat (no
redundant heading). This closes the "player hub still lists all characters flat" deferral from
Slice 30. Still open below: the quick-vs-full NPC builder modal.


> "the 'NEW' button doesn't work… We should be able to create an npc very quickly by generating it
> with whatever quick info I give it, or we can do a super in depth character build using the
> campaign system."

**First: find the broken NEW button.** ⚠️ **I could not reproduce it — do not start by "fixing" it.**
What I actually found on `/dnd/campaigns/[id]` (Neon Odyssey, as the DM):

* There is **no control labelled "NEW"** anywhere on the campaign page. Every button/link was
  enumerated in the browser; the list is: `← Back`, `＋ Character` (header), `Sign Out`,
  `✕ remove` ×4, `＋ Add player`, `✉ Invite`, `+ Generate link invite`, `→ Hide` / `✕` per
  character, `✦ Open Map Maker`.
* `/dnd/characters/new?campaignId=…` — what the header's `＋ Character` points at — **works**; it
  renders the "Import Your Character" page. Not a 404, not an error.
* `＋ Add player` and `✉ Invite` render disabled, and I first flagged those as the likely culprit.
  **That was wrong** — checked the source: both are `disabled={!name.trim()}`
  (`CampaignPageClient.tsx:240`, `InvitesPanel.tsx:149`). They are correctly disabled until you type
  a name, which is why a page snapshot shows them greyed out. Not a bug. Recorded so nobody
  "fixes" working code on my say-so.
* The only thing in the app literally labelled **"NEW"** is the map studio's **`Save as NEW`** in
  the object editor. Different screen from "campaign character management", but it is the sole
  literal match.

**So the target is unconfirmed.** Ask which screen and which button before building anything here —
a new-character modal for a button that already works is effort in the wrong place, and the header's
`＋ Character` → `/dnd/characters/new` path demonstrably works today.

Then two paths to the same `Character`, which is the whole point — a quick NPC must be promotable to
a full build without being rebuilt:

- [x] **Quick build (AI) ✅ SHIPPED 2026-07-16.** A **⚡ Quick NPC** form on the DM manage page
      (`CampaignPageClient`, Hextech chrome): a sentence + a role → `POST /api/dnd/campaigns/[id]/npc`
      generates a complete, playable sheet. It **lifts the streamer generator** into a campaign-scoped
      endpoint (not a second one), **saves** the NPC to the campaign (DM-owned, `is_npc`, the chosen
      `roster_role`, grounded on the campaign's system), and builds through the SAME `applySheetEdits`
      vocabulary — so a generated NPC is indistinguishable in shape from a hand-built one, and the
      plain sheet stands if the AI is off. Tests: `quick-npc.test.ts` (5).
- [x] **Full build (manual) ✅** — the "＋ Character" button routes to `/dnd/characters/new?campaignId=`
      → the builder + class engine, with full control over every choice.
- [x] **Same pipeline at different depths.** Both save a normal `Character`; a quick NPC is just a
      generated one — open it in the full builder and keep going, no fork.
- [x] **Save as any role** — the Quick NPC form picks Generic/Notable NPC (Slice 30 `roster_role`), and
      any character's role is changeable from its roster card.

## Slice 32 — Custom tags: add, create, define ✅ SHIPPED 2026-07-16

> "In the item editing options, I need to be able to add flags and create flags and define them…
> both we and the AI chat box can add tags to items and stuff. It should be able to add the flavor
> tag, or create new tags and give them tool tip descriptions."

Slice 27 shipped tooltips for the five built-in tags (`tagInfo.ts`). This makes the vocabulary
**open** — the player and the AI can both mint new ones.

- [x] **Add** any existing tag to an item from the item editor — `TagPicker` (mounted in `ItemBuilder`)
      toggles the built-ins + the character's own; reserved wiring tags are shown disabled with a why.
- [x] **Create** a tag: a name plus its **required** definition — `TagPicker`'s "＋ new tag" refuses a
      blank description (the tooltip IS the definition) via `validateCustomTag`, same guard as the AI.
- [x] Custom tags live **on the character** (`char.customTags`), and `tagInfo(tag, custom)` consults
      them. **Fixed the last gap (commit pending):** the Gear list (`Inventory.tsx`) called `tagInfo(t)`
      WITHOUT the character's tags, so a homebrew tag had a tooltip in the editor but not in the gear
      list — it now passes `char.customTags`, so both explain a custom tag exactly as they do `flavor`.
      Tests: `tag-tooltips.test.ts` (9).
- [x] **The AI can do both** through the structured vocabulary — `define_tag` (name + required
      definition, kept on the character) and `tag_item` (apply a tag to an item), never by writing
      markup. Both go through the same `validateCustomTag` guard as the hand path (definition
      required, reserved names refused) and the AI-scope allow-list gained the `define_`/`tag_`
      prefixes. 4 tests.
- [x] **Built-in tags stay reserved.** `validateCustomTag` refuses `weapon`/`consumable`/`equipped`
      (RESERVED_TAGS) with a reason, and `TagPicker` renders them disabled/managed — a custom tag can
      never shadow the wiring.
- [x] Tests: a custom tag renders its own tooltip (built-in AND homebrew, editor AND gear list); a tag
      cannot be created without a definition; built-in names are refused; the AI's `define_tag`
      produces the same shape as the hand path. `tag-tooltips.test.ts` (9) + `sheet-edits.test.ts` (AI).

### The AI, CSS, and the line it must not cross

> "the AI should be able to dynamically write any html/css and rewrite it to get any effect, and it
> should be saved and kept."

This works today for **presentation**: `custom_css` / `custom_layout` are per-character, already
persisted, and already applied on load, and the AI already writes them ("make the headers gold"
survives a reload).

The boundary (restated from Slice 23 because this request pushes right against it): **mechanics must
never be expressed as CSS.** A tag's *definition*, an item's effects, a damage die — these go in the
model, where the ledger, the digest, the DM's review and the AI itself can all read them. A tooltip
faked with a `::after { content: … }` looks identical on screen and is invisible to every one of
those. Style is presentation; meaning is data. The AI gets both, through different doors.

## Slice 33 — Control the hit bonus / save DC on weapons and spells ✅ SHIPPED 2026-07-16

(Weapon-ITEM to-hit control deferred to the "wire the inventory→attacks engine" work under Slice 15;
rationale inline below. Everything the request named — controlling hit/DC on attacks and spells — is
shipped, and spell DC/attack now compose with item bonuses through the ledger.)

> "make sure that we can control the hit dc for weapons and spells and stuff."

- [x] **Attacks now control their save DC.** The `AttackEditor` gained a **Save-based** toggle; when
      on, it exposes the save the target rolls, the AOE descriptor, **which ability powers the DC**,
      and a **flat DC override**. The Attacks row computes `saveDcOverride ?? (8 + PB + mod of the
      chosen ability, STR by default)` — previously it was hardcoded to `8 + PB + STR` with no
      control. `bonusToHit` / `bonusDamage` were already editable. 4 tests.
- [ ] **Weapon ITEMS** (ItemBuilder) still have no to-hit / save-DC field of their own — they'd
      inherit whatever the derived attack computes. Add the same controls there.
- [x] **Spells now have an editor** (`SpellEditor`, reached via the ⋯ menu on each spell row —
      Slice 27 extended to the Spells tab). Edits name, level, school, timing, components, duration,
      description, concentration/ritual, and **how it resolves: a spell attack roll OR a save (which
      ability, what happens on a success) against the spell save DC**. The DC/attack come from the
      casting stat on the sheet. 5 tests.
- [x] **DC / attack now compose through the ledger.** `SpellsPanel` computes
      `saveDC = ledger.value('spell_save_dc', caster override ?? 8+PB+mod)` and
      `attackBonus = ledger.value('spell_attack', PB+mod)`, so a Rod of the Pact Keeper's +1 DC lands
      on top of the caster's own base (Slice 10's derived-target fix makes `value(target, callerBase)`
      respect the passed base). An unmodified caster is unchanged. `spell-dc-ledger.test.ts` (3).
- [ ] **Weapon ITEMS to-hit/DC control** — deferred with a reason. The engine to turn a weapon item
      into a rollable attack exists (`weapons.ts buildAttack`, which already reads `w.attackBonus` +
      folds `attack`/`attack_and_damage` effects), but `attacksFromInventory` is **not wired into the
      rendered Attacks table** (the table renders `char.attacks` + Slice-11 granted attacks, not
      inventory-derived ones). Adding a to-hit field to the ItemBuilder weapon section would be
      cosmetic until that engine is connected to the render — that connection is the real slice, and
      it belongs with Slice 15's "call the uncalled engines" work, not here.

## Slice 34 — Build-mode selector: make it look like the rest of the UI ✅ SHIPPED 2026-07-16

Restyled Ruthless/Questioning/Step-by-step from raw radio bubbles into selectable Hextech cards —
whole card clickable (`role=radio` in a `radiogroup`, keyboard/SR-friendly), active one gets a gold
rail + glow + ✓. Same modes and behaviour. Verified in the app.

### Original spec

> "the little bubble selection for the type of character building looks bad. Please change it and
> make it look better and match the UI styling better."

The Ruthless / Questioning / Step-by-step chooser in `NewCharacterForm` uses raw radio bubbles
(`BuilderHelp` / `BUILD_MODES`). Restyle as selectable Hextech cards (like the sheet-style browser),
keeping the same three modes and their descriptions, so it matches the framed-panel look around it.
Purely presentational — no behaviour change.

## Slice 35 — Map viewer: image transform handles, no-parallax background, background spin/spiral

Three map requests, grouped because they're all about placing and controlling images on the map.

### 35a — Bring back the scale/rotate handles on images
> "I can no longer see the nodes for scaling and rotating on images that I bring into the map viewer.
> Please bring them back and make them work well so that I can manually rescale an image."

The handle code still exists (`renderHandles()` in `map-studio.html`: a `.ihwrap` box with corner
`.ihandle` scale pads + a `.rot` stem, drawn into `#handleLayer` at z-index 6). It explicitly draws
for every selected instance except `kind==='text'`, so images *should* get them. So this is a
regression to *reach*, not the drawing:
- [x] **Could not reproduce 2026-07-16 — works in current code.** Two browser checks:
      (1) forcing a selected image instance produced all 5 handles in `#handleLayer` (z-index 6, DM
      mode); (2) a REAL `mousedown` on a freshly-placed image set `selection` to that instance AND
      produced the 5 handles + wrapper. So both the drawing and the reach work for a standard image.
      **Regression guard shipped** (`map-viewer-handles.test.ts`, 4): source-anchors `renderHandles` and
      asserts it excludes only free text (images DO get handles), draws the four corner scale pads + rotate
      handle + stem, wires the scale/rotate mousedown handlers, and yields the screen to the 3D viewer — so
      the "handles disappeared" report can't silently recur.
      Deliberately did NOT ship a speculative fix — that would risk breaking the working path.
      Most likely explanations for the user's report, to check if it recurs: a stale deployed build
      (hard-refresh), or a specific image variant — a **spiral/spin image** renders a different DOM
      (a `<canvas>` in `.art`) and is the one untested edge; if handles are missing, note whether the
      image had spiral or spin on. Left open pending a reproducible case.
- [ ] Once visible, verify scale from any corner and rotate from the stem both work and persist.
      (Manual/browser step — belongs to the Slice 40 QA pass; the drag math is unchanged.)
- [x] **A guard/regression note so the handles can't silently disappear again. ✅ SHIPPED** (`b808a9b8`).
      `map-studio-handles.test.ts` (5) locks `renderHandles`'s invariants against the file the browser
      loads: it skips only `kind==="text"` (not `image`), draws the rotate + 4 corner scale handles,
      wires them to `onInstScaleDown`/`onInstRotateDown`, is called from the render path, and keeps the
      corner CSS. A regression that drops or breaks the handles now fails CI.

### 35b — A background image with parallax OFF ✅ SHIPPED 2026-07-16
> "make it so that we can set a background image that doesn't do parallax. We should be able to turn
> the background parallax off if we want to. Make it pretty clear how to do this."

- [x] A **"Move with the map (parallax)"** checkbox in the Backdrop tab's image controls, with a
      one-line explainer ("Off = fixed to the screen as you pan and zoom. On = pans and zooms with
      the map"). Defaults OFF — i.e. the requested no-parallax behaviour is the default.
- [x] `applyView` applies the view transform to `#bgLayer` only when `state.background.parallax` is
      on; otherwise the layer is screen-locked (no transform). Verified in the browser: OFF →
      `transform: none` while panning; ON → the layer pans/zooms with the map.

### 35c — Spin/spiral the CENTER of a background image
> "for background images, I still want to make it so that I can cause more of the center of the
> background image to spin and have spiral controls over. Try to figure out if this is possible."

- [x] **Feasibility answered 2026-07-16: yes, but it needs a canvas backdrop.** The ring-spin engine
      (`DiffSpinGalaxy`) already spins concentric rings of an image at different rates and is ALREADY
      wired for *placed* images — `renderInstances` uses `i.spiral.on` → a `.spiralcanvas`. The
      blocker for the BACKGROUND is that `#bgLayer` is a plain CSS `background-image`, and ring-spin
      needs a `<canvas>` to slice/rotate rings. So it's feasible by rendering the image backdrop as a
      full-bleed spiral canvas (mount a `DiffSpinGalaxy` into `#bgLayer` when `background.spiral` is
      on) instead of a CSS background — reusing the exact engine the placed-image spiral uses. Not a
      new capability, just applying the existing one to the backdrop layer.
- [ ] If feasible: a background mode that applies the ring-spin (inner rings faster → a spiral),
      with the existing spiral controls (ring count, per-ring speed, feather) exposed for the
      background.
- [ ] If not cleanly feasible on a full-bleed layer, say so in the doc with the reason rather than
      forcing it, and offer the nearest thing (e.g. a large centered spinning image instead of a
      true background).

## Slice 36 — Pseudo-login, "+ Campaign", and unlimited creation ✅ SHIPPED 2026-07-16 (mostly)

> "the login is not an actual login… just a name and a password… both at least four letters."
> "alongside +Character, a +Campaign button… the new campaign shows in all campaigns and the
> campaigns you manage section." "Anyone should be able to create as many characters and campaigns
> as they want."

- [x] **Pseudo-login**: name + password only (no email, no invite), both ≥ 4 chars. The name is the
      identity, stored as `name:<normalized>` in `dnd_users.email` (already holds synthetic keys like
      `quick:andrew`, so no schema change). `POST /api/dnd/auth/signup` (new); login accepts `name`;
      the login page has a Name field + a Create-account toggle. bcrypt-hashed. Verified end to end.
- [x] **"+ Campaign"** in the header (signed-in only) → `/dnd?new=campaign`; `MyTable`'s new
      `NewCampaignButton` opens its form there, creates via `POST /api/dnd/campaigns` (creator = DM),
      and routes to the campaign's manage page. It then appears under "⚔️ Campaigns you run" and the
      all-campaigns list.
- [x] **Unlimited**: neither characters nor campaigns are capped in code — anyone signed in creates
      as many as they like. (Confirmed: no per-user limit in the create routes.)
- [x] **Edge — stale session 500 ✅ SHIPPED 2026-07-16.** `POST /api/dnd/campaigns` now classifies the
      Postgres FK violation (code `23503` / a "foreign key" message) via an `isStaleUserFk` helper and
      returns a clean **401 "Your session has expired — please sign in again."** instead of a raw 500 —
      AND clears the dead `dnd_session` cookie (`clearDndSession`) so the client isn't stuck re-hitting
      the same expired session. Applied to **both** FK-referencing writes: the campaign insert
      (`dm_user_id`) and the membership insert (`user_id`) — the earlier fix only guarded the first, and
      only the message, not the cookie. Tests: `campaign-create.test.ts` (3, source-anchored — a live DB
      is needed to drive the real route). Low-severity (only reachable if a user is deleted under a live
      session), now no longer a 500.

## Slice 37 — Browser Back sometimes needs several presses

> "sometimes when I hit back it just kind of jumps up and down on the same page and I have to hit it
> two or three times before it actually goes back."

- [~] **Diagnose first.** ✅ *Audited (`0077…` follow-up).* Walked every `router.push`/`history.*` and
      query-param entry point in `app/dnd`: the `?new=campaign` opener (`NewCampaignButton`/`CampaignDashboard`)
      and the `searchParams.set(...)` calls in `LibrarySearch`/`LevelBuilder` do **NOT** touch browser history
      (the latter set params on a `fetch` URL). The one concrete history-polluting source found is the
      **library page's jump-nav `<a href="#section">` links** — each click pushes a `#` entry, so Back
      "jumps up and down" the same page (exactly the report). Fixed: new `JumpNav` client component scrolls the
      target into view and **`history.replaceState`s the hash instead of pushing**, so Back leaves in one
      press. `jump-nav.test.ts` (2). *(If the character-sheet/campaign report persists, it needs live repro —
      no other history-pushing source was found in the audit.)*
      The remaining suspects were checked and cleared:
      - A component calling `router.push` / `history.pushState` on mount or on a state change that
        lands on the *same* URL (each adds an entry you have to Back through). Audit `router.push`
        and `router.replace` calls — anything that navigates to the current path should be
        `replace`, not `push`, or skipped.
      - The `?new=campaign` / other query-param entry points: if a component strips or re-adds a
        query param via `push`, that's an extra entry. Use `replace` when normalizing the URL.
      - A scroll-anchor / hash link (`href="#..."`) pushing a `#` entry that Back only scrolls away
        from.
      - Next.js scroll-restoration fighting a manually scrolled container.
- [ ] Fix the specific source(s) found; don't paper over with a custom Back handler.
- [ ] Verify: from a character sheet and from a campaign page, a single Back returns to the previous
      page every time.

**Investigated 2026-07-16, no definitive culprit yet — did NOT ship a speculative fix.** Checked the
strongest hypotheses: no `history.pushState` anywhere in the map pages (the map-studio bridge uses
`replaceState`, which does not add history entries); no hash anchors that navigate the main document;
the `router.push` calls all target distinct routes, not the current one. The map-studio and console
DO load in `<iframe>`s (`campaigns/[id]/map-studio` and `/console`), which is the classic multi-press
Back trap, but their `src` is computed server-side and stable per load, and the internal nav uses
`replaceState`. Needs the user's exact reproduction (which page, what they did before Back) to pin —
"jumps up and down" hints at scroll-restoration, which points at a specific scrollable container.
Left open rather than guess.

## Slice 38 — Campaign creation → invite-by-link → join → bring/port a character ✅ SHIPPED 2026-07-16

All four sub-slices shipped: 38a (creation with system + allow-custom), 38b (copy invite link →
`/dnd/join/<code>`), 38c (bring-or-make prompt for a new member), 38d (cross-system translate via the
existing non-destructive transpose endpoint). The full create → invite → join → bring/port arc works.

The full flow the user described, end to end. Several pieces already exist (invites table, the
campaign `system` + `allow_custom` fields, the character import/AI builder, the cross-system chat);
this slice is mostly about wiring them into one journey.

### 38a — A simple campaign creation page ✅ SHIPPED
> "pick the system, name it, describe it. Then create it."
- [x] **System picker + name + description — shipped.** `NewCampaignButton` has name, description, and a
      **Game system** `<select>` (GAME_SYSTEMS, grouped available vs 🚧 under-construction, disabled), plus
      a "pick later" option. The POST `/api/dnd/campaigns` persists `system` (via `normalizeSystem`) to
      `dnd_campaigns.system` (seed `447_dnd_campaign_system.sql`, `NOT NULL DEFAULT 'ambiguous'`).
- [x] **"Allow custom builds" toggle — shipped.** The create form's toggle sets `allow_custom` on the
      campaign (seed `443_dnd_custom_approval.sql`); `SheetApprovalPanel` reads it. `campaign-create.test.ts`
      covers the route's stale-session handling.

### 38b — Invite by copyable link ✅ SHIPPED 2026-07-16
> "being able to copy a link to the main campaign page and then send that link to people to join."
- [x] **Copy invite link — shipped.** `InvitesPanel` (DM-only, on the manage page) generates a link
      invite and shows a one-click **Copy** per invite that writes `${origin}/dnd/join/<code>` to the
      clipboard (with a "Copied!" confirm) — plus a Revoke. Added the explicit framing the request
      asked for: "Generate a link, hit Copy, and send it to your players. Opening it lets them sign in
      (or make an account) and join this campaign."
- [x] **The link target works.** `/dnd/join/[code]` accepts the invite and creates/authenticates an
      account, then routes into the campaign as a member — the B4 acceptance flow. **Email remnant
      reconciled ✅ SHIPPED** (`6d7cdeb7`): the join form no longer collects an email and the register
      route is now name+password-only (identity via `nameToKey`, 4-char minimum, 409 on a taken name —
      the exact Slice-36 signup convention), while keeping the invite validate/consume/attach logic.
      `join-name-only.test.ts` (7).

### 38c — Join → bring or make a character ✅ SHIPPED 2026-07-16
> "routed to the campaign page where they will be prompted to bring in a character already made, or
> to make a new character altogether."
- [x] **Shipped.** A member with no character in this campaign now sees a "Join this table with a
      character" onboarding prompt in `CampaignHub` offering BOTH paths: **Bring an existing character**
      (an inline picker of the characters they own that aren't already here → `addMyCharacter`) and
      **Make a new one** (→ `/dnd/characters/new?campaignId=<id>`, the builder with the campaign + its
      system attached). Previously the onboarding block offered only "Create"; the bring-existing path
      lived in a separate picker lower down — now both are in the first prompt a new member sees.

### 38d — Port a character into the campaign's system ✅ SHIPPED 2026-07-16
> "if that character does not have a character sheet for the campaign's system, prompt to translate…
> AI will help transpose the character into the new system as good as possible."
- [x] **Detect + offer translate — shipped.** The hub now threads the campaign's `system` and each
      character's `system` (`loadCampaignHub` + `CampaignHubData`/`HubCharacter`). `CampaignHub` shows a
      "**⇄ Translate <name> to <campaign system>**" prompt for any of your characters built for a
      different system (both sides must be a specific system — ambiguous on either side is skipped,
      since there's no rulebook to translate to/from).
- [x] **AI transposition — already existed, now reached.** The prompt calls the existing
      `POST /characters/[id]/system` (Slice-13 transpose): grounded on the TARGET rules only, it
      rebuilds the sheet in the campaign's system, keeping concept/name/level/role, and noting any
      substitution in `unmapped` for review.
- [x] **Non-destructive — the port is a new variant.** That endpoint `installTransposed` + `switchActive`
      over `system_variants`, snapshotting the current sheet first, so the player keeps their
      other-system version (the overlay principle). Custom-allowed ports still flow through the
      existing provenance/approval path.
- [x] Tests: `campaign-port.test.ts` (5) — the hub carries both systems, the mismatch is detected
      (ambiguous ignored), the translate calls the transpose endpoint non-destructively.

**Sequencing note:** 38a is the shippable start (system picker + allow-custom on create). 38b builds
on existing invites. 38c/38d are larger and depend on the builder (31) and variants being solid.

## Slice 39 — A slide-up "digital screen" console in the map player view ⏳ PARTIAL 2026-07-16

**Finding: the drawer already exists and works — in the REAL player console (`console.html`), not in
the studio's Player preview.** Verified in the browser: `#console` slides 246px ⇄ 30px with a
"▲ SENSOR CONSOLE — CLICK TO OPEN" peek header and a smooth transition; `#deckMin` toggles it and
clicking the peek reopens it. Exactly the described behaviour, already built.

The reported gap was that the studio's **"▶ Player" toggle** is a *different, lesser* preview
(`body.playmode` just hides the DM library/toolbar and shows an info panel) — it never surfaced the
console. So "I'm not seeing it when I click Player view as the DM" was real: the DM's preview and the
player's actual console are two different screens.

**Shipped:** an **"🖥 Open player console ↗"** link in the studio, shown only in Player mode and only
when opened from a campaign (`?campaign=`), pointing at `/dnd/campaigns/<id>/console?map=<id>` — the
real player experience with the working drawer. Verified: hidden in DM mode, appears in Player mode
with the correct URL.

**Still open (the fuller ask):** embed the console drawer *inside* the studio's Player preview (or
make Player mode load the console) so the DM sees the digital screen in place rather than opening a
new tab. Larger — it means either iframing `console.html` into the studio's play mode or factoring
the console out of its page. Deferred as its own follow-up; the affordance above closes the
"can't reach it" gap now.

### Original spec

> "In the player view I want the whole digital screen viewer to be available to open and close. It
> should pop up from the bottom of the map viewer, and then if we close it it just slides down to the
> bottom, but the top of it is always visible so that we can click on it to open it again. It should
> have all of the info displayed on the screen and knobs and all of that." … "It might already be
> built, but I am not seeing it when I click on player view as the DM."

- [ ] **Investigate what exists.** The map studio has a "▶ Player" mode (`map-studio.html`, the
      `data-mode="play"` button) and there is a player-facing console (`console.html`) with the
      dice-core/roll UI. Determine whether Player mode is supposed to surface that console and it's
      simply not mounting for the DM, or whether the console is a separate page never embedded in the
      map view. The user's "not seeing it" says the entry point is missing or hidden in Player mode.
- [ ] **The panel.** A bottom-anchored drawer over the map: slides UP to open (covering most of the
      viewer), slides DOWN to close leaving a **peek header always visible** (a handle/tab) that
      clicks to reopen. Smooth transform transition, not a mount/unmount.
- [ ] **Contents.** The full "digital screen" — all the info + knobs/controls the console shows
      (dice, rolls, whatever the screen surfaces). Reuse `console.html`'s content rather than
      rebuilding it; embed or share the component.
- [ ] **Visible in Player view**, including for the DM previewing Player mode (the reported gap).
- [ ] Remembers open/closed per session, like the chat resize (Slice 9's `useResizable` pattern is
      the reference for a remembered drawer).
- [ ] Verify by entering Player mode as the DM and confirming the drawer's peek header shows and
      toggles.

## Slice 25 — Connect it to the rest ✅ SHIPPED 2026-07-16

All four connections shipped: spells and forms are ledger sources, the AI digest reports
ledger-resolved numbers, and a DM equip propagates live (C11b + Slice 10). Details per item below.

- [x] **Spells cast on you land in the ledger as sources ✅ SHIPPED 2026-07-16 (commit pending).**
      One coherent slice, done: added `Spell.effects` (+ `effectDuration`), mounted the Slice-17
      `EffectRows` in `SpellEditor` (with validate-on-save) so a spell authors a lasting buff, and
      wired `castSpell` to SNAPSHOT those effects into a `spell`-sourced `ActiveEffect` on cast —
      copied, not referenced, so editing the spell later never touches a running buff, and re-casting
      replaces the same spell's effect (id `spell-<id>`) rather than stacking. The ledger already read
      `activeEffects`, so a cast Bless now resolves exactly like a potion (`sourceKindOf` → `spell`).
      This also discharges Slice 17's deferred "mount the builder in SpellEditor" item. Tests:
      `spell-effects.test.ts` (5).
- [x] **Forms/transforms become ledger sources ✅ SHIPPED 2026-07-16 (commit pending).** `CharForm`
      gained `effects?: Effect[]`, and `collectSources` now adds the **active** form as a `form`
      source — a Titan form that sets STR to 25 and grants a fly speed overlays through the ledger and
      reverts the instant you drop back to base (no bookkeeping — the base form is who you are). Only
      the active form contributes; an inactive form's effects are ignored. The bespoke `strikeDie` /
      form-attack fields keep their own render paths (this is the ledger-resolved half; `formDamageBonus`
      migration is left as cleanup, not a blocker). Authoring is via data/AI today (forms have no
      editor yet — a form-editor with the shared `EffectRows` is a natural follow-up). Tests:
      `form-effects.test.ts` (4).
- [x] **The character digest reports ledger-resolved values ✅ SHIPPED 2026-07-16 (commit pending).**
      `characterDigest` now builds the ledger and reports EFFECTIVE abilities (STR 22, base flagged as
      `[base 18]`), ledger-folded walk speed and max HP, and an `ACTIVE EFFECTS:` line naming every
      source currently modifying the character — so the AI rules on the current numbers and can see
      *why* they differ. AC still reads the stored base (its real value comes from the equipped-armour
      deriver the digest doesn't run — noted inline). A vanilla character shows no `[base …]` notes and
      no ACTIVE EFFECTS line. **AC is now accurate too**: the digest runs the same `deriveAc` the
      sheet does (equipped armour/shield + AC effects, DEX folded), so its AC matches what the player
      sees, base flagged when it differs. Tests: `character-digest.test.ts` +4 (15 total). This closes
      the "confidently wrong ruling" hazard flagged after Slice 10. **Spell save DC + attack added**
      (`bdbff686`): the digest omitted a caster's most-adjudicated numbers, so the AI had to guess the DC
      for "does the target save vs your Fireball?". Now a `SPELLCASTING:` line computed like SpellsPanel
      (effective ability + PB, folding `spell_save_dc`/`spell_attack`) — a Headband of Intellect / Rod of
      the Pact Keeper is reflected. +1 test (DC/attack rise by the item's +5). **Passive Perception +
      Initiative added** (`aa0bedbe`): two more routinely-adjudicated numbers ("does the guard notice?",
      "who acts first?"), effective (WIS/DEX through the ledger, Initiative folds `initiative` effects).
      +1 test. **Attack to-hit / save DC added** (`ba1fa3f6`): attacks listed damage but not whether they
      LAND ("does it hit AC 15?"). Each attack now carries its to-hit (effective ability + PB + bonus) or
      an AOE's save DC, computed like the Attacks table. +1 test. The digest now carries every effective
      number a ruling turns on — abilities, HP, AC, speed, Passive Perception, Initiative, spell DC/attack,
      and per-attack to-hit/DC. **Attack damage folds the ability mod too** (`6c8e7fae`): the digest showed
      the raw die while the sheet adds the mod automatically, so "how much damage?" understated it; now
      it adds the effective mod + bonus and resolves the per-level ladder. +1 assertion. **Save bonuses
      added** (`1d0ee892`): the digest listed which saves were proficient but not the bonus a target rolls;
      now a `SAVES:` line gives each save's effective total (proficient starred), so "does it make the CON
      save?" has a number. **Adjudicator told the numbers are already effective** (`af5298c0`): the ruling
      prompt now states the sheet values are the CURRENT effective ones (base + effects; `[base N]` /
      stated penalties shown), so the AI rules on them as-is and doesn't double-count a folded-in bonus or
      re-apply a reflected penalty — closing the loop so the effective numbers are USED right, not just
      reported. +1 test.
- [x] **Realtime equip propagation ✅ VERIFIED 2026-07-16 (no code change needed).** Already satisfied
      by the existing C11b broadcast (`store.tsx:369–405`): a DM equip writes `data`, pings the
      per-character channel, and every other viewer refetches the full authed sheet and re-derives —
      and since Slice 10 put the ledger in the render path, the equipped item's effects now apply live
      on the player's open sheet (before Slice 10 the refetch happened but the effects were ignored).
      The two shipped pieces compose; nothing further to build.
- [ ] Realtime: an equip by the DM propagates to the player's open sheet (C11b broadcast already exists).

---

# Appendix A — The effect target catalog

> "A potion might give us a fly speed, or a tunneling speed, or literally anything. Please consider
> it all… The sky and beyond is the limit."

The working-through of *every* effect. This is the **contract**: `lib/dnd/effects/targets.ts` is the
single registry, and the effect-builder picker (Slice 17), the AI's tool schema (Slice 14), the
ledger (Slice 10), and the star tooltips (Slice 13) are all **generated from it**. Adding a target
here makes it authorable, AI-emittable, resolvable and explainable at once — and nothing can drift,
because there is nowhere for it to drift *to*.

Each target declares: its key, its value type, which operations are legal on it, its display group,
and how it renders. "Literally anything" is achievable only if the vocabulary is **data**; a
hand-written menu is what makes a system finite.

**Movement** — `speed_walk` · `speed_fly` · `speed_swim` · `speed_climb` · `speed_burrow`
(the requested tunnelling) · `speed_all` (a blanket modifier) · `hover` (flag) · `ignore_difficult_terrain`.
Movement is not one number, and a potion of flying is not "+speed". Each mode is its own target with
its own base, so a fly speed can exist where a walk speed is 0 (and the sheet shows both).

**Core numbers** — `ability_str|dex|con|int|wis|cha` · `ac` · `initiative` · `hp_max` ·
`temp_hp` (catalog once wrote `hp_temp`) · `hit_dice` · `proficiency_bonus` · `spell_save_dc` · `spell_attack` · `carrying_capacity`.

**Rolls** — `attack_roll` · `damage_roll` · `attack_and_damage` · `save_<ability>` · `save_all` ·
`skill_<name>` · `skill_all` · `ability_check_<ability>` · `death_save` · `concentration_save` ·
`initiative_roll`. Operations: `add`, `set`, `advantage`, `disadvantage`, plus `reroll_below` (Great
Weapon Fighting), `minimum_roll`, `crit_range` (19–20 → 18–20), `crit_dice`.
✅ **`crit_range` shipped** (`f12a6c08`) as a proper target — widest-range-wins, only attacks consult it,
shown on the to-hit; `crit-range.test.ts` (8). The other three operations remain dice-engine work.

**Defenses** — `resistance` · `immunity` · `vulnerability` (by damage type) ·
`condition_immunity` · `condition_advantage` (advantage on saves vs a named condition).
✅ **`condition_advantage` shipped** (`637c982c`) — was in this catalog list but missing from the
registry; added with its own collect op + a Defenses render block ("Adv. on saves vs — poison
(source)"), listed not auto-applied (the rules ask the player to invoke it). `condition-advantage.test.ts` (5).

**Grants** — `grant_proficiency` (skill/tool/weapon/armour/language) · `expertise` (catalog once wrote
`grant_expertise`) · `grant_feature` · `grant_attack` · `grant_spell` · `grant_cantrip` · `grant_resource` ·
`grant_spell_slot` · `grant_sense` (darkvision/truesight/tremorsense/blindsight, with a range) ·
`grant_language` · `grant_action` (a new thing you can do).

**Identity** (Slice 11) — `name` · `image` · `token` · `species` · `class` · `subclass` ·
`gender` · `pronouns` · `profession` · `size` · `creature_type` · `alignment`.
✅ **`alignment` shipped** (`e2673bcf`) — was the one identity key in this catalog list missing from the
live registry; added as a text identity overlay homed on the Bio Details line (like gender/pronouns/
profession), AI-settable via `set_meta`. `identity-alignment.test.ts` (4).

**Instant** (Slice 12; fires once, leaves nothing) — `heal` · `temp_hp` · `damage` ·
`restore_resource` · `restore_slot` · `remove_condition` · `apply_condition` · `set_hp`.

**State** — `condition` (apply/suppress) · `exhaustion` · `concentration` · `inspiration`.

**Economy** — `attunement_slots` · `action_count` · `bonus_action_count` · `reaction_count` ·
`attacks_per_action` · `spell_slots_<rank>`.

**Meta** — `transform` (Slice 18) · `trigger` (Slice 15) · `note` (DM-adjudicated, no mechanics —
the honest escape hatch, and it must exist: an effect the engine can't model should be *labelled as
such*, not faked with a number that looks authoritative).

**Rules that fall out of the catalog:**

1. Every numeric target supports **negative** values. A cursed item is not a special case.
2. Every target must render **somewhere** on the sheet, or it is a lie. A target with no home is not
   done — that is the entire lesson of the current codebase, where a complete effects engine sits
   unread because nothing renders it. **`grant_sense` and `speed_burrow` need places to live before
   they can be granted.** ✅ **`rendersAt` accuracy** (`37b145fe`): the field must name the ACTUAL home,
   not just a plausible one — `grant_language` claimed "Overview · Languages" but effect-granted
   languages render in the Skills tab's "Granted Proficiencies" panel (they use the `grant_proficiency`
   op); corrected + `grant-language-renders.test.ts` (4) pins the real path. **Structured-grant mechanism
   clarified** (`e4904995`): `grant_attack`/`grant_spell`/`grant_resource` are ref-string effect targets,
   but a full Attack/Spell/Resource is a structured object — so they're authored on the item's
   `grantsAttack`/`grantsSpell`/`grantsResource` field (which renders while the item is active); there's
   no effect-render path. Help + rendersAt now name the field so a builder can't emit an effect that
   validates yet renders nowhere. `grant-render-paths.test.ts` (4).
3. `set` vs `add` is per-target and documented (Storm Giant Strength *sets* STR to 29; a belt *adds*).
4. Unknown target → the edit is refused with a reason. Never coerced, never silently dropped.
5. A target the engine cannot faithfully model gets `note`, not an approximation.

**Contract reconciliation (this catalog ↔ the live registry) ✅ — guarded by `appendix-a-contract.test.ts` (4).**
Every catalog name above is now either **built** in `lib/dnd/effects/targets.ts`, an **alias** for a
built target (pure naming, no missing capability), or an **explicit deferral** with a reason — and the
guard test fails if any entry is none of those, or if a deferred target later gets built without being
removed from the deferred list. So the contract and the code can no longer quietly disagree.
- **Aliases (naming only):** `hp_temp` → the registry's `temp_hp`; `grant_expertise` → `expertise`.
- **Deferred (need engine resolution, not just a render home):** `grant_cantrip` (a cantrip is a
  level-0 spell → `grant_spell` covers it), `grant_action` (a granted action is a `grant_feature` today),
  `grant_spell_slot` (a *persistent* bonus slot needs slot-grant resolution; `restore_slot` only refills
  existing ones), `set_hp` (needs the generic instant-effect consume path the bespoke consumable model
  doesn't route yet), `concentration` (needs a concentration tracker before it can honestly render),
  `inspiration` (`char.inspiration` is a player-toggled boolean; granting it needs instant resolution,
  not a ledger overlay), `action_count` (the specific `attacks_per_action`/`reaction_count`/
  `bonus_action_count` exist; a generic one has no distinct home). **Honesty correction (2026-07-17):**
  "exist" above meant *registered as targets*, but four of them — `attunement_slots`, `reaction_count`,
  `bonus_action_count`, `attacks_per_action` — are registered yet **read by no component**, so an item
  granting "+1 reaction" or "+1 attunement slot" validates and the AI can emit it, but it silently
  no-ops and renders nowhere (the current sheet has no action-economy tracker, and no attunement model in
  its Inventory). `effect-targets.test.ts`/`appendix-a-contract.test.ts` didn't catch this — the former
  only checks `rendersAt` is a non-empty string, the latter only checks a target exists. New
  `effect-target-render-gaps.test.ts` tracks the registered-but-unrendered set (the 4 economy targets +
  `concentration_save`, each with a per-target reason) and fails the moment one is wired or a new silent
  gap appears — turning a false-confidence gap into a guarded one. Wiring the economy ones needs an
  action-economy/attunement render home (larger feature work), deferred until then.
  **⚑ ROLL-TARGET SWEEP — a whole CLASS of dropped effects fixed (2026-07-18).** Walking "does every
  registered ROLL target actually reach its roll?" across the sheet found that many did NOT: they were
  resolved only by `deriveCharacter`/`apply.ts`, which is imported by **no** component or store (dead for
  display — the sheet runs on the ledger). So `death_save`, `<ability>_saves`/`all_saves`,
  `skill.<key>`/`all_skills`, and `attack_roll`/`damage_roll`/`attack_and_damage` — both their numeric
  bonuses AND their advantage/disadvantage — never reached the actual save/skill/attack/damage/death-save
  rolls (a Cloak of Protection's +1 saves, a +2-skill item, a +N-to-all-attacks item all silently did
  nothing). Fixed by folding `ledger.value(target,0)` + `ledger.rollFlags(target)` into each live roll
  site (`SavesSkills`, `Attacks`, `rollWeaponDamage`, `rollDeathSave`), exactly like the already-correct
  `initiative`/`spell_save_dc`/`spell_attack`. Verified no current content uses these targets, so every
  fix is a no-op for existing characters (purely makes the capability work). Guards:
  `saves-skills-effective.test.ts` (+2), `attack-global-bonus.test.ts` (4), `effect-target-render-gaps.test.ts`
  (death_save now reads true). Every registered roll target now reaches its roll. Of the Rolls-section *operations*,
  **`crit_range` shipped** (`f12a6c08`) — a proper roll target: `rollD20` gained a crit threshold, the
  store derives the widest range across sources (min, sidestepping the ledger's highest-wins `set`), only
  attacks consult it, and the Attacks table shows "crit 19–20"; `crit-range.test.ts` (8). The remaining
  operations (`reroll_below` for Great Weapon Fighting, `minimum_roll`, `crit_dice`) are still deeper
  dice-engine work — each needs the damage roller to rewrite individual dice, not just a threshold — so
  they stay deferred. `alignment`, `condition_advantage`, and now `crit_range` were the clean ones — all
  shipped.
- **Death-save state transition extracted + guarded (2026-07-17).** `rollDeathSave` derived the outcome
  TWICE inline — once for the roll-log label, once for the success/failure counts — two copies of the same
  nat-20/nat-1/≥10/cap-3 branches, free to drift (and the life-or-death rule was otherwise untested; only a
  long-rest reset touched it). Extracted the pure `applyDeathSave(state, natural, total)` (`_sheet/lib/death-save.ts`,
  like `derive-ac`): nat 20 → regain 1 HP + clear both tracks, nat 1 → two failures, total ≥ 10 → success
  else failure, each capped at 3. The store now calls it for both the label and the state, so they can't
  diverge. `death-save.test.ts` (6) pins every branch incl. the cap edge (a 2nd nat-1 at 2 failures lands on
  3) and that the threshold reads the folded TOTAL (an exhaustion-reduced 12→8 fails). No behavior change.

# Appendix B — Item type catalog

Per the request, **category is cosmetic**; mechanics are the item. A "boot" and a "pendant" differ
only by icon and slot. So the type list exists for filtering and for sane defaults, and never gates
what effects an item may carry:

`weapon` · `armor` · `shield` · `clothing` · `potion` · `scroll` · `wand` · `staff` · `rod` ·
`ring` · `amulet` · `belt` · `boots` · `gloves` · `cloak` · `helm` · `tool` · `instrument` ·
`ammunition` · `container` · `focus` · `trinket` · `treasure` · `food` · `poison` · `tattoo` ·
`vehicle` · `tech` · `cyberware` · `relic` · `quest` · `other`.

Orthogonal to type, and where the mechanics actually live: `slot` (what it occupies) ·
`equippable` · `attunable` · `consumable` · `charges` (+ recharge rule) · `cursed`
(can't be removed without help — a real mechanic, not flavour) · `stackable` · `weight` · `value` ·
`rarity` · `requirements` (a prerequisite to use it at all).

# Appendix C — The AI's write path

> "hook the AI up to it all so that it can create items for the players… It should be able to
> actually input items into the character's inventory."

- The AI's tool schema is **generated from Appendix A**, so it can emit any effect the engine
  supports and — importantly — *cannot* emit one it doesn't. The schema is the guardrail; this is
  why "the AI made no edits" was the schema working, and why widening it is the whole fix.
  ✅ **Operation list now actually generated** (`ec49f629`): the `edit_sheet` tool's operation list had
  been hand-written and DRIFTED — it listed `grant_sense` (a target, not an operation) and omitted
  `condition_advantage`, so the AI couldn't build a Dwarven-Resilience item. Built from `EFFECT_OPERATIONS`
  (the compile-time-exhaustive roster) so it can't drift again; `sheet-edits.test.ts` +2 guards it.
- It **writes** through `applySheetEdits` → the item lands in the real inventory, equippable and
  usable. Not a suggestion, not a chat message describing an item.
- The DM can generate items **onto a player's sheet** (they already have write access via
  `getCharacterAccess`); a player generating for themselves routes through the existing
  provenance/approval surface. No new permission model — the one that exists is correct.
- Every AI write is audited (`dnd_sheet_edits`) and marked ✎ (Slice 20), so nothing the AI adds is
  indistinguishable from something the player earned.
- The AI reads the ledger (Slice 19), so "make me something to fix my bad AC" can reason about the
  actual current AC and what is already modifying it.

---

## Final full-system QA walkthrough — MOVED TO `pending/` (2026-07-17)

The last D&D item (originally "Slice 40") — the manual, Playwright-driven acceptance pass that creates a
fresh account and builds one vanilla character per game system, level by level, fixing every correctness/
styling/formatting bug found — has been **parked in `docs/planning/pending/DND_FINAL_QA_WALKTHROUGH.md`**
at the owner's request (2026-07-17). It needs an interactive, DB-backed session on live Supabase (a
throwaway test account + characters), which we agreed to run at another time. The read-only browser sweep
already done (every no-data /dnd page runtime-verified error-free) and the "known gaps" notes for the run
travelled with it into that doc. Move it back to `in-progress/` when the run starts.
