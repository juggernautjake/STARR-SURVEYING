# CAD label backgrounds + closed-shape texture / shading fills

*Opened 2026-05-30 in response to two related user asks captured
during the cert/notes editing arc.*

## What the user asked for

> "Please make it so that I can give all point, line, azimuth,
> bearing, area, distance, etc labels an immediate background. Kind
> of like a highlight. Also, please make it so that shapes and areas
> enclosed by a polyline I can give different gradients of textures
> and shading. Like, dotted shading, diagonal shading, etc. Make some
> of the dotted shading options have kind of randomly sized dots and
> be distributed kind of randomly too. This might be used to
> represent gravel or something. The dots shouldn't be totally
> random, but there should be a slight range of sized dots that are
> spaced out. I just want a bunch of texture shading options.
> However, if I put an area label over the textured area, for
> example, I need to be able to give the label text a background,
> probably white, so that the text is easy to read on top of the
> textured area."

> "The default should be no text background, but it should be easy
> to add. Like, if I click on the label, I should be able to add the
> text background in the editing panel."

Six concrete asks:

1. **Label background fill** (opt-in highlight) for every label
   kind — point name / code / elevation / bearing / distance /
   azimuth / area / monument / text feature / leader text.
2. **Default off** — labels keep their current transparent look
   until the surveyor opts in.
3. **Surfaced in the label editing panel** — clicking a label opens
   its existing inline editor + property panel, which is where the
   background controls live (toggle on, color picker, padding,
   border).
4. **Closed-shape fill textures** beyond solid color: dotted,
   diagonal hatch, cross-hatch, etc.
5. **"Gravel" texture** — semi-random dots with a *slight* range of
   sizes + *slight* range of spacing so the result reads as gravel
   rather than as a uniform stipple.
6. **Composability** — if a textured polygon has an area label over
   it, the label's white-background opt-in lets the text stay
   readable on top.

## What already exists (no rebuild)

| Piece | Where it lives |
|-------|----------------|
| `TextLabel` per-feature labels with `style: {fontSize, color}` | `lib/cad/types.ts` (look for `TextLabel`) |
| Label rendering in Pixi (`renderLabels`) | `CanvasViewport.tsx:3430` |
| `AreaAnnotation` rendering | `CanvasViewport.tsx:3368` (`renderAreaAnnotations`, Slice 229) |
| `TextAnnotation` rendering | `renderTextFeatures()` |
| Feature `style: {color, lineWeight, opacity}` + fill toggle for POLYGON | `lib/cad/types.ts` `FeatureStyle` |
| Pixi `Graphics.beginFill` polygon fill | every closed-shape render path |
| Per-label editor (`LabelEditModal`) opens on double-click | `CanvasViewport.tsx:11236` (`hitTestLabel` + `setLabelEditState`) |
| Per-feature PropertyPanel (style swatches, line weight) | `app/admin/cad/components/PropertyPanel.tsx` |
| `useTextLabelStyleStore` (font, size, fill color) | `lib/cad/labels/text-label-style-store.ts` (if present — verify) |

## What's missing

- `TextLabel.style` doesn't carry a `background` field — no place
  to opt in / color the highlight.
- The label render path always draws bare text on the labelLayer
  with no rect underneath.
- `AreaAnnotation` + `TextAnnotation` have no `backgroundColor`
  read by the render path even though `TextAnnotation` declares
  `backgroundColor: string | null` (verify in
  `annotation-types.ts`).
- `FeatureStyle` only carries one `color` slot for fill, no
  pattern / texture enum.
- Pixi has no built-in dotted / diagonal / gravel pattern fill —
  we'll need to procedurally render the texture into the same
  Graphics that draws the polygon, OR generate a texture once and
  re-use it via `Sprite` with a `TilingSprite` fill mask.

## Phases + slices

### Phase 43 — Label backgrounds (Slices 229+ of the cad arc)

*Renumbered to avoid collision with Slice 229 in
`cad-area-calculation-multi-unit-2026-05-29.md` which already shipped:
this doc starts its CAD slice numbering at **Slice 232**.*

#### Slice 232 — `TextLabel.style.background` field + AreaAnnotation backgroundColor render ✅ shipped 2026-05-30
- **Scope:** Extend `TextLabelStyle` (or the equivalent style
  attached to per-feature `textLabels`) with an optional
  `background?: { color: string; padding: number; borderColor?: string;
  borderWidth?: number } | null`. Default `null` (no background) so
  every existing drawing keeps its current look. Extend
  `AreaAnnotation` similarly OR re-use the existing
  `TextAnnotation.backgroundColor` shape.
- **Files:** `lib/cad/types.ts` + `lib/cad/labels/annotation-types.ts`,
  `__tests__/cad/labels/label-background-types.test.ts` (new).
- **Done when:** Type compiles + a new spec asserts the optional
  field is present + accepts the documented shape.
