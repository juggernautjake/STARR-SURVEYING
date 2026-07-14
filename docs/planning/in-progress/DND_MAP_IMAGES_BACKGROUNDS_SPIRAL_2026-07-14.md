# Stardust Map Studio — images, backgrounds, spiral layers, 3D round-trip

**Goal (per the user, verbatim intents):**
- "Drop in **svgs, pngs, gifs, jpgs, and all image files** and resize them and **crop** them and
  **change transparency** and all of that." Images currently "drop into the map as **round tokens**…
  little small circles." They must "load into the map viewer as their **actual size**… **full
  resolution**" and "be able to **scale up and down**."
- "Make sure I can **change the size and rotation of any element** I place into the map builder."
- "Drop **full size images** into the editor and resize them. Apply **spiral effects** and stuff to
  **all imported images**."
- Backgrounds: "the size I set the backdrop to **actually matters**"; "**import images as the
  background**, not only… the generated background"; "the background to **actually show up** — make
  sure there aren't any effects/styling in the viewer covering it."
- Spiral: "**full control of the spin speed and the different layers** of the spiral. We need up to
  **7 spiral layers** and… control the speed for **each one**."
- 3D worlds: in Map Studio, hitting **New** on the 3D Worlds tab should **open the 3D world editor**,
  and the built world should **import directly back** into the map — "we shouldn't have to save the
  3D world and then import it back in" (file import stays optional).

Extends the integrated Stardust suite (see `completed/DND_GALAXY_MAP_2026-07-09.md` and
`completed/DND_MAP_RICH_LABELS_2026-07-14.md`). Tools are same-origin static assets under
`public/dnd/maps/` (`map-studio.html`, `console.html`, `planet-3d.html`), edited in place — no build
step, no framework, vanilla HTML/CSS/JS. `planet-3d.html` alone loads Three.js from CDN.

**Reference-file finding (2026-07-14):** the user's Downloads originals
(`map_studio_library.html`, `planet_3d_generator.html`, `stardust_console.html`) are the *earlier*
standalone baseline; the repo is already ahead of them and they contain the **same** limitations
(SVG-only import `accept=".svg,image/svg+xml"`, `border-radius:50%` tokens, gradient-only
background). So these features must be **built**, not copied. Reusable: `Downloads/Starfield.svg`
(a ready backdrop to test image-backgrounds), and the repo's existing **DiffSpin engine** (the
differential-spin ring treatment) to satisfy "spiral on any image."

---

## 1. What exists today (engine map — verified line refs, map-studio.html)

- **Instances render as HTML divs** in `#bodyLayer` (`renderInstances`, L991–1013). `.inst` CSS
  (L78–85): `.inst .art{width:100%;height:100%}`; the selection outline `.inst.sel` uses
  `border-radius:50%` (L85). `spingalaxy`/`planet3d` canvases have inline `border-radius:50%`
  (L999–1000). Other kinds render via `art(i.look||i,true)` (L1001).
- **Only an `svg` raster-ish kind exists.** `importSVG` (L836) uses `accept=".svg,image/svg+xml"`.
  There is **no** png/jpg/gif kind. `TABS` (L~542–561) includes `svg` ("SVGs") and `background`
  ("Backdrop"). `newAsset` (L713), `defSize` (L730, svg:70).
- **Instances are drag-only** (`onInstDown`, L1122). **No resize/rotate handles for bodies** — only
  *sectors* have `onScaleDown` (L1150) / `onRotateDown` (L1152) + vertex handles. Body size is edited
  only via an inspector field (`renderInstanceInspector`, ~L1327–1372). No per-instance rotation or
  opacity anywhere.
- **Background is a two-color CSS radial gradient** set on `#canvas` (`renderInstances` L993:
  `radial-gradient(... state.background.c1 ... c2 ...)`), with a nebula fallback in `applyMapFx`
  (L1496–1497). `applyBackground` (L898) just `snapshotLook`s a generated backdrop asset. **No image
  background, no size, no fit.** `state.background` is a "look" object.
