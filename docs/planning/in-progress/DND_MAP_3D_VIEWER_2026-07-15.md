# Real-time 3D map viewer + a flicker-free 2D viewer for the Stardust map

**Goal (per the user):** two things, built to work together.

1. **Fix the 2D sprite animation** — the baked `.planet3d` planets' **atmosphere flickers badly**.
   Increase frame sampling by **≥4×** and do **frame smoothing correctly**, so the rotation is
   buttery and the atmosphere never flickers. This stays the default, dependency-free path.
2. **Add a real-time 3D viewer** — render the *actual* 3D planet models live (from their saved
   recipe), **not** baked frames. In this space we can insert **2D objects (images, HTML/CSS, text)
   AND 3D objects**, **grab / move / resize / rotate** everything, and still **scale and edit the 3D
   planet models**. It must *feel like a 2D map viewer* (pan/zoom, top-down-ish) whose one special
   power is rendering the 3D models perfectly. A **2D ⇄ 3D toggle button** switches the viewer.

Both viewers render the **same map data**; the toggle just changes how it's drawn.

---

## 1. Root cause of the atmosphere flicker (investigated)

- The atmosphere is an **additive, `BackSide` fresnel-rim `ShaderMaterial`** on a sphere at `R*1.14`
  (`atmoMat`, `AdditiveBlending`, `depthWrite:false`, `f = pow(1-|dot(N,V)|, 2.4)`). It is a thin,
  **high-contrast** bright rim against black space. In the **live** WebGL model it is clean — it does
  **not** z-fight (larger shell, `depthWrite:false`).
- The flicker is a **baked-sprite playback artifact**, from two compounding effects:
  1. **Cross-fade double-rim.** `SpriteSpinner._draw` blends frame *i0* at α=1 with frame *i1* at
     α=`frac`. The bright rim sits at slightly different angles in the two frames, so playback shows
     a **doubled rim whose brightness pulses** as `frac` sweeps 0→1 → the "really bad" flicker.
  2. **Spatial aliasing** of a ~1px hot rim when a 200px frame is downscaled; sub-pixel shifts per
     frame shimmer. (Half-texel inset + `imageSmoothingQuality:'high'` already help but can't fully
     fix a 1px additive hotline that moves every frame.)
- **Conclusion:** more frames alone is not enough — we must also stop the naïve playback cross-fade
  from overlaying two high-contrast rims. The real fix is to **bake the smoothing in** (temporal
  supersampling / motion-blur per frame) and play clean, and to **feather the rim** so it isn't a
  1px hotline. The live 3D viewer (Track B) sidesteps all of this — it never bakes.

---

## 2. Track A — flicker-free 2D viewer (the immediate fix)

Keep the dependency-free 2D canvas map. Fix flicker at the **bake**, not just at playback:

- **4× frame sampling.** Default frames 24 → **96** (configurable, cap ~120). Per-frame angular step
  drops from 15° to 3.75°, so the rim barely moves between frames.
