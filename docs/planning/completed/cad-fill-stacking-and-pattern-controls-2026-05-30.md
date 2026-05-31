# CAD fill stacking + per-pattern controls — 2026-05-30

*Opened 2026-05-30 in response to a 7-part user ask mid-session:*

1. *Picking a pattern should render IMMEDIATELY — today the fill is
   invisible until the user explicitly picks a pattern color. The
   pattern color should default to black; the user can change it.*
2. *The "you've got a polygon selected" highlight while editing fill
   reads grey — it should be the SAME blue as the regular selection
   highlight.*
3. *Brick: separate width + height sliders (independent of density),
   live-render.*
4. *Wave: amplitude (height) + period (frequency) sliders, live-
   render.*
5. *A new dashed-line infill alongside the solid Diagonal/Horizontal/
   Vertical/Crosshatch options.*
6. *An opacity slider for the infill.*
7. *Stack MULTIPLE infill patterns on the same area — dots + lines,
   bricks + dots, etc. Unlimited layers.*

## Today's reality (audit, 2026-05-30)

- `FeatureStyle.fillPattern` is a single value; one pattern per
  feature. `patternColor?: string | null`; the render path falls back
  to `feature.style.color ?? '#000000'`, which works — so the
  "needs color first" symptom probably comes from `fillOpacity`
  defaulting `undefined` and rendering with `alpha` of the BASE
  feature (which can be 0/invisible). Need to verify.
- The render path's solid-fill branch (POLYGON case) uses
  `feature.style.fillColor` — if `fillColor` is null/undefined the
  solid fill is skipped, but the pattern overlay still draws. So the
  symptom must be the pattern alpha defaulting weird. Verify in
  `drawFillPatternForPolygon`.
- Pattern-brick: `generateBrickLines` derives `courseHeight = max(6,
  12/density)` + `brickWidth = courseHeight * 2`. Fixed ratio. Needs
  explicit width + height inputs.
- Pattern-wave: `generateWaveLines` derives `rowSpacing = max(8,
  18/density)`, `amplitude = rowSpacing * 0.35`, `wavelength =
  rowSpacing * 3.5`. Three derived values from one knob.
- Dashed line: doesn't exist as a fill pattern.
- Opacity: `fillOpacity` exists as a number; not wired to a slider.
- Stacking: not supported (single `fillPattern` field).
- The selection-highlight color likely lives in CanvasViewport
  selection styles or in the property-panel's polygon-highlight
  outline; the "grey" the user sees is presumably the in-panel
  preview swatch / highlight, not the canvas selection. Needs
  inspection.

## Slices

### Slice 1 — Defaults that make pattern picks render immediately ✅ shipped 2026-05-30

- **Root cause** isolated: the pattern overlay's alpha was the OUTER
  stroke alpha (`alpha` in `drawFeature`). The Slice-4 "Fill enclosed
  area" flow + several other paths can leave a polygon with
  `opacity: 0` (intentionally invisible stroke); the pattern then
  inherited 0 alpha and rendered invisible. Picking a "color" felt
  like the fix because the user's prior path also changed opacity.
- **Fix:** decouple the pattern's color + alpha from the outer
  feature.
  - `patternColorHex = feature.style.patternColor ?? '#000000'`
    (was `?? color ?? '#000000'`).
  - `patternAlpha = Number.isFinite(fillOpacity) ? clamp(fillOpacity,
    0, 1) : 1` (was the outer `alpha`).
  - PropertyPanel's onChange now seeds `patternColor: '#000000'` +
    `fillOpacity: 1` on FIRST pick (only when those fields are
    missing — so a user-customized color/opacity isn't clobbered on
    a re-pick).
- Tests: render-test source-lock updated for the new `patternColorHex`
  + new `patternAlpha` derivation; picker-test source-lock updated
  for the multi-line commit shape + 2 new asserts on `isFirstPick`
  / `seededColor` / `seededOpacity`.
- Full cad suite (1841) green; typecheck + lint clean.

- Pattern overlay alpha currently relies on the feature's outer
  `alpha`; if the polygon was drawn with `opacity 0` (or the
  "invisible stroke" case from the Slice-4 "Fill enclosed area"
  flow), the pattern is also invisible. Fix: when a pattern is set,
  the pattern's alpha falls back to **`fillOpacity ?? 1`** (not the
  outer alpha), so the picker → render is immediate even on a
  zero-stroke polygon.
