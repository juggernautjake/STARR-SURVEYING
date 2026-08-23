# Page Designer — fidelity, drawing, and the page checklist

**Status:** in progress · started 2026-08-23 · follows `completed/DESIGN_STUDIO_2026-08-23.md`

> **How to run a slice.** Pick the top unchecked `- [ ]`. Read its section. Ship it, verify it in a
> browser, tick it with what you actually did — including what you decided *not* to do and why.

---

## §0. What the owner asked for

Verbatim, because every slice below traces to one of these:

1. *"work on the buttons and other elements and please make sure that all of the text that is
   inside of the elements is properly aligned"*
2. *"a list of every single page on the frontend and backend that we can reference in the design
   editor… go through them one by one and work on each one and then check it off when we are
   satisfied"*
3. *"make sure everything is proportionally to scale in the editor view to how it would be in
   production"*
4. *"a simple drawing tool… straight lines, free hand, circles, ovals, squares with sharp and
   rounded corners, rectangles with sharp and rounded corners… text placement and editor…
   a fill bucket to fill in spaces that I have drawn that are closed drawings… control line width
   and color"*
5. *"work on the design page UI and buttons and alignment and stuff too to make it really really
   good and intuitive and professional and easy to use"*
6. *"make sure the mobile view works really well"*
7. *"a full audit… all of the elements available to be dragged and dropped and edited… saving the
   html file and screen shot mechanics all work… all of the elements are actually representative…
   everything is named and has tags… the tabbed categories are all working and populated"*
8. *"litterally every single building block on the website… all of the little role bubbles and
   pending/accepted/rejected/denied/etc bubbles… all of the tags and emojis and literally
   everything you can put in there"*
9. *"be able to draw and create new shapes"*
10. *"a place to write notes for each page to explain what is on the page and what the purpose for
    the page is"*
11. *"the page list to be very well organized, formatted and made available to me quickly with a
    drop down menu or something"*
12. *"layer management… send things back a layer, or forward a layer, or… to the back or to the
    front. This needs to work for all elements and drawing elements and text and everything. It
    should be dynamic. All changes should be dynamic in real time."*
13. *"a way to save everything on the design page so that we can come back and work on it later"*

---

## §1. What the measurement already found

`scripts/check-design-alignment.mjs` places every catalogue entry on a real artboard, normalises by
the artboard's own scale, and measures four things: centring, overflow, natural-vs-frame size, and
escaping text. **27 of 46 entries have something wrong.** Grouped by cause, not by entry:

### 1a. `position: fixed` escapes the artboard — the worst one

`.notif-toast` is `position: fixed; top: 64px; right: 16px; z-index: 1000`. Placing a Toast on the
artboard pins it over the **entire editor**, measured at 844px taller and 1160px wider than its
frame. Any catalogued element whose real CSS uses `fixed` or `sticky` does the same.

The wrapper owns position; the element inside must never. This is one rule in one place, and it has
to be applied to the export stylesheet too or the file and the canvas disagree.

### 1b. Forced `height: 100%` fights content-height elements

`.dsx__el-inner > *` sets `width:100%; height:100%`. For a flex control that is right. For a
paragraph, a title, a card — anything whose height is its content — it stretches the box and leaves
the text stranded at the top of dead space. That is most of the "frame 200px, natural 42px" rows,
and it is the direct cause of complaint (1) and (3): the editor is not showing what production shows.

The catalogue already records `size.contentHeight` for exactly this. Nothing reads it.

### 1c. Default frames that do not match the element's natural size

`media.avatar` 40px frame / 22px natural. `layout.toolbar` 56 / 23. `button.pin` 40 / 28. A default
that is wrong by 12px means every mockup starts wrong by 12px. Where an element has one true size,
the default must be that size.

### 1d. Genuine escapes

`button.icon` — text escapes 12px right. `text.caption` — 4px below.

### 1e. What the measurement gets WRONG, and must stop reporting

- **A label above an input is supposed to sit high.** The centring rule should not apply to a
  label-and-field stack. Worse, a placeholder is a *property*, not a text node, so only the label
  was measured — the "off centre by 22px" rows for `input.*` and `select.dropdown` are the
  instrument, not the app.
- **A shape has no natural height.** `shape.rectangle` reporting "natural height 0" is correct
  behaviour being reported as a defect.

---

## §2. Phases

### Phase A — Element fidelity *(complaints 1 and 3)*

- [x] **A1 — Never let an element position itself.** `position: static` on everything inside
      `.dsx__el-inner`, in the studio CSS *and* in `baseStylesheet()`. Assert it: place a Toast,
      confirm its box is inside the artboard.
- [x] **A2 — Honour `contentHeight`.** Wrapper height auto for those entries; the inner element
      takes its natural height. `positionStyle` stops emitting a fixed height for them, so the
      export matches.
- [x] **A3 — Correct every default size to the measured natural size** where the element has one
      true size (avatar, pin, toolbar row, chip, switch, checkbox). Re-measure to prove it.
- [x] **A4 — Fix the real escapes** (`button.icon`, `text.caption`).
- [x] **A5 — Fix the measurement's own false positives** (§1e) so the check is worth running.
- [x] **A6 — A "100%" zoom that means actual size**, stated in the UI, plus a one-click "actual
      size" control. Scale fidelity nobody can verify is scale fidelity nobody trusts.

### Phase B — The catalogue is complete, named, tagged and searchable *(complaint 7)*

- [x] **B1 — Every category tab populated.** Sixteen categories exist; any tab that opens empty is
      a promise the palette does not keep. Audit each, curate what is missing.
- [x] **B2 — Every entry has real keywords, synonyms and concepts**, asserted by a test rather
      than by inspection — an entry with three keywords is unfindable and nothing currently says so.
