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

---

## Ground rules (these are why the platform exists — do not violate them)

1. **A system's rules never leak into another system.** The same word means different things in
   different games (a Blades "score" is a heist; PF2's Frightened is numeric, 5e's is binary; a 5e
   proficiency bonus is not PF2's level-added proficiency). Everything is keyed by system.
2. **Editions are different systems.** 2014 vs 2024 Exhaustion, Surprise, Grappled, Prone,
   Inspiration and feats all have two different *correct* answers. Never merge them.
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

## Slice 1 — Sheet contrast: finish the sweep

The base stylesheet still has hardcoded colours that break on light skins. Several rounds of this
have already landed; this slice is to finish it and make regressions impossible.

- [ ] Audit **every** `color: #fff` / hardcoded hex / `rgba(<literal>)` left in
      `app/dnd/_sheet/styles/theme.css` outside the `.skin-*` blocks and the token block. For each,
      decide: theme token (panel text ⇒ `var(--ink)`, accent text ⇒ the accent token) or genuinely
      on a solid dark fill (leave, and comment why).
- [ ] Same audit for **inline styles in components** (`app/dnd/_sheet/components/*.tsx`) — CSS
      tests can't see these. `RollStage.tsx` and `CharacterGallery.tsx` are known offenders.
- [ ] Extend `__tests__/dnd/sheet-contrast.test.ts`: assert the base stylesheet contains **no**
      hardcoded `color: #fff` outside `.skin-*`/`::selection`/`.stream-*`, so this can't regress.
- [ ] Drive each skin in the app (Jack=rulebook, Susie=streamer, Sarah=donata, Lazzuh=neon,
      a default Hextech character) and read every tab. Screenshot each.

**Done when:** every number and label on every skin is legible, and a new hardcoded white fails CI.

## Slice 2 — Clickable rules on the sheet

Everything on a sheet that names a rule should open its explanation.

- [ ] `RuleTip` component: wraps a term, opens a popover with the glossary article
      (`findTerm(system, term)`), with **See also** links and an **Ask the AI** fallback.
- [ ] Auto-link feature/feat/condition/attack bodies via `termsMentionedIn(system, text)`
      (already written, tested) — longest match wins, never inside a longer word.
- [ ] Conditions in `CombatPanel`, features in `Features`, attacks in `Attacks`, and every
      class feature from the level builder become clickable.
- [ ] For a term with no glossary entry (homebrew), the popover offers "Ask the librarian",
      pre-filled, focused on the character's system.

**Done when:** clicking any condition/feature/feat on Jack's, Susie's and Sarah's sheets shows a
real explanation, verified in the app.

## Slice 3 — AI situational adjudication

The chat can already answer rules questions. It must also rule on *this character in this moment*.

- [ ] Pass character context into `POST /api/dnd/library/chat` (already accepts `characterId`):
      load the sheet, build a digest (class, level, features, conditions, resources, gear).
- [ ] Adjudication prompt: given the character + the grounded rules, answer questions like
      "can I cast this while grappled?", "does my feat apply here?", "what happens if I shove a
      creature two sizes larger?". It must reason to a ruling, cite the rule it used, and say
      plainly when the rules genuinely don't settle it (then suggest a DM call).
- [ ] Mount the chat on the character sheet with the character's system pinned.
- [ ] Tests: the prompt carries the character digest; the cross-system hint still fires; the
      chat refuses to invent a rule.

**Done when:** on Jack's sheet you can ask "can I use Cross Counter while grappled?" and get a
grounded, character-aware answer.

## Slice 4 — 5e 2024: feats, backgrounds, species, languages

The classes are done; the rest of character creation is not.

- [ ] **Feats** as structured data (`lib/dnd/feats/dnd5e-2024.ts`): all four categories — Origin,
      General (with prerequisites + the +1 ability), Fighting Style, Epic Boon. Full rules text.
- [ ] **Backgrounds** (16): ability scores (+2/+1 or +1/+1/+1), Origin feat, 2 skills, 1 tool,
      equipment. Remember: in 2024 the **background** grants the ability increases.
- [ ] **Species** (10): traits only, **no ability score increases**, with size/speed/creature type.
- [ ] **Languages** + tool proficiencies as lists.
- [ ] Wire into the level builder: an ASI choice offers real feats with prerequisites checked;
      character creation offers backgrounds/species.
- [ ] Tests: no feat grants an ability increase it shouldn't; every background's feat exists;
      species grant no ASIs (the 2014-vs-2024 trap).

## Slice 5 — Custom class / subclass / feat builder UI

The engine (`lib/dnd/classes/custom.ts`) is built and tested; there is no UI.

- [ ] `/dnd/characters/[id]/build/class` — define a class from scratch: hit die, saves, skills,
      per-level features, resources, spellcasting. Live `reviewCustomClass` feedback (errors block,
      balance warnings advise).
- [ ] Homebrew subclass + homebrew feat builders.
- [ ] AI assist: describe the class in prose → a draft definition the player edits.
- [ ] Persist to the character/campaign; flag as custom content so the **existing** provenance +
      DM approval (seed 443, `lib/dnd/provenance.ts`, `submission.ts`) picks it up.
- [ ] A custom class must appear in the level builder exactly like an official one.

## Slice 6 — Full class data for the remaining systems

One system per slice — depth-first, verified against sources. In priority order:

- [ ] **6a — D&D 5e 2014**: all 12 classes + Artificer, L1–20. The 2014/2024 differences are the
      whole point (subclass levels differ per class; ASI at 19; no Weapon Mastery; Ranger has
      Favored Enemy/Natural Explorer).
- [ ] **6b — Pathfinder 2e**: classes with flat HP/level, the feat cadence (ancestry 1/5/9/13/17,
      class at even levels, skill at even, general at 3/7/11/15/19), attribute boosts at 5/10/15/20.
- [ ] **6c — Pathfinder 1e**: BAB progressions, save progressions, skill ranks, feats at odd levels.
- [ ] **6d — Starfinder 1e**: Stamina/HP/Resolve, EAC/KAC, four-ability increases at 5/10/15/20.
- [ ] **6e — Cyberpunk RED**: Roles + Role Ability ranks 1–10 (no levels — model as rank tracks).
- [ ] **6f — Shadowrun 6e**: archetypes + priority creation (no levels — model as Karma spend).
- [ ] **6g — Call of Cthulhu 7e**: occupations + skill-point formulas (no levels, no classes).
- [ ] **6h — Blades in the Dark**: playbooks + special abilities + XP tracks (no levels).

For the level-less systems the model must NOT invent a level table — extend the builder to express
"advancement by spend" (Karma/IP/skill checks) instead. `registry.ts` already reports
`classKnown: false` honestly for these; that is the behaviour to replace, not to paper over.

## Slice 7 — Everything connected

- [ ] Choosing a system on a character drives: available classes, skills list, conditions,
      the sheet's ability model, and the glossary the sheet links to.
- [ ] `system-validate.ts` runs against the class data (not just the catalog) so a sheet with a
      2014 feature on a 2024 character is flagged.
- [ ] The sheet's Progression tab renders from `progressionTable(def, sub)` rather than
      hand-authored per-character arrays.
- [ ] Jack: decide whether Rangor/Pugilist become a real custom class + subclass through the Slice-5
      builder (they are currently hand-authored sheet data with `system: ambiguous`).

## Slice 8 — Semantic search (optional, needs a key)

- [ ] Backfill embeddings for `dnd_system_entries` + the glossary once `VOYAGE_API_KEY` exists
      (`scripts/dnd-seed-system-rules.ts` already embeds when configured).
- [ ] Project the glossary into the store so semantic retrieval reaches the full articles.
- [ ] Keyword search must remain the fallback — it is the only thing that works without a key.

---

## Known gaps / notes for whoever picks this up

- **`VOYAGE_API_KEY` is absent**, so all semantic search returns nothing. Keyword search
  (`lib/dnd/library.ts`, `keywordSearchSystemEntries`) is what actually runs today. `ANTHROPIC_API_KEY`
  IS present, so the AI works.
- **Storage-policy seeds** (102, 290, 295) need table ownership and can only be applied from the
  Supabase dashboard. 7 more seeds fail as "policy/trigger already exists" — harmless.
- **Uncertain rules flagged by the authoring agents** (worth a second source before release):
  Warlock invocations-known progression; Wizard Spell Mastery's swap clause; Great Old One
  Clairvoyant Combatant's limit; Monk Warrior of the Elements details; Starfinder
  Fatigued/Exhausted magnitudes and Grappled/Pinned penalties; Envoy expertise die thresholds.
- **`spellsKnown` currently carries prepared counts** for 2024 preparers. Consider renaming to
  `spellsKnownOrPrepared`. The 2024 Ranger/Paladin/Cleric/Druid prepared counts are prose in
  `preparedRule`, not structured — promote them if the builder needs the numbers.
- **"Rank" vs "level" for spells**: the codebase says rank (UA wording); the printed 2024 PHB says
  level. A sitewide rename if player-facing accuracy matters.
- **`SubclassDefinition.alwaysPrepared`** can't express Circle of the Land's four terrain lists —
  they're in the feature body instead.
