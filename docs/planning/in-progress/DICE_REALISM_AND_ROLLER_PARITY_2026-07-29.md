# Dice realism & roller parity — 2026-07-29

> ## ✅ ANSWERED 2026-07-30 — **one size per screen**
>
> > *"All templates still share ONE size — but that size is derived from the tallest roller's content and
> > recomputed per screen. On a phone it becomes a full-width sheet sized to the viewport. Consistency
> > holds within any given screen, and nothing ever scrolls."* — owner, choosing between four options.
>
> **Both asks survive, and neither is downgraded.** 07-28's *consistent size, template to template* is
> read as consistent **at a given screen** rather than one universal constant; 07-29's *never scrolls* is
> then satisfiable because the size can shrink to the viewport instead of overflowing it. `FIXED_W = 396`
> / `FIXED_H = 560` become the DESKTOP ideal, clamped down per viewport, never a value the window exceeds.
>
> **What this unblocks, and what each now has to do:**
>
> - **D7-1** — the size becomes a pure function of the viewport, shared by every template. Three live bugs
>   fall out of the reading and are recorded below rather than fixed in passing.
> - **D7-3** — the sweep's definition of "correct at 360px" is now settled: the window is exactly as large
>   as the screen allows and no larger, and nothing inside it scrolls except the tagged roll history.
> - **D6-3** — the contact sheet uses the same Playwright harness, built once against a settled size.
>
> **Three defects this reading exposes in `useFloatingDock` — ALL THREE FIXED 2026-07-31, see D7-1:**
> 1. `loadDockState` pins `w: FIXED_W, h: FIXED_H` regardless of viewport, so a restored window on a phone
>    is larger than the screen.
> 2. The resize handler only ever `Math.min`s the stored size down — a phone rotated to landscape keeps
>    the portrait size and never grows back.
> 3. `reset()` sets `h: null` (content-fit), which is exactly the shape-changing behaviour 07-28 forbade —
>    so double-clicking the header still reintroduces the original complaint.

> ## ⚠ Previously blocked — everything else here is shipped
>
> **D1 through D6 are done.** Solids, projection, throw, `Die3D`, multi-dice, materials, sound, flare
> (D5-4 deferred with a reason), and D6's parity audit + guards. Plus two owner reports fixed on
> 2026-07-30: the d10's proportions and the settled-face facing.
>
> **The three remaining items all wait on the same answer**, and they are entangled rather than merely
> similar:
>
> - **D7-1** — the window-sizing slice, blocked since the doc was written because it would undo an
>   explicit owner decision from the day before.
> - **D7-3** — the no-scrollbar browser sweep. Its detector is shipped and tested; the sweep needs to know
>   what "correct" means at 360px, which is exactly what D7-1 decides.
> - **D6-3** — the contact-sheet matrix. Its guard is shipped; the screenshots need the same Playwright
>   harness as D7-3, and building that twice against a window size that may change is waste.
>
> **The question, restated:**
>
> > On **2026-07-28** you asked for the roller window to be *a consistent size, template to template*.
> > On **2026-07-29** you asked for it to *fully contain every roller's content and never scroll*.
> >
> > Those pull opposite ways on a small screen. When a roller genuinely cannot fit a 396×560 window on a
> > 360×640 phone — **which gives: the consistent size, or the no-scrollbar rule?**
>
> Answer that and D7-1, D7-3 and D6-3 unblock together. Delete the `HOOK:BLOCKED` line above to resume.

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

**SHIPPED 2026-07-29 — and the whole module went, `dieSides` included.**

The plan assumed `dieSides` would survive to answer "which die is being rolled". By the time D2-1 landed it
had stopped being asked: the tray derives every die's face count from `diceOf(breakdown)`, per die, so
`2d6[3,5] + 1d4[2]` renders three solids with three different side counts. A single whole-roll shape had no
meaning left. Its state in `ImpactRoller` was still being *set* on every roll and **never read** — dead
state feeding a dead module.

So the retirement is total: `dieShape.ts` (201 lines: `NETS`, `dieNet`, `ngonPoints`, `ngonClip`,
`ngonVerts`, `ring`, `dieSides`) and `__tests__/dnd/die-shape.test.ts` are deleted, and the `sides` state is
gone from `ImpactRoller`.

