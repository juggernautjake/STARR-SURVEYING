# TEXAS ROAD NAME VARIANT ENGINE

## Specification & Implementation Plan

### Starr Software — AI Property Research Pipeline

> **Purpose:** This document specifies a comprehensive address variant generation
> system that ensures ANY Texas address can be found in ANY county CAD system,
> regardless of how the user types it or how the county indexes it.

---

## 1. THE PROBLEM — PROVEN BY REAL TESTING

On March 3-4, 2026, we tested **50+ query formats** against Bell CAD's search API
for the address "3779 West FM 436, Belton, TX 76513".

### What FAILED (returned 0 results):

| Query Format | Result |
|---|---|
| `"3779" + "W FM 436"` | **0** |
| `"3779" + "WEST FM 436"` | **0** |
| `"3779" + "W FM RD 436"` | **0** |
| `"3779" + "W FARM TO MARKET 436"` | **0** |
| `"3779" + "W F M 436"` | **0** |
| `"3779" + "436"` | **0** |
| `"3779" + "W 436"` | **0** |
| `"3779" + "W HWY 436"` | **0** |
| `"3779" + "FARM MARKET 436"` | **0** |
| `"3779" + "FM HWY 436"` | **0** |

### What SUCCEEDED:

| Query Format | Result |
|---|---|
| `"3779" + "FM 436"` | **1 result — Property ID 498826, STARR SURVEYING** |

**The only format that works is the exact way Bell CAD indexes it: `"FM 436"`
with no directional prefix, no "RD" suffix, no spelled-out version.**

### Root Cause:

- The **Census geocoder** returns `streetName: "436"` with `preDirection: "W"`
  and `preQualifier: "FM"` as separate components. Naive reconstruction produces
  "W FM 436" — which fails.
- The **Nominatim geocoder** returns "Farm-to-Market Road 436" — which also
  fails if not converted to "FM 436".

---

## 2. THE FIX — IMPLEMENTED

### Files Modified:

1. **`worker/src/services/address-utils.ts`** (pipeline path):
   - `geocodeCensus()` now returns `preQualifier` and `preType` fields
   - Census path in `normalizeAddress()` recombines `preQualifier` + `streetName`
     (e.g., "FM" + "436" → "FM 436")
   - `generateVariants()` enhanced with comprehensive TX road variant generation
     (20+ variants per road type, with directional stripping)

2. **`worker/src/services/address-normalizer.ts`** (discovery engine path):
   - Added `detectTexasRoad()` — detects FM/SH/CR/etc. from any input format
   - Added `stripDirectionalFromTxRoad()` — "W FM 436" → "FM 436"
   - Added `convertNominatimRoad()` — "Farm-to-Market Road 436" → "FM 436"
   - `generateAddressVariants()` rewritten with 8-tier priority system:
     Tier 1: Canonical no-dir (FM 436) — proven to work
     Tier 2: With directional (W FM 436)
     Tier 3: CAD variations (FM RD, FM ROAD, etc.)
     Tier 4: Dotted/spaced (F.M., F M)
     Tier 5: Directional + variation combos
     Tier 6: Trailing directional (FM 436 W)
     Tier 7: HWY fallback
     Tier 8: Bare route number (436)
   - `geocodeAddress()` now reconstructs street name from Census components
     and converts Nominatim long-form names

---

## 3. TEXAS ROAD TYPE TAXONOMY

| TxDOT Code | Full Name | Common Abbreviations |
|---|---|---|
| **FM** | Farm-to-Market Road | FM, F.M., F M, Farm Rd |
| **RM** | Ranch-to-Market Road | RM, R.M., Ranch Rd |
| **RR** | Ranch Road | RR, R.R., Ranch Rd |
| **SH** | State Highway | SH, S.H., State Hwy |
| **US** | US Highway | US, U.S., US Hwy |
| **IH** | Interstate Highway | IH, I.H., I-NN |
| **CR** | County Road | CR, C.R., Co Rd |
| **PR** | Park Road | PR, Park Rd |
| **SPUR** | State Spur | SPUR, SP |
| **LOOP** | State Loop | LOOP, LP |
| **BUS** | Business Route | BUS, Business |
| **HWY** | Highway | HWY, Highway |

---

## 4. VARIANT GENERATION RULES

### For Texas Designated Roads (e.g., "3779 W FM 436"):

| Priority | Street Name | Why |
|---|---|---|
| 1 | `FM 436` | Directional stripped — proven to work |
| 2 | `W FM 436` | With directional — some CADs keep it |
| 3 | `FM RD 436` | Some CADs add "RD" |
| 4 | `FM ROAD 436` | Full "ROAD" suffix |
| 5 | `FARM TO MARKET 436` | Spelled out |
| 6 | `FARM TO MARKET ROAD 436` | Spelled out with ROAD |
| 7 | `F.M. 436` | Dotted abbreviation |
| 8 | `F M 436` | Spaced abbreviation |
| 9 | `W FM RD 436` | Directional + RD |
| 10 | `WEST FM 436` | Spelled-out directional |
| 11 | `FM 436 W` | Trailing directional |
| 12 | `HWY 436` | Highway fallback |
| 13 | `436` | Bare route number (desperation) |

### For Standard Streets (e.g., "2913 Oakdale Dr"):

| Priority | Street Name | Why |
|---|---|---|
| 1 | `OAKDALE DR` | As entered |
| 2 | `OAKDALE` | Without suffix |
| 3 | `OAKDALE DRIVE` | Full suffix |

### For Directional Streets (e.g., "123 N Main St"):

| Priority | Street Name | Why |
|---|---|---|
| 1 | `N MAIN ST` | As entered |
| 2 | `MAIN ST` | Without directional |
| 3 | `NORTH MAIN ST` | Spelled-out directional |
| 4 | `N MAIN STREET` | Alternate suffix |
| 5 | `N MAIN` | Without suffix |

---

## 5. KNOWN PROPERTY IDS FOR TESTING

| Address | Property ID | Owner | County | Road Type |
|---|---|---|---|---|
| 3779 FM 436, Belton TX | 498826 | STARR SURVEYING | Bell | FM road |
| 3424 Waggoner Dr, Belton TX | 497446 | BARBER, JASON R & TRACY LEE | Bell | Standard |

---

## 6. PER-COUNTY QUIRKS REGISTRY

As testing expands, populate this registry with county-specific format preferences:

```typescript
const COUNTY_QUIRKS: Record<string, {
  fmFormat: 'FM NNN' | 'FM RD NNN' | 'FARM TO MARKET NNN' | 'HWY NNN';
  includesDirectional: boolean;
  includesStreetType: boolean;
  notes: string;
}> = {
  'Bell': {
    fmFormat: 'FM NNN',
    includesDirectional: false,
    includesStreetType: true,
    notes: 'HTTP API needs X-Requested-With header. Playwright requires fresh page per search.',
  },
};
```

---

*Starr Software / Starr Surveying Company — Belton, Texas — March 2026*
