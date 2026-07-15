# Character builder overhaul — game systems, grounded AI, 3 modes, custom sheets & AI edit

**Goal (from the DM):** make character building **fully fleshed out and intuitive**. Support
**system-ambiguous** builds OR a **specific game system** (Pathfinder, D&D 5e 2014, D&D 5e 2024, and other
popular systems). **Store all rules/systems/feats/abilities** per system and let the AI **research + store**
them. Critically, the AI must **not mix systems or hallucinate** — and when the user's uploads/notes are
**missing, confusing, or conflicting**, the AI should **ask the user** via a **built-in chat**. Provide
**lots of inline instructions** (what each field is, how builder functions work, what happens to the info).
The AI should build each character's **custom page from building blocks + HTML/CSS, stored per character**.
Users who don't want a custom sheet can **browse and pick a sheet style**. Three creation modes —
**Ruthless** (build it all, no questions, best-effort), **Questioning** (build the obvious, ask on
gaps/conflicts), **Step-by-step** (user defines every stat/feature/ability/mechanic, native or custom).
After generation, an **AI edit mode** for change/add requests (mechanics or styling).

**Additional specs (added after kickoff):** the AI must **only ever use the chosen system's** rules,
weapons, feats and actions (never another system's, never invented). **Every sheet design must work with
every system**, and **NPCs** must be able to **choose any sheet design** and use the full builder. The AI
must be able to generate real, working sheet UI — **tabs, widgets, text boxes, inputs, editable fields** —
and let the user **move/resize/restyle elements in real time** from the on-browser agent. When a character
crosses into a campaign on a **different system**, the AI should **transpose** it into a new sheet under
the target system's rules, staying as faithful as possible. The AI chat box must be **appealing, flowing,
and on-theme**. And the existing **sheet tabs (abilities/actions/combat/features) must be crash-free** —
there is currently a live `Cannot read properties of undefined (reading 'map')` error to fix.

## Current state (from the code)

- **Characters**: `dnd_characters` (`sheet_type`, `data` jsonb, `style_notes`, `import_notes`,
  `under_construction`, `ai_generated`). Creation via `POST /api/dnd/characters/import` (now
  campaign-optional) → uploads to `dnd-media` + `dnd_character_uploads`, then `POST
  /api/dnd/characters/[id]/ingest` runs the AI build. **No `system` concept exists yet.**
- **Sheet engine**: `app/dnd/_sheet/registry.ts` maps `sheet_type` → `{ theme, skin, modules }`; bespoke
  skins live in `_sheet/data/*` + scoped CSS. There's a `generic` sheet; custom skins are hand-authored,
  **not AI-generated HTML/CSS**.
- **AI**: `lib/dnd/ai.ts` (`dndComplete`/`dndCompleteJSON`/`dndToolCall`/`dndStream`, Anthropic).
  `CharacterBuildKit.tsx` (owner build panel) + `SheetChatPanel.tsx` (in-campaign chat). The ingest route
  populates the generic sheet from uploads.
- **RAG**: a pgvector store exists but it's the **surveying curriculum** RAG (seeds `09x`, `dnd_`-unrelated
  tables) — there is **no game-rules store**; this initiative adds one, mirroring that embedding pattern.

## Slices

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — Game-systems data model.** ✅ `seeds/422_dnd_systems.sql` adds `dnd_systems` (`key` unique,
  `name`, `publisher`, `notes`) and `dnd_system_entries` (`system_id` FK, `kind`
  rule/feat/ability/spell/class/species/item/condition/other, `name`, `body`, `source`, `data` jsonb,
  `embedding vector(1024)` matching the FS-tutor RAG dims) with per-system indexes and a **scoped**
  `match_dnd_system_entries(p_system_id, …)` cosine-search function that filters `WHERE system_id =
  p_system_id` — so retrieval can never cross systems. Adds `dnd_characters.system text NOT NULL DEFAULT
  'ambiguous'`. Seeds the `dnd5e-2014`, `dnd5e-2024`, `pathfinder2e` system rows (idempotent on `key`).
  `lib/dnd/systems.ts` exposes `GAME_SYSTEMS`, `SYSTEM_AMBIGUOUS`, `normalizeSystem`, `systemLabel`.
  Verified: `tsc` clean, lint clean, SQL balanced (parens matched) and follows the applied-seed convention.