**The d100 → 10 bug went with it, and it is worth recording what kind of bug it was.** `dieSides` answered
`10` for a d100 — the shortcut G3 exists to forbid. It was no longer reachable (the live path had moved to
`diceOf` → `solidFor(100)` → the real 80-face geodesic), so nothing was visibly broken. That is the more
dangerous state, not the safer one: a second, wrong answer sitting next to the right one, indistinguishable
from the right one until someone reaches for it. The old test even *asserted* the wrong behaviour —
`expect(dieSides({ entry: { breakdown: '1d100[42]' } })).toBe(10)` with the comment "percentile reads as a
d10" — so the guard was pinning the defect in place.

**Guard:** `__tests__/dnd/die-shape-retired.test.ts` (6 tests) asserts the file is gone, that nothing imports
it under any spelling (prose mentions in `roll-stats.ts` are deliberately still allowed — it cites the module
as a cautionary tale), that the retired helper *names* have not reappeared in any roller under a new home,
that no roller substitutes a d10 for a d100, and that `solidFor` answers every standard die plus d3/d7/d30 as
real solids rather than a fallback badge.

*Follow-up, not a blocker:* `lib/dnd/roll-stats.ts:72` and `__tests__/dnd/roll-stats.test.ts:188` reference
`dieShape.ts` in comments as precedent for a trap. The file no longer exists, so those pointers are now
dangling — reword them to name the trap rather than the file next time either is touched.

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

**SHIPPED 2026-07-29 — already wired end to end; the real defect was next to it.**

The chain was verified rather than assumed, and it was already complete: `DicePad` calls
`rollDice(sides, count)` → both bespoke providers call `rollRaw(`${n}d${sides}`)` → `rollDiceExpr` emits a
breakdown of the form `2d6[3,5] = 8` → `diceOf` parses it into per-die values → the tray renders one solid
per die. So the count control has been driving real multi-dice display on PF2 and IG since D2-1 landed.

**What the check actually turned up was a cross-system parity bug.** `DicePad` carried its own literal die
list — `[4, 6, 8, 12, 20, 100]` — while the 5e Dice Core carries `[4, 6, 8, 10, 12, 20, 100]`. **A PF2 or IG
player could not roll a d10 and a 5e player could**, even though `STANDARD_DICE` has always listed it and
`solidFor(10)` has always drawn a real pentagonal trapezohedron for it.

That is precisely the D6-2 failure mode arriving early: which dice exist is **not** a system mechanic — a d10
is not a 5e concept — so a difference here is drift between two hand-maintained lists rather than a feature.
Fixed by deleting the second list: `DicePad` now imports `STANDARD_DICE` from `lib/dnd/dice/solids`, the
module that already has to know which dice exist in order to draw them.

**Guard:** `__tests__/dnd/dice-pad-parity.test.ts` (6 tests) asserts the canonical list contains every
standard die including the d10, that every die in it is actually drawable, that `DicePad` imports the
constant rather than re-declaring a literal, and that the 5e tray's remaining literal still equals it — which
keeps the two honest until the tray is migrated to the shared constant too.

*Method note worth keeping:* the guard reads **source files**, not rendered components, because this suite
runs `environment: 'node'` with no DOM. It also strips comments before scanning — on its first run it matched
the very comment explaining the old literal and reported the fixed file as still broken. A guard that reads
code has to actually read code.

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

## Owner report, 2026-07-30 — the d10's shape and the settled facing

> *"The d10 dice model looks skinny and funny… please make it so that the side that shows the final number
> is always directly facing the viewer when the roller is over for all dice that are rolled. All the dice
> look good except for the d10."*

**Both fixed. The d10 was 2.652× as tall as it was wide; every other solid measures exactly 1.000.**

`trapezohedron10` took the equator offset as its free parameter — chosen by taste at 0.28 — and SOLVED the
apex height from it, so the die's proportions were whatever fell out. What fell out was an apex 2.65× the
equator radius. `build()` then normalises every solid to unit circumradius, which for the d10 means dividing
by the APEX distance: the poles stay at ±1 and the equator shrinks to 0.38. A spindle. On every other die
the circumradius *is* the half-width, so normalising is invisible — which is why only this one was wrong.

The free parameter is now inverted: **the aspect is stated (1) and the offset is solved to produce it.**
That is the module's own rule — *"the geometry is derived, not typed"* — applied to the one place it was
not. The kites stay exactly planar, because the apex height is still solved from whatever offset results.

