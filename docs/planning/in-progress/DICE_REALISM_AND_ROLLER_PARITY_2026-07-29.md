# Dice realism & roller parity — 2026-07-29

**Owner asks, verbatim, across four messages:**

1. *"Please make sure the rollers all look the same for each system, but that they work as they should
   individually for each system. Make sure the modal for the roller is always the right size to fully contain
   all of the content of the rollers at all times and that there is never a need for a scrolling bar to appear
   or be used to see everything."*
2. *"Please make it so that the impact dice roller looks even more like it is actually rolling like a real
   dice and that all of the numbers are tracked on it. Please make it so that we can roll multiple dice at
   once. Please make the dice rolling noises for the impact dice sound more like actual dice. Please make it
   so that the dice change appearance and style and theme along with the style and theme selected. Make the
   dice be a bit fancier and have more flare to them."*
3. *"Please make the d100 look like an actual d100, with really little digit font, and make it look like it is
   actually rolling around like the other dice."*
4. *"Some of the dice shapes and stuff don't really look like the dice they are representing. The d100 and d20
   don't look like they should. Please fix them and make them actually look like they should."*

---

## The decision that makes all of this possible

**Stop drawing pictures of dice. Render the actual solids.**

Everything shipped so far draws a *flat SVG silhouette* with facet polygons whose coordinates I typed in by
hand. That is why (4) is a legitimate complaint and why it will keep being one: hand-typed coordinates are a
drawing of a die from memory, and a drawing cannot be "more correct" — it can only be redrawn. The d20 net I
authored has a hexagonal outline and a centre triangle, which is roughly the right idea and wrong in every
detail, because I derived it from what a d20 looks like rather than from what a d20 *is*.

So: define each die as a **real polyhedron** — vertex table, face table, per-face numeral — and compute the
picture from it. A rotation matrix, back-face culling, orthographic projection, a Lambert shade per face, and
depth sorting. That is a *renderer*, not an illustration, and it answers all four asks at once:

| Ask | Why the renderer answers it |
| --- | --- |
| "actually look like they should" | The shape is the solid's real projection. There is nothing left to get wrong by hand. |
| "looks like it is actually rolling" | Because it *is* rotating in 3D. Faces appear, turn away, and vanish on their own. |
| "all of the numbers are tracked on it" | Every visible face carries its numeral, positioned by projecting the face centre. |
| "d100 like an actual d100" | A zocchihedron is just another vertex/face table. Small facets, small digits, same code. |
| "fancier / more flare" | Specular, bevel, rim-light and motion blur are per-face effects that need a normal — which the renderer has and a drawing does not. |
| "change with the style and theme" | A material is a small token set consumed at shade time. One table, every skin. |

**The cost is bounded and known.** A d20 has 20 faces, ~10 visible. Eight dice at once is ~80 SVG polygons
updated per frame — well inside budget for `requestAnimationFrame`, and the same order as the existing card
and tile animations. If it ever is not, the escape hatch is to drop to the settled orientation, which is also
the reduced-motion path, so it is code we need anyway.

### Ground rules (these are what keep it working long-term)

- **G1 — Geometry is derived, never typed.** No coordinate literals for die shapes. If a die looks wrong, the
  solid's definition or the projection is wrong; fix that. A hand-tweaked polygon is a regression.
- **G2 — The renderer never decides the result.** It receives the rolled values and *displays* them. The store
  remains the single source of the answer (the existing rule, unchanged). A settle animation that cannot reach
  the required face must still show that face, instantly and unglamorously.
- **G3 — Every die type goes through the same path.** A special case for one die is how the d100 ended up
  drawn as a d10. `dieSides` mapping d100 → 10 was a shortcut that became a bug.
- **G4 — Materials are tokens, shading is light.** Facet shading is white/black alpha over a themed body, so
  it composes on any skin. A material may set colours; it may not hand-shade individual faces.
- **G5 — Motion is gated.** `prefers-reduced-motion` and the player's animation preference both land the die
  immediately. Every slice must work with animation off.
- **G6 — Legibility beats realism, at every conflict.** A numeral that cannot be read is worse than an
  unconvincing die. Numerals stay upright, contrast-checked against their own facet.
- **G7 — The roller window never scrolls.** Sizing is derived from content. Only the roll *history* may
  scroll, and only when explicitly expanded.

---

## Where the code is

