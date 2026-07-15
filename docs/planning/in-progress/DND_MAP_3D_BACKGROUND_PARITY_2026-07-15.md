# Programmable 3D backgrounds, live editing & 2D⇄3D parity for the Stardust map

**Context.** The real-time 3D map viewer (`public/dnd/maps/map3d.js`, `window.Map3D`) shipped in
`DND_MAP_3D_VIEWER_2026-07-15.md`. This plan collects every follow-up the DM asked for over one
working session and turns them into slices the stop hook can build. Everything renders the **same map
data**; the goal is that the flat 2D map and the 3D viewer look and behave like two views of one world,
that the DM has **full creative control over the sky**, and that **every edit shows immediately** in
whichever viewer is open.

The five requests, verbatim intent:

1. **Calmer, varied shooting stars.** Not a constant stream — **one, here or there, every 20–50s**,
   in **different sizes and colors**.
2. **Fix the parallax starfield + full background control.** Today each parallax layer's stars sit in
   **straight columns/lines**; they must be **randomly dispersed**, **mostly very small** with a few
   larger, and **some with light glimmers**. Then: **programmatically generate/regenerate** the whole
   background with different effects, with **full control** — number of parallax layers, parallax
   on/off, **star density**, **background nebula on/off**, plus **template backdrops** that vary each
   time they're generated: **spiral galaxy** (colored), **flowing nebula**, **black hole**, **just
   stars**, **deep space**, **asteroid field**. Also a **solid background color with no stars**, and a
   **background color with a glow** — the glow must support a **pulse** and **DM-chosen glow colors**.
3. **Correct impostor colors for small/far bodies.** When a planet gets small (size or zoom) it
   renders as a flat solid color; that color must be the planet's **actual dominant surface color**,
   never a default/random tint.
4. **Live 3D re-rendering on every edit.** Adding an element, resizing, or editing via the gizmo /
   number inputs / sliders **does nothing** in the 3D viewer until you toggle to 2D and back — then
   everything appears. Every edit must **re-render the affected object (or the viewer) immediately**.
5. **2D⇄3D parity.** Whatever the DM sets up in 3D — background, effects, locations, text — needs an
   **equally well-formatted, styled, dynamic 2D version**. Translate the 3D viewer's settings and
   renderings into the 2D map so the two resemble each other as much as possible.

**Follow-up requests (added during the session — build sequentially after 1–5):**

6. **Textured impostors.** The far/small placeholder should not just be the right colour — add **2D
   textures** (real continents / bands / ice) so it represents the planet as well as possible.
7. **Full editing power + delete anything.** Keep **all** controls for every 2D object (stars, etc.);
   placing a star in 2D must also place it in 3D; be able to **select any 2D or 3D object and delete
   any individual element**.
8. **Bigger images + keep 2D effects.** Allow images up to **~15×** size; keep all 2D effects (spiral
   image effect, etc.) working.
9. **See every edit render live in the 3D editor** — real-time, or immediately after each action.
10. **Origin/scale correspondence.** The 3D viewer's centre/origin must correspond **exactly** to the
    2D viewer's, so position and scale stay aligned across the toggle.
11. **See 2D animations in 3D.** While in the 3D viewer/builder, 2D animations, renderings, and **all
    effects** (spingalaxy spirals, sprite spins, per-body fx overlays) should render dynamically too.
12. **Expansive filler starfield.** Beyond the parallax stars, also generate a **full, unending
    background of generic small filler stars** in the 3D viewer.

13. **Image controls/effects in 3D.** All image controls and effects must work in the 3D viewer just
    like 2D — including the **dynamic spiral (spin) effect** and **edge fade** (soften image edges over
    a chosen distance, in a **radial** pattern or straight **from each edge**).
14. **Sectors & systems in both viewers.** Draw, render, **style and customise** sectors and systems in
    **both** 2D and 3D, looking good in each (filled polygons, borders, labels, per-sector fx).
15. **Place bodies into sectors/systems.** Be able to place planets, stars, space stations, other
    locations, and POIs **into** the sectors/systems (containment/association) — in both viewers.

