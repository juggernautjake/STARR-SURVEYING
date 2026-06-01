# CAD TRV import — label prefs OFF + point labels render — 2026-06-01

*Two linked user reports:*

1. *Turning on point name/code labels for imported points does
   nothing — bearings/distances show, point labels don't.*
2. *Importing a survey / opening a TRV should reset ALL
   preference toggles to OFF. Only `.starr` / saved files keep
   stored preferences; anything imported starts with toggles
   off.*

## Root cause (audit, 2026-06-01)

A previous slice SEEDED `showBearings`/`showDistances` on the
imported Drawing layer and `showPointNames`/`showPointDescriptions`
on the Points layer. But seeding the PREFERENCE does NOT generate
the per-feature `textLabels` — and `renderLabels` only draws
STORED `feature.textLabels` (there's no live-from-prefs render).
Labels are generated solely by the LayerPreferences panel when a
toggle CHANGES.

So the seed produced a dead state: the Points-layer toggle reads
ON, but no labels were ever generated, and because the value was
already `true`, flipping it never fired the false→true change
that regenerates. Hence "toggle on, nothing renders."

(Bearings appeared because the user actually toggled them via the
panel, which regenerated the polyline labels.)

Removing the seed fixes BOTH reports at once:
- Imported layers start with every toggle OFF (#2).
- Flipping a point-label toggle is now a real false→true change →
  `regenerateLayerLabels` runs → `setFeatureTextLabels` populates
  the points → `renderLabels` draws them (#1). Same path bearings
  already use successfully.

## Slices

### Slice 1 — Remove import-time pref seeding ✅ shipped 2026-06-01

- `trv-to-drawing.ts`: the synthetic Drawing + Points layers no
  longer set `displayPreferences`. With it undefined, the label
  generator falls back to `DEFAULT_LAYER_DISPLAY_PREFERENCES`
  (all toggles off).
- `.starr` / saved files are unaffected — `loadDocument`
  preserves their stored per-layer prefs verbatim.
- Field-data import already starts off (default layers carry no
  seeded prefs).
- Test updated: `trv-bearings-display-prefs.test.ts` now asserts
  the imported layers come in with bearings / distances / point-
  names / descriptions all OFF.

## Out of scope (verified already correct)

- The panel regenerate path (`getFeaturesOnLayer` →
  `regenerateLayerLabels` → `setFeatureTextLabels`) works for
  POINT features identically to lines — confirmed by reading the
  code; no point-specific bug once the dead seed is gone. The
  POINT label generator resolves `pointName` + `description`
  from the props the TRV mapper already stamps.

## TL;DR

Remove the import-time display-preference seeding so (a) imports
start with all label toggles OFF, and (b) flipping a point-label
toggle is a real change that generates + renders the labels.
