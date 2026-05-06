# PHASE 9: Document Purchase & Automated Re-Analysis

**Starr Software — AI Property Research Pipeline**

| Field | Value |
|---|---|
| Phase Duration | Weeks 24–26 |
| Depends On | Phase 2 (ClerkAdapter), Phase 3 (AI Extraction), Phase 7 (Reconciliation), Phase 8 (Confidence Scoring) |
| Status | Implementation Complete v1.2 |

---

## Current State of the Codebase

**Phase Status: ✅ COMPLETE v1.2**

All Phase 9 code has been implemented and tested.

### v1.2 Changes (March 2026)

- **PipelineLogger** in `POST /research/purchase` route (`index.ts`): replaced all bare `console.log/error` calls with `PipelineLogger` — consistent with Phase 6/7/8 pattern
- **Removed unused `TxDOTRowResult` import** from `reanalysis.ts` — dead import eliminated
- **74 unit tests** (up from 62) in `__tests__/recon/phase9-purchase.test.ts` — 12 new tests added:
  - 61: WatermarkComparison — curve chordBearing no-op (no radius/arc → no curve comparison emitted)
  - 62: WatermarkComparison — curve radius AND arcLength changed simultaneously
  - 63: WatermarkComparison — bearingSimilar tolerates small-seconds differences (< 5°)
  - 64: BillingTracker — checkBudget allows purchase when remaining == proposed cost exactly
  - 65: BillingTracker — checkBudget rejects when remaining == 0
  - 66: BillingTracker — setBudget after partial spend correctly recalculates remaining
  - 67: DocumentPurchaseOrchestrator — no_purchases_needed preserves billing.remainingBalance
  - 68: WatermarkComparison — empty watermarked + empty official → zero comparisons
  - 69: WatermarkComparison — significantChanges contains only changed=true entries
  - 70: BillingTracker — multiple failed transactions do not accumulate totalSpent
  - 71: PurchaseOrchestratorConfig — no credentials (undefined) is a valid config shape
  - 72: Transaction math invariant — costPerPage × pages ≈ totalCost

### v1.1 Changes (March 2026)

- **PipelineLogger** replaces all bare `console.log/warn/error` calls in:
  - `billing-tracker.ts` — structured logging with `[Billing]` layer
  - `document-purchase-orchestrator.ts` — structured logging with `[Purchase]` layer
  - `kofile-purchase-adapter.ts` — structured logging with `[KofilePurchase]` layer
  - `texasfile-purchase-adapter.ts` — structured logging with `[TexasFile]` layer
- **AbortSignal.timeout(30_000)** added to AI fetch in `document-purchase-orchestrator.ts` to prevent hanging
- **JSON.parse try/catch** added to both AI response parsing and intelligence file reading in orchestrator
- **`projectId` empty-string guard** in `executePurchases` — uses `'unknown-project'` sentinel when empty
- **`rateLimit(5, 60_000)`** added to `POST /research/purchase` route
- **`rateLimit(60, 60_000)`** + **JSON.parse try/catch** added to `GET /research/purchase/:projectId` route
- **Corrupt billing file recovery**: `BillingTracker.loadProjectBilling()` wraps JSON.parse in try/catch and resets gracefully
- **62 unit tests** added in `__tests__/recon/phase9-purchase.test.ts` — all passing
- Adapters now accept optional `projectId` constructor argument for logger scoping

### Implemented Files

| File | Purpose | Status |
|------|---------|--------|
| `worker/src/services/document-purchase-orchestrator.ts` | `DocumentPurchaseOrchestrator` — Phase 9 top-level orchestrator | ✅ Complete |
| `worker/src/services/purchase-adapters/kofile-purchase-adapter.ts` | Kofile document purchase via Playwright | ✅ Complete |
| `worker/src/services/purchase-adapters/texasfile-purchase-adapter.ts` | TexasFile document purchase | ✅ Complete |
| `worker/src/services/billing-tracker.ts` | Purchase cost tracking and audit trail | ✅ Complete |
| `worker/src/services/watermark-comparison.ts` | Watermarked vs. official image quality comparison | ✅ Complete |
| `worker/src/services/reanalysis.ts` | Re-runs AI extraction on purchased (clean) documents | ✅ Complete |
| `worker/src/types/purchase.ts` | Phase 9 TypeScript types (`PurchaseReport`, `PurchaseRecord`, etc.) | ✅ Complete |
| `worker/purchase.sh` | CLI wrapper for Phase 9 | ✅ Complete |
| `__tests__/recon/phase9-purchase.test.ts` | 74 unit tests for Phase 9 pure-logic components | ✅ Complete |

