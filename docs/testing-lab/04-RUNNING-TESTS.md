# Running Tests — Complete Guide

This guide covers every way to run tests, interpret results, and use the data.

---

## Test Types

### Individual Scrapers (Scrapers Tab)

Scrapers fetch data from external websites and APIs. They are the most frequently tested components because external sites change often.

**When to test a scraper:**
- After modifying adapter code (CSS selectors, parsing logic)
- When a county updates their website
- When adding support for a new county
- As a sanity check before running the full pipeline

**How to read scraper results:**
The JSON output typically contains:
```json
{
  "propertyId": "R12345",
  "ownerName": "Smith, John",
  "legalDescription": "LOT 5, BLOCK 2, WESTERN HILLS",
  "acreage": 0.25,
  "documents": [...],
  "log": [...]
}
```

**Key fields to check:**
- `propertyId` — did it find the right property?
- `ownerName` — is the name correct and properly formatted?
- `legalDescription` — is it complete (lot, block, subdivision)?
- `documents` — how many documents were found?
- `log` — check for warnings or errors in the attempt log

### Individual Analyzers (Analyzers Tab)

Analyzers process data that was previously harvested. They need a Project ID with existing documents.

**When to test an analyzer:**
- After modifying AI prompts
- After changing extraction logic
- When analyzing a new document type
- When debugging incorrect data extraction

**Analyzer results to look for:**
- **Deed Analyzer:** Bearings, distances, monument descriptions, lot/block references
- **Plat Analyzer:** Lot dimensions, setbacks, easement locations, boundary lines
- **Discrepancy Detector:** Conflicts between CAD data, GIS data, deed data, and plat data
- **Confidence Scorer:** Per-data-point reliability scores (0-100)

### Pipeline Phases (Pipeline Phases Tab)

Each phase can be run independently. This is useful when you want to test just one part of the 9-phase pipeline.

**Phase dependencies:**
```
Phase 1 (Discovery) → Phase 2 (Harvest) → Phase 3 (AI Extract)
                                                ↓
                                    Phase 4 (Subdivision)  ─┐
                                    Phase 5 (Adjacent)     ─┤→ Phase 7 (Reconcile)
                                    Phase 6 (TxDOT ROW)   ─┘        ↓
                                                            Phase 8 (Confidence)
                                                                     ↓
                                                            Phase 9 (Purchase)
```

Running Phase 7 without running Phases 3-6 first will give incomplete results. The pipeline handles missing data gracefully but flags it.

### Full Pipeline (Full Pipeline Tab)

Runs all enabled phases sequentially. Use the checkboxes and resume dropdown to control which phases run.

---

## Before Running a Test

### 1. Check Your Inputs

Every test card shows which inputs it needs. If any are missing, a yellow warning appears:

> Missing required inputs: address

Fill in the required fields in the Property Context bar, or use Quick Load.

### 2. Check the Worker Branch

Look at the Worker Status bar:
- If it says "Worker is on **main**" but you're testing a branch, your test runs against main's code — not your edits
- Click **"Deploy [branch] to Worker"** to update the worker

### 3. Check Worker Health

If the Worker Status shows a red dot, the worker is down. Your test will fail with "Worker not configured" or "Worker request failed."

---

## Running a Test — Step by Step

### 1. Expand the Test Card
Click on the card header to expand it.

### 2. Choose an Execution Mode

| Mode | Button Label | Behavior |
|------|-------------|----------|
| **Continuous** | "Run" | Runs to completion at selected speed |
| **Until Fail** | "Run Until Fail" | Runs until an error, then auto-pauses |
| **Step** | "Step Through" | Runs one checkpoint, then pauses |

### 3. Click the Run Button
The test starts immediately. You'll see:
- Card border turns blue
- Shimmer animation at top
- Elapsed time counting
- Log entries streaming in
- Timeline events appearing (if SSE stream is connected)

### 4. During the Run

