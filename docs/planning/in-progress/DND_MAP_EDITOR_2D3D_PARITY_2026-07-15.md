# Consolidated 2D⇄3D object editor with full edit parity

**Goal (from the DM):** for every object that can be placed on the map (planets, moons, satellites/moons,
stars/suns, stations/satellites, debris, asteroids, galaxies, images/spirals, text), the editor for an
**already-placed** object should be **switchable between the 3D editor and the 2D object editor**, and the
two must be **consolidated** so that:

1. **Every editing feature in the 3D editor has a totally equivalent feature in the 2D editor** (and
   vice-versa) — one control set, one config.
2. **The edits actually affect each other**: changing a slider/toggle/option updates *both* the 3D and the
   2D representation of the same object, each in its own idiom. Example the DM gave: turn on **lightning
   strikes** for a 3D planet and set the **strike rate** → the 2D version also gets a **lightning animation
   at the same frequency**.
3. In the object/planet/moon/etc. **viewer** you can flip that object between **2D and 3D**, and it stays the
   same object with the same edits applied.

This doc **catalogues every 2D and every 3D edit option** for every placeable object, maps each to its
cross-dimension equivalent, calls out the **parity gaps** to close, and lays out the build in slices.

---

## Current architecture (why the gap exists)

There are **two parallel object-config paths** today:

- **Path A — `planet3d` kind (rich generator).** A dedicated WebGL generator `planet-3d.html` (opened in a
  popup via `openPlanet3DEditor`, `map-studio.html:1028`) produces a rich `cfg3d` recipe (terrain noise,
  clouds with drift/swirl/banding, storms, lightning, ring, atmosphere, city, sun/tilt/spin). It is baked to
  a rotating sprite-sheet for the **2D fallback** and rendered live by `buildPlanetModel` (`planet3d-model.js`)
  in **3D**. Config lives on `instance.look.cfg3d`.
- **Path B — `planet`/`moon`/`star`/`station`/`debris`/`asteroid`/`galaxy` kinds (studio inspector).** Edited
  by the studio's own `openEditor()` (`map-studio.html:1888`), which writes a **flat "look"** field set
  (`c1/c2/c3`, `ptype`, `ring`, `cloudStyle`, `atmo*`, `lava`, `city`, `destroyed*`, star `brightness`…).
  The **2D SVG art** is `art(look)` (`map-studio.html:652`); the **3D** is built by `map3d.js` either mapping
  the look to a planet config via `_genericPlanetCfg()` (`map3d.js:719`, which **hardcodes** terrain
  `sea/cscale/coast/ice`) or passing `look` straight into `buildStarModel`/`buildStationModel`/
  `buildAsteroidModel`/`_debrisModel`.

**So the same visual object has two different config shapes and two different editors, and the 3D scene
renders a Path-B planet from a *derived, mostly-defaulted* config** — the rich terrain/cloud/storm/lightning
knobs only exist on the `planet3d` popup side. That is the consolidation target.

Live-apply already works both ways: every studio edit calls `markDirty()` → `pushTo3D()` (debounced,
`map-studio.html:2181`) → `Map3D.setData(mapData())`, and the whole-map viewer already has a 2D/3D/Hybrid
toggle (`#view3dBtn`). What's missing is (a) **one shared config** honored field-for-field by both renderers,
(b) the **rich controls in the consolidated editor**, and (c) a **2D⇄3D preview switch inside the editor**.

---

## THE CATALOGUE — every edit option, 2D vs 3D, per object

Legend: **2D** = honored by `art()` (`map-studio.html`) / `console.html`; **3D** = honored by the
`planet3d-model.js` builders via `map3d.js`. ✅ = present, ⚠ = present but derived/defaulted, ✗ = missing
(a parity gap to close).