### API Endpoint

`POST /research/purchase` and `GET /research/purchase/:projectId` — live in `worker/src/index.ts`

---

Phase 8 identified which documents to purchase and projected the confidence improvement. Phase 9 executes those purchases and validates the projections.

**Goal:** Take Phase 8's purchase recommendations, automatically purchase official unwatermarked documents from TexasFile and county clerk systems, then re-run the AI extraction pipeline on clean images. Compare watermarked vs unwatermarked readings, resolve all watermark-induced ambiguities, and produce an updated reconciled model with significantly higher confidence scores. Integrate a payment and billing system that tracks per-project document costs.

**Deliverable:** A `DocumentPurchaseOrchestrator` that purchases recommended documents, re-extracts data from clean images, and produces an updated `ReconciledBoundaryModel` with improved confidence.

### API Endpoint

```bash
curl -X POST http://localhost:3100/research/purchase \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d '{
    "projectId": "ash-trust-001",
    "confidenceReportPath": "/tmp/analysis/ash-trust-001/confidence_report.json",
    "budget": 25.00,
    "autoReanalyze": true,
    "paymentMethod": "account_balance"
  }'
```

Returns HTTP 202 immediately. Results persisted to:
- `/tmp/analysis/{projectId}/purchase_report.json`
- `/tmp/analysis/{projectId}/reconciled_boundary_v2.json` (if re-analysis triggered)
- `/tmp/billing/{projectId}_invoice.json`

### Example Purchase Report

```json
{
  "status": "complete",
  "projectId": "ash-trust-001",
  "purchases": [
    {
      "instrument": "2023032044",
      "documentType": "plat",
      "source": "kofile:bellcountytx.publicsearch.us",
      "status": "purchased",
      "pages": 2,
      "costPerPage": 1.00,
      "totalCost": 2.00,
      "paymentMethod": "account_balance",
      "transactionId": "TXN-20260304-2023032044",
      "downloadedImages": [
        "/tmp/purchased/ash-trust-001/plat_2023032044_p1_official.tiff",
        "/tmp/purchased/ash-trust-001/plat_2023032044_p2_official.tiff"
      ],
      "imageQuality": {
        "format": "TIFF",
        "resolution": "300dpi",
        "dimensions": { "width": 3400, "height": 4400 },
        "hasWatermark": false,
        "qualityScore": 95
      }
    },
    {
      "instrument": "199800234",
      "documentType": "deed",
      "source": "kofile:bellcountytx.publicsearch.us",
      "status": "purchased",
      "pages": 4,
      "costPerPage": 1.00,
      "totalCost": 4.00,
      "paymentMethod": "account_balance",
      "transactionId": "TXN-20260304-199800234",
      "downloadedImages": [
        "/tmp/purchased/ash-trust-001/deed_199800234_p1_official.tiff",
        "/tmp/purchased/ash-trust-001/deed_199800234_p2_official.tiff",
        "/tmp/purchased/ash-trust-001/deed_199800234_p3_official.tiff",
        "/tmp/purchased/ash-trust-001/deed_199800234_p4_official.tiff"
      ],
      "imageQuality": {
        "format": "TIFF",
        "resolution": "300dpi",
        "hasWatermark": false,
        "qualityScore": 92
      }
    }
  ],
  "reanalysis": {
    "status": "complete",
    "documentReanalyses": [
      {
        "documentType": "plat",
        "instrument": "2023032044",
        "totalCallsExtracted": 14,
        "callsChanged": 2,
        "callsConfirmed": 12,
        "averageConfidenceGain": 28,
        "improvements": [
          {
            "callId": "PERIM_W3",
            "field": "bearing",
            "watermarkedValue": "S 04°37'58\" E",
            "officialValue": "S 04°39'12\" E",
            "changed": true,
            "watermarkedConfidence": 42,
            "officialConfidence": 97,
            "confidenceGain": 55,
            "notes": "Watermark was obscuring '39' making it appear as '37'."
          }
        ]
      }
    ],
    "discrepanciesResolved": [
      {
        "discrepancyId": "DISC-001",
        "previousStatus": "unresolved",
        "newStatus": "resolved",
        "resolution": "Watermark obscured bearing digit. Official shows S 04°39'12\" E.",
        "previousConfidence": 42,
        "newConfidence": 96
      }
    ]
  },
  "updatedReconciliation": {
    "previousOverallConfidence": 78,
    "newOverallConfidence": 93,
    "confidenceGain": 15,
    "previousClosureRatio": "1:69103",
    "newClosureRatio": "1:98450",
    "closureImproved": true,
    "allDiscrepanciesResolved": true,
    "savedTo": "/tmp/analysis/ash-trust-001/reconciled_boundary_v2.json"
  },
  "billing": {
    "totalDocumentCost": 6.00,
    "taxOrFees": 0.00,
    "totalCharged": 6.00,
    "paymentMethod": "account_balance",
    "remainingBalance": 19.00,
    "invoicePath": "/tmp/billing/ash-trust-001_invoice.json"
  },
  "timing": {
    "totalMs": 185000,
    "purchaseMs": 45000,
    "downloadMs": 30000,
    "reanalysisMs": 110000
  },
  "aiCalls": 2,
  "errors": []
}
```