**Settled facing: `settleTilt` is now 0 for every die.** It returned 4°–25° so that neighbouring faces
stayed visible, on the reasoning that a die resting exactly square-on looks flat. That reasoning is about
how a die at rest LOOKS; the owner's ask is about what it SAYS, and the plan's own **G6 — legibility beats
realism, at every conflict** — already decided which wins. Verified numerically across every die and every
face: worst case **0.000003°** off dead-on.

**The cost, stated plainly:** a settled **d4 and d6 now draw a single face** — a flat triangle or square
with the number on it — because every neighbour of those solids is precisely edge-on from square-on. That
is geometry, not a bug, and it is the trade the request makes. Dice with more faces are unaffected: a d10
still shows three kites and a d20 ten facets, because their neighbours are not edge-on. `settleTilt` is kept
as a function returning 0 rather than deleted, so restoring a tilt for the low-face dice alone is a one-line
change with the original face-count reasoning still beside it.

Guarded by `dice-solids.test.ts` (every die is between 0.9× and 1.15× as tall as wide, **and the d10 is
still a genuine trapezohedron** — flattening the equator would fix the aspect by turning it into a bipyramid)
and by `dice-projection.test.ts`, whose old assertion that the tilt shrinks per die is replaced by one that
it is zero for all of them.

---

## Phase D5 — flare — **SHIPPED 2026-07-30, with D5-4 deferred**

- **D5-1 Bevel — SHIPPED.** Each face's own vertices pulled 12% toward its centroid and drawn as a second,
  darker polygon: the inset reads as the flat of the face, the band it leaves reads as the chamfer. A real
  die has no sharp corners, and without this a facet is one flat area meeting another, which is what makes
  a rendered die read as a diagram. **Derived from geometry already computed** (G3) — it works for a
  triangle, a kite and a pentagon with no special case, so the d100 and any die nobody has added yet get it
  free. Shaded relative to its OWN facet rather than a fixed colour, or a face already in shadow would gain
  a bright rim.
- **D5-2 Specular — was already shipped** with D1-4 (screen-space, so the die turns under the highlight).
- **D5-3 Rim light — SHIPPED.** An accent wash on the faces nearest EDGE-ON, which is where a back-light
  catches a real die. Strength follows the material's `bloom`, so neon plastic rims brightly and printed
  bone not at all, and it uses the same `--d3-edge` token the silhouette does — a die that glows teal on
  Hextech rims teal on Hextech, with no second palette to forget. Capped deliberately low: a rim light you
  notice as a rim light is a lighting bug (G6).
- **D5-4 Motion blur — DEFERRED.** The proposed implementation is an opacity-layered ghost of the previous
  frame's silhouette, which means keeping and drawing a second polygon per die per frame. The tumble is
  already re-projecting every solid every frame, and the Impact stage renders up to eight dice at once in a
  396px window; doubling the per-frame polygon count for an effect that is invisible at 108px is the wrong
  trade. Revisit if the dice ever render large.
- **D5-5 Landing impact — SHIPPED, without the dust.** One ring pulses out from the settle, alongside the
  squash `is-settled` already drove. **Deliberately one ring and no motes**: eight dice landing together
  would be eight particle systems, and the ring is the part that reads at this size. Keyed on the throw
  plan so it replays on every roll — a settle effect that fires only the first time looks broken the second.
- **D5-6 Crit / fumble — was already shipped**, recolouring the edge and the landing numeral.

Motion is gated (G5): the impact ring is `display: none` under `prefers-reduced-motion`. The bevel and rim
light are NOT gated, on purpose — they are shading rather than animation, and dropping them would give a
reduced-motion reader a flatter die rather than a calmer one.

Browser-verified on the Impact roller: a d20 renders 10 facets with 10 matching bevels, 6 rim-lit faces and
1 impact ring, on the `gem` material.

---

## Phase D6 — parity across systems, difference where it belongs

### D6-1 · Audit what actually differs — **DONE 2026-07-30**

Measured rather than assumed, against the source and then against the running app.

**No stage references a system at all.** Searched every roller component and stylesheet for `pathfinder2e`,
`intuitive-games`, `dnd5e-`, `data-system` and per-system class prefixes: **zero hits.** The guarantee D6-2
asks for already held — it simply had nothing asserting it.

**What legitimately differs is the CONTROLS, and only at the mount sites.** PF2 adds a Target DC input, IG
adds its own, 5e has adv/dis and Reckless. All three mount the same `rollerStageFor`, `RollerTemplateBar`
and `DicePad`. (`BuilderRoller` omits the template bar, which is correct — you are building a character, not
choosing how to watch a roll.)

