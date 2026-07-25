# Unified Edit / Build Flow

**Date:** 2026-07-25
**Status:** BUILD-COMPLETE — Workstream A (slices 1–6) and Workstream B (B1–B4) all shipped. Only **live browser QA** remains (joins the variant tracker's owed QA pass), plus the optional supersede-removals listed at the bottom.
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

Slices B1 preview/confirm route → B2 chat UI (answers + proposal/confirm) → B3 fold in Q&A grounding + retire/merge the separate LibraryChat box → B4 tests. **All four shipped 2026-07-25 — see the slice log.**

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
- **2026-07-25 — Consolidation slice C3: level-up-to-match folded in, and `SystemSwitcher` RETIRED.** EditFlow's root gained **"Level up to match another version"** → pick the version to match → vanilla or balanced homebrew, hitting the existing `POST /system {action:'levelup'}`. Its response has the same shape as a transpose, so `TransposeReport` is reused verbatim (with a level-specific header and button label). The gate that decides whether the option appears is now **one exported predicate**, `isSharedEngineSystem()` in `lib/dnd/systems.ts`, replacing the route's private `SHARED_ENGINE_SYSTEMS` set: the UI hides the option and the route refuses it from the same definition, so they cannot drift into a button that only ever errors. `VariantBrowser` offers it only on the **active** card (the route levels the active sheet in place) with a higher-level sibling. **Caught while retiring the panel:** `transposeAllowsCustom` — the campaign's vanilla-only policy (Area TR2) — was wired *only* into `SystemSwitcher`, so deleting it would have silently let a vanilla-only campaign commission AI homebrew. It is now threaded page → `VariantBrowser` → `EditFlow`, disabling both homebrew choices, and stated **up front on the transpose choice** rather than two clicks later where a disabled last option reads as a dead end. With that, every `SystemSwitcher` capability has a home and it is **no longer rendered on the sheet**; the component file stays one merge cycle so QA can revert in one step. Its page-wiring guard in `mv-route.test.ts` was repointed at the replacement (and now asserts the switcher is genuinely gone, not merely hidden). Browser-verified through the whole level-up branch. typecheck 0, lint clean, **full suite 16,064 passing**.
- **2026-07-25 — Consolidation slice C2: the transpose report moves into EditFlow.** EditFlow was reloading the page the instant a transpose returned, throwing away everything the route reports — the build summary, the HP it landed on, **every element the AI invented**, and any rules violations. That is a real regression against `SystemSwitcher`, and it breaks the house rule that homebrew is *flagged, not hidden*: a flag that scrolls past in a page reload was never shown. The dialog now holds on a **result step** rendering the full report, with an explicit "Open the new version →"; dismissing it any other way (✕ / overlay) still reloads, since by then the new variant is saved AND active so the page behind is stale. The transpose wait also got a spinner and a real message ("Rebuilding ‹name› in ‹system›… your other versions are kept") — "Working…" on a 20-second AI build reads like a hang. The report is its own exported `TransposeReport` component so it renders without driving a live AI build: wired into the dev harness with a mock result, and covered by 4 render tests (names every invented element + its note, surfaces violations with severity, reports summary/HP, pluralises, and omits each panel — including any fabricated HP line — when there is nothing to report). Browser-verified. **Still blocking SystemSwitcher's retirement:** its *level-up-to-match* feature (raise the active sheet to match a higher-level version in another system) has no home yet — that is the next slice, and the panel stays until it does.
- **2026-07-25 — Consolidation slice C1: rename lands in the versions picker + owner UI polish.** `VariantBrowser` gained **inline rename** (`✎ Name` → in-card input, Enter/✓ commits, Escape cancels), the last of `SystemSwitcher`'s **switch/rename/delete** trio it was missing — so the picker is now capability-complete and retiring that panel becomes a safe follow-up rather than a capability loss. Confirmed the "orphaned `/level-up` route" item is already moot: no such page route exists (only the API route, which is live). Owner-requested polish, all browser-verified: the version **card no longer repeats the system name** under the character (it was already a tag — tags are the single home for system/kind/lineage); the **summary is now a floating tooltip** anchored above the card with a gold border + arrow instead of expanding the card and shoving the whole grid down; and **"Save as new variant" got its own teal tone** (border + wash + inner glow) in both the draft Save banner and the chat proposal, so all three commit choices read as real choices — gold = this version, teal = branch, red = discard. Also dropped the `⑂` glyph (U+2442 has no coverage in the display face and rendered as tofu) for the `+ Variant` idiom already used on the cards.
- **2026-07-25 — Browser QA of the edit flow (Workstream A).** Drove `/dnd/preview/edit-flow` in a real browser and walked the whole decision tree — versions picker (4 cards, each with ✎ Edit + ⑂ + Variant), Edit dialog root → Transpose → system list (the current system correctly absent) → AI-vs-scratch → vanilla-vs-homebrew, plus the draft Save banner. All render and navigate correctly. **One real defect found and fixed, invisible to the green suite:** `.framedPanel` draws its gold corner decorations at `-1px`, so putting `overflow-y: auto` on the frame itself always overflowed by that 1px — the dialog showed a scrollbar on every step, including short ones. The frame now stays visible-overflow with an inner scrolling wrapper. Grepped for the same frame+overflow pattern elsewhere: no other occurrences. Workstream B's chat needs a live AI key to exercise and is still owed a browser pass.
- **2026-07-25 — Workstream B shipped (B1–B4): the sheet chat is a real assistant.** `/ai-edit` gained a two-phase mode. `mode:'preview'` runs the model with `dndToolCallOrText` (new in `lib/dnd/ai.ts` — the old `dndToolCall` threw the prose away, which is why a question came back as "no edits"): no tool call → `{kind:'answer', text}`, nothing written; a tool call → `{kind:'proposal', description, where, text, proposal}`, also nothing written. `mode:'confirm'` rebuilds the tool result from the echoed proposal **with no model call** and falls into the *identical* dispatch below, so every rules gate re-runs on server-derived inputs — the round-trip through the browser can't buy what phase 1 refused. `lib/dnd/proposal.ts` + `lib/dnd/edit-location.ts` (both pure) turn any tool call into "what changes" + "where to check it" (op → real sheet tab; PF2/IG map to their own panels). **Universal save choice:** `persistChange()` in the route sends any committed change either to the live sheet or into a **fork** (`forkSheet` → write the change into the new slot, live columns untouched), used by all five mutating branches; the `dnd_sheet_edits` audit is skipped on a variant save (an Undo bound to those rows would revert a version that never had them), and undo-to-a-variant is refused outright as incoherent. `SheetEditChat` renders answers as plain bubbles and proposals with **✓ Apply to this sheet / ⑂ Save as new variant / Cancel**, collapsing to a statement of what happened; also fixed the typewriter replaying on every button press (it keyed on message identity, which changes when a proposal resolves in place). **B3 consolidation:** the librarian's grounding (`characterDigest` + `adjudicationInstruction` + `sheetMechanicsHelp`) is folded into the preview prompt, and the separate `LibraryChat` box is now shown on the sheet **only to read-only viewers** — an editor gets one box that does both, a viewer keeps their way to ask. Tests: `proposal.test.ts` (12), `edit-location.test.ts` (22), plus the dispatch guard extended so a new tool must also be describable and confirm must re-enter the same apply path. typecheck 0, lint clean, **full suite 16,052 passing**.
- **2026-07-25 — Slices A4/A5/A6 shipped: the flow is wired end to end.** `EditFlow` dialog (`app/dnd/_ui/EditFlow.tsx`) walks root → system → how → vanilla/homebrew with described choices, calling `begin-draft` (direct), `/system transpose {allowCustom}` (AI), or `/system add` + switch → `/builder` (from scratch). `VariantBrowser` grew **✎ Edit** and **+ Variant** on *every* card (branch from any version, not just the active one) and takes `transposeSystems`. `DraftSaveBanner` (`app/dnd/_ui/DraftSaveBanner.tsx`) replaces the switcher while a draft is active, offering Save-to-‹source› / Save-as-new-variant / Discard with each consequence spelled out. Page wiring in `app/dnd/characters/[id]/page.tsx` reads `activeMeta.draft` and swaps the panel. Dev-only visual harness at `/dnd/preview/edit-flow` (gated to non-production) renders all three with mock data for screenshotting. Tests: `__tests__/dnd/edit-flow-ui.test.tsx` (5 render guards — root decision, disabled transpose, banner copy, Edit/+Variant on every card, read-only hiding). typecheck 0, lint clean, 61/61 across the edit-flow + variant suites.
- **2026-07-25 — Slice A2: draft primitive shipped** (`lib/dnd/system-variants.ts`). Added `draft` through the metadata plumbing; `beginDraft` / `commitDraftToOriginal` (overwrite source, no new version) / `promoteDraftToVariant` (branch; cap-enforced) / `discardDraft` / `isDraftActive`; drafts excluded from the versions list (`variant-view.ts`). **Fixed a latent bug in the already-shipped tracker**: `forkSheet` didn't reserve the active sheet's own slot id, so forking a fresh character's original produced a self-colliding slot id — now reserved. Tests: `__tests__/dnd/edit-flow.test.ts` (draft transitions + cap) **plus an explicit back-compat suite proving already-built characters need NO migration** (legacy single- and multi-sheet chars list, resolve origin, and fork correctly). typecheck 0, lint clean, 72/72 across affected suites.

### Retroactivity (owner ask: existing characters get all of this)
No migration. Everything is derived or defensively read: lineage is computed (existing single-sheet chars = their own original; legacy multi-sheet chars get best-effort origin + fork-time backfill), summaries generate lazily, per-slot art seeds from the `art_url` column, and every new field is optional. The VERSIONS browser + edit flow operate on existing `system_variants` as-is. Proven by the back-compat test suite above.

### Consolidation map (owner ask: fold everything in; remove redundancy) — TARGET STATE
- **Keep / become core:** `VariantBrowser` (versions), `EditFlow` (new), `DraftSaveBanner` (new), the sheet chat as a real assistant (Workstream B), the dedicated `/builder` + `/levels` walkers (reached from EditFlow / the sheet).
- **Fold in:** `SystemSwitcher` transpose/add → EditFlow; its switch/rename/delete → `VariantBrowser`; `VariantToggle` (vanilla/custom) → EditFlow's vanilla/custom step (+ keep a quick toggle on the sheet); separate `LibraryChat` Q&A → the sheet chat.
- **Remove when superseded:** the orphaned `/level-up` route; redundant on-sheet Foundation-builder panels once EditFlow/`/builder` cover build-from-scratch (the panels stay only on `/builder`). Each removal is its own slice with typecheck/tests, only after its replacement is wired — never delete ahead of the replacement.
