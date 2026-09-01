# Brand kit, and the viewers for images and documents — 2026-09-01

**Status:** IN PROGRESS · opened 2026-09-01 · one slice per pass.

---

## The owner's ask, in their words

> *"Please pick up on fully building out the brand page with all of the fonts and colors and
> logos/images, and also please fix the viewing settings and properties and controls for
> images/docs on the backend, especially for the research side of things. Please keep working on
> all of the requests that I have given you to complete in the last couple days and make sure that
> they are all fully built out."*

Three asks, and they are genuinely three: the brand page, the document viewers, and the tail of the
last three days' work. Each gets a phase.

---

## ⚠ READ FIRST — what is actually true today, measured 2026-09-01

Every row was checked against the repository or the live database, not remembered. This repo has now
recorded **seven** parked premises that were false when finally checked; this table exists so this
doc does not add an eighth.

| Claim | Measured 2026-09-01 |
|---|---|
| The brand page renders every logo file | **True.** `public/branding` holds 178 files. `BRAND_LOGOS` names 34; `RECOLOUR_MARKS × RECOLOUR_WAYS` derives the other 144. Nothing on disk is unreferenced, nothing referenced is missing. Both directions checked. |
| The brand page has all the colours | **True.** 27 `hex:` entries in `palette.ts`, and `ColoursTab` renders `BRAND_COLOURS`. |
| The brand page has all the fonts | **True of the data.** 11 `stack:` entries. Whether all 11 reach the browser through `googleFontsHref()` is **not yet checked** — B4. |
| The upload flow is finished | **False, twice over.** See the two rows below. |
| `seeds/622_brand_assets.sql` has been applied | **FALSE.** Live probe over `SUPABASE_DB_URL`: `information_schema.tables LIKE 'brand_%'` returns **`[]`**, and `storage.buckets WHERE id='starr-brand-assets'` returns **`[]`**. The whole upload feature has no tables and no bucket. It cannot work anywhere. |
| The upload UI is styled | **FALSE.** 145 `brand-*` classes are used across `app/admin/branding`; **39 of them have no CSS rule in any stylesheet in the repo.** Control: `.brand-plate` *is* found by the same scan, so the scan can produce a positive. |
| `SourceDocumentViewer` opens documents at a readable size | **Was false; a fix is in the working tree, uncommitted.** `zoom` reset to `1` — 100% of natural pixels, not "fits the window". |
| The research viewers have the controls the jobs viewer has | **False.** Matrix below. |

### The viewer control matrix, measured

`grep -ic` over each file, for the token naming each control:

| Viewer | lines | zoom | pan | rotate | fullscreen | download | keyboard | pdf |
|---|---|---|---|---|---|---|---|---|
| `admin/components/jobs/FileViewer.tsx` | 538 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `research/components/SourceDocumentViewer.tsx` | 860 | ✅ | ✅ | ✗ | ✗ | ✗ | ✅ | ✅ |
| `research/components/ArtifactGallery.tsx` | 631 | ✅ | ✅ | ✗ | ✗ | ✅ | ✅ | ✅ |
| `admin/components/MediaViewer.tsx` | 168 | ✅ | ✅ | ✗ | ✗ | ✅ | ✅ | ✗ |
| `admin/cad/components/MediaViewer.tsx` | 160 | ✅ | ✅ | ✗ | ✗ | ✗ | ✅ | ✗ |

**The richest viewer in the product is the one the owner did not complain about.** The research
viewers — the ones people spend an hour a day inside, reading county scans — are the poorest. A
scanned deed arriving sideways cannot be rotated; a plat cannot be opened full-screen; the file
cannot be saved.

---

## How to work this doc

One slice per pass, in order within a phase. Phases may interleave — they touch different files.

**Every slice must:**

