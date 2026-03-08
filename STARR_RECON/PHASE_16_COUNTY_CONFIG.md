# Phase 16: County Configuration Registry & USPS Address Validation

**Starr Software — AI Property Research Pipeline Phase**

**Status:** ✅ COMPLETE v1.0 (April 2026)  
**Phase Duration:** Weeks 63–64  
**Depends On:** Phases 1–15  
**Maintained By:** Jacob, Starr Surveying Company, Belton, Texas (Bell County)

**Goal:** Eliminate hardcoded portal selectors and URL constants from purchase adapters, and add USPS-backed address normalization for rural Texas properties:
1. A centralized **County Configuration Registry** (`CountyConfigRegistry`) so per-county portal overrides can be managed without code changes
2. A **USPS Address Validation Client** (`USPSAddressClient`) to normalize rural Texas property addresses before feeding them to the research pipeline
3. A zero-dependency **Texas address normalizer** (`normalizeTexasAddress`) that handles FM roads, county roads, rural routes, and highway addresses without any network call
4. Supabase persistence layer (`county_portal_configs` table) for operator-managed configs
5. REST API for county config CRUD at `/api/admin/research/county-config`

---

## Problem Statement

> Phase 15 completed all purchase adapters, but every adapter contains hardcoded CSS selectors and portal URLs. When a county portal upgrades its UI (a common occurrence with Tyler/Odyssey updates), selectors must be patched in code and redeployed. Phase 16 decouples configuration from code: selectors and URL overrides live in the `CountyConfigRegistry`, can be overridden from a JSON file at runtime, and are persisted in Supabase for operator management.
>
> Additionally, rural Texas addresses (FM roads, county roads, rural routes) are not standardized, causing geocoding failures and missed CAD lookups. The `USPSAddressClient` and `normalizeTexasAddress` utility fix this in Stage 1A of the pipeline.

---

## Architecture: Phase 16 Additions

```
PHASE 15 (purchase adapters)              PHASE 16 (configuration & address)
───────────────────────────────────────   ───────────────────────────────────────
TylerPayAdapter (hardcoded selectors)  →  CountyConfigRegistry.get('48113', 'tyler_pay')
HenschenPayAdapter                     →  Merged platform defaults + county overrides
IDocketPayAdapter                      →  JSON file override at runtime (no redeploy)
FidlarPayAdapter                       →  Supabase persistence via county_portal_configs
GovOSGuestAdapter                      →
                                       →  USPSAddressClient.verify(address)
Stage 1A: parseAddress()               →  USPSAddressClient.verifyBatch(addresses[])
                                       →  normalizeTexasAddress('FM 123 RD, Belton, TX')
                                       →  /api/admin/research/county-config (CRUD)
                                       →  county_portal_configs (Supabase table)
```

---

## What Was Built

### v1.0 (April 2026)

| Module | File | Purpose |
|--------|------|---------|
| County Config Registry | `worker/src/infra/county-config-registry.ts` | Per-county portal config: URLs, selectors, rate limits, credential env prefix |
| USPS Address Client | `worker/src/services/usps-address-client.ts` | USPS Web Tools API integration + Texas rural address normalizer |
| DB Schema | `seeds/094_phase16_county_config.sql` | `county_portal_configs` table, indexes, RLS, triggers |
| Admin API | `app/api/admin/research/county-config/route.ts` | GET / POST / DELETE for county config management |
| Tests | `__tests__/recon/phase16-county-config.test.ts` | 55 unit tests |

---

## County Configuration Registry Details

### CountyConfigRegistry (`county-config-registry.ts`)

**Pattern:** Singleton registry (exported as `countyConfigRegistry`) backed by an in-memory `Map`. Keyed by `{countyFIPS}::{platform}`.

**Lookup:** `get(fips, platform?)` — returns merged platform defaults + county-specific override.

**Merge logic:** `merge(base, override)` — shallow-merges `selectors` and `extraHeaders` so individual selector overrides don't erase platform defaults.

**File override:** `loadFromFile(path)` — reads a JSON array of `CountyPortalConfig` entries and upserts them into the registry. Operators can drop a file on the server without redeployment.

**Validation:** `validate(config)` — checks that all required selectors for the given platform are present.

```typescript
const config = countyConfigRegistry.get('48113', 'tyler_pay');
// Returns: { countyFIPS: '48113', countyName: 'Dallas', platform: 'tyler_pay',
//            baseUrl: 'https://dallas.tylerpay.com', selectors: { ... merged ... }, ... }

const merged = countyConfigRegistry.merge(
  countyConfigRegistry.getPlatformDefaults('tyler_pay'),
  { selectors: { searchInput: '#NewSearchBox' } },
);
// Platform defaults preserved; only searchInput overridden
```

