# Starr Software — Product Suite & Naming

**Last Updated:** April 2026
**Owner:** Jacob

---

## 1. Companies

| Company | Role |
|---|---|
| **Starr Surveying Company** | The licensed surveying firm in Belton, Texas. Performs surveys for clients. Existing entity. |
| **Starr Software** (forthcoming) | The software company. Builds and sells the Starr Software Suite. Related to but separate from Starr Surveying. Starr Surveying will be customer #1 of Starr Software, and the dogfooding feedback loop is the unfair advantage. |

The two should share branding (Starr family wordmark, color palette) but have distinct legal and financial operations. Starr Software's first product is what surveyors actually use; Starr Surveying remains the field operation.

---

## 2. Product Suite — Naming Conventions

All product names start with **Starr** to anchor the brand. Each product has a one-word codename that evokes its function. The internal repo namespace and the public-facing name are now identical to avoid the constant translation step (decided April 2026 — replaced earlier draft where the public name was "Starr Compass").

### Canonical names

| Codename / Public name | Status | What it does |
|---|---|---|
| **Starr Recon** (`STARR_RECON/` in repo) | In active build | AI property research and analysis pipeline. Takes any Texas address, autonomously researches the property + adjoiners across CAD/clerk/TxDOT/FEMA/GLO/TCEQ/RRC/NRCS, cross-validates boundaries, produces confidence-scored research report with CAD-ready exports. |
| **Starr Forge** (`STARR_CAD/` in repo) | Planned (specs in `STARR_CAD_PHASE_*.md`) | AI-assisted CAD drafting tailored to surveyors. Imports Starr Recon output, drafts the plat, exports DXF/PDF for stamping. |
| **Starr Archive** (`STARR_ARCHIVE/` in repo) | Sketched (`docs/STARR_ARCHIVE_INTAKE.md`) | Intake + indexing system for the existing Starr filing-cabinet / PC / flash-drive archive. Feeds digitized historical jobs back into the Starr Recon regression set and serves as a long-term records system. |
| **Starr Orbit** (`STARR_FIELD/` in repo) | Planned | Field-data-collector companion app + sync layer. Talks to Trimble TSC7, Carlson, Leica. Pushes survey jobs to the device, pulls back observations. |
| **Starr Academy** (`STARR_LMS/` in repo) | Existing in repo | Learning management for surveyor/CST training. Already built into the Next.js admin portal. |
| **Starr Ledger** (`STARR_JOBS/` in repo) | Existing in repo | Job tracking, leads, hours, payroll. Already built into the Next.js admin portal. |
| **Starr Site** (`STARR_PUBLIC/` in repo) | Existing in repo | Public marketing website + intake forms. Already built. |

### Reserved names (no product yet — reserved so we don't have to retrofit)

| Reserved name | Likely use |
|---|---|
| **Starr Compass** | TBD. Originally proposed as the public name for the research product but reserved instead for a future product whose function reads as "navigation / orientation" rather than "search / analyze." Candidates: a county-portal status dashboard, a multi-tract project navigator, or a workflow-orchestration product. **Do not use as a synonym for Starr Recon in any new doc, code, comment, or marketing copy.** |
| **Starr Atlas** | Mapping / GIS frontend. |
| **Starr Vault** | Signed final-deliverable storage (separate from Starr Archive, which is intake/working-store). |
| **Starr Co-Pilot** | General AI assistant. |

### Naming rules going forward

1. **Single, evocative one-word public name** prefixed with "Starr". Avoid acronym soup in customer-facing copy.
2. **Codename = public name = repo namespace.** No separate "internal vs public" name pair (this was the rule until April 2026 — we collapsed it because it produced naming drift in every doc).
3. **Codename mirrors function** (Recon = research/analysis, Forge = creation, Archive = records, Orbit = remote/field, Academy = teaching, Ledger = tracking, Site = public face).
4. **Reserve adjacent codenames** so we don't have to retrofit later (see "Reserved names" table above).
5. **Versioning:** product version = independent semver per product (Starr Recon 1.0, Starr Forge 0.5, etc.). Suite version is the release year (Starr Software 2026 release, 2027 release).

### Legacy doc reference

The `STARR_RECON/PHASE_*.md` planning docs (pre-Phase 0) still contain the phrase "Starr Compass" — those are pre-migration history per `docs/RECON_INVENTORY.md §1` and are intentionally not retroactively rewritten. New docs and user-visible strings use **Starr Recon** only.

### Pricing tiers (inherited from earlier planning, applies to Starr Recon for now)

| Tier | Price | Audience |
|---|---|---|
| Surveyor Pro | $99/mo | Solo licensed surveyor |
| Firm Unlimited | $299/mo | Firm with multiple seats |
| Per-report | $29–$149 | Pay-as-you-go without subscription |
| Document pass-through | actual cost + small markup | Always passed through, never marked up materially |

---

## 3. Where to Update Naming Going Forward

When introducing a new product or renaming an existing one:

- Add a row to the table in §2
- Reserve the codename in this doc
- If the product needs its own repo, name it `starr-<codename-lowercase>` (e.g. `starr-forge`, `starr-orbit`)
- If it lives in this monorepo, put it under `STARR_<CODENAME>/` for docs and `worker/src/<codename>/` or `app/admin/<codename>/` for code

---

## 4. Open Naming Questions

- ~~Final call between **Starr Compass** and **Starr Recon** as the public-facing name for the property research product.~~ **Resolved (April 2026): Starr Recon for the research product. Compass is reserved for a future product.**
- Whether **Starr Software** is a DBA of Starr Surveying or an independent LLC. Out of scope for engineering — product naming decisions don't depend on the answer.
