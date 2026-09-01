# Research flow, scope guard, and the UI audit — 2026-08-31

**Status:** IN PROGRESS · opened 2026-08-31 · built one slice per pass.

Follows `RESEARCH_UI_OVERHAUL_2026-08-30.md`, which closed the same day. That doc was about how the
research pages *look and are built*. This one is about what a person can actually **do** with them,
end to end, and about the one thing the platform currently cannot say: **"this property is not
somewhere we can research."**

---

## The owner's ask, in their words

> *"input information, choose the settings for the research run, link the research to a specific job
> if they want, navigate back and forth throughout the research flow, check all retrieved files and
> stuff, view all images, upload their own files and images, write notes and stuff, see the logs and
> all of that. But the basics are just, input information, hit the research button, wait for it to
> finish, review results."*

> *"The system should also have sanity checks so that it can tell when a property is not within the
> scope that we have set for the research platform. Like, if we are researching a property in a state
> we have not built the system for yet, then it should realize that and tell the user and not
> actually run the research. But if the address/property is within an area that we have scoped the
> software for, then it should proceed."*

> *"a thorough audit of all of the pages and UI and styling and formatting with playwright … screenshot
> all of the pages and then evaluate them all … Make sure the new UI elements and pages can use all of
> the predefined styling themes."*

---

## ⚠ READ FIRST — what is actually true today, measured 2026-08-31

Every row below was checked against the repository, not remembered. The previous doc recorded six
parked premises that turned out to be false when finally checked; this table exists so this one does
not add a seventh.

| Claim | Measured |
|---|---|
| The platform is Texas-only | **True, and nothing says so.** `getClerkByFIPS()` strips a leading `48` — the Texas state FIPS — and `getClerkByCountyName()` matches against `TEXAS_COUNTIES`. There is no other state's registry. |
| An unknown county is rejected | **False.** Both lookups fall through to a TexasFile entry with `fallback: true`, and the run proceeds. A New Mexico address gets a "county not in registry" note and then a real, billable run. |
| The county field is validated | **Partly.** `lib/research/county-input.ts` + `CountyNote` warn on the *typed string* — and deliberately do not block, for a reason worth keeping: the check fires while somebody is halfway through typing, and a form that refuses at "Bel" teaches people to fight it. It is **client-side, and it never runs at the moment a run starts.** |
| The state field is validated | **Not at all.** `state` is stored (`'TX'` on the one live project) and read by nothing that gates a run. |
| Adapter coverage is known | **Yes, and it is finer than yes/no.** 25 counties in `CLERK_REGISTRY`: **2 implemented, 18 stub, 3 unavailable**. The Coverage tab already renders this. Nothing consults it before a run. |
| A project can be linked to a job | **Column only.** `research_projects.job_id` exists and is `null`; **zero `.tsx` under `app/admin/research` mentions it.** |
| There are two run-start paths | **Yes** — `app/api/admin/research/[projectId]/analyze` (in-app) and `app/api/admin/research/batch` (worker). The previous doc's READ FIRST is still the single biggest source of confusion here, and **a scope guard has to sit on both or it is not a guard.** |

**The consequence, stated plainly:** the one defect the owner described is real and is currently
unguarded. A run on an out-of-state property does not fail fast — it geocodes, routes to a Texas
aggregator, and spends money finding nothing.

---

## How to work this doc

Same rules as the doc it follows, and they are not ceremony — they are what produced sixteen
findings there:

1. Behaviour-preserving unless the slice says otherwise.
2. `npm run type-check`, `npm run lint`, `npm run build` — **exit codes read unpiped.**
3. Every slice carries a test that asserts the **caller**, not just the unit.
4. Every guard is **mutation-tested**: break the thing it guards and watch it go red.
5. Every new surface is checked against **all eleven palettes**, not just the default. F2 shipped
   that instrument; using it is now the standard, not an extra.
6. Annotate this doc with what shipped and what it cost.

---

## Phase S — the scope guard *(first, because it is the one that spends money)*

### S1 — What "in scope" means, as data ✅ **SHIPPED 2026-08-31** — `lib/research/scope.ts`

One module, `lib/research/scope.ts`, that answers one question: **can this platform research this
property, and how well?** It is the only place the answer lives, and both run paths and the UI read
it.

```
inScope(state, county) → { verdict, reason, adapter }
```

Four verdicts, because two is not enough to be useful:

