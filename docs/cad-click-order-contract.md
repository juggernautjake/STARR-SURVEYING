# The click-order contract

C13 of `docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md`.

> **Owner:** *"Please make sure when we are drawing, that the order of clicks and placement of
> points and lines works well and is intuitive."*

D5: **click order is a specification, not a preference.** Without the sequence written down there is
nothing to test and every review is an opinion. This is that document. C14 is graded against it.

---

## The four questions

A surveyor holding the mouse has exactly four questions, and a tool is unintuitive precisely when it
does not answer them:

| # | Question | Where the answer belongs |
|---|---|---|
| 1 | **What does my first click do?** | The tool's description, and the command prompt |
| 2 | **How does this end?** | A stated click count, a double-click, or Enter |
| 3 | **How do I get out?** | Escape, always, from any state |
| 4 | **What will I get before I commit?** | A live preview |

"Intuitive" is not a feeling to be argued about. It is these four, answered.

---

## The measured state (2026-08-15)

`node scripts/cad-click-order-audit.mjs` over the 58 toolbar entries:

| | count |
|---|---|
| Answers all four | **1** |
| Answers three | 2 |
| Answers two | 19 |
| Answers one | 29 |
| **Silent on all four** | **7** |

| Axis | Not answered |
|---|---|
| How the tool **ends** | **33 of 58** |
| **Escape** | **56 of 58** |
| **Preview** | **56 of 58** |

**This is a documentation measurement, not a behaviour one.** A tool that never mentions Escape may
well handle Escape perfectly — the audit reads what the product *tells the surveyor*, because a
capability nobody is told about is one nobody uses. C14 checks the behaviour; this establishes what
the behaviour should be and where the product is currently silent about it.

The 56/58 on Escape and preview is the striking number, and it is not 56 separate oversights: it is
one convention that was never written down, so nobody wrote it into a description.

---

## The contract

Drawn from **AutoCAD / Civil 3D convention** (D5), because the surveyors using this have that muscle
memory and a tool that surprises a trained user is the definition of unintuitive here.

### Universal — every tool, no exceptions

| Input | Behaviour |
|---|---|
| **Escape** | Cancels the current operation and returns to SELECT. From *any* state, including mid-sequence. Never a no-op. |
| **Escape (idle)** | Clears the selection. |
| **Right-click** | Context menu for the thing under the cursor. Never a hidden "commit". |
| **Enter** | Ends a variable-length sequence (polyline, freehand, area). Never required for fixed-length ones. |
| **The prompt** | The command line always states what the tool wants NEXT — "Specify start point", "Specify through point". A silent tool is an unfinished tool. |
| **Preview** | Anything that will be created is drawn live before commit, from the moment there is enough information to draw it. |

### By tool shape

| Shape | Tools | Sequence |
|---|---|---|
| **Zero-click** | `SELECT`, `PAN` | Immediate. Drag to box-select / pan. |
| **One-click place** | `DRAW_POINT`, `DRAW_TEXT`, `DRAW_IMAGE` | Click places it. Preview follows the cursor. |
| **Two-click fixed** | `DRAW_LINE`, `DRAW_RECTANGLE`, `DRAW_CIRCLE`, `DRAW_ELLIPSE`, `DIM` | Click 1 anchors, click 2 commits. Preview from click 1. No Enter. |
| **Three-click fixed** | `DRAW_ARC`, `CURB_RETURN` | Click 3 commits. Preview from click 2. |
| **Variable-length** | `DRAW_POLYLINE`, `DRAW_POLYGON`, `DRAW_SPLINE_*`, `MEASURE_AREA` | Click to add; **Enter or double-click** commits; Escape abandons the whole run. Preview includes the segment to the cursor. |
| **Drag-capture** | `DRAW_FREEHAND` | Press, drag, release commits. |
| **Pick-then-act** | `ERASE`, `EXPLODE`, `REVERSE`, `LIST`, `SMOOTH_POLYLINE`, `SIMPLIFY_POLYLINE` | Click the target; acts immediately. Hover highlights what will be affected. |
| **Pick-two** | `TRIM`, `EXTEND`, `FILLET`, `CHAMFER`, `JOIN`, `SPLIT`, `MATCH_PROPERTIES` | Click source, then target. The prompt names which is which. |
| **Selection-then-basepoint** | `MOVE`, `COPY`, `ROTATE`, `SCALE`, `MIRROR`, `ARRAY` | Selection first, then base point, then destination/angle/factor. Preview from the base point. |
| **Numeric-assisted** | `OFFSET`, `PERPENDICULAR`, `POINT_AT_DISTANCE`, `FORWARD_POINT` | Pick the reference, then either click or type an exact value. Both paths always available — see C16. |
| **Vertex** | `INSERT_VERTEX`, `REMOVE_VERTEX` | Click the polyline, then the vertex/segment. |

---

## What this document does NOT claim

It has **not** been checked against the handlers. It states what the tools should do and measures
what they currently *say*; whether each one behaves this way is C14's job, and the expectation is
that C14 finds real deviations — the audit above is a strong hint that Escape and preview are
inconsistently implemented, not merely inconsistently described.

Two things are deliberately left open for C14 to decide with the tools in front of it:

- **Double-click as a commit** alongside Enter. AutoCAD accepts both; whether this editor should
  depends on whether double-click already means something on the canvas.
- **Right-click as a commit.** Some CAD products use it; this contract says it opens a context menu
  instead, because a right-click that sometimes commits and sometimes opens a menu is worse than
  either.
