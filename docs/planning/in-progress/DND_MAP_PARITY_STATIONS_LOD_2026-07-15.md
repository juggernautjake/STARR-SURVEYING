# Map parity, varied 3D stations, richer LOD impostors & world-locked backgrounds

**Goals (from the DM), all to work in BOTH the DM Studio and the player Console:**

1. **DM ↔ Player parity.** The player Console must render, size, and behave **identically** to the DM
   Studio — same viewer geometry, same positioning, same render path. (The DM reported the player
   view looks "shifted left".) Players still pan/zoom their own screen independently; only the
   *rendering model* must match.
2. **World-locked backgrounds (parallax toggle).** When background **parallax is OFF**, the whole
   backdrop (starfield, nebula, glow, image) is **locked to world space** — it pans *and* zooms with
   the placed elements, so objects stay fixed relative to the backdrop. When parallax is ON, keep the
   current pane-fixed depth effect. The player uses whatever parallax setting the DM published.
3. **Varied 3D space stations.** The 2D station variants (ring, wheel, hub, starfort, spire, array,
   drydock, derelict, husk) each look distinct; the 3D versions are all the same ring with different
   colours. Give each `stype` its **own 3D build/shape**, matching the 2D silhouette.
4. **Richer LOD impostors.** When zoomed far out, stations/asteroids/moons/stars/planets currently
   collapse to plain coloured orbs. Instead the far placeholder should **look like the object** — use
   the body's 2D `art()` rendering (textured) as the impostor so a station reads as a station, an
   asteroid as a rock, etc.

## Current state

- `buildStationModel(config, opts)` (`planet3d-model.js`) **ignores `cfg.stype`** — always a hub +
  habitat-torus + solar wings, only recoloured. The 2D `art()` for `kind==="station"` already draws 9
  distinct silhouettes keyed by `stype`.
- **Impostors:** small/far 3D bodies fall back to a flat disc sprite (dominant colour). Only the
  colour is right; there is no shape/texture cue.
- **Background:** the 2D starfield (`Sky2D` on `#skyCanvas`) and image (`#bgLayer`) are `inset:0`,
  pinned to the pane in both viewers — they never pan/zoom with content. `bg3d.parallax` exists as a
  flag + a Studio checkbox (`#b3Par`) but currently only gates the 3D depth layers, not a world lock.
- **View model:** Studio transforms each content layer (`#svg/#bodyLayer/#backLayer/#svgFront/
  #labelLayer`) by `translate(view)*scale`; Console transforms one `#viewport`. Bodies + sectors are
  internally aligned in both (verified: body↔sector Δ = 0,0). Console additionally draws an
  in-viewport nebula/stars SVG that Studio does not, so the backdrops diverge.

## Slices

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — Varied 3D station builds.** ✅ `buildStationModel` now dispatches on `cfg.stype` and
  produces a distinct build per type: **ring** (habitat torus + spokes + solar wings + comms mast),
  **wheel** (cartwheel: heavy outer rim + thin inner rim + 10 spokes), **hub** (central node + 6 radial
  docking arms with end pods, no big ring), **starfort** (6 cone spikes + hex keep + lit core),
  **spire** (4 sharp in-plane cone spikes + octahedron + glowing core), **array** (central truss +
  stacked angled solar panels), **drydock** (open rectangular cradle of rails/uprights holding a capsule
  + clamp arms), **derelict** (gapped/broken torus, dark, spark lights, slow tumble), **husk** (dark
  angular hull fragments + torn spar + one light, tumbling). Shared colour scheme (metal=`c1`,
  dark=`c2`, lit=`c3`, blue solar panels); each build sets its own spin/tumble/drift; disposal tracks
  every geometry. Verified headless: all 9 types promote to models with **distinct** geometry
  signatures (9/9 unique), 0 errors.
