# The Debugger — Deep Dive

The debugger is the most powerful tool in the Testing Lab. It lets you see exactly what happened during a test run, step through events, and inspect the code.

---

## Opening the Debugger

After a test completes (success or error):
1. Click **Show Debugger** on the test card
2. The debugger panel expands below the action buttons
3. It shows: Execution Timeline, Code Viewer, Log Stream

---

## Execution Timeline

The horizontal bar at the top of the debugger.

### Reading the Timeline

```
0s        5s        10s       15s       20s
├─────────┼─────────┼─────────┼─────────┤
●    ■  ●   ■■  ●        ●  ▲  ●
```

Each marker is an event. The shape and color tell you what kind:

| Shape | Color | Type | Meaning |
|-------|-------|------|---------|
| ● | Blue | phase-start | A pipeline phase began |
| ● | Green | phase-complete | A phase finished successfully |
| ● | Red | phase-failed / error | Something failed |
| ■ | Purple | api-call | An HTTP request to an external API |
| ■ | Orange | ai-call | A call to Claude AI |
| ■ | Cyan | browser-action | A Playwright browser action |
| · | Green | data-found | Data was successfully extracted |
| ▲ | Amber | warning | Non-fatal issue detected |
| ● | Pink | screenshot | A screenshot was captured |
| · | Gray | log | General log entry |
| ◆ | White | checkpoint | Pause point (step mode) |

### Interacting with the Timeline

**Hover** over any marker to see a tooltip with:
- Event type (e.g., "api call")
- Label (e.g., "discovery-engine: searchBisCad")
- Timestamp (e.g., "2.3s")
- Description

**Click** a marker to:
- Jump the scrubber to that point in time
- Update the log stream to show logs at that time
- Switch the code viewer to the file/line from that event

**Drag** the scrubber handle to scrub through time:
- Logs before the scrubber position are shown in full color
- Logs after the scrubber position are dimmed (opacity 0.3)
- The most recent log at the current time has a blue left border

### Speed Controls

Below the timeline:
```
[◀◀] [◀] [▌▌] [▶] [▶▶]    Speed: [0.1x] [0.25x] [0.5x] [1x] [2x] [5x] [10x]
```

| Button | Action |
|--------|--------|
| ◀◀ | Jump to previous event |
| ◀ | Step back one event |
| ▌▌ / ▶ | Pause / Resume |
| ▶ | Step forward one event |
| ▶▶ | Jump to next event |

**Speed presets:**
- **0.1x** — 10x slower than real-time. See every detail.
- **0.5x** — Half speed. Good for following along.
- **1x** — Real-time. What actually happened.
- **5x** — Fast forward. Skip through quiet periods.
- **10x** — Maximum speed. Jump to the end quickly.

### Keyboard Shortcuts

These work when the timeline area is focused (click on it first):

| Key | Action |
|-----|--------|
| **Space** | Pause / Resume |
| **Left Arrow** | Step to previous event |
| **Right Arrow** | Step to next event |

### Legend

Below the speed controls, the legend shows:
- Which event types appeared in this run
- How many of each type (shown as a badge number)
- Total event count

---

## Code Viewer

The left panel of the debugger (or full-width when no files are loaded).

### During a Run

The code viewer is **read-only** and shows:
- The source file being executed at the current timeline position
- Syntax highlighting (TypeScript/JavaScript)
- Line numbers

### Line Highlighting

| Visual | Meaning |
|--------|---------|
| Yellow background | Currently executing line (latest trace event) |
| Green left border | This line executed successfully |
| Red left border | This line threw an error |
| Purple background | Manually highlighted line |
| No highlight | Line hasn't been reached yet |

After a run, the green and red borders persist, giving you a visual map of what worked and what failed.

### Trace Stats

In the file path bar, you'll see stats like:
```
worker/src/services/discovery-engine.ts    [GitHub]    3 ok  1 fail
```

This tells you 3 lines executed successfully and 1 failed.

### File Tabs

If the run involves multiple files, each gets its own tab:
```
[discovery-engine.ts] [bis-adapter.ts] [address-normalizer.ts] [+ Browse]
```

Click a tab to switch files. The active tab has a purple bottom border.

### After a Run (Edit Mode)

When the test is not running:
1. The code viewer switches to **edit mode**
2. "EDIT MODE" badge appears in the file path bar
3. You can modify the code directly
4. Press **Ctrl+S** or click **Save & Push** to commit

### File Browser

Click **"+ Browse"** to open the file tree:
- Shows STARR RECON directories (services, adapters, counties, etc.)
- Click directories to navigate in
- Click **..** to go up
- Click any `.ts` or `.js` file to open it in a new tab
- The file browser respects the access restrictions — only research code is visible

### GitHub Link

Click **"GitHub"** next to the file path to open the file on GitHub. Useful for:
- Viewing blame (who wrote each line)
- Viewing commit history
- Comparing with other branches

---

## Log Stream

The right panel of the debugger.

### Log Entry Format

```
0.00s  ℹ  [cad-scraper]  Starting CAD search...
0.12s  ℹ  [cad-scraper]  Searching Bell County CAD
0.89s  ✓  [cad-scraper]  Found property: R12345
1.02s  ✓  [cad-scraper]  Completed in 1.02s
```

| Column | Meaning |
|--------|---------|
| **0.12s** | Time since run start |
| **ℹ / ✓ / ✕ / ⚠ / ⋯** | Level icon (info/success/error/warn/debug) |
| **[cad-scraper]** | Source module |
| **Message** | What happened |

### Level Colors

| Level | Color | Icon | Meaning |
|-------|-------|------|---------|
| info | Blue | ℹ | Normal progress update |
| success | Green | ✓ | Something completed successfully |
| error | Red | ✕ | Something failed |
| warn | Amber | ⚠ | Non-fatal issue |
| debug | Gray | ⋯ | Internal debugging info |

### Filtering

**Text filter:** Type in the filter box to search by message or module name.

**Level buttons:** Click the level buttons to toggle visibility:
- Active levels are highlighted with their color
- Click a highlighted button to hide that level
- Click a dimmed button to show that level

### Timeline Sync

The log stream syncs to the timeline scrubber position:
- Logs **before** the current time are shown normally
- Logs **after** the current time are dimmed (opacity 0.3)
- The **most recent log** at the current time has a blue left border
- When playing in live mode, the log stream auto-scrolls to the bottom

---

## Post-Run Replay

After any test completes, you can replay the entire run:

### Method 1: Play Button
1. Click **▶ Resume** — the timeline replays at the selected speed
2. Logs scroll, markers advance, the scrubber moves
3. Click **▌▌ Pause** to stop at any point

### Method 2: Step Through
1. Click **◀ Prev** to go back one event
2. Click **Next ▶** to advance one event
3. At each step:
   - The code viewer shows the relevant file/line
   - The log stream highlights the corresponding log
   - The timeline scrubber moves to that event's timestamp

### Method 3: Click Events
1. Click any marker on the timeline
2. Everything jumps to that point in time
3. Useful for jumping directly to an error event

### Method 4: Drag Scrubber
1. Click and drag the scrubber handle
2. All panels update in real-time as you scrub
3. Good for quickly scanning through a long run