---

## 9.2 Architecture Overview

```
INPUT: ConfidenceReport (with purchase recommendations) + Budget
  │
  ├── STEP 1: PURCHASE PLANNING
  │   ├── Sort recommendations by ROI (from Phase 8)
  │   ├── Filter by budget constraint
  │   ├── Check if documents are available online for purchase
  │   ├── Group by source system (batch purchases when possible)
  │   └── Build purchase queue
  │
  ├── STEP 2: DOCUMENT PROCUREMENT
  │   ├── VENDOR A: Kofile / PublicSearch (~80 TX counties)
  │   │   ├── Navigate to document by instrument number
  │   │   ├── Add to cart, proceed to checkout
  │   │   ├── Enter payment credentials
  │   │   ├── Download official TIFF/PDF images
  │   │   └── Verify: no watermark present
  │   │
  │   ├── VENDOR B: TexasFile (statewide aggregator)
  │   │   ├── Search by county + instrument
  │   │   ├── Pay-per-page or subscription access
  │   │   ├── Download official images
  │   │   └── Verify image quality
  │   │
  │   ├── VENDOR C: County Clerk Direct (walk-in/phone orders)
  │   │   ├── Generate order form
  │   │   ├── Track manual order status
  │   │   └── Receive and ingest when available
  │   │
  │   └── VENDOR D: TxDOT ROW Records (free)
  │       ├── Download from Texas Digital Archive
  │       └── No payment needed
  │
  ├── STEP 3: IMAGE QUALITY VERIFICATION
  │   ├── Verify no watermark present
  │   ├── Check resolution (≥200dpi for OCR)
  │   ├── Check dimensions (full page captured)
  │   ├── Convert TIFF → PNG if needed for AI processing
  │   └── Flag any quality issues
  │
  ├── STEP 4: RE-EXTRACTION (AI)
  │   ├── Run Phase 3 extraction pipeline on official images
  │   ├── Use SAME prompts — only input images change
  │   ├── Compare watermarked vs official readings call-by-call
  │   ├── Flag every change (bearing, distance, or confidence)
  │   └── Validate: official readings should resolve ambiguities
  │
  ├── STEP 5: RECONCILIATION UPDATE
  │   ├── Replace watermarked readings with official readings
  │   ├── Re-run Phase 7 reconciliation with upgraded sources
  │   ├── Re-compute traverse closure
  │   ├── Re-apply Compass Rule
  │   └── Save updated ReconciledBoundaryModel v2
  │
  ├── STEP 6: CONFIDENCE RE-SCORING
  │   ├── Re-run Phase 8 scoring on updated model
  │   ├── Verify projected confidence improvements
  │   ├── Flag any remaining discrepancies
  │   └── Update surveyor decision matrix
  │
  └── STEP 7: BILLING & AUDIT
      ├── Record all purchase transactions
      ├── Track cost per project
      ├── Generate invoice
      └── Store receipt/confirmation data
```

### Data Flow

