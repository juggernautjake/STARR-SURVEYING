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

### B0 — Apply `seeds/622_brand_assets.sql` ✅ **SHIPPED 2026-09-01**

Nothing else in this phase matters until this lands. Measured above: `brand_assets`,
`brand_asset_variants` and the `starr-brand-assets` bucket **do not exist** in the live database.
The Upload tab's own error branch already predicts this in prose — *"If this environment has never
had `seeds/622_brand_assets.sql` applied…"* — which means the author knew and shipped the guess
rather than the fact.

**Applied**, and verified by a second read rather than by the applier's own exit code:

```
TABLES:   [ brand_asset_variants, brand_assets ]
BUCKET:   [{"id":"starr-brand-assets","public":false,"file_size_limit":"26214400","mimes":6}]
INDEXES:  9   POLICIES: 3 (incl. storage.objects)   RLS: both true
CONTROL (a table that should not exist): []
```

The control matters: it is the same probe that reported `[]` for `brand_%` before the apply, so the
"after" reading is not a probe that returns rows for everything.

### B1 — The 39 classes with no CSS ✅ **SHIPPED 2026-09-01**

`DesignUploadForm`, `UploadedAssetPanel`, `fields.tsx` and `UploadTab` are fully written React that
renders **unstyled** — a drop zone with no border, a picker with no chips, a variant list with no
rows. `brand-profile__text` is used by `LogosTab.tsx`, which is already **merged and live**, so this
is not confined to the new work.

All 39 defined in `Branding.css`. `.brand-btn` was the interesting one: on its own it is the
Building blocks SPECIMEN — a `<span>` with its colours set inline and `cursor: default` — and the
upload surfaces reuse the same shape for controls people press. The interactive chrome therefore
attaches by ELEMENT (`button.brand-btn`, `label.brand-btn`), so the six demo spans are untouched.

The guard is `__tests__/branding/brand-classes.test.ts`, both directions, four controls.

**The scanner was wrong twice before it was right**, which is the part worth recording:

| Attempt | What it did | Why it was wrong |
|---|---|---|
| `\bbrand-[\w-]+` over the file | 48 "missing" | Nine were element `id`s (`brand-upload-name`), `id` templates (`brand-tab-${t.id}`), or the words `brand-kit` and `recolour-brand-marks.mjs` in prose |
| `className="…"` and `className={\`…\`}` only | 39 missing, 2 false orphans | Missed `className={cond ? 'a b' : 'a'}` — which reported `brand-card__chev` as DEAD CSS when it is used |
| brace-match the expression, read every string literal in it | 39, and 0 orphans | — |

A fixed-length slice after `className=` was rejected: too short truncates a ternary mid-literal, too
long swallows the next attribute's strings.

Mutation-tested by renaming `.brand-drop` — 2 red, one in each direction — with the mutation
verified to have applied before the result was believed.

### B2 — The upload flow, end to end ✅ **SHIPPED 2026-09-01**

Exercised against the **live database and bucket**: create, generate a variant, read back through
the same functions the routes use, archive, delete, prove the cascade. **39 checks, all green**, and
the database left at `brand_assets = 0`, `brand_asset_variants = 0`, `bucket objects = 0`.

What only the live run could establish:

| | |
|---|---|
| The bucket accepts a PNG and returns the same bytes | ✅ |
| `brand_asset_variants_one_original` refuses a second original | ✅ *"duplicate key value violates unique constraint"* |
| `brand_asset_variants_label_unique` refuses `original — 1400PX` against `Original — 1400px` | ✅ case-insensitively |
| `brand_assets_status_check` refuses an invented status | ✅ |
| `ON DELETE CASCADE` takes the variants | ✅ 0 left |
| `toAsset` does not leak `storage_path` into the client shape | ✅ |
| A variant of one asset cannot be served under another asset's id | ✅ `null` |

**The probe was the bug once.** `offeredSizes never upscales` failed because `offeredSizes` returns
`{width, label, use}` objects and the check compared an object to a number. The code was right; the
check was comparing the wrong thing. Fourteen-plus instances of this shape here now.

The runner was **deleted rather than committed**. A check that writes to production every time
somebody pushes is not a check. Its pure half — the size ladder, the validator, the slugs, the type
guards, the byte formatting — is `__tests__/branding/uploads.test.ts`, and its header records what
the live run proved that it cannot.

### B3 — Fonts: all eleven, actually loaded ✅ **ALREADY COVERED — verified 2026-09-01**