| Verdict | When | What the UI does |
|---|---|---|
| `supported` | A county with an `implemented` adapter | Run. |
| `degraded` | A Texas county whose adapter is `stub` — the aggregator will be used, documents cost money | Run, **after saying what it will cost and getting a click.** |
| `unavailable` | A Texas county whose adapter is `unavailable` — no online portal known | **Do not run.** Say what is missing and what the manual path is. |
| `out-of-scope` | Any state that is not Texas | **Do not run.** Say so plainly, and say which states we do cover. |

**The state check is the new thing and it is the whole point.** The county half already has a
registry; the state half has never existed, and `getClerkByFIPS`'s `.replace(/^48/, '')` is the
proof — it is Texas-only by construction and by accident at the same time.

**Derived, not typed.** The verdict comes from `CLERK_REGISTRY` and `TEXAS_COUNTIES`, so adding a
county to the registry moves it into scope with no second list to update. A hand-maintained list of
supported counties beside a registry of adapters is G12 waiting to happen.

### S2 — The guard on both run paths ✅ **SHIPPED 2026-08-31**

`analyze/route.ts` and `batch/route.ts` both call `inScope` before doing anything expensive, and
return a **422 with a structured body** — verdict, reason, and what the operator can do — not a bare
500. A guard that only lives in the browser is a guard the batch form walks around.

The test asserts the **route** refuses, not that the function returns the right string.

### S3 — Say it before they click, not after ✅ **SHIPPED 2026-08-31** — `ScopeNotice`

The New Research Project modal and the batch form already have `CountyNote`. They gain the scope
verdict beside it: state and county resolved together, with the adapter's real status named. The
distinction the existing note draws — **warn while typing, decide at submit** — is kept, because it
was right.

And the project page's run button carries the verdict too. A button that starts a run it knows will
be refused is worse than a disabled one.

### S4 — Degraded is a price, so show the price ✅ **SHIPPED 2026-08-31**

The batch form's estimate read *"A ceiling, not a forecast: counties with a free portal spend
nothing."* True, and unactionable — it says **some** of these are free without saying **which**, so
an operator looking at "Up to $500.00" cannot tell whether that means five dollars or five hundred.

The scope check already knows, per row: `degraded` is exactly the paying case (no adapter of our
own, so the TexasFile aggregator, charged per document) and `supported` is exactly the free one. The
sentence carries the numbers now — *"3 of them are in a county with no adapter of our own… 2 use a
free county portal and will spend nothing"* — derived from the same verdicts the guard and the
row notices use, so a fourth rule cannot disagree with them.

"A ceiling, not a forecast" stays. Removing it would be the opposite error: most runs in this firm's
working area spend nothing, and presenting the ceiling as a forecast makes every batch look
unaffordable.

**The in-app path deliberately gets none of this**, because it cannot buy a document at all — the
doc's READ FIRST fact. A spend confirmation on a screen that cannot spend is noise that teaches
people to click through the one that can.

---

## G18 — the portal Library had the same blank rows, in a second file (2026-08-31)

`library--desktop.png`. Seventeen rows, all blank. **"17 purchased · $0.00 spent"** in the header.

`_tabs/LibraryTab.tsx` cast `/api/admin/research/library`'s response to its own `LibraryDocument` —
`documentId`, `instrumentNumber`, `description`, `grantor`, `grantee`, `purchased`,
`usedInAnalysis`, `relevanceScore`, `fileFormat`. That route returns the same raw
`research_documents` rows the per-project one does, plus a `project` join. Every field `undefined`.

**G17 in a second file.** The bug had already been found once, which is exactly why nobody looked
again — and it is the argument for the shaping being *shared* rather than fixed twice. `LibraryTab`
reads `toLibraryCards` now, and there is one `formatBytes` instead of two.

Two filters were dead as well, and dead in a way that looked like a working feature:

- **"Purchased"** filtered on `doc.purchased`, which does not exist — so the chip matched nothing on
  every project, forever. It is **"Uploaded"** now, on `source_type`, which is a real question.
- **Sort by "relevance"** compared `undefined` to `undefined` — a no-op presented as an option. It
  sorts by size, which is a real question: which of these is the big plat.

### "17 purchased · $0.00 spent" was a self-contradiction

`totalPurchased` counted every document whose `source_type` was `property_search` or
`linked_reference` — **everything the pipeline retrieved, free or not** — and `totalSpent` was a
hard-coded `0` behind a `TODO: integrate with billing tracker`. So a firm with **zero rows** in
`research_document_purchases` was told it had bought seventeen documents for nothing.

