# CAD certification + survey-notes blocks — hide / right-click / move

*Opened 2026-05-29 as a direct follow-up to
`hub-grid-editor-and-banner-green-2026-05-29.md` (Slices 218–225).*

## What the user asked for

> "We have added two text blocks to the CAD software, which is
> fine, but I need to be able to hide them, resize them, edit the
> text, change their size, etc. Please make it obvious on how to do
> these things. Probably just make them moveable and give me a
> drop-down menu when I right-click them so I can hide them if
> needed."

Five concrete asks:

1. Right-click the Certification block → context menu with at
   minimum: **Hide**, **Edit text**, **Reset position**.
2. Right-click the Survey Notes block → same context menu shape.
3. Make both blocks **moveable** (click + drag).
4. Make both blocks **resizable**.
5. Make all this obvious — the surveyor shouldn't have to dig
   through the Settings panel to flip `certification.visible`.

## What already exists (no rebuild)

| Piece | Where it lives |
|-------|----------------|
| Certification block render | `CanvasViewport.tsx` line 2291 (`renderPaperFurniture`) |
| Survey Notes block render | `CanvasViewport.tsx` line 2243 |
| `tpl.certification.visible` boolean | `DrawingTemplate` (`templates/types.ts:95`) |
| `tpl.standardNotes.visible` boolean | `DrawingTemplate` (`templates/types.ts:120`) |
| `useTemplateStore.updateActiveTemplate({...})` | `template-store.ts:14` |
| TB right-click context menu shell | `CanvasViewport.tsx` line 12549 (`tbContextMenu`) |
| TB hit testing for north arrow / title block / scale bar /
   signature / official seal | `CanvasViewport.tsx:2088` (`hitTestTBElement`) |
| `tbBoundsRef` (screen bounds rebuilt each frame) | `CanvasViewport.tsx:788` |
| Certification editor modal | `app/admin/cad/components/CertificationEditor.tsx` |

## What's missing

- `tbBoundsRef` doesn't track certification or notes bounds, so
  neither block is hit-testable. Result: right-click does nothing,
  click-drag does nothing, the blocks are effectively frozen.
- The TB context menu's `TBElemType` doesn't include cert / notes
  so the existing menu can't surface them.
- No "Hide block" action — the only way to toggle visibility today
  is through the Print dialog's element toggles (Slice 24).

## Phases + slices

### Phase 40 — Right-click context menu for Cert + Notes blocks (Slice 226)

#### Slice 226 — Hit testing + right-click menu with Hide / Edit / Reset ✅ shipped
- **Done:** Widened `tbBoundsRef` + the new `TBElemType` to include `'certification' | 'notes'`. Extracted `hitTestTBElementPure(sx, sy, bounds)` as a module-level export so the priority ordering can be unit-tested without mounting Pixi — keeps the more-specific TB elements (north arrow, title block, scale bar, official seal label → signature block) above the paper-furniture blocks, with cert tested before notes for a deterministic tie-breaker. `renderPaperFurniture` now records both blocks' on-screen rects into `tbBoundsRef.current.certification` and `.notes` while drawing; the same render path also resets both to null up front so a hidden block correctly reports no hit. New optional `visible?: boolean` field on `StandardNotesTemplateConfig` (mirroring the existing one on `CertificationTemplateConfig`) — undefined treated as visible so every saved template stays unchanged; the on-canvas notes render now gates on `tpl.standardNotes?.visible !== false`. `position` made optional on both configs so the "Reset position" menu action can clear it back to the default layout. Three new menu items render when `tbContextMenu.element` is `'certification'` or `'notes'`: **🙈 Hide block** (flips `visible` to false via `useTemplateStore.updateActiveTemplate`); **✏️ Edit Certification Text… / Edit Survey Notes…** (opens the existing `CertificationEditor` / `StandardNotesEditor` inside a new lightweight modal mounted next to `ScaleBarEditorModal`); **↩ Reset position** (clears `position` to undefined). Drag-to-move and corner-resize for these blocks are explicitly out-of-scope for Slice 226 — `tbDragRef` keeps the narrower union; a runtime guard in the SELECT-mode pointer-down narrows `tbHit` to exclude cert/notes so the drag setup never fires for them, and the right-click flow proceeds normally. The hover ref widened to the full `TBHitTarget` so the cursor hint can reflect cert/notes too; the existing hover-gated redraws still test their specific values so no visual regression. 10 vitest specs lock the pure hit-test (10 cases: nulls baseline, cert / notes positive hits, just-outside boundary misses, inclusive edge ≤ semantics, NA > co-located titleBlock, officialSealLabel > signature, titleBlock > overlapping cert, cert > notes, full miss). 1521 CAD specs green. `tsc` + `eslint` clean. (One flaky `__tests__/recon/phase12-export` failure when the full suite runs — passes in isolation, deals with sandbox PDF rendering, not introduced by this slice.)

### Phase 41 — Move / resize (Slices 227–228)

#### Slice 227 — Drag-to-move certification + notes blocks ✅ shipped
- **Done:** Widened `tbDragRef.element` to include `'certification' | 'notes'` alongside the existing TB family. Removed the Slice-226 SELECT-pointer-down narrowing (`tbHitWide === 'certification' || 'notes' ? null : tbHitWide`) so cert/notes flow into the same drag pipeline as the other elements. Two new origin-lookup branches read `useTemplateStore.getState().activeTemplate.certification?.position` / `.standardNotes?.position` with defaults matching the on-canvas render positions — `{ Math.max(0.5, pw - 4), 0.5 }` for cert (top-right above the title block), `{ 0.5, 4.5 }` for notes (left margin, below legend). The pointer-move math grew an `isTLanchored = element === 'certification' || 'notes'` guard so cert/notes use `origPosY + dScreenY/inchToPx` (top-left y axis) while the TB family keeps the original `origPosY - dScreenY/inchToPx` (bottom-left y axis); paper-x still uses `+dScreenX/inchToPx` for everyone. `renderPaperFurniture`'s notes + cert sections grew live-drag overrides — when `tbDragRef.current.element === 'notes'`/`'certification'`, the block renders at `tbDrag.livePosX/Y` instead of the stored position, so the block follows the cursor in real time; the existing right-edge clamp on cert (`clampedX`) still applies, so a drag past the paper edge is pinned. Pointer-up commit grew two new branches inside the existing `tbDragRef` commit block: `element === 'certification'` calls `useTemplateStore.updateActiveTemplate({ certification: { ...active.certification, position: pos } })`, and `element === 'notes'` does the symmetric `{ standardNotes: { ...active.standardNotes, position: pos } }`. The cert/notes commits sit inside the existing `moved > 0.01` threshold + ref-clear path, so they share the same single-click vs. drag discrimination + cursor reset as the other TB elements. 12 vitest specs in `__tests__/cad/ui/cert-notes-drag-to-move.test.ts` lock every wiring point via `fs.readFileSync` regex (union widening; narrowing removed + replaced; cert + notes origin-lookup branches; isTLanchored discriminator + y-sign flip; notes + cert render-override; cert + notes commit branches + ordering inside the existing commit block). 1662 CAD specs green. `tsc` + `eslint` clean.

#### Slice 228 — Resize handle + inline width edit
- **Scope:** Add a corner-drag resize handle while either block is
  selected. Updates `tpl.certification.width` / `tpl.standardNotes.width`
  (already exists in the template type).
- **Done when:** Surveyor can resize each block by dragging its
  corner.

---

## TL;DR

- Slice 226 ships the right-click menu (the user's primary frustration).
- Slices 227-228 layer on drag-to-move + corner-resize so the
  blocks read as fully editable like the other TB elements.
