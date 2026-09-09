✅ 1463642e0 — shells not inserted (looksLikeRecordContent), held references not followed; 5 shell rows on 18a3de22 superseded |✅ 1463642e0 — tab follows the document; text-record empty state |✅ 1463642e0 — label from the row; text-relevance after each read (John Lewis Survey / Abstract 512 → unrelated); 18a3de22 row relabelled + marked |✅ 1463642e0 — modal waited for (appears ~10 s in), dismissed by role=button OK, asserted gone before the frame |✅ 1463642e0 — viewer page count ("Page 1 of 3" box), promised next page waited for up to 12 s; probe: 3 pages of 2004034968 turn |✅ 1463642e0 — view via getAllJimuMapViews() (probe: basemap hybrid/streets change the pixels), basemap verified on the object, identical frames re-taken then dropped; OK is <a role=button> |✅ 1463642e0 + 67eaecdc6 — filedIncrementally honoured, misc never filed, byte-identical once, describeCapturedPage (q / searchValue) |✅ 1463642e0 — runner remembers each rendered frame (same-frame outcome); plan skips the rendered county map and equal-zoom bands |✅ 1463642e0 — held check first, PDF page refused, plat scraper rasterises; plat on 18a3de22 re-filed (4678×3666 PNG) |# Captures that mean something — every filed image distinct, every row viewable (2026-09-09)

Owner, 2026-09-08 (after run 7, project 18a3de22): "many of the images and stuff are identical, even
though they might should be different. Also, there are a lot of files and stuff where no image is
shown, and the link given doesn't open to anything useful… Either we need to get rid of the identical
captures or we need to change the code/system/methods so that the images that get captured are
fulfilling their intended purpose. Please review everything fully."

## What run 7 actually filed (35 rows, every file downloaded and hashed, every image looked at)

| # | Row | What it is | Verdict |
|---|---|---|---|
| 1 | Subdivision Plat: WINNIE MAE ADN | The free clerk plat. **The storage object is the raw 1.9 MB PDF served as `image/png`; the "pages PDF" is a 1,345-byte stub.** The viewer's `<img>` breaks. | BROKEN — see A |
| 2 | Plat — WINNIE MAE ADDITION (Bell) | TexasFile's owned copy, re-opened at $0. Faint, 3225×2100. Same plat as #1. | keep (a recorded copy from a second source), label it as TexasFile's |
| 3–5 | Aerial wide / subject / close | Rendered from Esri tiles + parcel layer. Wide is distinct (0.51 m/px). **Subject and close are the same frame** (both clamp to zoom 22 for a 0.29-ac lot; the tile cache stops at 19 either way). | B |
| 6 | County GIS map — Bell CAD | Rendered from the SAME tiles and layer at the SAME frame as #4 (2048 px instead of 1600). | B |
| 7 | County parcel lines (drawn) | Distinct, correct. | ok |
| 8 | Boundary call sheet | Distinct, correct. | ok |
| 9 | DEED — FERRELL → CAFFREY (Instr. 2004034968) | THE subject's deed (Vol 5456 Pg 704). **Only page 1 of the instrument was captured** ("Page 2: no next-page button found — 1 page(s) total"). | E |
| 10 | AFFIDAVIT — EVERS → PALOMBI | Unrelated; marked Unrelated. Fine. | ok |
| 11 | MISC Screenshot: research: /Property/View/64567 | Bell CAD **"An Error Occurred!"** page. | C — never a document |
| 12 | research (4 pages) | A 4-page PDF of #13 + #14 + #15 + #17 — the same images filed again as a group. | C |
| 13 | Screenshot: research: / | Bell CAD home page, empty search form. | C — never a document |
| 14 | Screenshot: research: /Property/View/64567 | Bell CAD property page (useful, badly named). | C — rename |
| 15,17 | Screenshot: research: /results ×2 | Clerk results for "5456/704" and "EVERS, JONATHAN" (useful evidence, unnamed). | C — rename |
| 16 | MISC Screenshot: research: /results | Clerk "No Results Found" for WINNIE MAE ADDITION — evidence of a null search, misnamed misc. | C — rename, keep |
| 18,20,21,22 | GIS viewer [01] [03] [04] [05] | **Byte-identical** (sha 9e4b808c6e1c). The basemap and layer toggles did nothing; the JS API reported success. | D |
| 19 | GIS Viewer (5 pages) | The five viewer shots AGAIN as a group PDF. | C |
| 23 | GIS viewer [02] zoom 17 | Distinct (zoom differs). | ok |
| 24 | BIS GIS parcel map | Captured **with the disclaimer modal open** in front of the map; "OCR verify 6/6 passed" anyway. | F |
| 25,26 | Google Maps satellite / place | Distinct, correct. | ok |
| 27 | GIS parcel boundary map (generated) | Distinct, correct. | ok |
| 28 | Deed — CAFFREY… (Bell) (5 pages) | TexasFile purchase "whose legal description is blank — check it against the subject". **It is a 1984 deed, Caffrey → Smith, 5.71 ac in the John Lewis Survey, Abstract 512 — a different property.** Filed under the subject owner's name, not marked unrelated. | G |
| 29 | Open-Web Research — 1401 North East St | Text only (Tavily, 12.9k chars). Viewer shows "No page images available". | H |
| 30 | CAD Property Data — CAFFREY… | Text only (413 chars of CAD fields). Same. | H |
| 31–35 | Chain of Title — Vol 5456/704, 5020/651, 763/408, 9251/668, Plat Cab A/166 | Written by the review's chain stage from an HTTP fetch of a React shell: 363 chars of "Loading Search Results… Your web browser is out of date". No file, no content. Two of them (5456/704, Cab A/166) are documents the project already HOLDS. | I |

