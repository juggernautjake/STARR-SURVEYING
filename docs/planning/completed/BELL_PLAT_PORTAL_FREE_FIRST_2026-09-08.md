# Bell County's free plat portal, searched first — 2026-09-08

**Owner (verbatim):** "For bell county, and possibly other counties, there is a special portal with pretty much
all of the subdivision plats and additions. It actually has the winnie mae subdivision plat, and it is more
legible than the one we got. Do we have our system built to search the bell county portal to search for
subdivisions?" … "Why didn't our system look here for bell county? Why didn't we search through all of the
listed plats to find this one?" … "We need to always search this portal for free plats for bell county
searches once we have any subdivision information."

URLs: `https://www.bellcountytx.com/county_government/county_clerk/w.php` (the W index, 638 plat links),
`…/docs/plats/W/WINNIE MAE ADN.PDF` (1.9 MB; the site redirects to cms3.revize.com), `…/county_clerk/index.php`.

## Why run 6 did not get it (measured)

- The system DOES know this portal: `worker/src/services/county-plats.ts` (Bell registry, index scrape +
  fuzzy match — `normalizePlatName` already folds ADN → ADDITION) and `counties/bell/scrapers/plat-scraper.ts`
  Layer 1. Run 6's log: five direct-URL guesses → HTTP 403, then the W index → "HTTP 403 via the browser
  route too — unreachable-by-policy".
- **bellcountytx.com refuses the worker's address** (netcup, a German datacentre; every URL 403 with any
  User-Agent) and refuses Browserbase's datacentre address the same way. The same URLs answer 200 from the
  office. The browser route was supposed to use a RESIDENTIAL Browserbase session — `fetchThroughBrowser`
  never asked for one, and when asked Browserbase answers "402 Proxies are not included in the free plan".
- So the portal was searched, on every run, and could never be reached from where the worker lives; and
  the paid TexasFile pass ran BEFORE the free portal (Phase 1.5 before Phase 2B), so a reachable portal
  would still have been second.

## Slices

| # | Slice | Status |
|---|---|---|
| E1 | App relay: `GET /api/admin/research/egress?url=` — the app on Vercel (a US address) fetches one allow-listed URL (bellcountytx.com, cms3.revize.com/revize/bellcountytx/) for the worker (`x-worker-key`), returns status + bytes. | ✅ a0155c8d1 — the W index (192,922 bytes, 441 entries) comes back through Vercel; the PDFs do not (see below) |
| E2 | Worker: `fetchThroughAppRelay` is the first road around a 403 (index pages, direct PDFs, index-matched PDFs); the paid browser route stays as the last resort. Bell's egress recorded as `app-relay`. | ✅ a0155c8d1; a 402 from Browserbase exhausts the browser route for the hour |
| E3 | Free plat FIRST: at property identification, when a subdivision is known and the county has a free portal, fetch the plat, rasterise at 200 dpi, file it under the Phase 2 label (so the rows merge) — and drop the plat want from the paid pass. | ✅ a0155c8d1; an already-held plat stops the portal and TexasFile alike |
| E4 | Tests + this doc; prove live with a worker probe (portal reached through the relay, the Winnie Mae PDF fetched and matched). A full run is the owner's call (the three authorised runs are used). | ✅ probe 2026-09-08 (below) |
| E5 | Located-but-unfetchable: `locateBestMatchingPlat` keeps the exact name + URL; the early pass records `analysis_metadata.freePlatLeads`; the Analysis stage's notice opens the PDF and files the saved copy (label `Subdivision Plat: <name>`, type plat) through the Documents upload, then marks the lead filed (`PATCH /free-plat-leads`). | ✅ |

## What the probe measured (worker, through the relay, 2026-09-08)

- Five direct-URL guesses → 403 direct, 403 through the relay (the PDF redirects to cms3.revize.com, which is
  behind Cloudflare and refuses datacentre addresses — Vercel included), Browserbase → "402 Free plan browser
  minutes limit reached".
- The W index → **200 through the relay, 441 entries; "WINNIE MAE ADDITION" → best "WINNIE MAE ADN" (score 1.00)**.
  So the worker CAN read the clerk's index and find any listed plat's URL.
- The file itself → 403 (Cloudflare) via the relay; browser route 402. A cross-origin fetch from the app in the
  owner's browser cannot read the bytes either (no CORS header — measured). The one address that can is the
  owner's browser as a plain download — hence E5.
- The automated road for the bytes is a residential Browserbase session (`useResidentialProxy: true` is wired):
  it needs a paid Browserbase plan. Owner's call.

## Closed 2026-09-08 (moved to completed/)

E1–E5 built, merged and deployed (a0155c8d1 → 31917f40a). Proved live: the worker locates Winnie Mae and
Westwood Estates on the portal through the relay in 1–2 s; the portal's Winnie Mae PDF was filed on project
a7ef8036 from the office browser through the notice (row 66e940ae, vision OCR, readability partial) and the lead
was marked filed. Left to the owner: a paid Browserbase plan makes the file fetch automatic (the residential
session is wired and the 402 is named in the log); until then the notice is the road.