**The one piece of real drift: the die list, written five times.** `[4, 6, 8, 10, 12, 20, 100]` appeared as a
literal in `DiceTray`, `ImpactRoller`, `RollBoard` and `SigilStack`, while `solids.ts` has exported
`STANDARD_DICE` with exactly those values all along and `DicePad` already imported it. Five hand-maintained
copies of one fact — which is precisely how `DicePad` lost the **d10** before D2-3 caught it.

### D6-2 · One stage, one look — **SHIPPED 2026-07-30**

All four panels migrated to `STANDARD_DICE`. Adding or removing a die is now one edit in the module that
draws them, and the four templates offer the same dice **by construction** rather than by four literals that
happen to agree.

The guard was rewritten to match. It had asserted that the 5e tray's *literal* still equalled the constant —
explicitly temporary, "until the tray is migrated to the shared constant too" — and it was watching two of
the five files while three went unwatched. It now asserts the stronger property over all five: each imports
`STANDARD_DICE`, and **none declares a die list of its own**.

Browser-verified across all four templates on a live sheet: `d4 d6 d8 d10 d12 d20 d100`, identical.

*Worth recording:* typecheck passed and 8,269 tests passed while the sheet returned **500 —
`STANDARD_DICE is not defined`**. That was a stale dev-server module graph after files were rewritten
outside the editor, not a code fault; it cleared on a restart with `.next` removed. But it is the third time
this session that only opening the page distinguished "wrong" from "fine", and the reason D6's stated
deliverable is screenshots rather than a green suite.

### D6-3 · Per-system controls, uniformly presented — **GUARD SHIPPED 2026-07-30; contact sheet deferred**

Measured: the two bespoke roller panels are **already identical** — same `.dnd-sheet` wrapper, same
`flex column / gap 8 / minWidth 0`, same order (template bar → stage → dice pad), same `--hx-*` vocabulary,
no hardcoded colours anywhere in either. PF2 adds a Target DC input and IG adds nothing, which is the
difference that belongs: PF2 resolves against a DC by degrees of success and IG does not.

**Nothing was holding them there.** Both are hand-assembled inline in two separate files, so the agreement
was a coincidence maintained by hand — which is exactly the state the Impact stage was in right up until one
mount site was written slightly differently. `__tests__/dnd/roller-system-parity.test.ts` (8 cases) now
asserts the wrapper, the order, the layout shape, the token vocabulary, and that the *only* difference is the
control each system adds.

**Verified the guard can fail**, which matters more than that it passes: changing IG's gap from 8 to 12 makes
it red, and reverting makes it green. A parity guard that cannot detect drift is worse than none, because it
reads as coverage.

**The contact sheet (4 systems × 4 rollers × 5 skins = 80 screenshots) is deferred**, and not for cost: it
needs the same Playwright sweep harness as D7-3, and D7-3 is blocked behind the D7-1 decision below. Building
the harness twice — once now against a window size that may change, once after — is waste. The structural
claim it would confirm is now asserted by the guard; what the screenshots add is the *visual* half, and that
is worth doing once, correctly, after the sizing question is answered.

---

## Phase D7 — the window is always the right size (G7)

### D7-1 · One size per screen — **SHIPPED 2026-07-31**

**The size is no longer stored, so it can no longer be restored stale.** That one change kills all three
defects the 07-30 answer exposed, because all three were the same mistake wearing different clothes: a
desktop ideal treated as a universal constant.

`FIXED_W`/`FIXED_H` are retired. `lib/floating.ts` gains `rollerSize(viewportW, viewportH, topInset)` —
pure, takes the viewport rather than reading it — plus `currentRollerSize()` for callers already in the
browser. `ROLLER_IDEAL_W = 396` / `ROLLER_IDEAL_H = 560` survive as a **ceiling**, not a value.

- **Defect 1 (restored window bigger than the phone):** `loadDockState` now derives the size instead of
  returning the constants. Position is still the player's preference; size is a fact about the screen
  they are on *right now*.
- **Defect 2 (the one-way ratchet):** the resize handler recomputes rather than `Math.min`-ing down, so a
  phone rotated to landscape grows back.
- **Defect 3 (`reset()` → `h: null`):** reset now means "this screen's size, in the default corner". The
  content-fit height that made the window change shape per template is gone from every path.

**Each axis is clamped on its own**, which turns out to matter: a 360×640 phone has 564px of usable height
— *more* than the 560 ideal — so only the width was ever wrong there. Clamping the pair together would have
shortened a window that fit.

