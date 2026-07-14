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

### P1 — Universal raster image import
- [ ] Add `image` asset kind + `defSize`/`defaultName` entries; store `{src, natW, natH, mime}` (read
      natural size via an `Image()` before creating the asset).
- [ ] Rename the **SVGs** tab → **Images**; generalize `importSVG` (or add `importImage`) to
      `accept="image/*,.svg"`; SVG kept working (inline `<svg>` vs `<img>`/data-URL for raster).
- [ ] Library thumbnail renders the actual image (not a circle); "＋ New" / empty-state / edit-swap
      wired for `image`.
- [ ] Browser-verify: import a PNG and a JPG; both appear in the Images tab at correct aspect.

### P2 — Real-size, non-circular, full-res image instances
- [ ] `renderInstances`: `image` (and `svg`) instances render in a rectangular `.art` at native
      aspect, full resolution, honoring `i.opacity`; no `border-radius`.
- [ ] Placement uses native size (clamped) instead of the 70px token default; `w/h` initialized.
- [ ] Selection outline for rectangular instances is a rectangle, not a circle.
- [ ] Browser-verify: dropped image shows at real size/aspect, sharp, not a small circle.

### P3 — Resize + rotate handles for ANY placed element
- [ ] Add corner scale handles + rotate handle to selected `#bodyLayer` instances (all kinds); store
      `i.w/i.h/i.rot`; apply `rotate()` in the `.inst` transform.
- [ ] Inspector gains **size, rotation, opacity** controls for every instance kind (numeric + drag).
- [ ] Aspect-lock for images on corner drag (shift to free-resize); rotation snaps at 15° with shift.
- [ ] Browser-verify: scale + rotate a planet, a spingalaxy, and an image; values persist through
      reload (autosave/`cleanState`).

### P4 — Image background that actually renders + honors size
- [ ] Extend `state.background` with image mode `{mode:'image', src, fit, size, opacity}`; keep
      gradient/look mode working.
- [ ] Backdrop tab: import an image (`image/*`), pick fit (cover/contain/stretch/tile), size slider,
      opacity; or use the generated backdrop as before.
- [ ] Render the background as a dedicated full-canvas layer **behind** sectors/bodies/fx; **audit
      z-index + the mapFx/nebula/gradient overlays** so nothing covers it (fixes "doesn't show up").
- [ ] Ship `Downloads/Starfield.svg` into `public/dnd/maps/assets/` as a built-in backdrop option.
- [ ] Browser-verify: set an image background at two different sizes → the change is visible and the
      size visibly matters; overlays don't hide it.

### P5 — Spiralize any image + 7-layer spiral with per-layer speed
- [ ] Add "Spiralize" (apply DiffSpin) to any `image` asset → produces a spinning layered instance.
- [ ] Expand spin/galaxy layer control to **up to 7 layers**; expose an independent **speed** (and
      direction) per layer in the editor; wire through DiffSpin ring config + serialization.
- [ ] Global spin-speed master still works; per-layer speeds compose with it.
- [ ] Browser-verify: an imported photo spiralized with 7 layers, each layer visibly at a different
      speed; reload preserves per-layer speeds.

### P6 — 3D world live round-trip (New → editor → import back)
- [ ] `planet-3d.html`: when opened with a round-trip flag (e.g. `?returnTo=studio` / `window.opener`),
      add a "Send to Map" action (and/or on export) that `postMessage`s the `.planet3d` payload to
      `window.opener`.
- [ ] Map Studio: "New" on the **3D Worlds** tab opens `planet-3d.html` (popup, same origin) in
      round-trip mode; a `message` listener imports the returned world directly as a `planet3d` asset
      (dedupe with `importPlanet3D`). File import remains as fallback.
- [ ] Browser-verify: New → build a world → Send to Map → it appears on the map spinning, no file
      save/import step.

### P7 — Console parity, persistence, final verify
- [ ] Mirror render-affecting additions into `console.html`: `image` instances (real size/aspect,
      opacity, rotation), image background (mode/fit/size/opacity), 7-layer spin.
- [ ] Confirm serialization round-trips every new field (`mapData`, `cleanState`, sector list if
      touched); publish a map in Studio and confirm the Console shows images + background + spins.
- [ ] Browser-verify end-to-end: Studio publish → Console load renders everything identically.

---

## 4. Ship log
(Stop-hook driven. One line per shipped slice: `P#: <what shipped> — <commit>`.)