- Default `patternColor` resolution: keep the current
  `patternColor ?? color ?? '#000000'` chain (already black-by-
  default in practice). Explicitly seed `patternColor = '#000000'`
  in the picker's "first ever pattern pick" so the user sees the
  black-by-default + can change.
- Tests: spec on the pure pattern-alpha helper; spec the picker
  seeds patternColor on first selection.

### Slice 2 — Selection highlight blue while editing fill ✅ shipped 2026-05-30

- Root cause was two-fold: (a) the "Fill enclosed area" multi-select
  flow seeded the polygon's `fillColor` to `baseColor` (the source
  line's color — often null → grey from the layer default), so the
  resulting polygon's solid-fill wash read as grey; (b) the existing
  selection-outline weight (1.5 + 0.5 = 2 px) gets visually drowned
  by a textured fill once a pattern is active.
- **Fix A**: the "Fill enclosed area" flow now seeds
  `fillColor: '#0088ff'` (the same `selectionColor` default) so the
  new polygon's translucent fill matches the selection color the
  moment it's created. The user can change the color later.
- **Fix B**: `drawFeature`'s selection-outline width bumps by +1 px
  when `feature.style.fillPattern` is set to anything but NONE/SOLID,
  so the blue outline reads cleanly over dots / hatches / brick /
  wave.
- Tests: 4 source-text asserts in `selection-blue-over-fill.test.ts`
  lock both fixes.
- Full cad suite (1842) green; typecheck + lint clean.

- Locate the "polygon highlighted" color the panel uses while the
  fill picker is open (grey today). Replace with the same accent
  blue used by feature selection (CSS var or shared constant).
- Visual-only change; lock with a small CSS / source-text assert.

### Slice 3 — Brick: width + height sliders + Wave: amplitude + period sliders ✅ shipped 2026-05-31

- `FeatureStyle.brickWidth?: number`, `brickHeight?: number`,
  `waveAmplitude?: number`, `wavePeriod?: number` — all optional,
  defaults derived from density so saved drawings render unchanged.
  `FillPatternConfig` mirrors those four fields.