- **Persistence:** `mapData()` (L1503) serializes `instances` and `assets` **whole** (new instance
  fields survive automatically), but `sectors` via an **explicit field list** (L1504) — new sector
  fields must also be added to `cleanState()` (L1544). `state.background`/`centerGalaxy` are
  serialized (L1503, L1537).
- **DiffSpin engine** is inlined (drives `spingalaxy`): slices an image into N concentric rings and
  spins each independently. Import via `importSpinGalaxy` (L824); instances mount on `.dscanvas`
  (L1106+). This is the reusable "spiral on any image" machinery.
- **console.html** mirrors the schema and renders published maps with the same art engine; new
  render-affecting fields must be mirrored there too.

---

## 2. Design decisions

- **New `image` asset kind** for raster files (png/jpg/gif/webp) *and* SVG (svg becomes a subtype so
  the existing SVG tab folds in). Stores `{src:dataURL, natW, natH, mime}`. Rename the "SVGs" tab to
  **"Images"**; `accept="image/*,.svg"`.
- **Instances gain `w`, `h`, `rot`, `opacity`, and optional `crop:{x,y,w,h}` (fractions).** Existing
  bodies keep working off `size` (treated as both w & h when `w/h` absent). Image instances render at
  native aspect: default `w=natW` clamped to a sane max, `h=w*natH/natW`.
- **Universal transform handles** on `#bodyLayer` instances: 4 corner scale handles + a rotate
  handle, mirroring the sector handle UX, plus inspector numeric **size / rotation / opacity**
  fields available for **every** kind (task: "size and rotation of any element").
- **Non-circular art:** image/svg instances render in a rectangular `.art` (no `border-radius`), full
  bitmap, `object-fit` per crop. Round bodies (planets etc.) keep their look.
- **Image background:** `state.background` gains an image mode `{mode:'image', src, fit, size,
  opacity}` (`fit` ∈ cover/contain/stretch/tile; `size` scales it). Render as a dedicated
  full-canvas layer **behind** everything, and audit the fx/gradient/nebula layers so none paints
  over it (the "make it actually show up" bug).
- **Spiral generalization:** any `image` asset can be "Spiralized" → becomes a `spingalaxy`-style
  instance via the existing DiffSpin engine. Expand ring/layer control to **up to 7 layers**, each
  with an independent **speed** (and direction). Wire per-layer speed UI in the spin editor.
- **3D round-trip:** "New" on the 3D Worlds tab opens `planet-3d.html` (popup window, same origin);
  planet-3d posts its `.planet3d` payload back via `window.opener.postMessage`; Map Studio listens
  and imports it directly as a `planet3d` asset. File import (`importPlanet3D`, L797) stays as
  fallback. Requires a small addition to `planet-3d.html` (post to opener on export when opened in
  round-trip mode).

Each slice below: implement → **verify in-browser** (static server at `http://localhost:8712/…`,
drive with Chrome, check console for errors) → commit → push → tick the box + annotate. Static
HTML under `public/` is not part of the TS build, so `npm run typecheck`/lint don't cover it; the
gate is a clean browser load + the feature working. Run repo lint/typecheck only if other files change.

---

## 3. Slices

### P1 — Universal raster image import ✅
- [x] Add `image` asset kind + `defSize`/`defaultName` entries; store `{src, natW, natH}` (natural
      size read via an `Image()` before creating the asset).
- [x] Rename the **SVGs** tab → **Images**; new `importImage` uses `accept="image/*,.svg"`; SVG
      supported (loaded as `<img>` data-URL; legacy `svgData` still rendered).
- [x] Library thumbnail renders the actual image (not a circle); "＋ New" / empty-state / edit-swap
      wired for `image`.
- [x] Browser-verify: injected a 2:1 test image → appears in the Images tab at correct aspect, no
      distortion, no circle. (File-picker path is OS-level; `importImage` code exercised via the same
      `newAsset('image')` route.)

