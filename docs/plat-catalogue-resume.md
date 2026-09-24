# Cataloguing the Bell County plats — where to pick it up

Bookmarked 2026-09-24. The work is done in sections over time; this is what the next session needs
to know without reading the conversation that started it.

## Where it stands

| | |
|---|---|
| Bell documents in the library | 8,084 (8,079 with a file) |
| Catalogued | **239** |
| Waiting | **7,839** |
| Permanently failed | 2 |
| Identity keys written | 206 |
| State register licences on file | 5,409 |
| Individual facts extracted | 4,804 |

**Blocked on one thing:** the Anthropic credit balance ran out mid-run. Nothing resumes until it is
topped up. At the measured rate — $0.044/document, ~24 minutes per 200 at concurrency 4 — the
remaining 7,839 are roughly **$345 and 16 hours**.

## Doing a section

```bash
node scripts/catalogue-library.mjs --status                          # what is done, what is left
node scripts/catalogue-library.mjs --county bell --letters a,b,c     # one section
node scripts/catalogue-library.mjs --county bell --limit 200         # or just a batch
node scripts/catalogue-library.mjs --county bell --letters d --dry-run   # read, print, write nothing
```

Ordered by label, so a letter is a contiguous slice somebody can name and check. Stopping is free:
`catalogued_at` on the row is the only progress marker, there is no side file to lose, and every run
asks the database what is still outstanding.

### After a section, in this order

```bash
node scripts/sync-surveyor-roster.mjs        # refresh the State register (regenerated daily)
node scripts/verify-surveyors.mjs --apply    # check each name+licence against it
node scripts/corroborate-surveyors.mjs --apply   # weigh reading + archive + register
node scripts/backfill-identity-keys.mjs --apply  # citations → identity keys
```

The order matters: corroboration reads what verification wrote, and the identity backfill only looks
at rows whose key is still null, so it is safe to run repeatedly and gets more each time the
catalogue grows.

## What is recorded per document

Every value is `{ value, confidence, source_text }` — the reading, how sure the reader was, and the
verbatim words on the sheet it came from. The quote is the part that makes a doubtful value
checkable in a second.

Subdivision name · recording reference · recorded date · original survey · abstract number · lots ·
blocks · acreage · city · county · state · surveyor name · **surveyor firm** · RPLS number ·
owners/dedicators · adjoining subdivisions · search keywords.

Stored on `research_documents`: `catalogue` (the record), `catalogue_search` (a generated tsvector,
GIN-indexed, so a keyword reaches document CONTENT rather than filenames), `surveyor_verification`,
`surveyor_certainty`, `identity_key`. Individual facts also go to `extracted_data_points`, which
already carried `extraction_confidence`, `confidence_reasoning` and `source_text_excerpt`.

## The three (four) witnesses, and why there is more than one

Measured on the first 198 sheets: the reader's own confidence was **wrong 49% of the time on
surveyor identity, and 65 of those wrong readings were rated "high"**. That is not a flaw in the
rating — reading `CHARLES C LIGORI` off a stamped seal IS a confident reading of those glyphs, and
nothing in the image says no such surveyor exists.

1. **the reading** — could the glyphs be made out? Good at smudges, blind to plausible-but-wrong.
2. **the archive** — do other sheets with this licence say the same name? RPLS 4606 was read as
   CHARLES C LUCKO on 19 sheets and nine other ways once each. Costs nothing and gets stronger as
   the archive grows.
3. **the State register** (TBPELS, refreshed daily) — is this a real licensee? It also *repairs*:
   59 of 69 disagreements were a name on the register under a different number, a single-digit
   misread — 4606→4636, 6678→6878, 5972→5772.
4. **chronology** — a plat cannot be sealed by a licence granted later. Has caught **zero** so far
   across 126 comparisons; a genuine negative, not a dead check (unit tests drive both outcomes).

Current certainty: verified 51 · register_only 63 · disputed 15 · uncorroborated 70. **114 of 199
readings (57%) can be relied on without opening the sheet.**

## Things deliberately not done

- **`archive_only` is not citable.** Sheets agreeing shows we READ it consistently, not that the
  licence exists — a draftsman's house style reproduces one mistake across every plat a firm filed.
- **A correction is not a confirmation.** One agreed with the register on both halves; the other
  overrode the number. A surveyor citing a licence should see which they are standing on.
- **`medium` is refused for identifying fields**, allowed for descriptive ones. Half-sure of the
  acreage is useful; half-sure of a licence number is how the wrong surveyor gets cited.

## Known gaps, none blocking

- **188 `research_documents` rows have a `storage_path` naming a folder**, not a file — 187 of them
  customer work, dead on click in the viewer. Pre-existing. Most of those folders hold several PDFs
  and the row no longer records which one, so repair needs label→filename matching.
- 11 library rows have no file (the 50 MB upload cap).
- 76 catalogued sheets carry a citation the reader was not sure enough of to key on. Genuine
  faintness, not miscalibration.
- `recorded_date` is the weakest field at 60%, which is what limits identity-key coverage: a
  book/page citation needs a date, though a year-stamped instrument number does not.

## If a run fails

Errors are classified. **Transient** (credits, rate limit, 5xx, dropped socket) leaves no mark and
the row stays in the queue. **Fatal** (credits, auth) stops the run immediately. **Permanent** (a
folder instead of a file, nothing parseable returned) is stamped so the queue stops asking.

This exists because the first full run stamped 111 documents `catalogue_error` in a row, all of them
"credit balance too low" — and since the queue skips errored rows, one billing outage would have
quietly removed 7,800 documents from the backlog for good. If you ever see a large jump in `failed`,
check whether the cause was transient before believing it; the clear is a one-liner against
`catalogue_error`.
