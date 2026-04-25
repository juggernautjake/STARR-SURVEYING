# Claude Code Execution Guide v2 — Building STARR_FIELD_MOBILE_APP_PLAN.md

This guide tells Claude Code how to build the v2 planning document **in small batches** so it never has to generate a long output in a single turn — which is what was killing your previous sessions.

The v2 plan adds significantly expanded sections on time logging (5.8), location tracking (5.10), and expense management (5.11). To keep batches small enough to avoid streaming timeouts, these large sections are split across multiple batches.

## Strategy

Each batch creates or appends one logical section. Each batch is:
- **Self-contained** — Claude Code doesn't need to re-read the entire file
- **Bounded in output** — usually 60–130 lines per batch, well under timeout thresholds
- **Append-style** — once Batch 1 creates the file, every subsequent batch just appends

Paste each batch prompt one at a time into Claude Code. Wait for it to finish before sending the next.

The complete reference is `STARR_FIELD_MOBILE_APP_PLAN.md` — Claude Code reads sections from it.

## Setup (one-time, before Batch 1)

```
Copy the attached file STARR_FIELD_MOBILE_APP_PLAN.md to docs/planning/in-progress/STARR_FIELD_MOBILE_APP_PLAN_REFERENCE.md in the repo. This is the reference we'll be working from. Do not commit it yet.
```

---

## Batch 1 — Initialize file with header, exec summary, goals

```
Create a new file at docs/planning/in-progress/STARR_FIELD_MOBILE_APP_PLAN.md.

Copy sections 1 (Executive summary) and 2 (Goals & non-goals) from docs/planning/in-progress/STARR_FIELD_MOBILE_APP_PLAN_REFERENCE.md to the new file, preceded by the document header (title, status v2, owner, component, created date, last updated, target repo path) exactly as in the reference.

Stop after these sections.
```

---

## Batch 2 — Project context and personas

```
Append sections 3 (Where this fits in the Starr Software ecosystem) and 4 (User personas, all five subsections) from the reference file.

Preserve the ASCII diagram in section 3.

Stop after section 4.5.
```

---

## Batch 3 — Auth, Jobs, Data Points

```
Append sections 5.1 (Authentication), 5.2 (Jobs), and 5.3 (Data points) from the reference file.

Preserve all bullet lists, lifecycle states, and special point types.

Stop after section 5.3.
```

---

## Batch 4 — Media, Notes, Files, CSV

```
Append sections 5.4 (Media capture), 5.5 (Notes), 5.6 (Files), and 5.7 (CSV upload) from the reference file.

Preserve structured note templates and annotation tools.

Stop after section 5.7.
```

---

## Batch 5 — Time logging part 1 (basics + smart prompts + edits)

```
Append section 5.8 (Time logging) from the reference file, but ONLY subsections 5.8.1 through 5.8.4 (clock-in/out, smart prompts, time editing, break tracking).

Stop after section 5.8.4. Do not include 5.8.5 onward in this batch.
```

---

## Batch 6 — Time logging part 2 (overnight, timesheet, geofence prompts)

```
Append the remaining subsections of 5.8 from the reference file: 5.8.5 (multi-day handling), 5.8.6 (timesheet view), and 5.8.7 (geofence-based auto-prompts).

Stop after section 5.8.7.
```

---

## Batch 7 — Sync and offline-first

```
Append section 5.9 (Sync and offline-first) from the reference file.

Preserve the sync prioritization order and conflict resolution rules exactly.

Stop after section 5.9.
```

---

## Batch 8 — Location tracking part 1 (privacy + tracking + classification)

```
Append section 5.10 (Location tracking) from the reference file, but ONLY subsections 5.10.1 through 5.10.3 (privacy & consent, what gets tracked, stop classification).

Preserve all seven privacy rules in 5.10.1 exactly.

Stop after section 5.10.3.
```

---

## Batch 9 — Location tracking part 2 (timeline + dispatcher + mileage)