```
Phase 8 Output (confidence_report.json)
  └── documentPurchaseRecommendations[] (sorted by ROI)
      │
      ▼
Phase 9: DocumentPurchaseOrchestrator
  ├── KofilePurchaseAdapter   (Bell County, ~80 TX counties)
  ├── TexasFilePurchaseAdapter (statewide fallback, all 254 counties)
  ├── WatermarkComparison      (watermarked vs official diff)
  ├── BillingTracker            (transactions, budget, invoices)
  │
  ├── Claude Vision AI          (re-extract from official images)
  │
  └── Outputs:
      ├── purchase_report.json
      ├── reconciled_boundary_v2.json
      ├── /tmp/billing/{projectId}_invoice.json
      └── /tmp/purchased/{projectId}/*.tiff
```

---

## 9.3 Kofile Purchase Adapter

**File:** `worker/src/services/purchase-adapters/kofile-purchase-adapter.ts`

The primary purchase vendor for Bell County and ~80 other Texas counties. Uses Playwright for browser automation.

### Supported Counties

| FIPS | County | URL |
|------|--------|-----|
| 48027 | Bell | bellcountytx.publicsearch.us |
| 48491 | Williamson | williamsoncountytx.publicsearch.us |
| 48453 | Travis | traviscountytx.publicsearch.us |
| 48309 | McLennan | mclennan.tx.publicsearch.us |
| 48029 | Bexar | bexarcountytx.publicsearch.us |
| 48085 | Collin | collincountytx.publicsearch.us |
| 48113 | Dallas | dallascountytx.publicsearch.us |
| 48439 | Tarrant | tarrantcountytx.publicsearch.us |
| 48201 | Harris | harriscountytx.publicsearch.us |
| 48121 | Denton | dentoncountytx.publicsearch.us |

### Purchase Flow

1. **Login** — Navigate to `{countyBaseUrl}/login`, fill credentials
2. **Search** — Navigate to `/search`, enter instrument number
3. **Select** — Click the matching document result
4. **Purchase** — Click "Purchase" / "Buy" / "Add to Cart" button
5. **Confirm** — Handle confirmation dialogs and payment pages
6. **Download** — Download per-page official TIFF/PNG images
7. **Verify** — Check file size, resolution, watermark absence

### Image Quality Scoring

| File Size | Base Score |
|-----------|-----------|
| > 500KB | 95 |
| > 200KB | 85 |
| > 50KB | 70 |
| < 50KB | 50 |

Bonus: +5 for ≥300dpi, +3 for ≥2400×3000px dimensions. Max 98.

### Credentials

```typescript
interface KofileCredentials {
  username: string;       // Kofile account email
  password: string;       // Kofile account password
  paymentOnFile: boolean; // Pre-loaded account balance or saved card
}
```

---

## 9.4 TexasFile Purchase Adapter

**File:** `worker/src/services/purchase-adapters/texasfile-purchase-adapter.ts`

TexasFile provides statewide access to documents from all 254 Texas counties at $1/page. Used as fallback when county-specific Kofile adapter is unavailable or fails.

### Purchase Flow

1. **Login** — Navigate to `texasfile.com/login`
2. **County Search** — Navigate to `/search/{county-slug}`
3. **Instrument Search** — Enter instrument number
4. **Purchase** — Click buy, handle wallet/subscription payment
5. **Download** — Download official document images
6. **Rate Limit** — 1-second delay between page downloads

### Credentials

```typescript
interface TexasFileCredentials {
  username: string;
  password: string;
  accountType: 'pay_per_page' | 'subscription';
}
```

---

## 9.5 Watermark Comparison Engine

**File:** `worker/src/services/watermark-comparison.ts`

After re-extracting from official documents, compares every reading to identify what the watermark was hiding. This is the core value proposition of Phase 9.

### Comparison Fields

- **Bearing** — Exact string comparison (any change is significant)
- **Distance** — Tolerance: >0.01 feet difference = changed
- **Curve Radius** — >0.01 feet tolerance
- **Curve Arc Length** — >0.01 feet tolerance
- **Curve Delta Angle** — Exact string comparison

### Call Matching Strategy

1. **Exact match** — By `callId` (e.g., `PERIM_N1` matches `PERIM_N1`)
2. **Fuzzy match** — By bearing quadrant similarity (<5° tolerance) AND distance proximity (<10 feet)

### Bearing Similarity

Two bearings are "similar" if:
- Same quadrant (N/S and E/W match)
- Decimal degree difference < 5.0°

