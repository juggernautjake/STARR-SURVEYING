# Troubleshooting Guide

Common problems and how to fix them.

---

## Quick Diagnostic Checklist

When something goes wrong, check these in order:

1. **Is the worker running?** → Worker Status bar, green dot = yes
2. **Is the worker on the right branch?** → Worker Status bar, check branch name
3. **Are the inputs correct?** → Check for yellow "Missing required inputs" warning
4. **Is the external site up?** → Health Check tab → Check All Sites
5. **Is it a known issue?** → Check the error message below

---

## Error Messages and Solutions

### "Worker not configured"

**Cause:** The `WORKER_URL` or `WORKER_API_KEY` environment variables are not set on Vercel.

**Solution:**
1. Go to the Vercel dashboard → Settings → Environment Variables
2. Verify `WORKER_URL` is set to the DigitalOcean droplet's URL (e.g., `http://xxx.xxx.xxx.xxx:3100`)
3. Verify `WORKER_API_KEY` is set and matches the worker's `API_KEY` environment variable

### "Worker request failed"

**Cause:** The Testing Lab's API route couldn't connect to the worker.

**Possible reasons:**
- Worker is down (check Worker Status)
- Network issue between Vercel and DigitalOcean
- Firewall blocking the connection
- Worker URL is wrong

**Solution:**
1. Check Worker Status → click Refresh
2. If red: SSH into the DigitalOcean droplet and check `pm2 status`
3. If the worker is running but unreachable: check firewall rules (port 3100)

### "Worker timed out after Xs"

**Cause:** The scraper/analyzer took longer than the configured timeout.

**Per-module timeouts:**
| Module | Timeout |
|--------|---------|
| GIS Scraper | 30s |
| CAD Scraper | 60s |
| Clerk Scraper | 120s |
| GIS Viewer | 120s |
| Full Pipeline | 300s (5 min) |
| All others | 30s |

**Solution:**
1. Is the external website slow? Check manually in a browser
2. Is the scraper doing too many requests? Check the logs for request count
3. Consider increasing the timeout for this module (in `run/route.ts`)
4. If using Playwright, check for navigation delays or waiting for elements that don't exist

### "Worker returned 500"

**Cause:** The worker crashed while processing the request.

**Solution:**
1. Check the log stream for the exact error
2. SSH into the worker and check `pm2 logs starr-worker`
3. Common causes:
   - Null pointer: code tried to access `.property` on undefined
   - Playwright error: browser crashed or selector not found
   - AI API error: Claude API rate limit or invalid response
   - Memory issue: worker ran out of memory during screenshot capture

### "Missing required inputs: address"

**Cause:** The test card needs an input that isn't filled in.

**Solution:**
1. Look at which fields are listed in the warning
2. Fill them in the Property Context bar
3. Or select a Quick Load fixture that includes those fields

### "Worker is on main but Testing Lab is set to fix/branch"

**Cause:** You're testing against the wrong code. The worker runs whatever branch is deployed to it.

**Solution:**
1. Click **"Deploy fix/branch to Worker"** in the Worker Status bar
2. Wait ~5 seconds for the restart
3. Verify the branch matches (green dot appears)

### "Access restricted: the Testing Lab can only edit STARR RECON research code"

**Cause:** You tried to push a file that's outside the allowed scope.

**Allowed paths:** `worker/src/services/`, `adapters/`, `counties/`, `sources/`, `orchestrator/`, `ai/`, `types/`, `lib/`, `models/`, `chain-of-title/`, `reports/`, `exports/`

**Not allowed:** Frontend code, API routes, Testing Lab UI, billing, infrastructure

### "Failed to push: 422"

**Cause:** GitHub rejected the push.

**Common reasons:**
1. **File conflict:** Someone else edited the same file → Pull first, then retry
2. **Branch protection:** The branch has protection rules → Create a different branch
3. **Invalid content:** The file content is corrupt

**Solution:**
1. Click **Pull** in the branch selector
2. Re-open the file (it loads the latest version)
3. Make your changes again
4. Save & Push

### "GITHUB_TOKEN not configured"

**Cause:** The `GITHUB_TOKEN` environment variable is not set on Vercel.

**Solution:**
1. Create a GitHub Personal Access Token with `repo` scope
2. Add it as `GITHUB_TOKEN` in Vercel's environment variables
3. Redeploy

### "Pipeline cancelled by user"

**Cause:** Someone (maybe you) clicked the cancel button or the pipeline's abort controller was triggered.

**Solution:** This is expected behavior if you intentionally cancelled. If not:
1. Check if another user cancelled it
2. Check if the worker crashed and auto-cleaned up

### "AI CREDIT BALANCE DEPLETED"

**Cause:** The Anthropic API account ran out of credits.

**Solution:**
1. Go to `console.anthropic.com/settings/billing`
2. Add funds to the account
3. Re-run the test

---

## Worker Issues

### Worker Won't Start

1. SSH into the DigitalOcean droplet
2. Run `pm2 status` — is `starr-worker` listed?
3. If not: `cd /path/to/worker && pm2 start npm --name starr-worker -- start`
4. If listed but errored: `pm2 logs starr-worker --lines 50` to see the crash

### Worker Keeps Crashing

1. Check `pm2 logs starr-worker` for the crash reason
2. Common causes:
   - Missing environment variable → check `.env` file
   - Port already in use → kill the other process using port 3100
   - Node.js version mismatch → check `node --version` (needs >= 20)
   - Memory limit → increase PM2 memory limit or add swap

### Deploy Failed

If clicking "Deploy [branch] to Worker" fails:

1. **"Invalid branch name"** → branch name contains special characters
2. **"git fetch failed"** → worker can't reach GitHub (network issue)
3. **"git checkout failed"** → branch doesn't exist on the remote
4. **"Deploy failed"** → generic error, check the worker logs

---

## Browser Issues

### Tests Work on Chrome but Fail on Firefox

Some Playwright tests use Chrome-specific features. The worker always uses Chromium regardless of your browser.

### Page Loads Slowly

The Testing Lab loads many components. On slow connections:
1. Wait for the full page to load before interacting
2. The Worker Status bar loads asynchronously — give it a few seconds
3. Branch list loads from GitHub API — may take 1-2 seconds

### Code Editor Doesn't Save

1. Make sure you're on a feature branch (not main, unless you intend to edit main)
2. Make sure GITHUB_TOKEN is configured
3. Check that the file is in an editable path (not read-only)
4. Try Ctrl+S as an alternative to clicking the button

---

## Getting Help

1. **Check this troubleshooting guide first**
2. **Click the ? icons** throughout the Testing Lab for section-specific help
3. **Check the logs** — they usually explain what went wrong
4. **Ask in the team chat** — other developers may have seen the same issue
5. **Check GitHub Issues** — the problem may be a known bug with a fix in progress
