# Intuitive Games — Full System Buildout (library + builder + sheet)

**STATUS: IN-PROGRESS (started 2026-07-17).** Owner directive: make the Intuitive Games (IG) system fully
real across the app — (1) the **library page** must contain and express EVERYTHING on the real website, and
(2) the **character builder + character sheet** must build out all stances, feats, conditions, ancestries,
classes, etc., functional and editable, aligned to the website's actual rules.

> Owner (2026-07-17): "Flesh out all of the feats and conditions and all of the rules and everything that
> you can for the Intuitive Games library page. Go to intuitivegames.net and pull all of your info from the
> website. If something on the website is not defined or hasn't been built fully (the system is still a work
> in progress) then do not make anything up — just explicitly state either that it is a work in progress or
> that there is currently no information about that thing. I want all of the terms fully defined. AI needs to
> be able to understand all of the feats and conditions and stances and everything and how they work. We need
> all of the races fully fleshed out too. All of the information on the website must be fully contained and
> expressed on our library page."
>
> "Then, make sure that in the character builder and character sheets for Intuitive Games, all of the stances
> and feats and conditions and everything is all built out and functional and editable. Please make sure it
> all aligns properly with the actual rules from the website."

## Ground rules (carry over from `DND_RULES_PLATFORM` + the owner's constraints)

1. **Source of truth is intuitivegames.net — and ONLY it.** Every rule, term, number, feat, condition,
   stance, ancestry, class, and skill comes from the site. Pull it faithfully. Owner (2026-07-17): "only use
   info from the Intuitive Games source. We should not ever be using definitions or rules or anything that
   comes from somewhere else." So no D&D/PF assumption ever fills an IG gap — if the site doesn't say it, we
   don't either (see rule 2). Watch for accidental cross-system defaults (e.g. a generic condition body, a 5e
   feat) leaking into the IG path.
2. **NEVER invent.** If the site leaves something undefined, WIP, or empty, say so explicitly in the content
   ("*Work in progress on intuitivegames.net — no rules published yet.*" / "*The site does not define this.*")
   rather than fabricating a plausible rule. This is a hard rule the owner stated twice.
3. **Systems never leak across editions** — IG rules never resolve as D&D/PF and vice-versa (Ground Rule 1
   from the platform doc). IG content is scoped to the IG system id.
4. **Every builder/sheet element must render somewhere and be editable** — a stance the builder can pick must
   show on the sheet with its full rules text; a feat granted must appear in Features; a condition must be
   applyable and show its effect. Custom remains the explicit escape hatch.
5. **AI-legible AND AI-editable.** The library entries + rules data are what the AI reads to adjudicate; each
   term must carry enough structured/plain text that the AI understands how it works, not just its name. Owner
   (2026-07-17): "make sure the AI has access to everything we are building so that it can also edit things and
   explain how things work." So every IG element we build is both (a) explainable by the AI from the same IG
   source and (b) editable by the AI (set/clear a stance, apply/remove a condition, add a trait/feat) through
   the same operations the manual sheet controls use.

## The website's real structure (fetched 2026-07-17 — the content inventory to reproduce)

**Characters:** Backgrounds (`/backgrounds`) · Character Building (`/character-building`) · Classes
(`/classes` — 13+ classes in 4 groups: **Summoning** Archon/Beastmaster/Eldritch Binder/Packmaster/Summoner ·
**Nature** Conduit/Druid/Shifter/Witch · **Combat** Fighter/Champion/Freebooter/Marksman/Sohei · **Magic**
Wizard/Arcanist/Magician/Shaman) · Combat Feats (`/feats-combat`) · General Feats (`/feats-general`) ·
Stances (`/stances`) · Traits / Ancestries (`/traits-ancestries`).
**Items:** Armor & Shields (`/armor-shields`, damage-reduction mechanics) · Equipment (`/equipment`) ·
Magical Items (`/magical-items`) · Tools (`/tools`) · Weapons (`/weapons`).
**Rules:** Core Rules (`/core-rules`) · Conditions (`/conditions`) · Skills (`/skills`) · FAQs (`/faqs`).
**Additional:** Companion Creatures (`/companion-creatures`) · Spell List (`/spell-list`) · Game List
(`/game-list`) · Redistribution (`/redistribution`).

*(Each slice below fetches the specific page and transcribes it faithfully — this list is the map, not the
content. Where a page turns out to be sparse/WIP, the slice records that per Ground Rule 2.)*

