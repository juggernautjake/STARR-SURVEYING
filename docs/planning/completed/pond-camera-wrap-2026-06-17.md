# Pond camera wrap — 2026-06-17

> User: "It would be cool if after scrolling for a while with no
> orbs/pucks in view, the view kind of reset so that we go past
> the orbs/pucks again. that way we don't scroll endlessly. Kind
> of like in one of those videogames where if you walk off the
> right side of the screen you appear on the left … This
> reappearing of the tokens/icons would be omni directional.
> Please plan this out and figure out how to make it so that the
> viewer rerenders dynamically and smoothly without the user
> noticing so that we start again at the opposite side of where
> we are scrolling and the objects come into view again."

## What the user wants

P4b shipped an omni-directional scroll ring that pans the camera
across a fixed world. Today the camera is clamped at
`PAN_MAX_OFFSET_PX = 720`, so the user can scroll past the orbs
and hit a wall. They want the wall replaced with a Pac-Man-style
wrap: when the viewport is empty AND the user is still panning,
the camera quietly hops to the OPPOSITE side of the orb cluster
so orbs come into view from the leading edge again. Works in
every direction.

## Design

**Trigger.** Each rAF tick, after the camera step:
1. The pan velocity is non-zero (user is actively holding the
   ring).
2. No orb is within the visible viewport
   (`||orb - camera|| > pondRadius + orbRadius` for every orb).

**Action.** Teleport the camera to
`-panDirection * (pondRadius + orbRadius + WRAP_BUFFER)`. That
puts the camera just past the orb cluster on the side OPPOSITE
the pan direction. The pan velocity stays the same, so the next
frame the camera advances toward the origin and orbs at world
(0,0) start crossing into the viewport from the leading edge.

**Invisible.** The teleport ONLY fires when the viewport is empty,
so neither the pre-jump frame nor the post-jump frame has anything
visible inside the pond — the user can't see the jump happen.
Particles + the pond background stay static; only the
camera-layer transform changes.

**Reset still recenters.** P4a/P4b's `handleReset` already moves
the camera to (0, 0) and stops the pan loop; that behavior is
unchanged. The wrap only fires during an active pan.

## Notes

- Replaces the practical effect of `PAN_MAX_OFFSET_PX`. The clamp
  is bumped to 4000 (still a hard safety net if wrap doesn't
  fire for some edge case) but in normal use the wrap kicks in
  long before the clamp does.
- Gravity in `lib/employee-pond/physics.ts` still pulls orbs to
  world (0, 0), so orbs remain clustered near origin no matter
  how many wraps happen. The wrap is a camera trick, not a
  physics change.
- `WRAP_BUFFER = 16px` keeps the leading edge just outside the
  viewport at the moment of wrap so orbs slide in smoothly
  rather than popping into existence at the edge.

## Slice plan

| Slice | What ships |
|---|---|
| **W1** | Thicker / easier-to-click scroll ring stroke + `maybeWrapCamera` pure helper + wiring into the pan rAF + bump clamp; unit + source-lock tests ✅ shipped |
| **W2** | Toolbar centered over the pond + count moves to its own row above the circle + filter-wrap pinned to 40px so the button truly aligns with the search input ✅ shipped |

## Secondary user ask (folded into W1)

> "Also, can you make the scroll ring outline on the circle a bit
> thicker and easier to click. Right now it is a bit hard to
> select with how thin it is."

Bump the SVG circle's `stroke-width` (viewBox units) from
`1.4 → 3.0` at rest and `2.4 → 4.6` on hover. Because the SVG
viewBox is `100×100` and the rendered size is ~752×752 px, those
viewBox units come out to ~22 px / ~35 px of clickable stroke —
roughly double the previous footprint, so the ring is genuinely
easier to grab without overlapping into the pond viewport.
