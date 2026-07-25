# Character Variant Tracker

**Date:** 2026-07-25
**Status:** In progress — building in slices.
**Predecessor context:** `pending/CHARACTER_EDITING_CONSOLIDATION_AUDIT_2026-07-24.md`. This tracker ships FIRST; the build/edit consolidation follows and will fold the variant flows into a unified editor. Build the create-variant flow to route into the existing builder/editor so the later consolidation inherits it cleanly.

---

## 1. Goal (owner's spec)

Every character sheet can hold **up to 20 variants** ("versions"). A dedicated **dropdown section** on the sheet — styled like the existing STYLE · TEMPLATE · THEME chrome (`SheetChrome.tsx`) and looking like the account-lobby character list — shows every variant so the user can click into one and switch the viewed sheet.

Each variant listing shows:
- the variant's **image**, **name**, **system**, and **level** (per-class breakdown when multiclass — each class + its level count);
- **tags** describing it (see §4);
- an **AI-generated summary** revealed by a summary button / stylized tooltip.

Variants can differ from the original in system, name, level, class, race/species — anything. Each variant is **tied to the original but distinct**. The **first** sheet is the **original**. The currently-viewed sheet is **highlighted**; clicking another switches and reloads.

**Git-like lineage:** the user can create a variant of *any* sheet they're viewing (including a variant → variants of variants), while the original stays fixed. We track **what variant branched from what** (parent lineage), like branching a repo.

**Create-variant flow:** on the highlighted (viewed) listing, a button forks that sheet into a new variant and drops the user into the character builder/editor to change levels, gear, feats, spells, stats, etc. On **save**, a fresh AI summary is generated and stored for that variant.

**Cap:** at 20 total versions, creating another is blocked with a message that the limit is reached and a variant must be deleted first.

---

## 2. What already exists (build ON this — do not fork it)

The "variant" concept is the **system-slot** system, already mature and pure:

- **`lib/dnd/system-variants.ts`** — a character holds ONE active sheet (live columns `data`/`system`/`sheet_type`/`custom_layout`/`custom_css`) plus a `system_variants` jsonb map of stored sheets. Reserved key `__activeSlot` holds the active sheet's slot metadata (slotId/kind/name). Slots have stable ids (`newSlotId`: bare system, then `#2`…). `switchToSlot`/`snapshotActive` = snapshot-then-swap; `addSheetSlot`/`deleteVariant`/`renameVariant`/`listSheets`. **Slot ids survive switches** — the identity we hang lineage on.
- **`app/api/dnd/characters/[id]/system/route.ts`** — switch / add / rename / delete / transpose / levelup. Reused for **switch** (proven path).
- **`app/dnd/_ui/SystemSwitcher.tsx`** — the current (utilitarian) slot UI. The new `VariantBrowser` is the richer, lobby-styled surface; SystemSwitcher can later be retired into it.
- **`lib/dnd/provenance.ts`** — `summarizeCharacterProvenance` → vanilla/custom/dm-granted, for the Vanilla/Custom tags.
- **`app/dnd/_ui/SheetChrome.tsx`** — the STYLE·TEMPLATE·THEME dropdown-chip idiom the browser mirrors.

**Structural split to respect:** 5e/ambiguous store the sheet in shared `data`; PF2/IG store the real sheet in `data.pf2e` / `data.ig` sidecars. Level/class reads branch by system (§ breakdown helper).

---

## 3. Data model (extend slot metadata — no schema migration)

All new fields live in the existing `system_variants` jsonb (per-slot) + `__activeSlot` meta + one new reserved key `__origin`. Back-compatible: every field optional; legacy sheets read as origin/vanilla/no-summary.

