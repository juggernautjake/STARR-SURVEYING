# Plats first, the correct plat, and a viewer you never leave — 2026-09-07

**Started** 2026-09-07 · **Branch** `claude/plats-first-viewer-2026-09-07` (from `main` @ `03910c888`)

Driven by the stop-hook slice loop, **in order**. Ship the smallest meaningful slice, `tsc` + lint + test,
commit, **push to the BRANCH**. Read the live code each slice touches first. Standing constraints:
`npm run build` before the owner's merge; **ask the owner before every merge**; **NEVER rebuild the
worker while a run is in flight** (`/healthz activePipelines` must be 0 — the auto-update timer on the
netcup host deploys `main` itself and defers while a run is in flight; verify `buildSha` on `/healthz`);
worker = Docker on netcup (`root@152.53.48.240`, repo `/opt/starr`, container `starr-research-worker-1`).
**Live probes run inside the container:** `docker exec starr-research-worker-1 node --input-type=module -e "…"`
importing from `/app/dist/...` — that is how every fact below was established, and how each slice's
live check should be done. Search-only TexasFile calls are free; a plat buy is $10, a deed $1/page.

## The owner's brief (2026-09-07, verbatim where it matters)

> "We need to do a completely new run on this. Please delete this research project and try again. Please
> really determine if we are finding the correct subdivision plat. If TexasFile is available for the run
> and we have the budget, please make sure that the first thing we do every single run is go to TexasFile
> and try and find the plats/drawings for the parcel/subdivision/lot. Always buy the most recent one, and
> if there is more funds, buy the others as well. Then, once we have secured the plats/drawings of the
> property and potentially the surrounding properties, we can spend the rest of the time and funds on
> finding top down imagery, GIS CAD map images, and deeds and other files and docs. … If there is simply
> no drawing or plat available on TexasFile, then it should spend the rest of the time and budget comparing
> the docs and files from TexasFile and the county portal to determine what can be bought vs what can be
> downloaded for free. … Please set the minimum TexasFile budget to $10. Also, we need to make sure that
> in the research, analysis and in the review stages that we can always review each and every file in
> the document/image viewer. … Please make it so that we can render all of the documents in the dedicated
> viewer always. Also, in the dedicated viewer, please give arrows at the top … the title of the document
> at the top of the pop up modal, and then a right and left arrow, one arrow on each side of the title,
> that can be used to move to the next document altogether. Please build this all out perfectly."

Also: **"The activity log in the activity tab needs a copy button to copy all of the activity logs."**
And (screenshot): **the Analysis-stage rows' "Analyze this" / "View" buttons must line up** whether or not
the row has a "Source ↗" link.

## STATUS — 2026-09-07, end of the build session

**Phases 1–5 are BUILT, tested and pushed** on `claude/plats-first-viewer-2026-09-07` (ten commits,
`d32477680` → the last). Worker suite 222 files / 2959 green; app suite 28k green (the one red,
`phase1-discovery › handles section names`, was the unified parser missing "LOT 1 NAME SECTION 4" —
fixed); `npm run build` green; tsc + eslint clean on both sides.