- **Temporal supersampling (motion-blur bake).** For each output frame, render **K=3–4 sub-steps**
  across that frame's angular slice and **average** them into the cell (accumulate with `globalAlpha
  = 1/K` onto an offscreen, then copy). This *bakes the smoothing in* — adjacent frames already blend
  motion, so playback needs **no cross-fade**, which removes the double-rim entirely.
- **Play clean.** With 96 motion-blurred frames, `SpriteSpinner` advances by exact fps with **no
  cross-fade** (or a tiny, capped one). Keep `imageSmoothingQuality:'high'` + half-texel inset.
- **Feather the rim.** Soften `atmoMat` (raise fresnel feather / lower peak, or add a small blur band)
  so the baked rim is a gradient, not a 1px hotline — dramatically less shimmer at any zoom.
- **Keep spatial SSAA** (already 2× at bake; consider 2–3×).
- **Storage consideration (new).** A 96-frame 200px sheet is a **2000×2000 PNG** (~1–4 MB as a data
  URL) *per planet*. Inlining that in `dnd_maps.data` (jsonb) bloats rows fast on busy maps.
  **Decision:** upload baked sheets to the **`dnd-media` bucket** (like map images) and store a URL,
  not an inline data URL. Old inline sheets keep working.
- Expose a **Frames** and **Smoothing (motion-blur)** control in the generator so the DM can trade
  size vs. smoothness.

---

## 3. Track B — the real-time 3D viewer

A single WebGL scene that renders the whole map in 3D, driven by the same map data, that *behaves
like the 2D viewer* but renders true 3D models.

**Renderer & camera**
- **One** `THREE.WebGLRenderer` for the entire scene (never one context per object — browsers cap
  live WebGL contexts). Lazy-loaded only when 3D is toggled on.
- **OrthographicCamera by default** so the map keeps its flat, 2D-like feel (no perspective warp),
  with **OrbitControls**: wheel = zoom, drag = pan (map-like), optional modifier-drag = orbit/tilt to
  appreciate the 3D. A **"Flatten / top-down"** reset returns to the 2D-equivalent view. Pan/zoom
  state maps to the 2D `view` so toggling 2D⇄3D keeps your place.

**3D planets (the point of it all)**
- **Reconstruct the live model from the saved `config`** (already stored in every `.planet3d`).
  Extract the planet-building code (geometry + terrain/ocean/cloud/atmosphere/night/ring shaders)
  from `planet-3d.html` into a shared module **`planet3d-model.js`**, used by *both* the generator and
  the 3D viewer. Same seed/config → identical planet.
- **Fallback:** a planet with no config (older asset) renders as its **baked sprite on a billboarded
  plane** so nothing is lost.
- Planets **spin live** (their stored spin speed), lit consistently — no frames, no flicker, ever.

**Inserting objects (2D + 3D) in the 3D space**
- **Images** → textured `PlaneGeometry` (flat) or billboard `Sprite` (always-facing). Toggle per
  object.
- **Text / rich labels** → reuse `labelSVG` rasterized to a texture on a plane, **or** crisp DOM via
  the CSS3D layer (below). Text keeps all current controls (font/size/effects/curve/rotate).
- **HTML / CSS** → a **`CSS3DRenderer`** layer composited over the WebGL canvas renders real DOM in
  3D space. New object kind **`html`** storing sanitized markup/CSS.
- **3D objects** → planets (above); design allows future glTF/primitive inserts.

**Full transform control**
- **`TransformControls`** gizmo with translate / rotate / scale modes (keyboard `G/R/S`), snapping
  with a modifier. Dragging writes back to the object's transform in the schema (see §4). This is the
  "grab and move things around and resize them and rotate" requirement, done natively.
- Selecting an object shows the **same inspector** (name/label/effects/size) as 2D; a **3D planet**
  also exposes its **config controls** (reuse the generator's control set) to **edit the model live**
  — tweak sea level, atmosphere, colors, etc., and rebuild the mesh in place.

**Toggle**
- A **2D ⇄ 3D toggle** in the Map Studio top bar (and, later, the Console). It swaps the active render
  surface; the 2D canvas/label layers hide, the WebGL+CSS3D layers show (and vice-versa). State is
  shared, so edits in one appear in the other.

---

## 4. Shared data model & sync

- `stardust-map` (2D) stays **authoritative** for `x, y, size`. Add an **optional** per-instance
  `t3d` transform: `{ z, rx, ry, rz, sx, sy, sz }` (defaults derived from 2D: on the z=0 plane,
  scale from `size`). The 2D viewer ignores `z`/rotation; the 3D viewer honors them.
- New/kept object **kinds**: `planet3d`, `image` (exists), `text` (exists), **`html`** (new),
  plus all existing 2D bodies/sectors (rendered flat in 3D on the ground plane).
- Editing rules: moving/scaling in **2D** updates `x/y/size`; in **3D** updates `t3d` (and `size` for
  uniform scale). A change in one space is visible in the other on toggle. Everything persists through
  the existing save/publish → `dnd_maps.data` path (plus sheets in Storage per §2).
- **Undo/redo** integrates with the existing history stack for both spaces.

---

## 5. Considerations the user didn't call out (but matter)

- **Three.js delivery.** Vendor Three + `OrbitControls`/`TransformControls`/`CSS3DRenderer` **locally**
  under `public/dnd/maps/vendor/` (no CDN/CSP surprise, works offline), **lazy-loaded** only on 3D
  toggle (~600 KB). The generator can migrate to the same vendored copy.
- **Performance / LOD.** A map may hold dozens of planets; live shader spheres for all is heavy.
  Strategy: render **near/selected** planets as full shader models, **distant** ones as baked-sprite
  billboards; shared geometry, frustum culling, lower segment counts at scale, and a **quality
  setting**. Cap concurrent live planets.
- **CSS3D ⇄ WebGL occlusion.** The CSS3D layer composites *above* WebGL (HTML can't be occluded by a
  planet in front). Acceptable for a 2D-like viewer; documented, and we keep HTML objects for
  annotations/overlays rather than mid-scene props.
- **XSS / safety of inserted HTML/CSS.** DM-authored HTML is shown to **players** too. Sanitize
  (allowlist) or render inside a **sandboxed iframe**; never inject raw markup into the app DOM.
- **Mobile / low-end GPU.** If WebGL is unavailable or slow, the toggle **stays/reverts to 2D**
  gracefully (2D is always the safe default).
- **Console (player) parity.** The 3D viewer should be available to players too (default 2D, 3D
  opt-in), sharing `planet3d-model.js`, with the perf guards above.
- **Determinism.** Config→model rebuild is seed-deterministic so the live 3D matches the baked 2D.
- **Bake stays useful.** Even with the 3D viewer, keep baking sheets (Track A) — they're the
  dependency-free default and the 3D fallback.

---

## 6. Architecture decisions

- **A — Two renderers, one model.** 2D canvas engine (existing) and a new 3D `WebGLRenderer` +
  `CSS3DRenderer`, both reading/writing the same `stardust-map`. A toggle swaps which is live.
- **B — Shared `planet3d-model.js`.** Extract the planet shader/mesh builder from the generator so the
  generator, the 3D viewer, and (future) the console all build identical planets from `config`.
- **C — Fix flicker at the bake, not playback.** Motion-blur bake (temporal SSAA) + 4× frames + rim
  feather; play clean (no double-rim). Independent of the 3D viewer and shippable first.
- **D — Sheets to Storage.** Large baked sheets go to the `dnd-media` bucket; the row stores a URL.
- **E — Vendor Three locally, lazy-load.** Reliability + offline + no CSP issues; only paid for in 3D.
- **F — 2D authoritative, `t3d` optional.** Non-breaking schema extension; 2D maps still open.

---

## 7. Implementation slices (commit plan)

**Track A first (immediate flicker relief), then Track B incrementally.**

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — Rim feather + motion-blur bake + 4× frames.** In `planet-3d.html` `renderSheet`: raise
  default frames to 96 (control up to ~120), render K sub-steps per frame and average (temporal SSAA),
  soften the atmosphere rim. Switch `SpriteSpinner` playback to clean stepping (no double-rim) while
  keeping high-quality smoothing + inset. Verify headless: no pulsing rim, smooth loop.
- **Slice 2 — Baked sheets to Storage.** ✅ Upload sheets to `dnd-media`; store URL; keep inline
  sheets working. Wire through the maps API. (Prevents jsonb bloat from 4× frames.)
  Done server-side in the maps `POST` (built-map branch): a recursive `deinlineDataUrls` walks the
  stardust-map and replaces any embedded `data:image/…` blob ≥ 40 KB (baked planet sprite-sheets,
  spingalaxy images, backgrounds) with a public bucket URL, keyed by SHA-256 content hash so
  re-saving the same sheet reuses the object (no dupes). Small blobs (icons, tiny SVGs) stay inline;
  already-URL sheets are untouched (idempotent); any storage failure falls back to keeping the blob
  inline so a save never fails. The static tool is unchanged — it keeps editing with data URLs
  locally, and de-inlining happens once at campaign save. `SpriteSpinner.setSheet`/`art()` already
  load sheets from URLs (display only, so cross-origin tainting is irrelevant). Verified: `tsc` +
  eslint clean; parsing/threshold/dedupe checked against real PNG/SVG/URL inputs.
  *Deferred (one-liner):* per-map cleanup of embedded blobs on map delete — they're content-hashed
  and may be shared across maps/versions, so safe GC needs reference counting; low value vs. cost,
  left for a later sweep.
- **Slice 3 — Vendor Three locally.** ✅ Downloaded Three.js **0.160.0** + the addons the viewer needs
  (`OrbitControls`, `TransformControls`, `CSS3DRenderer`) into **`public/dnd/maps/vendor/three/`**
  (~1.35 MB) and repointed the generator's importmap at them, so the 3D engine loads **same-origin,
  offline, and CSP-free** — no CDN dependency. **Gotcha found & fixed:** this Chromium rejects a
  *relative* importmap address without a `./` prefix; used **absolute** `/dnd/maps/vendor/…` (matches
  how the rest of the app references these assets). Verified over HTTP: the generator fetches the
  vendored module (200), creates a WebGL context, and renders a live planet headless (screenshot) —
  which also proves the sandbox can render/verify WebGL for the later 3D slices.
  **Re-scoped:** the `planet3d-model.js` extraction moves to **Slice 5**, where the live-planet
  viewer actually consumes it — extracting the shader/texture builder now would ship untested dead
  code; doing it at point-of-use lets it be verified by a real render.
- **Slice 4 — 3D scene + camera + toggle.** ✅ New module **`public/dnd/maps/map3d.js`** (`window.Map3D`):
  one WebGL scene with an **OrthographicCamera** (map-like, no perspective warp) + **constrained
  OrbitControls** (left-drag pan, wheel zoom, right-drag tilt up to ~flat; top-down by default), an
  ambient **starfield**, and a body group. Bodies render as flat discs on the z=0 plane at their 2D
  positions (2D→3D maps `(x,y)`→`(x,-y,0)`) — proving the pipeline; real planet meshes are Slice 5.
  A **⛶ 3D / ▢ 2D toggle** in the Map Studio toolbar (the module wires itself) hides the 2D layers
  and shows the WebGL surface, and back. Three is the vendored copy via the importmap; lazy-loaded on
  first toggle. **Two bugs found & fixed:** `#gl3d` must sit at z-5 (above the map layers z1–4, below
  the toolbar z-6, or it ate the toggle click); and the camera must be **framed after the container
  is visible** (framing while `display:none` gives `clientWidth=0` → degenerate zoom → blank scene) —
  bounds are stored and `_frameBounds()` runs in `show()`, zoom clamped. Verified over HTTP: toggle
  mounts a WebGL context, 3 discs render at the right spots (screenshot), 2D hides then restores,
  zero errors. View-only for now (TransformControls = Slice 6).