### PLANET (`kind:"planet"`) — the widest gap
| Field | 2D | 3D | Notes / parity action |
|---|----|----|----|
| `ptype` (terran/ocean/jungle/desert/ice/volcanic/toxic/barren/gas/rock/exotic) | ✅ palette+detail | ✅ `type` (rock→barren) | ok |
| `c1/c2/c3` palette | ✅ | ✅ (via `TYPES` palette) | 3D uses fixed palette per type; **action:** let c1/c2/c3 tint the 3D material |
| `seed` | ✅ | ✅ | ok |
| `sea` (water level) | ✗ | ⚠ hardcoded 0.5 in `_genericPlanetCfg` | **action:** read from look in 2D shading + 3D cfg |
| `cscale` (continent scale) | ✗ | ⚠ hardcoded 2.2 | **action:** read from look; 2D = blob frequency |
| `coast` (coastline definition) | ✗ | ⚠ hardcoded | **action:** read; 2D = land/sea edge hardness |
| `ice` (ice caps) | ✗ | ⚠ hardcoded | **action:** 2D = polar white caps; 3D read from look |
| `ring` | ✅ arcs | ✅ ring mesh | ok; unify `ringColor`/`ringW` (2D lacks width/color) |
| `atmo` on | ✅ rim | ✅ shell | ok |
| `atmoColor` | ✅ | ✅ | ok |
| `atmoThick`/`atmoDensity` | ✅ (thick) | ✅ (density) | **action:** one field drives both |
| clouds: `cloudStyle`(2D enum) vs `cloudCov/cloudOpacity/cloudScale/cloudDetail/cloudDef/cloudSwirl/cloudBand/cloudBandN/cloudShear`(3D) | ✅ coarse enum + amount | ✅ rich | **action:** unify — 2D enum ⇒ derived numeric cloud params; expose the rich cloud sliders and give 2D animated equivalents (drift/swirl/banding) |
| `cloudColor`/`cloudTint` | ✅ | ✅ | unify field name |
| `cloudSpd` (drift speed) | ⚠ fixed | ⚠ fixed | **action:** honor a shared drift-speed field (2D CSS pan rate = 3D drift) |
| `storms`, `stormI` | ✗ | ✅ (in cfg) | **action:** 2D animated storm swirl at same count/intensity |
| **`lightOn`, `lightRate`, `lightColor`(bolt)** | ✗ | ✗ (defined in cfg but NOT rendered by `planet3d-model.js`, header note ln 11–12) | **the DM's headline example** — build lightning in BOTH: 2D animated flashes at `lightRate`, 3D animated bolt layer at the same rate |
| `city` (night lights) | ✅ clusters | ✅ shader mask | ok |
| `lightColor` (city) | ✅ | ✅ | **name clash** with lightning bolt color — rename city one to `cityColor` |
| `destroyed` (none/split/chunk/holed/cored/fractured) | ✅ overlay | ✅ cataclysm mesh | ok |
| `destroyI` | ✅ | ✅ | ok |
| `sun` (light azimuth) | ✗ | ⚠ scene-supplied | 2D has a fixed terminator; **action:** optional — honor `sun` as 2D terminator angle |
| `tilt` (axial tilt) | ✗ | ⚠ generator-only | **action:** 2D = rotate the art; 3D = tilt the mesh |
| `spin`/`spinDur`/`p3spin` | ✅ (`spinDur`) | ✅ (`spin`) | unify into one rotation-rate field |

### MOON (`kind:"moon"`)
`mtype` (rocky/icy/cratered/red) ✅2D/✅3D (→planet `ice`/`barren`). Shares the planet field set (clouds off
by default, `atmoOn:false`). **Action:** same unification as planet; expose `ice`, `lava`, `city`,
`destroyed` for moons too (already pass through in 3D).

### STAR / SUN (`kind:"star"`) — near parity already
`stype`, `c1/c2/c3` (core/glow/diffused), `brightness`, `coronaSize`, `breathe{on,speed,depth}`, `rays`,
`raySpec{count,length,intensity}`, `seed`, `spin` — **all ✅ in both 2D `art()` and 3D `buildStarModel`.**
Minor gap: 2D ray `count` is exact; 3D ray texture has a fixed 16 spokes (**action:** make 3D ray spoke
count honor `raySpec.count`). Otherwise the star is the parity template to follow.

### STATION / SATELLITE (`kind:"station"`)
`stype` (ring/wheel/hub/starfort/spire/array/drydock/derelict/husk) ✅2D distinct SVG / ✅3D distinct mesh;
`c1/c2/c3` ✅/✅; `spin` ✅(spinDur)/✅. **Gap:** 3D solar panels + window counts are fixed (no control);
2D `blink` beacons vs 3D lit windows — **action:** a shared "lights/beacon" toggle+color honored by both.

### DEBRIS / ASTEROID (`kind:"debris"`, `dtype` asteroid/field/comet/wreck; `kind:"asteroid"`)
`dtype` ✅2D branch / ✅3D routing (`asteroid`→`buildAsteroidModel`, `field`→`_debrisModel`); `c1/c2/c3`,
`seed` ✅/✅ (3D asteroid uses only c1 — **action:** honor c2/c3). `comet` tail: ✅2D / ✗3D — **action:** 3D
comet tail. `wreck`/`field` spins ✅/✅.

### GALAXY (`kind:"galaxy"`) &amp; SPINGALAXY (`kind:"spingalaxy"`)
`arms`,`turns`,`tight` ✅2D/✅3D; `spread`,`len` ✅2D / ✗3D (2D-art-only) — **action:** honor in the 3D disc
texture; `spinDur` ✅/✅; `c1/c2/c3` (arm A/B/core) ✅/✅; `seed`,`size` ✅/✅. `spingalaxy` layered
`spiral{on,rings,master,feather,...}` ✅2D (DiffSpinGalaxy) / ⚠3D (rings only) — **action:** honor master/
feather in 3D.

### IMAGE / SPIRAL / TEXT / HTML (2D-native "flat" kinds)
`image` (`src`, `imgFit`, `imgPosX/Y`, `imgSpin`, edge-fade), `spiral{on,rings,master,feather}`, `text`
(label engine), `html` — these are inherently 2D. In 3D they already render as **camera-facing planes**
(`_imagePlane`, CSS3D) that honor `imgSpin`/`spiral`. **Action:** confirm the plane honors fit/pos/fade;
no new 3D "model" needed — the plane IS the 3D equivalent.