| Slice | State | Where |
|---|---|---|
| 1.1 ids from `preview_url`/`retrieval_url`; complete via `preview_url` | ✅ | `texasfile-pdf.ts`, `purchaseTexasFile` |
| 1.2 pages from the viewer's PDF — `pdftoppm` (Dockerfile) + viewer-canvas fallback | ✅ | `capturePdfPages`; `Dockerfile` (`poppler-utils`) |
| 1.3 owned document re-opens for $0, never re-bought | ✅ live-proved: 1 page, cost $0, wallet $57 unchanged | `owned` on rows; `purchaseTexasFile(... { owned })` |
| 1.4 two index rows = one plat | ✅ | cluster by cabinet/slide; planner takes the $0 owned source |
| 1.5 the RIGHT plat — index name vs CAD subdivision, cabinet/slide, date, logged at buy time | ✅ (page-text read is the Analyze run's) | `platMatchVerdict` |
| 2.1 buy BEFORE the captures | ✅ | `onPropertyIdentified` in `index.ts` |
| 2.2 plats first, newest first, then the rest; order said in the log | ✅ | `plats-first.ts` |
| 2.3 no plat → the comparison pass (unchanged behaviour, now stated) | ✅ | early pass "nothing paid-exclusive" line |
| 2.4 owner-name variants TexasFile answers | ✅ | `texasfile-names.ts`; `buyDocument` retries; discovery submits LAST FIRST per party |
| 2.5 a held deed is not bought again | ✅ | final pass hands `knownDocuments` + subdivision to the wants |
| 2.6 $10 TexasFile default | ✅ | `RerunDialog` FALLBACK |
| 3.1 CAD deed history keeps the subject's deed | ✅ | `inCadDeedHistory` (+60) |
| 3.2 host circuit per transport | ✅ | `host-circuit.ts` `direct`/`browser` |
| 3.3 the summary counts what was FILED | ✅ | `filingTallySoFar`; Results line + `documentCount` |
| 3.4 `.js` import; run-scoped meter | ✅ | commit 1 |
| 4.1–4.3 ‹ title › arrows, every stage's list, every file viewable | ✅ | `SourceDocumentViewer`, three mounts, `AnalysisEstimatePanel` |
| 4.4 aligned row buttons | ✅ | fixed grid columns |
| 5.1 Activity "Copy all" | ✅ | `ResearchRunView` |
| 6.1–6.3 delete + recreate + the new run + the loop | ⏳ **needs the merge** (Dockerfile change → image rebuild) | owner |

**Owner: say "merge"** → main fast-forwards, Vercel deploys the app, the netcup timer rebuilds the
worker image (now with poppler); then 6.1–6.3 run in the product with the log watched.

## What the 2026-09-07 run (run 2, project 7b2ca89c…, PID 64567, "WINNIE MAE ADDITION, BLOCK 001, LOT 4")
## proved, and what it exposed — every item below is a slice

The 2026-09-06 fixes worked where they reached: the CAD was read through Browserbase (legal description
parsed to "WINNIE MAE ADDITION"), the TexasFile plat search found **two plats: "WINNIE MAE ADDITION",
Cabinet A / Slide 166A, filed 09/21/1954** (the correct subdivision plat — the CAD legal description names
exactly this subdivision, the plat index abbreviates it "WINNIE MAE ADD"), the free clerk captured the
subject's deed (Vol 5456 Pg 704 = instrument 2004034968) and an affidavit, imagery + GIS + call sheet
were filed, the run finished in 9 minutes for $0.03. What went wrong:

1. **The plat was found and NOT bought.** `purchaseTexasFile` completes a purchase only when the begin
   response carries `purchase_id`; the PLAT begin response carries `purchase_id: null` and puts the id
   inside two URLs. Live shapes (2026-09-07, GUID `0FE0A9D8-…`):
   - begin `GET /document/api/purchase/texas/bell/plat/{GUID}/?from_product_content_type=search&from_product_object_id={searchId}` →
     `{"preview_url":"/document/api/purchase/126110904/complete/?from_product_content_type=search&from_product_object_id=…","retrieval_url":"/document/api/status/126110904/purchase/","images_available":true,"purchase_id":null}`
   - complete `GET {preview_url}` → `{"purchase_url":"/document/viewer/126110904/","user_balance":"$57.00","purchase_id":17446050}` — **this charges the wallet ($10)**.
   - status `GET {retrieval_url}` → `{"document_id":126110904,"available":true}` — no pages.
   - the viewer `GET /document/viewer/126110904/` fetches the document as ONE PDF:
     `https://media.texasfile.com/documents/2026-09-06/148ebff2-….pdf?response-content-disposition=inline;filename="Bell_1954-09-21_V_A_P_166A.pdf"&Expires=4102444800&Signature=…`
     (`application/pdf`; the signed link expires in 2100). The viewer is a canvas PDF renderer, no `<img>`.
   **The plat IS now bought** (purchase 17446050, wallet $67 → $57) by the probe; the fix must file it
   (re-opening the viewer for an owned document does not charge again — verify balance unchanged).
2. **The run bought plats LAST, not first.** Phase 1.5 captured six images (87 s → 222 s) before the early
   TexasFile pass ran at 223 s. The owner's order: identify → **TexasFile plats** → imagery/GIS → deeds.
3. **The final purchase pass searched TexasFile by the CAD's full owner string**
   `"CAFFREY, BARBARA SPEER & ADRIANNE CAFFERY EVERS"` → 0 results, three times. `"CAFFREY BARBARA"` returns
   39. Name variants (split on `&`, LAST FIRST, FIRST LAST, last-only) are needed for TexasFile, like
   `formatOwnerForSearch` gives the clerk.
4. **The subject's own deed was thrown out by the relevance heuristic** ("2004034968: heuristic=20/100 …
   REMOVED") because a gather run has no AI and the heuristic ignores the strongest signal there is: the
   deed's volume/page (5456/704) and instrument are IN the CAD's deed history for this parcel.
5. **`Cannot find module '/app/dist/counties/bell/analyzers/adjacent-analyzer'`** — a dynamic import
   without `.js`; adjacent properties never ran in production. ✅ FIXED in this branch's first commit.
6. **"other sources $15.25 of the $5.00 budget"** — the meter summed the project's whole ledger (run 1's
   $14.73 + AI) instead of this run's rows. ✅ FIXED (ledger rows since the run's `started_at`).