## Current code state (mapped 2026-07-17)

IG is a **fully-registered, `available` focus system** (id **`intuitive-games`**), not a stub — bespoke
builder + read-only sheet + 26-article glossary + AI build. Key facts for this buildout:
- **System registration:** `lib/dnd/systems.ts` `GAME_SYSTEMS` (status `available`); mechanical record in
  `lib/dnd/system-rules.ts` `SYSTEM_RULES['intuitive-games']` (abilities, 3-action economy, degrees of
  success, levels 1–10, `content` block).
- **Library page** is built purely from `system-rules.ts` → `lib/dnd/library.ts` `libraryPageFor()` +
  `lib/dnd/glossary/intuitive-games.ts` (26 articles), rendered by `app/dnd/library/[key]/page.tsx`. DB-free.
- **Rich IG content already exists but is UNDER-surfaced:** `lib/dnd/systems/intuitive-games/content.ts`
  holds 10 stances (A/B effects), ~40 powers/spells by school, 6 defensive powers, weapon/movement taxonomy,
  bestiary — but the library page shows only abilities/classes/skills/species/conditions/sample-feats.
- **Accuracy gaps vs the website:** conditions + feats were **names-only** (no rules text). *(Update: the
  old IG_FEATS names once thought "invented" — `Boundless Stamina`/`Inspiring Insight`/`Daring Quickness` —
  turned out to be REAL site feats in the Special/Ability sections; A7 authored all 83 general feats with
  text. `Death Spiral` is a Combat "Style" move, reconciled in A8.)* Species are 10 names + prose, not structured
  (`speciesView` returns name-only `custom` for IG). Stances exist but aren't editable on the sheet or wired
  into the effect engine.
