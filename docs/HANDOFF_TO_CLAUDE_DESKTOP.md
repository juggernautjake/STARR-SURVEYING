# Handoff prompt — paste into Claude Desktop on Windows

> The Claude Code on the web session ran into the wall it should have: no
> browser, no Chrome pairing, no computer-use. Desktop Claude on Windows
> has all three (per the screenshot: "Allow all browser actions" on,
> "Browser 1 — Windows — Device ID: 7d67bb6a", Computer-use Beta on).
> Paste the section below into a new Claude Desktop conversation.

---

## Prompt (copy below this line)

You are picking up a backend audit + UI polish job on the **STARR Surveying**
codebase, mid-flight. There is real, live work waiting — apply DB migrations
in a browser, then drive the deployed app end-to-end and ship fixes.

### Repo + branch

- GitHub: `juggernautjake/starr-surveying`
- Clone locally (if not already): `git clone https://github.com/juggernautjake/starr-surveying.git`
- Current working branch: **`claude/jolly-ramanujan-AbWr4`**. The last
  prior session pushed commit `d25b2f6` to this branch. Use this branch;
  don't switch to `main` or `claude/nice-bardeen-YpOrt` (that's an older
  pre-Phase-3 branch).
- Local stack: Next.js 14, NextAuth v5 beta, Supabase, Pixi.js, Playwright.
  Commands:
  - `npm install`
  - `npm run dev` — needs `.env.local` with `NEXTAUTH_SECRET`,
    `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (and the OAuth
    vars for Slice 29). The user has these in Vercel and 1Password; ask
    them to paste into a `.env.local` if you need a working local server.
  - `npm run type-check` — must be clean before any commit.
  - `npm run lint` — must be clean (one pre-existing
    `react-hooks/exhaustive-deps` warning on `app/admin/time-off/page.tsx`
    is acceptable; don't introduce new ones).
  - `npm run build` — sanity-check before pushing big UI changes.

### Planning doc (drive the work from this file)

`docs/planning/in-progress/backend-audit-and-improvements-2026-05-27.md`
already contains:

- 31 shipped slices (1–30 from prior sessions, 31 from the web session).
- A **Phase 3 runbook** at the top with exact SQL/CLI steps for the user
  to apply `seeds/296_schedule_recurring.sql`,
  `seeds/297_google_calendar_connections.sql`,
  `seeds/298_pto_accrual.sql`. You should drive that yourself in this
  session (see Job 1 below).

Append each new fix as a **Slice 32, 33, 34…** below Slice 31. One slice
= one shippable unit = one commit. Update the doc inline as you ship.

When every item is shipped or deferred with a one-line rationale, move
the doc to `docs/planning/completed/` (the stop-hook will route into a
QA phase once `in-progress/` is empty).

### Credentials (the user wants this done)

The user explicitly asked you to use their Supabase, Vercel, GitHub
credentials in your local browser. You're running on their machine —
fine — but **don't store, log, screenshot, or commit any secret value
to the repo**. The Chrome instance you're pairing with already has them
signed in. Use the active session, not a credential dump:

- `https://supabase.com/dashboard/project/<their-ref>/sql/new` — already
  signed in.
- `https://vercel.com/dashboard` — already signed in. The repo's project
  is `starr-surveying`.
- `https://github.com/juggernautjake/starr-surveying` — already signed
  in.