Both come from the purchases table now, and only `completed` counts — the seed's partial unique
index says why: a failed attempt is a record, not a claim of ownership, and a refund releases the
document to be bought again. The header reads **"0 purchased · $0.00 spent"**, which is true.

**429 chars of rendered text → 3,239.**

And the check that asserts the hard-coded zero is gone had to be **narrowed**: a whole-file scan
flagged the two `{ totalDocuments: 0, totalPurchased: 0, totalSpent: 0 }` empty-state responses,
which are correct — a firm with no projects has spent nothing — and a check that sends somebody to
fix working code is worse than no check.

---

## The two remaining audit findings

**G — the round checkbox is real, product-wide, and not this doc's to change.** Measured rather
than eyeballed: `border-radius: 50%` and `appearance: none` genuinely apply. The source is
`AdminLayout.css:1376`, *"Global Checkbox Styles (circle / dot design)"* — and it silently defeats
`AdminLayout.css:350`, the `checkbox-radio-reset-2026-06-21` block whose own comment says the fix
exists so *"checkboxes/radios across the site read as proper, perfectly round (radio) or square
(checkbox) controls"*.

Two deliberate decisions, ~1,000 lines apart in one file, disagreeing about whether a checkbox is
round; the later one wins on source order at equal specificity. **Every checkbox in the admin is
affected**, so this is an admin-shell finding like E1b, recorded with its evidence and not changed
on the strength of one research screenshot.

**H — was not what it looked like.** The Library's 429 characters were not a missing empty state.
They were G18: the page was full of rows that rendered nothing. Fixed above.

---

## Phase J — the job link

### J1 — Link a research project to a job ✅ **SHIPPED 2026-08-31** — `JobLinkPicker`

**A column, an index, and no way in the product to use either.** `research_projects.job_id` has
existed since `seeds/090_research_tables.sql:141` with `idx_research_projects_job` on it and a
comment reading *"optional link to a jobs record"*. Measured before this slice:

- **zero** `.tsx` under `app/admin/research` mentioned it;
- the POST route accepted it, and no form ever sent it;
- the PATCH allowlist did not include it at all.

So the only way to attach a project to a job was to send `job_id` at creation, from a form that did
not offer the field — and once created, nothing could change it.

That is this repository's *other* recurring shape, beside the cast-that-matches-nothing: work that
exists, is indexed, is half-wired, and is unreachable. `api-routes-are-reachable.test.ts` records
eleven at the module level; this is the column-level equivalent.

#### What shipped

`JobLinkPicker` — a **search**, not a `<select>`. A dropdown of every job is fine at two jobs and
useless at two hundred, and what somebody knows is the job number or the address, not its position
in a list. Debounced against `/api/admin/jobs?search=`, the same shape the project list already uses.

It names the linked job rather than reporting that one exists. A row reading "Linked" makes somebody
open another tab to find out to what, so the header carries `26135 — Anthony ProTech Survey · 311
Morning Dove Lane, Buda` as a real link to the job. `jobLabel` never returns an empty string, for
the same reason `titleOf` does not: a blank option is one nobody can choose and looks like a bug.

**`null` is a real value on PATCH.** Unlinking is a thing somebody does, so `undefined` means "the
caller did not mention it" and `null` means "detach". Folding the two together — which is what the
neighbouring `|| null` fields do, correctly, because they have nothing to preserve — would have made
unlinking impossible. That distinction is a test and a mutation.

A search failure is said out loud rather than rendered as "no matches": they are different answers
to *"which jobs are there"*, and one of them means try again.

Checked on four palettes; every colour is a token that exists, asserted.

### J2 — Carry the job's property into the form ☐

Creating a research project *from* a job should pre-fill the address, county and state from the job
rather than asking twice. This is where the scope check earns its keep silently — the address is
already known to be one we work.

---

## Phase N — navigation, notes, files, images

### N1 — Move backwards and forwards through the stages ✅ **SHIPPED 2026-08-31** — `_sections/stage-view.ts`

**There was no such thing as *looking* at a stage.** `currentStage` came straight off
`project.status`, so seeing an earlier screen meant calling `handleRevertToStep` — a PATCH behind a
red confirmation that correctly warns it may permanently delete extracted data points. Going back to
re-read the property form meant **telling the database the run had not happened**.

Forward was not possible at all: the stepper only accepted clicks on stages *before* the current
one, so once you had reverted, the only way back was to run again.