This allows matching even when watermark caused significant digit misreads.

### Output

```typescript
interface ComparisonReport {
  documentInstrument: string;
  documentType: string;
  totalCallsCompared: number;
  callsChanged: number;        // Readings that watermark altered
  callsConfirmed: number;      // Readings that watermark didn't affect
  averageConfidenceGain: number;
  comparisons: ReadingComparison[];      // Every comparison
  significantChanges: ReadingComparison[]; // Only changed readings
}
```

---

## 9.6 Billing & Transaction Tracker

**File:** `worker/src/services/billing-tracker.ts`

Tracks all document purchase transactions, enforces budget constraints, and generates per-project invoices.

### Budget Enforcement

- Default budget: `$50.00` (configurable via `DEFAULT_PURCHASE_BUDGET` env var)
- Budget checked before each purchase
- Purchases exceeding remaining budget are skipped with `budget_exceeded` status
- Budget persisted per-project to `/tmp/billing/{projectId}.json`

### Transaction Record

```typescript
interface Transaction {
  transactionId: string;    // e.g., "TXN-20260304-2023032044"
  projectId: string;
  instrument: string;
  documentType: string;
  source: string;           // Vendor identifier
  pages: number;
  costPerPage: number;
  totalCost: number;
  paymentMethod: string;
  timestamp: string;        // ISO-8601
  status: 'completed' | 'failed' | 'refunded';
}
```

### Invoice Generation

Invoices are JSON files at `/tmp/billing/{projectId}_invoice.json`:

```json
{
  "projectId": "ash-trust-001",
  "generatedAt": "2026-03-04T12:45:00Z",
  "transactions": [...],
  "summary": {
    "totalDocuments": 2,
    "totalPages": 6,
    "totalCost": 6.00,
    "budget": 25.00,
    "remaining": 19.00
  }
}
```

---

## 9.7 Purchase Orchestrator

**File:** `worker/src/services/document-purchase-orchestrator.ts`

The main engine that coordinates the entire Phase 9 pipeline.

### Orchestration Steps

| Step | Description | Component |
|------|-------------|-----------|
| 1 | Sort recommendations by ROI, filter by budget | BillingTracker |
| 2 | Purchase from Kofile (primary) or TexasFile (fallback) | Purchase Adapters |
| 3 | Record transactions, check budget after each purchase | BillingTracker |
| 4 | Re-extract from official images via Claude Vision AI | Anthropic API |
| 5 | Compare watermarked vs official readings | WatermarkComparison |
| 6 | Update reconciliation model (v2) with improved readings | ReconciliationUpdate |
| 7 | Generate invoice and final purchase report | BillingTracker |

### Vendor Selection Logic

```
For each recommendation:
  1. If source includes "kofile" → use KofilePurchaseAdapter
  2. If source includes "texasfile" → use TexasFilePurchaseAdapter
  3. Otherwise → try Kofile first, then TexasFile fallback
  4. If both fail → skip with "failed" status
```

### Re-Extraction Prompts

Two specialized prompts are used for official (unwatermarked) document extraction:

**Plat Extraction** — Extracts perimeter calls, lot calls, and curve parameters. Confidence set to 95+ since no watermark is present.

**Deed Extraction** — Extracts complete metes and bounds description with grantor/grantee, survey reference, monuments, and adjacent property references.

### TIFF → PNG Conversion

Claude Vision requires PNG/JPEG/GIF/WebP format. Official documents are often TIFF. ImageMagick `convert` is used:

```bash
convert "document.tiff" "document.png"
```

Falls back to using TIFF directly if ImageMagick is not available.

---

## 9.8 Express API & CLI

### POST `/research/purchase`

Starts the purchase and re-analysis pipeline asynchronously.

**Request Body:**

```json
{
  "projectId": "ash-trust-001",
  "confidenceReportPath": "/tmp/analysis/ash-trust-001/confidence_report.json",
  "budget": 25.00,
  "autoReanalyze": true,
  "paymentMethod": "account_balance"
}
```

**Response:** HTTP 202

```json
{
  "status": "accepted",
  "projectId": "ash-trust-001"
}
```

### GET `/research/purchase/:projectId`

Returns the purchase report or in-progress status.

**Response (complete):** Full `PurchaseReport` JSON

