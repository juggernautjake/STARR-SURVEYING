# County Adapter Development Guide

This guide covers how to build, test, and maintain county-specific adapters for the STARR RECON pipeline.

---

## What Are County Adapters?

Texas has 254 counties, and each county uses different systems for property records:

| System | Counties Using It | Adapter File |
|--------|-------------------|-------------|
| **BIS** | ~60 counties (Bell, Williamson, etc.) | `worker/src/adapters/bis-adapter.ts` |
| **TrueAutomation** | ~80 counties | `worker/src/adapters/trueautomation-adapter.ts` |
| **Tyler/Aumentum** | ~50 counties | `worker/src/adapters/tyler-adapter.ts` |
| **HCAD** | Harris County (Houston) | `worker/src/adapters/hcad-adapter.ts` |
| **TAD** | Tarrant County (Fort Worth) | `worker/src/adapters/tad-adapter.ts` |
| **Kofile** | ~80 counties (clerk records) | `worker/src/adapters/kofile-clerk-adapter.ts` |
| **CountyFusion** | ~40 counties (clerk records) | `worker/src/adapters/countyfusion-adapter.ts` |
| **Tyler/Odyssey** | ~20 counties (clerk records) | `worker/src/adapters/tyler-clerk-adapter.ts` |
| **Generic** | Fallback for unlisted counties | `worker/src/adapters/generic-cad-adapter.ts` |

### CAD Adapters vs Clerk Adapters

- **CAD adapters** search **County Appraisal District** (CAD) websites for property ownership, legal description, and tax assessment data
- **Clerk adapters** search **County Clerk** recording systems for deeds, plats, easements, and liens

Each county typically has one CAD system and one clerk system, but they may be from different vendors.

---

## When to Build a New Adapter

You need a new adapter when:
1. A county uses a system that none of the existing adapters handle
2. A county's website has unique quirks that the generic adapter can't handle
3. A county updates their website and breaks the existing adapter
4. You want to improve data extraction quality for a specific county

---

## Adapter Architecture

### CAD Adapter Interface

Every CAD adapter extends the base `CadAdapter` class:

```typescript
// worker/src/adapters/cad-adapter.ts (base class)
export abstract class CadAdapter {
  abstract search(query: PropertyQuery): Promise<PropertyDetail[]>;
  abstract getVendorName(): string;
  abstract getSupportedCounties(): string[];
}
```

### Clerk Adapter Interface

Every clerk adapter extends the base `ClerkAdapter` class:

```typescript
// worker/src/adapters/clerk-adapter.ts (base class)
export abstract class ClerkAdapter {
  abstract search(query: ClerkQuery): Promise<DocumentRecord[]>;
  abstract getVendorName(): string;
  abstract getSupportedCounties(): string[];
}
```

### Key Files to Understand

| File | Purpose |
|------|---------|
| `worker/src/services/cad-registry.ts` | Maps county FIPS codes to CAD adapter classes |
| `worker/src/adapters/clerk-registry.ts` | Maps county FIPS codes to clerk adapter classes |
| `worker/src/lib/county-fips.ts` | FIPS code lookup table for all 254 Texas counties |
| `worker/src/types/county-adapter.ts` | TypeScript interfaces for adapters |
| `worker/src/types/property-discovery.ts` | PropertyQuery, PropertyDetail types |
| `worker/src/types/document-harvest.ts` | ClerkQuery, DocumentRecord types |

---

## Building a New CAD Adapter — Step by Step

### Example: Adding Bexar County (San Antonio)

#### 1. Create Branch
- In the Testing Lab, create branch: `feat/bexar-county-cad`

#### 2. Research the County Website
Before writing code, manually visit the county's CAD website:
- **URL:** Find the Bexar County Appraisal District website
- **Search interface:** How do you search for a property? By address? By owner? By property ID?
- **Results page:** What data is shown? Property ID, owner, legal description, acreage?
- **Page structure:** What HTML elements contain the data? Use browser DevTools (F12) to inspect

#### 3. Create the Adapter File
In the Testing Lab Code tab:
- Navigate to `worker/src/adapters/`
- You'll need to create the file on GitHub first (the Code tab can't create new files yet)
- Or copy an existing adapter and modify it

#### 4. Implement the Search Method

```typescript
// worker/src/adapters/bexar-cad-adapter.ts
import { CadAdapter } from './cad-adapter.js';
import type { PropertyQuery, PropertyDetail } from '../types/property-discovery.js';

export class BexarCadAdapter extends CadAdapter {
  getVendorName(): string { return 'BCAD'; }
  getSupportedCounties(): string[] { return ['Bexar']; }

  async search(query: PropertyQuery): Promise<PropertyDetail[]> {
    // 1. Navigate to the search page
    // 2. Fill in the search form
    // 3. Submit and wait for results
    // 4. Parse the results page
    // 5. Return structured PropertyDetail objects
  }
}
```

#### 5. Register in the CAD Registry
Edit `worker/src/services/cad-registry.ts` to add the new adapter:

