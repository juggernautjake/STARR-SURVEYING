# Map builder — spiral spinning effect as a background

**Goal (from the DM):** on the map builder, allow the **cool spiral spinning effect** (the layered swirl
already available for **images**) to be used as the **map background**, not just on placed images.

## Current state

- The layered spiral swirl is the `DiffSpinGalaxy` engine, applied to an **image** instance (`i.spiral =
  {on, rings, speed, rotation, …}`) in both `map-studio.html` and `console.html`, and there's a
  `spingalaxy` object kind. In 3D it swirls the actual image.
- The **background** is the programmable `bg3d` config (`Sky2D` in 2D, `Map3D.setBackground` in 3D) with
  templates deepspace/stars/milkyway/**spiral**/nebula/blackhole/wormhole/asteroids/solid/glow. The
  existing `spiral` template is a **static** painted spiral galaxy — it does not use the animated
  `DiffSpinGalaxy` swirl.
- So the swirl exists for images but there's no **animated spiral swirl backdrop** driven from the
  background controls.

## Slices

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — Spiral-swirl background option.** ✅ Added a `spiralswirl` background template. **2D
  (`sky2d.js`, shared by Studio + Console):** Sky2D now bakes a seed-stable spiral-galaxy texture and mounts
  it on the **reused `DiffSpinGalaxy`** engine (differential concentric rings) on an offscreen canvas,
  blitted each frame over a star bed — so the arms wind up over time. It honours **world-lock/parallax**
  (blits with the same world-anchor transform as the baked sky when locked), and tears the engine down when
  the template changes. `cfg.spiral = { rings, speed, rotation }`. **Controls (`map-studio.html`):** the new
  template + a Swirl-layers / Spin-speed / Base-rotation control group (shown only for `spiralswirl`),
  wired to persist on `bg3d` (so the Console picks it up automatically via `Sky2D.set(bg3d)`). **3D
  (`map3d.js`):** `_buildSpiralSwirl` builds the spiral as concentric star rings that rotate at different
  rates (inner faster), scaled by the DM's speed + base rotation. Verified headless (Playwright/chromium):
  selecting `spiralswirl` builds the engine (offscreen 420×711, renders, and **changes frame-to-frame** =
  animating); the ring-count control **rebuilds** the engine (5→10 rings); the template option is present;
  switching away **tears the swirl down**; **0 page errors**; `node -c` clean on both JS files. *(The 2D
  path — Studio + Console — is fully verified live; the 3D `_buildSpiralSwirl` mirrors the proven
  `_buildSpiral` rotation pattern and syntax-checks, with a live WebGL render check left for the open 3D
  viewer / Slice 2 parity pass.)*
- **Slice 2 — QA + docs.** Confirm parity across Studio / Console / 3D and that existing backgrounds are
  unaffected, then move this doc to `completed/`.

## Considerations
- **Reuse `DiffSpinGalaxy`** (already vendored in both viewers) rather than a new engine; the background is
  just the swirl mounted to a full-pane canvas behind the content layers.
- **Perf:** one extra canvas animation; pause it when the background isn't spiral (and when the 3D viewer
  owns the screen), matching how the image spirals already start/stop.
- **World-lock parity:** respect the parallax/world-lock background setting shipped in the map-parity work.

### Status: IN PROGRESS (Slices 0–1 shipped; 2 (QA) pending)