- `generateBrickLines(width, height, density, brickWidth?,
  brickHeight?)` — explicit overrides clamped to ≥ 1 px (so a slider
  pulled to zero doesn't infinite-loop). `generateWaveLines(width,
  height, density, amplitude?, period?)` — amplitude clamped to ≥ 0,
  period to ≥ 1. Dispatcher BRICK/WAVE cases thread the new fields.
- `CanvasViewport.drawFillPatternForPolygon` cfg threads
  `brickWidth/brickHeight/waveAmplitude/wavePeriod` from
  `feature.style.*`.
- `PropertyPanel` contextual params: when `currentPattern === 'BRICK'`
  renders Width + Height sliders (4–120 px) each with paired numeric
  input; when `currentPattern === 'WAVE'` renders Amplitude (0–60 px)
  + Period (8–240 px) with paired numeric inputs. Same slider+number
  pair affordance the Density/Thickness/Angle controls use.
- Tests: 9 new pure-module specs lock explicit overrides change the
  primitive count + omitted overrides reproduce the density-derived
  baseline + zero/negative dims are clamped; 12 new source-text
  specs lock the cfg wiring + contextual slider testids + paired
  numeric inputs. Full cad suite (56 in the two touched files; full
  suite green) + typecheck + lint clean.

- `FeatureStyle.brickWidth?: number`, `brickHeight?: number` (px,
  optional; defaults derived from density). Same for
  `waveAmplitude?: number`, `wavePeriod?: number`.
- `generateBrickLines` + `generateWaveLines` take optional explicit
  overrides; tests lock that larger explicit values produce wider
  bricks / taller-or-faster waves.
- PropertyPanel: render the extra sliders contextually
  (brickWidth/Height only when `fillPattern === 'BRICK'`,
  waveAmplitude/Period when `WAVE`). Each pair carries the same
  numeric-input affordance Slice 1 added.

### Slice 4 — Dashed-line infill ✅ shipped 2026-05-31

- `FillPattern` union gains `DASHED_LINES`. `FeatureStyle` gains
  optional `patternDashLen?` + `patternGapLen?` (px). Both default-
  derived from density when omitted so saved drawings render
  unchanged. `FillPatternConfig` mirrors `dashLen` + `gapLen`.
- `generateDashedHatchLines(width, height, angleDeg, spacing,
  dashLen?, gapLen?)` reuses the parallel-hatch geometry but
  fractures each hatch line into dash + gap segments. Rows are
  phase-staggered so adjacent rows don't form a grid. Clamps both
  dash + gap to ≥ 1 px so a zero slider doesn't infinite-loop.
- Dispatcher routes `'DASHED_LINES'` through the new generator;
  rotation wrapper spins it via the same angle slider every other
  pattern uses (no separate Diagonal/Horizontal/Vertical dashed
  variants needed).
- `CanvasViewport.drawFillPatternForPolygon` cfg threads
  `dashLen`/`gapLen` from `feature.style.patternDashLen` /
  `patternGapLen`.
- `PropertyPanel` dropdown adds "Dashed lines" in the Hatches
  optgroup; contextual sliders show Dash Length + Gap Length (1–60
  px each) only when the active pattern is DASHED_LINES, each with
  a paired numeric input.
- Tests: 7 new pure-module specs lock the generator's shape +
  override behavior + clamp; the variants-list source-text lock
  picks up DASHED_LINES; 7 new UI source-text specs lock the picker
  entry + slider testids + cfg wiring. Full fill suite (110) green;
  typecheck + lint clean.

### Slice 5 — Opacity slider ✅ shipped 2026-05-31

- New Opacity row at the top of the fill-pattern params card (before
  Density), shown for every non-NONE/SOLID pattern. Slider 0–1 in
  0.05 steps + paired numeric input, matching the affordance the
  Density/Thickness/Angle rows already use.
- Reads + writes `feature.style.fillOpacity`. Defaults to 1 when the
  field is missing. The render path's `patternAlpha` already
  derives from `fillOpacity` (cad-fill-stacking Slice 1) so this is
  pure UI wiring with no render-path changes.
- Tests: 5 source-text specs lock the slider testids, min/max/step
  range, clamp + commit, and the default-1 fallback. Typecheck +
  lint clean.

### Slice 6 — Stack multiple infill patterns on one area

Sub-sliced 2026-05-31 because the full feature spans a pure data
model, the Pixi render path, AND a chunk of PropertyPanel UI — each
big enough to merit its own commit + test sweep.

#### Slice 6a — Pure data model + migration helpers ✅ shipped 2026-05-31

- `FillLayer` interface in `lib/cad/types.ts`: `{ pattern, color,
  density, scale, rotation, opacity, visible + per-pattern extras
  (brickWidth/Height, waveAmplitude/Period, dashLen/gapLen) }`.
- `FeatureStyle.fillStack?: FillLayer[]` — optional; when present,
  supersedes the legacy single-pattern fields for rendering. When
  absent, the legacy fields project into a 1-element stack so saved
  drawings render unchanged.
- `lib/cad/styles/fill-stack.ts` ships the pure helpers:
  - `normalizeFillLayer(partial)` — fills defaults + clamps opacity
    + coerces NaN/∞ numerics to safe values.
  - `legacyStyleToFillLayer(style)` — projects legacy fields into
    one FillLayer; returns null when there's nothing to render
    (no pattern AND no solid fillColor). A pure solid fill becomes
    a layer with `pattern: 'SOLID'`.
  - `resolveFillStack(style)` — canonical "what should I render?"
    entrypoint; returns a FRESH array (no shared refs back) so
    callers can mutate freely.
  - `resolveVisibleFillLayers(style)` — additionally filters out
    `visible: false` and `pattern: 'NONE'` placeholder layers.
  - `appendFillLayer` / `removeFillLayerAt` / `updateFillLayerAt`
    — non-mutating helpers used by sub-slice 6c UI.
- 18 pure-module specs lock defaults, opacity clamp, NaN handling,
  visible-false preservation, legacy-projection back-compat, fresh-
  array contract, visibility filter, and all three mutation
  helpers. Typecheck + lint clean.

#### Slice 6b — Render: walk the stack in `drawFillPatternForPolygon` ✅ shipped 2026-05-31

- `drawFillPatternForPolygon` short-circuits to a new
  `drawFillStackForPolygon` whenever `feature.style.fillStack` is
  an explicit array. The legacy code path stays intact for all
  features that haven't adopted the stacked model, so saved
  drawings render byte-identical to today (locked by the existing
  `textured-fill-render.test.ts`).
- `drawFillStackForPolygon` resolves the visible layers via
  `resolveVisibleFillLayers(feature.style)`, sets up the mask once,
  and walks the layers in array order (bottom-to-top draw). SOLID
  layers fill the bbox with their own color/opacity; every other
  pattern routes through `generateFillPattern` with a layer-derived
  `FillPatternConfig`. Each layer carries its own opacity (not the
  outer alpha), so a partially-transparent layer lets the layer
  beneath show through.
- Per-layer seed is `hashSeed(feature.id + ':' + layer.pattern)` so
  stacking the same pattern twice (e.g. two dot layers) gives
  visually distinct stipple instead of perfect overlap.
- Tests: 10 source-text specs lock the import, the
  `if (Array.isArray(... fillStack))` branch, the walker signature,
  the resolve call, the for-of layer loop, the SOLID drawRect path,
  the layer-derived cfg fields, the per-pattern seed, the layer-
  alpha contract, and the empty-stack wipe. Typecheck + lint clean.

#### Slice 6c — PropertyPanel: layer-list UI ✅ shipped 2026-05-31

- New layer-list section at the top of the fill-pattern wrapper,
  shown only when `feature.style.fillStack` is explicit. Each row
  has an eye toggle + pattern dropdown + color swatch + delete.
  "+ Add layer" button at the bottom appends a NONE-placeholder
  layer.
- "+ Add layer (stack another pattern)" CTA also surfaces in
  single-pattern mode (below the existing params card) when there's
  a current non-NONE pattern. Click migrates legacy fields →
  `fillStack[0]` (via `legacyStyleToFillLayer`) + appends a NONE
  layer at index 1, switching the UI into stacked mode.
- When `fillStack` is explicit, the existing pattern picker + the
  Density/Thickness/Angle/Opacity/Brick/Wave/Dash params card hide
  so the surveyor isn't confused by controls that write to legacy
  fields the Slice-6b renderer is ignoring.
- `deleteLayer` auto un-stacks when reducing the stack to length 1:
  copies the sole layer's fields back into the legacy slots +
  clears `fillStack`, so the full params card returns for single-
  pattern fine-tuning.
- Per-layer Density / Thickness / Angle / Opacity / pattern-extras
  fine-tuning is acknowledged as a 6d follow-up — the inline help
  in the layer list flags this. For now, extra layers use the
  default 1× density, 1× thickness, 0° rotation, opacity 1. The
  pattern + color picker per layer is the MVP that ships
  "stack multiple patterns" as a working feature.
- Tests: 15 source-text specs lock helper imports, the
  `hasExplicitStack` gate on the picker + params card, every row
  control (eye / pattern / color / delete) + add-layer button +
  start-stack CTA wiring, the deleteLayer auto-un-stack code, and
  the legacy → stack projection in addLayer.
- Full cad suite (1938) green; typecheck + lint clean.

## 6d follow-up — Per-layer fine-tuning (deferred)

Once the user is editing in stacked mode they can pick a pattern +
color per layer but they can't tune that layer's density / scale /
rotation / opacity / per-pattern extras independently. The natural
next move is an "active layer" indicator on the list + the params
card editing the active layer (via `updateFillLayerAt`). Deferred
because the MVP (pattern + color per layer) already lets the user
stack any combination they need; the fine-tuning ask is real but
the value vs. the refactor cost (rewiring every params-card
onChange to route through a writeStyle / writeLayerField wrapper)
warrants its own slice. Leaving 6d in this doc as a sized-out
placeholder.

## Out of scope / placeholder

- SVG export of stacked layers — pure module is export-ready; SVG
  wiring is a separate pass.
- Per-LAYER blend mode (multiply / screen / etc.) — deferrable
  until the user actually asks.

## Guardrails

- Every new field optional with a baseline default; existing
  drawings render pixel-identical.
- Patterns stay deterministic per feature (seed unchanged).
- Per slice: typecheck + lint + commit + push + annotate this doc.

## TL;DR

Six slices: immediate-render-on-pick + black-by-default + selection
blue (Slice 1+2); brick/wave per-axis sliders (Slice 3); dashed-
line infill (Slice 4); opacity slider (Slice 5); stack multiple
infill layers on one polygon (Slice 6, the big one).