| Concern | Path |
| --- | --- |
| Roller registry (stage vs panel) | `app/dnd/_sheet/components/rollers/rollerFor.tsx` |
| Impact roller + stage | `app/dnd/_sheet/components/rollers/ImpactRoller.tsx`, `impactRoller.css` |
| Other three stages | `SigilStack.tsx`, `RollBoard.tsx`, `../RollStage.tsx` |
| Die shape (to be replaced) | `app/dnd/_sheet/components/rollers/dieShape.ts` |
| Shared roll tokenising | `rollerAnim.ts` (`breakdownTerms`, `dropSummaries`, `stripTotalTail`) |
| Floating window + sizing | `FloatingRoller.tsx`, `useFloatingDock.ts`, `floatingRoller.css` |
| Audio | `app/dnd/_sheet/lib/audio.ts` |
| Bare-stage mount sites | `app/dnd/_ui/pf2/usePf2Panels.tsx`, `app/dnd/_ui/ig/useIgPanels.tsx`, `app/dnd/_ui/builder/BuilderRoller.tsx` |
| Skin tokens | `lib/dnd/skin-tokens.ts` |
| Guards | `__tests__/dnd/roller-stage-scope.test.ts`, `roller-height-parity.test.ts` |

---

## Phase D1 — the polyhedron renderer

### D1-1 · Solid definitions `lib/dnd/dice/solids.ts`
A `Solid` is `{ verts: Vec3[]; faces: number[][]; pips: number[] }` — `pips[i]` is the numeral on `faces[i]`.

- **d4** tetrahedron (4 triangles). Numerals: a real d4 reads the number at the *base* of the upward face, or
  on the top vertex depending on the mould; use bottom-edge reading, which is what most dice do.
- **d6** cube (6 quads). Standard Western pipping: opposite faces sum to 7.
- **d8** octahedron (8 triangles), opposite faces sum to 9.
- **d10** pentagonal trapezohedron (10 kites). Built parametrically — apex height solved numerically so the
  kites are genuinely planar (bisection on the coplanarity determinant). Faces 0–9.
- **d12** dodecahedron (12 pentagons), opposite faces sum to 13.
- **d20** icosahedron (20 triangles), opposite faces sum to 21. Faces derived by finding every vertex triple
  at mutual edge distance, then wound counter-clockwise about the outward normal.
- **d100** zocchihedron, approximated as a **frequency-2 geodesic icosahedron** (80 faces) normalised to the
  sphere. A real Zocchihedron is 100 irregular faces on a sphere; 80 small faces on a sphere reads as the same
  object and is derivable rather than typed. Numerals 1–100 distributed so that near-antipodal faces are far
  apart in value (matching how the real die is numbered).
- **d3 / d30 / arbitrary N** — fallback: an N-gonal bipyramid, which is a real solid for any N ≥ 3. Replaces
  today's "faceted gem" fan and means a homebrew die is not a special case (G3).

*Acceptance:* a test asserts, for every solid, that it is closed (each edge shared by exactly two faces), that
every face is planar within tolerance, that all normals point outward, and that opposite-face sums hold where
the real die has them. **These are properties of the actual object — the test cannot be satisfied by a
plausible-looking table.**

### D1-2 · Projection `lib/dnd/dice/project.ts`
Pure, no DOM: `projectSolid(solid, quat, opts) → { faces: ProjectedFace[]; silhouette: Vec2[] }` where a
`ProjectedFace` carries `points`, outward `normal` in view space, `depth`, `lambert`, `centre` (for numeral
placement) and `pip`. Back faces culled by `normal.z > ε`, remaining faces sorted far-to-near.

*Acceptance:* rotating a cube by 90° about Z maps the visible face set to itself; a face is never both culled
and drawn; the silhouette is the convex hull of the visible projected vertices; numeral anchors are inside
their own polygon (an anchor outside its face is how digits end up floating off the die).

### D1-3 · The throw `lib/dnd/dice/throw.ts`
`planThrow(seed, landingFace, solid) → (t: number) => Quat`. A tumble that **ends with the landing face
towards the camera**: fast multi-axis spin, exponential deceleration, then a short `slerp` onto the exact
orientation that puts `faces[landingFace]`'s normal at `+Z`, plus a small settle wobble.

Deterministic from a seed so the same roll replays identically (needed for the adopt-not-replay rule, RO-7).

