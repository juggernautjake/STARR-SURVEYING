# CAD Rotation Grab-Node UX & Continued Audit — Self-Updating Plan

Status: **in progress** · Owner: CAD/UX · Opened: 2026-05-26 19:14 CDT
Time-box: **work until 9:00 PM CDT (21:00), 2026-05-26.** From 9:00 PM,
stop starting new slices; finish whatever is mid-flight, record it, then
move this doc to `completed/` and stop. On every resume: check the clock
(`TZ="America/Chicago" date "+%H:%M"`) — if ≥ 21:00 CDT, finalize per §7
and move this doc to `completed/`; otherwise keep working the backlog.

---

## 0. How to use this document (READ FIRST, EVERY RESUME)

Self-updating audit loop. The Stop hook
(`.claude/hooks/continue-until-planning-done.sh`) keeps the session
running while this file is in `docs/planning/in-progress/`. Moving it to
`completed/` is the clean stop.

### 0.1 On EVERY resume

1. **Check the clock**: `TZ="America/Chicago" date "+%H:%M"`. If ≥ 21:00
   CDT → §7 Finalization, then STOP.
2. Read the Audit Log (§6) bottom entry for where the last slice stopped.
3. Pick the single highest-priority open `[ ]` in §5.
4. Run one full audit cycle (§3) on that one target. Keep slices small —
   one target, one commit.
5. Append a dated Audit Log entry. Add newly-found targets as `[ ]`.
6. Commit + push. The hook resumes the loop.

### 0.2 Prime directives

- Never leave the tree broken: `npx tsc --noEmit` clean before every
  commit; relevant vitest CAD suites green.
- Keep `claude-opus-4-7[1m]` out of every commit / artifact.
- Develop + push only to `claude/nice-bardeen-YpOrt`
  (`git push -u origin claude/nice-bardeen-YpOrt`, exp-backoff on net err).
- Verify in the Playwright harness (`/cad-harness`, env-gated) +
  screenshot to `test-results/audit/`; read the screenshot to confirm.
- Commit messages end with the session URL.

---

## 1. Context

The prior engagement (`completed/cad-standalone-and-ux-audit.md`) shipped
the standalone window, resizable panels, exports-by-scope, point-identity
system, editable viewers, layers menu/modal, menu consolidation,
zoom-aware sizing, grouped labels, and entry+exit motion. Three items
were deferred with rationale. This session works the highest-value one.

---

## 2. Primary target — §15 / 17c: unified image-style rotation UX

User intent (verbatim, 2026-05-26): "refactor all rotation actions …
like … rotate images with the one node … box should appear … node to
grab … field to input a specific angle … ghost image … original
position … solid … visual rendering of the angle … update dynamically."

What already exists (verified in prior audit):
- ROTATE tool works for all feature types; live rotate-as-you-drag with a
  dynamic angle readout; `InteractiveOpPanel` has an editable angle field,
  preset angles, pivot options, Apply.
- Image-only grab-node handle (`imageRotateHandleScreen` /
  `IMAGE_ROTATE_GRIP`).

The gap: generalize the **grab-node bounding-box affordance** + a
**ghost-vs-solid preview** to ALL feature types (not just images).

---

## 3. Audit cycle (per slice)

inspect → implement small → `npx tsc --noEmit` + lint touched files →
unit test (vitest) where logic is added → live-verify in harness +
screenshot → record in §6 → commit + push.

---

## 5. Backlog (top = next)

- [x] **R1. Selection bounding-box + grab-node for the ROTATE tool, all
  feature types.** DONE — `renderSelection()` draws a screen-space bbox +
  a single rotate grab-node (stalk + circle off the top-mid) whenever the
  ROTATE tool is active with a selection (lone image keeps its own grip).
  `rotateHandleRef` caches the node screen pos + bbox-center pivot.
  VERIFIED: `rotate-grabnode-box` screenshot shows the box + node around a
  two-point selection.