- **Slice 5 — Live 3D planets (incl. `planet3d-model.js` extraction).** ✅ New shared module
  **`public/dnd/maps/planet3d-model.js`** — a faithful port of the generator's planet pipeline
  (noise/fbm/warp, `TYPES`, `genPlanet` surface+spec, `genCity` night lights, `genStorms`/`genClouds`,
  atmosphere fresnel shader, ring) exposing **`buildPlanetModel(config, opts)`** →
  `{ group, update(dt, sunDir), dispose }`. `map3d.js` now builds a **real spinning 3D planet mesh**
  for every `planet3d` instance whose config resolves (from `look.cfg3d`, else its source asset),
  scaled to the 2D size and driven live in the render loop; non-planets and any beyond the
  **`MAX_LIVE_PLANETS=16` LOD cap** fall back to flat discs. `snapshotLook` now carries `cfg3d` so
  placed planets keep their recipe. Verified over HTTP (software WebGL): a terran `planet3d` builds a
  4-mesh model (surface+night+clouds+atmosphere), spins in real time, zero errors — screenshot shows
  a live world with continents/oceans/clouds/atmosphere, *no baked frames*.
  *Deferred (one-liners):* (a) the animated **lightning** storm-flash layer — rarely used, heavy, and
  additive over the cloud layer; low value vs. port cost, left as a follow-up. (b) **De-duping the
  generator** to consume this module — the module is a faithful copy so they match today; refactoring
  the working generator now risks destabilising it for no user-visible gain, so it's a later cleanup.