*Acceptance:* for every die and every face, the trajectory's final orientation puts that face within 1° of
camera-facing; total duration matches the existing tumble timing so sound and commit stay in sync; `t=1` is
exactly the settled orientation with animation disabled (G5).

### D1-4 · `<Die3D />` component
SVG. Props: `solid`, `value`, `seed`, `material`, `size`, `animate`, `onSettled`. One shared `rAF` loop for
all mounted dice (a loop per die is how eight dice become eight timers). Renders, per frame: silhouette
(edge stroke), each visible face (fill + light/shadow overlay + hairline seam), specular, and the numeral at
each face's projected centre — **scaled by the face's projected area**, which is what gives the d100 its
"really little digit font" without a special case (G3).

*Acceptance:* numerals upright at every orientation; the value passed in is the numeral facing the camera when
settled; no layout thrash (transform/attribute updates only); unmounts cancel cleanly.

### D1-5 · Retire `dieShape.ts`
`dieSides` keeps its job (which die is being rolled) but must stop mapping **d100 → 10** (G3). `ngonPoints` /
`ngonClip` / `dieNet` are deleted once nothing imports them; the hand-authored `NETS` table goes with them
(G1). Guard: a test asserts no roller imports the retired helpers.

---

## Phase D2 — multiple dice at once

### D2-1 · Per-die values from the breakdown
`2d6[3,5]` already carries the individual dice. `rollerAnim.ts` gains
`diceOf(breakdown) → Array<{ sides: number; value: number }>`, so the display derives every die from data the
store already produces — **no store change, no second source of truth** (G2).

*Acceptance:* `1d6[6] +3 = 9 + 3 (stance)` → one d6 showing 6; `2d6[3,5] + 1d4[2]` → three dice; a d20 with
advantage → two d20s, the kept one marked. Values always sum consistently with `breakdownTerms`.

### D2-2 · Dice tray layout
N dice laid out without overlap, sized down as N grows, wrapping within the arena. Staggered throw starts
(~40ms apart) so they do not move as one rigid block. Each die lands and *stays* readable.

*Acceptance:* 1, 2, 5, 8, 20 dice all fit the arena with no clipping and no scrollbar (G7); every die's numeral
is legible at the smallest size; the sum still reads as the headline.

### D2-3 · Dice-pad count wiring
The pad's `N×` control already exists; make it drive real multi-dice display end to end, including the IG/PF2
`rollDice` provider.

---

## Phase D3 — sound that sounds like dice

### D3-1 · A real impact, not a tone
`audio.ts` gains `clack({ size, energy, surface })`: a short noise burst through a band-pass whose centre
frequency falls with die size, plus a fast-decaying resonant body — a *hit*, not a beep. Randomised pitch and
gain per hit so no two are identical.

### D3-2 · A tumble is a sequence of impacts
Schedule impacts on a decaying Poisson process, matched to the trajectory's deceleration, ending in one louder
settle clack. Multi-dice: per-die sequences, jittered, with a polyphony cap so eight dice do not clip.

### D3-3 · Surface follows the skin
Wood, stone, felt, metal tray — pick from the active skin so the sound belongs to the sheet you are on.

*Acceptance:* muting works everywhere; no clipping with 8 dice; nothing plays before a user gesture
(`primeAudio` stays the gate); reduced-motion keeps sound but drops the tumble sequence to the settle hit.

---

## Phase D4 — materials: dice follow style and theme

### D4-1 · `lib/dnd/dice/materials.ts`
A `DieMaterial` is body fill, edge, numeral colour, specular strength, rim light, seam alpha and a `finish`
(`metal | plastic | resin | bone | gem | neon`). One entry per skin — hextech brushed metal, streamer neon
plastic, donata candy resin, rulebook ivory bone, default gem — each tinted by the character's chosen theme
accent so *theme* and *style* both land (owner ask 2).

### D4-2 · Resolution order
`character theme accent` → `skin material` → `system default` → hardcoded fallback, mirroring
`skinThemeShellVars`. Must resolve on all four systems: the PF2/IG sheets define `--hx-*`, not the 5e tokens —
the exact trap that made the Impact stage invisible there.

*Acceptance:* a contact-sheet cell per (skin × theme × die) shows a visibly different, still-legible die;
numeral contrast ≥ 4.5:1 against its own facet in every combination (G6).

---

## Phase D5 — flare

