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
- **Slice 1 — Spiral-swirl background option.** Add a background mode that renders the animated spiral
  spinning effect as a full-pane backdrop (behind all content), driven by the DM's background controls,
  with **layer/ring count, speed and rotation** controls like the image spiral. Wire it into the DM Studio
  (`map-studio.html`), the player Console (`console.html`), and the 3D viewer so all three show the same
  spinning spiral backdrop; persist on the map (`bg3d`), and honour the world-lock/parallax setting.
  Verify headless: selecting the spiral-swirl background renders an animated spiral behind the map in 2D
  (and 3D), with the controls changing rings/speed/rotation; 0 errors.
- **Slice 2 — QA + docs.** Confirm parity across Studio / Console / 3D and that existing backgrounds are
  unaffected, then move this doc to `completed/`.

## Considerations
- **Reuse `DiffSpinGalaxy`** (already vendored in both viewers) rather than a new engine; the background is
  just the swirl mounted to a full-pane canvas behind the content layers.
- **Perf:** one extra canvas animation; pause it when the background isn't spiral (and when the 3D viewer
  owns the screen), matching how the image spirals already start/stop.
- **World-lock parity:** respect the parallax/world-lock background setting shipped in the map-parity work.

### Status: IN PROGRESS (Slice 0 shipped; 1–2 pending)
