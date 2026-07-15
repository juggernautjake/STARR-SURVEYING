# Character builder — authoritative per-system rules so mechanics are never wrong

**Goal (from the DM):** double-check all the character-building/systems work and **continue building out all
the rules and systems** so a character **never** ends up with the wrong mechanics or stats for the game
system it's set to.

## Audit of the current state (why wrong mechanics can slip in)

- A character carries a `system` (`dnd_characters.system`) — `dnd5e-2014`, `dnd5e-2024`, `pathfinder2e`, or
  `ambiguous` (`lib/dnd/systems.ts`, `GAME_SYSTEMS`).
- Grounding (`lib/dnd/grounding.ts` → `systemGroundingBlock`) is wired into **all three** AI build paths:
  `ingest`, `ai-edit`, and `system` (transpose). Good.
- **But** the grounding's rules come only from `searchSystemEntries` (RAG over `dnd_system_entries`), which
  **returns `[]` unless a Voyage embeddings key is set** (`embeddingsConfigured()`), and the store today holds
  only **9 tiny generic starter entries** (`seeds/423`). So in the common case the grounding degrades to
  *"rely on your own knowledge, flag anything unsure"* — which is precisely where wrong mechanics/stats can
  slip in.

## Strategy — deterministic first, RAG as an enhancement

The guarantee must NOT depend on an embeddings key or the DB. So the core is an **in-code, typed rules
catalog** that grounding injects verbatim **every time**, plus a **validation layer** that catches
cross-system or out-of-range mechanics after a build. RAG stays as an optional enhancement for prose lookups.
(Content is expressed as concise **mechanical facts/numbers** — not verbatim rulebook text — so it's accurate
and distributable.)

## Slices

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — Deterministic rules catalog + always-on grounding.** ✅ `lib/dnd/system-rules.ts` — a typed
  `SYSTEM_RULES` catalog with the core mechanical facts per system (ability model + generation + range/cap +
  modifier formula, proficiency model, level range + advancement, saves model, core resolution, action
  economy, rest, ASI/feat/boost cadence, and edition "must-know" gotchas), for `dnd5e-2014`, `dnd5e-2024`,
  and `pathfinder2e`. `systemRulesBlock(system)` renders it as an authoritative prompt block, and
  `expectedProfBonus`/`rulesForSystem`/`systemRulesSummary` expose it. Wired into `systemGroundingBlock` so
  the **correct system's real numbers are ALWAYS in the prompt with zero embeddings/DB dependency** — RAG
  hits now only augment (never replace) it; the ambiguous case carries an explicit "no system-specific
  numbers" block. The catalog encodes the exact things that get built wrong: 2014's TIERED exhaustion vs
  2024's SINGLE stacking, ability boosts from RACE (2014) vs BACKGROUND (2024), Weapon Mastery as 2024-only,
  and PF2's level-to-proficiency / three saves / three-action / degrees-of-success model with a "do NOT
  import 5e" warning. Verified: `tsc` clean, lint clean, `__tests__/dnd/system-rules.test.ts` (7 tests) +
  updated `grounding.test.ts`; full dnd suite (243) green.
- **Slice 2 — Full structured content per system.** ✅ Extended each catalog entry with a `content` block:
  the **skills** (name → governing ability), **classes** (`ClassDef`: key ability, 5e `hitDie` XOR PF2
  `hpPerLevel`, level-1 save proficiencies, caster type), **species/ancestries**, standardized
  **conditions**, and representative **feats** — for all three systems. `systemRulesBlock` now lists the
  valid classes/species/skills/conditions so the AI picks only from the real, in-system options, and
  `systemSkills`/`systemClasses`/`systemSpecies`/`systemConditions` accessors feed the validator (Slice 3).
  The data encodes the real edition differences: 12 core 5e classes (both editions) + Artificer for 2014
  only; the **2024 species list drops standalone Half-Elf/Half-Orc and adds Aasimar/Goliath/Orc**; 5e uses
  hit dice + ability saves while PF2 uses HP-per-level + Fortitude/Reflex/Will; PF2 skills (Thievery,
  Occultism, Society…) and Remaster conditions (Off-Guard, Clumsy…) are its own, disjoint from 5e. Verified:
  `tsc` clean, lint clean, `__tests__/dnd/system-content.test.ts` (6 tests: well-formed + self-consistent
  lists, hit-die-vs-HP, save models, 2014↔2024 species delta, PF2-specific skills/conditions, block lists
  the options); full dnd suite (249) green.