**No minimum is applied**, deliberately. `MIN_W`/`MIN_H` belong to the drag-resize path; a floor here could
only ever bind on a screen *smaller* than it, and a window hanging off the side of a phone is worse than a
cramped one.

**The guard was pinning the defect, and had to be re-pointed.** `roller-height-parity.test.ts` asserted
`export const FIXED_W = \d+` and `w: FIXED_W, h: FIXED_H` — i.e. it required the viewport-blind behaviour
that defect 1 *is*. Same shape as `dieSides` answering 10 for a d100 with a test asserting it (D1-5), and
worth noting that it happened twice in one doc. It now asserts the property instead: no local size
constants at all, size derived in `loadDockState`, no `Math.min` ratchet, no `h: null` in reset.

Also retired: `DEFAULT_W = 396`, a third hand-maintained copy of the same number, still sitting next to the
other two as a measured-fallback. The fallbacks now call `currentRollerSize()`.

Coverage: `floating-roller-dock.test.ts` +9 cases (ideal where there is room, never exceeds it on a 4K
monitor, full-width sheet at 360px, height clamped at 380px tall, **`rollerSize.length === 3` so it cannot
take a template parameter** — the 07-28 ask made structural, header clearance, unmeasured-viewport
fallback, no minimum, and a sweep over six real device sizes). 71 tests green across the three roller
suites; typecheck and lint clean.

**D7-3 and D6-3 are unblocked by this** — "correct at 360px" now has a definition: the window is exactly
`360 − 2·EDGE` wide, and nothing inside it scrolls except the tagged roll history.

<details>
<summary>Original blocked note, kept for the decision trail</summary>

> ⚠️ **BLOCKED — this slice as written would undo an explicit owner decision from the day before, and
> needs the owner's call before anyone implements it.**
>
> `useFloatingDock` declares `FIXED_W = 396` / `FIXED_H = 560`, and those constants are not a guess that
> nobody revisited — they are the *fix* for a complaint the owner made on **2026-07-28**, recorded verbatim
> in the code:
>
> > *"the modal when open is a consistent size and is not resizable. It should always be big enough to show
> > all of the elements of the dice roller regardless of the roller template chosen."*
>
> Before that change the height WAS content-derived (`h: null`, "fit content") and drag-resizable — exactly
> what D7-1 proposes restoring. The result was a window that changed shape when you switched roller
> template (Impact's tall arena vs Sigil Stack's shorter stack), and any size a player had dragged to was
> then wrong for whichever template needed more room.
>
> So the two asks pull opposite ways and both are the owner's:
> - **07-28:** the window must be a *consistent* size, template to template.
> - **07-29 (this doc, ask 1):** the window must *fully contain* every roller's content, never scroll.
>
> Content-derived sizing satisfies the second by breaking the first. **The reading that satisfies both is
> to keep one fixed size and make it provably large enough** — derive the constant from the tallest
> composition across the whole matrix rather than from a guess, and let D7-3 prove it. That is a different
> slice from the one written here, so the doc is left honest rather than quietly rewritten.
>
> *Owner question:* when a roller genuinely cannot fit a small viewport (a 396×560 window on a 360×640
> phone), which gives — the consistent size, or the no-scrollbar rule?

*Answered 2026-07-30: neither gives — "consistent" is read as consistent per screen. See the shipped note
above.*

</details>

### D7-2 · The content must be able to fit — **SHIPPED 2026-07-30**

Roll history was the one unbounded section: the store keeps 40 entries and every roller rendered all of
them into a fixed-height `overflow-y: auto` box, so the window was always one busy combat away from being
the scroll container G7 forbids.

Capped at `HISTORY_PREVIEW = 5` — shared in `rollerAnim.ts` rather than declared per stage, because three
literals is how two end up at 5 and one at 8 and nobody notices which. "Show all *n*" expands **inside the
log's own scroller**, which is the reading that satisfies both of the owner's asks at once: the window keeps
the consistent size demanded on 07-28, and the section that was already the only permitted scroller absorbs
the rest. Measured live — the tray is **773px collapsed and 773px expanded**.

The permitted scroller is tagged `data-scrollable="true"` in the markup, which is what D7-3's detector reads,
so the permission stays next to the thing being permitted. The expand control is 44px tall — D7's own mobile
touch minimum.

