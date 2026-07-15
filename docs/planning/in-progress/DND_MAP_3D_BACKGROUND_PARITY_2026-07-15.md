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
- **Slice 7 — 2D⇄3D parity backdrop.** ⏳ `#gl-bg` canvas painter in `map-studio.html` + `console.html`
  that renders the same `bg3d`+`seed` in 2D (solid/glow/stars/nebula/spiral/blackhole/asteroids),
  sharing palette/arrangement with 3D; align `mapFx` mood with `bg3d`; verify each element kind
  (planet/star/image/text/HTML/POI/sector + labels + fade) renders consistently in both viewers and
  stays in lockstep on live edits. Verify headless in Studio and Console.
- **Slice 8 — Doc to completed + ship log.** Move this file to `docs/planning/completed/` with a build
  log once Slices 5–7 land and the whole flow is verified end-to-end (Studio DM edit → live 3D + 2D
  parity → publish → player Console parity).

### Status: IN PROGRESS (Slices 0–4 shipped; 5–7 pending)

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
- **Slices 5–7** ⏳ pending — DM controls + persistence, live edit re-render, 2D parity backdrop.
