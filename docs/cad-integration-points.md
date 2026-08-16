# CAD integration points — the enumeration

> **C44a / C44b** of `docs/planning/completed/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md`.
> Regenerate with `node scripts/cad-integration-audit.mjs --markdown`.
> `--orphans-only` for the short version; `--json` for a machine-readable one.
> Guarded by `__tests__/cad/cad-integrations-reach-a-surface.test.ts`, which runs this same audit.

**61 integration modules across 5 areas. 60 reach a surface; 1 does not, by design.**

C44a found 62 across 6 and two orphans. C44b resolved one of them — see below — which took
`lib/cad/export/` with it.

## What "reachable" means here, and why it is not what the orphan ratchet asks

`__tests__/cad/cad-modules-are-reachable.test.ts` already asks *does any production file import
this module*, across all 248 modules in `lib/cad`. That is a necessary condition and a weak one: a
module imported only by another module that nothing mounts passes it, and so does a parser imported
by a component that is never rendered. **"Authored but not wired" is this codebase's most common
defect** precisely because having an importer is not the same as being reachable.

So this audit walks the importer graph *transitively* and asks a different question: starting at
this module, can you get to a page or an API route — something a person or another system can
actually invoke? Every row below therefore names a **surface**, not an importer.

| | Meaning |
|---|---|
| **PAGE** | Reachable from a Next.js page — a surveyor can get there in a browser. |
| **ROUTE** | Reachable from an API route — another system can call it. |
| **ORPHAN** | The graph runs out first. Authored, imported by something, and unreachable. |

## The instrument was wrong on its first run, and the correction is the interesting part

Version one matched importers on the module's **basename**, reasoning that an import of
`foo/bar.ts` must contain the substring `bar`. True, and useless: it also matches
`@/lib/dnd/preview` when looking for `lib/cad/ai/preview.ts`. The first run cheerfully reported
the CAD AI reach map as reachable from a D&D campaign world page, and nine modules named something
ordinary — `types`, `scope`, `validation`, `provenance`, `preview`, `reach` — resolved to
whichever unrelated file happened to share the word.

Version two resolves specifiers for real: `@/` against the repo root, `./` and `../` against
the importing file, anything else is a package. **This is the fifth time in this initiative that the
instrument was the finding** — and the reason the audit reports what it sees rather than judging it.

**Known blind spots**, stated rather than hidden: dynamic `import(variable)` is invisible, and a
re-export chain that renames a symbol is followed by path, not by name.

## The orphans, and what happened to them

### `lib/cad/export/landxml-writer.ts` — deleted (C44b)

A second LandXML writer, with no path to any surface. Its own header called it *"the other half of
the interchange spine"* — written against `lib/cad/import/landxml-parser.ts` so a firm's data could
come back out in the format it came in, mandating an explicit `<Units>` (Civil 3D and Trimble
Business Center mis-scale a document without one), escaping text, writing full precision. What
ships instead is `lib/cad/delivery/landxml-writer.ts`, 391 lines, reachable from the CAD page in
three hops, which additionally emits true `<Curve>` elements so arcs survive as arcs.

**The deletion was not the first move, and that is the point.** The dead writer had a good test
suite — five cases encoding real interchange rules — and *"every dead module found today had passing
tests"* is `cad-modules-are-reachable`'s own opening line. Deleting a module is also deleting the
only place a requirement was written down, so the rules were re-asserted against the writer that
runs first, in `__tests__/cad/landxml-round-trip.test.ts`:

| Rule the dead writer encoded | The shipped writer |
|---|---|
| Output parses back through the reader with coordinates intact | ✅ — and checked against the ORIGINALS, so a both-sides northing/easting flip still fails |
| `<Units>` declared | ✅ `USSurveyFoot` / `Imperial` |
| Text escaped so `TREE 12<AT FENCE` does not break the receiving package | ✅ |
| Coordinates not rounded away | ✅ at 4 dp — 0.03 mm, below what a total station resolves. The dead writer promised *full* precision; the promise was stronger than the requirement |
| No exponential notation | ✅ |

All five passed against the shipped writer, so the supersession is traced rather than assumed and
the module went. Recoverable from git — the same disposition `spatial/feature-index.ts` and
`io/trv-bearings.ts` got, for the same reason.

### `lib/cad/ai/mock-proposer.ts` — kept, by design

Already recorded in `cad-modules-are-reachable` as *"test/dev double for the AI proposer"*. Giving
it a surface would mean shipping a fake AI to production, which is the opposite of what this check
is for. Both instruments agree, and the ratchet holds the reason.

## The enumeration

### `lib/cad/io` — TRV round-trip (the native format)

| Module | Reachable from | Hops |
|---|---|---|
| `dedupe-trv-features.ts` | `app/admin/cad/page.tsx` | 3 |
| `drawing-to-trv.ts` | `app/admin/cad/page.tsx` | 4 |
| `error-report.ts` | `app/admin/cad/page.tsx` | 3 |
| `file-detect.ts` | `app/admin/cad/page.tsx` | 3 |
| `trv-drawing-elements.ts` | `app/admin/cad/page.tsx` | 4 |
| `trv-fill-patterns.ts` | `app/admin/cad/page.tsx` | 6 |
| `trv-fill-styling.ts` | `app/admin/cad/page.tsx` | 5 |
| `trv-io.ts` | `app/admin/cad/page.tsx` | 3 |
| `trv-line-style.ts` | `app/admin/cad/page.tsx` | 5 |
| `trv-paper-fit.ts` | `app/admin/cad/page.tsx` | 3 |
| `trv-parser.ts` | `app/admin/cad/page.tsx` | 4 |
| `trv-titleblock.ts` | `app/admin/cad/page.tsx` | 3 |
| `trv-to-drawing.ts` | `app/admin/cad/page.tsx` | 4 |