16. **Full feature equivalence.** The 2D and 3D viewers must offer **equivalent objects, actions,
    effects, settings, and edit options** — no capability exists in one that's missing in the other.
17. **Backgrounds as appealing, selectable options.** The background is **one selectable option** from:
    solid colour, (expansive but finite) star field, glow, nebula, spiral galaxy, black hole, asteroid
    field — each generated to look **genuinely appealing**, varying every regenerate. The expansive
    star field must be **so big that panning/zooming in any direction never reaches its edge**, but need
    not be literally infinite. Propose and add any other backgrounds that would be good (e.g. a bright
    Milky-Way band, twin suns, a wormhole, an aurora/ion-storm veil).

20. **Full body catalogue in both viewers.** Planets, stars, stations, asteroids, moons, debris — every
    such object must be **placeable in both** the 2D and 3D viewers, each with a **solid, good,
    equivalent representation** in each view (no kind that looks great in one and blank/placeholder in
    the other).
19. **Layer priority for everything, incl. sectors/systems.** Send any element to front/back or
    forward/backward one layer. Sectors/systems must have adjustable **layer priority** too, so a drawn
    sector can sit **over** the background or images and stay visible.
18. **Cursor-centred zoom + right-click Focus + surface POIs (3D).** Zooming in/out must feel good and
    **zoom toward the cursor**. **Right-clicking** a location/planet/POI shows a **Focus** action that
    flies the camera to that body, centres it, opens its **info window**, and reveals its **surface
    points of interest** — handling **surface-level POIs in 3D just like 2D**.

22. **Unified layer/z system for every element.** All elements (bodies AND sectors) must have their
    visibility/stacking controlled by a **layer (z)** that moves them forward/back, and the 2D and 3D
    layer systems must be **well correlated and equivalent** (same z → same relative order in both).
21. **Exact spatial correspondence.** Every object's **position, orientation, colour, and scale** must
    match between 2D and 3D so it's unmistakably the **same map of space** (verified by comparing
    transforms, not just "looks close").

**Cross-cutting principle:** everything above — backgrounds, effects, bodies, images, text/HTML,
sectors, systems, POIs — must be **creatable, editable, and dynamically rendered in BOTH the 2D and
3D viewers**, staying in lockstep as the DM edits and publishing identically to players.

Every one of these is tracked as a slice in §8; the stop hook works them **in order**.

---

## 1. Data model — one `bg3d` config on the map

A single background config lives on the map document so the DM's choices **publish to players**
automatically (the same path labels/effects already travel). Default and shape (implemented in
`map3d.js` as `BG_DEFAULT`):

```js
bg3d = {
  template: 'deepspace',   // deepspace | stars | spiral | nebula | blackhole | asteroids | solid | glow
  seed: 1,                 // regenerate → new seed → new arrangement (varies every time)
  parallax: true,
  layers: 3,               // 1–6 parallax depth layers
  density: 1,              // star-count multiplier (0.2–2)
  nebula: true,            // background nebula clouds on/off
  baseColor: '#010a13',    // solid background / WebGL clear colour
  glow: { on: false, colors: ['#3b2a6b', '#0a4a5a'], pulse: false, speed: 1 }
}
```

- `Map3D.setBackground(cfg)` rebuilds the sky from `cfg`+`seed`; `Map3D.setData(map)` reads `map.bg3d`
  and applies it (so **publishing** a map carries its sky to every player Console).
- Persisted in `mapData()`, `load()`, `snapshot()`/`restore()` next to `mapFx`/`selStyle`.
- `mapFx` (the 2D `#fxCanvas` ambience) stays a separate concern; Slice 7 bridges the two so the 2D
  map mirrors the 3D template.

---

## 2. The sky engine (map3d.js) — how each piece works

- **Seeded PRNG** (`_rng`, mulberry32) so a seed reshuffles the entire sky deterministically; the
  **Regenerate** button just bumps `seed`.