- **Builder/sheet:** `app/dnd/_ui/IGCharacterBuilder.tsx` (guided picker → `/api/dnd/characters/[id]/ig-build`)
  + `builder.ts`; `app/dnd/_ui/IGSheet.tsx` is **entirely read-only** (stances/feats/conditions display but
  can't be edited without re-running the whole builder). Making them editable needs a new per-element edit
  route (`ig-edit`) analogous to `ig-build`.
- Faithful website source transcribed to scratchpad `ig-source/` (conditions ✓ verbatim, stances ✓, core
  rules ✓, ancestries ✓, feats — inventory + gist, RE-FETCH verbatim before authoring feat bodies).

---

## Area A — Library page: contain & express everything on the site

Reproduce the entire intuitivegames.net rules corpus in the IG library so a reader (and the AI) can find any
term fully defined. One slice per site section; each fetches the page, transcribes faithfully, marks WIP/gaps.

- [ ] **A0 — Content pipeline + system-entry shape.** Confirm how IG library entries are stored/rendered and
      establish the repeatable fetch→entry pipeline (mirroring the SIT/learn `JSON→gen_seed` approach if
      applicable). Decide TS-module vs seed, and how an entry expresses sections + a machine-readable term
      list the AI can consume.
- [ ] **A1 — Core Rules** (`/core-rules`) — the foundational mechanics (action economy, checks, the core
      resolution system).
- [x] **A2 — Character Building** (`/character-building`) — ✅ SHIPPED (`content.ts` `IG_BUILD_STEPS` +
      `IG_PROGRESSION_NOTE`). A "Building a character" library section captures the **level-1 creation order**
      (intro → 8 ASBs cap 14 → background → class → subclass → traits → one Combat + one General feat → 2+INT
      skill ranks max 1/skill → Solidas = highest Profession/Craft/Perform +20), each step listing what it
      grants, plus the **L2–10 progression** (specializations at L4, greater at L8, unique powers at L6,
      capstone + manifestation at L10). Source-only; the L2–10 per-level table wasn't fully enumerated on the
      site, so only the confirmed milestones are stated (not fabricated). `library.test.ts` +1 (guard now 23
      sections).
- [x] **A3 — Skills** (`/skills`) — ✅ SHIPPED (`content.ts` `IG_SKILL_RULES` + `IG_COMBAT_SKILL_RULES`). The
      skills section now leads with **how skill checks work** (ranks max = level + proficiency + ability mod
      when proficient/ranked; 2 + INT ranks/level; trained = any ranks/proficiency; Take 10 / Take 20; the
      10/15/20/25 DC guide) instead of a bare count, and a new **Combat Skills** section captures the distinct
      subsystem (aggressor's modifier vs the defendant's Reflex save; a trained defender opposes with a
      combat-skill check; Dirty Trick's full outcome ladder) + the 9 combat skills, each searchable. Some
      per-skill combat mechanics beyond Dirty Trick were truncated on the site — noted, not fabricated (the
      Mastery feats from A8 cover their enhancements). `library.test.ts` +3 (completeness guard now 22
      sections).
- [x] **A4 — Conditions** (`/conditions`) — ✅ SHIPPED (`content.ts` `IG_CONDITIONS`). All **18 conditions**
      transcribed **verbatim** from the site with full mechanical text (Asleep…Sickened); names drift-guarded
      against `systemConditions('intuitive-games')`. The library page now renders conditions as a **full-text
      Condition/Effect table** (was name-only chips), and `searchLibrary` returns each condition's real effect
      (so "grappled"/"flat-footed" resolves the actual rules) — directly serving the AI-legibility rule.
      System-scoped (IG condition text can't leak into another system). `ig-content.test.ts` +1,
      `library.test.ts` +3. None were WIP — the page is fully defined.
- [x] **A5 — Traits / Ancestries** (`/traits-ancestries`) — ✅ SHIPPED (`content.ts` `IG_ANCESTRIES` +
      `IG_ANCESTRY_TRAIT_RULES`). All **10 ancestries** with **both ancestry traits each**, trait text
      transcribed **verbatim** from the site (re-fetched for exact wording); names drift-guarded against
      `systemSpecies('intuitive-games')`; the trait-system rules captured (chosen at level-up, non-retrain,
      standard non-ancestry traits). The library page now renders ancestries as a **full-trait-text table**
      (was name chips + prose), and search resolves each ancestry AND each individual trait by name
      ("barkskin", "cave vision") with full text. System-scoped (no leak). (IG has no fixed per-ancestry
      size/speed — Medium by default; size-changing traits like Burrower/Colossal say so themselves.)
      `ig-content.test.ts` +1, `library.test.ts` +3. Feeds Area B's species/traits panel (B1). None WIP.
- [x] **A6 — Backgrounds** (`/backgrounds`) — ✅ SHIPPED (`content.ts` `IG_BACKGROUND_DEFS`; the previously
      EMPTY `IG_BACKGROUNDS` is now derived from it). All **10 backgrounds** (Academic, Acolyte, Artist,
      Cosmopolitan, Hunter, Laborer, Merchant, Physician, Soldier, Tinkerer), each with starting HP, its two
      ability boosts, skill proficiencies, and the base Stance it grants (Advanced at Lv 5) — transcribed
      from the site. Library gains a Backgrounds table; each is searchable; the provenance classifier now
      recognizes IG backgrounds (was an empty list). `library.test.ts` +3. Nicely, the 10 backgrounds map
      1:1 onto the 10 stances.
- [x] **A7 — General Feats** (`/feats-general`) — ✅ SHIPPED (new `lib/dnd/systems/intuitive-games/feats.ts`
      `IG_GENERAL_FEATS`). All **83 general feats** (46 main + 26 skill feats + 6 special + 5 ability-score)
      with prerequisites + full effect text from the site. The library feats section is now a full
      **Feat/Prerequisites/Effect table** (was the "representative sample" chip stub), each feat is searchable
      with its real rules, the provenance classifier recognizes every authored feat (so a real feat like
      Fleet isn't flagged custom), and AI grounding lists the real general-feat names. **CORRECTION:** the
      earlier "invented names" note below was wrong — `Boundless Stamina`/`Daring Quickness`/`Inspiring
      Insight`/`Armor Proficiency` ARE real site feats (Special/Ability sections the first fetch missed).
      `ig-content.test.ts` +1, `library.test.ts` +3. Combat feats are A8.
- [x] **A8 — Combat Feats** (`/feats-combat`) — ✅ SHIPPED (`feats.ts` `IG_COMBAT_FEATS`). All **68 combat
      feats** transcribed verbatim from the site: 24 main combat feats, 8 **Mythic Stances** (Dragon/Fey/
      Genie/Griffon/Phoenix/Treant/Unicorn/Wyvern), 5 **Styles** (Ancient/Arcane/Spell/Wild/Zealous, each
      with its three moves inline), and 10 **Mastery** feats. `igAllFeats()` now returns General + Combat
      (151 total) → the library feats table + search + provenance classifier + AI grounding all cover the
      full feat set (a Mythic Stance / Style / Cleave / Power Attack all resolve real rules). A few
      proficiency feats appear on both pages, as on the site. `ig-content.test.ts` +1, `library.test.ts`
      restructured to cover both feat pages. Resolves the `Death Spiral` note — it's a Style: Ancient Combat
      move, now present.
- [x] **A9 — Stances** (`/stances`) — ✅ SHIPPED (`content.ts` `IG_STANCE_DEFS` + `IG_STANCE_RULES`).
      Gave the 10 stances a structured **Basic (below Lv 5) / Advanced (Lv 5+)** representation transcribed
      verbatim from the site (replacing the old paraphrased "A:/B:" summaries; `IG_STANCES` is now derived
      from the defs so the classifier/grounding keep working). The library page renders a **Stances section**
      (general rules lead + a Stance/Basic/Advanced table) — previously stances weren't on the rules page at
      all — and each stance is searchable by name ("defensive stance") with both tiers. System-scoped (no
      leak to systems without the mechanic). The structured defs also set up the Area-B stance editor (B5).
      `ig-content.test.ts` +1, `library.test.ts` +3; fixed 2 tests that asserted the old wording.
- [~] **A10 — Classes** (`/classes`) — ✅ *Roster + overview shipped* (`content.ts` `IG_CLASS_GROUPS` +
      `IG_CLASS_RULES`). The library classes section previously showed only a 3-class sample; it now shows
      **all 13 classes grouped into the 4 groups** (Summoning: Archon/Beastmaster/Eldritch Binder/Packmaster ·
      Nature: Conduit/Druid · Combat: Fighter/Freebooter/Marksman/Sohei · Magic: Wizard/Magician/Shaman) with
      the class-building overview (HP 8–12 + background HP, primary-attribute ASB, proficient skill + weapons,
      a starting power, subclass access → powers/specializations/greater specializations/manifestations) and
      the 5 subclasses (Arcanist/Summoner/Champion/Witch/Shifter) noted as distinct. All 13 remain searchable.
      `library.test.ts` +2. **Remaining:** each class's full per-level feature ladder — a dedicated
      per-class fetch+author pass (large; the site has it, WebFetch summarization makes verbatim fidelity the
      hard part), tracked for a follow-up so nothing is fabricated.
- [~] **A11 — Spell List / Powers** (`/spell-list`) — ✅ *Surfaced* (`library.ts`): the existing
      `IG_POWERS` (~38 powers by school, with effect text), `IG_DEFENSIVE_POWERS` (6 reactions), and the
      `IG_ACTIONS` 3-action-economy list now render as library sections (Powers & Spells / Defensive Powers /
      Actions tables) and are searchable by name with full effect text. `library.test.ts` +3. **Remaining
      (verify):** the `IG_POWERS`/defensive-power text was sourced from the IG template + site earlier; do a
      pass against the live `/spell-list` to confirm every power + its wording matches (source-only rule),
      then mark done.
- [x] **A12 — Companion Creatures** (`/companion-creatures`) — ✅ SHIPPED (`content.ts` `IG_COMPANION_TYPES`
      + `IG_COMPANION_RULES`). The site's actual companion content: the **4 companion types by Archon
      subclass** (Beast Companion/Beastmaster, Elemental/Summoner, Familiar/Eldritch Binder, Swarm/Packmaster)
      with their rules, plus the advancement rules (HP = 2 + Con/level, skill ranks, 6 ability increases). Per
      Ground Rule 2, the site does NOT define how a companion is directed in combat, so that's recorded as
      "not yet published" rather than fabricated. Library gains a Companion Creatures section; searchable.
      `library.test.ts` +2. **Finding:** the broad `IG_CREATURES` bestiary in `content.ts` (Ape…Dragons…)
      came from the sheet TEMPLATE, not this web page (which names only the Tiger example) — flagged for a
      source-fidelity review, kept as-is for now since the builder's companion picker uses it.
- [x] **A13 — Items: Weapons** (`/weapons`) — ✅ SHIPPED (`items.ts`). The site's weapons page is a declared
      **work in progress** — it defines the framework (melee/ranged classes with costs, the 9 weapon
      properties, class+type proficiency, the Solidas/Coins/Pennies currency) but lists **NO named weapons**.
      Captured the full framework (`IG_WEAPON_CLASS_DATA`, `IG_WEAPON_PROPERTIES`) as library Weapons +
      Weapon Properties tables, and recorded the "no named roster yet (WIP)" note in the lead per Ground Rule
      2 (not fabricated). Classes + properties searchable. `library.test.ts` +3 (shared with A14).
- [x] **A14 — Items: Armor & Shields** (`/armor-shields`) — ✅ SHIPPED (`items.ts`). The armor page is
      complete: the **DR mechanic** + the non-proficiency penalties (Reflex = DR for armor, attack = shield
      bonus), the full armor roster (`IG_ARMORS`: Metal/Leather/Wood/Bone/Cloth + Banded + Component, each
      with DR/STR/cost/vulnerabilities) and shields (`IG_SHIELDS`: Braced + Bucklers). Library gains Armor +
      Shields tables; armor/shields searchable with their stats. System-scoped.
- [x] **A15 — Items: Equipment, Tools, Magical Items** (`/equipment`, `/tools`, `/magical-items`) — ✅
      SHIPPED (`items.ts`). **Magical Items complete:** the full Eldritch Jewels system (DC-30 enchant, 5-jewel
      limit, Head/Arms/Legs/Torso slots, DC-20 recharge, pricing) + all **12 enchantments** with effects, as a
      library table + searchable. **Equipment partial (WIP on site):** currency + the 4 equipment packs + the
      8 professional kits (4 Solidas each) are captured; the Outdoor/Tools/Refined/Sustenance/Materials tables
      are empty headers on the site → recorded as WIP in the lead (not fabricated). **Tools WIP:** the concept
      is defined (some checks need a tool; trained-with-a-tool grants proficiency on the relevant skill) but no
      roster exists → captured the rule + WIP note. Library gains Equipment/Tools/Magical Items sections.
      `library.test.ts` +2. This completes the item pages (A13/A14/A15).
- [x] **A16 — FAQs** (`/faqs`) — ✅ RESOLVED (nothing to reproduce). A fetch of the FAQs page returned no
      question/answer content — the page is empty / a work in progress. Per Ground Rule 2, no FAQ section was
      fabricated; recorded here as "no FAQ content on the site yet." Revisit if the page later carries Q&A.
- [~] **A17 — Verification pass.** ✅ *Completeness guard shipped* (`library.test.ts`): a test asserts the IG
      library page surfaces **all 21 major sections** of intuitivegames.net (core/abilities/advancement/
      classes/skills/ancestries/backgrounds/stances/conditions/feats/powers/defensive-powers/actions/
      companions/weapons/weapon-properties/armor/shields/equipment/tools/magical-items) and that every
      section carries real content — so no part of the buildout can silently regress. **Remaining:** a
      final side-by-side human pass against the live site (best done with the sheet walkthrough) + the A11
      spell-list verify + the A10 per-class ladders.

## Area B — Character builder + sheet: functional, editable, rules-aligned, with live mechanics + tooltips

Make IG a first-class buildable system, not a custom fallback. Each mechanic the site defines becomes a real,
editable element on the builder + sheet, scoped to IG and grounded ONLY in the Area-A data (owner, 2026-07-17:
"only use info from the Intuitive Games source — never definitions or rules from somewhere else"). The owner's
expanded requirements (2026-07-17):
- **Display what's in play.** If the character has taken a stance, the sheet clearly shows WHICH stance; if
  they have a condition, it clearly shows WHICH condition — always visible, not buried.
- **Tooltips everywhere.** Hovering any effect in play (a stance, a condition, an ancestry trait, a feat, any
  modifier) pops a tooltip explaining exactly how it works, in the site's own words.
- **Real mechanics, wired.** Where a stance/condition/trait affects checks, rolls, actions, saves, damage, DR,
  speed, etc., BUILD that mechanic so it actually applies (not just descriptive text) — hooked up correctly
  per class and per ancestry so each does exactly what the site intends.
- **AI parity.** The AI must have access to everything built here — able to EDIT it (set/clear a stance, apply
  a condition, add a trait/feat) AND explain how any of it works, from the same IG source data.

- [~] **B0 — IG data models + effect vocabulary.** Structured data (mostly done in Area A: `IG_STANCE_DEFS`,
      `IG_CONDITIONS`, `IG_ANCESTRIES`; feats pending A7/A8) PLUS a machine-readable **effect model** for the
      mechanical ones — what each stance/condition actually modifies (advantage/disadvantage on X, +½-level to
      Y, DR, speed, etc.) so the sheet can APPLY it and a tooltip can explain it. Scoped to IG; never imports
      another system's rules. **AI grounding done** (`system-rules.ts` `systemRulesBlock`): the IG block now
      feeds the AI the FULL rules text — every stance's Basic/Advanced effect, every condition's exact IG
      effect (explicitly flagged "use these EXACT IG effects, never another system's same-named condition"),
      and every ancestry's two traits with full text — so the AI can explain + edit from IG source only, no
      cross-system leak. `ig-content.test.ts` +1. **Remaining:** the machine-readable effect model that the
      SHEET applies (B4/B5 mechanics).
- [~] **B1 — Ancestry/traits in the builder + sheet.** IG ancestries selectable in the builder; the sheet
      renders each ancestry's full traits (from A5) with per-trait tooltips; size/speed-changing traits reflect
      on the sheet where feasible. **Sheet panel shipped** (`IGSheet` + `findIGAncestry`, `ig-content.test.ts`
      / `ig-sheet-tooltips.test.ts`): the IG sheet now renders an **Ancestry traits panel** — the ancestry
      name (+ provenance badge), its flavor blurb, and BOTH ancestry traits with full rules text, each
      hover-explaining itself — replacing the bare text row. Unknown ancestries degrade to the name row.
      **Remaining:** the builder's ancestry picker already offers them (`IGCharacterBuilder`); reflecting
      size/speed-changing traits (Burrower/Colossal/etc.) in the derived numbers is a follow-up.
- [ ] **B2 — Classes in the builder.** IG classes selectable with their features/progression from A10.
- [~] **B3 — Feats.** IG combat + general feats (from A7/A8) offered rules-legally (prerequisites honored);
      editable; shown on the sheet sourced correctly, each with a tooltip of its full effect. **Sheet
      tooltips shipped** (`IGSheet` Reference feats + `findIGFeat`, `ig-content.test.ts`/`ig-sheet-tooltips.test.ts`):
      each feat chip now hover-shows its category, prerequisites, and full effect (from the 151-feat catalog);
      unknown/custom feats stay plain. **Remaining:** offering feats rules-legally at the right slots
      (prerequisite gating in the builder) + feat add/remove editing — a follow-up.
- [~] **B4 — Conditions: display + tooltip + mechanics + edit.** Conditions the character has are clearly shown
      on the sheet; hovering shows the full rules text (from `IG_CONDITIONS`); the mechanical ones actually
      apply (e.g. Flat-Footed drops Dex to Reflex/skills; Shaken/Sickened −2; Blind disadvantage) via the
      effect model; addable/removable on the sheet (new `ig-edit` route) and by the AI. **Display + tooltip
      done** (`IGSheet`, `ig-sheet-tooltips.test.ts`): condition chips carry the full IG condition text as a
      hover tooltip. **Condition mechanics model + legible display done** (`modifiers.ts`,
      `ig-modifiers.test.ts`): `igConditionSummary(conditions)` computes the stacking flat d20 penalty
      (Shaken/Sickened −2 each, straight from the IG text) + a legible list of disadvantage/other effects;
      the sheet's Combat panel now shows "−N to attacks, saves & skill checks (sources)" + each disadvantage
      line beneath the condition chips (shown, not silently folded into base numbers — the platform's
      exhaustion pattern). Unknown/custom conditions contribute nothing (never invented). **Remaining:**
      add/remove condition editing (B6 route) + optionally folding the penalty through the rolls.
- [~] **B5 — Stances: display + tooltip + mechanics + edit.** The sheet clearly shows the ACTIVE stance (one at
      a time); hovering shows its Basic/Advanced text; the effect is applied to the relevant rolls per the
      Basic-below-L5 / Advanced-at-L5+ rule; enter/leave editable on the sheet + by the AI. Marquee mechanic.
      **Display + tooltip done** (`IGSheet` Combat panel, `ig-sheet-tooltips.test.ts`): stances show their
      active-at-level benefit + a full-rules hover tooltip. **Remaining:** applying the stance effect to the
      actual rolls (mechanics), a single-active-stance selector, and edit (needs the `ig-edit` route, B6).
- [x] **B6 — Editable IG sheet + AI edit route.** The bespoke `IGSheet` is read-only today; add an `ig-edit`
      route + write mode so stances/conditions/feats/traits are editable in place, and expose the same
      operations to the AI (edit + explain) — AI parity with the manual controls. **Edit engine + route
      shipped** (`edit.ts` + `app/api/dnd/characters/[id]/ig-edit/route.ts`): pure immutable `applyIgEdit`
      supporting `set_active_stance` (one active at a time — enter replaces), `clear_stance`,
      `add_condition`, `remove_condition` (case-insensitive de-dupe, empty-name no-op, never mutates input),
      plus `parseIgEdit` (validates the payload) + `describeIgEdit` (audit line). The route is write-gated
      (owner/player/DM via `requireCharacterWrite`), rejects non-IG characters, and persists just the patched
      sidecar. `ig-edit.test.ts` (10). **AI edit tool shipped** (`ai.ts` `IG_EDIT_TOOL` +
      `parseIGEditToolCall` + `igEditToolInstruction`): the AI's `edit_ig_sheet` tool enumerates exactly the
      four ops and routes a tool call through the SAME `parseIgEdit` the manual route uses (the AI can't emit
      an edit the manual path wouldn't accept); the grounding lists the real stance + condition names and
      forbids inventing. `ig-ai.test.ts` +1. **On-sheet edit controls shipped** (`IGSheet` + page.tsx,
      `ig-sheet-tooltips.test.ts`): a write-gated (canEdit=canWrite) stance selector (enter one → replaces;
      "— no stance —" clears) and condition controls (a "+ add condition…" picker + a × on each chip) that
      POST to the `ig-edit` route and refresh the sheet; hidden for read-only viewers. **AI chat dispatch
      shipped** (`app/api/dnd/characters/[id]/ai-edit/route.ts`, `ig-ai.test.ts`): the live AI-edit route now
      offers `edit_ig_sheet` to the model ONLY for IG characters (with the stance/condition grounding + the
      current active stance/conditions in context); a returned tool call runs through the same
      `parseIGEditToolCall` → `applyIgEdit` and persists just `data.ig` (audited to `dnd_sheet_edits`). So
      "put me in a defensive stance" / "apply Shaken" now work by voice to the AI, at parity with the manual
      controls. **B6 is functionally complete** — manual controls + AI both edit the IG sidecar.
- [~] **B7 — Tooltip system.** A reusable hover/focus tooltip on every in-play effect (stance, condition,
      trait, feat, modifier) sourced from the IG rules text — keyboard- and touch-reachable (a tablet at the
      table), theme-token styled. **Pure model shipped** (`inPlay.ts`): `igEffectsInPlay({stance, conditions,
      level})` returns, for the active stance + each condition, a `{name, summary, tooltip, vanilla}` — the
      display badge text + the full hover-tooltip rules text, drawn only from `IG_STANCE_DEFS`/`IG_CONDITIONS`
      (a stance/condition the system doesn't define resolves as an honest "custom", never invented). Encodes
      the level rule (Basic below Lv 5 → Advanced at Lv 5+, a single benefit). `ig-in-play.test.ts` (10).
      **Wired into IGSheet** (`ig-sheet-tooltips.test.ts`): the Combat panel's stance chips now show the
      active-at-your-level benefit summary + a `title` hover tooltip with the full Basic/Advanced rules; the
      condition chips show a `title` tooltip with the full IG condition text; both get a help cursor + a
      "hover for the full rules" hint. **Remaining:** a prettier custom-styled/focusable tooltip component
      (native `title` works + is accessible now; visual polish is a follow-up), and rendering it for ancestry
      traits/feats too. Needs visual confirmation in-app.
- [ ] **B8 — Alignment/verification.** Walk an IG character build and confirm every offered option matches the
      site, numbers add up, mechanics apply correctly, and stances/conditions/feats/traits are all editable,
      displayed, tooltipped, and AI-accessible. (Ties into the QA walkthrough in `pending/`.)

---

### Sequencing
Area A (library content) first and mostly in parallel-friendly slices — the builder/sheet (Area B) depends on
the structured rules A produces. Within A, do the rules-core + conditions + ancestries + feats + stances early
(B depends on them). Build the smallest meaningful slice, verify (typecheck + lint + test), commit, push,
annotate here; move to `completed/` only when every item ships or is explicitly deferred with a rationale.
Honor Ground Rule 2 relentlessly: a sparse/WIP page is recorded as WIP, never fabricated.
