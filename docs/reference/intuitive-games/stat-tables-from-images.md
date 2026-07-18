# Intuitive Games — Stat tables transcribed from site IMAGES

_Some rules data on intuitivegames.net lives only inside images (the page text just says "chart below").
These were transcribed by reading the actual image pixels via Playwright download + vision, 2026-07-17.
Verbatim from Brendan's site — the numbers are the image's, not invented._

## Encumbrance (Core Rules → Encumbrance)

Source image: `…/Picture1.png` (alt: "A table displaying strength scores from 6 to 20…"). Values in pounds.

| Strength Score | Comfortable Held | Comfortable Carry | Maximum Held | Maximum Carry | Maximum Drag |
|---|---|---|---|---|---|
| 6  | 5   | 10  | 10  | 20  | 30  |
| 8  | 15  | 30  | 30  | 60  | 90  |
| 10 | 25  | 50  | 50  | 100 | 150 |
| 12 | 35  | 70  | 70  | 140 | 210 |
| 14 | 45  | 90  | 90  | 180 | 270 |
| 16 | 55  | 110 | 110 | 220 | 330 |
| 18 | 65  | 130 | 130 | 260 | 390 |
| 19 | 70  | 140 | 140 | 280 | 420 |
| 20 | 75  | 150 | 150 | 300 | 450 |

Observed pattern (for interpolation / a programmatic formula): with `base = (STR − 5) × 5`,
Comfortable Held = `base`, Comfortable Carry = Maximum Held = `base × 2`, Maximum Carry = `base × 4`,
Maximum Drag = `base × 6`. (Values tripled for quadrupeds, per the Encumbrance rules text.)