The tell that this was already a known problem is in the code: `holdOnResearchStage`, a boolean
whose entire purpose is keeping somebody on Stage 2 after the DB has moved to `review`. One
hard-coded special case of *"the stage I am looking at is not the stage the row says"*.

#### Two values, and one of them writes nothing

| | |
|---|---|
| `reachedStage` | How far the project has actually got, from `status`. Only the pipeline and an explicit revert move it, and moving it is a database write. |
| `viewStage` | The screen in front of you. Moving it writes nothing, deletes nothing and asks nothing. Any stage up to and including `reachedStage`. |

Not beyond: a Review screen for a project that has never run is four empty panels and a promise the
page cannot keep, and this portal has shipped that shape before — a stat tile that scrolled to an
empty section, fixed by disabling the tile.

`holdOnResearchStage` **stays**. It encodes a real transition — the run finished and you have not
clicked Continue — rather than a navigation choice, and folding it in would make *"finished but not
acknowledged"* indistinguishable from *"went back for a look"*.

#### The distinctions that took a second pass

- **`isDone` used to mean two things.** "The pipeline finished this" and "this is behind the screen
  you are on" could not differ before; now they can. Looking back at Stage 1 from a project that has
  reached Review must not redraw Stages 2 and 3 as unfinished.
- **Opening and reverting were the same click.** They are now the circle and a named
  *"Restart from here"* link, because one of them can delete data and the other cannot.
- **An openable stage looked identical to an unreachable one.** Photographed: stage 3 reachable,
  stage 4 not, two pixel-identical grey circles. *"Which of these can I click"* is not a question a
  stepper should make somebody answer by trying. Dashed ring for openable, faded for not.
- **A deliberate move of the project drops the reader back to following it.** Otherwise starting a
  run while looking at Stage 1 leaves you on Stage 1 watching nothing happen.
- **A choice that has un-happened falls back.** You are reading Review; somebody reverts to Upload.
  Rendering Review then shows analysis results that were just deleted.

#### And the circle became a real `<button>`

It was a `div` with `role="button"`, a hand-written `onKeyDown` for Enter and Space, a toggled
`tabIndex` and an `aria-disabled` — thirty lines re-implementing what the element does for free, and
getting disabled semantics only approximately.

**Six mutations, all red**, including the two that matter: any stage becoming viewable, and the
stepper going back to reverting on click. One assertion caught its own fixture rather than the code
— `resolveViewStage('jobprep', 'research')` passes a *stage* where a *status* belongs — which is the
good outcome, and is noted where it happened.

Driven in a browser: Stage 3 → Stage 1 → back to Stage 3, with the banner appearing and clearing,
and no write in between. Four palettes clean.

### N2 — Notes that survive ✅ **SHIPPED 2026-08-31** — `ProjectNotes`

**The notes existed, three levels down, and lost writes silently.**

`analysis_metadata.job_notes` was already persisted, already debounced, and already had a good
placeholder. It rendered in exactly one place: **Stage 4 → the Job Prep tab → the "Final Document"
sub-tab.** So the notes somebody takes *while reading the results* — which is when a surveyor takes
them — had nowhere to go until the project reached the last stage.

#### And the save swallowed its own failure

```ts
} catch { /* silently ignore — next save will retry */ }
```

The comment is honest about the intent and wrong about the consequence. **There is no next save if
the person stops typing**, and stopping is exactly what somebody does when the note is finished. A
dropped request left the text in the box, gone on reload, with nothing ever saying so.

It also never looked at the response. `await fetch(...)` with no `res.ok` treats a 500 as a save,
and this API returns those.

Notes are the one category of content the system **cannot regenerate**. Losing one quietly is the
worst version of this repository's most common failure, which is the symptom being silence. So the
state is on the screen and it is one of four things: *Auto-saves as you type* · *Saving…* · *Saved
6:49:58 PM* · **Not saved — HTTP 500 [Retry]**.

The retry posts **the text that failed**, not whatever is in state by then — without that, a retry
after a re-render sends the wrong content and reports success.

#### One component, two places

The Job Prep tab keeps its notes box; it is now the same component reading the same field. Two
hand-written textareas against one column is how two boxes come to disagree about what was typed —
and the page's own debounce, PATCH and status flag are gone, because two savers racing on one field
is worse than one that reports what happened.

On the project page it is a **collapsed** panel between the stage banner and the run control, so it
does not compete with the primary action but is one click away from every stage. Collapsed, it says
how many words it is holding: a collapsed panel that gives no sign it contains anything is a panel
nobody opens twice.

