# D&D — Character Sheet History + AI Undo / Revert (2026-07-16)

Make character-sheet changes reversible: the AI (and the player) can undo a change and roll the sheet
back to an earlier state — including undoing a whole AI request as one unit ("I asked it to make my
character all-powerful; now put it back"). **Grounded in a survey of the live code 2026-07-16** — much of
the primitive layer already exists, so this is mostly grouping + surfacing, not greenfield.

**What already exists** (don't rebuild):
- `dnd_sheet_edits` audit table (`seeds/410`): `character_id, editor_user_id, is_dm, field_path,
  old_value jsonb, new_value jsonb, scope, created_at`. AI edits ARE logged (best-effort) by
  `app/api/dnd/characters/[id]/ai-edit/route.ts` — one row per edit, `old_value` captured via
  `editOldValue` against the pre-edit sheet, `new_value` = the whole `SheetEdit`.
- Pure primitives `editOldValue(char, edit)` + `revertSheetEdit(char, edit, oldValue)` in
  `lib/dnd/sheet-edits.ts` (exact, structuredClone, handles adds/removes/renames/currencies).
- A per-edit revert route (`.../edits/revert`, audits the revert) and a shipped edit-history UI
  (`EditReviewPanel.tsx`, "✎ Customizations & edit history", per-row "⟲ Revert").

**The gaps this plan closes:**
- No way to group "the N edits from one AI request" → can't undo a whole request atomically.
- The `ai-edit` response returns only `editCount` + `summary`, not the applied edits / a batch id → the
  chat can't show an immediate "Undo" button for what it just did.
- No full-character snapshot/version restore (only the forward/reverse audit trail).
- AI can't be *asked* to undo ("undo that", "put my character back") — no tool/intent for it.

Ship slice-by-slice; typecheck + lint + test each; commit + push; annotate here. Branch off `main`, PR.
Schema is `seeds/*.sql` applied via `scripts/apply-seeds.mjs`; apply to live per
`[[project_apply_seeds_to_supabase]]`.

---

## Area A — Group edits by AI request (the foundation)

- [x] **A1 — `batch_id` on `dnd_sheet_edits`. ✅ SHIPPED** (`635a8312`). `seeds/450` adds `batch_id uuid`
      + `source` (`ai|manual|revert`, CHECK) + `summary`, indexed on `(character_id, batch_id, created_at)`;
      applied to live Supabase.
- [x] **A2 — Stamp a batch on every AI request. ✅ SHIPPED** (`635a8312`). `ai-edit/route.ts` generates
      one `batch_id` per request and writes it on all that request's audit rows with `source: 'ai'` + the
      request summary.
- [x] **A3 — Return the batch to the client. ✅ SHIPPED** (`635a8312`). The mechanics response now includes
      `batchId`, `batchSummary`, and `editsPreview` (op + path per edit).
- [~] **A4 — Tests.** The `revertBatch` round-trip is fully tested (`revert-batch.test.ts`); the route's
      batch-stamping itself is exercised end-to-end by B (a route-level test needs Supabase/session mocks —
      deferred, low value vs. the pure-logic coverage).
- [x] **B1 — revertBatch primitive ✅ SHIPPED early** (`635a8312`): `revertBatch(char, AuditedEdit[])` folds
      `revertSheetEdit` in reverse order; 3 tests incl. the "all-powerful → back to normal" round-trip.

## Area B — Undo a whole request

- [x] **B1 — Batch-revert route. ✅ SHIPPED** (`c8f72916`). `POST .../edits/revert-batch { batchId }`
      loads the batch's rows (oldest-first), folds `revertBatch` over them, persists, audits the revert
      (source `'revert'`). Write-gated; 404 when the batch is already undone. (Pure `revertBatch` shipped
      in `635a8312`.)
- [x] **B2 — "Undo" button in the AI chat. ✅ SHIPPED** (`c8f72916`). A mechanics reply carries its
      `batchId` and renders **⟲ Undo this change**; one click reverts the batch, reloads the sheet via
      the `dnd:reload-character` event, and marks the message "change undone".
- [x] **B3 — Tests. ✅** `revert-batch.test.ts` (3): the "all-powerful → back to normal" round-trip
      restores the exact pre-batch sheet; add-then-retune unwinds in reverse; empty batch no-ops.

## Area C — Ask the AI to undo

- [ ] **C1 — An `undo` intent the AI can call.** Add an `undo_last`/`revert_batch` capability to the
      ai-edit flow (a tool the model picks, or detect "undo/revert/put it back" and route to
      revert-batch on the most recent AI batch for this character). "Undo my last change" just works.
- [ ] **C2 — The AI can review the history.** Give the ai-edit/librarian grounding a compact recent-edit
      digest (last K batches: summary + timestamp + batch id) so the AI can answer "what did you change?"
      and pick the right batch to undo. Read-only; from `dnd_sheet_edits`.
- [ ] **C3 — Tests.** an "undo that" instruction reverts the most recent AI batch; the history digest
      lists recent batches with their summaries.

## Area D — Restore to an earlier full state (optional / heavier)

- [ ] **D1 — Point-in-time restore.** "Take my character back to how it was yesterday / before level 20."
      Two candidate mechanisms — pick after A–C ship: (a) replay-revert every batch after a chosen
      point (works today on the audit trail, no new storage), or (b) periodic full snapshots
      (`dnd_character_snapshots` table) for O(1) restore. Prefer (a) first; add (b) only if replay proves
      too lossy (e.g. best-effort logging left gaps).
- [ ] **D2 — A history timeline UI.** Extend `EditReviewPanel` (or a new panel) to group rows by batch
      with a per-batch "⟲ Undo this request" and a "restore to here" affordance, so history reads as a
      story, not a flat list.
- [ ] **D3 — Tests + honesty.** where replay can't perfectly reconstruct (a gap in best-effort logging),
      say so in the UI rather than silently producing a wrong state.

---

### Sequencing
A (batch grouping) is the keystone — B, C, D all build on it. A→B gives the user the headline win (the
chat's Undo button + "undo that"); C makes it conversational; D is the deeper "previous versions"
capability. Also worth fixing along the way: the AI **layout** path (`customize_layout`) isn't logged to
`dnd_sheet_edits` at all — fold it into the batch/audit so a layout change is undoable too (note it in A2).
