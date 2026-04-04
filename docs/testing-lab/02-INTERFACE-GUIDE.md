# Understanding the Interface

This guide explains every element of the Testing Lab from top to bottom.

---

## Page Structure (Top to Bottom)

```
┌─────────────────────────────────────────────────────────────┐
│  Header: "Research Testing Lab"  [?]         [Admin Only]   │
├─────────────────────────────────────────────────────────────┤
│  Branch Selector: [main ▼] [Pull] [+ Branch] [↻]           │
│  └─ Compare toggle, Merge to Main button                    │
├─────────────────────────────────────────────────────────────┤
│  Worker Status: ● Health OK (45ms)  ● Worker Branch: main   │
│  └─ [Deploy branch to Worker] if branch mismatch            │
├─────────────────────────────────────────────────────────────┤
│  Property Context: Quick Load [▼] | Project ID [___] [Load] │
│  └─ Address, County, State, Lat, Lon, Owner, Subdivision    │
├─────────────────────────────────────────────────────────────┤
│  Tabs: [Scrapers] [Analyzers] [Phases] [Pipeline] [Code]   │
│        [Health] [Logs]                                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│                    Tab Content Area                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Help Icons (?)

Throughout the Testing Lab, you'll see small circular **?** icons next to section titles. These are clickable help buttons.

**How to use them:**
1. Click the **?** icon
2. A purple-header panel slides in with detailed instructions
3. Read the help content — it's specific to that section
4. Click **✕** or click outside the panel to close it

**Where they appear:**
- Next to "Research Testing Lab" title (overview of all tabs)
- Next to "Branch" label (branch management instructions)
- Next to "Worker Status" title (deploy workflow guide)
- Next to "Property Context" title (test input guide)
- Next to each test card title (how to use test cards)
- Next to "Mode:" label (execution mode descriptions)
- Next to "STARR RECON Code" title (code editor guide)
- In the Log Viewer controls (log viewer guide)

---

## The 7 Tabs — Detailed

### Scrapers Tab
**Purpose:** Test individual data scrapers one at a time.

Contains 10 test cards:

| Scraper | What It Does | Needs | Uses Browser? | Typical Time |
|---------|-------------|-------|--------------|-------------|
| **CAD Scraper** | Searches county appraisal district for property data | Address | Yes | 5-15s |
| **GIS Scraper** | Queries county GIS for parcel geometry and coordinates | Address | No | 2-5s |
| **Clerk Scraper** | Searches county clerk for deeds, liens, easements | Owner Name | Yes | 15-45s |
| **Plat Scraper** | Finds and downloads plat maps | Subdivision | Yes | 5-30s |
| **FEMA Scraper** | Looks up flood zone designation | Lat, Lon | No | 3-5s |
| **TxDOT Scraper** | Checks TxDOT for right-of-way info | Lat, Lon | No | 3-5s |
| **Tax Scraper** | Retrieves tax assessment data | Property ID | No | 5-15s |
| **Map Screenshot** | Captures map screenshots (aerial, topo, street) | Property ID, Lat, Lon | Yes | 20-40s |
| **GIS Viewer** | Opens county GIS viewer and captures annotated screenshots | Lat, Lon | Yes | 30-90s |
| **Screenshot Collector** | Captures screenshots from a list of URLs | Property ID | Yes | 7s + 5-10s/ea |

**"Uses Browser"** means the scraper launches a Playwright browser to navigate real websites. These are slower but can access dynamic content that API-only scrapers cannot.

### Analyzers Tab
**Purpose:** Test AI-powered analysis modules.

Contains 8 test cards:

| Analyzer | What It Does | Needs AI API? | Typical Time |
|----------|-------------|--------------|-------------|
| **Deed Analyzer** | AI extracts bearings, distances, monuments from deeds | Yes (Claude) | 10-30s |
| **Plat Analyzer** | AI extracts lot dimensions, setbacks, easements from plats | Yes (Claude) | 5-20s |
| **Lot Correlator** | AI correlates target lot with extracted boundary data | Yes (Claude) | 5-10s |
| **Discrepancy Detector** | Compares data sources to find conflicts | No | <1s |
| **Confidence Scorer** | Scores reliability of each data point | No | <1s |
| **Relevance Validator** | Validates deed relevance to target property | Optional | 1-5s |
| **GIS Quality Analyzer** | AI assesses screenshot quality and coverage | Yes (Claude) | 2-5s/ea |
| **Screenshot Classifier** | Classifies screenshots by type | Optional | 1-3s |

All analyzers require a **Project ID** because they work on previously harvested data.

### Pipeline Phases Tab
**Purpose:** Run individual pipeline phases in isolation.

Contains 9 phase cards matching the STARR RECON pipeline:

| Phase | Name | What It Does |
|-------|------|-------------|
| 1 | Property Discovery | Searches CAD/GIS for property data |
| 2 | Document Harvesting | Downloads deeds, plats, captures screenshots |
| 3 | AI Extraction | AI analyzes all documents |
| 4 | Subdivision Intelligence | Researches the subdivision |
| 5 | Adjacent Properties | Researches neighboring properties |
| 6 | TxDOT ROW | Checks right-of-way information |
| 7 | Boundary Reconciliation | Merges all data into a unified boundary |
| 8 | Confidence Scoring | Scores data quality and reliability |
| 9 | Document Purchase | Purchases official document copies |

Phases 4, 5, 6, and 9 are non-critical — they can fail without breaking the pipeline. Phases 1, 2, 3, 7, and 8 are critical.

### Full Pipeline Tab
**Purpose:** Run all phases together with controls.

Features:
- Checkboxes to enable/disable each phase
- "Resume from phase" dropdown to skip earlier phases
- Phase progress bar showing the current phase
- All the same debugger tools (timeline, logs, output)

### Code Tab
**Purpose:** Browse, view, edit, and push STARR RECON source code.

Features:
- File browser showing only research & analysis code directories
- Syntax-highlighted code editor
- Save & Push (commit to branch)
- Save & Deploy (commit + deploy to worker)
- GitHub link to open files on GitHub

### Health Check Tab
**Purpose:** Verify worker and external site connectivity.

Features:
- Worker health check with latency
- External site health grid (county CAD, clerk portals, FEMA, TxDOT, etc.)
- Status colors: green = OK, yellow = degraded, red = down

### Logs Tab
**Purpose:** View aggregated logs from all test runs.

Features:
- Load historical logs by Project ID
- Live logs from active test runs (via shared log store)
- Text filter and level filter buttons
- Toggle live logs on/off

---

## Test Card Anatomy

Every test card (in Scrapers, Analyzers, and Phases tabs) has the same structure:

```
┌─────────────────────────────────────────────────────────────┐
│  [Card Title] [?]                    [Browser] [API] [5-15s] ●│
│  Description text explaining what this scraper/analyzer does │
│                                                          [▸] │
├─────────────────────────────────────────────────────────────┤
│  ⚠ Missing required inputs: propertyId                      │
│                                                              │
│  ⚠ Worker is on main but Testing Lab is set to fix/branch   │
│                                                              │
│  Mode: [Continuous] [Until Fail] [Step]  [?]                 │
│                                                              │
│  [Run] [◀ Prev] [▌▌ Pause] [Next ▶]  [Clear]               │
│  [Show Debugger] [Export Run]                                │
├─────────────────────────────────────────────────────────────┤
│  ┌─ Execution Timeline ──────────────────────────────────┐  │
│  │  0s    5s    10s    15s    20s                        │  │
│  │  ●  ■  ●  ■■  ●     ●  ▲  ●                    [▶]  │  │
│  │  [◀◀][◀][▌▌][▶][▶▶]  Speed: [0.1x][1x][5x][10x]    │  │
│  │  Legend: ● phase-start 2  ■ api-call 4  ▲ warning 1  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ Code Viewer ──────┐  ┌─ Log Stream ──────────────────┐  │
│  │ [file1.ts] [file2] │  │ [Filter...] [info][warn][err] │  │
│  │ worker/src/serv... │  │ 0.00s ℹ [cad] Starting...     │  │
│  │  45 │ const r =... │  │ 0.12s ℹ [cad] Searching...    │  │
│  │→ 46 │ await ada... │  │ 0.89s ✓ [cad] Found 5 pts    │  │
│  │  47 │ return res.. │  │ 1.02s ✓ [cad] Complete        │  │
│  └────────────────────┘  └────────────────────────────────┘  │
│                                                              │
│  ┌─ Output Viewer ───────────────────────────────────────┐  │
│  │ [JSON Tree] [Raw] [Screenshots (3)]                   │  │
│  │ { propertyId: "R12345", owner: "Smith, John", ... }   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Badge Meanings
- **Browser** (blue) — Uses Playwright for web scraping
- **API Key** (amber) — Calls the Claude AI API
- **5-15s** (gray) — Estimated runtime

### Status Dot Colors
- **Gray** = idle (hasn't been run)
- **Blue pulsing** = running
- **Green** = completed successfully
- **Red** = completed with error
- **Amber** = paused

---

## Property Context Fields

| Field | Example | Used By |
|-------|---------|---------|
| **Quick Load** | "Residential — Belton" | Pre-fills all fields from a fixture |
| **Project ID** | `a1b2c3d4-...` | Analyzers, pipeline phases, log loading |
| **Property ID** | `R12345` | CAD scraper, tax scraper |
| **Address** | `123 Main St, Belton, TX 76513` | CAD/GIS scrapers, pipeline Phase 1 |
| **County** | `Bell` | County routing (selects correct adapter) |
| **State** | `TX` | Always Texas for now |
| **Latitude** | `31.0561` | FEMA, TxDOT, map screenshots |
| **Longitude** | `-97.4642` | FEMA, TxDOT, map screenshots |
| **Owner Name** | `Smith, John` | Clerk scraper |
| **Subdivision** | `Western Hills Estates` | Plat scraper |
| **Instrument Numbers** | `2024-00012345` | Clerk scraper (specific documents) |

**All fields persist to localStorage** — they survive page refreshes and browser restarts.