**If in Continuous mode:**
- Watch the logs for real-time progress
- Click **Pause** at any time to stop and inspect
- Click **Resume** to continue

**If in Until Fail mode:**
- The test runs normally
- If an error occurs, playback auto-pauses
- A warning appears: "Auto-paused: error detected"
- Inspect the logs and timeline to understand what failed

**If in Step mode:**
- The test pauses after each checkpoint
- Click **Next ▶** to advance one step
- Click **◀ Prev** to review the previous step
- The code viewer shows the file/line at each step

### 5. After Completion

The card shows its final status (success/error). You can:
- **Show Debugger** — see timeline, code, logs, speed controls
- **Export Run** — download all data as JSON
- **Step through** — use Prev/Next to replay events
- **Re-run** — click Run again (inputs are preserved)
- **Clear** — reset the card to idle

---

## Understanding the Output Viewer

### JSON Tree Tab
Interactive collapsible JSON tree. Click arrows (▸/▾) to expand/collapse sections. Color-coded:
- Purple = object keys
- Green = string values
- Blue = numbers and booleans
- Gray = null values

### Raw Tab
The full JSON response as pretty-printed text. Useful for:
- Copying the full response
- Searching with Ctrl+F
- Viewing circular references that the tree can't display

### Screenshots Tab
Only appears when the response includes screenshots. Shows a grid of captured images. If an image fails to load, a red error message appears instead.

---

## Comparing Results Between Runs

### Export and Compare
1. Run a test, click **Export Run** → save as `run-before.json`
2. Make code changes, save & deploy
3. Run the same test again, click **Export Run** → save as `run-after.json`
4. Compare the two files in a JSON diff tool or text editor

### Key Fields to Compare
- `events` array — more events usually means richer data extraction
- `logs` array — check for new warnings or resolved errors
- `result.documents` — did more documents get found?
- `result.boundary` — did the boundary change?
- `duration` — did the change affect performance?

---

## Bulk Testing Strategy

To test a code change thoroughly:

1. **Run the specific scraper/analyzer** that your code change affects
2. **Run the full pipeline** with all phases enabled
3. **Try different properties:**
   - Switch to a different Quick Load fixture
   - Try a different county (Houston for Harris, Fort Worth for Tarrant)
4. **Try edge cases:**
   - Property with no subdivision
   - Property with multiple owners
   - Property near a flood zone
   - Rural acreage (no lot/block)

---

## Test Data: The Fixtures

| Fixture | County | Property Type | Good For Testing |
|---------|--------|--------------|-----------------|
| Residential — Belton | Bell | Single family home | CAD scraper, basic pipeline |
| Subdivision — Temple | Bell | Subdivision lot | Plat scraper, subdivision analysis |
| Urban — Houston | Harris | Urban parcel | Harris County adapter, HCAD |
| Suburban — Fort Worth | Tarrant | Suburban home | Tarrant County adapter, TAD |
| Rural Acreage — Bell | Bell | Rural land | Large boundary, instrument numbers |
| Flood Zone Test — Bell | Bell | Near river | FEMA scraper, flood zone handling |

---

## When a Test Fails

### 1. Check the Error Message
The Output Viewer shows the error in a red banner. Common errors:
- "Worker returned 500" — server-side crash in the worker
- "Worker timed out after 30s" — the scraper took too long
- "Worker not configured" — WORKER_URL or WORKER_API_KEY is missing
- "Network error" — the Testing Lab couldn't reach the worker

### 2. Check the Logs
Click **Show Debugger** and read the log stream:
- Look for red entries (errors) and yellow entries (warnings)
- The last entry before the error usually explains what went wrong
- Check the `source` field to identify which module failed

### 3. Check External Sites
Go to the **Health Check** tab and click **Check All Sites**. If the county's website is down, that's the cause — not your code.

### 4. Check the Worker Status
Make sure the worker is running and on the correct branch.

### 5. Try Again
Some failures are transient (network timeouts, rate limiting). Run the test again to see if it's consistent.
