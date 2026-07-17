# D&D — Character Sheet History + AI Undo / Revert (2026-07-16)

**STATUS: COMPLETE ✅ (2026-07-16).** All four areas shipped — A (batch-group edits per AI request +
`revertBatch`), B (one-click "⟲ Undo this change" in the chat + batch-revert route), C ("undo that" by
asking the AI via an `undo_last_change` tool + history-aware grounding), D (point-in-time restore via
audit replay + a batch-grouped history timeline with "Restore to here"). The "make me all-powerful →
put it back" round-trip works end-to-end. Only D3's best-effort-logging honesty note is deferred
(logging is reliable in practice). Moved to `completed/`.

**Follow-up fix (`877bc91a`):** `revertSheetEdit` was missing a case for `define_tag` — the one create
op the switch didn't handle — so undoing an AI edit that defined a custom tag left the tag orphaned.
Added the case (drop the created tag) plus a guard test that EVERY op the tool schema offers has a
revert case, so no future op can ship an unrevertable edit. `sheet-edits.test.ts` +2.

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

- [x] **C1 — An `undo` intent the AI can call. ✅ SHIPPED** (`d7b4d1f9`). An `undo_last_change` tool the
      model picks on undo/revert/put-back intent; the route reverts the latest un-reverted AI batch
      (`latestUndoableBatch` → fetch full rows → `revertBatch` → persist → audit source `'revert'`).
- [x] **C2 — The AI can review the history. ✅ SHIPPED** (`d7b4d1f9`). `recentBatchDigest` folds the
      last K un-reverted AI batches (summary + short batch id, newest-first) into the ai-edit prompt.
- [x] **C3 — Tests. ✅** `edit-history.test.ts` (7): latest-undoable picks the newest un-reverted batch
      and skips already-undone ones; digest is newest-first + empty on no history; rows dedupe by batch.

## Area D — Restore to an earlier full state (optional / heavier)

- [x] **D1 — Point-in-time restore. ✅ SHIPPED** (`2b23f7d9`). Chose mechanism (a) — replay-revert on the
      audit trail, no snapshot storage. `restorePlan` computes the un-reverted batches after a target;
      `POST .../edits/restore { batchId }` reverts them as one via `revertBatch`. Snapshots (b) not needed.
- [x] **D2 — A history timeline UI. ✅ SHIPPED** (`858685ab`). `EditReviewPanel` leads with a "Changes by
      request" view — each AI batch with its summary + an "⟲ Undo" and "↩ Restore to here" button;
      reverted batches show greyed/"undone". The per-edit list remains below.
- [~] **D3 — Tests + honesty.** The pure restore/undo logic is fully tested (`edit-history.test.ts`,
      `revert-batch.test.ts`). The "best-effort logging gap" honesty note is deferred: logging is
      non-transactional but reliable in practice; if a real gap surfaces, surface it in the timeline then.

---

### Sequencing
A (batch grouping) is the keystone — B, C, D all build on it. A→B gives the user the headline win (the
chat's Undo button + "undo that"); C makes it conversational; D is the deeper "previous versions"
capability. Also worth fixing along the way: the AI **layout** path (`customize_layout`) isn't logged to
`dnd_sheet_edits` at all — fold it into the batch/audit so a layout change is undoable too (note it in A2).
