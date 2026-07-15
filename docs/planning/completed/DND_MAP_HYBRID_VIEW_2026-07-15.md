# Hybrid map view — 2D map with a transparent, camera-locked 3D overlay

**Goal (per the DM):** a third view mode that shows **both** maps at once: the **2D viewer renders all
2D elements** (images, spirals, text, sectors, POIs, background) so they stay easy to manage with the
2D controls, and a **transparent 3D viewer overlaid on top** renders the **3D objects** (planets,
stars, moons, stations, etc.) for clarity and smoothness. The two must stay **locked to the same
view** so it reads as one cohesive map. If it looks good, hybrid becomes a first-class mode.

## Research — how to render both at once and keep them cohesive

The pieces already exist; hybrid mostly *composes* them:

1. **Transparent 3D overlay.** `map3d.js` creates its `WebGLRenderer` with `alpha:false` + an opaque
   clear colour. For hybrid we need `alpha:true` and `clearAlpha 0`, and we must **not** draw the sky
   (stars/nebula/glow) in the 3D layer — the 2D `#skyCanvas` (Sky2D) already draws the background and
   will show through. So in hybrid the 3D scene renders **only the 3D bodies**, over transparency.
2. **Camera lock (already built).** `window.map2dView()` exposes the 2D viewport centre + pixels-per-
   unit; `Map3D._syncFromView()` centres and zooms the ortho camera to match exactly (2D→3D `(x,-y)`,
   `zoom = 2·H·scale/h`). In hybrid the 2D map is the **master**: every frame (and on every 2D
   pan/zoom) the 3D camera mirrors the 2D `view`, so bodies land pixel-aligned with their 2D spots.
   Tilt/orbit is **disabled** in hybrid (2D can't represent tilt) — hybrid is top-down.
3. **Interaction stays 2D.** The 3D overlay is `pointer-events:none`, so all clicks/drags pass through
   to the 2D layer. Every body still has its 2D element in `#bodyLayer` for hit-testing/selection/drag;
   the 3D mesh renders on top, aligned, and visually replaces the (opaque) 2D art. Moving a body in 2D
   moves its 3D mesh because both read the same instance `x/y/size`.
4. **What renders where.** 2D layer keeps everything (unchanged). The 3D overlay renders **only** the
   3D-native kinds (`planet3d`, `planet`, `moon`, `star`, `station`, `debris`, `asteroid`) — it skips
   images, text, HTML, spirals, sectors, POIs (those stay crisp in 2D). Result: flat, managed 2D
   content + clear, lit 3D planets on top, one view.
5. **Cohesion.** Because zoom↔scale and centre are locked and `holder.scale·2 = size`, a body's on-
   screen size in 3D equals its 2D size. The 2D sky shows through; the 3D planets are lit spheres over
   it. The `behind`/z layer still orders 2D content; 3D bodies sit above the 2D layer (DOM overlay), so
   in hybrid 3D objects are always above 2D objects (documented limitation — acceptable per the ask).

**Risks / mitigations.** (a) *Perf*: two render paths, but the 3D layer only draws the 3D bodies and
the 2D canvas only repaints on change — fine. (b) *Alignment drift on rapid zoom*: sync the camera in
the same rAF as the 2D `applyView`, and also each 3D frame, so they never separate. (c) *A 2D object
that should occlude a 3D planet*: not supported in hybrid (3D is a top overlay) — note it; the DM can
use pure-2D or pure-3D for those cases.

## View-mode model

Replace the 2-way toggle with a 3-way mode: **2D · 3D · Hybrid**.
- **2D**: today's flat map (3D hidden).
- **3D**: today's full 3D (2D hidden, 3D draws its own sky) — unchanged.
- **Hybrid**: 2D layers visible; 3D overlay visible, transparent, `pointer-events:none`, sky off,
  camera locked to the 2D view, rendering only 3D-native bodies.

## Slices

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — 3D transparent + body-filtered mode.** ✅ Renderer now created with `alpha:true`.
  `Map3D.setMode('full'|'overlay')`: overlay sets `clearAlpha 0`, `_buildBackground` early-returns (no
  sky), `_buildSectors` early-returns (2D draws sectors), `_updateShooters` no-ops (no 3D meteors), and
  `_rebuild` skips every non-native kind (`_isNative3D` = planet3d/planet/moon/star/station/debris/
  asteroid) so images/text/HTML/spingalaxy stay 2D. Verified headless: full mode = 2 bodies + 2 sector
  meshes + 4 sky layers + 2 CSS labels; overlay = only the planet3d, 0 sectors/sky/CSS, `clearAlpha 0`;
  0 errors.
- **Slice 2 — 3-way view toggle + hybrid wiring.** ✅ `wireToggle` cycles 2D → 3D → Hybrid → 2D.
  Hybrid shows the 2D layers, shows `#gl3d` with `pointer-events:none`, puts `Map3D` in overlay mode
  (controls disabled, gizmo detached), and **locks the camera to the 2D view every frame**
  (`_syncFromView` in the render loop); 3D→Hybrid first writes the 3D view back to 2D so the position
  carries over. Verified headless: 2D (gl hidden) → 3D (mode full, 2D hidden) → Hybrid (mode overlay,
  2D visible, `pointer-events:none`); after a 2D pan the 3D target = the 2D centre `(400,300)` with
  controls disabled; 0 errors.
- **Slice 3 — Cohesion polish + Console.** ✅ A `map-hybrid` class (set on `<html>` by the toggle) hides
  the 2D art/POIs/name of 3D-native bodies (`.inst.n3d` / `.body.n3d`) so there's no double image — the
  3D overlay draws them — while the `.inst` stays as the transparent hit target and 2D elements
  (images/spirals/text/sectors) render normally. The player **Console** shares the same `wireToggle`, so
  its 3-way toggle + hybrid work identically. Verified headless: Studio hybrid hides the planet's 2D art
  (opacity 0) but keeps the image's art (opacity 1) and the body clickable; Console hybrid = overlay
  mode, `pointer-events:none`, native art hidden; 0 errors.
- **Slice 4 — Doc to completed + QA.** ✅ End-to-end verified headless across Studio and Console: 2D →
  3D → Hybrid → 2D cycles cleanly; in Hybrid the transparent 3D overlay renders only the 3D bodies
  camera-locked to the 2D view (target = 2D centre after a pan), the 2D layer keeps images/spirals/text/
  sectors managed, and native bodies' 2D art is hidden to avoid doubling; 0 console errors. Doc moved to
  `completed/`.

### Status: COMPLETE (Slices 0–4 shipped) — 2D map + transparent camera-locked 3D overlay, in Studio and Console.
