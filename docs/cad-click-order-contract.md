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

## Checked against the handlers — C14b, 2026-08-15

The section below this one used to say the contract had *not* been checked against the handlers and
that C14 was expected to find real deviations. It did, and so did C14b. `node
scripts/cad-tool-contract-audit.mjs` is the behaviour sweep, run over all 51 tools and ratcheted by
`__tests__/cad/tool-contract-ratchet.test.ts`.

**29 of the 51 tools are staged** — they park a pending pick between clicks. Nine of them parked it
somewhere neither the prompt nor Escape could see:

| Tool(s) | Pending field |
|---|---|
| MOVE, COPY, SCALE | `basePoint` |
| ROTATE | `rotateCenter` |
| FILLET / CHAMFER | `filletPickedLineId` / `chamferPickedLineId` |
| MATCH_PROPERTIES | `matchPropertiesSourceId` |
| PERPENDICULAR | `perpStartPoint` |
| ARRAY (polar) | `arrayPolarCenter` |

Both the command prompt and the universal Escape asked `drawingPoints.length`, which is the right
question for the other 22 and the wrong one for these. The prompt froze on stage 1 — pick a line
with FILLET and the command line still says *"Click the FIRST line"* — and Escape skipped step 1
entirely, taking the tool away instead of the pick. `MATCH_PROPERTIES`' own code comment promises
it *"stays in apply mode until the surveyor hits Esc"*, and Esc did something else.

One definition now serves both, in `lib/cad/store/tool-store.ts`: `hasPendingPick`, `pickStage` and
`clearPendingPick`, built from one list of fields. Two symptoms that looked unrelated were one
missing definition, which is the same shape C14 found and the reason it was worth looking twice.

Two corrections to the table above, found by reading the handlers:

- **TRIM and EXTEND are not pick-two.** Both act on a single click — TRIM removes the section
  between two crossings, EXTEND lengthens the end nearest the cursor. They are pick-then-act, and
  their prompts say so.
- **DRAW_TEXT and DRAW_IMAGE cannot preview.** Both open an editor at the click and their content
  does not exist until afterwards, so the crosshair and snap marker are the whole of the available
  answer. **DRAW_POINT is different and did have a real gap** — what it places is fully determined
  before the click, and it now draws a cursor ghost using the same style `createFeature` will
  build, at the *snapped* position rather than the raw cursor.

---

## What this document does NOT claim

Two things are deliberately left open for C14 to decide with the tools in front of it:

- **Double-click as a commit** alongside Enter. AutoCAD accepts both; whether this editor should
  depends on whether double-click already means something on the canvas.
- **Right-click as a commit.** Some CAD products use it; this contract says it opens a context menu
  instead, because a right-click that sometimes commits and sometimes opens a menu is worse than
  either.