```
Append subsections 5.10.4 through 5.10.6 from the reference file (daily timeline view with the ASCII timeline example, dispatcher live map, mileage tracking).

Preserve the ASCII timeline display in 5.10.4 exactly — it's important for showing the UX.

Stop after section 5.10.6.
```

---

## Batch 10 — Location tracking part 3 (vehicles + battery)

```
Append subsections 5.10.7 (vehicle assignment) and 5.10.8 (battery management strategy) from the reference file.

Preserve the four battery modes in 5.10.8.

Stop after section 5.10.8.
```

---

## Batch 11 — Receipts part 1 (capture + AI extraction + job association)

```
Append section 5.11 (Expense & receipt management) from the reference file, but ONLY subsections 5.11.1 through 5.11.3 (capture flow, AI-extracted fields, job association).

Stop after section 5.11.3.
```

---

## Batch 12 — Receipts part 2 (categories + missing detection + approval)

```
Append subsections 5.11.4 through 5.11.6 from the reference file (categories and tax flags, missing-receipt detection, approval and export workflow).

Stop after section 5.11.6.
```

---

## Batch 13 — Receipts part 3 (rollups + fuel cards + retention)

```
Append subsections 5.11.7 through 5.11.9 from the reference file (per-job rollups, fuel card reconciliation, IRS retention).

Stop after section 5.11.9.
```

---

## Batch 14 — Architecture: tech stack + storage

```
Append sections 6.1 (Tech stack recommendation) and 6.2 (Storage strategy) from the reference file.

Preserve the comparison table in 6.1 and the storage table in 6.2.

Stop after section 6.2.
```

---

## Batch 15 — Architecture: data model part 1

```
Append section 6.3 (New Supabase tables) from the reference file, but ONLY the SQL DDL for these tables in order: jobs ALTER, field_data_points, field_media, field_notes, vehicles.

Preserve the SQL exactly. Do not yet include time_entries onward.

Stop after the vehicles table definition.
```

---

## Batch 16 — Architecture: data model part 2

```
Continue section 6.3 by appending the SQL DDL for the remaining tables: time_entries, time_entry_edits, location_stops, location_segments.

Preserve the SQL exactly.

Stop after the location_segments table definition.
```

---

## Batch 17 — Architecture: data model part 3 + sync engine

```
Continue section 6.3 by appending the SQL DDL for the remaining tables: receipts, receipt_line_items, point_codes. Then include the RLS paragraph that follows the SQL block.

Then append section 6.4 (Offline sync engine) in full.

Stop after section 6.4.
```

---

## Batch 18 — UI/UX principles

```
Append section 7 (UI/UX principles) from the reference file in full, including 7.1 (Field-optimized design rules), 7.2 (Information architecture with the tab bar diagram), 7.3 (Empty/error states), and 7.4 (Dispatcher web view).

Stop after section 7.4.
```

---

## Batch 19 — Future integrations

```
Append section 8 (Future integrations) including 8.1 (Trimble Access paths A/B/C) and 8.2 (Other future integrations) from the reference file.

Stop after section 8.2.
```

---

## Batch 20 — Phased build plan part 1 (Phases 0–4)

```
Append section 9 (Phased build plan) header and the first five phases (0 through 4) from the reference file.

Preserve every checklist item under each phase.

Stop after Phase 4's "Exit:" line.
```

---

## Batch 21 — Phased build plan part 2 (Phases 5–9+)

```
Continue section 9 by appending Phase 5 through Phase 9+ from the reference file.

Preserve every checklist item.

Stop after the Phase 9+ line.
```

---

## Batch 22 — Risk register

```
Append section 10 (Risk register) from the reference file in full.

Preserve the entire risk table including all bolded high-priority risks.

Stop after the risk table.
```

---

## Batch 23 — Cost model and open questions

```
Append section 11 (Cost model) and section 12 (Open questions, all 20 of them) from the reference file.

Preserve the cost tables and the numbered list of open questions exactly.

Stop after open question 20.
```

---

## Batch 24 — Appendix A (API contracts)

