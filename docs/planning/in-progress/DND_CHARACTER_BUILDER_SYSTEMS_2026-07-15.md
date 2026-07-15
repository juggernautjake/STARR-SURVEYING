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

**Additional specs (round 2):** ship an actual **default character sheet** styled in the site's **League
of Legends / Hextech** look (the current default is the bespoke "Lazzuh" purple-alien skin — replace it
with a neutral Hextech default that is fully customizable). A **bottom-right AI chat** on the character
page lets the user ask for any change — new feats/abilities/mechanics/transformations/spells, or sheet
**styling/format** — and it applies them live. Enforce **hard AI permission boundaries**: the agent may
only affect **character creation, the chat stream, and this character's sheet** (its content, mechanics,
look) — it must NOT edit other site pages or anything outside character customization.

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
- **Slice 3 — System-scoped, anti-hallucination grounding.** ✅ `lib/dnd/grounding.ts`
  (`systemGroundingBlock`) retrieves **only** the character's system's entries (via the scoped
  `searchSystemEntries` from Slice 2) and returns a strict instruction: use ONLY that system's
  rules/feats/spells/actions/weapons/numbers, **never borrow from another system, never invent**, and put
  ambiguous/missing/conflicting things in `unmapped` (ask the user) instead of guessing. System-ambiguous
  characters get a "do not assume any ruleset" instruction and **no** rules block. Wired into the AI ingest
  route (`characters/[id]/ingest`): it now reads the character's `system`, builds a query from the sources,
  appends the retrieved rules block to the prompt content, and folds the grounding instruction into the
  system prompt. Verified: `tsc` clean, lint clean, `__tests__/dnd/grounding.test.ts` (3 tests) — ambiguous
  forbids assuming a system with no block; a specific system constrains to itself + flags unknowns; null →
  ambiguous. *(A live end-to-end "5e-2014 build never pulls pathfinder2e" check needs the embedding + AI
  keys; the scoping is enforced structurally by the per-`system_id` SQL filter + the prompt.)*