- **Slice 1b — URGENT: fix sheet tab crashes.** ✅ Root cause: the sheet store applied a stored/AI-built
  `dnd_characters.data` directly (only checking `meta && abilities`), so characters missing arrays
  (`attacks`, `forms`, `inventory`, `progression`, `resources`, `customSkills`, `features`, `meta.chips`,
  `balance.*`) crashed tabs with `Cannot read properties of undefined (reading 'map')`. Added
  `normalizeCharacter(d)` in `_sheet/data/blank.ts` — deep-merges any partial over a complete
  `blankCharacter`, coercing every tab-iterated field to an array/object (junk-typed values too). Wired it
  into **every** load path in `state/store.tsx` (mount load, `reloadFromDb`, realtime refetch, localStorage
  preview). Verified: `tsc` clean, lint clean, new `__tests__/dnd/normalize-character.test.ts` (3 tests)
  passes — a minimal/junk/empty character normalizes with all arrays present.
- **Slice 2 — System reference ingestion + browse.** ✅ `lib/dnd/system-store.ts` ingests curated entries
  for a system (`addSystemEntries` — embeds each via the reused `lib/learn/embeddings` lib, storing the
  text now + embeddings when a key is configured) and retrieves them **scoped** (`searchSystemEntries`
  calls the `match_dnd_system_entries` RPC by `system_id`; `listSystemEntries` for browse) — never falling
  back to another system. API: `GET /api/dnd/systems` (picker list), `GET /api/dnd/systems/[key]/entries`
  (`?q=` scoped search / `?kind=` list) + `POST` (signed-in curate). `app/dnd/_ui/SystemLibrary.tsx` is a
  scoped browse/search panel. `seeds/423_dnd_system_starter.sql` seeds a few generic starter entries per
  system (idempotent; NULL embeddings → a keyed backfill embeds them). Verified: `tsc` clean, lint clean,
  SQL balanced, `__tests__/dnd/system-store.test.ts` passes (embed-text weighting + empty-query returns
  nothing = no cross-system leak). *(Real embeddings + semantic hits need `VOYAGE`/embedding env; the store
  degrades gracefully without it — browse works, semantic search returns [] rather than guessing.)*
- **Slice 3 — System-scoped, anti-hallucination grounding.** The build/ingest agent retrieves **only the
  chosen system's** entries (none for ambiguous/custom), with strict prompts: never invent rules, never
  borrow from another system, cite the entry used, and **flag** anything missing/unsupported instead of
  guessing. Verify: a build for `dnd5e-2014` never pulls `pathfinder2e` entries; unknown asks are flagged.
- **Slice 4 — Three creation modes.** A mode selector on the builder: **Ruthless** (build everything,
  best-effort, no questions), **Questioning** (build the obvious, collect open questions on
  gaps/conflicts), **Step-by-step** (guided define-every-field flow, native or custom). Drives the agent
  behaviour + persists the choice. Verify: each mode produces the described behaviour on a sample build.