```
Append section 13 (Appendix A — sample API contracts) from the reference file in full.

Preserve all JSON code blocks exactly.

Stop after the Mileage log export section.
```

---

## Batch 25 — Appendix B and C, decision log

```
Append section 14 (Appendix B — capture-flow timing budgets), section 15 (Appendix C — bootstrapping checklist), and section 16 (Decision log) from the reference file.

Append the closing "End of plan." line.

Preserve all tables and checklists exactly.

Stop after the End of plan line.
```

---

## Batch 26 — Repo alignment review (the safe version of what timed out before)

This is the part where Claude Code aligns the plan with the actual STARR-SURVEYING / Starr Software codebase. Now that the plan is fully in the repo, this is safe because Claude Code only needs to make small targeted edits.

```
Read docs/planning/in-progress/STARR_FIELD_MOBILE_APP_PLAN.md in full.

Then, without rewriting the document, produce a numbered list of any changes needed to align it with the actual STARR-SURVEYING repo state. For each change provide:
1. The section number
2. A short snippet of the current text
3. A short snippet of the proposed replacement
4. A one-line rationale

Pay particular attention to:
- Existing schema in Supabase (do any tables already exist with different names/columns?)
- Existing time-tracking or receipt code (extend, don't duplicate)
- The actual Anthropic SDK wrapper (ai-usage-tracker.ts) used in other parts of the codebase
- Existing R2 / storage configuration
- Whether mobile app belongs in the existing repo or a new one
- Project's existing phase taxonomy (align with it instead of creating a parallel A/B/C/D scheme)

Do NOT apply any edits yet. Just produce the list. If the plan already aligns, say so explicitly.
```

After reviewing the list:

```
Apply changes 1–5 from your list using str_replace, one at a time. Stop after change 5 and confirm.
```

Then 6–10, then 11–15, etc. Each turn does small bounded work.

---

## Batch 27 — Cleanup and commit

```
Delete docs/planning/in-progress/STARR_FIELD_MOBILE_APP_PLAN_REFERENCE.md.

Stage and commit:
- git add docs/planning/in-progress/STARR_FIELD_MOBILE_APP_PLAN.md
- git commit -m "docs(planning): Starr Field mobile app RFC v2

Mobile companion app for field surveyors. Offline-first capture of
data points, photos, video, voice memos, notes; clock-in/out with
smart prompts and edits; location-aware timeline with stop classification;
IRS-compliant mileage logs; AI-extracted receipt management with
missing-receipt cross-reference; vehicle assignment.

React Native + Expo + Supabase + R2 + Claude Vision for receipts.
Phased build over ~8 months for v1; Trimble Access integration roadmap."

Do not push. Stop and confirm.
```

---

## If a batch still times out

Split it further. The sections are designed so any subsection can be appended individually:

> Append ONLY section 5.10.4 from the reference. Stop after it.

Every numbered subsection (5.8.1, 5.10.6, 5.11.3, etc.) can stand alone as a single batch if needed.

For Batch 15 (data model SQL), if even that splits up, you can do one table at a time:

> Append ONLY the SQL DDL for the time_entries table from section 6.3. Stop after the closing semicolon.

---

## Notes for using this guide

1. **Wait between batches** — let each one fully complete before sending the next
2. **Don't ask Claude Code to "do all the batches"** — that defeats the purpose. One per turn.
3. **If a batch produces unexpected output** — stop and inspect the file before continuing
4. **Verify file length grows** — each batch should add the expected amount; if Batch 8 doesn't add ~80 lines something went wrong silently
5. **The reference file is your safety net** — if the assembled document gets garbled, start over from the reference

## Comparison to v1 guide

The v1 guide had 14 batches. The v2 guide has 27. That's not because the work doubled — it's because the new sections (time logging, location tracking, receipts) are dense enough that splitting them at subsection boundaries protects against timeouts. Each batch is the same size or smaller than v1 batches.

The total file size is ~1090 lines vs v1's ~736 — about 50% bigger. The batches grew roughly proportionally.
