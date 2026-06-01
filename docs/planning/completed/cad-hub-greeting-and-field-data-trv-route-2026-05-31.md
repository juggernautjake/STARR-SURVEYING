# CAD hub greeting + field-data TRV-wrong-route — 2026-05-31

*Two unrelated asks combined for shippable scope:*

> *"Make the green work mode button vertically centered in the
>  blue card … move it in to the left a bit more."*

> *"Consider the following errors whenever I try and import the
>  trv survey: \[~3,000 false-positive validation errors\]"*

## Today's reality (audit, 2026-05-31)

**Hub greeting**: `app/admin/me/AdminMe.tsx` renders the "Enter
Work Mode" button inside a blue greeting card. The grid /
flex layout aligns it to top-right (visible in the screenshot
the user attached).

**TRV flood**: The error log is unmistakable — every record
code in the TRV (`11`, `28`, `29`, `91`, `92`, etc.) is being
treated as a "point number". For example:
- `Duplicate point number 11 (1136 occurrences)` — the TRV
  has 1,136 `11,polyId,offset,?,layerId,?` vertex-reference
  records.
- `Duplicate point number 29 (120 occurrences)` — 120 drawing-
  element `29,...` property records.
- `Unrecognized code "3" on point 11:N` — every `11,...` line's
  layer-id column (always 3 in the Garland sample) gets parsed
  as a "code".
- `Point 91 has zero easting` — projection record `91,-1,1,0,...`
  becomes a point with pointNumber=91 + easting=1+0.

Root cause: the user picked `.TRV` in the field-data import
wizard (`ImportDialog.tsx`), whose CSV/TXT parser treats every
line as `pointNumber, north, east, elev, code`. The TRV
records have entirely different semantics. The wizard should
DETECT TRV format and either route the user to the dedicated
TRV importer, or refuse with a clear message.

## Slices

### Slice 1 — Vertically center + nudge "Enter Work Mode" button

- AdminMe greeting card: change the button's flex / grid
  alignment so it sits in the vertical CENTER of the card
  + add right-side spacing so it's not pinned to the edge.
- Source-text spec locks the new align / margin.

### Slice 2 — Detect TRV format upfront in the field-data wizard

- ImportDialog's FileSelectStep already accepts CSV / TXT /
  TRV / RW5 / JOBXML — but the parser routes everything but
  XML through the CSV pipeline. Add a `.TRV` content sniff
  (same `detectFileFormat` helper Slice 8 of file-detect uses)
  in the file-select step.
- When the picked file is TRV (extension OR content), the
  wizard shows a clear callout: "This is a Traverse PC .TRV
  file — use File → Import → 'Import Traverse PC (.TRV)…'
  instead of Import Field Data," disables Next, and offers a
  "Switch to TRV importer" button that closes this dialog +
  opens the dedicated path.
- Tests: source-text spec on the TRV callout + the route
  button.

### Slice 3 — Slim default starting layers ✅ shipped 2026-05-31

User refined: "The default layers should just be the layers for
the survey info blocks and the single starting layer."

Trimmed `PHASE3_DEFAULT_LAYERS` from 23 layers across 6 groups
to **4 layers across 2 groups**:
- Group `Survey Info` — SURVEY-INFO (protected) + TITLE-BLOCK +
  ANNOTATION
- Group `Drawing` — DEFAULT (one general-purpose starting layer)

Dropped: BOUNDARY, BOUNDARY-MON, EASEMENT, BUILDING-LINE, ROW,
FLOOD, CONTROL, CURVE-DATA, STRUCTURES, FENCE, UTILITY-WATER /
SEWER / GAS / ELEC / COMM, VEGETATION, TOPO, WATER-FEATURES,
TRANSPORTATION, MISC. Surveyor can re-add any manually; the
field-data importer still auto-creates layers from
autoAssignCodes when needed.

Static IDs preserved so the master code library's
`defaultLayerId` references stay valid.

Tests: default-layers test file rewritten (16 → 9 specs locking
the new 4-layer / 2-group structure + the SURVEY-INFO protected
flag); 2 legacy assertions in recon-to-cad + validate tests
updated.

### Slice 1 — Hub greeting button positioning ✅ shipped 2026-05-31

`.hub-greeting` now has `position: relative`; `.hub-greeting__
actions` switched from `align-self: stretch` (which only filled
the first flex line) to `position: absolute; top: 50%; right:
2.5rem; transform: translateY(-50%)` so it vertical-centers
against the full card height + sits in from the edge.
`.hub-greeting > div:first-child` gets `padding-right: 14rem`
so the heading text doesn't run under the button.

### Slice 2 — Field-data wizard sniffs TRV + offers redirect ✅ shipped 2026-05-31

`FileSelectStep` now detects when a `.TRV` lands in the field-
data wizard (extension OR content sniff for `#,TRAVERSE PC` /
`999,begin`). On a TRV pick it shows an amber callout —
"This looks like a Traverse PC (.TRV) file" — with a one-click
"Switch to Import Traverse PC (.TRV)…" button that fires
`cad:closeImportDialog` + `cad:openImportTrv`. PresetPicker
hides on TRV files so the user can't accidentally proceed.

Eliminates the user's reported flood of ~3,000 false-positive
errors (each TRV record line getting parsed as a CSV point row).

## TL;DR

Two small fixes: button alignment in the hub greeting (Slice
1) + sniff-and-route TRV files when they land in the field-
data wizard so a single click takes the user to the right
importer instead of producing 3,000 false-positive errors
(Slice 2).