### `lib/cad/import` — Field-data import (RW5 / GSI / JobXML / LandXML / CSV)

| Module | Reachable from | Hops |
|---|---|---|
| `csv-parser.ts` | `app/api/admin/field-ingest/route.ts` | 2 |
| `dedupe-points.ts` | `app/admin/cad/page.tsx` | 4 |
| `format-detect.ts` | `app/api/admin/field-ingest/route.ts` | 2 |
| `from-survey-reading.ts` | `app/admin/cad/page.tsx` | 3 |
| `gsi-parser.ts` | `app/api/admin/field-ingest/route.ts` | 2 |
| `import-pipeline.ts` | `app/admin/cad/page.tsx` | 3 |
| `jobxml-parser.ts` | `app/api/admin/field-ingest/route.ts` | 2 |
| `landxml-parser.ts` | `app/api/admin/field-ingest/route.ts` | 2 |
| `linework-features.ts` | `app/admin/cad/page.tsx` | 3 |
| `rw5-parser.ts` | `app/api/admin/field-ingest/route.ts` | 2 |
| `types.ts` | `app/api/admin/field-ingest/route.ts` | 2 |
| `unknown-refs.ts` | `app/admin/cad/page.tsx` | 5 |
| `validation.ts` | `app/admin/cad/page.tsx` | 4 |
| `xml-lite.ts` | `app/api/admin/field-ingest/route.ts` | 3 |

### `lib/cad/delivery` — Deliverable production (DXF / GeoJSON / LandXML / PDF / seals)

| Module | Reachable from | Hops |
|---|---|---|
| `completeness-checker.ts` | `app/admin/cad/page.tsx` | 3 |
| `deliverable-bundle.ts` | `app/admin/cad/page.tsx` | 3 |
| `description-generator.ts` | `app/admin/cad/page.tsx` | 3 |
| `dxf-reader.ts` | `app/admin/cad/page.tsx` | 3 |
| `dxf-writer.ts` | `app/admin/cad/page.tsx` | 3 |
| `geojson-reader.ts` | `app/admin/cad/page.tsx` | 3 |
| `geojson-writer.ts` | `app/admin/cad/page.tsx` | 3 |
| `landxml-writer.ts` | `app/admin/cad/page.tsx` | 3 |
| `pdf-writer.ts` | `app/admin/cad/page.tsx` | 3 |
| `rpls-workflow.ts` | `app/admin/cad/page.tsx` | 3 |
| `scope-document.ts` | `app/admin/cad/page.tsx` | 3 |
| `seal-engine.ts` | `app/admin/cad/page.tsx` | 3 |
| `sleeve-cards.ts` | `app/admin/cad/page.tsx` | 3 |
| `traversepc-bundle.ts` | `app/admin/cad/page.tsx` | 3 |

### `lib/cad/integrations` — Third-party sync (Compass / Forge / Orbit)

| Module | Reachable from | Hops |
|---|---|---|
| `compass-sync.ts` | `app/admin/cad/page.tsx` | 2 |
| `compass.ts` | `app/admin/cad/page.tsx` | 2 |
| `forge-sync.ts` | `app/admin/cad/page.tsx` | 2 |
| `orbit-sync.ts` | `app/admin/cad/page.tsx` | 2 |

### `lib/cad/ai` — AI providers and the tool registry

| Module | Reachable from | Hops |
|---|---|---|
| `auto-intake.ts` | `app/admin/cad/page.tsx` | 4 |
| `capabilities.ts` | `app/api/admin/cad/drawing-chat/route.ts` | 2 |
| `claude-proposer.ts` | `app/api/admin/cad/ai-propose/route.ts` | 1 |
| `mock-proposer.ts` | **ORPHAN — no path to a surface** | — |
| `preview.ts` | `app/admin/cad/page.tsx` | 3 |
| `proposals.ts` | `app/api/admin/cad/ai-propose/route.ts` | 2 |
| `provenance.ts` | `app/api/admin/cad/ai-propose/route.ts` | 2 |
| `reach.ts` | `app/admin/cad/page.tsx` | 3 |
| `sandbox.ts` | `app/api/admin/cad/ai-propose/route.ts` | 3 |
| `scope.ts` | `app/admin/cad/page.tsx` | 3 |
| `selection-points.ts` | `app/admin/cad/page.tsx` | 3 |
| `sketch-reconcile.ts` | `app/api/admin/cad/sketch-reconcile/route.ts` | 1 |
| `solver-proposal.ts` | `app/admin/cad/page.tsx` | 3 |
| `system-prompt.ts` | `app/api/admin/cad/ai-propose/route.ts` | 1 |
| `tool-registry.ts` | `app/api/admin/cad/ai-propose/route.ts` | 2 |
| `undo-batch.ts` | `app/api/admin/cad/ai-propose/route.ts` | 3 |