- **Slice 6 — TransformControls + inspector sync.** ✅ Every body now lives in a **holder Group**
  whose transform *is* its 2D transform (position = centre, `scale·2` = size, rotation = `t3d`), so one
  **TransformControls gizmo** moves/rotates/scales any body uniformly. Click-to-select (raycast, with
  a drag-vs-click threshold so panning still works), **G/R/S** switch translate/rotate/scale, **Esc**
  deselects; an on-canvas hint lists the keys. A small bridge in the Map Studio classic script
  (`window.map3dSelect` / `map3dBeginEdit` / `map3dApply`) lets the gizmo **write back to the live
  `state`** — moves/scales update `x/y/size`, rotation stores `t3d` — mark the map dirty, push one
  undo checkpoint per drag, and **sync the 2D inspector** to the selected body. Editing doesn't rebuild
  the scene (the holder is the live object), so it stays smooth; the next toggle re-reads the patched
  state. Verified headless: select attaches the gizmo, a move+scale+rotate writes back `x/y/size/t3d`
  exactly, deselect detaches, zero errors.
  *Deferred (one-liner):* **live planet-shape config editing** in the viewer (re-running the shader
  build on slider changes) — that's essentially embedding the generator's control panel; high cost,
  and the DM can already edit a world in the 3D generator and re-import. Left as a follow-up.