### Instance-level (all kinds, both dimensions already)
`size`/`w`/`h`, `rot`, `opacity`, `x`/`y`, `z`/`behind`, `orbit*`, `pois[]`, `label`, `fx{sparkle,nebula,
shoot}`. Transform + fx already apply in both 2D and 3D (fx is a 2D overlay; **action:** decide whether fx
gets 3D equivalents or stays a 2D-layer concern — lean: keep fx 2D-layer, documented).

---

## The consolidation design

1. **One config per kind = a superset "look".** Fold the rich `planet3d`/generator fields (`sea`, `cscale`,
   `coast`, `ice`, the numeric cloud params, `storms`/`stormI`, `lightOn`/`lightRate`/`lightColor`,
   `tilt`, unified `spin`, `ringColor`/`ringW`, `cityColor`) into the flat `look` that every kind already
   uses. A pure **`normalizeLook(look)`** fills defaults so old objects keep working and both renderers read
   the same names. `cfg3d` (baked `planet3d`) becomes a *source* that maps into this superset, not a
   separate path.
2. **Both renderers read the superset.** `_genericPlanetCfg` stops hardcoding terrain and reads `look.sea`
   etc.; `art()` gains 2D visual equivalents for the newly-shared fields (ice caps, water shading, cloud
   drift/swirl/banding, storms, **lightning**, axial-tilt rotation). Star/station/debris/galaxy get their
   smaller parity fixes.
3. **One editor, 2D⇄3D preview switch.** `openEditor` shows the full control set for the kind; a preview
   toggle renders either the 2D `art()` or a live `buildPlanetModel`/model preview of `edWork`. Editing any
   control mutates the one `edWork` look and refreshes whichever preview is showing. Retire the popup
   generator into an "advanced" affordance (or keep it, feeding the same superset).
4. **Viewer switch stays as today** (`#view3dBtn` 2D/3D/Hybrid) — because both renderers now honor the same
   look, flipping the viewer shows the *same* edits in the other idiom automatically.

---

## Slices

- **Slice 0 — Planning doc + full catalogue** *(this file)*.
- **Slice 1 — Unified planet `look` superset + normalizer; 3D reads terrain from look.** A pure
  `normalizeLook` (defaults for `sea/cscale/coast/ice/cloud*/storms/stormI/light*/tilt/spin/ringColor/ringW/
  cityColor`); `_genericPlanetCfg` reads these from look instead of hardcoding. Verified headless: a placed
  planet's 3D terrain/ice/atmo now respond to its look fields; existing objects unchanged (defaults match
  today's constants).
- **Slice 2 — 2D lightning + storms (the DM's headline).** `art()` gains an animated **lightning** layer
  (flash cadence = `lightRate`, color = `lightColor`, gated by `lightOn`) and an animated **storm swirl**
  (count = `storms`, intensity = `stormI`), plus the studio controls for them. Same fields the 3D reads.
- **Slice 3 — 3D lightning + storm rendering.** Close the `planet3d-model.js` gap: add an animated lightning
  layer + storm cells honoring `lightOn`/`lightRate`/`lightColor`/`storms`/`stormI`, so a single edit drives
  both dimensions at the same rate.
- **Slice 4 — 2D terrain/cloud parity.** `art()` honors `sea` (water shading), `ice` (polar caps),
  `cscale`/`coast` (blob frequency/edge), and animated cloud `drift`/`swirl`/`banding` at the shared rates;
  `tilt` rotates the 2D art.
- **Slice 5 — Consolidated editor with 2D⇄3D preview switch.** `openEditor` exposes the full unified control
  set for planet/moon and a preview-mode toggle (2D `art()` ⇄ live 3D model) editing one config; bridge the
  popup generator into the superset.
- **Slice 6 — Star / station / debris / asteroid / galaxy parity passes.** Each kind's small gaps
  (3D ray-spoke count, station lights, 3D comet tail, asteroid c2/c3, galaxy spread/len in 3D, spingalaxy
  master/feather in 3D).
- **Slice 7 — Console (player viewer) parity + QA + doc → completed.** Ensure `console.html`'s cloned
  `art()` honors the new fields; end-to-end pass (edit each field, flip 2D⇄3D, confirm both change); move
  this doc to `completed/`.

## Considerations
- **Backward compatible:** `normalizeLook` defaults every new field to today's implicit value, so existing
  maps render identically until edited.
- **Deterministic-first:** all rendering is in-code SVG/WebGL from the look; no services. Seeds keep it
  reproducible.
- **Two viewers already share the look** — the win is making *every* field flow through both, so the
  existing viewer toggle "just works".
- **fx overlay** (`sparkle`/`nebula`/`shoot`) stays a 2D-layer concern for now (documented), not a per-object
  3D model feature — revisit if the DM wants 3D fx.
- **Reuse:** build on `art()`, `buildPlanetModel`, `_genericPlanetCfg`, `pushTo3D`, and the existing viewer
  toggle — don't fork them.

### Status: IN PROGRESS (Slice 0 shipped; 1–7 pending)