- [ ] **B3 — Close the top of the coverage queue.** The sweep's ranked list is the work order.
- [ ] **B4 — Every entry is representative**: a screenshot-diff style check that an entry rendered
      in the studio matches the same markup rendered in the app's own context.

### Phase C — The page checklist *(complaint 2)*

- [x] **C1 — An inventory of every page, frontend and backend.** The admin registry is 133 routes;
      the public site, customer portal and auth surfaces are not in it and must be enumerated too.
- [x] **C2 — A review status per page** — `not started` / `in progress` / `done`, with a note and
      who changed it. Stored server-side so it is the same list on every machine.
- [x] **C3 — Surface it in the editor**: pick a page, see its status, open or create its design,
      tick it off. This is the owner's stated workflow, so it is the shape of the screen.
- [x] **C4 — Progress that is honest**: "37 of 168 done" on the designs list.

### Phase D — Drawing *(complaint 4)*

- [x] **D1 — A drawing layer per view.** Raster, because a fill bucket on "closed drawings" means
      flood fill, and flood fill is a pixel operation. Vector shapes stay as elements; this is the
      sketch layer over them. Round-trips through save, export and PNG capture.
- [x] **D2 — Tools**: freehand, straight line, rectangle (sharp and rounded), square, ellipse,
      circle. Shift constrains. Corner radius adjustable before and while drawing.
- [x] **D3 — Fill bucket** — scanline flood fill with tolerance, so an almost-closed shape still
      fills rather than flooding the whole canvas.
- [x] **D4 — Line width and colour**, plus eraser and clear.
- [x] **D5 — Text on the drawing layer**: click to place, type, edit, move, size, colour.
- [x] **D6 — Undo that includes drawing**, in the same history as everything else.

### Phase I — Layers *(complaint 12)*

- [x] **I1 — Four moves, on everything**: forward one, back one, to front, to back. `reorder()`
      already implements all four and only two are reachable from the UI.
- [x] **I2 — A layers panel** listing every element top-to-bottom, showing which is selected, with
      drag-to-reorder, hide and lock. This is also the answer to selecting something buried under a
      full-width card, which the import makes common.
- [x] **I3 — Drawing and text obey the same order.** The drawing layer is one entry in the layer
      list, not a special case pinned above or below everything.
- [x] **I4 — Real time**: reordering repaints as it happens, no save step.

### Phase J — Nothing is ever lost *(complaint 13)*

- [x] **J1 — Everything new round-trips**: the drawing layer, page notes, layer order and flags all
      save to the server and come back. Proven by opening in a second browser with empty storage,
      the way persistence was proven the first time.
- [x] **J2 — Autosave covers the drawing layer**, which is the easiest thing to lose and the most
      annoying to redo.
- [ ] **J3 — A visible save state**: saved / saving / saved-here-only, so "did that keep?" is never
      a question.

### Phase E — The studio's own UI *(complaint 5)*

- [x] **E1 — A toolbar that is readable.** It is one long row of equal-weight buttons; group it by
      what the groups are for, and give the primary action primacy.
- [x] **E2 — Alignment and rhythm** across the three panels: consistent control heights, one
      spacing scale, labels that line up.
- [ ] **E3 — Keyboard and affordances**: tool shortcuts, visible active tool, cursor per tool.
- [x] **E4 — Measure it with `ui-fit-sweep`** at 1440 and 390 and fix what the numbers say.

### Phase F — Mobile *(complaint 6)*

- [x] **F1 — The mobile ARTBOARD is honest**: 390×844, safe areas, fold line, and elements that
      wrap the way a phone wraps.
- [x] **F2 — The studio ON a phone**: the three-panel editor at 390px wide is not usable as three
      panels. Decide and build the phone layout for the editor itself.
- [ ] **F3 — Mobile export**: the phone HTML file opens at phone width and looks like the artboard.

### Phase G — Export and capture *(complaint 7)*

- [x] **G1 — Every export path verified end to end** on a real design: PNG, SVG, both HTML forms,
      the CSS pair, `design.json`, `PROMPT.md`, `PUNCHLIST.md`.
- [ ] **G2 — The PNG is faithful** — the capture draws SVG primitives, so anything it cannot draw
      is a silent omission. Enumerate what is dropped and say so in the UI.
- [x] **G3 — The HTML file stands up alone**: opened from `file://`, no network, looks like the
      canvas.

### Phase H — The audit

- [x] **H1 — Drag and drop every single entry** onto both artboards and confirm each places, edits,
      moves, resizes, exports.
- [x] **H2 — Full suite, build, all five check scripts, `ui-fit-sweep`.**
- [ ] **H3 — Merge to main.**

---

## §3. Decisions taken without asking

The owner said: *"You have my permission to make all decisions for the design editor."* These are
the ones worth writing down.

**The drawing layer is raster, not vector.** A fill bucket that fills "spaces I have drawn that are
closed" is flood fill, which is a pixel algorithm. Vector shapes each carry their own fill and
cannot answer "what region did these three strokes enclose". So: freehand, shapes and fill all draw
into a canvas per view, exported as an image layer. The cost is that a stroke cannot be selected and
moved after the fact — which is what "a simple drawing tool" means, and it is what a fill bucket
requires. The catalogue's vector shapes remain for anything that needs to stay editable.

**The page list includes the public site.** The owner said frontend *and* backend. The admin
registry is one source; public routes come from the filesystem. Both are enumerated, and the list
records which is which, because a marketing page and an admin page are not reviewed the same way.

**Review status lives in the database, not in a design.** A page's status is about the page, not
about any one mockup of it — a page can have three variant designs and one status.
