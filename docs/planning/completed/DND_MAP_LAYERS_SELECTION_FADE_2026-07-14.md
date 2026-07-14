# Stardust Map Studio — layers, selection border, edge fade, star rays

**Goal (per the user, verbatim intents):**
- "**Total layer handling** for all images, sectors, planets, and everything. Simply **send elements
  backwards or forwards** and control the layers that way." / "Full layer control … **bring any
  element to the front** at any time, or **send any element to the back** at any time." Keep it
  **simple and intuitive**.
- "Draw a **sector on top of an image without selecting the image** while using the sector draw tool."
- "Planets and elements get a **border around them when selected** — choose the **thickness, style,
  and color** of the selection border."
- "**Fade out the outer edges of images and spinning images** … control the **gradient** of the fade
  from the outer edge to the inside, and **how much distance** that gradient is spread over." "Even
  the **outer edge layer of a spinning element**" should fade, to blend into the background.
- "Create **stars that do not have the little star shine lines** … **toggle** those on and off."

Tools: `public/dnd/maps/map-studio.html` (DM editor) + `console.html` (player) — vanilla HTML, global
scripts, edited in place. See [[project_dnd_map_studio_buildout]] for engine map + gotchas. Continues
the completed `DND_MAP_IMAGES_BACKGROUNDS_SPIRAL_2026-07-14` buildout on branch
`claude/dnd-planet-clouds-2026-07-14` (PR pending).

## Engine facts
- Layers in `#canvas`: `#bgLayer`(0) `#backLayer`(1, NEW) `#svg`(2, sectors) `#bodyLayer`(3, instances)
  `#fxCanvas`(4) `#labelLayer`(5). Sectors are SVG (paint order = document order, no per-element
  z-index); instances are HTML divs (honor z-index). True cross-type interleave is impractical, so:
  instances order among themselves via `z`; a `behind` flag drops an instance into `#backLayer`
  (below sectors) → enables "sector on top of image". Sectors order among themselves via `z`.
- `renderInstances` builds `.inst` divs; `renderSectors` paints into `#svg` sorted by area desc.
- Selection outline is `.inst.sel{outline:…}` — now driven by CSS vars `--selw/--sels/--selc`.
- Star art (`art()` `k==="star"`) draws a `<g>` of 14 ray `<line>`s — gate on a flag.
- Instances serialize whole; sectors via explicit list + `cleanState()` (new sector fields go both).

## Slices

### Q1 — Full z-order layering (front/back/forward/backward) ✅
- [x] `#backLayer` (z-index 1, below sectors) + transform in `applyView`; layer z-indexes renumbered.
- [x] `renderInstances`: clears both layers; renders each instance into `#backLayer` if `i.behind`
      else `#bodyLayer`, sorted by `z`, `el.style.zIndex=z`.
- [x] `renderSectors`: sorts by `(z asc, area desc)`.
- [x] `reorderZ` + `layerControlsHTML`/`wireLayerControls` — inspector **Layer** section (⤒Front / ↑Fwd
      / ↓Back / ⤓Back + "Behind systems/sectors" for instances). Sector `z` persisted in serialize.
- [x] Browser-verify: A brought to front then sent behind → renders behind B (in `#backLayer`).

### Q2 — Draw sector over image without selecting
- [x] `#canvas.pen #bodyLayer,#canvas.pen #backLayer{pointer-events:none}` so pen clicks reach the
      canvas to add points instead of selecting instances. (done in CSS)
- [x] Browser-verify: with pen active, `#bodyLayer` computed `pointer-events:none` → clicks pass
      through to the canvas (draw points) instead of selecting the image underneath.

### Q3 — Customizable selection border ✅
- [x] `state.selStyle={width,style,color}`; `applySelStyle()` sets `--selw/--sels/--selc` on `:root`.
- [x] `.inst.sel` uses the vars. UI in the Effects inspector: style (dashed/solid/dotted), color,
      thickness. Persisted in `mapData`/`cleanState`/`loadMap`/autosave; applied on init + load.
- [x] Browser-verify: 6px solid red → selected planet outline = rgb(255,45,45), 6px, solid.

### Q4 — Edge fade for images + spinning images ✅
- [x] Instance fields `fade` (0–100) + `fadeSpread` (0–100) + `fadeShape` (radial | edges); `fadeMask(i)`
      → mask on the `.art` div (radial = rounded from centre; edges = straight rectangular via two
      linear masks + `mask-composite:intersect`).
- [x] Inspector controls for `image` and `spingalaxy` (masks the whole `.art` incl. outer ring).
- [x] Browser-verify: radial rounds a square image's corners to transparent (stars show through);
      edges keeps it square with a straight edge-vignette.

### Q5 — Star shine-lines toggle ✅
- [x] `art()` star gates the rays `<g>` on `a.rays!==false` (studio + console); `newAsset('star')`
      `rays`; `snapshotLook` includes `rays`; star editor has a "✦ Shine lines (rays)" checkbox.
- [x] Browser-verify: `art(star,rays:false)` → 0 `<line>`; `rays:true` → 14.

### Q6 — Live DM-moved elements ("keep updated" / party ship) — real-time to players ✅ (code; e2e on deploy)
- [x] **"Keep updated (live)"** toggle (`i.live`) in the instance inspector (works for any image/ship
      /element). Serializes whole with the instance.
- [x] Transport reuses the existing `campaignBridge`: the tools already get `?campaign=<id>&map=<id>`
      and POST/GET the map to `/api/dnd/campaigns/[id]/maps` (`dnd_maps.data`). No new route needed.
- [x] DM side (map-studio): dragging a `live` instance calls a **debounced `saveToCampaign()`**
      (`window.__mapLivePush`, exposed by the bridge; safe no-op standalone) so the published row's data
      updates. Player side (console): `poll()` every 4 s GETs the map, compares a `liveSig` of live
      elements, and updates only their positions + `render()` at the **current view** (keeps pan/zoom).
- [x] Browser-verify (as feasible offline): live toggle sets `i.live`; both tools load clean;
      standalone console still renders the sample galaxy; standalone push is a no-op.
- [x] Deferred to deploy: DM moves a live element in an embedded campaign map → the player Console
      reflects it within ~4 s. (Built + loads clean; full e2e needs the Next.js app + auth + a published
      campaign map + two clients — not reproducible on the static file server here. Verify on deploy.)

## Ship log
(Stop-hook driven.)
- Q1: Full z-order — `#backLayer` + per-element `z` (instances sorted + zIndex; sectors by z/area);
  inspector Layer controls (front/back/fwd/back) + "Behind systems" for instances. Verified.
- Q2: Pen tool passes clicks through instances (`#canvas.pen #bodyLayer/#backLayer{pointer-events:none}`)
  so a sector can be drawn over an image without selecting it. Verified.
- Q3: Customizable selection border — `state.selStyle` (width/style/color) → CSS vars on `.inst.sel`;
  Effects-panel UI; persisted everywhere. Verified (6px solid red).
- Q4: Edge fade — `fadeMask` masks image/spingalaxy `.art` with amount + spread + shape (radial
  rounded / edges straight). Verified both shapes; blends squares into the background.
- Q5: Star shine-lines toggle — `a.rays` gates the ray `<g>` (studio + console); star editor checkbox.
  Verified (0 vs 14 lines).
- Q6: Live DM-moved elements — "Keep updated (live)" toggle + debounced `saveToCampaign` push
  (map-studio) and a 4 s `poll()` that live-updates positions at the current view (console), reusing
  the existing campaign bridge/API. Verified offline (toggle, clean load, standalone intact); DM→player
  e2e is verify-on-deploy.
