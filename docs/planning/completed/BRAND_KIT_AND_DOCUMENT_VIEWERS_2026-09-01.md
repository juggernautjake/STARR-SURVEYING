# Brand kit, and the viewers for images and documents — 2026-09-01

**Status:** ✅ **COMPLETE** — every phase closed 2026-09-01.

> ### ⚠ "COMPLETE" MEANS ON A BRANCH, NOT ON `main`
>
> All of this sits on `claude/research-duplicate-geometry-2026-08-31`, **38 commits ahead of
> `main`**, and the owner authorises each merge. Until that happens, none of it is live.
>
> This repository has already lost a whole feature to a document that said DONE: the business-phone
> work was recorded as shipped for weeks while every commit sat on an unmerged branch and the
> `calls` table held zero rows. A ✅ is a claim about a branch until somebody checks, and the check
> is one command:
>
> ```
> git merge-base --is-ancestor <sha> main
> ```
>
> As of writing that returns **false**. The **one** exception — live regardless of the merge — is
> `seeds/622_brand_assets.sql`, applied directly to the production database in B0. The tables, the
> bucket, the indexes and the RLS policies exist now whatever happens to this branch.

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

## ⚠ READ FIRST — what was true when this doc opened, measured 2026-09-01

Every row was checked against the repository or the live database, not remembered. This repo has now
recorded **seven** parked premises that were false when finally checked; this table exists so this
doc does not add an eighth.

> **This table is the STARTING measurement and is deliberately not updated in place.** Every "FALSE"
> below has since been fixed — the seed is applied, the 39 classes have rules, the viewers have their
> controls. It is left as written because a doc that edits its own evidence to match its conclusion
> cannot be checked afterwards, and the phases below record what each row became.
>
> An eighth false premise did turn up while working this doc: `RESEARCH_FLOW_AND_SCOPE_GUARD`'s
> finding **H** — that the Library and Billing tabs had no empty state — was already fixed by E2b
> and G18 before this doc opened. See R2.

| Claim | Measured 2026-09-01 |
|---|---|
| The brand page renders every logo file | **True.** `public/branding` holds 178 files. `BRAND_LOGOS` names 34; `RECOLOUR_MARKS × RECOLOUR_WAYS` derives the other 144. Nothing on disk is unreferenced, nothing referenced is missing. Both directions checked. |
| The brand page has all the colours | **True.** 27 `hex:` entries in `palette.ts`, and `ColoursTab` renders `BRAND_COLOURS`. |
| The brand page has all the fonts | **True, and already guarded** — checked in B3 rather than rebuilt. 11 `stack:` entries, and `brand-system.test.ts` already asserts the Google Fonts href is DERIVED from them and that every stack has a real fallback after the webfont. |
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

### B6 — Every palette, every tab, and then a browser ✅ **SHIPPED 2026-09-01 — and this is where the real defect was**

`check-portal-themes.mjs`, eleven palettes, **all eight tabs** — not just the index. The script's
own header records that every default route it shipped with was an index route, and that pointing it
at a real detail page found two defects immediately; `/admin/branding` alone would have measured the
Overview tab and nothing else. `?tab=upload` and the six others were passed explicitly.

```
starr-default · starr-dark · slate-light · slate-dark · forest-light · forest-dark
sunset · ocean · plum · high-contrast-light · high-contrast-dark
    ✓ no unthemed surfaces, no unreadable text          (all 11, all 8 tabs)
    ✓ the public site carries no theme attribute
```

**And it was clean while the primary button was rendering pure white.**

That is the finding. `.brand-btn--primary` sets `background: var(--theme-accent)` and the button
came back `rgb(255, 255, 255)`:

| Selector | Specificity | Declaration |
|---|---|---|
| `button.brand-btn` | **(0,1,1)** | `background: var(--theme-bg-surface)` |
| `.brand-btn--primary` | (0,1,0) | `background: var(--theme-accent)` |

The element-scoped rule wins regardless of source order. `--danger` had it too.

**Three green checks could not see it, and each for a defensible reason:**

| Check | Why it passed |
|---|---|
| `tsc`, `npm run build` | Neither reads CSS |
| `brand-classes.test.ts` | Proves every class has a RULE. It did. Nothing resolves the cascade |
| the eleven-palette sweep | A white button on a white card is neither an unthemed island nor unreadable text — the sweep was **right** |

Only `getComputedStyle` on the live page could answer "what actually ended up on this element", so
`npm run verify:brand-page` is now committed rather than thrown away. It screenshots all eight tabs
and measures. Its controls are the point: the Blocks-tab specimen `<span>` must still be
`cursor: default` (proving the element-scoped rules did not leak into the demos), and a class with
no rule must compute to a **0px** border, so the drop zone's 2px dashed means something.