Checked before writing anything, per this doc's own rule. `brand-system.test.ts` already asserts
*"the Google Fonts href covers every family, derived rather than typed"*, *"every stack has a real
fallback after the webfont"*, and carries a control asserting the href is derived so that adding a
font would change it. Nothing to add; a second version would have been a second list.

### B4 — Colours and pairings, complete ✅ **ALREADY COVERED — verified 2026-09-01**

Same. The ink rule is **recomputed from the hex** rather than trusted, the never-pair list and the
winning-ink claim are both measured, and there is a control asserting the check would catch a colour
with no readable ink.

### B5 — Downloads that resolve ✅ **VERIFIED 2026-09-01 — the claim held**

This doc said to check the "both directions" claim before trusting it, because the last three such
guards here checked one. This one checks both: a listed file that does not exist **and** a file on
disk that nothing lists. Every download href on the tab is built by `logoSrc()` or `assetUrl()` from
a manifest entry the test proves exists, and `assetUrl` addresses a route that re-validates the
filename against the same manifest before it resizes anything.

### B6 — Every palette, every width ☐

`check-portal-themes.mjs` across all eleven palettes on `/admin/branding`, plus the responsive pass
at 1440 and 390 against a **production** build. F2 in the previous doc established the cost of not
doing this: 76 findings.

---

## Phase V — the viewers for images and documents

### V1 — Fit the whole page, every time ✅ **SHIPPED 2026-09-01**

> Owner: *"whenever I open an image, it shows it, but if I click the button to go to the next image
> … it does a weird resizing thing. Like, the default is to have the zoom too far in on a lot of
> documents. The default view should show the full image/page each time the user opens a image/file
> or clicks between pages. once they are viewing the page, they can zoom in and out and pan."*

`fitScale` + the `SourceDocumentViewer` wiring. `zoom` reset to `1`, which is 100% of the scan's own
pixels; the image carries `maxWidth: 100%` so the WIDTH always fitted, and only portrait scans —
most recorded documents — overflowed. Reset now means fit, not 100%; 100% is its own key.

### V2 — Rotate ✅ **SHIPPED 2026-09-01**, and it found two live defects elsewhere

Both research viewers can turn a page now. Turning one is the easy half — `(d + 90) % 360` — and the
half that goes wrong is what the page then has to be scaled to, because **a transform is not
layout**: the box stays sized for the upright aspect ratio.

The two viewers that already had a rotate button both got this wrong, and neither failed loudly:

| Viewer | Callers | What happened |
|---|---|---|
| `jobs/FileViewer` | JobFileManager, JobPhotoGallery, ProjectFilesPanel | `.file-viewer__image` is `max-height: 85vh`. A portrait phone photo turned a quarter laid its 85vh side across a stage nowhere near that wide and **ran off both edges at scale 1** |
| `components/MediaViewer` | messaging, CAD ×5, learn | No rotate at all, and `MIN_SCALE = 1` — so adding one would have produced the same crop |

`rotationFit` is the second function in the module and exists because the two viewer *shapes* are
genuinely different: `SourceDocumentViewer` constrains width only, the other three constrain both
axes and are already fitted at scale 1 by CSS. That measurement is also why the gallery did **not**
get V1's fix copied into it — its `object-fit: contain` means it never had the bug.

### V3 — Full screen ✅ **SHIPPED 2026-09-01**

On the panel, not the backdrop. Driven by the `fullscreenchange` EVENT rather than set optimistically
beside the request: Escape leaves full screen without calling anything of ours, and a request can be
refused, so an optimistic flag labels the button "Exit full screen" on a window that is not.

### V4 — Download the file you are looking at ✅ **SHIPPED 2026-09-01**

`SourceDocumentViewer` had **zero** occurrences of `download`. The gallery had `↗`, which opens the
file rather than saving it; it now has both, because they are two different acts.

### V5 — Keyboard, completed ✅ **SHIPPED 2026-09-01**

Thirteen shortcuts, and **the map and the on-screen hint are one list** — `VIEWER_SHORTCUTS`.
The old hint was hand-typed and named two of the three keys that worked.

The load-bearing line is that **Ctrl, Meta and Alt return `null`**. `Ctrl+D` bookmarks, `Cmd+F`
opens find, `Ctrl+-` and `Ctrl+0` are the browser's own zoom. A viewer that swallows those has
broken the browser to add a feature, silently — `preventDefault` on a shortcut somebody expected
raises no error anywhere. Shift is deliberately not in that list: it is how `⇧R` and `+` are typed.

