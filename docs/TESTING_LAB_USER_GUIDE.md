# STARR RECON Testing Lab — Complete User Guide

**For:** Admins and Developers at Starr Surveying Company  
**Last Updated:** April 2026  
**Location:** `/admin/research/testing` on the Starr Surveying website

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Understanding the Layout](#2-understanding-the-layout)
3. [Branch Management](#3-branch-management)
4. [Setting Up Test Inputs](#4-setting-up-test-inputs)
5. [Running Your First Test](#5-running-your-first-test)
6. [Understanding the Debugger](#6-understanding-the-debugger)
7. [Using Execution Modes](#7-using-execution-modes)
8. [Browsing and Editing Code](#8-browsing-and-editing-code)
9. [Deploying Code Changes](#9-deploying-code-changes)
10. [The Full Edit → Test → Deploy Workflow](#10-the-full-edit--test--deploy-workflow)
11. [Creating Pull Requests and Merging](#11-creating-pull-requests-and-merging)
12. [Using the Full Pipeline](#12-using-the-full-pipeline)
13. [Monitoring Health](#13-monitoring-health)
14. [Viewing Logs](#14-viewing-logs)
15. [Tips and Tricks](#15-tips-and-tricks)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Getting Started

### Prerequisites
- You must be logged in with an **admin** or **developer** role
- The DigitalOcean worker must be running (check the Worker Status bar)
- A `GITHUB_TOKEN` environment variable must be configured for branch operations

### Accessing the Testing Lab
1. Go to `/admin/research` on the website
2. Click the **"Testing Lab"** button in the header
3. Or navigate directly to `/admin/research/testing`

### What You'll See
The Testing Lab has several sections from top to bottom:
- **Header** with a back button and "Admin Only" badge
- **Branch Selector** — choose which code branch to work with
- **Worker Status** bar — shows if the worker is running and on which branch
- **Property Context** — test inputs (address, county, property ID, etc.)
- **7 Tabs** — Scrapers, Analyzers, Pipeline Phases, Full Pipeline, Code, Health Check, Logs

### Help Icons
Look for the small **?** icons next to section titles. Click any of them to get detailed help about that section.

---

## 2. Understanding the Layout

### The 7 Tabs

| Tab | What It Does | When to Use It |
|-----|-------------|----------------|
| **Scrapers** | Test individual data scrapers (CAD, GIS, Clerk, Plat, FEMA, TxDOT, Tax, Map Screenshot, GIS Viewer, Screenshot Collector) | When you want to test one specific scraper in isolation |
| **Analyzers** | Test AI-powered analyzers (Deed, Plat, Lot Correlator, Discrepancy, Confidence, Relevance, GIS Quality, Screenshot Classifier) | When debugging AI extraction or analysis |
| **Pipeline Phases** | Run individual pipeline phases 1-9 | When you need to test a specific phase without running the whole pipeline |
| **Full Pipeline** | Run all phases together with skip/resume controls | For end-to-end testing of the entire research pipeline |
| **Code** | Browse, edit, and push STARR RECON source code | When you need to view or modify scraper/adapter/pipeline code |
| **Health Check** | Verify worker connectivity and external site availability | When tests fail and you suspect a connectivity issue |
| **Logs** | View aggregated logs from all test runs | For reviewing past results or monitoring active runs |

### What Persists Between Tab Switches
- **Property Context** inputs — shared across all tabs (change the address in Scrapers, it's also changed in Pipeline Phases)
- **Branch selection** — shared across all tabs
- **Test card states** — each card remembers its last run result within the current session
- **Code files** in the Code tab — stay open when you switch away and back

---

## 3. Branch Management

The branch selector is at the top of the page, just below the header.

### Selecting a Branch
1. Click the **Branch** dropdown
2. Select the branch you want to work with
3. All file browsing, code editing, and test runs will use this branch

### Pulling Latest Changes
1. Click the **Pull** button next to the branch dropdown
2. A green message shows the latest commit SHA and message
3. This fetches the newest code from GitHub — use it before testing to make sure you have the latest

### Creating a New Branch
1. Click **+ Branch**
2. Type a descriptive name (e.g., `fix/bell-cad-timeout` or `feat/harris-county-adapter`)
3. Press Enter or click **Create**
4. The new branch is created from the current branch and you're automatically switched to it

### Refreshing the Branch List
Click the **↻** button to reload branches from GitHub. Use this if you created a branch outside the Testing Lab (e.g., from GitHub or the command line).

### Merging to Main
When your changes are tested and ready:
1. Click **Merge to Main** (only shows when you're not on main)
2. Enter a descriptive PR title (e.g., "Fix CAD scraper timeout for Bell County")
3. Click **Create PR**
4. A clickable **"View on GitHub"** link appears — click it to review and merge the PR on GitHub

---

## 4. Setting Up Test Inputs

The Property Context bar provides the inputs that scrapers and pipeline phases need.

### Using Quick Load Fixtures
1. Click the **Quick Load** dropdown
2. Select a pre-configured test property (e.g., "Residential — Belton")
3. All fields are populated with known-good test data

Available fixtures:
- **Custom (blank)** — start from scratch
- **Residential — Belton (FM 436)** — Bell County residential property
- **Subdivision — Temple** — Bell County subdivision with owner name
- **Urban — Houston (Harris Co.)** — Harris County urban property
- **Suburban — Fort Worth (Tarrant Co.)** — Tarrant County suburban property
- **Rural Acreage — Bell Co.** — Rural property with instrument numbers
- **Flood Zone Test — Bell Co.** — Property near a flood zone

### Loading from an Existing Project
1. Enter a project UUID in the **Project ID** field
2. Click **Load**
3. The property details are pulled from the database

### Required Fields per Test Type
- **CAD/GIS Scrapers:** Address
- **Clerk/Plat Scrapers:** Project ID + Owner Name
- **FEMA/TxDOT:** Latitude + Longitude
- **Analyzers:** Project ID
- **Full Pipeline:** Address (minimum)

### Your Inputs Are Saved
All fields automatically save to your browser's local storage. When you come back later or refresh the page, your inputs are still there.

---

## 5. Running Your First Test

Let's run a simple test to get familiar with the interface.

### Step 1: Select a Test Fixture
1. In the Property Context bar, select **"Residential — Belton (FM 436)"** from Quick Load
2. Verify the address field is populated

### Step 2: Go to the Scrapers Tab
1. Click the **Scrapers** tab
2. You'll see 10 scraper cards, each collapsed

### Step 3: Expand a Scraper Card
1. Click on **"CAD Scraper"** to expand it
2. You'll see:
   - Badges: "Browser" (uses Playwright), "5-15s" (estimated runtime)
   - A warning if required inputs are missing
   - Execution mode selector (Continuous / Until Fail / Step)
   - Run button

### Step 4: Run the Test
1. Leave the mode on **Continuous**
2. Click **Run**
3. Watch:
   - The card border turns blue (running)
   - A shimmer animation appears at the top of the card
   - The status dot pulses
   - Timeline events appear in real-time
   - Logs stream in below

### Step 5: View Results
When the test completes:
- The card border turns green (success) or red (error)
- Click **Show Debugger** to see the execution timeline
- Click **Export Run** to download the full results as JSON
- The Output Viewer shows the JSON response from the worker

---

## 6. Understanding the Debugger

After a test run, click **Show Debugger** to see the full debug panel.

### Execution Timeline
The colored bar at the top shows events over time:
- **Blue dots** = phase start
- **Green dots** = phase complete
- **Red dots** = errors
- **Purple squares** = API calls
- **Orange squares** = AI (Claude) calls
- **Cyan squares** = browser (Playwright) actions
- **Pink dots** = screenshots captured

**Interactions:**
- **Hover** any marker to see a tooltip with details
- **Click** a marker to jump to that point in time
- **Drag** the scrubber handle to scroll through time
- **Keyboard:** Space = pause/resume, Left/Right arrows = step between events

### Speed Controls
Below the timeline:
- Click speed buttons: **0.1x, 0.25x, 0.5x, 1x, 2x, 5x, 10x**
- 0.1x = 10x slower than real-time (see every detail)
- 10x = fast-forward through the run

### Legend
Below the speed controls, the legend shows which event types appeared and how many of each.

### Code Viewer (Left Panel)
When the worker sends trace events with file/line metadata:
- Source files load automatically into tabs
- The active line is highlighted in yellow
- Green left border = line executed successfully
- Red left border = line failed
- Stats show "N ok / N fail" in the file path bar

### Log Stream (Right Panel)
- Logs sync to the timeline — scroll the timeline and logs follow
- Future logs (after the current time) are dimmed
- The most recent log at the current time has a blue left border
- Use the text filter to search logs
- Use the level buttons (info/warn/error/success/debug) to filter by level

---

## 7. Using Execution Modes

### Continuous (Default)
- Test runs from start to finish at the selected speed
- Click **Pause** at any time to stop and inspect
- Click **Resume** to continue
- Best for: normal testing when you just want to see if it works

### Until Fail
- Test runs normally until an error event is detected
- Automatically pauses at the exact point of failure
- A yellow warning appears: "Auto-paused: error detected"
- Best for: finding bugs — run until something breaks, then inspect the state

### Step Through
- Test runs but the timeline pauses after each checkpoint
- Click **Next ▶** to advance one step at a time
- Click **◀ Prev** to go back and review previous steps
- Best for: understanding exactly what happens at each step, or when making edits between steps

### Stepping Through a Completed Run
After ANY run completes (in any mode), you can:
1. Click **▶ Resume** to replay the run at the selected speed
2. Click **Next ▶** / **◀ Prev** to step through events one at a time
3. The code viewer and logs sync to whatever point you're viewing

---

## 8. Browsing and Editing Code

### Using the Code Tab
1. Click the **Code** tab
2. The file browser shows STARR RECON directories:
   - **services** — core pipeline services
   - **adapters** — CAD and clerk system adapters
   - **counties** — county-specific implementations
   - **sources** — government data source clients
   - **orchestrator** — pipeline orchestration
   - And more...

3. Click a directory to navigate into it
4. Click a `.ts` or `.js` file to open it in the editor
5. Click **..** to go up one directory

### Editing Code
1. Open a file — it loads in the editor with syntax highlighting
2. Make your changes directly in the editor
3. Press **Ctrl+S** or click **Save & Push** to commit to your branch
4. The commit SHA appears in a green success message

### Scope Restrictions
The Testing Lab only allows editing **STARR RECON research code**:
- ✅ `worker/src/services/`, `adapters/`, `counties/`, `sources/`, `orchestrator/`, `ai/`, `types/`, `lib/`, `models/`, etc.
- ❌ Frontend code, Testing Lab UI, API routes, billing, infrastructure
- 📖 `STARR_RECON/` planning docs are viewable but read-only

### Opening Files from the Debugger
During or after a test run, the code viewer in the debugger panel also has a **"+ Browse"** button. Files referenced in timeline events load automatically.

---

## 9. Deploying Code Changes

### Understanding the Deploy Flow
```
You edit code → Push to branch → Deploy branch to worker → Test immediately
```

The worker runs on DigitalOcean, separate from the Vercel website. Deploying a branch to the worker does NOT affect the production website.

### One-Click Save & Deploy
In the Code tab editor:
1. Make your edits
2. Click **Save & Deploy** (the orange button)
3. This does both: pushes code to GitHub AND deploys the branch to the worker
4. Worker restarts in ~5 seconds
5. You can immediately run tests against your new code

### Manual Deploy
If you already pushed code and just need to deploy:
1. Look at the **Worker Status** bar
2. If it shows a yellow dot (branch mismatch), click **"Deploy [branch] to Worker"**
3. Wait ~5 seconds for the worker to restart

### Checking Deploy Status
- **Green dot** = Worker is healthy and running your branch
- **Yellow dot** = Worker is on a different branch than your Testing Lab
- **Red dot** = Worker is unreachable

---

## 10. The Full Edit → Test → Deploy Workflow

Here's a complete example of fixing a bug in the Bell County CAD scraper:

### 1. Create a Branch
- Click **+ Branch**
- Name it `fix/bell-cad-timeout`
- Click **Create**

### 2. Find the Bug
- Go to **Scrapers** tab
- Expand **CAD Scraper**
- Set mode to **Until Fail**
- Click **Run Until Fail**
- The test runs until it fails — note which file/line the error occurred at

### 3. Edit the Code
- Go to **Code** tab
- Navigate to the file that failed (e.g., `worker/src/adapters/bis-adapter.ts`)
- Click to open it
- Find the problematic code and fix it
- Click **Save & Deploy**

### 4. Re-Test
- Go back to **Scrapers** tab
- The CAD Scraper card still has your test data
- Click **Run** again
- Verify the fix works

### 5. Repeat if Needed
If the test still fails, go back to the Code tab, make more changes, Save & Deploy, and test again.

### 6. Merge to Main
When the fix works:
- Go to the branch selector
- Click **Merge to Main**
- Enter PR title: "Fix Bell County CAD scraper timeout"
- Click **Create PR**
- Click **View on GitHub** to review and merge
- After merge, Vercel auto-deploys the website

### 7. Restore Worker to Main
- Switch the branch dropdown back to **main**
- Click **"Deploy main to Worker"** in the status bar
- Worker now runs the merged code

---

## 11. Creating Pull Requests and Merging

### Creating a PR
1. Make sure you're on a feature branch (not main)
2. Click **Merge to Main** in the branch selector
3. Enter a clear title describing the change
4. Click **Create PR**
5. A link appears — click **"View on GitHub"**

### What Happens After Merging
- Vercel automatically rebuilds and deploys the website from main
- This takes 1-3 minutes
- The worker is NOT automatically updated — you need to deploy main to the worker separately

### If There Are Merge Conflicts
- GitHub will show the conflicts on the PR page
- You'll need to resolve them on GitHub or locally
- The Testing Lab will show an error message if PR creation fails

---

## 12. Using the Full Pipeline

### Setting Up
1. Go to the **Full Pipeline** tab
2. Enter at least an address in the Property Context
3. Use the checkboxes to enable/disable specific phases
4. Phases marked with * are critical — disabling them will affect downstream phases

### Running
1. Click **Run Full Pipeline**
2. The pipeline runs through enabled phases sequentially
3. The phase progress bar highlights the current phase
4. Timeline events and logs stream in real-time

### Resuming from a Phase
1. Use the **"Resume from phase"** dropdown
2. Select the phase to start from (e.g., Phase 3: AI Extraction)
3. Click **Run** — it skips earlier phases and starts from your selection
4. Useful when you've already run phases 1-2 and only need to re-test 3+

### Phase Skip Controls
- **Critical phases** (1, 2, 3, 7, 8) are needed for the pipeline to produce meaningful results
- **Non-critical phases** (4, 5, 6, 9) can be skipped without breaking the pipeline
- Uncheck a phase to skip it entirely

---

## 13. Monitoring Health

### Worker Health
1. Go to the **Health Check** tab
2. Click **Check Worker** to ping the worker
3. Green = healthy, Red = down
4. Latency is shown in milliseconds

### External Site Health
1. Click **Check All Sites** to test connectivity to all external sites
2. This checks county CAD systems, clerk portals, FEMA, TxDOT, etc.
3. Green = accessible, Yellow = degraded, Red = down
4. Use this to identify if a test failure is caused by an external site being down rather than a code bug

---

## 14. Viewing Logs

### Loading Historical Logs
1. Go to the **Logs** tab
2. Enter a Project ID or let it use the one from Property Context
3. Click **Load Logs**
4. Past log entries load from the worker API

### Live Logs from Test Runs
- When you run tests in other tabs, their logs automatically appear in the Logs tab
- Toggle **"Live test logs"** to show/hide them
- The count shows how many live entries are available

### Filtering
- **Text filter:** Type to search by message or module name
- **Level buttons:** Click info/warn/error/success/debug to show/hide levels
- **Clear Live:** Removes live test logs from the display

---

## 15. Tips and Tricks

### Keyboard Shortcuts
| Key | Where | Action |
|-----|-------|--------|
| **Space** | Timeline focused | Pause / Resume |
| **Left Arrow** | Timeline focused | Step to previous event |
| **Right Arrow** | Timeline focused | Step to next event |
| **Ctrl+S** | Code editor | Save & Push |
| **Enter** | Branch name field | Create branch |
| **Enter** | Project ID field | Load logs |

### Speeding Up Your Workflow
- Use **Save & Deploy** instead of Save & Push + manual deploy
- Use **Until Fail** mode to find bugs quickly
- Use **Quick Load** fixtures instead of typing addresses manually
- Keep the **Logs** tab open in a second browser tab for monitoring
- Use **Export Run** to save test results for comparison

### When Things Go Wrong
- **Test returns "Worker not configured"**: The WORKER_URL or WORKER_API_KEY environment variable is missing
- **Branch operations fail**: Check that GITHUB_TOKEN is configured
- **Worker shows red dot**: The DigitalOcean droplet may be down — check the DigitalOcean console
- **Tests pass on one branch but fail on another**: Make sure you deployed the correct branch to the worker
- **Code editor is read-only**: You may be viewing a spec document (STARR_RECON/) or the code viewer is in run mode — wait for the test to complete

---

## 16. Troubleshooting

### "Worker is unreachable"
1. Check the Worker Status bar — is it red?
2. Go to the Health Check tab and click "Check Worker"
3. If the worker is down, check the DigitalOcean console
4. The worker runs on PM2 with auto-restart — it may just need a minute to come back

### "Missing required inputs"
1. Look at the yellow warning on the test card
2. It lists which fields are needed (e.g., "address", "projectId")
3. Fill in the missing fields in the Property Context bar
4. Or select a Quick Load fixture that has the fields pre-filled

### "Worker is on main but Testing Lab is set to fix/my-branch"
1. You edited code on a feature branch but haven't deployed it to the worker
2. Click **"Deploy fix/my-branch to Worker"** in the Worker Status bar
3. Wait ~5 seconds for the restart
4. The dot turns green when the branches match

### "Failed to push: 422"
1. This usually means there's a conflict with the file on GitHub
2. Try pulling the latest first: click **Pull** in the branch selector
3. Then re-open the file in the code editor (it will have the latest content)
4. Make your changes again and save

### "PR creation failed"
1. Check if a PR already exists for this branch → go to GitHub to verify
2. Check if there are merge conflicts → GitHub will flag them on the PR page
3. Make sure you're not on the main branch (you can't create a PR from main to main)

---

*This guide is part of the STARR Surveying Testing Lab. For technical details about the implementation, see [TESTING-PLAN.md](/TESTING-PLAN.md).*
