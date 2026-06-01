# CAD point code/description labels — separate toggles + render — 2026-06-01

> **STATUS: COMPLETE (2026-06-01).** Slice 1 shipped — separate
> `showPointCodes` toggle + POINT_CODE label, split generator,
> CanvasViewport anchor/draw-order, panel "Show Codes" toggle +
> Code style row. Full cad suite green (2460), typecheck + lint
> clean.

*User (with the panel open on "TRV: MISC — Drawing"):*

> *"The point labels still won't render. Make sure I can change
>  the color of the labels for lines and points. Make sure they
>  are not opaque by default. I need the point names and codes
>  to be fully rendered and visible. Make sure the font is a good
>  size. The imported point info has a description AND a code —
>  create two separate toggles, one for code and one for
>  description. Make sure they work and actually render the
>  points on the page."*

## Audit (2026-06-01)

- **Why labels don't render:** the panel in the screenshot is
  for the **Drawing** layer, but the points are on the separate
  **Points** layer. Toggling "Show Point Names" on the Drawing
  layer regenerates labels for its polylines (no point names).
  Verified the generation pipeline is correct: a TRV point on
  the Points layer with `showPointNames`/`showPointDescriptions`
  on yields `POINT_NAME="21fnd"` + `POINT_DESCRIPTION="309 w/
  angle iron"`, `color=null` → inherits the layer's black →
  visible. So the fix is to make the toggle set the user expects
  (Code + Description) work + render, and the labels were never
  invisible/opaque — they just weren't generated on that layer.
- **Color:** the panel already exposes a per-style color picker
  (with a "Layer" checkbox = use layer color). The new Code
  style gets one too.
- **Font:** default 12pt, point names bold — fine.

## Slices

### Slice 1 — Separate `showPointCodes` toggle + POINT_CODE label

- `types.ts`: `TextLabelKind` += `'POINT_CODE'`;
  `LayerDisplayPreferences` += `showPointCodes: boolean` +
  `pointCodeTextStyle: TextLabelStyle`.
- `constants.ts`: `DEFAULT_LAYER_DISPLAY_PREFERENCES` +=
  `showPointCodes: false` + `pointCodeTextStyle`.
- `generate-labels.ts`: split the point text labels —
  - `showPointNames` → POINT_NAME (= pointName / pointNumber)
  - `showPointCodes` (NEW) → POINT_CODE (= resolved alpha/
    numeric code, else `properties.code`)
  - `showPointDescriptions` → POINT_DESCRIPTION (= the human
    `properties.description`, no longer doing the code-
    resolution — that moved to POINT_CODE).
- `CanvasViewport.tsx renderLabels`: anchor POINT_CODE at the
  point + add it to the stacked draw order.
- `LayerPreferencesPanel.tsx`: add the "Show Codes" toggle + a
  "Code Style" font/size/weight/color row, between Names and
  Descriptions.
- Tests: generator emits POINT_CODE from `code` + POINT_DESCRIPTION
  from `description` independently; default pref is off; panel
  source-text spec for the new toggle + style row.

## Out of scope / notes

- Labels render BLACK (layer color) on white paper by default —
  opaque text, transparent background. Already correct; no
  opacity bug. Color is user-changeable via the per-style
  picker.
- The Points-vs-Drawing layer selection is inherent to the
  2-layer import structure the user asked for; the panel works
  on whichever layer is selected. Documented for the user.

## TL;DR

Add a dedicated "Show Codes" toggle (POINT_CODE label) alongside
the existing Names + Descriptions, each with its own
font/size/weight/color, so imported point codes + descriptions
render independently + visibly on the Points layer.
