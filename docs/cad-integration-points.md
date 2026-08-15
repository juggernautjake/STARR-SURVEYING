# CAD integration points — the enumeration

> **C44a** of `docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md`.
> Regenerate with `node scripts/cad-integration-audit.mjs --markdown`.
> `--orphans-only` for the short version; `--json` for a machine-readable one.

**62 integration modules across 6 areas. 60 reach a surface; 2 do not.**

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

## The two orphans

### `lib/cad/export/landxml-writer.ts` — a second LandXML writer, unreached

Its own header calls it *"the other half of the interchange spine"* — written against
`lib/cad/import/landxml-parser.ts` so a firm's data can come back out in the format it came in.
It exports `buildLandXml`, mandates an explicit `<Units>` (with a stated reason: Civil 3D and
Trimble Business Center mis-scale a document without one), escapes text, and writes full precision.

Nothing calls it. What ships instead is `lib/cad/delivery/landxml-writer.ts` —
`exportToLandXML` + `downloadLandXML`, 391 lines, reachable from the CAD page in 3 hops.

**Two writers for one format is this codebase's recorded "two vocabularies for one job" pattern.**
Which survives is a decision, not a fix, and it belongs to C44b: the delivery one is wired and the
export one round-trips with the import parser, so the question is whether import→export fidelity is
a requirement the shipped writer meets.

### `lib/cad/ai/mock-proposer.ts` — expected

Already recorded in `cad-modules-are-reachable` as *"test/dev double for the AI proposer"*. It is
an orphan by design and both instruments agree.

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

### `lib/cad/export` — Export writers

| Module | Reachable from | Hops |
|---|---|---|
| `landxml-writer.ts` | **ORPHAN — no path to a surface** | — |

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