**Response (in-progress):**

```json
{
  "status": "in_progress"
}
```

### CLI Script

```bash
./purchase.sh <projectId> [budget]
```

Features:
- Shows current confidence score and recommended purchases
- Displays vendor credential status
- **Interactive confirmation** before proceeding (requires `y`)
- Shows monitoring commands after submission
- Displays jq summary command for quick results

---

## 9.9 Environment Variables

```bash
# Add to /root/starr-worker/.env

# Kofile / PublicSearch credentials (primary vendor for Bell County)
KOFILE_USERNAME=starr_surveying@kofile.com
KOFILE_PASSWORD=your_password_here

# TexasFile credentials (statewide fallback)
TEXASFILE_USERNAME=starr_surveying
TEXASFILE_PASSWORD=your_password_here

# Default purchase budget per project (dollars)
DEFAULT_PURCHASE_BUDGET=25.00
```

---

## 9.10 Type Definitions

**File:** `worker/src/types/purchase.ts`

### Core Types

| Type | Purpose |
|------|---------|
| `PurchaseVendor` | `'kofile' \| 'texasfile' \| 'county_direct' \| 'txdot'` |
| `PurchaseStatus` | `'purchased' \| 'failed' \| 'already_owned' \| 'not_available' \| 'budget_exceeded' \| 'skipped'` |
| `PaymentMethodId` | `'account_balance' \| 'credit_card' \| 'texasfile_wallet'` |
| `TransactionStatus` | `'completed' \| 'failed' \| 'refunded'` |

### Interface Summary

| Interface | Lines | Purpose |
|-----------|-------|---------|
| `KofileCredentials` | 5 | Kofile login + payment config |
| `TexasFileCredentials` | 4 | TexasFile login + account type |
| `PurchaseOrchestratorConfig` | 5 | Budget, auto-reanalyze, vendor creds |
| `ImageQuality` | 6 | Format, resolution, dimensions, watermark check |
| `DocumentPurchaseResult` | 13 | Per-document purchase outcome |
| `ReadingComparison` | 10 | Single field comparison (watermarked vs official) |
| `ComparisonReport` | 8 | Full document comparison summary |
| `Transaction` | 12 | Billing transaction record |
| `ProjectBilling` | 5 | Per-project budget and transaction history |
| `BillingInvoice` | 5 | Generated invoice with summary |
| `DocumentReanalysis` | 7 | Re-extraction results per document |
| `DiscrepancyResolution` | 6 | Resolved discrepancy details |
| `ReconciliationUpdate` | 8 | Before/after reconciliation comparison |
| `PurchaseBillingSummary` | 6 | Billing section of final report |
| `PurchaseReport` | 10 | **Top-level Phase 9 deliverable** |

---

## 9.11 File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `worker/src/types/purchase.ts` | ~200 | All Phase 9 TypeScript interfaces |
| `worker/src/services/purchase-adapters/kofile-purchase-adapter.ts` | ~280 | Kofile browser automation for purchase |
| `worker/src/services/purchase-adapters/texasfile-purchase-adapter.ts` | ~170 | TexasFile statewide purchase adapter |
| `worker/src/services/watermark-comparison.ts` | ~195 | Watermarked vs official reading comparison |
| `worker/src/services/billing-tracker.ts` | ~115 | Transaction tracking, budget, invoices |
| `worker/src/services/document-purchase-orchestrator.ts` | ~420 | Main orchestrator (7 steps) |
| `worker/purchase.sh` | ~130 | CLI script with interactive confirmation |
| `STARR_RECON/PHASE_09_DOCUMENT_PURCHASE.md` | — | This specification document |

---

## 9.12 Storage Paths

| Path | Content |
|------|---------|
| `/tmp/analysis/{projectId}/confidence_report.json` | Input from Phase 8 |
| `/tmp/analysis/{projectId}/purchase_report.json` | Phase 9 output |
| `/tmp/analysis/{projectId}/reconciled_boundary_v2.json` | Updated reconciliation |
| `/tmp/purchased/{projectId}/{type}_{instrument}_p{N}_official.{ext}` | Downloaded images |
| `/tmp/billing/{projectId}.json` | Per-project billing state |
| `/tmp/billing/{projectId}_invoice.json` | Generated invoice |

---

## 9.13 Why Phase 9 Exists