**Two of its own assertions were wrong before they were right.** *"The primary is not transparent"*
PASSED against the white button — asking *is something painted here* cannot distinguish a filled
button from an unfilled one, so it now compares against the panel behind it. And a class with no
rule computes to `border-style: solid` with width 0 under this app's reset, not `none`; the width is
the reading that carries information.

**Two things that looked like defects in the screenshots and were not.** The upload tab's lede
appeared to render in three colours — every text node measures `rgb(71, 85, 105)`; it is an
artifact of the downscaled screenshot. And the `.fab-menu` appeared to sit on top of the empty-state
text — it is `position: fixed`, which a full-page screenshot composites at its viewport position;
scrolled to the bottom of five different routes, `elementFromPoint` finds nothing occluded. Both
checked rather than "fixed".

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


### V8 — Verified in a browser, against a real county scan ✅ **SHIPPED 2026-09-01** — `npm run verify:viewer`

Everything above is tested against numbers and against the caller. Neither answers the owner's
actual question, which is geometric. This one opens `/admin/research/<project>`, opens a document,
and reads `getBoundingClientRect` on the image **after** the transform.

| Measured | Result |
|---|---|
| A 2750×2783 judgment in a 1368×803 panel, on open | **58% · fit**, `insideW` and `insideH` both true |
| **CONTROL** — the same page at the OLD default of zoom 1 | laid out **1384px** tall in an **803px** container. It genuinely overflowed |
| Click to page 2 (2750×3397) | re-fitted to **48% · fit** |
| Rotate a quarter | **90°**, still inside, re-fitted to **59% · fit** |
| The download link | `JUDGMENT-Instr.-1945006189-2-pages-p2.png` — a filename, not a storage key |
| `+` | zoomed, and the readout dropped the `· fit` suffix |
| `0` | back to fit |
| The shortcut panel | **13 items**, rendered from `VIEWER_SHORTCUTS` |
| **`Ctrl+0`** | geometry unchanged before and after — measurably NOT swallowed |
| Page errors | **0** |

The control is the row that matters. Without it, *"the page fits"* is equally true of a viewer that
was never broken, and the run proves nothing about the fix.

**The runner had to be stopped from repairing its own setup.** `DocumentUploadPanel` — the surface
that mounts the viewer — is on the Property Information stage, so a project on stage 2 shows zero
document rows; the first run reported that against a project holding 35 documents. The obvious
repair is to click *"Back to Property Information"*, and that opens a **"Revert workflow step?"**
confirmation which moves a real project backwards. It now requires a project already on stage 1
(`status = 'upload'`). An audit that changes what it is auditing is not an audit — the same rule
this repository already writes down for Approve/Demote/Ban on the employee screens.

---

## Phase R — the tail of the last three days

The open items from `RESEARCH_FLOW_AND_SCOPE_GUARD_2026-08-31.md` and the last one from
`RESEARCH_UI_OVERHAUL_2026-08-30.md`.

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


### R3 — E1b: the shared tab keyboard, in the other sixteen portals ✅ **SHIPPED 2026-09-01**

The last engineering item left open in `RESEARCH_UI_OVERHAUL_2026-08-30.md`, where it was correctly
scoped out as *"admin shell, not the research portal"*.

`role="tablist"` is a **promise about the keyboard**. A screen reader announces "tab 2 of 7", so
somebody reaches for an arrow key, because that is what the role means. Measured: **three of
seventeen** portals declared the role and implemented none of the behaviour; the other **fourteen
each hand-rolled the same eight lines**, and not one handled Home or End.

Without a roving `tabIndex` it is worse than plain buttons would have been: every tab is its own Tab
stop, so reaching the panel behind a fourteen-tab bar takes fifteen presses while the markup claims
otherwise.

Fifteen portals now spread the hook's `tabKeyDown` and carry `data-tab-id`. **126 lines of
duplicated handler deleted, 74 added.** Two were not the same defect and are recorded separately:

| Portal | What it actually was |
|---|---|
| `marketing` | Declared the role, implemented **nothing** — one of the three the helper's own header counted. Now has the handler and the roving tabIndex |
| `settings` | Plain buttons: **no false promise**, but still fourteen Tab stops in front of the panel. Now a real tablist, with one stable `#settings-panel` so `aria-controls` points at something that exists |

### The guard caught a sixteenth portal — the one shipped that morning

`/admin/branding` called `tabMoveTarget` — the pure half — and then focused `#brand-tab-${next}` by
an id convention. That is precisely the approach `tab-keyboard.ts` warns against in its own header:
an id lookup that drifts focuses **nothing**, and focusing nothing looks exactly like arrow keys
never having been wired.