- **Slice 5 — Conversational design chat (gaps & conflicts).** Extend the build chat so the AI **asks the
  user** about missing/confusing/**conflicting uploads** (e.g. two files disagree on a stat) and records
  the resolution back into the build. Verify: a conflicting-inputs build surfaces a question and applies
  the answer.
- **Slice 6 — AI-built custom sheet (blocks + HTML/CSS).** A block model: the AI composes the character
  page from reusable **building blocks** and stores the generated **HTML/CSS** per character (a
  `custom_layout`/`custom_css` on the character, rendered by a custom sheet skin). Verify: a generated
  character renders from stored blocks/CSS, sandboxed safely.
- **Slice 7 — Sheet-style browser + selection.** For non-custom users, a gallery to **browse existing
  sheet styles** (the registry skins) with previews and pick one (sets `sheet_type`). Verify: selecting a
  style switches the rendered sheet.
- **Slice 8 — AI edit mode.** Post-generation, an **edit chat** where the user requests specific changes/
  additions (mechanics, fields, abilities) or **styling** tweaks; the agent applies them to the sheet data
  / blocks / CSS. Verify: an edit request mutates the sheet as asked.
- **Slice 9 — Inline instructions & onboarding.** Thorough **help text** across the builder: what each
  field means, how each function works, what happens to uploaded info, and how the modes differ — so a new
  user can build confidently. Verify: help is present on the key builder surfaces.
- **Slice 10 — Every sheet works with every system + NPC parity.** Ensure every sheet skin/module renders
  for **any** system (system-agnostic *and* system-specific data) without crashes, and that **NPCs** get
  the same treatment: NPCs can **choose any sheet design** and use the full builder (system, modes, custom
  sheet). Confirm everything is **hooked up correctly** (no dead controls, no broken tabs). Verify: a
  sample character in each system + an NPC opens every tab and can switch sheet designs.
- **Slice 11 — AI-generated interactive sheet elements.** The AI composes real, working sheet UI from
  building blocks: **tabs, widgets, text boxes, inputs, editable fields, tables, counters, toggles** — the
  things a real character sheet has — bound to the character `data` so edits persist. Verify: an
  AI-generated sheet exposes editable inputs that save.
- **Slice 12 — Real-time on-browser customization.** The in-page AI agent can **move, resize, restyle and
  add/remove** sheet elements live (drag/reflow + CSS tweaks), so the sheet is fully customizable in real
  time from the chat. Verify: a customization request visibly changes the layout/style and persists.
- **Slice 13 — Cross-system transposition.** When a character built in one system enters a campaign using
  a **different** system (e.g. a D&D 5e-2024 character joining a 5e-2014 table), the AI builds a **new
  sheet that translates** the character into the target system's rules — staying as close to the original
  as possible while using only the target system's mechanics (grounded per Slice 3). Crucially this is a
  **mechanic + UI**: a character can hold **multiple system versions** (potentially 4–5), each a stored
  per-system sheet, and the user can **switch the active system** at will (a system switcher on the sheet;
  each version persists independently, keyed by system). Transposing to a not-yet-built system generates it
  on demand; existing versions just switch. Data model: per-character system variants (a
  `dnd_character_systems` variant store, or a `systems` map in `data`) with the active one driving the
  sheet. Make the transposition **reliable every time** (grounded; flag unmappable mechanics for the user).
  Verify: a 2024→2014 transpose yields a valid 2014 sheet mirroring intent, and switching back restores the
  2024 version unchanged.
- **Slice 14 — Themed AI chat box.** Make the builder's AI agent chat **appealing and well-flowing**,
  matching the site's Hextech theme (typography, colors, message bubbles, streaming, input affordances).
  Verify: the chat renders on-theme and streams smoothly.
- **Slice 15 — QA + docs.** End-to-end pass across the whole builder (system pick → mode → grounded build
  → chat resolution → custom/interactive sheet or style pick → real-time edits → cross-system transpose;
  NPC parity; no tab crashes), run the dnd vitest suite, then move this doc to `completed/`.

## Considerations
- **No cross-system contamination** is the core safety property — enforce it at retrieval (scope by
  `system_id`) *and* in the prompt (refuse to borrow), and make "I don't know / it's ambiguous" a
  first-class answer that triggers a question rather than a hallucination.
- **Reuse, don't reinvent:** mirror the existing embedding/RAG pattern for the systems store, extend
  `CharacterBuildKit`/`SheetChatPanel`/the ingest route rather than replacing, and keep the `sheet_type`
  registry as the style system.
- **Custom HTML/CSS must be sandboxed** (the map tools already render untrusted HTML via sandboxed
  iframes — follow that) so an AI-authored sheet can't break the app.
- **Scope realism:** "store every system" = build the **store + ingestion + scoped retrieval** and seed
  starter content; exhaustively importing every ruleset is ongoing content work, not a code slice — note
  what's seeded vs left to curate.
- **Verification:** app/server + AI features; prefer the dnd vitest suites + driving routes, and note
  anything needing the live app or an AI key.

### Status: IN PROGRESS (Slices 0–2 + 1b shipped; 3–15 pending)
