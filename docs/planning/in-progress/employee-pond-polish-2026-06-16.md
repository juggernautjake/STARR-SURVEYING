# Employee pond polish — 2026-06-16

> User feedback after the initial pond build is live. Four focused
> polish items + one new feature (the scroll ring + reset).
>
> Every slice ships with the standard three post-build checks
> (typecheck, lint, vitest) per the user's standing ask.

## What the user asked for

1. Rename the toggle button from **"Pond"** to **"Interactive"**.
   Keep the internal localStorage key + URL/data values stable for
   back-compat.
2. Soften the physics. Currently the orbs are too bouncy — hover
   pops them around violently. Cut the collision force to ~⅓ of
   today's value; keep the floaty/organic movement.
3. Make the pond view bigger.
4. Toolbar layout fix:
   - Shorter search bar (the field currently takes the entire row).
   - Vertical alignment with the **Filter by role** button (today
     the filter button sits a few px lower than the search field).
5. Drag the orb to bump it into others. Today click-and-drag grabs
   the underlying avatar `<img>` element via the browser's native
   image-drag instead of activating our pointer drag handler.
6. Omni-directional scroll ring:
   - A circular outline around the pond.
   - Hover: the ring enlarges slightly and shows a "Click to scroll"
     tooltip.
   - Click + hold on a side of the ring: the camera pans in that
     direction. Releasing stops the pan.
   - Gravity stays anchored to the world origin so orbs always
     drift back toward where they started.
7. **Reset** text-link below the pond viewer — returns the camera
   to center and re-randomizes the orb starting positions.
8. List below the pond should be centered, not left-aligned.

## Slice plan

| Slice | What ships |
|---|---|
| **P1** | Rename "Pond" → "Interactive" + toolbar alignment + drag-image fix + centered list |
| **P2** | Soften physics — repulsion + hover bump cut to ~⅓ |
| **P3** | Bigger pond — `POND_RADIUS_PX` 280 → 360 |
| **P4** | Camera offset + omni-directional scroll ring + reset link |

Each slice runs the three post-build checks and lands in its own
commit so a regression can be bisected cleanly.

## Notes locked from the spec

- **Internal value stays `'pond'`**: the localStorage key
  `'admin/employees/view'` keeps `'pond'` as the value for
  back-compat (anyone on the existing branch keeps their toggle).
  Only the user-facing label changes.
- **Gravity origin is the world (0, 0)**: when the camera pans,
  orbs continue to feel pulled toward the same world point. This
  reads as "scrolling lets you reveal off-screen orbs that have
  drifted out, then watch them drift back". Matches the soft
  viewport from E10b.
- **Reset re-randomizes the starting positions**: matches the
  user's spec ("refresh all of the employee icons/orbs"). The
  physics seed bumps so a new placement is produced.
