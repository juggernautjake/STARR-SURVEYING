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

All product names start with **Starr** to anchor the brand. Each product has a one-word codename that evokes its function. Internal/repo names use the codename in `STARR_SCREAMING_SNAKE` (e.g. `STARR_RECON`); public-facing names use `Starr Codename` (e.g. "Starr Compass").

### Canonical names

| Codename | Public name | Status | What it does |
|---|---|---|---|
| **STARR RECON** | **Starr Compass** | In active build | AI property research pipeline. Takes any Texas address, autonomously researches the property + adjoiners across CAD/clerk/TxDOT/FEMA/GLO/TCEQ/RRC/NRCS, cross-validates boundaries, produces confidence-scored research report with CAD-ready exports. |
| **STARR CAD** | **Starr Forge** | Planned (specs in `STARR_CAD_PHASE_*.md`) | AI-assisted CAD drafting tailored to surveyors. Imports RECON output, drafts the plat, exports DXF/PDF for stamping. |
| **STARR FIELD** | **Starr Orbit** | Planned | Field-data-collector companion app + sync layer. Talks to Trimble TSC7, Carlson, Leica. Pushes survey jobs to the device, pulls back observations. |
| **STARR LMS** | **Starr Academy** | Existing in repo | Learning management for surveyor/CST training. Already built into the Next.js admin portal. |
| **STARR JOBS** | **Starr Ledger** | Existing in repo | Job tracking, leads, hours, payroll. Already built into the Next.js admin portal. |
| **STARR PUBLIC** | **Starr Site** | Existing in repo | Public marketing website + intake forms. Already built. |

### Naming rules going forward

1. **Single, evocative one-word public name** prefixed with "Starr". Avoid acronym soup in customer-facing copy.
2. **Codename mirrors function** (Compass = navigation/research, Forge = creation, Orbit = remote/field, Academy = teaching, Ledger = tracking, Site = public face).
3. **Retire ambiguous names.** "STARR RECON" and "Starr Compass" both refer to the same product — pick one for each context. Use "Starr Compass" anywhere a customer or website visitor will see it; use "STARR RECON" only in code paths and engineering docs.
4. **Reserve the obvious adjacent codenames** so we don't have to retrofit later: `STARR ATLAS` (mapping/GIS frontend), `STARR ARCHIVE` (deed/document storage SaaS), `STARR VAULT` (signed final-deliverable storage), `STARR CO-PILOT` (general AI assistant).
5. **Versioning:** product version = independent semver per product (Starr Compass 1.0, Starr Forge 0.5, etc.). Suite version is the release year (Starr Software 2026 release, 2027 release).

### Pricing tiers (inherited from earlier planning, applies to Starr Compass for now)

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

- Final call between **Starr Compass** and **Starr RECON** as the public-facing name for the property research product. Both work. Compass is more polished; RECON has more "tactical / pro tool" energy. **Default for now: Starr Compass in marketing, STARR RECON in engineering.**
- Whether **Starr Software** is a DBA of Starr Surveying or an independent LLC. Out of scope for engineering — product naming decisions don't depend on the answer.
