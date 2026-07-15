# Star editor — per-part colours, brightness, glow-breathing & sun rays (2D + 3D)

**Goal (per the DM):** fully edit stars in **both** the 2D and 3D viewers. Control **different colours,
brightnesses, glow effects, glow "breathing", and sun rays**, and — the key ask — colour the **three
parts of a star independently**: the **core**, the **immediate glow/corona** around it, and the
**diffused light** emanating outward. Make it look cool.

## Current state

- **2D `art()` star** (`map-studio.html`, `if(k==="star")`): a 3-layer SVG — an outer corona
  radial-gradient (colour `c3`, a `breathe` CSS pulse), spinning ray lines (`c3`), and an inner body
  disc (white→`c1`). Colours come from `STAR_TYPES[stype] = [c1,c2,c3]` (c2 is currently unused for
  stars). The only star controls are a **class** preset + a **rays** checkbox.
- **3D `buildStarModel`** (`planet3d-model.js`): body (white-lerped `c1`) + a fresnel glow shell
  (`c1`) + a corona sprite (`c1`) + a rotating ray sprite (`c3`), with a fixed-rate pulse. Reads
  `cfg.c1`/`cfg.c3`/`cfg.spin`/`cfg.seed`.
- Stars are `kind:"star"` assets/instances; the look carries `stype`, `c1`, `c2`, `c3`, `rays`.

## The model — three parts + effects

Repurpose the existing three colour slots as the three **parts** (backward-compatible with the
`STAR_TYPES` presets, which already supply all three):

- **`c1` = Core** — the bright central body.
- **`c2` = Glow** — the immediate corona/glow hugging the core. *(currently unused for stars → now
  meaningful.)*
- **`c3` = Diffuse** — the diffused light + sun rays emanating outward.

Plus effect params on the star's look (all optional, sensible defaults so old stars still render):

```js
{ stype, c1, c2, c3, rays,               // existing
  brightness: 1,          // 0.3–2 overall intensity (opacity/emissive scale)
  coronaSize: 1,          // 0.5–2 how far the diffuse halo reaches
  breathe: { on: true, speed: 1, depth: 0.12 },   // glow "breathing" pulse
  raySpec: { count: 14, length: 1, intensity: 0.5 } }  // sun-ray look (when rays on)
```

## Slices

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — Config + 2D render.** ✅ Star look defaults added in `newAsset` (`brightness`,
  `coronaSize`, `breathe{on,speed,depth}`, `raySpec{count,length,intensity}`) and persisted through
  `snapshotLook` (deep-cloned). The 2D `art()` star was rewritten into the three parts: a **core** disc
  (`c1`, white→c1), an **immediate glow** gradient (`c2`), a **diffuse** halo + **sun rays** (`c3`,
  reach = `coronaSize`, rays from `raySpec`). `brightness` scales the glow/diffuse/ray opacities; glow
  **breathing** uses a per-star `@keyframes` honouring `speed` (duration) and `depth` (scale+opacity),
  toggleable via `breathe.on`. Presets still seed all three colours. Verified headless: a star renders
  three distinctly-coloured layers (core/glow/diffuse), a per-id breathe keyframe at the right speed, a
  ray count matching `raySpec`, and the effect fields persist; 0 errors.
- **Slice 2 — 3D render.** ✅ `buildStarModel` rewritten to the three parts: **body** = `c1` (core,
  pushed toward white by brightness), a **fresnel glow shell + corona bloom sprite** = `c2` (immediate
  glow), and a wide **diffuse halo sprite + rotating ray sprite** = `c3` (diffuse). `brightness` scales
  the shell/sprite/ray opacities; `coronaSize` sizes the glow/diffuse reach; `breathe{on,speed,depth}`
  drives the corona pulse (off = steady); `raySpec{count?,length,intensity}` sizes/opacities the rays,
  and `rays:false`/count 0 omits the ray sprite. Verified headless: a star with three distinct colours
  promotes to a model whose corona=glow, diffuse+rays=diffuse; a `rays:false` star has no ray sprite; 0
  errors.
- **Slice 3 — Star editor UI.** ✅ The `kind==="star"` object-editor branch now exposes the full control
  set: the shared colour pickers are relabelled **Core / Glow / Diffused** for stars; the class presets
  still seed all three at once; and new controls add **Brightness** and **Corona size** sliders, a **Glow
  breathing** toggle + speed + depth (collapsible), and **Sun rays** toggle + count + length + intensity
  (collapsible). All write to `edWork` (with `breathe`/`raySpec` defaults filled for older stars) and
  live-preview into the 2D `art()` swatch; they persist on the look via `snapshotLook` (brightness,
  coronaSize, rays, deep-cloned breathe/raySpec). Verified headless: all 12 star controls render, the
  Core/Glow/Diffused labels are present, and editing brightness/ray-count/breathe-depth updates `edWork`
  and re-renders the preview; 0 errors. *(The open 3D viewer reflects on save/placement via the existing
  3D refresh, since the editor tunes a library asset rather than a placed instance.)*
- **Slice 4 — Console parity + QA.** ✅ Verification caught that the Console's `art()` still had the
  **old** single-part star (no `c2` glow, no per-id breathe keyframe, fixed 14 rays), so it was replaced
  with the same three-part renderer as the Studio (CORE `c1` / GLOW `c2` / DIFFUSE+rays `c3`, brightness,
  corona size, `breathe` and `raySpec`). End-to-end QA on a star with three distinct colours + brightness
  1.6 + corona 1.4 + breathing (speed 1.5, depth 0.3) + 20 rays: Studio and Console `art()` now produce
  **identical** output (core/glow/diffuse present, a `bstar<id>` breathe keyframe, 40 ray elements —
  `parity: true`), and the shared 3D `buildStarModel` builds the three-part model (3 sprites + 2 meshes);
  0 errors. Doc moved to `completed/`.

## Considerations
- **Backward compatible:** old stars (just `stype`+`c1/c2/c3`) render unchanged via the defaults; the
  `STAR_TYPES` presets still work and now also fill the Glow slot meaningfully.
- **Shared renderers:** `art()` and `buildStarModel` are used by Studio and Console alike, so a single
  implementation covers every viewer (2D, 3D, hybrid, player Console).
- **Perf:** the 2D star is pure SVG (CSS-animated); the 3D star is a handful of sprites/meshes — both
  cheap. `breathe.off` disables the per-frame pulse entirely.
- **Cool factor:** allow the diffuse halo + rays to extend well beyond the body (`coronaSize`), use
  additive blending in 3D, and let brightness push the core toward white for a hot look.

### Status: COMPLETE (Slices 0–4 all shipped)