So of 35 rows: 7 are exact or same-frame copies, 2 are pages nobody wants (error page, empty form), 5 are
empty shells, 2 are text records the viewer cannot show, 1 is broken, 1 is the wrong property, 1 is the
right deed cut short, and 1 has a modal over it. 15 rows are what they claim to be.

## Root causes and fixes

### A. The uploader writes storage BEFORE it asks "already filed?" — and Phase 2 files a PDF as a PNG
`uploadDocumentIncremental` upserts every page object to `artifacts/<category>/<category>_<label>_page<n>.png`,
builds the PDF, and only THEN calls `resilientInsertDocument`, which answers "already filed — same label
and source" and drops the row. The second filer's bytes have already replaced the first's. In run 7 the
second filer was Phase 2's plat search, whose `images: [result.base64]` is the raw PDF from
`fetchBestMatchingPlat` (never rasterised) — so the page PNG became a PDF and the PDF bundle a stub.
- Fix 1: ask "already filed (label + source)" FIRST; if held, return `merged` without touching storage.
- Fix 2: `plat-scraper.searchPlatRepository` rasterises a PDF result at 200 dpi (as the early pass does);
  a PDF is never handed to the uploader as an image. (5ec1977a8 already stops the re-fetch when held;
  this closes the path for a run without an early pass.)
- Fix 3: the uploader refuses a page whose bytes are not an image (`%PDF` magic) — loudly.
- Repair: re-file row #1 on project 18a3de22 from the portal bytes (probe).

### B. Rendered captures that resolve to the same frame are planned as if they differed
`adaptiveZoomBands` clamps subject (+0) and close (+2) to `MAX_ZOOM` 22 for a small lot — same zoom, same
centre, same tiles. `planCadGis` then renders the county map from the same layer and imagery at the same
frame. Three files, one picture.
- Fix: the plan collapses aerial bands that resolve to the same zoom (keep the first, skip the rest with
  the reason "same frame as <label> — a second copy evidences nothing"), and skips the RENDERED `cad_gis`
  when a rendered aerial at the same frame is planned (the county's own viewer is photographed
  separately by the GIS-viewer capture; the parcel-lines drawing carries the dimensions). The
  photographed `cad_gis` fallback (no parcel layer) is unchanged.

### C. Screenshots are filed twice, junk pages are filed, and the labels say nothing
The orchestrator files every screenshot incrementally (one row each, "Screenshot: research: /results"),
then `uploadPipelineArtifacts` at the end of the run groups the SAME screenshots by source into
"research (4 pages)" / "GIS Viewer (5 pages)" rows and files the misc ones as "MISC Screenshot" rows
(the incremental path skipped them as junk; the final path does not).
- Fix 1: a screenshot filed incrementally is marked (`filedIncrementally`) and the final pass skips it;
  no grouped copies.
- Fix 2: misc screenshots are never filed as documents — they stay in the run log with the reason.
- Fix 3: a description that means something: `describeCapturedPage(url, pageText)` names the search
  and its outcome ("Clerk search — "5456/704" — 1 result", "Clerk search — "WINNIE MAE ADDITION" — no
  results", "Bell CAD property page — 64567"); the CAD home page and any "An Error Occurred" page are
  misc.
- Fix 4: within one filing, byte-identical images are filed once (sha256 of the bytes).

### D. The GIS viewer's basemap/layer toggles report success and change nothing
`switchToAerialBasemap` / `toggleLayerByTitle` return true whenever a `view.map` was found, whether or
not the assignment rendered. Four identical frames were filed with four different labels.
- Fix: verify by pixels. After applying a spec, screenshot; if the bytes hash equal to the previous
  capture in the group, retry with the UI strategy; if still identical, DROP it and log "identical to
  [NN] — the viewer did not apply <what changed>". Never file a frame that equals the one before it.
- Investigate live (Browserbase probe): which toggle strategy actually works on the BIS Experience
  Builder viewer; fix the JS path if the map object is reachable another way.

### E. The subject's deed was captured to one page
The clerk viewer's page-turn found no next button after page 1 for instrument 2004034968 (the affidavit
in the same session walked 12 "pages"). The instrument continues past page 1 (the exceptions clause is
cut mid-sentence).
- Investigate live: open doc 98737982 in the viewer through Browserbase, read its page indicator, and
  fix the pager to use the viewer's own page count when it shows one; TexasFile already holds the
  instrument list with page counts (expectedPages) — pass it through.