- **Slice 3 — Validation layer (the safety net).** ✅ `lib/dnd/system-validate.ts` —
  `validateCharacterForSystem(character, system)` checks a built sheet against its active system's catalog and
  returns typed `SystemViolation`s: level out of range (error), an ability score past the 5e cap (warn, and
  **only** for score-based systems so PF2's modifier field yields no false positive), a class not in the
  system (warn — catches e.g. a "Warlock" in Pathfinder 2e), and a species/ancestry not in the system (warn —
  catches the 2014↔2024 delta like "Aasimar" in 2014 or "Half-Elf" in 2024). Token-matching tolerates
  multiclass/variant strings ("Fighter 3 / Rogue 2", "Variant Human"). The ambiguous/unknown case validates
  nothing system-specific. Wired into all three build routes: `ai-edit` appends `⚠ Check:` lines to the chat
  summary + returns `violations`; `ingest` folds them into `unmapped` (errors also become open
  `build_questions`); `system` (transpose) returns them so a bad transposition is caught. Nothing is silently
  kept — the user always sees the flag. Verified: `tsc` clean, lint clean,
  `__tests__/dnd/system-validate.test.ts` (8 tests: valid → none, ambiguous → none, level range, 5e cap vs
  PF2 no-false-positive, cross-system class, cross-edition species both ways, multiclass tolerance, summary);
  full dnd suite (257) green.
- **Slice 4 — Seed the store with the same facts (RAG + browse parity).** ✅ `lib/dnd/system-rules-entries.ts`
  — a pure `systemRulesEntries(system)` that projects the catalog into `dnd_system_entries` rows (core rule
  facts as individual entries, one `class` entry per class with its knobs, plus species/skills/conditions/
  feats list entries), keeping the store a faithful projection of `system-rules.ts` (single source of truth,
  no drift). `scripts/dnd-seed-system-rules.ts` iterates `GAME_SYSTEMS` and upserts via the existing
  `addSystemEntries` (embeds when a Voyage key is present, text-only otherwise), **idempotent** — it only
  inserts entries whose name isn't already present, leaving curated rows untouched. Verified: `tsc` clean,
  lint clean, `__tests__/dnd/system-rules-entries.test.ts` (2 tests: faithful well-formed per-system entry
  sets with one entry per class + none for ambiguous; and no cross-system leakage — PF2 has Witch not
  Warlock, 5e has Warlock not Witch); full dnd suite (259) green. *(Actually populating the DB needs the
  Supabase service env; the derivation + idempotent upsert are proven, and grounding/validation already work
  without the store.)*
- **Slice 5 — QA + docs.** Verify grounding always carries the right system's facts, validation flags a
  planted cross-system mechanic, the dnd vitest suite is green, then move this doc to `completed/`.

## Considerations
- **Never cross systems:** every catalog lookup is keyed by the exact system; the ambiguous case must supply
  NO system-specific numbers (only edition-neutral guidance).
- **Deterministic guarantee:** the rules block + validation must work with zero external services — that's
  the whole point. RAG is additive, never required.
- **Accuracy over verbatim:** store mechanical facts/numbers, paraphrased; cite the source book by name.
- **Extensible:** adding a system = one catalog entry + one `GAME_SYSTEMS` row (+ optional seed rows).

### Status: IN PROGRESS (Slices 0–4 shipped; 5 (QA) pending)