### P2 — Real-size, non-circular, full-res image instances ✅
- [x] `renderInstances`: `image` instances size the element by `w×h`, render `<img>` full-res,
      honor `opacity`, and apply `rotate(rot)`; no circular clip.
- [x] Placement (`placeConfirm` + ghost via `ghostDims`) uses native size clamped to 440px on the
      long edge; `w/h/rot/opacity` initialized. Ghost preview shows native aspect.
- [x] Selection outline is rectangular for images (`.inst.imginst.sel`).
- [x] Browser-verify: a 2:1 image placed via the real path renders as a real-size rectangle, sharp,
      correct aspect, not a circle. (screenshot in session)

### P3 — Resize + rotate handles for ANY placed element ✅
- [x] Corner scale handles + rotate handle on selected `#bodyLayer` instances (all kinds), rotating
      with the element; `i.w/i.h/i.rot/i.opacity` stored; `rotate()` applied in the `.inst` transform.
- [x] Inspector Transform section: **size, rotation, opacity** for every instance kind.
- [x] Aspect-locked corner scale; rotation snaps to 15° with Shift.
- [x] Browser-verify: image placed + rotated 20° shows handles and rotates; planet renders normally;
      instances serialize whole so w/h/rot/opacity persist. (screenshot in session)

### P4 — Image background that actually renders + honors size ✅
- [x] `state.background` image mode `{mode:'image', src, fit, size, opacity}`; gradient/look mode
      still works (gradient line guarded on `mode!=='image'`).
- [x] Backdrop tab panel: import image, built-in starfield, fit (cover/contain/stretch/tile), size,
      opacity, remove; gradient presets still applyable.
- [x] New `#bgLayer` (z-index 0, behind `#svg`); nebula tint only paints when no background, so
      nothing covers the image (fixes "doesn't show up").
- [x] `Starfield.svg` shipped to `public/dnd/maps/assets/starfield.svg`; built-in inlines it as a
      data URL so exported maps keep it.
- [x] Browser-verify: image backdrop fills at cover; size 40% visibly shrinks it; panel controls
      present. (screenshots in session)