- App login (for testing): `https://app.starrsurveying.com`, user
  `jacobmaddux@starr-surveying.com`, password `Applesauce@127`. (The
  user said you can use this; do not change the password, do not log
  out, do not change any user's role, do not delete data.)

If the prod site returns 503/upstream-connect-error, give it 60–90s of
cold-start and retry. Don't hammer it.

### Job 1 — apply seeds 296–298 to Supabase (browser)

Per the runbook section at the top of the planning doc:

1. Open Supabase SQL Editor for the project.
2. For each file in this order, paste the contents, click **Run**,
   confirm "Success. No rows returned.":
   - `seeds/296_schedule_recurring.sql`
   - `seeds/297_google_calendar_connections.sql`
   - `seeds/298_pto_accrual.sql`
3. Run the verification block at the end of the runbook section. All
   four assertions should return the expected rows.
4. Note the apply timestamp + your name into the planning doc under
   "Phase 3 — runbook" and call it done.

### Job 2 — env vars for Slice 29 OAuth (Vercel)

In the Vercel project for `starr-surveying`, confirm or add (Production
+ Preview):

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI=https://app.starrsurveying.com/api/admin/google-calendar/callback`

If the OAuth client doesn't exist yet, the user will need to create one
in Google Cloud Console (`https://console.cloud.google.com/apis/credentials`)
with the redirect URI above, then paste client id/secret into Vercel.
Ask before creating GCP resources on their behalf.

After saving, redeploy the project so the new env vars are picked up.

### Job 3 — live end-to-end audit of every `app/admin/**` page

Sign in to `https://app.starrsurveying.com` as the user above. For each
page below, take a screenshot, verify the listed criteria, and open
**every modal / dialog / popover / dropdown** on the page. Report
findings as bullet-point notes inline; queue real fixes as new slices.

Acceptance criteria for every page:

1. Renders without runtime errors in the Chrome devtools console.
2. All buttons + links land at the expected route (not 404 / not red).
3. No clipped, overflowing, wrapped-mid-word, or overlapping UI.
4. Fonts not too small (< 12px) or too large (> 36px outside hero).
5. Anchor colour is navy (`#1D3095`-ish), not red (`#BD1218`).
6. Modals + dialogs centre + size correctly + are keyboard-dismissable.

Pages to walk, in order:

```
/admin/dashboard
/admin/jobs                   (+ /admin/jobs/[id] for at least 2 jobs)
/admin/leads
/admin/notes
/admin/receipts
/admin/payroll
/admin/settings
/admin/mileage
/admin/assignments
/admin/reports
/admin/equipment
/admin/invites
/admin/schedule
/admin/time-off
/admin/team
/admin/work
/admin/users (if visible)
/admin/discussions
/admin/hours-approval
/admin/announcements
/admin/audit
/admin/error-log
/admin/office
/admin/org-settings
/admin/profile
/admin/timeline
/admin/vehicles
/admin/rewards
/admin/billing
/admin/research
/admin/finances
/admin/my-pay
/admin/my-hours
/admin/my-jobs
/admin/my-notes
/admin/my-files
/admin/me
```

### Job 4 — exercise Slice 24–30 features against real data

These were code-verified-only in the previous session. Now actually
drive them:

- **Slice 24 (CAD Print/Export toggles).** Open `/admin/cad`, draw any
  sample shape, open the **Print** dialog. Toggle Border, Legend,
  Certification, Notes on/off. For each combination of toggles, click
  **Export PNG** and **Export PDF** and visually verify the rendered
  output contains/omits exactly that element. Filename pattern is
  `starr-cad-<paper>-<orientation>.<ext>`. Save samples to your desktop;
  delete them after.
- **Slice 25 (schedule conflict 409).** On `/admin/schedule`, create an
  event from 09:00 → 11:00 for yourself, then a second one 10:00 →
  12:00. Confirm the conflict dialog lists the overlap and "Create
  anyway?" succeeds. Then test the same with PATCH (drag-to-move into
  an occupied day).
- **Slice 26 (recurring).** Create one Daily, one Weekly (BYDAY MoWeFr),
  one Monthly. Step Week / Month views forward and back; verify
  occurrences appear with the correct id-suffix scheme (virtual ids end
  in `:1`, `:2`, …). Delete the source row and confirm the entire
  series disappears.
- **Slice 27 (time-off).** As the admin user, request 2 hours of
  time-off tomorrow (uncheck "All day", 14:00 → 16:00). Switch to the
  Pending Approvals queue → click Approve. Then refresh
  `/admin/dashboard` and confirm the **PTO Balance** tile reflects the
  −2 h deduction (Slice 30 round-trip).
- **Slice 28 (drag / click).** On the week view, drag any event to a
  different day → it should reschedule, preserving time-of-day. Click
  an empty day-cell background → the create form should open with that
  date pre-filled and the title input focused.
- **Slice 29 (Google Calendar OAuth).** Settings → Integrations →
  Google Calendar → **Connect**. Pick a test Google account, accept
  scopes. Verify the callback flashes a success message and the
  Connect button becomes Disconnect + Sync-now. Click Sync-now. Open
  Google Calendar in another tab and confirm at least one approved
  schedule event landed there.
- **Slice 30 (PTO).** From `/admin/dashboard`, click the My Finances
  tile → land on `/admin/my-pay`. Confirm a PTO Balance figure
  matches what's on the dashboard. Open `/api/admin/pto` directly to
  see the transaction list.

### Job 5 — ship fixes as new slices

Each fix:

1. Branch is already `claude/jolly-ramanujan-AbWr4`. Stay on it.
2. Read the actual file, write the change, run
   `npm run type-check && npm run lint` until clean.
3. Append `### Slice 32 — …` (then 33, 34, …) to the planning doc with
   a "Done:" / "Verified:" block following the same shape as Slice 31.