### F. The BIS disclaimer modal is in the capture
`dismissDialogs` runs once at Op 2/6, before the modal has rendered under Browserbase timing; nothing
re-checks before the screenshot.
- Fix: wait for the modal (up to 10 s) at Op 2, and re-dismiss + assert no visible modal immediately
  before every screenshot; a frame taken with a modal still visible is not filed.

### G. A bought TexasFile document is filed under the subject's name without a relevance check
The purchase for `search_required` bought a row "whose legal description is blank" and filed it as
"Deed — <CAD owner> (Bell)". Its text names the John Lewis Survey, Abstract 512, 5.71 acres — not
Winnie Mae Addition. The clerk deeds get `validateDeedRelevance`; TexasFile purchases do not.
- Fix 1: label a bought document from what the ROW says (grantor → grantee, type, date) and never from
  the search name.
- Fix 2: after the review reads a document, the same heuristic relevance check the clerk deeds get
  (subdivision / survey / abstract / lot-block against the subject) marks `relevance = 'unrelated'`
  with the reason, the way the affidavit was marked.

### H. Text-only records show "No page images available"
The viewer hides the tab strip unless a row has BOTH text and images, and the list endpoint does not
carry `extracted_text`, so `hasText` is false for a text record and the default tab is the empty image
pane.
- Fix: a row with no page images opens on its text; the text is fetched for the row when the list did
  not carry it; the empty state says what the record is ("A text record from <method>; there is no
  scanned page — the source link opens the site it was read from").

### I. Chain-of-title reference rows are React shells
`analysis.service.ts` inserts a "Chain of Title — Vol X, Pg Y" row for every deed reference whose
HTTP fetch returned ≥ 100 characters — the publicsearch.us shell is 363 characters of boilerplate.
Two of the five references are documents the project already holds.
- Fix 1: a fetch whose text carries no instrument content (no grantor/grantee/recorded/instrument
  tokens) is not a document — log it, do not insert.
- Fix 2: a reference the project already holds (instrument or vol/page matches a filed row) is not
  followed; the held row is named in the log.
- Fix 3: references not held stay where they already live — the Discovered Leads panel.
- Repair: delete the five shell rows on 18a3de22.

## Slices

| # | Slice | Status |
|---|---|---|
| A | Uploader: already-filed check before storage; plat-scraper rasterises; non-image page refused; re-file the plat on 18a3de22 | |
| B | Capture plan: same-frame aerial bands collapsed; rendered cad_gis skipped when it equals the rendered aerial | |
| C | Screenshots: filed once (no grouped copies), misc never filed, meaningful descriptions, byte-identical filed once | |
| D | GIS viewer: pixel-verified toggles, identical frames dropped, live probe of the toggle strategies | |
| E | Clerk viewer pager: page count from the viewer / TexasFile index (live probe) | |
| F | BIS capture: modal waited for and dismissed, asserted absent before each screenshot | |
| G | Bought documents: labelled from the row; relevance verdict after the read | |
| H | Viewer: text-only rows open on their text, with an explanation | |
| I | Chain-of-title: shells not inserted, held references not followed; repair on 18a3de22 | |

## Built 2026-09-09 (commits 1463642e0, 67eaecdc6 — merged, deployed)

Repair applied to project 18a3de22 in place: 14 rows superseded with the reason in `duplicate_reason` (4 identical GIS frames + the two grouped copies, the CAD home/error pages and the no-results page, the
same-frame close aerial and county map, the five chain shells); 3 screenshots renamed by what they show;
the 1984 Caffrey → Smith deed relabelled and marked unrelated; the free plat's page object rewritten from
the portal PDF (it had been the raw PDF under a .png name). 20 live rows remain, every one distinct and
viewable. The subject's deed (Instr. 2004034968) still holds page 1 of 3 on that project — the pager fix
applies on the next run.

## Verified live 2026-09-09 (worker build 611efe0c9)

- GIS viewer capture for parcel 64567: **5 frames, 5 distinct hashes** — streets+parcels, zoom 17, aerial+parcels+lot lines, aerial+EagleView 2026+parcels, EagleView with parcels and lot lines OFF; every layer toggle answered via the JS API in ~200 ms (the first pass after 67eaecdc6 still had one unpatched finder and dropped [04] [05] as identical — fixed in 611efe0c9).
- BIS parcel map: disclaimer appeared, dismissed by its role=button OK, map captured with the parcel highlighted and no modal (591 KB); Google satellite + place captured.
- Clerk viewer doc 98737982: page box says 3, next enabled after 5.3 s, pages 2 and 3 load on click.
- Plat route: the portal PDF fetched through the residential session and rasterised to 4678×3666.

Left for the next run to prove end to end: the deed pager on a live capture, and the run-level count of filed rows (expected: no grouped copies, no misc rows, one aerial per frame).