**Two previous versions of the branding test had been satisfied by it**, because both asked whether
the helper was CALLED rather than whether the finished handler was used. The new guard asks the
property instead — every page using `usePortalTabs` must declare the role, spread `tabKeyDown`,
carry `data-tab-id`, use a roving tabIndex, and contain no raw `ArrowRight` comparison.

### And the codemod matched prose, for the third time today

Its `data-tab-id` insertion targeted the first `role="tab"` in each file. In `billing` that is inside
a comment explaining *that the tabs are real tabs*. It reported `PARTIAL` rather than succeeding
wrongly — because it verifies every edit changed the file — but the lesson is the recurring one:
**strip comments before scanning, or anchor to something prose cannot contain.**

Mutation-tested both directions: replacing one handler turns 2 red, dropping one `data-tab-id` turns
1 red.

---

## Phase W — worker run speed ✅ **CLOSED 2026-09-01**

From `RESEARCH_WORKER_REBUILD_AND_GROWTH_2026-08-26.md`. **The table there was stale, and checking
it before building was worth more than the building.**

| | State, measured 2026-09-01 |
|---|---|
| **E5b** — a Chromium cold start per document | ✅ **Already shipped.** `fetchDocumentImages` leases rather than launches. Verified wired, and now guarded by a test |
| **E5d** — strictly serial capture | ✅ **Already shipped.** `infra/bounded-map.ts` exists and `clerk-scraper` calls it. Verified it has a real caller outside its own tests |
| **E5c** — re-finding a URL the search already printed | ◐ **Shipped on ONE call site of nineteen.** Now fourteen |
| **E5e** — 213s to admit a host was down | ◐ **The module existed and guarded two of three doors** |

### E5c — a parameter added, documented, and wired once

`knownViewerUrl` exists because `/doc/{id}` takes Kofile's INTERNAL document id (98732828) and not
the instrument number (2004032468) — which is why the search+click exists, and why it cannot be
skipped unless the caller supplies the URL.

The parameter was added and wired into **one** of nineteen call sites. And most of the other
eighteen already had the URL, in the same block:

| Where | What it did |
|---|---|
| `clerk-scraper` ownerSearch | `const realUrl = ref.url` — **and logged it**, *"real URL from search = …/doc/98732828"* — twelve lines above a capture that omitted it |
| `plat-scraper` | did the same lookup **twenty lines below** the capture, and used the result only to record where the document came from. Hoisting it above is the entire fix |
| `pipeline` | built `{instrNum, docType}` tuples out of search results whose `url` it dropped on the way past |

Fourteen sites pass it now. **Four genuinely cannot** — they hold an instrument number that came out
of a legal description or out of AI-extracted document text, with no search behind it; constructing
a `/doc/` URL there is the exact guess the search+click exists to avoid. A fifth is
`captureDocumentPages`, which has **zero callers anywhere in the worker** — recorded rather than
"fixed", because threading a URL into dead code is work spent on something nothing runs.

The guard is *pass it, or say why you cannot*: a per-file allowlist that requires a reason, and
asserts every allowlisted file still exists and still calls the function.

### E5e — I nearly wrote the module that was already there

`infra/host-reachability.ts` was written before the repository was checked. `infra/host-circuit.ts`
already existed — better documented, with the owner's log pasted into its own header. **Deleted
mine.** Eighth time in this repository that the right pattern was already present in a file nobody
had looked in.

What was actually missing was one door. The circuit guarded `searchCadHttp` and the Playwright
layer. It did not guard `searchCadHttpRawKeyword` — the function whose label appears three times in
the owner's log as the 26-second repeats:

```
26002ms  Stage1A-Keyword — Failed to acquire session token
26003ms  Stage1A-Keyword (again, different variant)
26002ms  Stage1A-Keyword (again)
```

Four call sites reach it — PropertyId, StreetNumber-only, StreetName-only, OwnerName — each running
a reCAPTCHA probe (8s), a homepage fetch (10s) and a token request (8s) before searching, none aware
the previous had already failed at the socket. **Two guarded doors and one open one is the same as
no guard, for anything that walks through the open one.**

The existing test asserted `httpCircuit` and `pwCircuit` **by name**, which is exactly why it could
not notice a third. It checks the property now: every function in the file that reaches `baseUrl`
over the network must consult the circuit first.

### Three probes were the bug before the code was

| The probe | What it did |
|---|---|
| A regex written through a **heredoc** | The heredoc ate one level of backslash: `\s+` became `s+`, so the function-declaration scan matched **nothing** and every assertion passed vacuously |
| A **brace-matching** body parser | Silently truncated on this file's regex literals, returning a 900-character fragment of a 7,000-character function |
| A naive **block-comment stripper** | Started a comment at `'application/json, text/plain, */*'` — a MIME type containing `/*` — ran to the next `*/` several hundred lines later, and blanked **six thousand characters of real code**, including the very call the check was looking for |

