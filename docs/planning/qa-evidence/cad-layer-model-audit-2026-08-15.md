# CAD layer model — what it carries, and what a surveyor can actually change

C5 of `docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md`.
**Audit only — no code changed.** C6–C8 build against this.

## The model is not the problem

`Layer` (`lib/cad/types.ts:673`) carries **19 fields**, and it is a good model. Measured against
AutoCAD's Layer Properties Manager — the thing the surveyors using this already have muscle memory
for — it is close to complete:

| AutoCAD column | Here | |
|---|---|---|
| Name | `name` | ✅ |
| On | `visible` | ✅ |
| Freeze | `frozen` | ✅ (separate from `visible`, correctly) |
| Lock | `locked` | ✅ |
| Color | `color` | ✅ |
| Linetype | `lineTypeId` | ✅ |
| Lineweight | `lineWeight` | ✅ |
| Transparency | `opacity` | ✅ |
| Description | `description` | ✅ |
| **Plot / No-plot** | — | ❌ **absent** |

Plus things AutoCAD has no equivalent for, which are the survey-specific value: `autoAssignCodes`
(field code → layer), `displayPreferences` (per-layer bearing/distance/point-name labelling),
`rotationDeg` (per-layer view rotation), `groupId`, `duplicateOf`.

## The problem is reach: 5 of 19 fields are editable

Every `updateLayer(...)` call in the entire CAD surface writes one of five fields:

```
visible · locked · name · color · rotationDeg
```

Everything else is **write-once at creation, or write-never**:

| Field | State | Why it matters |
|---|---|---|
| `lineWeight` | Hard-coded `0.75` when a layer is created (`LayerPanel.tsx:276`). No editor. | A core CAD layer property. Every layer in every drawing is 0.75 forever. |
| `lineTypeId` | Hard-coded `'SOLID'` at creation (`:277`). No editor. | Same. A layer cannot be dashed, which is how boundaries/easements are conventionally distinguished. |
| `opacity` | Never written by any UI. | Model supports it; nothing reaches it. |
| `frozen` | Set `false` at creation (`:274`). No toggle. | **Distinct from `visible`** — `canFeatureBeRendered` honours it and it also excludes from snap and selection. The model draws the distinction; the UI offers only the weaker half. |
| `autoAssignCodes` | Set `[]` at creation (`:283`). No editor. | The survey-specific one: field code → layer routing. Inert. |
| `description` | Never written. | |
| `sortOrder` | Ordering happens through `reorderLayers(layerOrder)` on the document, not this field. | Possibly vestigial — two sources of truth for order. |

`displayPreferences` **is** reachable, but from a different component (`LayerPreferencesPanel`), not
the layer panel — which is why it reads as missing from a scan of the panel alone.

## Findings, in the order C6–C8 should care

1. **`lineWeight` and `lineTypeId` are the sharpest gap.** They are core layer properties, they are
   already in the model, already in the render path, and they are frozen at one value because no
   control was ever built. This is not a design question — it is a missing form.

2. **`frozen` is a real capability with no switch.** The store, the predicates and the render path
   all honour it; only the UI is silent. Freeze differs from off: a frozen layer is excluded from
   selection and snap, which is exactly what a surveyor wants for a busy reference layer.

3. **Plot / no-plot is the one genuinely missing FIELD.** `PrintDialog` does not mention layers at
   all, so printing takes whatever is visible. `ExportLayersDialog` makes you pick layers by hand
   every time instead of honouring a per-layer property. Construction geometry and reference
   imagery have no way to be "on screen, never on paper".

4. **`autoAssignCodes` is inert.** Worth pairing with C22 ("style by code") rather than fixing here
   — the same mapping seen from two ends.

5. **`sortOrder` versus `document.layerOrder` is two sources of truth for one thing.** Reordering
   writes `layerOrder`; `sortOrder` sits on the layer and is set at creation. Not user-visible
   today, but it is the kind of duplication that becomes a bug the moment somebody trusts the wrong
   one.

## What this does NOT say

Nothing here is measured against a real surveyor's workflow — it is the model against a competing
product's model and against its own reach. Whether `frozen` earns a place in a busy panel, or
whether plot/no-plot matters more than layer states (C8), is a judgement C6 should make with the
panel in front of it rather than one this audit can settle.
