# Golden plats

Drop one JSON file per plat here and the measurement starts running. Nothing else needs changing.

A golden plat is a document whose bearings, distances and monuments are **already known**, entered by
someone with the document in front of them. It is the only way to check whether this platform READS a
survey correctly — every other survey test in the repo uses synthetic geometry, which proves the
arithmetic and nothing about the reading. That is why `docs/planning/.../RESEARCH_PLATFORM_DEEP_BUILD`
§4 item 0a calls it the highest-value thing on the owner's list.

Shape (`GoldenPlat` in `worker/src/services/golden-plat.ts`):

```json
{
  "source":        { "county": "Bell", "instrument": "2020032310", "recordedYear": 2020 },
  "establishedBy": "who read the document",
  "establishedAt": "2026-08-03",
  "basis":         "read_from_document",
  "calls": [
    { "index": 0, "bearing": "N 45°30'00\" E", "distance": 247.50,
      "monument": "a 5/8 inch iron rod found" },
    { "index": 1, "bearing": "S 44°30'00\" E", "distance": 1900, "unit": "varas" }
  ]
}
```

Notes that matter:

- **Bearing format does not matter.** It is parsed as an angle, not compared as a string — `N45°30'E`
  and `N 45-30-00 E` are the same call.
- **Record the unit the PLAT uses.** A call read correctly in varas and reported in feet is a correct
  reading, and the harness normalises before comparing.
- **Monument text verbatim, including found/set.** FOUND vs SET is compared separately from the
  monument kind, because a found monument controls the corner and a set one is an opinion.
- **`basis` is not decoration.** "read_from_document" and "vendor_export" are different authorities
  and the report names which one it used.