Each produced a confident clean reading of a region it had itself destroyed. Anchoring the stripper
to line starts fixes the third; the first two were replaced outright.

> The worker runs in Docker on the server, but `worker/node_modules` is present locally, so
> `npx tsc --noEmit` and `npx vitest run` both work on the host — the "no npm for the worker" note in
> the older doc is about REBUILDING the deployed image, not about running its tests. Deploy still
> needs `BUILD_SHA=$(git rev-parse --short HEAD) docker compose build worker`.

**Worker tsc 0 · 1,768 tests pass · both new guards mutation-tested red.**

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

### And the five this pass added

6. **Nothing in this repository resolves the CSS cascade.** `tsc`, the build, the class-existence
   guard and the eleven-palette theme sweep were all green while `.brand-btn--primary` (0,1,0) lost
   to `button.brand-btn` (0,1,1) and the primary button rendered pure white. A rule EXISTING and a
   rule WINNING are different questions, and only `getComputedStyle` on a live page answers the
   second. This is the same shape as the checkbox bug fixed in R1, a thousand lines apart in a
   different file — **a later, more specific rule quietly defeating an earlier intentional one.**
7. **A comparative assertion or none.** *"The primary button is not transparent"* passed against the
   white button. *"Is something painted here"* cannot tell a filled control from an unfilled one;
   compare it against the thing beside it.
8. **A mutation that applied is not a mutation that applied where you meant.** `sed '0,/pattern/'`
   replaced the first match in the file — a rule ~890 lines above the one under test. The count
   changed, the suite stayed green, and it read exactly like a guard that cannot go red.
9. **Heredocs eat one level of backslash.** A regex written through one turned `\s+` into `s+` and
   matched nothing. Write regexes with the file tools, or verify the file after writing it.
10. **A comment stripper must know about strings.** `'application/json, text/plain, */*'` contains
    `/*`. An unanchored block-comment strip started there, ran to the next `*/` hundreds of lines
    later, and blanked six thousand characters of code — then reported the hole as clean. Anchor to
    line starts.

### And one about auditing

11. **An audit must not change what it is auditing.** The viewer QA's first failure was "no document
    rows", and the obvious repair — clicking "Back to Property Information" — opens a *"Revert
    workflow step?"* confirmation that moves a real project backwards. Pick a subject in the state
    you need; do not move one into it. Same rule this repository already writes down for
    Approve/Demote/Ban on the employee screens.

---

## Slice log

| Date | Slice | What shipped |
|---|---|---|
| 2026-09-01 | **B0 + B1** | Seed 622 applied to the live database — the brand upload feature had no tables and no bucket anywhere. 39 `brand-*` classes given rules; `brand-classes.test.ts` guards both directions with four controls. The scanner was wrong twice first. |
| 2026-09-01 | **V1–V7** | Fit-to-window on open and on every page change; rotate, full screen and download in both research viewers; thirteen shortcuts on a map the on-screen hint is derived from. `lib/viewers/viewer-fit.ts` is now shared by four viewers, and giving the research ones a rotate control found the other two turning pages without re-fitting them. |
| 2026-09-01 | **R1 + B2** | Every checkbox in the admin was a circle, so it read as a radio button — two deliberate blocks ~1,000 lines apart, the later winning on source order. Square box, tick instead of a dot, radios untouched. And the brand upload path exercised end to end against the live database: 39 checks, both unique indexes and the status CHECK confirmed, database left at zero rows. |
| 2026-09-01 | **B6 + V8** | Eleven palettes across all eight brand tabs, then a browser — which found the primary button rendering white behind three green checks. `verify:brand-page` and `verify:viewer` are committed rather than thrown away; the viewer one measures a real 2750×2783 county scan fitting a 1368×803 panel, with a control proving the old default overflowed it. |
| 2026-09-01 | **W (E5b–E5e)** | E5b and E5d were already shipped — checked before building. E5c was wired into one call site of nineteen while most of the rest held the URL in the same block; fourteen now pass it, four genuinely cannot, and a guard requires a stated reason. E5e's module already existed and guarded two doors of three. Three probes were the bug before the code was. |
| 2026-09-01 | **R3 (E1b)** | Seventeen admin tablists: three with no keyboard at all, fourteen with their own copy of one handler, none handling Home. Fifteen now share `tabKeyDown` — 126 lines of duplication deleted. The guard caught a sixteenth: the branding portal shipped that same morning, which two earlier tests had passed because they asked whether the helper was *called* rather than whether the finished handler was *used*. |
| 2026-09-01 | **Full suite** | 1,828 files / 27,848 tests, run twice. It caught the one thing no targeted run could: `/admin/branding` was missing from `tabs.generated.json` **entirely** — not the new tab, the whole eight-tab portal — so its tabs could not be switched off in settings. Absent means ON, which is why nothing looked broken. |