- **D5-1 Bevel.** An inset darker rim per face; the edge reads as a real chamfer.
- **D5-2 Specular.** A highlight whose position follows the face normal — moves as the die turns.
- **D5-3 Rim light.** Accent-coloured back-light on faces near the silhouette.
- **D5-4 Motion blur.** Feather during fast spin, resolving as it slows. Cheap: opacity-layered ghost of the
  previous frame's silhouette.
- **D5-5 Landing impact.** A ring pulse, a small shadow squash, and dust motes at the contact point.
- **D5-6 Crit / fumble.** Gold ignition or a red crack that reads instantly at a glance.

Each is independently switchable and off under reduced motion (G5).

---

## Phase D6 — parity across systems, difference where it belongs

### D6-1 · Audit what actually differs
The four stages are shared; what differs per system is the *controls* (PF2 has Target DC + degrees of success,
IG has stances, 5e has adv/dis + reckless). Catalogue every difference and classify it: **system mechanics**
(must differ) or **drift** (must not). The screenshot bug was drift nobody had classified.

### D6-2 · One stage, one look
Every stage renders identically across systems: same dice, same materials, same sizes, same animations. Guard
extends `roller-stage-scope.test.ts`: no stage stylesheet may reference a system-specific selector.

### D6-3 · Per-system controls, uniformly presented
System controls share layout, sizing and token vocabulary — a PF2 sheet's roller should look like an IG
sheet's roller with different buttons on it, not like a different product.

*Acceptance:* contact-sheet matrix (4 systems × 4 rollers × 5 skins) shows a consistent stage and only
intended control differences. Screenshots are the deliverable — this is the class of bug a green suite misses.

---

## Phase D7 — the window is always the right size (G7)

### D7-1 · Measure, do not guess
`useFloatingDock` declares `FIXED_W`/`FIXED_H`. Replace with content-derived sizing: `ResizeObserver` on the
content, window sized to it, clamped to the viewport with a safe inset. Fixed dimensions are what forces a
scrollbar when a roller's content is taller than the guess.

### D7-2 · The content must be able to fit
Sizing alone is not enough — content has to be *sizable*. Roll history is the one unbounded section: cap it to
the last 5 with "show all" opening a dedicated panel rather than growing the window. Breakdown rows are
bounded by the roll. Multi-dice trays scale down rather than overflow.

### D7-3 · Prove no scrollbar exists
Extend `scripts/lib/overflow.mjs` to assert `scrollHeight <= clientHeight` on the roller window across every
(system × roller × skin × dice-count × viewport) combination, including 360px-wide mobile. The detector
already knows to exclude legitimate scroll containers; the history panel is the only permitted one.

*Acceptance:* zero scrollbars in the whole matrix; window never exceeds the viewport; drag/minimise/reset
still work; mobile keeps the 44px touch minimum.

---

## Slice order

Ship in this order, each self-contained, typecheck + lint + tests + **browser screenshot** per slice:

1. **D1-1** solids + closure/planarity/winding tests — the foundation everything else stands on.
2. **D1-2** projection + tests.
3. **D1-3** throw trajectory + tests.
4. **D1-4** `<Die3D />` in the Impact roller, one die, real geometry. *This is the visible payoff and it fixes
   the d20 and d100 complaints.*
5. **D1-5** retire `dieShape` internals.
6. **D2-1 → D2-3** multiple dice.
7. **D4-1 → D4-2** materials per skin/theme.
8. **D3-1 → D3-3** dice sounds.
9. **D5-1 → D5-6** flare.
10. **D7-1 → D7-3** window sizing, no scrollbars.
11. **D6-1 → D6-3** cross-system parity sweep + contact sheet.
12. Roll `<Die3D />` into the other three stages where each one's identity allows (Sigil's tiles and Board's
    cards are deliberately *not* dice — parity means the DICE look the same, not that every roller becomes the
    same roller).

## Why this stays good for a long time

The reason the dice were wrong is that their appearance was **authored data**. Authored data rots: every new
die, skin, theme or system needs someone to draw it again, and nobody notices when one is missed — which is
precisely how a d100 shipped as a d10 and how a whole stylesheet shipped invisible on two systems.

After this, appearance is **computed from a definition**: a new die is a vertex table, a new skin is a
material, a new system inherits both for free. The tests assert properties of real objects (closed solids,
planar faces, camera-facing landings, contrast ratios, no overflow) rather than the presence of particular
code — so they keep holding as the implementation changes, which is the only kind of guard that survives.
