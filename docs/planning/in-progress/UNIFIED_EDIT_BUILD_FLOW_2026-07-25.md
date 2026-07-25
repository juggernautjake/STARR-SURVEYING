# Unified Edit / Build Flow

**Date:** 2026-07-25
**Status:** In progress — building in slices.
**Predecessors:** `pending/CHARACTER_EDITING_CONSOLIDATION_AUDIT_2026-07-24.md` (the map of every edit surface) and `pending/CHARACTER_VARIANT_TRACKER_2026-07-25.md` (versions + lineage this builds on).
**Owner decisions (2026-07-25):** working-**draft** save model; transpose result is **always a new variant**.

---

## 1. Goal (owner's spec)

Every character version (original or variant) can be **edited**, with a coherent flow:

- **Edit directly** — change the sheet and save **to this version**, without necessarily making a variant.
- **Create a variant** — an explicit "build a variant from this version" button starts a new branch (the source version stays as-is), then drops you into editing it.
- On the **Edit** path, the flow asks:
  1. **Transpose to another system?**
     - **Yes** → **AI build it** or **build from scratch**?
       - **AI** → **vanilla** (use system-library content to match the original as closely as possible) or **AI homebrew** (invent balanced feats/stats/abilities to match the original — never too weak or too strong).
       - **From scratch** → open the target-system builder on a blank sheet.
     - **No** → open the **character editor** (same system); edit manually or with AI homebrew.
  2. On **Save** → **Save to this version** (the "original" = whatever version you branched from / are editing) or **Save as a new variant**.

"Original" is **relative**: the version you are editing/branching from — not necessarily the first build.

---

## 2. How this maps onto what exists (build ON it)

- **Transpose** already does exactly the AI vanilla/homebrew rebuild: `POST /api/dnd/characters/[id]/system` `action:'transpose'` with `allowCustom` (`false`=vanilla, `true`=homebrew) → installs a NEW slot (variant) via `installTransposedNewSlot`. So the whole "transpose → AI → vanilla/homebrew" branch is **wiring an existing capability**, and it already lands as a new variant (matches the decision).
- **From scratch** = `POST /system` `action:'add'` (blank target slot) → switch to it → open the builder.
- **Create variant (branch)** = the variant tracker's `forkSheet` (`POST /variants` `action:'fork'`), which already clones + sets lineage + makes the fork active (→ user edits it).
- **Direct in-place editing** = today's sheet editors (5e store autosave `PATCH /characters/[id]`; PF2/IG `pf2-edit`/`ig-edit`; AI chat `ai-edit`; level builders). Unchanged — always available.

**The one genuinely new primitive is the DRAFT** — a working copy so the Edit path can offer the save-time "this version vs new variant" choice without touching the source until you decide.

---

## 3. The draft model (new)

A **draft** is a working-copy sheet slot, flagged `draft: true`, forked from a source version (`parentSlotId` = the source = the relative "original"). While editing, the draft **is the active sheet**, so every existing editor/autosave operates on it unchanged. Drafts are **excluded** from the VERSIONS list (they're transient) and surface instead as a **Save banner**.

Pure helpers in `lib/dnd/system-variants.ts`:
- `beginDraft(active, variants, { fromSlotId })` → fork the source (clone) with `draft:true`, make it active. Returns the new active/variants + `draftSlotId`. Allowed even at the 20-cap (a draft is transient).
- `commitDraftToOriginal(active, variants)` → the active draft's content overwrites its source slot (keeps the source's identity/lineage/name; replaces data + presentation + art); the draft is discarded (never stored); the source becomes active. **No net version created** → this is the "edit directly and save" outcome.
- `promoteDraftToVariant(active, variants, { name? })` → clear the draft flag; the draft becomes a **permanent new variant** (parent = source; source untouched). Enforces the 20-cap on the *permanent* count (refuse if promoting would exceed 20 → the user must Save-to-original or Discard instead).
- `discardDraft(active, variants)` → drop the draft; load the source as active. Source untouched.
- `isDraft(slot)` / drafts filtered out of `listSheets` + `buildVariantCards`.

Storage: `draft?: boolean` added to `SystemVariant` / `ActiveSlotMeta` / `ActiveSheet` / `SheetSlot`, preserved through `readVariants` / `snapshotActive` / `withActiveSlotMeta` (same pattern as the VT fields).

**Cap interaction:** `beginDraft` may transiently make 21 sheets; `promoteDraftToVariant` enforces ≤20 permanent; `commitDraftToOriginal` never increases the count.