### Default Counties (10)

| FIPS | County | Platform | Notes |
|------|--------|----------|-------|
| 48027 | Bell | henschen_pay | Belton — HQ county |
| 48113 | Dallas | tyler_pay | Largest TX county by population |
| 48439 | Tarrant | tyler_pay | Fort Worth metro |
| 48201 | Harris | tyler_pay | Houston |
| 48029 | Bexar | kofile | San Antonio — GovOS/Kofile portal |
| 48085 | Collin | tyler_pay | Plano/McKinney |
| 48121 | Denton | tyler_pay | Denton |
| 48157 | Fort Bend | tyler_pay | Sugar Land |
| 48491 | Williamson | henschen_pay | Georgetown/Round Rock |
| 48453 | Travis | henschen_pay | Austin |

---

## USPS Address Client Details

### USPSAddressClient (`usps-address-client.ts`)

**API:** USPS Web Tools `AddressValidate` endpoint (`secure.shippingapis.com`).  
**Auth:** `USPS_USER_ID` environment variable.  
**Batch limit:** 5 addresses per USPS API constraint (`verifyBatch()`).  
**Fallback:** When `USPS_USER_ID` is absent, `isConfigured = false` and all methods return graceful no-op results.

```typescript
const client = new USPSAddressClient();
if (client.isConfigured) {
  const result = await client.verify({
    address1: 'FM 2305 RD', city: 'Belton', state: 'TX', zip: '76513',
  });
  // result.address1: 'FM 2305 Rd'
  // result.isDeliverable: true
  // result.dpvConfirmation: 'Y'
}
```

### normalizeTexasAddress (zero-dependency)

Handles common rural Texas patterns without network calls:

| Input | Output (`address1`) |
|-------|---------------------|
| `FM 123 RD` | `FM 123 Rd` |
| `CR 456` | `County Road 456` |
| `RR 1 BOX 123` | `RR 1 Box 123` |
| `HWY 190` | `Highway 190` |
| `IH 35` | `IH-35` |
| `SH 21` | `SH 21` |

```typescript
const result = normalizeTexasAddress('FM 2305 RD, Belton, TX 76513');
// { address1: 'FM 2305 Rd', city: 'Belton, TX 76513', state: 'TX',
//   isRuralRoute: false, isHighwayAddress: false }
```

---

## Database Schema

### `county_portal_configs`

```sql
CREATE TABLE county_portal_configs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  county_fips  text NOT NULL,
  county_name  text NOT NULL,
  platform     text NOT NULL CHECK (platform IN ('tyler_pay', 'henschen_pay', ...)),
  config       jsonb NOT NULL DEFAULT '{}',
  is_active    boolean NOT NULL DEFAULT true,
  notes        text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (county_fips, platform)
);
```

**RLS:** Authenticated users may SELECT active configs. Service role has full access.

---

## API Routes

### `GET /api/admin/research/county-config`
Query params: `platform`, `countyFips`, `activeOnly` (default: true)

### `POST /api/admin/research/county-config`
Body: `{ countyFips, countyName, platform, config?, notes? }`  
Upserts on `(county_fips, platform)` conflict.

### `DELETE /api/admin/research/county-config?countyFips=48113&platform=tyler_pay`
Soft-deletes by setting `is_active = false`.

---

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `CountyConfigRegistry` instantiates with 10 default county configs | ✅ |
| 2 | `get(fips, platform)` returns correct config or null | ✅ |
| 3 | `set()` adds/replaces a config | ✅ |
| 4 | `merge()` deep-merges selectors without losing platform defaults | ✅ |
| 5 | `validate()` returns missingFields list for incomplete configs | ✅ |
| 6 | `loadFromFile()` / `saveToFile()` round-trip without data loss | ✅ |
| 7 | `USPSAddressClient.isConfigured` = false when `USPS_USER_ID` absent | ✅ |
| 8 | `verify()` returns graceful fallback when not configured | ✅ |
| 9 | `verifyBatch()` respects 5-address limit | ✅ |
| 10 | `normalizeTexasAddress()` handles FM, CR, RR, HWY patterns | ✅ |
| 11 | `county_portal_configs` table has RLS and indexes | ✅ |
| 12 | Admin API GET/POST/DELETE work with auth guard | ✅ |
| 13 | All 55 unit tests pass | ✅ |
