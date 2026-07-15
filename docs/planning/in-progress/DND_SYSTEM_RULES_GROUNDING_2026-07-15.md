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
- **Slice 1 — Deterministic rules catalog + always-on grounding.** A typed `lib/dnd/system-rules.ts` with the
  core mechanical facts per system (ability score model + ranges, proficiency/level progression, saves model,
  core resolution mechanics, rest/advancement cadence, the ASI/feat cadence). A `systemRulesBlock(system)`
  renderer, wired into `systemGroundingBlock` so the correct system's real numbers are ALWAYS in the prompt —
  even with no embeddings — and the "ambiguous" case forbids any system-specific numbers. Unit tests.
- **Slice 2 — Full structured content per system.** Extend the catalog with the bulk lists: classes (hit die,
  key ability, saves, spellcasting), species/ancestries, the skill list + governing ability, the conditions
  list, and the feat/spell framing — per system, no cross-contamination. Tests assert each system's lists are
  disjoint where they must be (e.g. PF2 skills ≠ 5e skills; 2024 vs 2014 differences) and self-consistent.
- **Slice 3 — Validation layer (the safety net).** `lib/dnd/system-validate.ts` — validate a built
  `Character` against its active system's catalog (ability scores in range, level in range, class/species
  belong to the system, proficiency bonus matches the level, skills exist in the system) and return typed
  violations. Wire it into the build routes so a wrong-system stat is flagged back to the user (and surfaced
  in `unmapped`/questions), never silently kept. Tests.
- **Slice 4 — Seed the store with the same facts (RAG + browse parity).** Regenerate the SQL seed so
  `dnd_system_entries` carries the catalog's real per-system entries (so the browse UI and, when a key is
  present, semantic retrieval reflect the same authoritative facts). Idempotent; embeddings backfilled when a
  key exists.
- **Slice 5 — QA + docs.** Verify grounding always carries the right system's facts, validation flags a
  planted cross-system mechanic, the dnd vitest suite is green, then move this doc to `completed/`.

## Considerations
- **Never cross systems:** every catalog lookup is keyed by the exact system; the ambiguous case must supply
  NO system-specific numbers (only edition-neutral guidance).
- **Deterministic guarantee:** the rules block + validation must work with zero external services — that's
  the whole point. RAG is additive, never required.
- **Accuracy over verbatim:** store mechanical facts/numbers, paraphrased; cite the source book by name.
- **Extensible:** adding a system = one catalog entry + one `GAME_SYSTEMS` row (+ optional seed rows).

### Status: IN PROGRESS (Slice 0 shipped; 1–5 pending)
