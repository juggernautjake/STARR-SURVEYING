// helpContent.ts — Centralized help text for the Testing Lab.
// Each key maps to an InfoIcon's title + content.

export const HELP = {
  branchSelector: {
    title: 'Branch Management',
    content: `The branch selector controls which version of the STARR RECON code you're working with.

SELECT A BRANCH: Use the dropdown to switch between branches. This affects which code the file browser shows and which branch your edits are pushed to.

PULL: Fetches the latest commits from GitHub for the selected branch. Use this after someone else pushes changes to make sure you have the newest code.

CREATE A BRANCH: Click "+ Branch" to create a new branch from the current one. Name it something descriptive like "fix/bell-cad-timeout" or "feat/harris-county-adapter". You'll automatically switch to the new branch.

MERGE TO MAIN: When your changes are tested and working, click "Merge to Main" to create a Pull Request on GitHub. Enter a title describing what changed. After the PR is created, you can review and merge it on GitHub.

REFRESH: Click the ↻ button to reload the branch list from GitHub if you don't see a branch that was just created.`,
  },

  deployStatus: {
    title: 'Worker Deploy Status',
    content: `The deploy status bar shows whether the DigitalOcean worker is running and which branch of code it's using.

HEALTH: Green dot means the worker is reachable and responding. Red means it's down or unreachable. The number in parentheses is the response time.

WORKER BRANCH: Shows which branch the worker is currently running. If this differs from your Testing Lab branch, a yellow dot appears with a "Deploy" button.

DEPLOY TO WORKER: Click this button to make the worker pull your branch and restart with your code. This takes about 5 seconds. After deploying, you can immediately run tests against your new code.

AUTO: Check this box to automatically check the worker status every 30 seconds.

IMPORTANT: Deploying a branch to the worker does NOT affect the production website. The website only updates when changes are merged to the main branch and Vercel rebuilds.`,
  },

  propertyContext: {
    title: 'Property Context',
    content: `The property context provides the test inputs that scrapers, analyzers, and the pipeline need to run.

QUICK LOAD: Select a pre-configured test fixture (like "Residential — Belton") to populate all fields with known-good test data for a specific property.

PROJECT ID: If you have an existing research project in the database, enter its UUID here and click "Load" to pull in all the property details automatically.

REQUIRED FIELDS: Each test card shows which fields it needs. CAD and GIS scrapers typically need an address. Clerk scrapers need a project ID and owner name. The full pipeline needs at least an address.

YOUR INPUTS ARE SAVED: All fields persist to your browser's local storage, so they survive page refreshes. Switch between fixtures without losing your custom values.`,
  },

  tabs: {
    title: 'Testing Lab Tabs',
    content: `Each tab provides a different way to interact with the STARR RECON research pipeline.

SCRAPERS: Test individual data scrapers one at a time — CAD, GIS, Clerk, Plat, FEMA, TxDOT, Tax, Map Screenshot, GIS Viewer, Screenshot Collector.

ANALYZERS: Test AI-powered analyzers — Deed Analyzer, Plat Analyzer, Lot Correlator, Discrepancy Detector, Confidence Scorer, Relevance Validator, GIS Quality Analyzer, Screenshot Classifier.

PIPELINE PHASES: Run individual pipeline phases (1-9) in isolation. Useful for debugging a specific phase without running the entire pipeline.

FULL PIPELINE: Run all phases together with controls to skip/enable specific phases and resume from a specific point.

CODE: Browse, view, and edit STARR RECON source code. Push changes to your branch and deploy to the worker for immediate testing.

HEALTH CHECK: Check if the worker is running and verify connectivity to external sites (county CAD systems, clerk portals, etc.).

LOGS: View aggregated logs from all test runs. Includes live logs from active runs and historical logs loaded from the API.`,
  },

  executionModes: {
    title: 'Execution Modes',
    content: `Choose how the test runs before clicking the Run button.

CONTINUOUS: The default mode. The test runs at the selected speed and keeps going until it completes or you click Pause. Use the speed control (0.1x to 10x) to slow down or speed up the timeline.

UNTIL FAIL: The test runs normally but automatically pauses the moment an error is detected. This is useful for catching the exact point where something goes wrong without having to watch the entire run.

STEP: The test pauses after each checkpoint. Click "Next" to advance one step at a time. This gives you maximum control to inspect the state at each point and make changes between steps.

STEPPING THROUGH A COMPLETED RUN: After any run completes, you can use the Prev/Next buttons to step through the recorded events. The code viewer and log stream will sync to show you exactly what happened at each point.`,
  },

  codeViewer: {
    title: 'Code Viewer & Editor',
    content: `The code viewer shows source code from the STARR RECON codebase with syntax highlighting.

DURING A RUN: The code viewer is read-only and shows the file/function that's currently executing. Lines are highlighted: green border = succeeded, red border = failed, yellow pulse = currently executing.

AFTER A RUN (OR WHEN PAUSED): The code viewer switches to edit mode. You can modify the code directly, then click "Save & Push" to commit your changes to the current branch.

SAVE & PUSH: Commits the edited file to your current branch on GitHub.

SAVE & DEPLOY: Commits the file AND deploys your branch to the worker in one click. The worker restarts with your new code in about 5 seconds.

FILE BROWSER: Click "+ Browse" to open the file tree. Navigate through the STARR RECON directories (services, adapters, counties, sources, etc.). Click any file to open it in a new tab.

GITHUB LINK: Click the "GitHub" link next to the file path to open the file on GitHub for blame history, commits, etc.

SCOPE: The Testing Lab only allows editing research & analysis code (worker/src/services, adapters, counties, sources, orchestrator, AI, types, lib). Frontend and infrastructure code cannot be modified.`,
  },

  testCard: {
    title: 'Test Card',
    content: `Each test card runs a specific scraper, analyzer, or pipeline phase.

BADGES: "Browser" means the test uses Playwright for web scraping. "API Key" means it calls the Claude AI API. The time estimate shows typical runtime.

RUN BUTTON: Click to start the test. The button label changes based on the execution mode (Run / Run Until Fail / Step Through).

DEBUGGER: After a run completes, click "Show Debugger" to see the execution timeline, code trace, and log stream.

EXPORT RUN: Downloads the entire run (timeline events, logs, results, inputs) as a JSON file for offline analysis or sharing.

TIMELINE: The colored bar shows events over time. Hover markers for details, click to jump to that point. Use the speed buttons (0.1x–10x) to control replay speed.

STEP CONTROLS: Prev/Pause-Resume/Next buttons let you step through events one at a time. The code viewer and log stream sync to each step.

BRANCH WARNING: If the worker is running a different branch than your Testing Lab, a yellow warning appears. Deploy your branch first using the status bar.`,
  },

  logViewer: {
    title: 'Log Viewer',
    content: `The Logs tab aggregates log entries from all sources.

LOAD LOGS: Enter a project ID and click "Load Logs" to fetch historical logs from the worker API. If you have a project ID in the Property Context, it's used automatically.

LIVE TEST LOGS: When you run tests in other tabs, their log entries appear here automatically via the shared log store. Toggle "Live test logs" to show/hide them.

LEVEL FILTERS: Click the level buttons (info, warn, error, success, debug) to show/hide specific log levels. Active levels are highlighted.

TEXT FILTER: Type in the filter box to search logs by message content or module name.

CLEAR LIVE: Removes all live test logs from the display (doesn't affect stored logs).`,
  },
} as const;