- **Stars** use one shared additive `ShaderMaterial` with **per-point attributes** (`aColor`,
  `aSize`, `aPhase`, `aGlow`): positions are PRNG-dispersed (no lattice), sizes follow a **cube power
  curve** so most are tiny with a rare few large, `aPhase` drives an **independent twinkle**, and
  `aGlow`-flagged stars get soft **diffraction-spike glimmers**. Each layer keeps its parallax `k`.
- **Parallax**: `layers` depth planes with `k` spread far→near; **off** collapses to a single plane.
- **Templates**: `deepspace`/`stars`/`nebula` = layered starfields (± nebula); `spiral` = stars swept
  into 2–4 logarithmic arms around a coloured, slowly-rotating core; `blackhole` = dark event-horizon
  disc + additive accretion ring + halo over a sparse bed; `asteroids` = drifting grey rocky belts;
  `solid` = clear colour only; `glow` = clear colour + a big central multi-colour glow.
- **Nebula clouds** reuse the existing seeded canvas-cloud texture with per-generation palettes.
- **Glow** is a radial multi-stop sprite from `glow.colors`; when `glow.pulse` the render loop
  modulates its opacity at `glow.speed`.
- **Shooting stars** (already reworked): a single global timer spawns **one meteor every 20–50s**
  (first after 8–20s), each a **random size** (0.55–1.7×, scaling length/speed/brightness/lifetime)
  and a **random colour** from an 8-hue palette.

---

## 3. Correct impostor colours (map3d.js + planet3d-model.js)

- `planet3d-model.js` exports **`planetDominantColor(config)`** — a sea-level-weighted blend of the
  planet's own `TYPES` palette (ocean vs land, with a touch of polar ice; gas giants → band average).
  Single source of truth for the palette.
- The LOD impostor disc paints itself with the body's **true** colour: `planetDominantColor` for
  `planet3d`, the star's own colour for stars, a blend of `look.c1/c2/c3` otherwise — never the old
  `#8f9bd0` default. The disc is a cached **radial-gradient texture** (lit highlight → true colour →
  shadow terminator) so a far/small planet reads as a shaded sphere in its real colours, not a coin.

---

## 4. Live editing (map-studio.html)

Today only the gizmo writes back (3D→2D); **2D→3D never refreshes live** because the studio never
calls `Map3D.setData` after an edit, so changes only appear on the next 2D→3D remount. Fix:

- A debounced **`pushTo3D()`** that, when `Map3D.isShown()`, calls `Map3D.setData(mapData())` (~100ms
  trailing) — wired into the central mutation points (`markDirty()` / `renderAll()`), so **adding,
  moving, resizing, rotating, and inspector/slider edits all re-render immediately** in 3D.
- **Fast path for the selected body**: on a size/color/config change to the selected instance, update
  that holder's scale/disc/mesh in place (and re-run LOD) instead of a full rebuild, so slider drags
  stay smooth. Full `setData` remains the correctness fallback (add/delete/reorder).
- The gizmo write-back path already updates the 2D inspector; keep that and make sure it also
  refreshes labels so text stays glued to moved bodies.

---

## 5. 2D⇄3D parity (map-studio.html + console.html)

Give the flat map a backdrop that mirrors the 3D `bg3d` template so the two viewers resemble each
other, and keep every element consistent:

- **Backdrop renderer**: a `#gl-bg` canvas (behind `#bgLayer`) draws a 2D interpretation of the same
  `bg3d`+`seed`: solid colour, glow (with the same pulse), dispersed twinkling stars (same size
  distribution + glimmers), nebula puffs, a spiral-galaxy render, a black-hole disc+ring, or an
  asteroid scatter. Same seed → the 2D and 3D skies share arrangement/palette.
- **Effects continuity**: the 2D `mapFx` ambience (twinkle/shooting/nebula tint) and the 3D sky read
  as one style — driving both from `bg3d` where they overlap (e.g. shooting-star cadence, nebula
  palette) so toggling viewers doesn't change the mood.
- **Locations / text / images / HTML**: already shared data; verify each kind renders with matching
  position, size, rotation, label styling, and fade in both viewers, and that live edits keep them in
  lockstep (Slice 6).
