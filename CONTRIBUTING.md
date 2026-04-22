# Contributing to Starr Software

This is the operating manual for working in this repository. If you're an engineer, an AI agent, or a future Jacob who has lost the thread, start here.

## Where new code goes

| You are working on… | Put it in… |
|----------------------|------------|
| Property research / analysis backend | `worker/src/` (no rename — backend stays as-is) |
| Property research / analysis frontend | `app/admin/research/` (will eventually move to `app/admin/recon/`; not in this PR) |
| Research domain logic shared between frontend + worker | `lib/research/` (will eventually move to `lib/starr-recon/`; not in this PR) |
| CAD drafting (Starr Forge) | `app/admin/cad/` for UI, future `lib/starr-forge/` for domain logic |
| Filing-cabinet digitization (Starr Archive) | future `lib/starr-archive/` (sketch only — no code yet, see `docs/product/starr-archive.md`) |
| Job/payroll/hours (Starr Ledger) | currently split across `app/admin/{jobs,payroll,hours-approval,my-hours,my-jobs,my-pay,payout-log,schedule,assignments}/` and `app/admin/components/payroll/`. Rename to a unified `lib/starr-ledger/` namespace is **pending** and tracked separately. |
| Learning management (Starr Academy) | `app/admin/learn/` |
| Public marketing site (Starr Site) | top-level `app/` outside `app/admin/` |
| Cross-cutting library code | `lib/` |
| Database seeds | `seeds/` (numeric-prefix ordering: `000_reset.sql`, `001_config.sql`, `200_recon_graph.sql`, …) |
| Tests for `app/` and `lib/` code | `__tests__/` at repo root |
| Tests for `worker/src/` code | `worker/src/__tests__/` |

## Naming conventions (locked April 2026)

Product names — use these exactly, including the `Starr ` prefix:

| Name | Meaning |
|------|---------|
| `Starr Recon` | Property research and analysis (current focus) |
| `Starr Forge` | Survey CAD drafting (formerly `STARR_CAD` in planning docs) |
| `Starr Archive` | Filing-cabinet digitization (sketch only) |
| `Starr Compass` | **RESERVED** — do not use yet. Earlier planning docs use this as a synonym for Starr Recon; that usage is frozen, not retroactively rewritten. |
| `Starr Academy` | Learning management system (existing) |
| `Starr Ledger` | Job scheduling, payroll, hours tracking (existing). Renamed April 2026 from `Starr Forge` in some planning docs to avoid clash with the CAD product. |
| `Starr Site` | Public marketing site (existing) |
| `Starr Software` | Parent company name (separate from `Starr Surveying`, the customer) |

Code namespaces (going forward):

```
lib/starr-recon/      (eventually replaces lib/research/)
lib/starr-forge/      (eventually replaces lib/cad/)
lib/starr-archive/    (future)
lib/starr-ledger/     (future, when the existing scattered code consolidates)
worker/src/           (no rename — backend stays as-is)
app/admin/recon/      (eventually replaces app/admin/research/)
```

**The `lib/research` → `lib/starr-recon` and `lib/cad` → `lib/starr-forge` renames are not done in this PR.** They require careful handling of import statements across the codebase and will be a dedicated future cleanup PR. For now, the new names are just locked here so anyone shipping new files knows which namespace to put them in.

## Documentation

Documentation lives under [`docs/`](./docs/). Start at [`docs/README.md`](./docs/README.md) for the full index.

Three kinds of doc:

| Kind | Folder | Lifespan |
|------|--------|----------|
| Live specs | `docs/platform/`, `docs/product/`, `docs/engine/`, `docs/style/` | As long as the system they describe exists |
| Planning docs | `docs/planning/{completed,in-progress,obsolete}/` | Time-boxed; see `docs/planning/README.md` for the classification rubric |
| Testing-lab guides | `docs/testing-lab/` | Maintained alongside the testing lab UI |

When you add or move a doc:

1. Add an entry to `docs/README.md` if it's intended to be found by anyone other than the original author.
2. Update any `// Spec: docs/<path>` comments in TypeScript that reference its path.
3. Update markdown cross-links (run `grep -rln "<filename>" .` first).
4. Never delete a planning doc directly — move it to `docs/planning/obsolete/` and let it sit one PR cycle.

## How to run things

```bash
# Install
npm install
cd worker && npm install && cd ..

# Type-check, lint, tests (root)
npm run type-check
npm run lint
npm test

# Worker tests
cd worker && npm test

# Dev server
npm run dev          # Next.js on :3000
cd worker && npm run dev   # worker on its own port (see worker/README)
```

Pre-existing failures that are not your fault: at the time of writing, `__tests__/recon/phase16-worker-sync.test.ts` and `__tests__/recon/site-health-monitor.test.ts` have failures unrelated to this PR (one needs a real Supabase mock; the other requires Playwright browser binaries not installed in CI).

## Dependency policy (pin to root versions)

The repo currently has two `package.json` files with some drift between them. Until a dedicated dependency-cleanup PR resolves the drift, **all new code should pin to the versions used in the root `package.json`** when both root and `worker/` use the same dependency. Documented drift items as of April 2026 (see `docs/platform/RECON_INVENTORY.md §9`):

| Dependency | Root | Worker | Plan |
|------------|------|--------|------|
| `stripe` | v14 | v17 | Resolve in dedicated PR (v14→v17 has webhook breaking changes) |
| `zod` | v4 | v3 | Bring worker up to v4 in dedicated PR |
| `@types/node` | v22 | v20 | Align in dedicated PR |
| `playwright` | 1.58.2 | 1.58.2 | Already aligned in Phase 0 |

A GitHub issue tracks the drift fix as a dedicated future PR. Do not bump these in unrelated PRs.

## Adding new dependencies

Before adding any new dependency:

1. Check whether the functionality already exists somewhere in the repo (`grep` first).
2. Check the GitHub Advisory Database for known vulnerabilities at the version you intend to pin.
3. Pin an exact major (or, where the ecosystem prefers it, an exact minor) — no floating `^` for security-sensitive packages.
4. Document why the dependency is needed in the PR description.

## Pull request hygiene

- Every change should be reversible in a single revert.
- Run the full test suite (worker + root) after every mechanical change; do not batch unrelated changes.
- Move-don't-delete for any doc whose value isn't clearly zero.
- If a class is referenced anywhere in TSX/JSX/CSS, keep it. Cleanup means removing **unused** styles, not stripping working ones.
- Reference the design mockups (intake form + active research view) as the source of truth for those two specific UI screens when building them.
- When in doubt, ask before guessing.

## Phase 0.5 cleanup PR (April 2026)

This PR established the docs/planning structure, moved design assets out of `public/`, fixed the admin CSS perf bug (route-specific CSS no longer eagerly loaded on every admin page), and locked the naming above. See the PR description for the full list of doc moves. Items intentionally not done in this PR:

- No class deletions (CSS dead-code report only — `docs/planning/in-progress/CSS_CLEANUP_REPORT.md`)
- No `globals.css` edits (Tailwind/CSS-var unification is a design-system decision)
- No `lib/research`/`lib/cad` rename
- No Browserbase / CapSolver / Hetzner / R2 wiring (still stubbed, accounts pending)
- No document graph schema changes