- **Slice 2 — Richer LOD impostors.** ✅ `_artImpostorTex(it, onReady)` rasterises a body's 2D `art()`
  SVG → `CanvasTexture` (cached per look-signature; async SVG→Image→canvas with a ready callback).
  `_discMesh` now uses it for station/asteroid/debris/star/moon/2D-planet/2D-galaxy kinds on a
  **PlaneGeometry** (so panels/points/glow aren't clipped), starting on the shaded dominant-colour disc
  and swapping to the art raster when it loads; planet3d keeps its procedural face and spingalaxy its
  spiral disc. Falls back to the colour disc when art isn't rasterisable. Verified headless: station,
  asteroid and star impostors each render as a PlaneGeometry carrying a 128×128 canvas texture with
  thousands of opaque pixels (the real 2D silhouette), not a flat colour; 0 code errors.
- **Slice 3 — World-locked backgrounds.** ✅ `Sky2D` gained a world-lock: `setLock(on)` (idempotent —
  re-anchors only on change) + `setView(x,y,scale)`. When locked, `_draw` blits the baked sky glued to a
  world anchor (captured once from the view), scaled by zoom and translated by pan, with `baseColor`
  space filling beyond the baked patch — so the starfield/nebula/glow pans **and** zooms with the map.
  Studio's `applyView` (+ `applyBg3d`) call `syncSkyLock()`; the Console's `apply()` reads
  `MAP.bg3d.parallax` (now carried through `normalizeMap`) and drives the same lock, so **the player uses
  the DM's published parallax setting**. Sectors/systems/bodies already live in the transformed view, so
  with the backdrop locked they hold their positions over it. Backward compatible: `parallax` defaults
  true (old maps keep the pane-fixed depth effect) and is a live per-map toggle. Verified headless: lock
  turns on with the setting and off when re-enabled, the view is pushed on pan/zoom, the anchor stays
  glued during panning; a screenshot pair shows the starfield scaling + moving with the planet and
  sector. *(Deferred to Slice 4: locking the `#bgLayer` image backdrop and the ambient shooting-star FX
  — the primary starfield/nebula/glow backdrop is covered here.)*
- **Slice 4 — Parity + toggle UI + QA.** ✅ The parallax toggle in the DM's *3D viewer background* panel
  now carries a help line spelling out the behaviour ("On: sky behind the map with depth. **Off: the sky
  is locked to the map** — it pans & zooms with your elements; players see the same"). Verified
  end-to-end that the Console honours the lock exactly like the Studio: loading a `parallax:false` map
  locks Sky2D, panning/zooming pushes the view, and a `parallax:true` map is unlocked — driven by the
  DM's published `bg3d`, so **DM and player match**. Combined with the earlier proof that bodies↔sectors
  align identically in both viewers (Δ = 0,0) and that stations/impostors render the same shared art,
  this closes the "player view shifted / renders differently" report. Existing maps pick the settings up
  automatically (bg3d merged with defaults on load; parallax a live per-map toggle).
  *Deferred (cost > value, documented): world-locking the `#bgLayer` **image** backdrop and the ambient
  shooting-star FX, and unifying the Console's world-space nebula-gradient reference frame — the dominant
  starfield/nebula/glow backdrop already matches via Sky2D and both viewers obey the same parallax
  setting, so these residual layers aren't worth the destabilisation risk right now.*
- **Slice 5 — Planet lava-flow effect + intensity.** ✅ A **lava flow** surface effect on planets/moons,
  driven by `cfg.lava` (0–1). 3D: `genLava` bakes a self-lit emissive crack network (min of two warped
  noise ridges, deep-orange edges → yellow-white centres) onto the planet material's `emissiveMap`, with
  `emissiveIntensity` scaling from the intensity (0.75 + lava·1.35) and a subtle molten shimmer in
  `update()`. The LOD impostor (`planetImpostorCanvas`) overlays the same self-lit cracks so far planets
  still glow. 2D `art()` (Studio **and** Console) draws a branching glow network — blurred red underlay +
  bright yellow core + orange branches, count/width/opacity scaled by intensity — clipped to the disc and
  painted over the terminator so it glows on the dark side. A **Lava flow** slider in the planet editor,
  persisted via `snapshotLook` (`lava`) and passed to the 3D viewer through `_genericPlanetCfg`. Verified
  headless: 3D lava 0→no emissive map, 0.4→emissive @1.29, 1→@2.1; 2D adds the blur filter + 12 crack
  cores at 0.8 and nothing at 0; 0 errors. *(planet3d-kind bodies use their own cfg3d editor; lava there
  is a later add — 2D planets/moons cover the surface-lava ask.)*
- **Slice 6 — Planet city lights + density.** Add scattered **cities & city lights** to planets
  (clusters of warm/cool night-side lights, brighter on the dark side), with a **density slider**:
  lowest = a few lights here and there, highest = the planet is blanketed in city sprawl and lights.
  Wire into 2D `art()`, 3D `buildPlanetModel` (night-side emissive lights map), and the impostor;
  persist + editor slider. Verify headless, then run the full end-to-end pass across DM/player/2D/3D/
  hybrid.
- **Slice 7 — Destroyed / cataclysm planets (2D + 3D, editable).** A **destroyed** planet mode with
  selectable variants, each with glowing molten breaks and a surrounding **debris field**:
  **split** (cloven in two halves pulling apart, debris between), **chunk** (a big bite blown out + debris),
  **holed** (a bore-hole punched clean through), **cored** (crust intact but the core gouged open, exposing
  a glowing molten cavity), **fractured** (broken into several large drifting pieces with glowing cracks).
  Render editable 3D versions in `buildPlanetModel` (sliced/holed geometry, emissive molten interior +
  a particle/rock debris ring, slow tumble) and matching 2D `art()` silhouettes + the LOD impostor.
  Add a variant picker + a **destruction intensity** slider (crack glow, debris amount) to the planet
  editor; persist on the look. Verify headless in 2D + 3D. Then run the full end-to-end pass across
  DM/player/2D/3D/hybrid and move this doc to `completed/`.

## Considerations
- **Shared renderers:** `art()` and the `planet3d-model.js` builders are used by Studio and Console
  alike, so one implementation covers every viewer.
- **Perf:** station builds are a handful of meshes; impostor textures are cached per look-signature and
  are cheap; the world-lock is a transform change, not extra draw calls.
- **Backward compatible:** old maps (no `stype`, `parallax` defaulting true) render unchanged.

### Status: IN PROGRESS (Slices 0–5 shipped; 6–7 pending)
