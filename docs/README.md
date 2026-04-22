# Starr Software Documentation Index

This is the top-level index for the Starr Software repository's documentation.
If you're trying to find a doc, start here.

## Folders

| Folder | What lives here |
|--------|------------------|
| [`platform/`](./platform/) | Cross-cutting platform specs that apply to every product (inventory, naming, closure tolerance, user roles, testing-lab guide). |
| [`product/`](./product/) | One file per product. Each file is the canonical, current spec for that product. |
| [`engine/`](./engine/) | Engine-subsystem specs (Texas road variants, geocoding, vision pipeline, …). Things that aren't a product on their own but are reused by multiple products. |
| [`style/`](./style/) | Visual design system, brand colors, typography, components, responsive breakpoints. |
| [`planning/`](./planning/) | Time-boxed planning docs (roadmaps, phase specs, prompts). See `planning/README.md` for the completed/in-progress/obsolete classification. |
| [`testing-lab/`](./testing-lab/) | User guide and county-adapter docs for the Testing Lab. |

## Top of the funnel — read these first

| Doc | Why |
|-----|-----|
| [`platform/STARR_SOFTWARE_SUITE.md`](./platform/STARR_SOFTWARE_SUITE.md) | The product family overview. Names, codenames, what's reserved, what ships in which tier. |
| [`platform/RECON_INVENTORY.md`](./platform/RECON_INVENTORY.md) | Single source of truth for the Starr Recon build. Everything else defers to this. |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Where new code goes, how to run tests, naming conventions. |
| [`../README.md`](../README.md) | Top-level project README and quickstart. |

## Products (live specs)

| Product | Doc | Status |
|---------|-----|--------|
| Starr Recon | [`platform/RECON_INVENTORY.md`](./platform/RECON_INVENTORY.md) (acts as both platform inventory and product spec for now) | In active build (Phase 0 shipped) |
| Starr Forge | [`planning/in-progress/STARR_CAD_PHASE_ROADMAP.md`](./planning/in-progress/STARR_CAD_PHASE_ROADMAP.md) + phase specs in [`planning/in-progress/STARR_CAD/`](./planning/in-progress/STARR_CAD/) | Specced, not yet built |
| Starr Archive | [`product/starr-archive.md`](./product/starr-archive.md) | Sketch only |
| Starr Compass | *reserved name — no spec yet* | Reserved |
| Starr Academy | *no dedicated spec doc; lives in `app/admin/learn/`* | Existing |
| Starr Ledger | *no dedicated spec doc; split across `app/admin/{jobs,payroll,hours-approval,…}/`* | Existing (rename pending — see `CONTRIBUTING.md`) |
| Starr Site | *no dedicated spec doc; lives in `app/` outside `app/admin/`* | Existing |

## Active engineering specs

| Spec | Doc |
|------|-----|
| Closure tolerance (3-tier TBPELS gate) | [`platform/CLOSURE_TOLERANCE.md`](./platform/CLOSURE_TOLERANCE.md) |
| User roles and access control | [`platform/USER_ROLES_AND_ACCESS_CONTROL.md`](./platform/USER_ROLES_AND_ACCESS_CONTROL.md) |
| Testing lab user guide | [`platform/TESTING_LAB_USER_GUIDE.md`](./platform/TESTING_LAB_USER_GUIDE.md) and [`testing-lab/`](./testing-lab/) |
| Texas road variant engine | [`engine/TEXAS_ROAD_VARIANT_ENGINE.md`](./engine/TEXAS_ROAD_VARIANT_ENGINE.md) |
| Style guide | [`style/STYLE_GUIDE.md`](./style/STYLE_GUIDE.md) |

## How to add a new doc

1. Decide which folder it belongs in (use the table above).
2. Add the file. Use the existing files in that folder as a structure template.
3. Add an entry to this index if the doc is intended to be found by anyone other than the original author.
4. If the doc is referenced from code, add a `// Spec: docs/<path>` comment in the relevant TypeScript file.
5. If the doc supersedes an older planning doc, move the old one to `planning/obsolete/` (do not delete) and link to the new doc from the obsolete one.