4. `git add` only the files you touched (no `git add -A`).
5. Commit with a one-line summary + a short body. No agent-branded
   footer; no co-author tag.
6. `git push -u origin claude/jolly-ramanujan-AbWr4` (retry on
   transient network failures with backoff).
7. Do **not** open a pull request unless the user asks.

### Already-spotted issues, ready to ship as Slices 32+

The prior session identified but didn't ship these. Do them first:

**Slice 32 — `/admin/time-off`: replace hardcoded `#1D3095` with the
CSS var.** `app/admin/time-off/page.tsx` has 4 inline `#1D3095`
literals (lines 117, 156, 177; also `'#B91C1C'` once). Convert them to
`var(--color-brand-navy)` (and `var(--color-error)` for the red).
Status badge could become a real `.tag` chip while you're in there.

**Slice 33 — PTO deduction over-counts all-day requests.**
`app/api/admin/time-off/route.ts:114-117` computes hours as
`(endMs - startMs) / 3_600_000`. For an all-day request stored as
`00:00 → 23:59`, that deducts ~24 h per day instead of 8. Fix: if
`data.all_day` is true, deduct `8 * <number of weekdays between start
and end inclusive>`; otherwise keep the existing minute-based calc.

**Slice 34 — Schedule month view: drag-to-move + click-to-create.**
`app/admin/schedule/SchedulePanel.tsx` Slice 28 only wired the **week**
view. The month view (lines ~430–453) needs the same `onDragOver` /
`onDrop` / cell-click handlers as the week view (lines ~372–388), so
admins on the month view aren't stuck with a static grid.

**Slice 35 — Time-off page: show employee's current PTO balance.**
Above the request form, fetch `/api/admin/pto` and surface
`balance_hours` so the user knows whether they can afford the request.
Block submit (or warn) if `(requested_hours > balance_hours)`. The
warning should not be a hard block — admins occasionally approve
negative-balance requests by policy.

**Slice 36 — Hardcoded navy hex sweep.** Run
`grep -rn "#1D3095" app/admin/ --include="*.tsx"` (155 hits as of
2026-05-28). Convert each inline style to `var(--color-brand-navy)` so
the next time the brand colour changes there's one place to edit.
**Do this incrementally** — one page or one component per commit, not
one giant find-replace. Easy targets first:
`app/admin/team/page.tsx`, `app/admin/jobs/[id]/page.tsx`,
`app/admin/employees/page.tsx`.

**Slice 37 — Live verification report.** Once jobs 3 + 4 are done,
attach a single Markdown report summarising the live audit (one row
per page, columns: page / renders / console errors / layout issues /
modals checked / fix shipped or queued). Place it at
`docs/planning/in-progress/PHASE_3_LIVE_AUDIT_RESULTS.md`.

### Hard limits

- **Don't** delete data (rows, files, jobs, users, schedule events you
  didn't create).
- **Don't** change any user's role or assignment.
- **Don't** sign out the live test user (the session is reused).
- **Don't** commit `.env*` files (`.env.local` is gitignored; only
  `.env.example` may be touched, and only to add missing keys).
- **Don't** push to `main` or open a PR unless the user explicitly
  asks.
- **Don't** force-push, `git reset --hard`, or rewrite committed
  history.
- **Don't** screenshot dialogs that show secret values
  (`GOOGLE_OAUTH_CLIENT_SECRET`, the user's password, etc.) and never
  paste those screenshots into chat.

### Definition of done

The session ends — and the planning doc moves to
`docs/planning/completed/` with a Phase-3 wrap-up note — when:

1. Seeds 296–298 are confirmed applied (runbook verification block
   green).
2. Every page in Job 3 has either a "no issues found" line or a slice
   number against it in `PHASE_3_LIVE_AUDIT_RESULTS.md`.
3. Every slice-24–30 feature in Job 4 has a "lived through it"
   confirmation.
4. Every queued slice (32–N) is shipped, pushed, and annotated.

Run until each of those four is true. Don't manufacture more work past
that — the user wants completion, not an endless loop.

---

## How to start this session in Claude Desktop

1. Open Claude Desktop, paired with **Browser 1 — Windows — Device ID
   7d67bb6a** (per the user's settings screenshot).
2. New conversation.
3. Paste everything between the two horizontal rules above.
4. The user is `jacobmaddux96@gmail.com` (Anthropic account); the
   GitHub account is `juggernautjake`. The user is asleep — execute
   non-destructively and leave a clear summary at the top of any
   modified planning doc so they can resume in the morning.
