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
- **Slice 1 — Config + 2D render.** Extend the star look defaults (`brightness`, `coronaSize`,
  `breathe`, `raySpec`) and rewrite the 2D `art()` star to use the three parts: **core** disc (`c1`),
  an **immediate glow** ring/gradient (`c2`), a **diffuse** corona halo (`c3`, extent = `coronaSize`),
  and **rays** (`c3`, count/length/intensity from `raySpec`). Brightness scales the layer opacities;
  `breathe` drives the corona's CSS pulse (speed/depth). Presets still seed the three colours. Verify
  headless: a star renders three distinctly-coloured layers and the breathe/rays params take effect.
- **Slice 2 — 3D render.** Rewrite `buildStarModel` to map the three parts: **body** = `c1` (core),
  **fresnel glow shell + corona sprite** = `c2` (immediate glow), **ray sprite + outer diffuse** =
  `c3` (diffuse). `brightness` scales the emissive/opacity; `breathe{on,speed,depth}` drives the pulse
  (off = steady); `raySpec` sizes/vary the rays (and `rays:false` hides them). Verify headless: the 3D
  star builds with the three colours + params; 0 errors.
- **Slice 3 — Star editor UI.** In the object editor (the `kind==="star"` branch), add: three colour
  pickers **Core / Glow / Diffused light**, a **Brightness** slider, a **Corona size** slider, a
  **Glow breathing** toggle + speed + depth, and **Sun rays** toggle + count + length + intensity (plus
  the existing class presets, which set all three colours at once). Live-preview into the 2D art + the
  open 3D viewer; persist on the look. Verify headless: editing each control updates the star.
- **Slice 4 — Console parity + QA.** The player Console renders the same star (2D `art()` + 3D
  `buildStarModel` are shared, so parity is mostly free — verify), and an end-to-end pass: build a star,
  set three colours + brightness + breathing + rays, confirm 2D, 3D, and hybrid all match and publish to
  the Console. Move this doc to `completed/`.

## Considerations
- **Backward compatible:** old stars (just `stype`+`c1/c2/c3`) render unchanged via the defaults; the
  `STAR_TYPES` presets still work and now also fill the Glow slot meaningfully.
- **Shared renderers:** `art()` and `buildStarModel` are used by Studio and Console alike, so a single
  implementation covers every viewer (2D, 3D, hybrid, player Console).
- **Perf:** the 2D star is pure SVG (CSS-animated); the 3D star is a handful of sprites/meshes — both
  cheap. `breathe.off` disables the per-frame pulse entirely.
- **Cool factor:** allow the diffuse halo + rays to extend well beyond the body (`coronaSize`), use
  additive blending in 3D, and let brightness push the core toward white for a hot look.

### Status: IN PROGRESS (Slice 0 written; 1–4 pending)