### P5 — Spiralize any image + 7-layer spiral with per-layer speed ✅
- [x] "🌀 Spiralize" button on any `image` asset → creates a spingalaxy (DiffSpin) from its src.
- [x] Spingalaxy inspector: **Layers** (2–9, ≥7 supported), **Master speed**, **Edge blend**, and a
      **per-layer speed slider + direction toggle** for each layer; wired through `dsCfg` + engine
      `fromConfig`/`toConfig` (serialized on the instance's `look`).
- [x] Master speed composes with per-layer speeds (engine multiplies `dirs[i]*speeds[i]*master`).
- [x] Browser-verify: image spiralized → 7 layers each with its own speed/dir; renders + spins.
      (instances serialize whole, so dsCfg persists.)

### P6 — 3D world live round-trip (New → editor → import back) ✅
- [x] `planet-3d.html?studio=1` (with `window.opener`): shows a "✦ Send to Map" button that
      `postMessage`s the built `.planet3d` payload to the opener; also accepts a `planet3d-load`
      message to `applyConfig` for editing. No-op (safe) when opened standalone.
- [x] Map Studio: "New" on the **3D Worlds** tab opens the editor popup; a `message` listener imports
      the returned world directly as a `planet3d` asset (no file step). File import still available.
- [x] Browser-verify: posted `stardust-planet3d` message → asset created with `cfg3d` preserved;
      both pages load clean; `?studio=1` handlers active only with an opener. (Full popup handshake is
      cross-window; each half verified independently.)

### P7 — Console parity, persistence, final verify
- [ ] Mirror render-affecting additions into `console.html`: `image` instances (real size/aspect,
      opacity, rotation), image background (mode/fit/size/opacity), 7-layer spin.
- [ ] Confirm serialization round-trips every new field (`mapData`, `cleanState`, sector list if
      touched); publish a map in Studio and confirm the Console shows images + background + spins.
- [ ] Browser-verify end-to-end: Studio publish → Console load renders everything identically.

---

### P8 — Edit 3D worlds in place + spin control + build bodies in-studio
- [x] Per-instance **spin** control for `planet3d` (inspector slider; `p3spin` field). Default spin
      comes from the `.planet3d` JSON's `cfg3d.spin` ("spin defined in the JSON"); fps derived from
      it (1× ≈ 8s/rotation) — fixes "all the same / way too fast" (was fixed fps 16). Verified.
- [x] "✎ Open in editor" on a `planet3d` instance opens `planet-3d.html?studio=1` with its `cfg3d`
      **loaded** (via `planet3d-ready`→`planet3d-load` handshake), so tilt / sun / atmosphere / clouds
      / colors / planet type / spin are all editable; "Send to Map" replaces the asset **and its live
      instances** in place.
- [x] CSS/SVG planets, moons, stars, etc. already create-in-studio + place immediately (openEditor
      "New"); the 3D "New" path now opens the editor and imports back (P6) — no download/reupload.
- [x] Browser-verify: studio receives an edited world and updates the target asset + instances;
      spin control from P8a. (cross-window popup handshake verified per-half.)

### P9 — Draggable title labels on the map ✅
- [x] Body and sector name labels get a `.lblhit` drag rect; dragging updates `label.dx/dy` (offset
      from the anchor) so a planet's/system's name can be moved anywhere. (labelSVG already applied
      dx/dy; inspector Offset X/Y still works and stays in sync.)
- [x] Works for planets/bodies and systems/sectors; persists (label saved on the object).
- [x] Browser-verify: planet name offset via drag path renders at the new position.

## 4. Ship log
(Stop-hook driven. One line per shipped slice: `P#: <what shipped> — <commit>`.)
- P1: Universal image import — new `image` kind + Images tab + `importImage` (png/jpg/gif/webp/svg),
  native size stored, thumbnail renders true aspect. Verified in-browser.
- P2: Image instances render at native size/aspect (w×h), full-res, rectangular, with opacity +
  rotation transform; placement + ghost use native size. Verified in-browser.
- P3: On-map corner-scale + rotate handles for every instance kind; inspector size/rotation/opacity;
  Shift-snap rotation. Verified in-browser (image rotated with handles). Added slices P8 (3D
  edit/spin) + P9 (draggable labels) to the plan.
- P4: Image backgrounds — `#bgLayer` renders image backdrops behind everything (fixes "doesn't show
  up"); Backdrop panel with import/built-in-starfield/fit/size/opacity/remove; size honored. Verified.
- P8a: Per-instance 3D spin — planet3d spin now derives from the exported JSON's cfg3d.spin and is
  adjustable per instance (inspector slider); default slowed from fixed fps16 to ~8s/rotation. Verified.
- P5: Spiralize any image (🌀) → layered DiffSpin galaxy; spingalaxy inspector exposes layer count
  (up to 9), master speed, edge blend, and per-layer speed + direction. Verified (7 layers).
- P5b: Galaxy inspector gains rotation presets (realistic/hypnotic/vortex/counter/lazy/chaos) + core
  breathing (per the reference Forge). Fixed #fxCanvas stuck at 300×150 (replaced-element needs
  width/height:100%) so the ambient starfield fills the map; denser default. "More stars through the
  background" resolved. Verified.
- P5c: In-place "🌀 Apply layered spin" on placed image instances (convert image→spingalaxy);
  confirmed per-layer speed edits change the LIVE engine (0.48→2.30). Effect applies to any image and
  is fully editable. Verified.
- P6/P8: 3D world live round-trip (New→editor→Send to Map, no file) + edit-in-place with cfg3d
  reload; studio import + both pages clean verified.