- **Outcome:** `TextLabelStyle` already had `backgroundColor` /
  `borderColor` / `padding`; added the missing `borderWidth: number |
  null` slot. `DEFAULT_TEXT_LABEL_STYLE` seeds it `null` so existing
  drawings stay bare. `AreaAnnotation` mirrors `TextAnnotation`'s
  background shape (`backgroundColor` / `borderVisible` / `borderColor`
  / `padding`); both factories seed off-by-default. 8 new specs green.
  Render-path + editor-panel wiring picked up in Slices 233 + 234.

#### Slice 233 — Render the background under every label that opts in ✅ shipped 2026-05-30
- **Scope:** In each label render path (`renderLabels`,
  `renderAreaAnnotations`, `renderTextFeatures`,
  `renderLeaderAnnotations` if it exists), look up the label's
  `style.background` (or `backgroundColor` for the annotation
  types). When non-null, draw a filled rect under the Pixi Text
  using the text's measured bounds + `padding`. Border optional.
- **Files:** `CanvasViewport.tsx`,
  `__tests__/cad/ui/label-background-render.test.ts` (new — source
  regex).
- **Done when:** A label with `background: { color: '#fff', padding: 2 }`
  renders a white rect under its text.
- **Outcome:** New `labelBackgroundLayer` sits between featureLayer +
  labelLayer; new `labelBackgrounds: Map<string, Graphics>` keyed by
  `area:${id}` / `label:${featureId}:${labelId}`; new
  `drawLabelBackgroundRect()` helper measures `getLocalBounds()` +
  pads on every side. Both `renderAreaAnnotations` and `renderLabels`
  get/create/clear a Graphics on opt-in and clean up on opt-out + GC.
  16 new specs green; full CAD sweep at 1702. `renderTextFeatures`
  (TEXT-feature path) + `renderLeaderAnnotations` (no such fn yet)
  deferred — TextLabel + AreaAnnotation cover the immediate user asks.

#### Slice 234 — Label editor panel: background toggle + color picker ✅ shipped 2026-05-30
- **Scope:** Add a "Background" section to whichever editor opens
  when the surveyor double-clicks a label (likely
  `LabelEditModal` or the inline `setLabelEditState` editor). A
  checkbox "Add background", a color swatch (default white when
  toggled on), a numeric padding input (default 2 px). Saving
  writes through to the existing label-style update path.
- **Files:** the label-editor component + its style commit,
  `__tests__/cad/ui/label-editor-background.test.ts` (new).
- **Done when:** Surveyor clicks a label, toggles the background on,
  picks a color, hits Save — the on-canvas label gets the rect.
- **Outcome:** New "Add background" section inside the inline
  `labelEditState` modal in `CanvasViewport.tsx`, between the B/I
  buttons and the Reset controls. Checkbox toggles
  `style.backgroundColor` between `null` (default) and `'#ffffff'`; a
  `<input type="color">` swatch + clamped padding input (0–20 px) show
  only when the toggle is on. Every edit commits through
  `drawingStore.updateTextLabel`, the same path used elsewhere in the
  editor, so the Slice-233 render branch picks it up live. 14 new
  specs green; full CAD sweep at 1716.

### Phase 44 — Closed-shape texture / shading fills (Slices 235+)

#### Slice 235 — `FeatureStyle.fillPattern` enum + pattern generators ✅ shipped 2026-05-30
- **Scope:** Widen `FeatureStyle` to include an optional
  `fillPattern?: 'SOLID' | 'NONE' | 'DOT_UNIFORM' | 'DOT_GRAVEL' |
  'DIAGONAL_LEFT' | 'DIAGONAL_RIGHT' | 'CROSSHATCH' |
  'HORIZONTAL_LINES' | 'VERTICAL_LINES' | 'BRICK' | 'WAVE'`. New
  module `lib/cad/styles/fill-patterns.ts` exports pure helpers:
  - `generateDotUniform(width, height, density, dotRadius): Point2D[]`
  - `generateDotGravel(width, height, seed): Array<{x, y, r}>` —
    Poisson-disk-ish sampling so dots don't cluster, with each dot
    radius drawn from a small Gaussian (`mean ~ 1.5 px, σ ~ 0.6 px`)
    so the result reads as gravel rather than uniform stipple.
  - `generateHatchLines(width, height, angleDeg, spacing): Line[]`
- **Files:** `lib/cad/types.ts`, new
  `lib/cad/styles/fill-patterns.ts`, new
  `__tests__/cad/styles/fill-patterns.test.ts` (deterministic
  fixtures with fixed seed).
- **Done when:** Pure helpers exist + return arrays whose lengths +
  bounds are tested at fixed seeds.
