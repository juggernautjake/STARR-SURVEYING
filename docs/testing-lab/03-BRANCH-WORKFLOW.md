# Branch & Git Workflow

This guide covers everything about managing branches, pushing code, creating pull requests, and merging changes to production.

---

## Concepts

### Why Branches?

You should **never edit code directly on the `main` branch**. The `main` branch is what runs on the production website (via Vercel) and what the worker uses by default.

Instead:
1. Create a **feature branch** (e.g., `fix/bell-cad-scraper`)
2. Make your changes on the branch
3. Test the changes by deploying the branch to the worker
4. When everything works, create a **Pull Request** to merge into main
5. After merging, Vercel auto-deploys the updated main branch

### What Gets Deployed Where

| Branch | Vercel (Website) | Worker (DigitalOcean) |
|--------|-----------------|----------------------|
| `main` | Auto-deployed on every merge | Must be manually deployed |
| Feature branch | Not deployed to Vercel | Can be hot-deployed for testing |

---

## Creating a Branch

### From the Testing Lab

1. In the **Branch Selector**, click **+ Branch**
2. A form appears with a text field and "from [current-branch]" label
3. Enter a descriptive name:
   - Bug fixes: `fix/bell-cad-timeout`, `fix/harris-clerk-selector`
   - New features: `feat/bexar-county-adapter`, `feat/lidar-integration`
   - Experiments: `experiment/ai-prompt-v2`, `test/parallel-harvest`
4. Press **Enter** or click **Create**
5. The branch is created on GitHub and you're automatically switched to it
6. The branch list refreshes to include your new branch

### Branch Naming Conventions

```
fix/county-description     — Bug fixes (fix/bell-cad-timeout)
feat/county-description    — New features (feat/harris-county-adapter)
refactor/description       — Code cleanup (refactor/normalize-addresses)
test/description           — Experimental changes (test/parallel-scraping)
```

Always include the **county name** when the change is county-specific.

---

## Switching Branches

1. Click the **Branch** dropdown
2. Select the branch you want
3. Everything updates:
   - File browser shows files from the new branch
   - Code editor loads the new branch's version of open files
   - Worker Status bar may show a branch mismatch

### Important: Switching Branches Doesn't Change the Worker

If you switch from `main` to `fix/bell-cad-timeout`, the worker is still running `main`. Your tests will run against main's code until you deploy.

---

## Pulling Latest Changes

Click the **Pull** button next to the branch dropdown.

This checks GitHub for the latest commit on the selected branch and shows:
- The commit SHA (7 characters)
- The commit message
- Whether new changes were fetched

**When to pull:**
- Before starting work — make sure you have the latest code
- After someone else pushes to your branch
- After merging a PR — pull main to get the merged changes

---

## Pushing Code Changes

### From the Code Tab

1. Open a file in the Code tab editor
2. Make your changes
3. Click **Save & Push** — commits the file to your current branch
4. Or click **Save & Deploy** — commits AND deploys to the worker

### From the Debugger Code Viewer

When paused or after a run:
1. The code viewer switches to edit mode
2. Make changes to the file shown
3. Press **Ctrl+S** or click **Save & Push**

### What Happens When You Push

1. The file is committed to your branch on GitHub via the GitHub API
2. A commit message is auto-generated: `[Testing Lab] Edit filename.ts`
3. The commit SHA is shown in a success message
4. The branch's commit history on GitHub shows the change

---

## Creating a Pull Request

When your changes are tested and ready for production:

1. Make sure you're on a feature branch (not main)
2. In the Branch Selector, click **Merge to Main**
3. A form appears with a title field and "branch → main" label
4. Enter a clear PR title:
   - Good: "Fix Bell County CAD scraper timeout handling"
   - Good: "Add Harris County HCAD adapter"
   - Bad: "Fix stuff" (too vague)
5. Click **Create PR**
6. On success, a **"View on GitHub"** link appears — click it

### On GitHub

After clicking the link:
1. Review the changed files in the "Files changed" tab
2. Check for merge conflicts (GitHub will flag them)
3. If everything looks good, click **"Merge pull request"**
4. Choose "Squash and merge" for a clean commit history
5. Delete the feature branch after merging (GitHub offers this)

### After Merging

1. **Vercel** automatically rebuilds the website (1-3 minutes)
2. The **worker** still runs the old code — you need to deploy main:
   - Switch the Branch dropdown back to `main`
   - Click **Pull** to fetch the merged changes
   - Click **"Deploy main to Worker"** in the Worker Status bar

---

## Handling Merge Conflicts

If GitHub reports merge conflicts when creating a PR:

1. The Testing Lab shows an error message
2. Go to the PR on GitHub to see which files conflict
3. Options:
   - **Resolve on GitHub:** Use GitHub's web editor to resolve conflicts
   - **Resolve locally:** Pull both branches, merge manually, push
   - **Merge main into your branch first:** Pull main, merge it into your branch, resolve conflicts, push

### Preventing Conflicts

- Pull main frequently to stay up to date
- Keep branches short-lived — merge early and often
- Avoid editing the same files as other developers simultaneously

---

## Branch Comparison (Future Feature)

The Branch Selector has a "Side-by-side branch comparison" checkbox. When enabled, you can select a second branch to compare against. This feature will eventually show a diff view of what changed between branches.

---

## Complete Workflow Example

### Scenario: A county updated their website and broke the scraper

1. **Create branch:** `fix/bell-clerk-new-selectors`
2. **Test the current code:** Run the Clerk Scraper — confirm it fails
3. **Find the broken code:** The debugger shows the error in `kofile-clerk-adapter.ts` at line 156
4. **Go to Code tab:** Open `worker/src/adapters/kofile-clerk-adapter.ts`
5. **Fix the selectors:** Update the CSS selectors to match the new website layout
6. **Save & Deploy:** Click the orange button — code pushes to GitHub AND deploys to worker
7. **Re-test:** Go back to Scrapers, run the Clerk Scraper again — it passes
8. **Test the full pipeline:** Switch to Full Pipeline tab, run it — all phases pass
9. **Create PR:** Click "Merge to Main", title: "Fix Bell County clerk selectors after website update"
10. **Merge on GitHub:** Click "View on GitHub" → "Merge pull request" → "Squash and merge"
11. **Deploy main to worker:** Switch to main, Pull, Deploy
12. **Done!** Production code is updated, scraper works again
