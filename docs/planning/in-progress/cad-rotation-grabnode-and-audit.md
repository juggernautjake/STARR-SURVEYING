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

- [ ] **R1. Selection bounding-box + grab-node for the ROTATE tool, all
  feature types.** When ROTATE is active with a selection, draw a
  screen-space bounding box around the selection with a single rotate
  grab-node (mirroring the image grip). Hit-test the node so dragging it
  drives the rotation (reusing the existing live-rotate math/pivot).
- [ ] **R2. Ghost-vs-solid preview during rotate-drag.** While dragging
  the grab-node (or the angle field), render the original geometry solid
  and a semi-transparent ghost at the target angle, instead of mutating
  the real geometry live. Commit on release / Apply.
- [ ] **R3. Live angle arc/readout at the pivot.** Draw the angle sweep
  (from start ray to current ray) at the pivot with the degree readout,
  updating dynamically — reinforcing the InteractiveOpPanel number.
- [ ] **R4. Unit + harness coverage.** Pure helpers (bbox of a selection,
  grip screen position, angle-from-pointer) get vitest tests; a harness
  spec selects a feature, switches to ROTATE, asserts the box + grip
  render and that a grip drag changes the angle readout. Screenshot.

Newly-discovered audit targets get appended here as `[ ]`.

---

## 6. Audit Log

- 2026-05-26 19:14 CDT — Opened. Time-box 9:00 PM. Seeded backlog with the
  rotation grab-node/ghost work (prior §17c deferral). Mapping the existing
  rotation + image-grip + overlay-rendering code before the first slice.

---

## 7. Finalization (clock ≥ 21:00 CDT)

1. Tree green: `npx tsc --noEmit` clean, lint clean on touched files,
   vitest CAD suites green.
2. Every open `[ ]` left unfinished gets a one-line status/deferral note.
3. Flip Status (§top) to **completed**, add a closing Audit Log entry.
4. Repoint any `// Spec:` refs (`grep -rln` the in-progress path) to
   `completed/`, then `git mv` this doc to `docs/planning/completed/`.
5. Commit + push. in-progress/ empties; the hook routes onward.