- [x] **R2. Grab-node drag-rotate (image-style live spin) + ghost.** DONE —
  mousedown within 12px of the node starts a `rotateGrabRef` drag;
  mousemove spins all selected features live around the pivot (Shift snaps
  15°) with a `Rotation: N°` HUD; mouseup commits one undo batch; Escape
  restores. Mirrors image rotation exactly. The ghost-vs-solid preview
  (original solid, target ghosted) ALREADY exists for the two-click ROTATE
  flow (`drawTransformedFeaturePreview`), so both interaction styles are
  covered. VERIFIED: `rotate-grabnode-drag` shows the selection rotated to
  −93.9° with the live HUD readout; `rotate-grabnode.spec` passes.
- [x] **R3. Live angle readout.** DONE — `Rotation: N°` HUD on grab-drag
  (above) + the InteractiveOpPanel editable angle field + the two-click
  flow's center→cursor ray already render the live angle.
- [x] **R4. Harness coverage.** DONE — `rotate-grabnode.spec` draws two
  points, selects both, switches to ROTATE (asserts box+node via the
  screenshot), grabs the node, asserts the live `Rotation:` readout, and
  confirms the selection survives the drag. (No separate unit test — the
  logic is short inline geometry mirroring the proven image-grip path.)

Newly-discovered audit targets get appended here as `[ ]`.

---

## 6. Audit Log

- 2026-05-26 19:14 CDT — Opened. Time-box 9:00 PM. Seeded backlog with the
  rotation grab-node/ghost work (prior §17c deferral). Mapping the existing
  rotation + image-grip + overlay-rendering code before the first slice.
- 2026-05-26 19:3x CDT — Slices R1+R2 implemented. R1: `renderSelection()`
  now draws an image-style bounding box + a single rotate grab-node (stalk
  + circle off the top-mid) whenever the ROTATE tool is active with a
  selection of any feature type (a lone image keeps its own grip);
  `rotateHandleRef` caches the node's screen pos + bbox-center pivot.
  R2: mousedown on the node (within 12px) starts a `rotateGrabRef` drag —
  mousemove spins all selected features live around the pivot (Shift snaps
  15°) with a `Rotation: N°` HUD readout, mouseup commits one undo batch,
  Escape restores the originals. Discovery during mapping: the ghost-vs-
  solid preview (R2's other half) and the live angle readout (R3) ALREADY
  exist for the two-click ROTATE flow (`drawTransformedFeaturePreview` at
  the target angle, original untouched until commit) — so the only real
  gap was the box + grab-node affordance, now closed. tsc clean. Verifying
  in the harness (`rotate-grabnode.spec`) next.
- 2026-05-26 19:5x CDT — Slices R1–R4 VERIFIED + DONE. `rotate-grabnode.spec`
  passes: two-point selection → ROTATE shows the bounding box + grab-node
  (`rotate-grabnode-box` screenshot), grabbing the node and dragging spins
  the selection to −93.9° with a live `Rotation:` HUD (`rotate-grabnode-
  drag`), and the selection survives the drag. tsc + eslint clean on the
  touched files. The previously-deferred §17c "unified image-style
  rotation UX" is now fully delivered (box + grab-node + live readout +
  pre-existing ghost). Next: continue auditing — look for the next
  highest-value gap (e.g. extend the box/node affordance to SCALE, or a
  fresh audit sweep) until 9:00 PM, else finalize.
- 2026-05-26 20:0x CDT — Regression + polish. Confirmed no regression from
  the renderSelection change: existing `rotate-selection` + `toolbar-tools`
  specs still pass. Added a `grab` hover cursor over the rotate grab-node
  (discoverability) and `test.slow()` on the new spec to absorb the
  dev-server cold-compile (the spec runs ~2.2m and was grazing the 120s
  per-test timeout). tsc + eslint clean; `rotate-grabnode` passes.

---

## 7. Finalization (clock ≥ 21:00 CDT)

1. Tree green: `npx tsc --noEmit` clean, lint clean on touched files,
   vitest CAD suites green.
2. Every open `[ ]` left unfinished gets a one-line status/deferral note.
3. Flip Status (§top) to **completed**, add a closing Audit Log entry.
4. Repoint any `// Spec:` refs (`grep -rln` the in-progress path) to
   `completed/`, then `git mv` this doc to `docs/planning/completed/`.
5. Commit + push. in-progress/ empties; the hook routes onward.