#### The assertion that survived its own mutation

The first version of *"the notes panel is not gated to one stage"* checked that `<ProjectNotes`
appears **before** the first `{currentStage === 'upload' && …}`. Wrapping the panel in
`{currentStage === 'jobprep' && …}` keeps it before that point, so the mutation survived: the panel
was gated to one stage and the test was happy. Position is not the property.

Rewritten to read the code immediately before the tag — and it then found the tag inside a `//`
comment explaining that the save had moved into it. **Twelfth time a check here has read its own
prose.** `stripJs`, as the house rule says.

Five mutations, all red. Driven in a browser including a forced 500: the box says *Not saved — HTTP
500* with a working Retry. Four palettes clean.

### N3 — Every retrieved file, and every image ✅ **SHIPPED 2026-08-31**

**The library said "0 viewable images" on a project holding 73 of them.**

Measured on the live project: 17 documents, `file_type` `'pdf'` on every one — and every one of
those PDFs had its pages rendered to PNGs by the artifact uploader and stored in
`ocr_regions.pageUrls`. The header keyed "is there an image" off `file_type`, so it reported zero.

#### `ocr_regions` is a JSON string, and that is the whole trap

PostgREST returns it as text. Reading `.pageUrls` off the string gives `undefined`; iterating its
keys gives `0, 1, 2 … 343`, which is what a 343-character string looks like when you mistake it for
an object. That is exactly what the first probe here printed, and it is why the diagnosis took a
second look rather than one.

`SourceDocumentViewer` has had the correct extractor all along. It moved into the shared module
rather than being written a second time — two parsers for one column is how they come to disagree
about whether a document has pages, which is G12 with a different shape.

#### What the library does now

| | |
|---|---|
| Header | **73 page images** rather than 0. A number that is true. |
| Filter | **Images (17)** — the documents you can actually look at. |
| Row chip | *"2 pages to view"*, not a bare "Image" badge. What a reader wants is how many. |
| Viewer | **The pages, in order, at full resolution**, each a link that opens full size — lazy-loaded, with a "Page 1 of 3" label under each when there is more than one. |

Pages before the PDF frame, deliberately: they scroll, they zoom, they open full size, and they
work where a browser's PDF plugin does not. The `<object>` fallback stays for a document with no
rendered pages, and a record with no stored file still says so rather than showing a broken frame.

Driven in a browser against the live storage bucket: the first deed renders at **2550px natural
width**, readable, with its three pages labelled.

### N5 — The logs, where you are ✅ **ALREADY SHIPPED — closed 2026-08-31**

Checked rather than assumed. The Review stage already carries a "Research Logs" section, always
visible, loading from `/api/admin/research/[projectId]/logs` on demand — so the question *"why does
this section say nothing?"*, which is asked while reading results, is answerable from the screen
where it is asked. Nothing to build.

### N4 — Upload your own files and images ☐

`DocumentUploadPanel` exists and works. What it lacks is parity with the retrieved list: an upload
should land in the same place, be viewable the same way, and be distinguishable by `source_type`.

---

## Phase U — the UI audit

### U1 — Screenshot every research page ✅ **SHIPPED 2026-08-31** — `scripts/capture-research-ui.mjs`

Twelve routed pages × two widths = **24 shots**, with a manifest, into
`docs/planning/qa-evidence/ui-audit/`. Deliberately not a gate: it fails nothing and produces
evidence.

Two things it does that a naive `fullPage: true` gets wrong. The floating dock is hidden for the
capture — a `position: fixed` element is painted **once**, at its scroll-0 position, into a stitched
full-page image, so it appears lying across content it never actually covers; that question is
answered by `elementFromPoint` in the E3 spec, and a picture will confidently suggest a wrong
answer. And the route list is swept from the filesystem rather than typed, because a route added
after the list is a route nobody looks at.

### U2 — Read the shots ✅ **FIRST PASS 2026-08-31**

The first frame answered the question the assertions could not. Every gate was green — overflow,
occlusion, contrast on eleven palettes, 27,000 unit tests — and this was on the screen:

---

## G17 — the Document Library had never worked (2026-08-31)

`documents--desktop.png`. Header: **"17 documents"**. Filter chips: right. Seventeen rows: **blank**.
Each one an empty dark box with a dash in it.

```tsx
const data = (await res.json()) as { documents: ResearchDocument[] };
```

