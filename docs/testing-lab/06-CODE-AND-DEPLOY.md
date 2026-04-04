# Code Editing & Deployment

This guide covers how to browse, edit, push, and deploy STARR RECON code from the Testing Lab.

---

## The Code Tab

The 5th tab in the Testing Lab provides a standalone code editor with file browser.

### Opening the Code Tab
Click **"Code"** in the tab navigation. You'll see:
- Header showing "STARR RECON Code" with the current branch
- A description: "Research & analysis code only — scrapers, adapters, counties, AI, pipeline"
- The CodeViewer component with file browser

### Browsing Files

Click **"+ Browse"** to open the file tree. The root shows:

| Directory | What It Contains |
|-----------|-----------------|
| **services** | Core pipeline services (discovery-engine, document-harvester, ai-extraction, etc.) |
| **adapters** | CAD system adapters (BIS, Tyler, TrueAutomation) and clerk adapters (Kofile, TexasFile, etc.) |
| **counties** | County-specific research (Bell County, etc.) |
| **sources** | Government data clients (FEMA, GLO, TCEQ, NRCS, USGS) |
| **orchestrator** | Pipeline orchestration (master-orchestrator) |
| **ai** | AI prompt registry |
| **types** | Shared TypeScript types |
| **lib** | Utility functions (logger, coordinates, rate-limiter) |
| **models** | Data models (property intelligence) |
| **chain-of-title** | Chain of title builder |
| **reports** | Report generation (SVG, PDF, DXF) |
| **exports** | Export formats (RW5, JobXML, CSV) |
| **specs (read-only)** | STARR RECON planning documents |

Click a directory to navigate into it. Click **..** to go up. Click a `.ts` file to open it.

### What You Can and Cannot Edit

**Editable** (can browse, view, edit, push):
- All directories listed above except specs

**Read-only** (can browse and view, cannot edit):
- `STARR_RECON/` planning documents — shown with a "READ ONLY" badge

**Not accessible** (cannot browse or view):
- Frontend code (`app/`)
- Testing Lab UI code (`app/admin/research/testing/`)
- API routes (`app/api/`)
- Worker infrastructure (`worker/src/infra/`, `worker/src/billing/`)
- Worker entry point (`worker/src/index.ts`)

This restriction is enforced at three levels:
1. **File browser** — only shows allowed directories
2. **Code viewer** — forces read-only for non-editable paths
3. **Push API** — server rejects pushes to non-allowed paths (HTTP 403)

---

## Editing Code

### Opening a File
1. Navigate to the file using the file browser
2. Click the file name — it opens in a new editor tab
3. The file loads with syntax highlighting

### Making Changes
- Click anywhere in the editor to start typing
- The editor supports standard text editing (select, copy, paste, undo)
- Syntax highlighting updates as you type
- Tab width is 2 spaces

### Saving Changes

**Option 1: Save & Push** (green button)
- Commits the file to your current branch on GitHub
- Shows the commit SHA on success
- Does NOT deploy to the worker

**Option 2: Save & Deploy** (orange button)
- Commits the file to your branch on GitHub
- THEN deploys your branch to the worker (git pull + restart)
- Worker restarts in ~5 seconds with your new code
- You can immediately run tests against the new code

**Option 3: Ctrl+S**
- Same as Save & Push

### The Save Bar

At the bottom of the code editor:
```
Ctrl+S to save to fix/bell-cad-timeout    [Save & Push] [Save & Deploy]
```

The branch name is shown so you always know where your changes go.

---

## Deploying to the Worker

### What "Deploy" Means

The worker is a separate server running on DigitalOcean. It runs the actual scraping, AI analysis, and pipeline code. When you "deploy" a branch:

1. The worker runs `git fetch origin`
2. Then `git checkout your-branch`
3. Then `git pull origin your-branch`
4. Then restarts (PM2 auto-restart or `process.exit(0)`)
5. ~5 seconds later, the worker is running your branch's code

### When to Deploy

- After pushing code changes that you want to test
- When the Worker Status bar shows a yellow dot (branch mismatch)
- After switching to a different branch in the Testing Lab

### How to Deploy

**Method 1: Save & Deploy** (in the code editor)
- One click: pushes code + deploys branch

**Method 2: Worker Status bar**
- If the yellow "Deploy [branch] to Worker" button appears, click it
- This deploys without pushing new changes (useful when someone else pushed)

**Method 3: After Pull**
- Pull latest changes
- Click the deploy button to apply them to the worker

### Checking Deploy Status

The Worker Status bar shows:
- **Health:** Green = running, Red = down
- **Worker Branch:** Which branch the worker is on + commit SHA
- **Branch match:** Green = same as Testing Lab, Yellow = different

---

## The Complete Workflow

### Fixing a Bug

```
1. Create branch:      fix/bell-cad-timeout
2. Run test:           CAD Scraper → fails at 15s timeout
3. Open Code tab:      Browse to worker/src/adapters/bis-adapter.ts
4. Find the bug:       Line 89: timeout is 15000ms, needs to be 30000ms
5. Fix it:             Change 15000 to 30000
6. Save & Deploy:      Click orange button
7. Wait 5 seconds:     Worker Status turns green
8. Re-test:            Run CAD Scraper again → passes
9. Merge:              Click "Merge to Main" → "Fix Bell County CAD timeout"
10. Deploy main:       Switch to main → Pull → Deploy
```

### Adding a New Feature

```
1. Create branch:      feat/harris-hcad-adapter
2. Open Code tab:      Browse to worker/src/adapters/
3. Create new file:    (do this on GitHub first, then pull)
4. Edit the file:      Implement the HCAD adapter
5. Save & Deploy:      Push + deploy
6. Test:               Run CAD Scraper with Harris County fixture
7. Iterate:            Fix issues, Save & Deploy, re-test
8. Full pipeline:      Run Full Pipeline with Houston address
9. Merge:              Create PR when everything works
```

### Debugging with Step Mode

```
1. Expand test card:   CAD Scraper
2. Set mode:           Step Through
3. Click "Step Through"
4. Step 1:             Code viewer shows discovery-engine.ts line 12 → "entry"
5. Click "Next ▶"
6. Step 2:             Code viewer shows discovery-engine.ts line 48 → "address-normalized"
7. Click "Next ▶"
8. Step 3:             Code viewer shows bis-adapter.ts line 22 → "search-started"
9. Inspect the log:    What address was searched? What URL was opened?
10. Click "Next ▶"
11. Step 4:            Red highlight on bis-adapter.ts line 89 → "search-failed"
12. Now you know:      The failure is on line 89 of bis-adapter.ts
13. Edit the file:     CodeViewer switches to edit mode (test is paused)
14. Fix the issue:     Save & Deploy
15. Re-run:            Click Run again from the start
```

---

## Tips for Effective Code Editing

### Keep Changes Small
Edit one file at a time. This makes it easy to identify which change fixed (or broke) something.

### Test After Every Change
Don't batch multiple edits before testing. Save & Deploy after each change, run the specific test, verify it works, then move to the next change.

### Use the Debugger to Find Issues
Don't guess where the bug is. Use "Until Fail" mode to find the exact error, then use the code viewer to see which file/line failed.

### Check the Log Before Editing
The log stream often tells you exactly what went wrong:
- "Selector not found: .property-detail" → CSS selector changed on the county website
- "Timeout after 15000ms" → need to increase timeout
- "403 Forbidden" → website is blocking the request
- "JSON parse error" → API response format changed