Guarded by `__tests__/dnd/roller-history-cap.test.ts` (18 cases): the cap is applied, it is the *shared* one,
the log is tagged, the control is touch-sized, and no surface renders `{log.map(` unguarded.

#### The fourth roll log, which only the browser found

The first version of this covered the three roller **stages** and asserted "nothing else in the app renders
an unbounded roll log". **That was false when it was written.** `DiceTray` — the Dice Core, the roller the
5e sheet actually shows by default — has its own `tray-log` and was rendering all 40. Opening a sheet found
it in one query; the source-reading test had confidently said otherwise, because it only read the files it
already knew about.

The test now enumerates all four and its claim is true. Two things about that are worth keeping: a guard is
only as wide as its own list, and *"nothing else in the app"* is a claim a source-reading test cannot
actually make.

Breakdown rows are bounded by the roll, and multi-dice trays already scale rather than overflow, so those
halves of the slice needed nothing.

### D7-3 · Prove no scrollbar exists

**DETECTOR SHIPPED 2026-07-29; the browser sweep is the remaining half.**

`scripts/lib/overflow.mjs` gains `detectClipped(rootSelector)` and `detectOversized(rootSelector)`, with
16 tests in `__tests__/dnd/roller-clipping-detector.test.ts`.

**Why two new functions rather than a flag on `detectOverflow`.** The existing detector answers "does this
element paint outside the VIEWPORT" — and to answer that honestly it must exclude `position: fixed`
elements and anything inside a scroll container, because a docked FAB and a scrolling table are both doing
their job. For the roller window every one of those exclusions is inverted: the roller **is**
`position: fixed`, and becoming a scroll container **is** the defect. A flag reversing three of a
function's rules leaves both callers harder to reason about than two functions that each answer one
question.

Decisions pinned by the tests, each of which could reasonably have gone the other way:
- **`overflow: visible` is not clipping.** Tall content there *spills*, which `detectOverflow` already
  reports — counting it here would report one defect twice under two names, with two different fixes.
- **`overflow: hidden` IS clipping**, and ranks worse than `auto`: content nobody can even scroll to is
  more hidden, not less.
- **2px of sub-pixel slack.** Layout rounding routinely makes `scrollHeight` a pixel or two greater on a
  box that visibly clips nothing. A detector with false positives is one somebody switches off.
- **The permitted scroller opts in via `data-scrollable="true"`, and it inherits.** D7-2 allows exactly one
  (roll history). Putting the permission in the markup rather than a selector list in the detector keeps it
  next to the thing being permitted — the only version that stays true when the markup moves.
- **A missing root reports `found: false`, never a clean pass.** `count: 0` for a roller that never mounted
  is the precise false-green that lets a sweep "pass" on a page where nothing rendered.

*Test-environment note:* this repo runs vitest under `environment: 'node'` with no jsdom or happy-dom
installed. Rather than add a DOM dependency for one file, the test stubs the handful of browser calls the
detectors make — which doubles as the contract for what DOM surface they may rely on.

**Remaining:** wire it into a Playwright sweep over (system × roller × skin × dice-count × viewport)
including 360px, and tag the roll-history container with `data-scrollable="true"`. Blocked behind the D7-1
decision above, since what "correct" means at 360px depends on which of the two owner asks wins.

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
    same roller). — **RESOLVED 2026-07-30: nothing to migrate, and the caveat is the whole reason.**

    Checked all three. **None of them draws a die**, and none should. The Sigil Stack cascades tiles, the Roll
    Board deals cards, and the **Dice Core stage turns out to be a cycling numeric readout** — a large glowing
    number with circuit wires and a scan line, with no die anywhere in its markup. That last one is the only
    surprise and it has the same answer: its identity is a machine reporting a result, not a thrown object.

    So `Die3D` belongs in exactly one stage — Impact, whose identity *is* thrown dice — and it is already
    there. There is no migration behind this item; the parenthetical was the finding.

## Why this stays good for a long time

The reason the dice were wrong is that their appearance was **authored data**. Authored data rots: every new
die, skin, theme or system needs someone to draw it again, and nobody notices when one is missed — which is
precisely how a d100 shipped as a d10 and how a whole stylesheet shipped invisible on two systems.

After this, appearance is **computed from a definition**: a new die is a vertex table, a new skin is a
material, a new system inherits both for free. The tests assert properties of real objects (closed solids,
planar faces, camera-facing landings, contrast ratios, no overflow) rather than the presence of particular
code — so they keep holding as the implementation changes, which is the only kind of guard that survives.
