# Branch cleanup, 2026-10-24

Every unmerged branch was reviewed against origin/main. Anything deleted has an archive tag `archive/<branch-name>` pushed to origin (restore with `git branch <name> archive/<name>`).
D&D and character-editing branches were not merged: that code is moving out of this repo.

| Branch | Tip SHA | What it contained | Decision | Why |
|---|---|---|---|---|
| claude/feature-catalogue | 74a9d288c (+1 brief commit) | Product catalogue, plans, platform docs | Merged (PR #670), kept | Docs only. |
| claude/receipt-reading-v2-2026-10-07 | 10c7607d5 | Zoomed double-read receipts, spending tab, audit-readiness gate, seed 675 | Merged (PR #666) | No equivalent on main. Needed one fix: the new spending and audit-readiness queries lacked the superseded and personal-expense exclusions that the repo's `expense-totals-exclude-superseded` guard requires. Branch rebased on main with main merged in. |
| claude/job-property-id-2026-10-14 | 4811b9e80 (WIP commit of the uncommitted work; branch also carried the receipts commit) | Property ID field on every job: job create/edit, PropertyPanel, research start/from-job, job PDF; CHECK_PRINTING plan doc | Merged (PR #675, as claude/job-property-id-v2), archived and deleted | Valuable and it applies cleanly. Seed renumbered 676 to 678 because main already has 676 and 677. |
| claude/ellie-contact-facts-2026-10-15 | 791bf487e | Receptionist reads email and website exactly, never invents a fix, with tests | Merged (PR #672) | Small, tested, CI green. |
| claude/voice-boundary-improvements-2026-10-14 | 13d1dadc0 | Nothing ahead of main | Already merged (PR #668); branch and worktree removed | No unique commits. |
| claude/job-lifecycle-2026-08-14 | 675162f0e | 17 commits: job briefings (recorder, publish), job money panel, job-event notifier and digest, crew instructions screen, a full Twilio phone/voicemail system, receipt slideshow | Archived and deleted | The receipt slideshow is already on main. The phone system collides with main's AI receptionist (add/add conflicts on /api/twilio/recording and /status) and would put the live phone line at risk. The jobs half cannot be cherry-picked: main restructured the job page into a single Files tab and Property Map, so every UI commit conflicts. Seeds 592 to 595 also collide. Worth re-implementing: briefings, job money, job-event notifier. Read the tag for the design. |
| claude/retire-legacy-payroll-engine-2026-08-18 | b154fe8be | `POST /payroll/runs` returns 410; overlap guard deleted; zero-stub run cannot be completed | Archived and deleted (PR #671 closed) | Main moved the payroll UI into /admin/pay (old page is now a redirect) and later changed the legacy route; five conflicts in money code. Payroll was parked by the owner on 2026-08-31. A stale port is a risk without that decision. |
| worktree-surveying-payments-2026-07-29 | bbfef6094 | Texas sales tax on surveying, compliance deadlines, records catalogue (libs plus tests plus plan) | Archived and deleted (PR #673 closed) | CI fails two repo ratchets: three new lib modules with no production importer, and Texas/firm hard-coding above the cap. It is unwired and Texas-only. Revisit once the state/jurisdiction config layer exists. |
| claude/merge-tax-and-jobs-2026-08-29 | c6cc9d360 | Merge of the payments branch, same content | Archived and deleted | Duplicate of the line above. |
| claude/surveying-workmode-toolset-2026-07-18 | 4bdfde2ba | Job number and coordinates on the Work Mode header | Archived and deleted (PR #674 closed) | The file it edits no longer exists on main. |
| claude/dnd-campaign-thumbnail-2026-08-02 | b6a0275bf | D&D campaign thumbnails | Archived and deleted | D&D is moving out of this repo. |
| claude/dnd-creature-picker-2026-08-02 | 1a3834784 | D&D creature picker | Archived and deleted | Same. |
| claude/dnd-manual-roll-2026-08-02 | 5eba42601 | D&D manual roll | Archived and deleted | Same. |
| claude/dnd-per-slot-screens-2026-08-02 | 8b5428d8f | D&D per-slot screens | Archived and deleted | Same. |
| claude/dnd-roller-ink-2026-08-02 | fd9645ac4 | D&D roller ink | Archived and deleted | Same. |
| claude/dnd-roller-ink-fix-2026-08-02 | c32d6864a | D&D roller ink fix | Archived and deleted | Same. |
| claude/dnd-session-2026-08-02 | ccc3cb542 | D&D session | Archived and deleted | Same. |
| claude/dnd-srd-magic-items-2026-08-02 | 8d56532d4 | D&D SRD magic items | Archived and deleted | Same. |
| claude/dnd-streamer-audit-2026-08-03 | 76b26b5d9 | D&D streamer audit | Archived and deleted | Same. |
| claude/dnd-slot-driven-close-2026-08-02 | 69e7fb4bf | D&D docs closing SLOT_DRIVEN | Archived and deleted | Same. |
| docs/character-editing-consolidation-audit | d2a1ea5a0 | Character-editing audit doc | Archived and deleted | Character editing is out of scope for this repo. |