`ResearchDocument` declared `documentId`, `type`, `instrumentNumber`, `description`, `grantor`,
`grantee`, `recordedDate`, `pageCount`, `fileFormat`, `sizeBytes`, `purchased`, `usedInAnalysis`,
`relevanceScore`, `thumbnailUrl`.

The route does `select('*')` on `research_documents`, whose columns are `id`, `document_type`,
`document_label`, `original_filename`, `page_count`, `file_size_bytes`, `recorded_date`,
`source_type`, `storage_url`, `processing_status`.

**Not one field matched.** Every value was `undefined`. `DOC_TYPE_ICONS[doc.type]` was `undefined`,
`key={doc.documentId}` was `undefined` for all seventeen rows at once, the search filtered on four
fields that do not exist, the sort compared `undefined` to `undefined`, and the preview pane pointed
at a `/preview` route that does not exist using an id that was undefined.

Nothing errored. `tsc` was happy. The page loaded, the count was right, and the symptom was silence.

**Fourth instance of this exact shape** — after `activity_log`'s `action`/`details`,
`research_documents.analysis_metadata`, and G10's owner name. And it is the page the owner named
directly: *"check all retrieved files and stuff"*.

### Why every existing check missed it

Worth stating, because the answer is not "we should have had more tests":

| Check | Why it was silent |
|---|---|
| `tsc` | A cast is an assertion, not a check. `as { documents: ResearchDocument[] }` makes the compiler agree by construction. |
| `writes-hit-real-columns` | Checks **writes**. This is a read. |
| `review-reads-what-the-worker-writes` | Covers the Review tab's casts. Nobody had written the equivalent for this page. |
| E3 responsive | Asked whether the page overflows. It does not. |
| `check-portal-themes` | Asked whether text is readable. There was no text. |
| `rendered-classes-are-styled` | The classes are Tailwind and are fine. |

Every one of them was answering its own question correctly. **A screenshot asked a different
question**, which is the entire argument for U1.

### The fix

`documents/document-rows.ts` — the shaping, with `DOCUMENT_ROW_COLUMNS` held against the
`create table` and `alter table … add column` statements in `seeds/` by
`document-library-reads-real-columns.test.ts`. The twelve fictional names are asserted in the other
direction too, so the cast cannot quietly come back.

`titleOf` never returns an empty string — it falls through `document_label` → `original_filename` →
the id. That is the finding turned into a property: a blank row is indistinguishable from a
rendering bug, because for seventeen rows it *was* one.

The page was rebuilt on it, and gained what it was missing:

- **An image viewer.** *"be able to view all images"* — images render inline and open full size,
  PDFs go in an `<object>` frame with a real fallback link, and a record with no stored file says so
  rather than showing a broken frame.
- **Uploaded vs retrieved.** `source_type === 'user_upload'` is a filter and a chip. The owner asked
  to upload their own files *and* to check what the run retrieved; if the two look identical in the
  list, neither question can be answered from it.
- **Counts on every filter chip**, not just "All". A filter that turns out to be empty after you
  click it is a filter you learn not to trust.
- **Honest header counts.** It used to promise "purchased" and "used in analysis" from two fields
  that do not exist, so both read 0 on every project forever.

**360 chars of rendered text → 2,448.** All four checks re-run green, on four palettes.

---

## What the shots showed that is not yet fixed

Recorded here rather than fixed in the same pass, one cluster per slice:

| # | Where | Finding |
|---|---|---|
| A | `portal--desktop.png` | **Three primary buttons in a row, three colours** — green "Coverage", purple "Testing Lab", blue "+ New Research Project". Two of the three duplicate tabs sitting directly above them. No hierarchy: everything is emphasised, so nothing is. |
| B | `6588…--desktop.png` | **Two buttons that start a run, on one screen** — "Start AI analysis" in the action bar and "Initiate Research & Analysis" at the foot of the form. The doc's READ FIRST already names pipeline confusion as the biggest problem here; this is two doors to the same room, labelled differently. |
| C | `6588…--desktop.png` | **The property form is below seventeen documents.** The information you must enter *first* is the last thing on the page, ~2,400px down. |
| D | portal vs project page | **"Step 1 of 7" and "Stage 1 of 4"** describe the same project on two screens. Two numbering systems for one thing. |
| E | `6588…--desktop.png` | The stats row reads **17 / 0 / 0 / –**. Three zeroes and an em-dash for "Resolved", which means the same thing and looks like a different kind of nothing. |
| F | project page vs library | The same seventeen documents are **"Pending" on one screen and "unreadable" on the other**. Both read a real column; they read *different* real columns. |
| G | `6588…--desktop.png` | The document rows carry a circle that looks like a **radio button** beside "Select all" / "Deselect all", which implies checkboxes. |
| H | `library--desktop.png`, `billing--desktop.png` | 429 and 519 characters on a 1440px page. Near-empty screens with no empty state explaining what would fill them. |