- **Players** get the identical backdrop in the Console from the published `bg3d`.

---

## 6. Considerations worth calling out

- **Performance**: stars are one draw call per layer via shared material; regenerate disposes old sky
  objects (`_disposeBackground`) to avoid GPU leaks. The 2D backdrop caps star counts by density and
  redraws only on config/seed change, not per frame (except the animated glow/twinkle).
- **Publish size**: `bg3d` is tiny (a config, not pixels) — no storage concern, unlike baked sheets.
- **Determinism**: everything visual derives from `seed`; "Regenerate" is the only randomness, so a
  saved map always reloads the same sky.
- **Read-only Console**: players can pan/zoom the same sky but never edit it.
- **Backwards-compat**: maps without `bg3d` fall back to `BG_DEFAULT` (deepspace) — identical to the
  current look minus the star-banding bug.

---

## 7. Architecture decisions

- One `bg3d` config, applied in **both** viewers; **no** separate 2D/3D background state.
- Sky lives entirely in `map3d.js` (3D) and a small canvas painter in `map-studio.html`/`console.html`
  (2D) — both pure functions of `(bg3d, seed)`.
- `planetDominantColor` centralised in `planet3d-model.js` so 2D and 3D agree on a body's colour.
- Live refresh is **debounced full `setData`** for correctness + a **selected-body fast path** for
  smoothness; no attempt at per-property 3D diffing beyond the selected holder.

---

## 8. Implementation slices (commit plan)

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — Calmer, varied shooting stars.** ✅ Global 20–50s timer (first 8–20s), per-meteor random
  size + colour. Shipped (`map3d.js`); verified headless (gaps 20.4–49.3s, 15 sizes, 8 colours).
- **Slice 2 — Fix parallax star banding.** ✅ PRNG-dispersed stars, cube-power size curve (mostly
  tiny), per-point twinkle + glimmer spikes via a shared additive `ShaderMaterial`. Shipped in
  `map3d.js` as part of the sky engine.
- **Slice 3 — Programmable background engine.** ✅ `BG_DEFAULT` + `setBackground` + `_buildBackground`
  with all 8 templates (deepspace/stars/spiral/nebula/blackhole/asteroids/solid/glow), parallax
  on/off + layers + density, nebula toggle, base colour, and configurable pulsing glow. `setData`
  reads `map.bg3d`. Shipped in `map3d.js`; verified headless (all 8 templates build, 0 errors).
- **Slice 4 — Correct impostor disc colours.** ✅ `planetDominantColor` export in
  `planet3d-model.js`; shaded radial-gradient disc in the body's true colour. Shipped; verified
  (desert planet → `#a68f60`).
- **Slice 5 — DM background controls + persistence.** ✅ Effects-panel section: template dropdown (all
  8), **Regenerate** (new seed), parallax toggle + layers slider, density slider, nebula toggle, base
  colour, glow on/off + two colour pickers + pulse + pulse-speed. `state.bg3d` default;
  `bg3dControlsHTML`/`wireBg3dControls`/`applyBg3d()` → `Map3D.setBackground` live when 3D is shown;
  `bg3d` persisted in `mapData()`/`load()`/`cleanState()`/`restore()`/localStorage. Console reads
  published `bg3d` via `setData`. Verified headless: panel renders 8 templates; template change →
  spiral rebuild; Regenerate sets a new seed; glow → sprite; `mapData().bg3d` carries it; 0 errors.
- **Slice 6 — Live 3D re-render on every edit.** ✅ Debounced `pushTo3D()` (90ms) wired into
  `markDirty()` → `Map3D.setData(mapData())`, so add/move/resize/slider/inspector/delete all show in
  3D immediately (no toggle). Guarded by `Map3D.isEditing()` (skips mid gizmo-drag) and a `fromGizmo`
  flag so the gizmo write-back never tears down the body under the cursor; `_rebuild` preserves the
  selected body so the gizmo stays attached across live edits. `window.map3dSelect` selects the body
  in the Studio so any 2D **or** 3D object can be picked and **deleted** (Delete key / inspector). Image
  size cap raised to **15×** (image slider max 6600; on-map corner-drag already uncapped); all existing
  2D effects (spingalaxy spiral, sparkles, fx overlays) untouched. Verified headless: add 0→1, resize
  size 400 → holder.scale.x 200, 3D-select sets `selection`, delete 1→0; zero console errors.