**Stale-draft safety:** only one draft at a time. `beginDraft` when a draft already exists resumes/replaces it. Switching versions while a draft is open is disabled in the UI (the Save banner replaces the switcher); a lingering draft (from a hard reload) is detected and offered "resume / discard".

---

## 4. API (extend `/variants` route)

New actions on `POST /api/dnd/characters/[id]/variants`:
- `begin-draft { fromSlotId }` → `beginDraft` + persist (draft active). Returns `{ draftSlotId }`.
- `save-to-original` → `commitDraftToOriginal` + persist; regenerate the source's summary (it changed).
- `save-as-variant { name? }` → `promoteDraftToVariant` (20-cap 409) + persist; generate the new variant's summary.
- `discard-draft` → `discardDraft` + persist.

Transpose/add stay on `/system` (already there); the EditFlow just calls them with the chosen `allowCustom`/target.

---

## 5. UI

- **`EditFlow`** (client dialog) opened by an **Edit** button on each VERSIONS card (and a prominent "Edit this character" on the sheet). Steps:
  1. Direct edit **or** transpose to another system?
  2. (transpose) pick system → AI or from-scratch → (AI) vanilla or homebrew.
  - Direct → `begin-draft` → reload into draft edit mode.
  - Transpose AI → `POST /system {action:'transpose', system, allowCustom}` → reload (new variant active).
  - From scratch → `POST /system {action:'add', system}` → switch → open `/builder`.
- **`+ Variant` / "Create variant"** on every card → `fork` (branch now), then edit the branch. (Already exists on the active card; extend to all cards.)
- **`DraftSaveBanner`** (client) shown when the active sheet is a draft: **Save to ‹source name›** / **Save as new variant** / **Discard**, calling the new `/variants` actions. Replaces the VERSIONS switcher while drafting.
- Wire into `app/dnd/characters/[id]/page.tsx`: detect `activeMeta.draft`; when drafting show the banner (+ suppress the switcher); else show `VariantBrowser` with Edit/Branch affordances.

---

## 5b. Workstream B — the sheet AI chat becomes a real assistant

The bottom-right chat (`SheetEditChat` → `/ai-edit`) currently only edits (apply-then-undo). The owner wants it to be a **real chat** that does two things:

1. **Answer questions** about the system and this character — feats, abilities, conditions, rules — with full, grounded answers (today that lives in the separate `LibraryChat`; fold its Q&A capability in so one box does both).
2. **Edit on request with confirm-before-save**: when asked for a change, the AI **proposes** it without persisting, and replies with (a) **what** the change is, (b) **where to view it** on the sheet, and (c) a **Confirm / Cancel**. Only on **Confirm** is it saved to the **current** sheet.

