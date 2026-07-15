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
- **Slice 1 — Game-systems data model.** Migration for `dnd_systems` (`id`, `key` e.g. `dnd5e-2014`,
  `name`, `publisher`, `notes`) and `dnd_system_entries` (`system_id`, `kind` — rule/feat/ability/spell/
  class/species/item/condition, `name`, `body` text, `source`, `data` jsonb, `embedding vector`) with a
  per-system index for **scoped retrieval**. Add a `system` field to characters (`'ambiguous'` or a system
  key) — a column or in `data`. Seed the `dnd5e-2014`, `dnd5e-2024`, `pathfinder2e` system rows (empty of
  entries). Verify: schema applies; a character can carry a system.
- **Slice 2 — System reference ingestion + browse.** A mechanism to **research/curate + store** entries
  for a system (paste/upload/admin-curated), chunk + embed them (reuse the embedding lib), and a browse/
  search UI scoped to one system. Seed a small starter set per seeded system so retrieval works end-to-end.
  Verify: entries ingest with embeddings; a scoped search returns only that system's entries.
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
- **Slice 10 — QA + docs.** End-to-end pass (system pick → mode → grounded build → chat resolution →
  custom sheet / style pick → AI edit), run the dnd vitest suite, then move this doc to `completed/`.

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

### Status: IN PROGRESS (Slice 0 shipped; 1–10 pending)