### V6 — One core, four viewers ✅ **SHIPPED 2026-09-01**

Moved to `lib/viewers/viewer-fit.ts` — it is not a research module any more. All four viewers import
it; none re-derives a quarter turn by hand, and a test asserts that of all four at once.

### V7 — PDFs and non-images ✅ **SHIPPED 2026-09-01**

Checked before building: the PDF path already passes `#toolbar=1&zoom=page-fit`, so it has the
whole-page default the image path was missing, and the browser's own PDF toolbar does zoom, rotate,
page navigation and download better than a re-implementation over an iframe could — the page content
is not reachable from outside the frame. What the browser's toolbar cannot do is resize the modal
around itself, so **only** full screen and an explicit download were added. Building a bespoke PDF
toolbar here would have been four worse copies of things that already work.

---

## Phase R — the tail of the last three days

From `RESEARCH_FLOW_AND_SCOPE_GUARD_2026-08-31.md`.

### R1 — U3-G: the checkbox that reads as a radio ✅ **SHIPPED 2026-09-01**

`AdminLayout.css:1376` (*"Global Checkbox Styles (circle / dot design)"*) silently defeated
`AdminLayout.css:350` (`checkbox-radio-reset-2026-06-21`), whose own comment says the fix exists so
that checkboxes read as squares. Two deliberate decisions ~1,000 lines apart, disagreeing; the later
wins on source order at equal specificity.

Radios — which the circle block does not touch — are round too, so **the two controls were visually
identical while meaning opposite things**: a radio says *pick one of these*, a checkbox says *pick
any number of these*. It surfaced in a research screenshot as "Select all" / "Deselect all" beside
controls shaped like radio buttons, which is a sentence the shape contradicts.

**The custom design is kept.** The size, palette, hover, focus ring and disabled treatment are
unchanged; only the two properties that make it a radio are different — the box is square (3px), and
the mark is a tick drawn from two borders of a rotated rectangle rather than a round dot. Checked
also now FILLS, because at 14px a navy tick on white is a smudge and a white tick on navy is what
every native checkbox does.

One consequence worth naming: `:disabled:checked::after { background: #94A3B8 }` had been tinting
the DOT. The tick is a border, so that rule silently did nothing after the change; the greying moved
to the box.

`__tests__/admin-styling/checkbox-affordance.test.ts` is selector-aware, not a text search —
`border-radius: 50%` appears dozens of times in this 1,800-line file on avatars and badges, and
"does the file contain a 50%" has no useful answer. It guards both directions: no checkbox rule may
be round, and no radio rule may be square.

**And the first mutation test of it was itself the bug.** `sed '0,/border-radius: 3px;/'` replaced
the FIRST such line in the file, which belongs to a different rule ~890 lines earlier — the mutation
applied, the count changed, and the suite stayed green, which reads exactly like a guard that cannot
go red. Targeting line 1418 explicitly turned 2 red. **A mutation that applied is not a mutation
that applied where you meant.** Fifteenth instance of this shape.

### R2 — U3-H: `library` and `billing` render 429 and 519 characters ⛔ **PREMISE NO LONGER TRUE — CLOSED 2026-09-01**

Checked before building, per the rule this repository learned the hard way. Both tabs already have
explicit empty states: `LibraryTab` imports `EmptyState` and renders it on `paginated.length === 0`
with two different messages depending on whether a FILTER is hiding everything; `BillingTab` renders
one for invoices and another for purchases.

The screenshots that produced the finding predate E2b and G18. **Eighth parked premise in this
repository to be false when finally checked** — and this one had already been half-corrected in its
own doc, where finding H was traced to G18's blank rows rather than to a missing empty state.
Nothing to build.

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
| 2026-09-01 | **B0 + B1** | Seed 622 applied to the live database — the brand upload feature had no tables and no bucket anywhere. 39 `brand-*` classes given rules; `brand-classes.test.ts` guards both directions with four controls. The scanner was wrong twice first. |
| 2026-09-01 | **V1–V7** | Fit-to-window on open and on every page change; rotate, full screen and download in both research viewers; thirteen shortcuts on a map the on-screen hint is derived from. `lib/viewers/viewer-fit.ts` is now shared by four viewers, and giving the research ones a rotate control found the other two turning pages without re-fitting them. |
</content>
