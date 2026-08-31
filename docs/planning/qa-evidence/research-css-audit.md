# `AdminResearch.css` — what is in it, and what is safe to touch

**Measured 2026-08-30.** Phase A1 of `docs/planning/in-progress/RESEARCH_UI_OVERHAUL_2026-08-30.md`.

**No CSS was changed in producing this.** That is the point of the slice: deleting or renaming
before knowing what renders is how a working screen disappears.

---

## The shape of the file

| | |
|---|---|
| Lines | **12,083** |
| Distinct class names defined | **1,353** |
| Distinct class families (the `block` in `block__element--modifier`) | **84** |
| Loaded by | `app/admin/research/layout.tsx` — **route-scoped to `/admin/research/**`** |
| Also loaded by | `app/ux-harness/UxHarnessClient.tsx` |

Largest families:

| Family | Classes |
|---|---|
| `research-search` | 120 |
| `research-briefing` | 57 |
| `research-element-panel` | 54 |
| `research-verify` | 54 |
| `research-review` | 48 |
| `research-pipeline` | 48 |
| `research-viewer` | 46 |
| `research-analyzing` | 43 |
| `coherence-review` | 39 |
| `research-disc` | 37 |

---

## ⚠ The finding that matters most: **you cannot grep your way to a dead class here**

A naive scan says 204 of 1,353 classes (15%) never appear in `app/` or `lib/`. **That number is not
a deletion list, and acting on it would break working screens.**

**62 files in `app/admin/research` build class names at runtime.** For example:

```tsx
<li className={`adjoiner adjoiner--${row.depth}`}>
```

`adjoiner--declined`, `adjoiner--requested` and `adjoiner--researched` are all in the "never
referenced" list. All three render. The string never appears in the source because it does not
exist until the component runs.

Splitting the 204 by how trustworthy each part is:

| Bucket | Count | Verdict |
|---|---|---|
| **Modifier variants** (`--suffix`) | **74** | **Do not trust.** This is exactly the shape that gets composed. Treat as LIVE unless individually proven otherwise. |
| Plain classes, but their family stem IS referenced | 107 | **Suspicious, not dead.** The block renders; this element may be composed, conditionally rendered, or genuinely orphaned. Needs per-case reading. |
| Plain classes whose whole family stem is also unreferenced | **23** | **The only defensible dead list.** Nothing references any part of the family. |

Note the direction of error in the other half too: the scan matches substrings, so a short class
name is marked "used" when it merely appears inside a longer one. **"Referenced" is generous;
"never referenced" is conservative.** That asymmetry is deliberate — an audit whose purpose is to
avoid deleting live code should err toward believing things are alive.

### The 23-class defensible list

One coherent block, plus fragments:

- `research-configure` — the entire family (8 classes: `__actions`, `__desc`, `__header`,
  `__summary`, `__summary-item`, `__summary-label`, `__summary-value`, and the block itself)
- the remainder are scattered singletons across `coord-entry`, `misc-docs-toggle`, `research-canvas`
  and `research-stage2`

**Even these are not cleared for deletion by this document.** They are cleared for *investigation*:
a family can be unreferenced because the screen that used it was consolidated away — in which case
the CSS is genuinely dead — or because the component that renders it is itself an orphan nobody
mounts, which is a different bug with a different fix (this repo has 61 such modules; see
`npm run verify:orphans`).

---

## What this means for the later phases

**Phase A2 (primitives)** — unaffected. New components ship with their own stylesheet beside them,
so nothing here blocks it.

**Phase A3 (the class guard)** — this audit is its baseline. A guard asserting "every rendered class
is defined somewhere" must handle the 62 dynamic call sites, or it will produce exactly the false
positives above. The workable shape is to assert on the STEM (`adjoiner--` is defined) rather than
the composed name, and to allow a known-set baseline that may only shrink.

**Phases B–E (per-area work)** — each slice trims its own area, having read it. A 12,000-line rewrite
in one pass cannot be reviewed, and this file is now the map for doing it piecemeal.

---

## How to reproduce

The numbers above come from: extracting `\.([a-zA-Z_][\w-]*)` from the stylesheet, then testing each
against the concatenated `.ts`/`.tsx` sources of `app/` and `lib/`, then partitioning by whether the
name contains `--` and whether its stem is separately referenced. Re-run before trusting any of it —
the counts move every time a component lands.
