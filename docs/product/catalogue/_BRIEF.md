# Feature catalogue: the brief every area follows

The owner wants a full catalogue of the Starr Surveying platform so that every page, tool and mechanic can be reviewed and perfected, and so a product can be curated that real surveying firms will use. The question behind every entry is: **if we rebuilt this, how would we do it?**

## What to write

For your area, write two files in `docs/product/catalogue/`:

- `<area>.json`: an array of entries in the schema below;
- `<area>.md`: a readable overview of the area. It covers:
  - what the area is for;
  - how its parts fit together;
  - the main user journeys;
  - the biggest problems;
  - the rebuild recommendation for the area as a whole.

Read the code (pages, components, API routes, lib, seeds/SQL, tests, and plans in `docs/planning/**`). Run nothing that changes data. Don't edit any file outside `docs/product/catalogue/`.

## Entry schema (one per page, panel, tool, mechanic or API group)

```json
{
  "id": "area.short-kebab-id",
  "area": "cad | research | jobs | people | money | office | platform",
  "kind": "page | panel | tool | mechanic | api | job | integration",
  "name": "Human name",
  "where": ["app/admin/…/page.tsx", "lib/…"],
  "route": "/admin/…",
  "roles": ["admin", "…"],
  "purpose": "What it is for, in one or two sentences, in the owner's terms.",
  "elements": [{ "name": "Button/field/tab", "does": "what it actually does now" }],
  "behaviours": ["Current behaviour, including side effects, states, automations"],
  "data": ["tables, APIs, external services it reads or writes"],
  "status": "works | partial | broken | stub | unknown",
  "problems": ["bugs, confusing UI, dead controls, duplication, missing states, performance"],
  "overlaps": ["ids of entries that do the same or nearly the same thing"],
  "verdict": "keep | improve | merge | remove | rebuild",
  "rebuild": "How we would build it if starting over: the simplest design that keeps every real capability.",
  "add": ["capabilities a real surveying firm would expect that are missing"],
  "priority": "P1 | P2 | P3",
  "evidence": ["file:line references for the claims above"]
}
```

## The two goals every verdict serves

1. **Super functional and easy to use.** Fewer, clearer controls, and the common job fast.
2. **Works for many surveying firms nationwide,** not just Starr in Texas. For each entry, note in an extra field `"nationwide"` what is hard-coded to Starr, Belton or Texas: names, counties, state law, data sources, units, branding, single-tenant assumptions. Also note what must become configurable per firm or per state.

Also add a field `"plans"`: the ids or paths of planning documents (`docs/planning/**`) that cover this entry, with any ideas in them that are still open (not built yet).

## Rules

- **Every claim cites the code** (`file:line`). Write `"status": "unknown"` rather than guess.
- **Cover everything** in your area: every page under its routes, every tab, modal, panel and major control, every API route group, background job and integration. Small controls can be grouped under their panel's `elements`.
- **Be candid** about problems, duplicates and dead ends. The owner wants to know what to get rid of.
- **Think as a surveying firm would:** a party chief, a drafter, an RPLS and the office manager. What must be fast, and what is just noise?
- **Keep it to facts and recommendations.** No marketing language.
- **Budget:** Claude usage is tight. Don't spawn sub-agents. Read with grep and line ranges, not whole large files. Summarise.
- **When done,** commit only your two files on branch `claude/feature-catalogue`, in this worktree (`C:\Users\Jacob Maddux\dev\starr-catalogue`). The message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Don't push: the coordinator pushes. If the commit races another area's, `git pull --rebase` isn't needed; just retry the commit.