1. Be behaviour-preserving unless it says otherwise.
2. `npm run type-check`, `npm run lint`, `npm run build` — **exit codes read unpiped** (`$?` after
   `| tail` is `tail`'s status; this repo has shipped a false green that way).
3. Carry a test that asserts the **caller**. A component with passing tests that nothing mounts is
   this repo's most common defect.
4. Be **mutation-tested**: break what the test guards and watch it fail. A guard that cannot go red
   is not a guard.
5. Run a **control** before believing any negative result. Fourteen-plus instances in this
   repository of a probe that could not have produced a positive.

---

## Phase B — the brand page, fully built out

### B0 — Apply `seeds/622_brand_assets.sql` ☐ **the feature has no tables**

Nothing else in this phase matters until this lands. Measured above: `brand_assets`,
`brand_asset_variants` and the `starr-brand-assets` bucket **do not exist** in the live database.
The Upload tab's own error branch already predicts this in prose — *"If this environment has never
had `seeds/622_brand_assets.sql` applied…"* — which means the author knew and shipped the guess
rather than the fact.

**Done when:** the two tables and the bucket exist in the live database, verified by a second read
after the write, and the portal's `GET /api/admin/branding/assets` returns `200 {assets: []}` rather
than a 500.

### B1 — The 39 classes with no CSS ☐

`DesignUploadForm`, `UploadedAssetPanel`, `fields.tsx` and `UploadTab` are fully written React that
renders **unstyled** — a drop zone with no border, a picker with no chips, a variant list with no
rows. `brand-profile__text` is used by `LogosTab.tsx`, which is already **merged and live**, so this
is not confined to the new work.

**Done when:** every `brand-*` class used in a `className` in `app/admin/branding` resolves to a
rule, proved by a guard that scans both directions and carries a control.

### B2 — The upload flow, end to end ☐

Five routes exist and none has ever run. Upload an image, generate its variants, edit the profile,
download a variant, archive it, delete it. Against the real database and the real bucket.

### B3 — Fonts: all eleven, actually loaded ☐ *(B4 in the table above)*

`googleFontsHref()` builds one stylesheet URL. Eleven families are specimen'd. Whether the URL names
all eleven, and whether each face's fallback is a real stack, has not been checked.

### B4 — Colours and pairings, complete ☐

27 colours, the ink rule, every measured pairing, and the 112 colourways. The colourways shipped
yesterday; the check that every one of the 8 ways × 18 marks resolves to a file on disk is B6's.

### B5 — Downloads that resolve ☐

`brand-system.test.ts` is claimed to check this "in both directions". Verify that claim before
trusting it — the last three "both directions" guards in this repo checked one.

### B6 — Every palette, every width ☐

`check-portal-themes.mjs` across all eleven palettes on `/admin/branding`, plus the responsive pass
at 1440 and 390 against a **production** build. F2 in the previous doc established the cost of not
doing this: 76 findings.

---

## Phase V — the viewers for images and documents

### V1 — Fit the whole page, every time ◐ **in the working tree, uncommitted**

`lib/research/viewer-fit.ts` + `__tests__/research/viewer-fit.test.ts` + the `SourceDocumentViewer`
wiring. Written, type-checks, not committed and not browser-verified.

> Owner: *"whenever I open an image, it shows it, but if I click the button to go to the next image
> … it does a weird resizing thing. Like, the default is to have the zoom too far in on a lot of
> documents. The default view should show the full image/page each time the user opens a image/file
> or clicks between pages. once they are viewing the page, they can zoom in and out and pan."*

### V2 — Rotate ☐

A county scan arriving sideways is not rare; it is the normal case for a plat. `FileViewer` has
rotation and the research viewers do not.

### V3 — Full screen ☐

A 900px panel inside a modal is not enough to read a survey plat.

### V4 — Download the file you are looking at ☐

`SourceDocumentViewer` has **zero** occurrences of `download`. The document is on screen and there is
no way to save it.

### V5 — Keyboard, completed ☐

Page next/previous, zoom, fit, rotate, close — and the shortcuts stated on screen rather than
guessed at.

### V6 — One core, four viewers ☐

`viewer-fit.ts` is the seed. The controls that four viewers each implement differently — clamping,
fit, rotation-aware fit, the wheel — belong in one module the four import. **Behaviour-preserving
per viewer**; this is not a rewrite of `FileViewer`.

### V7 — PDFs and non-images ☐

What happens today when the document is a PDF, and what should.

---

## Phase R — the tail of the last three days

From `RESEARCH_FLOW_AND_SCOPE_GUARD_2026-08-31.md`, still open:

### R1 — U3-G: the checkbox that reads as a radio ☐

`AdminLayout.css:1376` (*"Global Checkbox Styles (circle / dot design)"*) silently defeats
`AdminLayout.css:350` (`checkbox-radio-reset-2026-06-21`), whose own comment says the fix exists so
checkboxes read as squares. Two deliberate decisions ~1,000 lines apart, disagreeing; the later wins
on source order at equal specificity. **Product-wide**, which is why it was recorded rather than
changed on the strength of one screenshot.

### R2 — U3-H: `library` and `billing` render 429 and 519 characters ☐

Near-empty screens on a 1440px page with nothing saying what would fill them.

---

## Phase W — worker run speed

From `RESEARCH_WORKER_REBUILD_AND_GROWTH_2026-08-26.md`. Open, engineering-side, not owner-gated:

| | |
|---|---|
| **E5b** ☐ | Every document relaunches Chromium — ~11 cold starts in one run |
| **E5c** ☐ | Each document is re-found by search+click though the log already printed its real URL — ~10s × 11 |
| **E5d** ☐ | Documents are captured strictly serially — the big one |
| **E5e** ☐ | Bell CAD unreachable took **213s to admit it** |

The worker runs in Docker; there is no `npm` on the host for it. Rebuild with
`BUILD_SHA=$(git rev-parse --short HEAD) docker compose build worker`.

---

## Deliberately NOT in scope

- **`DrawingCanvas.tsx` (2,677 lines).** Its own project, as the previous doc said.
- **Rewriting `FileViewer.tsx`.** V6 shares a core *out of* it; it does not rebuild it.
- **The owner-gated worker items** — DNS, vendor accounts, Google Business Profile. Nothing an
  engineer can close.

---

## Known traps, carried forward

1. **Route-scoped CSS.** `AdminResearch.css` and `Branding.css` load last on their routes; a
   shared-class fix made elsewhere misses these pages.
2. **Authored but not wired.** Assert something imports *your* file.
3. **A probe can be the bug.** Run a control that should fail.
4. **`$?` after a pipe** is the pipe's status.
5. **Two research pipelines.** Any run-starting UI must name its engine.

---

## Slice log

| Date | Slice | What shipped |
|---|---|---|
</content>