- **Slice 6b — Textured impostors (req 6).** ✅ `planetImpostorCanvas()` renders the planet's real
  surface (continents/bands/ice + atmosphere rim) onto a lit sphere-projected disc, cached per config;
  `map3d.js` uses it for the `planet3d` impostor. Verified headless for 5 planet types.
- **Slice 7 — 2D⇄3D parity backdrop + origin/scale sync (reqs 5, 10).** ✅ New shared `sky2d.js`
  (`window.Sky2D`) paints the same `bg3d`+`seed` in a `#skyCanvas` behind the 2D map in **Studio and
  Console** (solid/glow/stars/nebula/spiral/blackhole/asteroids), baking the static sky once and
  animating only glow-pulse + twinkle. `applyBg3d()`/console `applySky()` drive it; published `bg3d`
  reaches players. Origin/scale sync: `window.map2dView`/`setMap2dView` bridges expose the 2D centre +
  px-per-unit; `Map3D._syncFromView()` centres/zooms the 3D camera to match on show, `_syncToView()`
  writes it back on hide. Verified headless: spiral backdrop paints (61% lit px); 2D view (300,-150,
  0.8) → 3D target (300,150), zoom exact; 0 errors.
- **Slice 8 — Expansive filler starfield (reqs 12, 17-refine).** ✅ `_addFillerStars` adds a deep bed
  of tiny dim generic stars behind the parallax layers on the **star-field backgrounds** (deepspace /
  stars / nebula only — it's a property of those options, not forced on every template). It stays
  camera-adjacent so panning/zooming never reaches an edge (feels vast but is a finite set); density
  scales with `bg3d.density`; mirrored in `sky2d.js` `_paintFiller`. Verified headless: filler present
  on star templates and fills the view after a 9000-unit pan; 2D backdrop covered; 0 errors.
  *Refinement (req 17): the starfield is one background option among solid / glow / nebula / spiral /
  black hole / asteroids — Slice 9b polishes the visual appeal of all of them.*
- **Slice 9 — Image effects in 3D + spin control (req 13).** ✅ Image planes now fade at the edges in
  the 3D viewer via an in-shader mask mirroring the 2D `fadeMask` (radial closest-side or straight
  from-edge, driven by `fade`/`fadeSpread`/`fadeShape`), and a new **image spin** control (`imgSpin`,
  °/s) rotates the image continuously in **both** viewers (2D CSS `spin` on the image, 3D plane
  rotation in the render loop). Verified headless: 2D spin `spin/12s` at 30°/s; 3D plane is a fade
  shader (`uFade=0.6`) registered for spin; 0 errors.
- **Slice 9a — Spingalaxy spin replicated in 3D (req 11).** ✅ Spingalaxy bodies render in the 3D viewer
  as a spiral-galaxy disc (arms + coloured core drawn from the look's `c1/c2/c3/arms/turns/tight`) that
  **spins like the 2D viewer** — the disc rotates at `360/spinDur` °/s in the render loop (the 2D
  diff-rotation is approximated by a uniform spin). Sprite-spun planets already render as real spinning
  3D models. Verified headless: spingalaxy gets a galaxy texture, spins at 9°/s (spinDur 40), rotation
  advances; 0 errors. *Deferred: per-body SVG fx overlays (sparkle/nebula/shoot) in 3D — decorative
  overlays that don't translate cleanly to a 3D holder, and the scene-level nebula + shooting-star
  systems already provide ambient equivalents; low value vs. cost.*
- **Slice 10 — Sectors & systems in 3D + layer priority (reqs 14, 19).** ✅ Sectors/systems now render
  in the 3D viewer in a dedicated group behind the bodies: a translucent filled `ShapeGeometry` in the
  sector's colour/`fillOpacity` plus a coloured `LineLoop` border and its CSS3D label, at the **exact**
  2D positions/scale (2D→3D `(x,-y)`; curved edges use the same closed Catmull-Rom→cubic-Bézier as the
  2D `sectorPath`, sampled). The sector `z` maps to 3D depth so layer order carries over. Layer-priority
  controls (front/back/forward/backward) already exist in the sector inspector (`layerControlsHTML` +
  `wireLayerControls(state.sectors,s)`, `renderSectors` sorts by `z`) and now propagate live to 3D via
  the edit push, so a sector sits over the background in both views. Verified headless: straight + curved
  sectors build in 3D (2 fills, 2 borders); the straight sector's centroid is exactly `(250,-230)`
  matching its 2D points; 0 errors.
- **Slice 11 — Place bodies into sectors/systems + live sector layering (reqs 15, 19).** ✅ Moving a
  body in the 3D viewer re-associates it with the sector it lands in — the gizmo write-back
  (`map3dApply`) already calls `reassoc(i)` → `sectorAt`, identical to the 2D placement path — so
  containment matches in both views and publishes. Also fixed sector **layer ordering in 3D**:
  `_buildSectors` now paints sectors in `z` order (depthTest is off, so paint order sets who's on top),
  so sending a sector forward/back reorders it live in 3D exactly as in 2D. Verified headless:
  body moved into a sector gets its id and loses it when moved out (`null→secA→null`); sending sector A
  to front makes it the top-drawn sector in 3D live; 0 errors.
- **Slice 9b — Appealing backgrounds + new templates (req 17).** ✅ Added two striking selectable
  backgrounds across the 3D engine, the 2D `sky2d.js` backdrop, and the DM dropdown: **Milky Way band**
  (a bright luminous star band tilted at a random angle, with a filler bed) and **Wormhole** (a tunnel
  of glowing, tilted, counter-rotating rings receding into a bright core). Both vary per regenerate.
  Verified headless: both build in 3D (milkyway 9 objs / wormhole 15 incl. 8 rings), appear in the
  dropdown (10 options), and paint in 2D; 0 errors. *Existing templates already generate attractively
  (palette-varied, seed-shuffled); further per-template polish left as optional future tuning.*
- **Slice 11a — Unified layer/z system for all elements (reqs 19, 22).** ✅ The 2D `z` layer now drives
  3D depth so "bring to front / send to back" orders bodies in 3D exactly as in 2D: each holder gets a
  bounded depth offset `tanh(z/20)*0.4` (front band above the sectors, `behind` bodies below), so the
  paint order matches the 2D stack (backLayer < sectors < bodyLayer). Verified headless: `front2(z=9)
  →0.669 > front1(z=5)→0.598 > 0`, `behind→-3`; 0 errors.
- **Slice 11b — Cursor-centred zoom + right-click Focus (req 18).** ✅ Cursor-centred zoom
  (`zoomToCursor`) plus a right-click context menu on a picked body (right-drag still orbits) with
  **Focus** → the camera eases to centre + frame the body (moving target+camera together to keep tilt)
  and its info window opens via the existing selection (Studio inspector / Console readout); a
  **Deselect** item too. Verified headless: right-click builds the menu; Focus sets the goal and eases
  the target from `(40,-82)` toward the body at `(2060,-1560)` and selects it; 0 errors.
- **Slice 11b-2 — Surface POIs in 3D (req 18).** ✅ A body's surface POIs render as glowing,
  type-coloured pin sprites on the front hemisphere (`ax/ay → lon/lat`, matching the 2D POI layer),
  children of the holder so they move/scale with the body. Clicking one is picked ahead of the body and
  bridged via new `window.map3dSelectPoi(instId,poiId)` → the Studio POI inspector (`{type:'poi'}`) /
  the Console body readout. Verified headless: 2 POIs render on the front hemisphere (z 0.87, 0.74) and
  a pick bridges to `('pl','poiA')`; 0 errors.
- **Slice 11c — Full body-kind catalogue in both viewers (req 20).** ✅ Every placeable kind now has a
  solid 3D representation: 2D **planets** and **moons** synthesize a planet config
  (`_genericPlanetCfg`, ptype/mtype→TYPES) and render as real `buildPlanetModel` spheres (textured
  impostor face when small); **stations** get a metal ring + hub + spokes + blinking beacon
  (`_stationModel`); **asteroids/debris** get flat-shaded tumbling rock clusters (`_debrisModel`, one
  chunk for an asteroid). All promote via LOD like planets and spin/animate. planet3d, star, spingalaxy,
  image, text, HTML, POI were already covered. Verified headless: planet(4 meshes)/moon/station(7)/
  debris(7) each build real meshes when large; 0 errors. *Static 2D `galaxy` kind keeps the shaded
  disc (the animated spingalaxy is the primary galaxy body); low value to add a second galaxy mesh.*
- **Slice 12 — Feature-equivalence audit (req 16).** ⏳ Enumerate every object kind, action, effect,
  setting, and edit option in the 2D Studio inspector/toolbar and confirm each has an equivalent path
  when the 3D viewer is active (or is reachable through the shared inspector while 3D is shown); close
  any gaps. Produce a short parity table in this doc (2D capability → 3D equivalent) and fix the top
  missing ones. Verify headless.
- **Slice 13 — Doc to completed + ship log + QA.** Move this file to `docs/planning/completed/` with a
  build log once Slices 8–12 land and the whole flow is verified end-to-end (Studio DM edit → live 3D +
  2D parity → publish → player Console parity), including origin/scale alignment, animated content,
  sectors/systems in both viewers, body-into-sector placement, and full feature equivalence.

### Status: IN PROGRESS (Slices 0–11c shipped; 12 pending, then 13 = doc-move/QA)
*Req 21 (exact position/orientation/colour/scale correspondence) is a verification bar applied to
every slice — the 2D→3D `(x,-y)` transform + scale·2 model already gives bodies/sectors exact placement
(e.g. sector centroid `(250,-230)`); Slice 12 audits it across all kinds.*

---

## 9. Build notes / ship log

- **Slice 1 — Shooting stars** ✅ `feat(dnd): calmer, varied shooting stars in the 3D viewer`
  (`628013c2`). One global timer, 20–50s cadence, random size/colour.
- **Slice 2/3 — Sky engine** ✅ Star banding root-caused to `(i*613)%1000` linear positions →
  diagonal lattice; replaced with mulberry32 dispersion + per-point size/twinkle/glimmer shader and a
  full template/glow/parallax engine (`setBackground`, `_buildBackground`, `_updateBackground`,
  `_disposeBackground`). All 8 templates verified headless (swiftshader), 0 console errors.
- **Slice 4 — Disc colours** ✅ `planetDominantColor` centralised; shaded impostor disc in true
  colours (desert → `#a68f60`).
- **Slice 5 — DM background controls + persistence** ✅ Effects-panel section + `bg3d` persistence.
- **Slice 6 — Live 3D re-render** ✅ `pushTo3D()` on `markDirty`; gizmo-safe; delete-any-element;
  images to ~15×.
- **Slice 6b — Textured impostors** ✅ `planetImpostorCanvas()`; real surface on the far/small disc.
- **Slice 7 — 2D parity backdrop + origin/scale sync** ✅ `sky2d.js` `#skyCanvas` in Studio + Console;
  `map2dView`/`setMap2dView` + `_syncFromView`/`_syncToView` so 2D and 3D share centre + scale exactly.
- **Slice 8 — Expansive filler starfield** ✅ Pinned (k=1) tiny-star bed in 3D + `sky2d.js` mirror;
  recentres to the camera so it never ends.
- **Slices 9–12** ⏳ pending — 2D animations + image effects (spiral, edge fade) live in 3D;
  sectors/systems in 3D; body-into-sector placement; feature-equivalence audit. Then **Slice 13** —
  doc → completed + QA.