- **Outcome:** `FeatureStyle` gains `fillPattern`, `patternColor`,
  `patternDensity` optional fields; new `FillPattern` union enumerates
  all 11 variants. New `lib/cad/styles/fill-patterns.ts` exports a
  seeded RNG (`SeededRng` — mulberry32 + Box-Muller gaussian), four
  pure pattern helpers (`generateDotUniform` /
  `generateDotGravel` with Bridson-flavored Poisson-disk sampling
  reading mean radius 1.5 px ± 0.6 px Gaussian / `generateHatchLines`
  / `generateBrickLines` / `generateWaveLines`), and a top-level
  `generateFillPattern` dispatcher that returns
  `{ dots, lines }` to feed the Pixi render path (Slice 236). 21 new
  deterministic specs green (fixed-seed reproducibility, gravel
  min-distance constraint, gaussian-radius range, dispatcher
  enum coverage); full CAD sweep at 1737.

#### Slice 236 — Render textured polygons via Pixi Graphics ✅ shipped 2026-05-30
- **Scope:** In the polygon render path, after `beginFill(color)
  + drawPolygon + endFill`, check `style.fillPattern` and overlay
  the texture. For dot patterns: walk the generator's `{x,y,r}`
  array and call `drawCircle`. For hatch patterns: walk the line
  set + `moveTo / lineTo` clipped to the polygon. Use a per-feature
  PIXI mask so the texture stays inside the polygon boundary.
- **Files:** `CanvasViewport.tsx` (per-feature polygon render
  block), `__tests__/cad/ui/textured-fill-render.test.ts` (source
  regex on the new render branch).
- **Done when:** Selecting `DOT_GRAVEL` on a polygon makes it look
  like gravel; other patterns render their visual.
- **Outcome:** New per-feature texture Graphics + polygon-shaped mask
  Graphics pair (`featureTextures: Map<id, {tex, mask}>`); new
  `drawFillPatternForPolygon(feature, screenPts, alpha)` helper runs
  the Slice-235 generator at the polygon's screen-space bounding rect,
  draws dots via `drawCircle` and lines via `moveTo/lineTo` offset by
  (minX, minY). The texture's Pixi `.mask` is set to the polygon-shape
  mask Graphics so primitives stay inside the boundary. Texture color
  falls back to `style.color` when `patternColor` is null. Stable per-
  feature seed via FNV-1a hash of the id keeps the texture stable
  across re-renders. GC sweep matches `featureGraphics` so leaving the
  visible set drops both Graphics. 16 new specs green; full CAD sweep
  at 1753. CIRCLE / ELLIPSE / closed SPLINE deferred for now — they'd
  follow the same pattern but the polygon path covers the immediate
  composability ask.

#### Slice 237 — PropertyPanel: fill-pattern picker + preview ✅ shipped 2026-05-30
- **Scope:** Add a "Fill pattern" row to the existing closed-shape
  PropertyPanel section: a small grid of preview swatches (one per
  enum value) the surveyor can click to set. Saves through
  `useDrawingStore.updateFeatureStyle` (or the existing per-feature
  style commit path).
- **Files:** `PropertyPanel.tsx`,
  `__tests__/cad/ui/fill-pattern-picker.test.tsx` (new).
- **Done when:** PropertyPanel surfaces the picker + clicking a
  swatch updates the polygon's render.
- **Outcome:** New "Fill pattern" section in `PropertyPanel.tsx`, gated
  on `computeFeatureArea(feature).squareFeet > 0` so it only appears
  on closed shapes. 5-column grid surfaces all 10 pattern variants
  (None / Dots / Gravel / Diag / / Diag \\ / Cross / Horiz / Vert /
  Brick / Wave); the active swatch is highlighted with the blue
  selected-state class. Clicking commits via `drawingStore.updateFeature`
  writing `style.fillPattern` (preserves all other style props through
  the spread + sets `isOverride: true`), which the Slice-236 render
  branch picks up live. 18 new specs green; full CAD sweep at 1771.

### Phase 45 — Composability sanity (Slice 238)

#### Slice 238 — Area label over textured area: prove the readability path
- **Scope:** Manual + e2e check: drop a `DOT_GRAVEL` polygon, place
  an area label over it (Slice 229 path), toggle on the label's
  white background (Slice 234 path). Verify the rect renders under
  the text so the area number stays readable on top of the
  gravel texture. Add a Playwright spec that asserts the
  background rect is present in the DOM/canvas snapshot.
- **Files:** `e2e/cad-area-label-over-texture.spec.ts` (new).
- **Done when:** The screenshot diff shows readable text over a
  textured polygon.

---

## TL;DR

- Slices 232–234 ship the label-background highlight, default off,
  surfaced via the label editor.
- Slices 235–237 ship the polygon texture system (solid / dot /
  hatch / gravel) selectable from the PropertyPanel.
- Slice 238 closes the loop by proving the two systems compose:
  a label with `background: white` stays readable on top of a
  `DOT_GRAVEL` polygon.