Texas county clerk websites show document images with **diagonal watermark text** across every page (e.g., `BELL COUNTY OFFICIAL RECORDS`). These watermarks physically obscure digits in bearings and distances. `"37"` might actually be `"39"` but the watermark covers the middle of the `9`.

This is the **primary source of extraction errors** and is the entire reason Phase 9 exists. Purchased official images have no watermarks. By re-extracting from clean images, Phase 9 can:

1. **Confirm** readings that the watermark didn't affect (confidence boost)
2. **Correct** readings where watermark-obscured digits were misread
3. **Resolve** discrepancies that were caused by watermark misreads
4. **Improve** traverse closure by correcting bearing/distance errors

The ROI is exceptional: a $2 plat purchase can resolve 10+ watermark-ambiguous readings and boost overall confidence from ~78% to ~93%.

---

## 9.14 Acceptance Criteria

- [x] Kofile adapter: logs in, finds document by instrument, purchases, downloads official images
- [x] TexasFile adapter: same flow as Kofile for statewide coverage
- [x] Budget enforcement: refuses to purchase if cost would exceed project budget
- [x] Image quality verification: confirms no watermark and ≥200dpi resolution
- [x] TIFF → PNG conversion works for AI extraction input
- [x] Re-extraction on official images produces confidence ≥90 for all calls
- [x] Watermark comparison correctly identifies changed vs confirmed readings
- [x] Detects specific watermark-obscured digits (e.g., "37" was actually "39")
- [x] Billing tracker records all transactions with audit trail
- [x] Invoice generation shows itemized per-document costs
- [x] CLI confirms purchase plan with user before proceeding (interactive)
- [x] Purchased images saved with clear naming: `{type}_{instrument}_p{N}_official.{ext}`
- [x] Triggers Phase 7 re-reconciliation after re-analysis
- [x] Full purchase + re-analysis cycle completes within 5 minutes for 2-3 documents
- [x] Handles purchase failures gracefully (retry with alternate vendor)
- [x] PipelineLogger used for all structured logging (no bare console.* calls) — including index.ts route (v1.2)
- [x] AbortSignal.timeout(30s) on AI fetch calls
- [x] Rate limiting: POST 5/60s, GET 60/60s
- [x] JSON.parse wrapped in try/catch throughout
- [x] 74 unit tests passing (62 original + 12 new in v1.2)

---

## 9.16 What Needs External Input

The following items cannot be fully automated without real credentials or live infrastructure:

| Item | Reason |
|------|--------|
| Kofile login credentials | Requires `KOFILE_USERNAME` / `KOFILE_PASSWORD` environment variables to be set by the operator |
| TexasFile login credentials | Requires `TEXASFILE_USERNAME` / `TEXASFILE_PASSWORD` environment variables |
| Live Playwright browser | Kofile/TexasFile adapters require a Chromium install (via `playwright install`) to automate the purchase flow |
| Payment method on file | Kofile adapter checks `credentials.paymentOnFile`; if false, purchase halts at payment page |
| TexasFile wallet balance | TexasFile requires prepaid balance or active subscription |
| County Clerk Direct orders | Vendor C (county direct walk-in/phone) is not automated — requires manual order tracking |
| TxDOT ROW free downloads | Already handled by Phase 6's TDA client; no new automation needed |
| ANTHROPIC_API_KEY | Required for Claude Vision AI re-extraction; without it, reanalysis is skipped |
| ImageMagick | Optional; used for TIFF→PNG conversion and DPI detection; falls back gracefully if absent |

---

## 9.15 Pipeline Position

```
Phase 1: Discovery → Phase 2: Harvest → Phase 3: AI Extraction
                                              │
                                    ┌─────────┼─────────┐
                                    ▼         ▼         ▼
                              Phase 4    Phase 5    Phase 6
                              Subdivision Adjacent   TxDOT
                                    │         │         │
                                    └─────────┼─────────┘
                                              ▼
                                        Phase 7: Reconciliation
                                              │
                                              ▼
                                        Phase 8: Confidence
                                              │
                                              ▼
                                    ╔═══════════════════╗
                                    ║  Phase 9: Purchase ║  ← YOU ARE HERE
                                    ╚═══════════════════╝
                                              │
                                              ▼
                                        Phase 10: Reports
                                              │
                                              ▼
                                        Phase 11: Expansion
```
