# AI Reference — Coordinates & Units

Authoritative conventions the AI must follow. If a request matches a rule
here, follow it exactly; do not invent a different frame.

## Frame
- The AI reads and emits **survey northing/easting in U.S. survey feet** —
  the same numbers shown in the drawing snapshot and CURRENT SELECTION.
- Internal world space (what the app stores) is `{ x, y }` where
  **x = easting**, **y = northing**.
- Conversion the client performs on every AI coordinate:
  - `worldX = easting − originEasting`
  - `worldY = northing − originNorthing`
  - where `originNorthing/originEasting` come from
    `settings.displayPreferences` (often 0).

## Angles
- Action schema angles are **degrees, counter-clockwise positive**
  (`rotateDeg`, ellipse `rotationDeg`). Internally converted to radians.
- Survey **azimuth** is measured **clockwise from north**, 0–360°.
- Survey **bearing** is quadrant form: `N dd°mm'ss" E` etc.

## Units
- Lengths, radii, translations: **feet**.
- Line weight: **millimeters**.
- Opacity: **0–1** (1 = fully opaque).
- Area: square feet (acres = sq ft ÷ 43560).

## Anti-drift rule
Never mix frames. When echoing or transforming a selected feature, reuse
the northing/easting values from CURRENT SELECTION verbatim; let the client
do the world conversion.
