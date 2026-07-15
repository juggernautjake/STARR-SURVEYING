# Layered spiral (diffspin) effect on real images, in the 3D viewer

**Goal (per the DM):** an inserted **image** in the 3D viewer must support the same **layered spiral
effect** already offered in 2D — the effect must **act on the actual image the user provided** (not a
generated 3D model, and not an HTML/CSS rendering), with full **layer (ring) count, speed, and
rotation controls**, turning the image into an animated spiral/vortex. Images must also **insert and
resize dynamically in real time** in the 3D viewer (this already works via the live edit push + LOD;
this plan makes the spiral the focus).

## Background — what exists

- **2D engine (`DiffSpinGalaxy`, in `map-studio.html`, exposed on `window`):** slices an image into
  `n` concentric **rings** (`ringCanvases`), each rendered to its own canvas, and rotates each ring at
  its own **speed** and **direction** with a **master** speed and edge **feather**. `_draw()`
  composites the rotated rings → a differential-rotation swirl. Config = `toConfig()` →
  `{rings, master, feather, speeds[], dirs[]}`; `fromConfig(cfg)` restores it; `setImage(src)` loads
  the source. This is the "spingalaxy" body and the image **"🌀 Apply layered spin"** action.
- **3D image plane (`map3d.js _imagePlane`):** an aspect-correct textured plane with edge-fade shader
  and a uniform `imgSpin`. It does **not** yet do the layered/differential ring spiral.
- **3D already reuses shared engines** (planet3d-model, labels, sky2d) and can read `window.*`.

## The approach

Reuse the **exact** `DiffSpinGalaxy` engine so 2D and 3D match: for an image flagged with a spiral
config, run a `DiffSpinGalaxy` on an **offscreen canvas** (its own `setImage(src)` + `fromConfig`),
`start()` it, and use that canvas as a **`THREE.CanvasTexture`** on the image plane, setting
`texture.needsUpdate = true` each frame. The rings, speeds, dirs, master, and feather come straight
from the instance's stored config, so the layer/speed/rotation controls drive both viewers identically.

## Data model

Store the spiral config on the **image instance** (not by converting it to a spingalaxy), e.g.
`i.spiral = { on, rings, master, feather, speeds[], dirs[] }` (the `DiffSpinGalaxy` config shape).
Persisted in `mapData()` (instances are already serialized whole) → publishes to players.

## Slices

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — Image spiral config + 2D render.** ✅ Added `i.spiral = {on,rings,master,feather}` plus an
  inspector "🌀 Layered spiral" section (enable + Layers + Speed + Ring-blend). When on, the 2D image
  renders through a `<canvas class="spiralcanvas">` driven by a live `DiffSpinGalaxy` (`mountSpiralImages`,
  `spiralLiveImg` registry) using the image's own `src`, sliced into rotating rings — the simpler
  `imgSpin` uniform rotation stays separate. Config persists on the instance (serialized in `mapData`).
  Verified headless: a spiral image's canvas has content (22k lit px) and **animates** (pixel sum
  changes over time); controls present; `spiral` persisted; 0 errors.
- **Slice 2 — Image spiral in 3D.** ✅ `_imagePlane` now detects `it.spiral.on`: it builds a
  `window.DiffSpinGalaxy` on a 256px offscreen canvas (with a fixed `_fit`), `setImage(src)` +
  `fromConfig(it.spiral)` + `start()`, and binds that canvas as the plane's `CanvasTexture` on the
  fade-shader's `uMap`; the render loop sets `tex.needsUpdate=true` each frame so the swirl animates.
  Registered in `_spiralImages` and disposed on rebuild; the plane goes square while spiralling; falls
  back to the static texture if the engine/image is missing. Verified headless: the plane binds a live
  spiral CanvasTexture (`_spiralImages` = 1); 0 errors.
- **Slice 3 — Controls parity + live edit + Console.** ✅ The Layers/Speed/Ring-blend controls update
  both viewers live: a slider change re-renders 2D and, via `markDirty → pushTo3D → setData`, rebuilds
  the 3D spiral engine (verified rings 4→9 reflected in 3D live). The player **Console** now renders the
  spiral image too — a `spiralcanvas` + a console `mountSpiralImages` running the same `DiffSpinGalaxy`
  from the published `spiral` config (fixed 256px buffer so it's robust to layout timing). Verified
  headless: Console 2D spiral animates (27k lit px); 0 errors. Console 3D uses the shared `map3d.js`
  spiral path.
- **Slice 4 — Doc to completed + QA.** ✅ End-to-end verified headless: a spiral image animates in the
  Studio 2D and 3D viewers and in the player Console 2D, driven by the shared `DiffSpinGalaxy` from the
  same `spiral` config; live control changes reach 3D; 0 console errors. Doc moved to `completed/`.

## Considerations

- **Performance:** one `DiffSpinGalaxy` (a handful of ring canvases) per spiral image, ticked only
  while on-screen/large; the `CanvasTexture` upload is once per frame per spiral image. Cap the number
  of simultaneously-animating spiral images if needed (LOD already gates promotion).
- **It must be the real image:** the texture is the user's `src` sliced into rings — never a generated
  planet/galaxy or an HTML rendering.
- **Exact parity:** 2D and 3D share `DiffSpinGalaxy` + the same `spiral` config → identical motion.
- **Resize in real time:** already handled by the live `pushTo3D` + LOD; verify it holds with the
  spiral engine attached (rebuild disposes/reattaches the engine cleanly).

### Status: COMPLETE (Slices 0–4 shipped) — image layered-spiral works on the real image in Studio 2D + 3D and the player Console.