### U3 — Fix what U2 found ◐ **FIRST BATCH SHIPPED 2026-08-31**

Six of the eight clusters. Each was found in a picture, and none of them by an assertion.

| # | Finding | What shipped |
|---|---|---|
| **A** | Three primary buttons in a row, in three colours, two of them duplicating tabs directly above | One primary. `Coverage` and `Testing Lab` became `.research-page__secondary-btn` — same size and shape so the row still reads as a group, tinted and outlined rather than filled. Their inline `#0F766E` and `#7C3AED` are gone: those followed no palette, and a purple button on the plum theme was indistinguishable from the page behind it. |
| **B** | Two buttons that start a run, on one screen, with two different names | One name for one act. Both now read **Start AI analysis** — the action bar's words, because they are the ones that describe what happens. `Initiate Research & Analysis` is gone from the form, its header, and its re-run label. |
| **C** | The property form sat below seventeen documents | The form comes first now. On this project it was ~2,400px down, under a list nobody came here to read — and it carries the run button. The owner's own description of this flow is four steps and **step one was last**. |
| **D** | "Step 1 of 7" on the card, "Stage 1 of 4" on the project page, same project | One numbering. Seven is the count of DB statuses; four is the count of stages a person works through, and `PIPELINE_STAGES` was already the mapping. The card follows the stepper — `Stage 1 of 4 — Upload` — derived from the same constant, so a fifth stage moves both. |
| **F** | The same seventeen documents were **"Pending"** on one screen and **"unreadable"** on the other | See below. This one was not cosmetic. |
| — | "Property Information" rendered twice, sixty pixels apart, each with its own paragraph | The embedded form drops its own heading when the caller supplies one, which is exactly what `hideResultsAndProgress` already meant. |

#### F was a real defect wearing a cosmetic one

`DocumentUploadPanel` had a six-entry status map and this fallback:

```ts
PROCESSING_STATUS_LABELS[doc.processing_status] || PROCESSING_STATUS_LABELS.pending
```

`unreadable` was not one of the six. **Seventeen documents the pipeline could not read were
reported, permanently, as "Pending"** — and "Pending" means give it a minute. These needed somebody
to look at them, and nothing on that screen ever said so.

The vocabulary moved to `document-rows.ts`, both screens read it, and the fallback now renders the
raw value rather than choosing a friendlier word at random. An unfamiliar status looking unfamiliar
is the honest failure; an unfamiliar status looking like "Pending" is the one that cost seventeen
documents. `#F59E0B` (2.15:1) and `#059669` (3.77:1) went with it.

**And the check tripped over its own prose for the eleventh time**: the assertion that the lying
fallback is gone matched the *comment in `DocumentUploadPanel` explaining what it used to do*.
`stripJs` before scanning, with a control asserting both directions.

#### Still open

| # | Finding |
|---|---|
| **E** | The stats row reads `17 / 0 / 0 / –`. Considered and **kept**: the em-dash is "no discrepancies to resolve yet", which `0/0` would misstate. Recorded rather than changed, because the existing code reasoned about it explicitly and overriding that on cosmetic grounds is the wrong call. |
| **G** | The document rows carry a circle that reads as a radio button beside "Select all" / "Deselect all". It is a real `<input type="checkbox">` — the affordance is the bug, not the behaviour. |
| **H** | `library` and `billing` render 429 and 519 characters on a 1440px page, with no empty state saying what would fill them. |

### U4 — Every new surface, on every palette ☐

Anything this doc adds is checked with `check-portal-themes.mjs` across all eleven palettes before
it is called done. F2 established that this is cheap once the instrument exists; the cost of not
doing it was 76 findings.

---

## Deliberately NOT in scope

- **A second state.** The guard's job is to *say* we do not cover New Mexico, not to start covering
  it. Adding a state is a registry, an adapter and a county list — a programme, and a different one.
- **`DrawingCanvas.tsx`.** Still its own project, as the previous doc said.
- **Rewriting the run pipeline.** The two-pipeline split is stated, guarded and surfaced; unifying
  it is not this doc's slice.