7. **The host circuit tripped by the geo-blocked DIRECT fetch also skipped the Browserbase captures**
   ("Skipping research: /Property/View/64567 — esearch.bellcad.org did not answer 357s ago") although the
   Browserbase route reads that host fine (proved: 14 s to the legal description). The circuit must be
   per host **per transport**.
8. Free plat repository (bellcountytx.com) is 403 on both egress routes — unreachable by policy; the
   free clerk has no plat for the subdivision. TexasFile is the plat source for Bell; a $10 budget is the
   floor because of it.
9. Report/UI said "Finished with 0 documents" / "0 deed record(s)" while 5 documents were filed — the
   report counts the relevance-filtered set (item 4). Fixing 4 fixes the count; the summary line should
   also count what was FILED.

---

## PHASE 1 — Buy the plat that was found (worker)

### 1.1 — Purchase ids from the URLs; complete via `preview_url`
`purchaseTexasFile`: the document id = `purchase_id ?? /purchase\/(\d+)\/complete/ on preview_url ?? /status\/(\d+)\//
on retrieval_url`. Complete by GET-ing `preview_url` (verbatim, relative to the site) when present, else the
built `purchaseCompleteUrl`. Read `purchase_id` (the receipt id), `user_balance`, `purchase_url` from the
complete body. Keep the existing `pages` path for `/instrument/` documents that return page URLs.

### 1.2 — Pages from the viewer's PDF
When neither begin nor complete returned `pages`: open `purchase_url` (the viewer) in the same context,
capture the first `application/pdf` response (or `media.texasfile.com/documents/….pdf`), download its bytes
through the authenticated context, and **rasterise** it to page PNGs. Rasteriser: **poppler `pdftoppm`**
installed in the worker's runtime image (`apt-get install -y poppler-utils` in the Dockerfile's
`mcr.microsoft.com/playwright` stage), shelled out at 200 dpi; `sharp` then JPEG-encodes the pages the
adapter files today. Keep the PDF too: file it as the document's `pages_pdf_url` so the app viewer renders
the original. Pure helpers (`documentIdFromBegin`, `pdfUrlFromResponses`) unit-tested on the recorded
shapes above; the rasteriser wrapped so a missing binary is a stated failure, not a silent zero-page buy.

### 1.3 — Already-owned documents re-open, never re-buy
A begun purchase on an owned document → the viewer serves it without a charge. Record the balance before
and after in the log line; if it moved on an "already owned" path, say so loudly. Live check on
GUID `0FE0A9D8-…` (owned since 2026-09-07): pages filed, wallet unchanged at $57.

### 1.4 — Two rows, one plat
The plat index lists two rows for Cabinet A/166A (same date). The manifest already clusters them by
cabinet/slide into one buy (texasfile-rows test). Assert in the live check that ONE purchase happens.

### 1.5 — Verify it is the CORRECT plat (OCR)
After filing, run the worker's OCR over page 1 and assert the subdivision name appears ("WINNIE MAE");
log "plat verified: subdivision name read on page 1" or "plat filed but the name was NOT read — check it".
This is the owner's "really determine if we are finding the correct subdivision plat".

---

## PHASE 2 — Plats FIRST, most recent first, all within budget (worker)

### 2.1 — Order of the run
In the Bell orchestrator the early-purchase hook (`onPropertyIdentified`) must run BEFORE the Phase 1.5
captures, immediately after the parcel is identified and named; the generic pipeline the same. Log the
order as it happens ("1. plats/drawings from TexasFile · 2. overhead views · 3. GIS/CAD maps · 4. deeds").

### 2.2 — Every plat for the subdivision, newest first
The early pass: search TexasFile plats by subdivision (+ survey name, + cabinet/slide when known), rank by
filed date DESC, buy the newest, then the rest while the TexasFile budget allows; replats/phases count.
With adjoiners enabled, the adjoiners' subdivisions too. Dedupe by cabinet/slide + GUID + the library.

### 2.3 — No plat on TexasFile → the comparison pass
When the plat search returns nothing, say so in one line and continue: the cross-source engine compares
TexasFile's rows against the county portal's and buys only paid-exclusive documents (already the
behaviour) — assert it with a test on the early-pass decision path.