Design:
- **`/ai-edit` gains a two-phase mode.** Phase 1 (`preview`): the model either answers (Q&A text, no tools) **or** produces the edit tool call, which the route validates/gates but **does not persist** — returning `{ kind:'answer', text }` or `{ kind:'proposal', edits, description, location, previewId }`. Phase 2 (`confirm { previewId | edits }`): apply the previewed edits (persist + `dnd_sheet_edits` batch, exactly as today) so the change stays fully revertible after the fact too.
- **Intent routing**: the system prompt tells the model to answer questions directly and to call the edit tool only for change requests; a question never mutates. The character + system grounding (from `LibraryChat`'s path) is added so answers are real.
- **"Where to view it"**: the edit ops already name their target (ability/skill/attack/feat/spell/item/condition…); map the op kind → sheet section/tab label so the proposal can say "see the Feats tab".
- **`SheetEditChat` UI**: render answer bubbles for Q&A; for a proposal, show the description + "where to view" + **Confirm**/**Cancel**; Confirm calls phase 2, then refreshes. Keep the post-hoc Undo for confirmed edits.
- PF2/IG edits flow through the same preview→confirm (their `edit_pf2_sheet`/`edit_ig_sheet` tools), so confirm-before-save is uniform across systems.

Slices B1 preview/confirm route → B2 chat UI (answers + proposal/confirm) → B3 fold in Q&A grounding + retire/merge the separate LibraryChat box → B4 tests.

**Universal save choice (owner, 2026-07-25):** the "this version vs a new variant" decision is the SAME everywhere a change is committed. So the chat's **Confirm** offers two commits, not one:
- **Apply to this sheet** — persist the edits to the current version (in place).
- **Save as a new variant with this change** — fork the current version, apply the edits to the fork, keep the current version unchanged.

Both reuse one primitive: apply an edit list either to the active sheet or to `forkSheet(current)`'s data. This is the same choice the draft Save banner offers, so the whole system has one mental model: *any commit can go to the current version or branch a new one.* The "build a new one → how? (AI/manual, vanilla/custom) → save" wizard is the EditFlow (§5) with its result saved as a variant.

## 6. Slices (Workstream A — edit/build flow)

1. **Plan doc** (this). ✅
2. **Draft model** in `system-variants.ts` (flag + begin/commit/promote/discard + exclude from lists + cap) + unit tests.
3. **`/variants` edit actions** (begin-draft/save-to-original/save-as-variant/discard) + summary regen.
4. **`EditFlow` dialog** (transpose branching) + Edit/Branch buttons on cards.
5. **`DraftSaveBanner`** + page wiring (draft detection, switcher suppression).
6. **Tests** (draft transitions + cap; render tests) + typecheck + lint + commit/push.

Each slice: typecheck + lint, commit, push, note here. Live browser QA of the flow joins the tracker's QA pass.

---

## Slice log

- **2026-07-25 — Slice 1: plan doc created.** Reconciled the owner's spec (incl. the mid-turn clarifications: keep first-class direct in-place save; explicit "create variant from any version") into: plain editing = in-place autosave (unchanged); Edit = opt-in draft flow with transpose branch + save-time original/variant choice; Create-variant = fork. Draft is the one new primitive.
- **2026-07-25 — Slices A4/A5/A6 shipped: the flow is wired end to end.** `EditFlow` dialog (`app/dnd/_ui/EditFlow.tsx`) walks root → system → how → vanilla/homebrew with described choices, calling `begin-draft` (direct), `/system transpose {allowCustom}` (AI), or `/system add` + switch → `/builder` (from scratch). `VariantBrowser` grew **✎ Edit** and **+ Variant** on *every* card (branch from any version, not just the active one) and takes `transposeSystems`. `DraftSaveBanner` (`app/dnd/_ui/DraftSaveBanner.tsx`) replaces the switcher while a draft is active, offering Save-to-‹source› / Save-as-new-variant / Discard with each consequence spelled out. Page wiring in `app/dnd/characters/[id]/page.tsx` reads `activeMeta.draft` and swaps the panel. Dev-only visual harness at `/dnd/preview/edit-flow` (gated to non-production) renders all three with mock data for screenshotting. Tests: `__tests__/dnd/edit-flow-ui.test.tsx` (5 render guards — root decision, disabled transpose, banner copy, Edit/+Variant on every card, read-only hiding). typecheck 0, lint clean, 61/61 across the edit-flow + variant suites.
- **2026-07-25 — Slice A2: draft primitive shipped** (`lib/dnd/system-variants.ts`). Added `draft` through the metadata plumbing; `beginDraft` / `commitDraftToOriginal` (overwrite source, no new version) / `promoteDraftToVariant` (branch; cap-enforced) / `discardDraft` / `isDraftActive`; drafts excluded from the versions list (`variant-view.ts`). **Fixed a latent bug in the already-shipped tracker**: `forkSheet` didn't reserve the active sheet's own slot id, so forking a fresh character's original produced a self-colliding slot id — now reserved. Tests: `__tests__/dnd/edit-flow.test.ts` (draft transitions + cap) **plus an explicit back-compat suite proving already-built characters need NO migration** (legacy single- and multi-sheet chars list, resolve origin, and fork correctly). typecheck 0, lint clean, 72/72 across affected suites.

### Retroactivity (owner ask: existing characters get all of this)
No migration. Everything is derived or defensively read: lineage is computed (existing single-sheet chars = their own original; legacy multi-sheet chars get best-effort origin + fork-time backfill), summaries generate lazily, per-slot art seeds from the `art_url` column, and every new field is optional. The VERSIONS browser + edit flow operate on existing `system_variants` as-is. Proven by the back-compat test suite above.

### Consolidation map (owner ask: fold everything in; remove redundancy) — TARGET STATE
- **Keep / become core:** `VariantBrowser` (versions), `EditFlow` (new), `DraftSaveBanner` (new), the sheet chat as a real assistant (Workstream B), the dedicated `/builder` + `/levels` walkers (reached from EditFlow / the sheet).
- **Fold in:** `SystemSwitcher` transpose/add → EditFlow; its switch/rename/delete → `VariantBrowser`; `VariantToggle` (vanilla/custom) → EditFlow's vanilla/custom step (+ keep a quick toggle on the sheet); separate `LibraryChat` Q&A → the sheet chat.
- **Remove when superseded:** the orphaned `/level-up` route; redundant on-sheet Foundation-builder panels once EditFlow/`/builder` cover build-from-scratch (the panels stay only on `/builder`). Each removal is its own slice with typecheck/tests, only after its replacement is wired — never delete ahead of the replacement.
