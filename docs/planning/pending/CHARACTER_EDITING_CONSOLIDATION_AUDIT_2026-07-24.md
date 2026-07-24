# Character Editing / Building / Variant — Consolidation Audit

**Date:** 2026-07-24
**Status:** Audit complete and shipped. Consolidation design **not yet decided** (owner chose "full audit first, decide later"). **Parked in `pending/`** awaiting the owner's direction choice — move back to `in-progress/` when consolidation work starts.
**Scope:** Every interface — UI or AI, any system — that can create, build, edit, level, or vary a D&D character on the `/dnd` platform.

---

## 0. Why this exists

Trigger question: on a character sheet, the "Build from the Intuitive Games library" section — is it meant to generate a *new* character or edit the *current* one? Answer: it edits the **currently-viewed** character (it POSTs to that character's id), but it does so by **rebuilding the whole sheet from the panel's form fields** — not by patching. On an existing sheet that reads as destructive and confusing.

The desired end-state (owner's words): *a user should be able to edit their character with the building mechanics we've built — including editing it to a higher level, and while doing so choosing whatever feats/spells/features become available at those higher levels in the natural rules progression for that character's system.* That capability **already exists** (the per-system level walkers), but it lives on a separate page, disconnected from the on-sheet "Build from library" panel.

This document catalogues **all** the editing surfaces so a consolidation can be designed deliberately. It does not prescribe the consolidation — that decision is deferred.

---

## 1. Mental model: two "build" concepts + supporting axes

The single most important distinction for consolidation:

| Concept | Behaviour | Where |
|---|---|---|
| **Foundation builders** ("Build from the *X* library") | **REPLACE** the whole sheet from the panel's current form fields | Inline on the sheet + inside `/builder` |
| **Level walkers** ("Manage Levels") | **Edit incrementally** — advance level, force the rule-legal choices that unlock | `/dnd/characters/[id]/levels` |

Plus three orthogonal supporting axes that any unified editor must respect:

- **Provenance** — every element is `vanilla | custom | dm-granted` (`lib/dnd/provenance.ts`).
- **Variant kind** — the active sheet is flagged `vanilla` (blocks off-rules picks) or `custom` (allows + flags them) (`/variant`).
- **System slots** — one character can hold multiple sheets, even multiple per system, each with its own name/level/variant-kind (`lib/dnd/system-variants.ts`, `/system`).

**Structural divergence to keep front-of-mind:** 5e (2014/2024/ambiguous) stores the sheet in the shared `Character.data` and its build **merges**. PF2 and IG store their real sheet in **sidecars** `data.pf2e` / `data.ig` and their builds **replace**. Any unified UI straddles this split.

---

## 2. Shared foundation (what everything is built on)

- **Table:** `dnd_characters` — `data` (jsonb, the live active sheet) + sidecars `data.ig` / `data.pf2e`; columns `system`, `sheet_type`, `custom_layout`, `custom_css`, `system_variants` (jsonb map of the *other* systems' sheets + reserved `__activeSlot` meta), `dm_granted`, `submission_status`, `art_url`, `token_url`.
- **Auth chokepoint:** `requireCharacterWrite` / `getCharacterAccess(...).canWrite` in `lib/dnd/characters.ts` = **owner ∪ assigned player (`played_by_user_id`) ∪ campaign DM**. Stricter gates: owner-only (delete, promote), DM-only (grant, review, npc, override, approval).
- **AI wrapper:** `lib/dnd/ai.ts` (`dndToolCall` / `dndComplete` / `dndAiConfigured`); AI permission boundary is code-enforced in `lib/dnd/ai-scope.ts` (`assertCharacterScopedOps` — AI may only touch the target character's own `data`/layout/css/sheet_type, its chat, and character creation).
- **Audit / undo:** `dnd_sheet_edits` (per-field rows w/ `batch_id`, `source`, `old_value`, `new_value`); pure layer `lib/dnd/edit-history.ts` + `lib/dnd/sheet-edits.ts`.
- **Level engines (NOT unified — three parallel pure planners sharing one shape `{from, to, outstanding[], ready}`):**
  - 5e: `lib/dnd/classes/levelup.ts` (+ `classes/engine.ts`, per-class data)
  - PF2: `lib/dnd/systems/pathfinder2e/levelup.ts` (+ `data/classes.ts`)
  - IG: `lib/dnd/systems/intuitive-games/levelup.ts` (`IG_LEVEL_SCHEDULE`, levels 2–10)
  - Eligibility core: `lib/dnd/feats/eligibility.ts` (`featEligibilityForSystem`; 5e-family only — PF2/IG own their `rules-gate.ts`).

---

## 3. The catalogue — by function

### A. Create a new character

| # | Interface | File | Route / endpoint | Notes |
|---|---|---|---|---|
| A1 | **New Character form** | `app/dnd/_ui/NewCharacterForm.tsx` (page `app/dnd/characters/new/page.tsx`) | `POST /api/dnd/characters/import` | Pick system + build mode (`stepbystep`/`questioning`/`ruthless`) + uploads. Seeds `blankCharacter`. `stepbystep` → `/builder`; AI modes → `/ingest`. |
| A2 | **DM shell create** | `app/api/dnd/characters/route.ts` (POST) | `POST /api/dnd/characters` | DM-only; blank character in a campaign. Seeds blank/streamer/donata/jack by `sheet_type`. |
| A3 | **AI Quick NPC** | `app/api/dnd/campaigns/[id]/npc/route.ts` | `POST /api/dnd/campaigns/[id]/npc` | DM-only; new NPC from a one-line brief (`edit_sheet` onto blank). |
| A4 | **NPC from stream chatter** | `app/dnd/_sheet/components/stream/NpcFromChatterModal.tsx` | `POST /api/dnd/characters/[id]/stream/npc` | Turns a chat alias into a full NPC sheet. |

### B. Foundation builders — ⚠️ REPLACE the whole sheet ("Build from the *X* library")

Each renders **both** inline on the sheet (`layout="panel"`, collapsed, owner/DM only) **and** inside the `/builder` wizard (`layout="steps"`). Each has a manual + an AI sibling.

| # | System | Component | Manual endpoint | AI endpoint | Replace/merge |
|---|---|---|---|---|---|
| B1 | 5e | `app/dnd/_ui/Dnd5eManualBuilder.tsx` | `POST .../dnd5e-build` | `.../ai-edit` (inline "Ask AI" box) | **Merges** onto existing `data` |
| B2 | PF2 | `app/dnd/_ui/PF2CharacterBuilder.tsx` | `POST .../pf2-build` | `POST .../pf2-build/ai` | **Full replace** |
| B3 | IG | `app/dnd/_ui/IGCharacterBuilder.tsx` | `POST .../ig-build` | `POST .../ig-build/ai` | **Full replace** |

> Inconsistency: 5e merges; PF2/IG replace. Same-looking panel, different destructiveness by system.

### C. Level-up walkers — ✅ incremental, rule-legal picks (the capability the owner wants)

All on `app/dnd/characters/[id]/levels/page.tsx`, reached from the sheet via **"Manage Levels"** (`_sheet/components/StatRail.tsx:49`, `_sheet/codex/IdentityColumn.tsx:105` — a link, not a stepper, so choices can't be skipped). Invariant: *level won't advance until every unlocked choice ≤ target is made.*

| # | System | Component | Endpoint | Choices unlocked per level |
|---|---|---|---|---|
| C1 | 5e | `app/dnd/_ui/LevelBuilder.tsx` | `GET/POST .../levels`, `.../levels/homebrew` | subclass, ASI-or-feat (real 2024 feat list + saved homebrew), fighting style, expertise, cantrip, epic boon |
| C2 | 5e multiclass | `app/dnd/_ui/MulticlassManager.tsx` | `POST .../classes` | Class split (`data.meta.classes`); combined caster slots |
| C3 | PF2 | `app/dnd/_ui/PF2LevelBuilder.tsx` | `GET/POST .../pf2-levels` | feats by track (ancestry/class/skill/general/archetype), subclass, attribute boosts |
| C4 | IG | `app/dnd/_ui/IGLevelBuilder.tsx` | `GET/POST .../ig-levels` | traits, feats (+ Multiclass Dedication house-rule), skills, subclass powers, specializations, capstone |
| C5 | Cross-system AI "level up to match" | `app/dnd/_ui/SystemSwitcher.tsx` (`runLevelUp`) | `POST .../system` `action:'levelup'` | Raises active shared-5e sheet to match a higher-level sibling slot (vanilla/custom) |

> **Gaps flagged (verified against live code 2026-07-24):**
> - PF2 (C3) **does** project committed feats into `data.pf2e` via `pf2ProjectLevelUpFeats` (`pf2-levels/route.ts:127`; marked DONE 2026-07-23 in `completed/GUIDED_CHARACTER_BUILDER_2026-07-23.md:252`). The remaining pending piece is narrower: **attribute-boost projection** waits on partial-boost state (`pf2-levels/route.ts:121` comment). Earlier "feat mechanics not projected" framing was stale.
> - `app/api/dnd/characters/[id]/level-up/route.ts` (AI one-level bump) has **no UI `fetch()` caller** (verified: no reference under `app/dnd/**`). But it is **not dead logic** — its libs `level-up-ai` / `level-up-draft` are live via `ai-edit`, and it has a wiring test (`__tests__/dnd/level-up-route.test.ts`). So it's a **redundant HTTP endpoint**, superseded by C1–C5 and the `ai-edit` `level_up_character` tool — a consolidation candidate to remove, not dead code to delete blindly.

### D. Inline field editing (on the sheet)

| # | Systems | File | Endpoint |
|---|---|---|---|
| D1 | 5e + ambiguous | live store `app/dnd/_sheet/state/store.tsx` (+ `ConditionTracker`, `Balance`, `Resources`, `Inventory`, `Attacks`, `SpellsPanel`, `Features`, `components/ui/*` editors) | **autosave** `PATCH /api/dnd/characters/[id]` (whole-`data` overwrite) |
| D2 | PF2 | `app/dnd/_ui/pf2/usePf2Panels.tsx` | `POST .../pf2-edit` (damage/heal/temp-HP/dying/wounded, +reload) |
| D3 | IG | `app/dnd/_ui/ig/useIgPanels.tsx` | `POST .../ig-edit` (stance/condition/power, +reload) |

### E. AI editing (natural language)

| # | Interface | File | Endpoint | Reversible? |
|---|---|---|---|---|
| E1 | **Sheet AI chat** ("Edit with AI", floating) | `app/dnd/_ui/SheetEditChat.tsx` | `POST .../ai-edit` | **Batch-revertible** (per-msg Undo) |
| E2 | DM-panel "Ask AI to edit" | `app/dnd/_sheet/components/AiSheetEdit.tsx` | `POST .../ai-edit` | Batch-revertible |
| E3 | 5e builder inline "Ask AI" box | `Dnd5eManualBuilder.tsx` | `POST .../ai-edit` | Batch-revertible |
| E4 | AI import from uploads | `app/api/dnd/characters/[id]/ingest/route.ts` | `POST .../ingest` | Not audited |
| E5 | Library "Give to character" | `app/api/dnd/characters/[id]/grant-content/route.ts` | `POST .../grant-content` | **Batch-revertible** (`source:'library-grant'`) |

`ai-edit` dispatches by system to tools: `edit_sheet` (5e), `edit_ig_sheet`, `edit_pf2_sheet`, `level_up_character`, `customize_layout`, `undo_last_change`. Full op vocabularies in §5.

### F. Variants & multi-system

| # | Interface | File | Endpoint | What it does |
|---|---|---|---|---|
| F1 | **VariantToggle** (vanilla ⇄ custom) | `app/dnd/_sheet/components/VariantToggle.tsx` | `POST .../variant` | Flips active slot's `kind`; non-destructive; never touches `data` |
| F2 | **SystemSwitcher** | `app/dnd/_ui/SystemSwitcher.tsx` | `POST .../system` | Switch / add-blank / rename / delete slots; **AI transpose** to another system (new slot); level-up-to-match (C5). Multi-slot per system supported. |
| F3 | **DM grants** | `app/api/dnd/characters/[id]/grant/route.ts` | `POST`/`DELETE .../grant` | DM-only custom feat/ability/item/spell into `dm_granted` column (always allowed, flagged) |

### G. Homebrew designers (author custom class/feat/subclass)

| # | Interface | Page | Endpoints |
|---|---|---|---|
| G1 | Homebrew Class | `app/dnd/characters/[id]/build/class/page.tsx` | `.../homebrew-class` (draft) + `.../homebrew-class/save` |
| G2 | Homebrew Feat | `app/dnd/characters/[id]/build/feat/page.tsx` | `.../homebrew-feat` + `/save` |
| G3 | Homebrew Subclass | `app/dnd/characters/[id]/build/subclass/page.tsx` | `.../homebrew-subclass` + `/save` |

AI draft → engine validates → save into `data.homebrew*`; then resolves inside the level walkers (C1). 5e-family engine.

### H. History / undo / review

| # | Interface | File | Endpoint |
|---|---|---|---|
| H1 | **EditReviewPanel** (audit timeline, undo/restore) | `app/dnd/_sheet/components/EditReviewPanel.tsx` | `.../edits/revert`, `.../edits/revert-batch`, `.../edits/restore` |
| H2 | Edit log write/read | `_sheet/lib/log-edit.ts` | `GET/POST .../edits` |
| H3 | AI conversational undo | inside `.../ai-edit` (`undo_last_change` tool) | reverts latest un-reverted AI batch |

> Reversibility is **inconsistent**: ai-edit (E1–E3) and library grants (E5) are batch-revertible; the Foundation builds (B*), level-ups (C*), transpose, ingest, and AI builds are **not audited** and cannot be undone through the panel.

### I. Submission / DM review / campaign copies

| # | Interface | Endpoint | Notes |
|---|---|---|---|
| I1 | Submit for review | `POST .../submit` | Recomputes provenance, sets `submission_status='submitted'` |
| I2 | DM review approve/reject | `POST .../review` | DM-only |
| I3 | Answer builder questions | `POST .../answer` | Clears `build_questions` |
| I4 | Campaign DM override | `POST/DELETE campaigns/[id]/characters/[cid]/override` | Isolated `data_override`; original untouched |
| I5 | Promote override → original | `POST .../promote` | Owner-only; **whole-sheet replace** of original |
| I6 | Campaign approval gate | `POST .../approval` | DM-only; join-row status |

### J. Cosmetic (not mechanics, but part of the "sheet variant" surface)

`SheetChrome.tsx`, `TemplateBrowser.tsx` (`/layout`), theme/`SkinSwitch` (`/theme`), `RollerTemplateBar` (`/roller`), `CharacterSettingsModal.tsx` (`/preferences`), `SheetStyleBrowser.tsx`. Also custom sections: `SectionsManager.tsx` / `CustomSectionView.tsx` → `/sections` (PF2/IG), or via the 5e store autosave.

---

## 4. Full endpoint index (every character-mutating route)

Grouped; `RW` = `requireCharacterWrite`, `DM` = campaign DM only, `OWN` = owner only.

**Core CRUD:** `POST /characters` (DM, create) · `PATCH /characters/[id]` (RW, whole-`data` autosave) · `DELETE /characters/[id]` (OWN) · `POST /characters/import` (create).
**5e:** `/dnd5e-build` (merge) · `/ai-edit` (central AI) · `/level-up` (**redundant endpoint — no UI caller; logic live via `ai-edit`**) · `/levels` (walker) · `/classes` (multiclass).
**PF2:** `/pf2-build` (replace) · `/pf2-build/ai` (replace) · `/pf2-edit` (in-play) · `/pf2-levels` (walker).
**IG:** `/ig-build` (replace) · `/ig-build/ai` (replace) · `/ig-edit` (in-play) · `/ig-levels` (walker).
**Variants:** `/system` (switch/add/rename/delete/transpose/levelup) · `/variant` (vanilla⇄custom).
**Grants:** `/grant` (DM, `dm_granted`) · `/grant-content` (RW, library).
**Presentation (single-field in `data`):** `/sections` · `/roller` · `/theme` · `/layout` · `/preferences`.
**History:** `/edits` · `/edits/revert` · `/edits/revert-batch` · `/edits/restore`.
**Import/review:** `/ingest` · `/answer` · `/submit` · `/review` (DM).
**Homebrew save:** `/homebrew-class/save` · `/homebrew-feat/save` · `/homebrew-subclass/save`.
**Media/currency:** `/media` · `/stream/convert`.
**Campaign-side:** `campaigns/[id]/npc` (DM) · `campaigns/[id]/characters` (+/–) · `join-character` · `.../override` (DM) · `.../promote` (OWN) · `.../approval` (DM).

---

## 5. AI tool vocabularies (every AI op that mutates a character)

- **`edit_sheet`** (`SHEET_EDIT_TOOL`, `lib/dnd/sheet-edits.ts`; 5e/generic — used by ai-edit, ingest, transpose, NPC gen, grant-content): `set_name`, `set_meta`, `set_level`, `set_ability`, `set_save_proficient`, `set_skill`, `set_combat`, `add/update/remove/rename_attack`, `add_feature`, `add_feat`, `remove/rename_feature`, `add/remove/rename_spell`, `add/update/equip/remove/rename_item`, `add/rename_resource`, `define_tag`, `tag_item`, `add/set/remove_currency`, `add/remove_condition`.
- **`edit_ig_sheet`** (`IG_EDIT_TOOL`, `intuitive-games/ai.ts`): `set_active_stance`, `clear_stance`, `add_stance`, `add/remove_condition`, `add/remove_feat`, `add/remove_power`, `set_defensive_power`, `apply_damage`, `heal`, `set_ability`, `update_power`, `update_feat`, `add/update/remove_attack`. Rules-gated (`gateIgEdit`).
- **`edit_pf2_sheet`** (`PF2_EDIT_TOOL`, `pathfinder2e/ai.ts`): `apply_damage`, `heal`, `set_temp_hp`, `set_dying`, `set_wounded`, `set_hero_points`, `set_focus_points`, `set_condition`, `set_attribute`, `add/remove/update_feat`, `add/remove/update_spell`, `add/update/remove_attack`, `set_armor`. Rules-gated (`gatePf2Edit`).
- **`level_up_character`** (`LEVEL_UP_TOOL`, `classes/level-up-ai.ts`): `mode`, `hpGained`, `abilityIncreases`, `subclass`, `features[]`, `notes` → `applyLevelUpDraft`.
- **`intuitive_games_build`** (`IG_PICKS_TOOL`) / **`pathfinder2e_build`** (`PF2_PICKS_TOOL`): full-sheet build picks.
- **`customize_layout`** (`LAYOUT_EDIT_TOOL`): `custom_layout`/`custom_css`.
- **`undo_last_change`** (`UNDO_TOOL`): revert latest un-reverted AI batch.
- **`CUSTOM_CLASS_TOOL` / `CUSTOM_SUBCLASS_TOOL` / `CUSTOM_FEAT_TOOL`** (`classes/custom-ai.ts`): homebrew drafts.

---

## 6. Consolidation tensions (the decision points — not yet decided)

These are the frictions a consolidation would resolve. Listed neutrally for the owner to weigh.

1. **REPLACE-on-existing (the original complaint).** The on-sheet Foundation builders (B*) rebuild the whole sheet from the panel's fields. On a populated sheet this clobbers hand edits. Options range from "make them merge/confirm" to "make the on-sheet panel *become* an edit surface, with fresh-rebuild only from a blank/`under_construction` character."

2. **Two disconnected homes for "building."** Foundation panel (on the sheet) vs level walkers (`/levels`). "Level me up and pick what unlocks" is the natural continuation of "build me," but they're separate UIs with separate mental models. A single entry point ("Edit / Level this character") could route to the incremental walker for existing characters and the full builder only for blank ones.

3. **Per-system structural divergence.** 5e in shared `data` (build merges); PF2/IG in sidecars (build replaces). Any unified editor must branch on this or the sidecar systems need a merge path equivalent to 5e's.

4. **Inconsistent reversibility.** Inline + AI edits are batch-auditable/undoable; builds, level-ups, transpose, ingest are not. A consolidation could route *all* mutations through the `dnd_sheet_edits` batch layer so everything is undoable in `EditReviewPanel`.

5. **Redundant AI build vs manual build vs level walker** per system — three ways to reach a similar end. Decide which is canonical and whether the others become thin entry points onto it.

6. **Cleanup surfaced (verified 2026-07-24):**
   - `/level-up` route — redundant HTTP endpoint (no UI caller), but its logic is live via `ai-edit`; remove the route as part of consolidation, keep the libs.
   - PF2 level-up (C3) — feat projection is DONE; only **attribute-boost projection** remains (waits on partial-boost state).

7. **Three related-but-distinct "variant" axes** (provenance, variant-kind toggle, system slots) surfaced through three different controls (nothing / VariantToggle / SystemSwitcher). Whether/how to unify their presentation is its own sub-decision.

---

## 7. Open decision (owner)

Full audit delivered; consolidation design deferred to the owner. Candidate directions surfaced so far:

- **(a) Unify build + level into one non-destructive editor** — the on-sheet panel becomes an edit/level surface that continues into the walkers; fresh rebuild reserved for blank characters.
- **(b) Narrow fix** — just stop Foundation builders from clobbering existing sheets (merge/confirm); leave the rest.
- **(c) Something else** — TBD.

When a direction is chosen, this doc moves from audit → build plan (slices), staying in `in-progress/`.

---

## Slice log

- **2026-07-24 — Audit compiled + load-bearing claims verified.** Four-way parallel sweep catalogued every create/build/edit/level/variant interface (UI + AI, all 3 systems). Verified the two consequential findings against live code: the `/level-up` route is a redundant endpoint (no UI caller) but not dead logic; PF2 feat projection is already DONE (only attribute-boost projection pending) — corrected the earlier stale framing. **Blocked-not-deferred:** every §6/§7 action item is gated on the owner's consolidation-direction decision (owner explicitly chose "full audit first, decide later"), so nothing is deferred or shipped as behaviour yet. Not eligible for `completed/` while its action items are pending a decision.
- **2026-07-24 — Parked in `pending/`.** With the audit shipped and all remaining items decision-gated (blocked, not cost-exceeds-value), the doc is moved `in-progress/` → `pending/` per the README rubric ("planned work we intend to build later — scoped and parked deliberately"). This is not a completion and not a deferral of the work — it reflects that the next action is the owner's direction choice. Move back to `in-progress/` when a direction is picked.
