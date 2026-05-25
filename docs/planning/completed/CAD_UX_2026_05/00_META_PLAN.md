# CAD UX 2026-05 — Meta-Plan (a plan for the plans)

**Status:** IN-PROGRESS
**Owner:** CAD UX workstream
**Created:** 2026-05-25

This is the **plan for creating plans**. It defines how the individual feature
plans in this folder are written, sequenced, implemented, and retired. It does
not itself contain feature work — its single deliverable is the set of child
plans listed below, written to this same folder.

---

## 1. Why this exists

A batch of CAD UX issues were reported in one session. Rather than implement
them ad-hoc, each gets its own planning doc with explicit, checkable action
items so progress is visible and the work ships in small, verifiable slices.

The issues:

1. **Modals** can't be moved or resized, and ~10 lack an X close button.
2. **AI chat** opens multiple competing surfaces ("two chat boxes"), isn't
   consistently right-docked, and loses earlier conversation context.
3. **Perpendicular / on-line offset line tool** — a new drawing tool that
   starts locked onto an existing line and extends off it (90° by default, or
   a fixed angle / azimuth), with numeric length + bearing inputs and
   far-endpoint snapping onto a second line.

(Two related right-click context-menu bugs from the same session — off-screen
rendering and open/close flicker — were already fixed and are out of scope
here.)

---

## 2. Child plans this meta-plan produces

Each is a sibling doc in `docs/planning/in-progress/CAD_UX_2026_05/`:

- [x] `01_MODAL_FRAMEWORK_ROLLOUT.md` — shared draggable/resizable modal shell
  + migration of every dialog onto it + missing X buttons.
- [x] `02_AI_CHAT_CONSOLIDATION.md` — one right-docked chat panel with
  renamable/closable, auto-named conversation tabs; persistence; retire the
  duplicate surfaces.
- [x] `03_PERPENDICULAR_LINE_TOOL.md` — replace the existing point→line
  PERPENDICULAR tool with the on-line offset workflow + floating numeric panel
  + dual-line snapping.

---

## 3. Plan document conventions

Every child plan MUST contain, in order:

1. **Header block** — Status, one-paragraph goal, the user-reported symptom(s)
   it resolves.
2. **Current state** — what exists today with `file:line` anchors, and what is
   already shipped (so we never redo finished work).
3. **Design** — the chosen approach and the key decisions already locked with
   the user, plus any explicitly deferred scope with a one-line rationale.
4. **Action items** — a flat `- [ ]` checklist of small, individually
   shippable slices. Each slice is a single commit that type-checks and lints.
   Mark `- [x]` only when genuinely shipped.
5. **Definition of done** — the observable end state.
6. **Risks / verification** — how each slice is validated (unit tests where
   pure logic exists; note explicitly where only manual browser testing can
   confirm UI behavior, since this environment can't drive a browser).

---

## 4. Sequencing across the child plans

Implement in this order (lowest cross-dependency / highest leverage first):

1. **Perpendicular line tool** — most recently requested; geometry core is
   already shipped and unit-tested, so only canvas wiring remains.
2. **Modal framework rollout** — `ModalFrame` shell is already shipped;
   remaining work is mechanical per-dialog migration, low coupling.
3. **AI chat consolidation** — largest rewrite; the engine continuity fix is
   already shipped, so this plan focuses on the new tabbed panel + persistence.

Within a plan, ship slices top-to-bottom. A plan is not "done" until every
action item is checked or explicitly deferred with a rationale.

---

## 5. Lifecycle

- This meta-plan moves to `completed/CAD_UX_2026_05/` once all three child
  plans exist and are well-formed (its only deliverable). That is its
  definition of done — it does not wait on the features themselves.
- Each child plan moves to `completed/CAD_UX_2026_05/` when all its action
  items ship, updating any `// Spec:` comments and cross-links per the
  `docs/planning/README.md` rubric.
- When `in-progress/` is empty again, the workstream is complete.

---

## 6. Definition of done (this meta-plan)

- [x] The three child plans above are written to this folder and conform to
  the §3 conventions.
- [x] This doc is moved to `completed/CAD_UX_2026_05/` once the child plans
  exist (done 2026-05-25; child plans 01/02/03 are live in `in-progress/`).