Add to `SystemVariant` and `ActiveSlotMeta`:
- `parentSlotId?: string` — the slot this was forked from (lineage). Absent on the original.
- `summary?: string` — AI-generated summary text.
- `summaryUpdatedAt?: string` — ISO timestamp.
- `summaryHash?: string` — hash of the sheet digest the summary was generated from → staleness detection.
- `artUrl?: string | null` — the variant's own image.
- `campaignId?: string | null` — the campaign this variant belongs to (variants can live in different campaigns; the character-level `campaign_id` seeds the original's).

New reserved key **`__origin`**: `{ slotId }` — the original sheet's stable slot id. Set on first lineage init to the active sheet's slot id (correct for every new character built going forward; best-effort for legacy multi-variant characters, which the user can re-designate). `readVariants` skips all `__`-prefixed keys.

New pure helpers in `system-variants.ts`:
- `ensureLineage(active, variants, raw)` → guarantees the active sheet has a real slotId and `__origin` is set; returns the normalized pieces.
- `forkSheet(active, variants, raw, { fromSlotId })` → clones the source sheet's data into a NEW slot with `parentSlotId` = source slot id, inheriting system/kind/art; returns `{ variants, newSlotId }`. Caller then `switchToSlot` to make it active.
- `MAX_VARIANTS = 20`, `sheetCount(active, variants)`, `isAtVariantCap(...)`.
- `originSlotId(raw, fallback)`, `isOriginSlot(slotId, raw)`.
- Thread `artUrl` through `snapshotActive`/`switchToSlot`/`ActiveSheet` so each slot keeps its own image and switching syncs the `art_url` column.

---

## 4. Tag taxonomy (the complete set)

Pure `variantTags(slot, ctx)` → `{ label, tone }[]`, ordered by priority. Tones map to colours in the browser. The complete set the owner asked me to enumerate:

| Tag | When | Tone |
|---|---|---|
| **Original** | slot is the lineage root (`__origin`) | gold |
| **Variant** | slot is a fork (has `parentSlotId`, or not origin) | teal |
| **Viewing** | slot is the active/open sheet (also gets the highlight border) | bright/active |
| **‹System›** (e.g. "D&D 5e (2024)", "Pathfinder 2e", "Intuitive Games") | always | neutral |
| **Vanilla** | no custom content for its system (provenance) | green |
| **Custom** | has homebrew/custom content | orange |
| **DM-granted** | carries DM-granted content | violet |
| **Multiclass** | more than one class | blue |
| **Campaign: ‹name›** | the variant is in a campaign | blue |
| **Personal** | not in any campaign | muted (low priority; may suppress to reduce noise) |
| **NPC** | character is an NPC | purple |
| **Draft** | under construction / not yet built | amber/warning |
| **Submitted / Approved / Rejected** | in a campaign with that submission status | blue / green / red |
| **Different system** | variant's system ≠ the original's system | indigo |

Highlight (border/glow) on the **Viewing** card is separate from the "Viewing" tag and is the primary active indicator.

---

## 5. Per-system class/level breakdown

Pure `sheetClassBreakdown(data, system)` → `{ level, classes: { name, levels, subclass? }[] }`:
- **5e / ambiguous:** `data.meta.classes` (ClassLevel[]) when present (multiclass → each class + its `levels`), else `[{ name: meta.className, levels: meta.level }]`; `level = meta.level`.
- **PF2:** read `data.pf2e` — level + class (+ subclass); archetype dedications noted (single class row for v1).
- **IG:** read `data.ig` — level + class/subclass.

(Exact sidecar field paths confirmed against `systems/*/model.ts` during Slice 3.)

---

## 6. AI summary

`lib/dnd/variant-summary.ts` (pure): a compact digest of a sheet (name, system, level, class breakdown, race/species, ability scores, key feats/features, spells, notes) + a prompt:
- **Variant vs original:** compare the two digests; describe the *vibe* of the variant and how it differs — e.g. "same as the original, just in campaign X"; "in campaign X and a couple levels higher, gaining feat Y and +2 STR"; or, for a different-system/name/concept fork, describe what the variant *is* and how it diverges.
- **Original:** a standalone description of who the character is (scores, feats, class/levels, spells, race, notes).

Route `POST /api/dnd/characters/[id]/variants/summary { slotId }` → builds digests, calls the AI (`dndToolCall`/`dndComplete`), persists `summary`+`summaryUpdatedAt`+`summaryHash` into that slot's metadata (or `__activeSlot`). Idempotent.

**Freshness ("saved after changes"):** store `summaryHash` = hash of the current digest. When the browser renders, any slot whose live digest hash ≠ stored hash shows a *stale* affordance. Regeneration fires: (a) automatically on **fork create** (server), (b) on demand via the card's **refresh** button, (c) client-triggered after a builder/level/AI-edit save. This honours "generated and saved on save" without hammering the AI on every keystroke of the 5e autosave.

---

## 7. API surface

- **New** `app/api/dnd/characters/[id]/variants/route.ts`:
  - `POST { action: 'fork', fromSlotId }` → §3 forkSheet + switchToSlot + cap check (blocks at 20 with the delete-one message) + kick off summary. Returns `{ ok, slotId }`.
  - `POST { action: 'summary', slotId }` → §6 regenerate+persist.
  - `POST { action: 'set-campaign', slotId, campaignId }` → assign a variant to a campaign (optional; for the Campaign tag).
- **Reused** `/system` route: switch (`{ slotId }`), rename, delete — the VariantBrowser calls these.

---

## 8. UI — VariantBrowser

`app/dnd/_ui/VariantBrowser.tsx` (client), mounted in `page.tsx` next to `SheetChrome` (owner/DM only). A collapsible `<details>` "VARIANTS //" in the framedPanel idiom. Body = a responsive grid of variant cards mirroring the lobby card:
- image (artUrl → placeholder), name, system label, per-class level row, tag chips, summary button/tooltip (popover with the saved summary + updated-at + stale/refresh), **Viewing** highlight border on the active card.
- Click a card → `POST /system { slotId }` → `window.location.reload()`.
- The active card shows **+ Create variant** → `POST /variants { action:'fork', fromSlotId }` → reload (fork is now active → user edits it via the on-sheet builder/level tools). At cap → inline "limit reached, delete a variant first".
- Rename / delete via the existing `/system` actions.

Server (`page.tsx`) computes the extended slot list (tags, breakdown, summary, art, lineage, active) with the pure helpers + a campaign-name lookup, and passes it in — no client data-fetching for first paint.

---

## 9. Slices

1. **Plan doc** (this file). ✅
2. **Slot metadata + lineage + cap + fork/art helpers** (`system-variants.ts`) + unit tests.
3. **Tags + breakdown pure helpers** + unit tests.
4. **Summary lib + summary route.**
5. **Fork route (+ 20-cap) + set-campaign.**
6. **VariantBrowser UI.**
7. **Wire into `page.tsx` + campaign-name map.**
8. **Tests green + typecheck + lint + commit/push; annotate slice log.**

Each slice: typecheck + lint, commit, push, note completion here.

---

## Slice log

- **2026-07-25 — Slice 1: plan doc created.**
- **2026-07-25 — Slices 2–8: full vertical shipped.** Built on the existing slot system end-to-end:
  - **Slice 2 — model** (`lib/dnd/system-variants.ts`): added `parentSlotId`/`artUrl`/`campaignId`/`summary`(+`UpdatedAt`/`Hash`) to `SystemVariant`, `ActiveSheet`, `ActiveSlotMeta`, `SheetSlot`; threaded them through `readVariants`/`snapshotActive`/`withActiveSlotMeta`/`switchActive`/`switchToSlot`. Derived-origin lineage (`resolveOriginSlotId`/`isOriginSlot`/`ensureLineage` backfill — no global pointer, so it survives every existing `/system` write), `forkSheet` (deep-clone + parent), and the cap (`MAX_VARIANTS=20`/`sheetCount`/`isAtVariantCap`). `/system` route now syncs the `art_url` column on switch, non-destructively.
  - **Slice 3 — pure helpers**: `variant-breakdown.ts` (`sheetClassBreakdown` reads level + per-class from 5e `meta.classes`/PF2 `data.pf2e.identity`/IG `data.ig.identity`) and `variant-tags.ts` (full taxonomy — Original/Variant/Viewing/System/Vanilla/Custom/DM-granted/Multiclass/Campaign/Personal/NPC/Draft/Submitted/Approved/Rejected/Different-system + tone palette).
  - **Slice 4/5 — AI summary + fork route**: `variant-summary.ts` (per-system digest, djb2 `digestHash` for staleness, original-vs-variant prompt selection) + `app/api/dnd/characters/[id]/variants/route.ts` (`fork` with 20-cap 409, `summary` regen+persist, `set-campaign`). Fork clones the source, sets lineage, makes the fork active (→ user edits it), and generates its summary.
  - **Slice 6 — UI**: `VariantBrowser.tsx` — the "VERSIONS //" dropdown; lobby-style cards (portrait/name/system/level line/tags), active highlight, click-to-switch+reload, `+ Variant` on the viewed card, delete on non-origin variants, summary popover, and auto-summary-on-load when missing/stale (only fires after a real change, so unchanged reloads cost nothing).
  - **Slice 7 — wiring**: `page.tsx` builds the card model server-side via `variant-view.ts` (`buildVariantCards`) with a campaign-name map, mounted beside `SheetChrome` (owner/DM).
  - **Slice 8 — tests**: `__tests__/dnd/variant-tracker.test.ts` (19) — breakdown, tags, lineage/fork/grandchild, cap, summary digest/hash/prompt-selection, card model + staleness. typecheck clean (0), lint clean, 78/78 across affected suites.

### Known follow-ups (not blocking)
- **Auto-summary on save** currently fires from the browser on load when stale/missing (bounded, correct trigger). Wiring it directly into the builder/level/ai-edit save paths would make it instantaneous — deferred to the build/edit consolidation (which reworks those save paths anyway).
- **`SystemSwitcher`** (transpose/add/level-up-to-match) still renders alongside the new browser; retire its switch/rename/delete into `VariantBrowser` during consolidation so there's one versions surface.
- **Legacy origin**: for a pre-feature character with several sheets and no forks yet, the original is a best-effort derivation until the first fork backfills lineage. A future "set as original" action could let the owner re-designate.
- **Browser QA still owed.** Code-complete, typecheck/lint clean, 78/78 unit tests — but NOT yet browser-verified (this repo's rule is to drive the browser before calling UI done). An automated pass was attempted; the local dev server on :3000 was listening but not serving cleanly to curl/automation, so QA wasn't run rather than risk disrupting a running instance. Remaining checks (Slice 9 / suits the planned final-QA pass): VERSIONS dropdown renders on a real sheet; `+ Variant` forks + lands in the editor on the fork; clicking another card switches + reloads; summary popover + auto-summary-on-change; tags/level line correct across 5e/PF2/IG; the 20-cap message. Until then, treat the UI as shipped-but-unverified.