```typescript
import { BexarCadAdapter } from '../adapters/bexar-cad-adapter.js';

// In the registry map:
'048029': new BexarCadAdapter(),  // Bexar County FIPS code
```

#### 6. Save & Deploy
Click **Save & Deploy** for each file you changed.

#### 7. Test
- In Property Context, enter a Bexar County address:
  - Address: `100 Dolorosa St, San Antonio, TX 78205`
  - County: `Bexar`
  - State: `TX`
- Go to Scrapers tab → CAD Scraper → Run
- Check the results for: property ID, owner, legal description, acreage

#### 8. Iterate
If the scraper fails or returns incomplete data:
1. Check the error in the debugger
2. Edit the adapter code
3. Save & Deploy
4. Re-test

#### 9. Test the Full Pipeline
Once the scraper works, run the full pipeline with the Bexar County address to make sure all phases handle the data correctly.

#### 10. Merge
Create a PR: "Add Bexar County CAD adapter (BCAD)"

---

## Testing Strategies for County Adapters

### Strategy 1: Known-Good Properties

For each county adapter, maintain a list of properties that are known to work:

| County | Address | Property ID | Owner | Expected Results |
|--------|---------|-------------|-------|-----------------|
| Bell | 3779 FM 436 | R12345 | Known owner | Should find property + legal desc |
| Harris | 1000 Main St, Houston | 042271... | Known owner | Should find HCAD record |

### Strategy 2: Edge Cases

Test these scenarios for every adapter:
- **Rural property** (no subdivision, no lot/block)
- **Multi-owner property** (trust, LLC, multiple individuals)
- **Recently sold property** (new owner may not be in all systems yet)
- **Vacant land** (no improvements, different search behavior)
- **Condo/apartment** (unit numbers, shared boundaries)

### Strategy 3: Error Recovery

Test what happens when:
- **Address not found** — does the adapter return empty results gracefully?
- **Multiple matches** — does it handle disambiguation?
- **Website is slow** — does the timeout work correctly?
- **Website is down** — does it fail gracefully with a clear error?

### Strategy 4: Data Quality

For each result, verify:
- **Property ID format** — matches the county's format
- **Owner name** — correctly parsed (Last, First vs First Last)
- **Legal description** — complete (lot, block, subdivision, or metes and bounds)
- **Acreage** — reasonable number (not 0, not negative, not millions)
- **Address** — matches what was searched

---

## Maintaining Existing Adapters

### When Counties Update Their Websites

Counties periodically update their CAD and clerk websites. Common changes:
- **CSS class names change** → update selectors in the adapter
- **URL structure changes** → update the base URL and search endpoint
- **Form fields change** → update the form fill logic
- **New CAPTCHA added** → may need to implement CAPTCHA handling
- **API version changes** → update request format and response parsing

### How to Detect Breakage

1. **Automated monitoring** (future feature) — the system will periodically test known properties and alert when results change
2. **User reports** — research analysts notice missing or incorrect data
3. **Pipeline failures** — the full pipeline fails at Phase 1 (discovery) or Phase 2 (harvest)
4. **Testing Lab** — run the scraper and see if it returns data

### Debugging a Broken Adapter

1. **Run the scraper** in the Testing Lab with a known-good property
2. **Check the error** — is it a timeout, a selector error, or a data parsing error?
3. **Visit the county website manually** — has the layout changed?
4. **Compare selectors** — open DevTools, find the new selectors, update the adapter
5. **Save & Deploy** — test immediately
6. **Verify with multiple properties** — make sure the fix works for different addresses

---

## County-Specific Implementations

For counties that need more than just a CAD/clerk adapter, use the `worker/src/counties/` directory.

### Example: Bell County

```
worker/src/counties/bell/
├── types/
│   ├── index.ts                 — Type exports
│   └── research-result.ts       — BellCountyResearchResult interface
├── scrapers/
│   ├── cad-scraper.ts           — Bell CAD-specific scraping
│   ├── clerk-scraper.ts         — Bell Clerk-specific scraping
│   ├── plat-scraper.ts          — Bell plat download
│   ├── fema-scraper.ts          — FEMA flood zone lookup
│   └── txdot-scraper.ts         — TxDOT right-of-way lookup
└── bell-research.ts             — Orchestrates all Bell County scrapers
```

This structure is used when a county needs:
- Custom scraping logic beyond what the standard adapter provides
- County-specific data formats
- Integration with county-specific APIs
- Custom post-processing of scraped data

---

## Resources

- **STARR RECON Phase Roadmap:** `docs/planning/completed/STARR_RECON/STARR_RECON_PHASE_ROADMAP.md` — complete pipeline specification
- **Phase 1 Spec:** `docs/planning/in-progress/STARR_RECON/PHASE_01_DISCOVERY.md` — discovery engine details
- **Phase 2 Spec:** `docs/planning/in-progress/STARR_RECON/PHASE_02_DOCUMENT_HARVEST.md` — harvesting details
- **County FIPS Codes:** `worker/src/lib/county-fips.ts` — all 254 Texas counties
- **CAD Registry:** `worker/src/services/cad-registry.ts` — which adapter handles which county