- **Slice 7 — Insert 2D objects in 3D.** ✅ *(images, text, and HTML all shipped)*
  - **Images ✅** — `kind:'image'` instances now render as **aspect-correct textured planes**
    (`_imagePlane`: aspect from `natW/natH`, `TextureLoader` with a placeholder tint until the texture
    loads, error-tolerant), inside the same holder so they move/scale/rotate with the gizmo like any
    body. Verified: a 2:1 image builds a `PlaneGeometry` (aspect 2.00), texture loads, selectable,
    zero errors.
  - **Text ✅ (via CSS3D)** — added a **`CSS3DRenderer`** overlay (shares the ortho camera, composited
    above the WebGL canvas, `pointer-events:none`) plus a `cssScene`. Free `text` objects now render as
    **crisp DOM elements** styled from their `LabelStyle` (font stack, size, weight, italic, colour,
    tracking, uppercase, glow/shadow via `text-shadow`, outline via `-webkit-text-stroke`, z-rotation),
    positioned in world space — so they scale/pan with the scene and read identically to the 2D
    labels. View-only in 3D for now (edited in 2D). Verified: text mounts into the CSS3D DOM with the
    right content/size/rotation, zero errors. This also lays the renderer the `html` kind will reuse.
  - **HTML/CSS `html` kind ✅** — new **▤ HTML** tool drops an `html` object (default markup) that
    renders inside a **sandboxed `<iframe srcdoc>`** (empty `sandbox` = no scripts/same-origin/forms)
    both on the 2D map and in the 3D CSS3D layer, so arbitrary HTML+**CSS** renders **safely** for
    players; a shared `sanitizeHtml`/`htmlFrameSrcdoc` (labels.js) strips `<script>` as defence in
    depth. The card inherits the 2D engine's drag / corner-scale / rotate / select, plus an inspector
    (HTML/CSS textarea + width/height). Verified: `<script>` is stripped and never executes
    (`window.__pwn` unset), the iframe is `sandbox`ed, CSS survives, and it renders in both 2D and the
    3D CSS3D layer — zero errors. *(HTML cards are edited in 2D; in 3D they're view-only, like text.)*
- **Slice 8 — Console parity + real-time + polish.** ✅ The player **Console** now has the same
  **⛶ 3D / ▢ 2D** toggle and viewer (vendored Three via importmap; `map3d.js` reused). `map3d.js`
  gained a **read-only mode** — with no `map3dApply` bridge it builds **no TransformControls**, so
  players can pan/zoom/orbit but not edit (verified `editable:false`, no gizmo); the layers it hides
  are host-declared via `#gl3d[data-hide]` (`bgLayer stage fxCanvas` for the console). The console
  exposes `window.mapData`/`map3dSelect` (a 3D pick drives the CRT readout). **Real-time updates:** the
  console **polls the published map every 8 s** (light list check on `updated_at`, full fetch only on
  change) and re-renders **both 2D and, if the player is in 3D, the live 3D scene** — so DM edits and
  publishes reach players automatically. Verified over HTTP: players load the published map, toggle to
  a live 3D planet (read-only), 2D hides, zero errors — screenshot confirms a full living world in the
  player Console.

- **Slice 9 — Deep-space FX (per user):** 🔶 *(parallax stars done; shooting stars + nebula remaining)*
  - **9a Parallax starfield ✅** — replaced the flat single-layer field with **three star layers** at
    different depths, each following the camera pan by its own factor `k` (far `0.72` → near `0.28`),
    so panning slides the layers past each other (true parallax) and orbit/tilt shows their real
    z-separation; constant screen-size points add a zoom depth-cue. Per-star **vertex colours** (mostly
    cool white with occasional warm/blue stars), varied size/brightness per layer. Verified: 3 layers,
    a pan shifts far 720 vs near 280 (distinct parallax), coloured, zero errors.
  - **9b Shooting stars ✅** — a pool of 7 **additive coloured meteors** (`_buildShooters`/
    `_updateShooters`): each spawns on its own random timer, streaks in a random direction at a
    view-scaled speed, and is a short line with a **bright colour-picked head → transparent tail** that
    fades in and out over ~0.6–1.3 s, then recycles with a fresh delay. Six-colour palette
    (teal/magenta/gold/blue/lime/orange). Verified: spawns, coloured head, dark tail, recycles, zero
    errors.
  - **9c Nebula / gas — remaining:** volumetric-looking gas clouds (layered soft additive sprites /
    noise) that read as real gas.

- **Slice 10 — Many small bodies + 3D stars (per user):** render planets at **very small scale** so a
  whole system (planets, moons, suns, stations…) fits one map — needs an **LOD** path (tiny on-screen
  bodies → impostor/sprite, real mesh only when large/near, and a much larger MAX-live budget via
  impostors) and/or a bigger world. Plus a **3D star model** generator — glowing star spheres with
  **coronae, flares, varied colours and effects** — so `star` bodies render as real 3D suns, not discs.
  *(Added from a follow-up request.)*

Each slice: verify (headless WebGL render where relevant) + `tsc`/`vitest` unaffected, commit, push,
annotate this ship log. Seed/DB changes ship as seeds the DM applies.

---

## 8. Build notes / ship log

- **Slice 0 — Planning doc** ✅. Root-caused the atmosphere flicker to the sprite cross-fade
  double-rim + rim aliasing (live model is clean); confirmed `.planet3d` already stores the full
  `config`, so live 3D reconstruction is feasible.
- **Slice 1 — Flicker fix (playback + bake)** ✅ —
  - **Playback true cross-dissolve** (both `SpriteSpinner` copies): the merged interpolator drew
    frame *i0* at α=1 then *i1* on top, leaving **both** bright atmosphere rims visible at once → the
    pulsing double-rim. Changed *i0* to α=**1−frac** so the frames genuinely cross-dissolve and total
    brightness stays ~constant. **Fixes existing 24/72-frame planets with no re-bake.** Verified
    headless: at frac 0.5 the pixel is a real blend of both frames (`[85,170,0]`), not red-dominant.
  - **Motion-blur bake** (`renderSheet`): each output frame is now the **average of SUB=4
    micro-rotations** across its angular slice (running-average via source-over α=1/(k+1)). This is
    the requested "4× the frame sampling, smoothed together really well" — 72 frames × 4 sub-samples
    = **288 angular samples** — *without* quadrupling sheet size (storage stays put; deferred bloat
    avoided). The atmosphere rim is smeared across each slice instead of snapping.
  - **Rim feather**: softened the atmosphere fresnel exponent (2.4 → 2.0) so the rim is a gentle
    gradient, not a 1px hotline — far less aliasing at any zoom, and it looks good.
  - Kept seamless clouds (whole-turn wrap), 2× spatial SSAA, high-quality smoothing + half-texel
    inset. Frames slider already 72/max-180 (main). Verified: both viewers run error-free; the bake
    parses (WebGL bake itself needs an online Three.js, which the DM has in the browser).
  - *Note:* the flicker fix ships fully here; re-baking a planet applies the motion-blur + softer rim,
    while the cross-dissolve already improves every previously-baked planet immediately.