---

## Known traps, carried forward

1. **Route-scoped CSS.** `AdminResearch.css` loads last on research routes; a shared-class fix made
   elsewhere misses these pages.
2. **Authored but not wired.** Assert something imports *your* file.
3. **A probe can be the bug.** Strip comments; run a control that should fail.
4. **Two pipelines.** Any run-starting UI must name its engine — and now, check its scope.
5. **`$?` after a pipe** is the pipe's status.
6. **A stale `next start` serves 400s for its own assets** after a rebuild, and the page then sits on
   the admin shell's "⏳ Loading…" — which reads exactly like a broken session cookie. `pkill -f`
   does not kill it on Windows; `Get-NetTCPConnection -LocalPort 3050 | Stop-Process` does. Three
   "clean" theme runs were measuring an unhydrated page before this was found.

---

## Slice log


| Date | Slice | What shipped |
|---|---|---|
| 2026-08-31 | S1 · S2 · S3 | `lib/research/scope.ts` — four verdicts derived from `CLERK_REGISTRY`, never a second list. Guards on **both** run paths, 422 with a renderable body. `ScopeNotice` on all three surfaces that start a run. 66 tests; eleven mutations, two of which survived the first round. |

### S1–S3 — the scope guard, shipped 2026-08-31

#### Two mutations survived, and both were the ones that mattered

`checkScope` imported, ordered before `analyzeProject`, and a `scopeRefusal(` somewhere in the file
— all asserted, all true, and all satisfied by a guard whose condition is `if (false)`. Replacing
`if (!scope.canRun)` with exactly that left **all 46 tests green**. The check was present, imported,
ordered correctly, and did nothing.

Renaming the batch route's filtered list survived the same way: `.filter((r) => !r.scope.canRun)`
was still in the file and `rows:` was still in the file, so both assertions passed while nothing was
checked. `tsc` would have caught that particular slip — and a guard that leans on the compiler to
notice is one refactor away from not being a guard.

Both read the **condition** now rather than the presence: the nearest `if (…)` above the refusal has
to mention `scope.canRun`, and the list the batch route builds has to be the list it tests. Seven
more mutations across the module and the three UI surfaces, all red.

#### What the guard refuses, and what it deliberately does not

| | |
|---|---|
| `out-of-scope` | A state we have not built — **the case the owner asked for**, and there was no state check anywhere in the system before this. Also a string that is not one of Texas's 254 counties. |
| `unavailable` | One of the three counties whose clerk has no online system at all. An automated run returns nothing, so it does not start, and the message says what has to happen instead. |
| `degraded` | **Not refused.** 18 of the 25 registry entries are stubs, and the other 229 counties route the same way — refusing them would refuse most of Texas. It is a price, so the notice states the price. |
| `unknown` | A blank form. Renders nothing: a form somebody has not filled in yet is not a problem to report at them. |

The only hand-written list in the module is `SUPPORTED_STATES`, and it has one entry. A
`SUPPORTED_COUNTIES` array beside `CLERK_REGISTRY` would be G12 with money attached: it would go
stale the first time somebody built an adapter, and it would go stale **silently**, because the run
would still be refused and nobody would find out why.

#### Ordering, which is most of the message

The state is answered before the county. Checking the county first reports *"Sandoval is not a Texas
county"* for a New Mexico property — true, useless, and it points the operator at the wrong field.

#### Three surfaces, one function

The project page's run button is `disabled` on `!scope.canRun` and points `aria-describedby` at the
notice, so a disabled button is never a dead end for somebody not looking at the amber box. The
batch form blocks submit on any refused row and names the rows, because the API returns 422 for the
whole batch and a form that let you send one would be a guaranteed round trip to a red banner. The
create modal **warns and does not block** — recording a property we cannot research is reasonable,
and what is refused is the run.

The batch form and the batch route both default a blank state column to `TX`, and the test asserts
them against each other. Two defaults that disagree is how a form comes to promise what the API
refuses.

#### And a token that did not exist

`ScopeNotice.css` was first written against `--color-danger-text` and `--color-danger-bg`. Those
names are defined nowhere; the real ones are `--color-error-*`. It would have rendered perfectly
through its fallbacks and quietly opted the whole notice out of theming — the exact defect
`tokens.css:110` records in its own words. The test now asserts that every token the sheet reads is
defined somewhere.

Driven in a browser on `starr-default` and `starr-dark`, and checked on all eleven palettes: no
unthemed surfaces, no unreadable text.