### 2.4 — Owner-name variants for TexasFile deed searches
`texasFileNameVariants(owner)` (pure): split on `&`/` AND `, each party → "LAST FIRST", "FIRST LAST",
"LAST, FIRST", last-only; strip trusts/ETUX/ETAL; `buyDocument` and the search-only pass try variants
until one returns rows. Tests on the CAD string above.

### 2.5 — Don't buy what the free clerk captured
The final purchase pass's `search_required` deed wants must consult the library by canonical instrument
(2004034968 is held) and by volume/page before buying; a want satisfied free is logged as satisfied.

### 2.6 — $10 minimum TexasFile budget
Worker `MIN_TEXASFILE_BUDGET_USD` is 10 (keep); the dialog's default becomes $10 (`FALLBACK.texasfileBudget`)
with the input's `min={10}` kept; the estimate line still warns when the checklist exceeds it.

---

## PHASE 3 — The rest of the run's defects (worker)

### 3.1 — Relevance heuristic honours the CAD deed history
A deed whose volume/page or instrument matches an entry of the parcel's CAD deed history scores as the
subject's own deed (keep, +60, reason "listed in the CAD deed history for this parcel"); the affidavit
found by owner name stays scored as before. Test with the run's two documents.

### 3.2 — Host circuit per transport
`tripHost(url, err, now, transport)` / `hostCircuit(url, now, transport)` keyed `host|direct` vs
`host|browser`; direct fetch trips only the direct key; Playwright/Browserbase callers pass `browser`.
Existing callers default to `direct`. Test: a direct trip leaves the browser route open.

### 3.3 — The summary counts what was filed
"Finished with N documents" and "Documents Found" read the filed count (library tally), and the report's
deeds count is the kept set plus the filed-but-unscored set, stated separately.

### 3.4 — Bookkeeping already landed
`.js` on the adjacent-analyzer import; spend-by-budget scoped to the run window. (Both in commit 1.)

---

## PHASE 4 — The viewer (app)

### 4.1 — Title + document arrows
`SourceDocumentViewer` gains `documents: ResearchDocument[]` + `index` + `onNavigate(nextIndex)`: the
header shows ‹ **title** › with the arrows on each side of the title, "3 of 11" beneath, ←/→ keys move
between DOCUMENTS (page keys stay for pages), zoom/rotate/pages unchanged. Wrap-around off; arrows disabled
at the ends. Zoom persists across documents (the owner's earlier persistent-zoom ask).

### 4.2 — Every stage passes the whole ordered list
Research (ResearchRunView), Analysis (AnalysisEstimatePanel via page.tsx) and Review (page.tsx) open the
viewer with the same ordered document list the stage shows, so the arrows walk every file.

### 4.3 — Every file is viewable, everywhere
The Analysis-stage list shows EVERY document (images, screenshots, PDFs, captures), not only the priced
files; a document with `storage_url` OR `pages_pdf_url` OR stored file is viewable; the viewer renders a
PDF when that is what was filed (the TexasFile plat). Guard: no stage renders a document row without View.

### 4.4 — The row buttons line up
Fixed columns for pages · price · Analyze · View · Source; a row with no Source keeps the column (an empty
cell), so buttons align across rows.

---

## PHASE 5 — Activity log copy (app)

### 5.1 — "Copy all" on the Activity tab
A button beside the tab's heading copies the merged worker+browser log as text (status glyph, layer, text,
timestamp per line; the same "STARR RECON — Full Run Log" header the export uses), with a "Copied N lines"
confirmation; keep the existing export.

---

## PHASE 6 — The new run (owner-supervised; live)

### 6.1 — Delete project 7b2ca89c… and create the property fresh
Through the product (Archive/Delete on the project page, then New project: 1401 North East, Belton, Bell,
parcel 64567, owner "EVERS, JONATHAN").

### 6.2 — Run with paid documents on, TexasFile $10+ (the owner's dialog values), all files, 30 min
Watch the order (plats first), the plat purchase (owned → filed without a second charge), the OCR check,
imagery, GIS, deeds, the spend line (this run only), and the finish counts.

### 6.3 — Analyze → leads → follow-up (the loop)
Then the Analyze button (worker-driven), the Discovered Leads panel, and one follow-up round.

---

## PHASE 7 — Verification
Full worker + app suites green; tsc + lint; `npm run build`; then the owner merges, the worker auto-updates
(Dockerfile change → image rebuild), and 6.x runs. Move this doc to `completed/` when 6.3 is done.