- **Slice 4 — Three creation modes.** ✅ `lib/dnd/build-modes.ts` defines **Ruthless** / **Questioning** /
  **Step-by-step** with `normalizeBuildMode` + a distinct `buildModeInstruction` per mode (ruthless =
  build it all, no questions; questioning = build the clear parts, list gaps/conflicts as questions in
  `unmapped`; step-by-step = don't auto-fill, guide field-by-field). `seeds/424_dnd_build_mode.sql` adds a
  `dnd_characters.build_mode` column (default `questioning`). The new-character form gained a **Game
  System** picker (grounds the build, defaults ambiguous) + a **Build Mode** radio group; the import route
  persists `system` + `build_mode`; the ingest route reads `build_mode` and folds its instruction into the
  agent prompt alongside the system grounding. Verified: `tsc` clean, lint clean,
  `__tests__/dnd/build-modes.test.ts` passes (normalize defaults to questioning; the three instructions are
  distinct and match their behaviour). *(The instructions currently route questions through `unmapped`; a
  dedicated `questions` channel + the conversational resolution is Slice 5.)*
- **Slice 5 — Conversational design chat (gaps & conflicts).** ✅ The `edit_sheet` tool gained a
  **`questions`** array (design decisions the AI needs the user to resolve — missing/ambiguous/**conflicting
  uploads**); the mode instructions route gaps there (empty in ruthless). `seeds/425_dnd_build_questions.sql`
  adds a `build_questions` jsonb column; the ingest route persists the questions. `BuildQuestions.tsx`
  surfaces them on the character page for the owner with an answer box per question; submitting posts to the
  new `POST /api/dnd/characters/[id]/answer` (owner/DM-gated), which stores the answers as an **authoritative
  source note** + clears the questions, then the client re-runs `/ingest` so the sheet rebuilds using the
  answers as the source of truth. Verified: `tsc` clean, lint clean, existing mode/grounding tests still
  pass (5). *(A live conflicting-uploads round-trip needs the AI key; the channel + resolution loop is
  wired and type-safe.)*
- **Slice 6 — AI-built custom sheet (blocks + HTML/CSS).** ✅ A block model: `lib/dnd/custom-sheet.ts`
  defines the reusable **building blocks** (`heading`, `text`, `stats`, `list`, `table`, `note`,
  `divider`, `html`), a `normalizeLayout` that keeps only recognized/well-formed blocks (unknown types
  dropped), and `composeCustomSheet(layout, css)` which turns them into a single **sanitized HTML
  document**: every text value is HTML-escaped, `html` blocks are sanitized (scripts / handlers /
  `javascript:` / active tags stripped), and the AI's `custom_css` is neutralized so it can't break out of
  the `<style>`. `seeds/441_dnd_custom_sheet.sql` adds `dnd_characters.custom_layout` (jsonb
  `{title?,blocks[]}`) + `custom_css` (text). A new `custom` `sheet_type` in the registry; `SheetRoot`
  renders the composed document in a **bare-`sandbox`ed `<iframe srcdoc>`** (no scripts, no same-origin —
  the same untrusted-HTML pattern the map tools use via `labels.js htmlFrameSrcdoc`) via the new
  `_sheet/components/CustomSheet.tsx` when `sheet_type='custom'` and blocks exist, else it falls back to the
  module engine. `characters/[id]/page.tsx` passes the stored `custom_layout`/`custom_css` (already returned
  by `getCharacterAccess`'s `select('*')`). Verified: `tsc` clean, lint clean,
  `__tests__/dnd/custom-sheet.test.ts` (6 tests) — every block type renders, text is escaped, html blocks
  sanitized, malformed blocks dropped, CSS can't escape the `<style>`, `hasCustomLayout` gate. *(The AI
  populating the blocks is Slice 11/8's tool work; here the render path + storage + sandbox are proven. A
  live iframe-render check needs the running app.)*
- **Slice 6b — Default Hextech character sheet.** ✅ `hextechTheme` in `_sheet/theme.ts` — a DARK
  League-of-Legends / Hextech palette (deep Piltover navy grounds, Hextech teal energy, engraved gold
  accents, Cinzel/Spectral serifs) — plus a `hextech` `SheetSkinId` with a full `.dnd-sheet.skin-hextech`
  block in `styles/theme.css` (hex-framed gold-ruled cards with a teal inner glow, engraved-gold uppercase
  headers, teal links, gold table headers). Registered a `default` `sheet_type` (`{ theme: hextechTheme,
  skin: 'hextech' }`) and pointed the **legacy `generic`** at the same, and `getSheetConfig`'s fallback now
  resolves to `default` — so every new AND existing default/generic character renders on Hextech instead of
  the Lazzuh purple defaults. New-character creation now stamps `sheet_type: 'default'` in all three paths
  (create, import, DM NPC). The store's DB-mode transient placeholder switched from `structuredClone(lazzuh)`
  to `blankCharacter('')` so a new character never flashes Lazzuh's content before the DB load. The Lazzuh
  skin (and its `forms` module) remains registered and available — just no longer the fallback. Verified:
  `tsc` clean, lint clean, `__tests__/dnd/registry-default.test.ts` (3 tests: unknown→Hextech not Lazzuh,
  default/generic on the hextech skin, Lazzuh intact) + updated the donata fallback test; full dnd suite 205
  pass. *(A live visual check of the Hextech render needs the running app.)*
- **Slice 7 — Sheet-style browser + selection.** ✅ `lib/dnd/sheet-styles.ts` — a server+client-safe
  catalog of the pickable registry skins (Hextech default, Neon Odyssey, Streamer, Candy Bazaar, Homebrew
  Rulebook) each with a preview palette, plus `isSelectableSheetStyle` (excludes the AI-only `custom` and
  the internal `generic` alias). The character PATCH route now accepts `sheet_type`, guarded by
  `isSelectableSheetStyle` so only a real user-pickable style can be set. `app/dnd/_ui/SheetStyleBrowser.tsx`
  is a collapsible gallery: each card renders a mini preview swatch in the style's palette, marks the active
  one, and on click PATCHes `sheet_type` + `router.refresh()` so the sheet re-renders on the chosen skin.
  Wired into the character page for anyone with write access — which covers **NPCs** (DM-owned, so the DM
  gets the browser on them too). Verified: `tsc` clean, lint clean, `__tests__/dnd/sheet-styles.test.ts`
  (3 tests: catalog shape, custom/generic not pickable, validation) — full dnd suite green. *(A live
  click-to-switch visual check needs the running app.)*
- **Slice 8 — AI edit mode (bottom-right chat).** ✅ `app/dnd/_ui/SheetEditChat.tsx` — a floating,
  on-theme (Hextech) chat dock pinned bottom-right of the character page (owner/DM only, via `canWrite`). The
  user asks for any change in plain language (new feats/abilities/mechanics/transformations/spells, attacks,
  stats…); each request POSTs to the existing `/ai-edit` route and the AI's summary streams back as a chat
  bubble, then the mounted sheet **reloads live**. The reload uses a new `dnd:reload-character` window event
  the sheet store now listens for (the chat is a separate React tree, so it dispatches the event and
  `CharacterProvider` calls `reloadFromDb`). Hardened the `/ai-edit` route: it now authorizes via
  `getCharacterAccess` (handles campaign-less personal characters + the assigned player, which the old
  `campaign_id`-only check broke) and folds in the **system grounding** (`systemGroundingBlock` on the
  character's `system`) so edits stay strictly inside the chosen ruleset — no cross-system rules, no invented
  mechanics — replacing the hardcoded "D&D 5e architect" prompt with a system-agnostic one. The header states
  the scope ("Edits only <name>'s sheet") — the visible edge of the Slice 8b boundary. Verified: `tsc` clean,
  lint clean, full dnd suite (208) green. *(Live apply-and-persist needs the AI key + running app; the edit
  path, grounding, auth, and live-reload wiring are in place and type-safe. Styling-via-CSS/blocks edits ride
  the custom-sheet system and deepen in Slices 11–12.)*
- **Slice 8b — AI permission boundaries.** ✅ A single write chokepoint: `requireCharacterWrite(id)` in
  `lib/dnd/characters.ts` resolves access and requires `canWrite`, so every AI-driven write is keyed to one
  character id **and** the caller's owner/assigned-player/DM authorization (absent `.access` ⇒ the caller
  returns `{status,error}`). Refactored **all three** AI-write routes onto it — `ai-edit`, `ingest`, and
  `answer` — which also fixed the fragile `getCampaignRole(campaign_id)`-only checks that broke for
  campaign-less personal characters. `lib/dnd/ai-scope.ts` is documentation-as-code: it enumerates the
  **allowed surface** (character creation, the chat stream, and THIS character's own sheet — its data,
  `custom_layout`/`custom_css`, and `sheet_type`) and the hard prohibitions (no other character, no page,
  campaign, map, user, or non-character resource), and provides `assertCharacterScopedOps` which enforces
  that every `edit_sheet` op is a set/add/remove of a sheet field with no forbidden target term. Verified:
  `tsc` clean, lint clean, `__tests__/dnd/ai-scope.test.ts` (3 tests: the real `edit_sheet` op enum passes
  the boundary; ops like `edit_other_character`/`delete_map`/`ban_user` are rejected; `applySheetEdits`
  output's top-level keys never exceed a Character's — the edit path cannot introduce a foreign-resource
  field). Full dnd suite (211) green. *(A live 403-on-foreign-target check needs the running app; the guard
  + the bounded tool vocabulary make it structurally impossible.)*
- **Slice 9 — Inline instructions & onboarding.** ✅ `lib/dnd/builder-help.ts` centralizes the help copy
  (name, system, build modes, sources, notes, art, style, what-happens-to-uploads, AI build, open questions,
  sheet style, edit chat) — explaining what each field means, how each function works, what happens to
  uploaded info, and how the three modes differ (the no-cross-system guarantee is spelled out).
  `app/dnd/_ui/InfoTip.tsx` is a reusable accessible "ⓘ" tip (hover/focus/click) that pulls from the
  catalog; `app/dnd/_ui/BuilderHelp.tsx` is a collapsible 6-step "how character building works" onboarding
  walkthrough. Wired into the **new-character form**: the walkthrough sits above the fields and an `InfoTip`
  sits on every field label (name/system/mode/sources/notes/art/style). Verified: `tsc` clean, lint clean,
  `__tests__/dnd/builder-help.test.ts` (3 tests: every key surface has real help, the mode + no-cross-system
  copy is present, the uploads-fate copy explains private storage + notes). Full dnd suite (214) green.
- **Slice 10 — Every sheet works with every system + NPC parity.** ✅ Every sheet is structurally
  system-agnostic: the `system` is a `dnd_characters` column, not part of the sheet `data`, and
  `normalizeCharacter` (Slice 1b) guarantees every tab-iterated array/object is present regardless of
  system — so any skin renders for any system with no broken tabs. Closed the NPC-parity gap: the **import
  (full builder)** route now accepts an `isNpc` flag (DM-gated inside a campaign; personal NPC library
  otherwise) so a DM can run the SAME builder for an NPC — system, mode, uploads, custom sheet — with the
  NPC kept private and off the visible roster. NPCs already inherit the style browser, edit chat, and build
  questions (all `canWrite`-gated, which the DM holds on their NPCs). Verified: `tsc` clean, lint clean,
  `__tests__/dnd/every-system.test.ts` (3 tests: a normalized character is crash-safe for ambiguous + every
  seeded system; every registry skin resolves a valid config with a modules array; every pickable style
  maps to a real config — available to NPCs too). Full dnd suite (217) green. *(A live "open every tab in
  each system + on an NPC" pass is the QA slice / running app.)*
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

### Status: IN PROGRESS (Slices 0–10 + 1b shipped; 11–15 pending)
