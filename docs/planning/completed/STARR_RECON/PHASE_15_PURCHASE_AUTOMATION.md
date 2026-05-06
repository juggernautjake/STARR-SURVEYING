# Phase 15: Full Purchase Automation, Bexar County Adapter & Notification System

**Starr Software — AI Property Research Pipeline Phase**

**Status:** ✅ COMPLETE v1.0 (March 2026)  
**Phase Duration:** Weeks 59–62  
**Depends On:** Phases 1–14  
**Maintained By:** Jacob, Starr Surveying Company, Belton, Texas (Bell County)

**Goal:** Complete all purchase automation deferred from Phase 14 and add production-readiness features:
1. Full Playwright automation for Tyler Pay, Henschen Pay, iDocket Pay, Fidlar Pay, and GovOS guest checkout
2. LandEx REST API integration (API-based, no Playwright needed)
3. Bexar County (San Antonio) custom clerk adapter — largest TX metro without a dedicated adapter
4. Email/SMS notification system (Resend + Twilio) for purchase completion and pipeline events
5. Stripe webhook endpoint (`/api/webhooks/stripe`) for wallet funding and subscription management
6. Database schema for `document_wallet_balance` and `document_purchase_history` tables

---

## Problem Statement

> Phase 14 established the free-first, paid-fallback document access architecture and the 12-platform registry, but deferred the actual Playwright purchase flows for most paid platforms. Phase 15 fills that gap: every platform in the registry now has a working purchase adapter, Bexar County has a dedicated clerk adapter, and users receive real-time email/SMS notifications when documents are purchased or pipelines complete.

---

## Architecture: Phase 15 Additions

```
PHASE 14 (foundation)                    PHASE 15 (completion)
─────────────────────────────────────    ─────────────────────────────────────
PaidPlatformRegistry (12 platforms)  →   TylerPayAdapter (Playwright)
DocumentAccessOrchestrator           →   HenschenPayAdapter (Playwright)
Stripe wallet funding (checkout)     →   IDocketPayAdapter (Playwright, SPA-aware)
                                     →   FidlarPayAdapter (Playwright, AJAX-aware)
                                     →   GovOSGuestAdapter (Playwright, CC guest)
                                     →   LandExApiAdapter (REST API, no browser)
                                     →   BexarClerkAdapter (Kofile/GovOS custom)
                                     →   NotificationService (Resend + Twilio)
                                     →   /api/webhooks/stripe (Next.js route)
                                     →   document_wallet_balance (Supabase table)
                                     →   document_purchase_history (Supabase table)
```

---

## What Was Built

### v1.0 (March 2026)

| Module | File | Purpose |
|--------|------|---------|
| Tyler Pay Adapter | `worker/src/services/purchase-adapters/tyler-pay-adapter.ts` | Playwright flow for ~30 Tyler/Odyssey counties |
| Henschen Pay Adapter | `worker/src/services/purchase-adapters/henschen-pay-adapter.ts` | Playwright flow for ~40 Henschen counties |
| iDocket Pay Adapter | `worker/src/services/purchase-adapters/idocket-pay-adapter.ts` | SPA-aware Playwright for ~20 iDocket counties |
| Fidlar Pay Adapter | `worker/src/services/purchase-adapters/fidlar-pay-adapter.ts` | AJAX-aware Playwright for ~15 Fidlar counties |
| GovOS Guest Adapter | `worker/src/services/purchase-adapters/govos-guest-adapter.ts` | Credit card guest checkout for ~80 Kofile counties |
| LandEx API Adapter | `worker/src/services/purchase-adapters/landex-api-adapter.ts` | REST API for national coverage (all 254 TX counties) |
| Bexar Clerk Adapter | `worker/src/adapters/bexar-clerk-adapter.ts` | San Antonio / Bexar County custom clerk adapter |
| Notification Service | `worker/src/services/notification-service.ts` | Email (Resend) + SMS (Twilio) notification engine |
| Stripe Webhook | `app/api/webhooks/stripe/route.ts` | Webhook handler for wallet funding + subscriptions |
| Wallet Schema | `seeds/093_phase15_wallet_tables.sql` | `document_wallet_balance` + `document_purchase_history` |
| Worker Routes | `worker/src/index.ts` | 4 new Phase 15 API endpoints |
| Tests | `__tests__/recon/phase15-purchase-automation.test.ts` | 64 unit tests |

---

## Purchase Adapter Details

### Tyler Pay (tyler-pay-adapter.ts)

**Platform:** Tyler Technologies / Odyssey e-filing and pay portal  
**Counties:** ~30 Texas counties (Dallas 48113, Tarrant 48439, Collin 48085, Denton 48121, Montgomery 48339, Fort Bend 48157, Brazoria 48039, Chambers 48071, Jefferson 48245, Orange 48361)  
**Cost:** $0.50–$1.00/page  
**Auth:** Username + password (county-specific portal)  
**Automation:** Full Playwright — login → search → add to cart → checkout → download  

```typescript
const adapter = new TylerPayAdapter(
  '48113', 'Dallas',
  { username: process.env.TYLER_PAY_USERNAME, password: process.env.TYLER_PAY_PASSWORD },
  '/tmp/documents/proj-001/paid', 'proj-001',
);
await adapter.initSession();
const result = await adapter.purchaseDocument('2023032044', 'warranty_deed');
await adapter.destroySession();
```

### Henschen Pay (henschen-pay-adapter.ts)

**Platform:** Henschen & Associates county clerk portal  
**Counties:** ~40 Texas Hill Country / Central Texas counties  
**Cost:** $0.50–$1.00/page  
**Auth:** Username + password per county portal  
**Automation:** Full Playwright — login → instrument search → purchase → download  

### iDocket Pay (idocket-pay-adapter.ts)

**Platform:** iDocket.com (React SPA, multi-county)  
**Counties:** ~20 Texas counties (Rockwall 48379, Palo Pinto 48363, Burleson 48051, etc.)  
**Cost:** Subscription model — unlimited downloads per month  
**Auth:** iDocket subscriber account (email + password)  
**Automation:** SPA-aware Playwright — wait for React hydration, county URL routing  
**Key difference:** Single portal URL for all counties (idocket.com); county selected via URL path

### Fidlar Pay (fidlar-pay-adapter.ts)

**Platform:** Fidlar/Laredo Technologies  
**Counties:** ~15 Texas East/Panhandle counties (Ward 48475, El Paso 48141, Nacogdoches 48347, etc.)  
**Cost:** $0.75–$1.00/page  
**Auth:** Username + password per county subdomain (*.tx.fidlar.com)  
**Automation:** AJAX-aware Playwright — handles dynamic DOM updates after search

### GovOS Guest Checkout (govos-guest-adapter.ts)

**Platform:** GovOS / PublicSearch (same counties as Kofile free preview)  
**Counties:** ~80 Texas counties using *.tx.publicsearch.us  
**Cost:** $1.00/page  
**Auth:** Option A: Pre-tokenized Stripe card token; Option B: GovOS account  
**Automation:** Semi-automated — login or guest CC form fill  
**Note:** Prefer Kofile paid account over guest checkout when available (same county, same portal, less friction)

### LandEx REST API (landex-api-adapter.ts)

**Platform:** LandEx.com — National document aggregator  
**Counties:** All US counties including all 254 Texas counties  
**Cost:** $0.50–$2.00/page depending on document type (plat > deed > release)  
**Auth:** API key + account ID  
**Automation:** Full REST API — no Playwright needed  
**Special features:**
- Batch purchase: up to 10 parallel requests (`batchPurchase()`)
- Cost estimation: `LandExApiAdapter.estimateCost(documentType, pages)` before purchasing
- National fallback: always available when TX-specific platforms fail

**Cost estimates:**
| Document Type | Rate/Page |
|---|---|
| `warranty_deed`, `deed`, `easement`, `deed_of_trust` | $0.75 |
| `release` | $0.50 |
| `plat` | $2.00 |
| All others | $1.00 |

---

## Bexar County Clerk Adapter

**County:** Bexar (San Antonio metro), FIPS 48029  
**File:** `worker/src/adapters/bexar-clerk-adapter.ts`  
**Platform:** Kofile/GovOS PublicSearch at `https://bexar.tx.publicsearch.us`  
**Volume:** ~300,000+ instruments/year — 4th largest TX county clerk by volume  
**Record depth:** 1971 onward (older docs: in-person only at 100 Dolorosa St, San Antonio)

```typescript
const adapter = new BexarClerkAdapter('/tmp/bexar-docs', 'proj-san-antonio-001');
await adapter.initSession();
const results = await adapter.searchByInstrumentNumber('20230012345');
const images = await adapter.getDocumentImages('20230012345');
await adapter.destroySession();
```

**Key methods:**
- `searchByInstrumentNumber(instrumentNo)` → `ClerkDocumentResult[]`
- `searchByGranteeName(name)` / `searchByGrantorName(name)` → `ClerkDocumentResult[]`
- `getDocumentImages(instrumentNo)` → `DocumentImage[]` (watermarked free previews)
- `getDocumentPricing(instrumentNo)` → `PricingInfo` ($1.00/page via GovOS checkout)
- `BexarClerkAdapter.isBexarCounty('48029')` → `true`

**Clerk registry updated:** Status changed from `stub` → `implemented` for FIPS `48029`.

---

## Notification Service

**File:** `worker/src/services/notification-service.ts`  
**Transports:** Email via [Resend API](https://resend.com) + SMS via [Twilio API](https://twilio.com)  
**Graceful degradation:** If credentials absent, notifications are logged but not sent

### Event Types

| Event | When Triggered | Priority |
|-------|---------------|----------|
| `document_purchased` | Clean document purchase completed | High |
| `document_purchase_failed` | All purchase attempts failed | High |
| `pipeline_complete` | Full research pipeline finished | Medium |
| `pipeline_failed` | Pipeline fatal error | High |
| `manual_review_required` | No automated option exists | Medium |
| `subscription_expiring` | Renewal within 7 days | Low |
| `wallet_low_balance` | Balance < threshold | Medium |
| `wallet_funded` | Wallet top-up completed | Low |

### Usage

```typescript
const notifSvc = new NotificationService();

// Notify when document purchased
await notifSvc.notifyDocumentPurchased(
  user.email, user.phoneNumber,
  projectId, instrumentNumber, countyName, platform,
  pages, cost, reportUrl,
);

// Notify when pipeline complete
await notifSvc.notifyPipelineComplete(
  user.email, user.phoneNumber,
  projectId, address, countyName, confidenceScore,
  runtimeMinutes, documentCount, reportUrl,
);

// Low balance warning
await notifSvc.notifyLowWalletBalance(
  user.email, currentBalance, 5.00, fundUrl,
);
```

### Environment Variables Required

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Resend API key for email delivery |
| `NOTIFICATION_FROM_EMAIL` | Sender address (default: `noreply@starrsurveying.com`) |
| `TWILIO_ACCOUNT_SID` | Twilio account SID for SMS |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Twilio phone number in E.164 format (e.g. `+12025551234`) |

---

## Stripe Webhook Endpoint

**File:** `app/api/webhooks/stripe/route.ts`  
**Route:** `POST /api/webhooks/stripe`  
**Security:** HMAC-SHA256 signature verification using Web Crypto API (no external deps)

### Events Handled

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Credit wallet (wallet_funding) or record purchase (document_purchase) |
| `payment_intent.succeeded` | Audit log |
| `payment_intent.payment_failed` | Record failed transaction, log error |
| `customer.subscription.updated` | Update `research_subscriptions` status/period |
| `customer.subscription.deleted` | Mark subscription as `canceled` |
| `invoice.payment_succeeded` | Audit log |
| `invoice.payment_failed` | Update subscription to `past_due` |

### Stripe Checkout Metadata Convention

For wallet funding sessions:
```json
{ "action": "wallet_funding", "userEmail": "user@example.com" }
```

For document purchase sessions:
```json
{
  "action": "document_purchase",
  "userEmail": "user@example.com",
  "projectId": "proj-001",
  "instrumentNumber": "2023032044",
  "platform": "tyler_pay",
  "costUsd": "1.50"
}
```

### Webhook Setup
1. In Stripe Dashboard → Webhooks → Add endpoint: `https://yourapp.vercel.app/api/webhooks/stripe`
2. Select events: `checkout.session.completed`, `payment_intent.*`, `customer.subscription.*`, `invoice.*`
3. Copy the signing secret → set `STRIPE_WEBHOOK_SECRET` env var

---

## Database Schema

### document_wallet_balance

```sql
CREATE TABLE document_wallet_balance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email      text NOT NULL UNIQUE,
  balance_usd     numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (balance_usd >= 0),
  lifetime_funded_usd  numeric(10,2) NOT NULL DEFAULT 0.00,
  lifetime_spent_usd   numeric(10,2) NOT NULL DEFAULT 0.00,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### document_purchase_history

```sql
CREATE TABLE document_purchase_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email          text NOT NULL,
  transaction_type    text NOT NULL,  -- 'wallet_credit' | 'document_purchase' | 'refund' | 'payment_failed'
  amount_usd          numeric(10,2) NOT NULL DEFAULT 0.00,
  project_id          text,
  instrument_number   text,
  county_fips         text,
  platform            text,           -- PaidPlatformId
  pages               integer,
  quality_score       integer,        -- 0–100
  is_watermarked      boolean NOT NULL DEFAULT false,
  stripe_session_id   text,
  status              text NOT NULL DEFAULT 'completed',
  metadata            jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);
```

**Triggers:** `trg_sync_wallet_lifetime_totals` — automatically maintains `balance_usd`, `lifetime_funded_usd`, and `lifetime_spent_usd` on `document_wallet_balance` when new history rows are inserted.

---

## Worker API Endpoints (Phase 15)

### POST /research/purchase/automated
Purchase a document using a specific paid platform adapter.

**Body:**
```json
{
  "projectId": "proj-001",
  "countyFIPS": "48113",
  "countyName": "Dallas",
  "instrumentNumber": "2023032044",
  "documentType": "warranty_deed",
  "platform": "tyler_pay"
}
```

**Platforms:** `tyler_pay` | `henschen_pay` | `idocket_pay` | `fidlar_pay` | `govos_direct` | `landex`

**Response:** `DocumentPurchaseResult`

### GET /research/purchase/platforms/status
Returns which Phase 15 adapters have credentials configured.

```json
{
  "platforms": {
    "tyler_pay":    { "configured": true },
    "henschen_pay": { "configured": false },
    "idocket_pay":  { "configured": true },
    "fidlar_pay":   { "configured": false },
    "govos_direct": { "configured": false },
    "landex":       { "configured": true }
  },
  "notifications": {
    "email": true,
    "sms":   false
  }
}
```

### POST /research/notifications/test
Send a test notification to verify email/SMS configuration.

### GET /research/landex/estimate?documentType=warranty_deed&pages=2
Estimate LandEx cost before purchasing.

---

## Environment Variables Required

| Variable | Platform | Required For |
|----------|----------|-------------|
| `TYLER_PAY_USERNAME` | Tyler Pay | ~30 county automated purchase |
| `TYLER_PAY_PASSWORD` | Tyler Pay | |
| `HENSCHEN_PAY_USERNAME` | Henschen Pay | ~40 Hill Country counties |
| `HENSCHEN_PAY_PASSWORD` | Henschen Pay | |
| `IDOCKET_PAY_USERNAME` | iDocket | ~20 subscriber counties |
| `IDOCKET_PAY_PASSWORD` | iDocket | |
| `FIDLAR_PAY_USERNAME` | Fidlar Pay | ~15 East TX / Panhandle counties |
| `FIDLAR_PAY_PASSWORD` | Fidlar Pay | |
| `GOVOS_ACCOUNT_USERNAME` | GovOS Direct | Optional — guest checkout also works |
| `GOVOS_ACCOUNT_PASSWORD` | GovOS Direct | |
| `GOVOS_CREDIT_CARD_TOKEN` | GovOS Direct | Stripe token for guest CC checkout |
| `LANDEX_API_KEY` | LandEx | National fallback API access |
| `LANDEX_ACCOUNT_ID` | LandEx | |
| `RESEND_API_KEY` | Resend | Email notifications |
| `NOTIFICATION_FROM_EMAIL` | Resend | Sender email (optional) |
| `TWILIO_ACCOUNT_SID` | Twilio | SMS notifications |
| `TWILIO_AUTH_TOKEN` | Twilio | |
| `TWILIO_FROM_NUMBER` | Twilio | E.164 format |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Webhook signature verification |

---

## Acceptance Criteria

- [x] `TylerPayAdapter` — Playwright flow implemented, 5 tests pass
- [x] `HenschenPayAdapter` — Playwright flow implemented, 5 tests pass
- [x] `IDocketPayAdapter` — SPA-aware Playwright flow, 5 tests pass
- [x] `FidlarPayAdapter` — AJAX-aware Playwright flow, 5 tests pass
- [x] `GovOSGuestAdapter` — Guest CC checkout flow, 5 tests pass
- [x] `LandExApiAdapter` — REST API (no browser), 6 tests pass
- [x] `BexarClerkAdapter` — Bexar County (48029) implemented, 10 tests pass
- [x] `NotificationService` — Resend + Twilio, graceful no-creds degradation, 13 tests pass
- [x] `/api/webhooks/stripe` — HMAC-SHA256 sig verification, 8 event types handled
- [x] `093_phase15_wallet_tables.sql` — Both tables + trigger + RLS + helper function, 6 tests pass
- [x] Worker routes — 4 Phase 15 endpoints added to `worker/src/index.ts`
- [x] Clerk registry — Bexar County status updated from `stub` → `implemented`
- [x] **64 unit tests pass** (all pure-logic, no live network calls)
- [x] TypeScript error in `billing/route.ts` (implicit `any` on reduce/filter params) — **FIXED**

---

## What Still Needs External Input

| Item | Missing Information |
|------|---------------------|
| Tyler Pay live testing | Live Tyler/Odyssey portal selectors may need county-specific adjustment |
| Henschen Pay live testing | Per-county portal URL verification (login form selector names vary) |
| iDocket live testing | React SPA hydration timing may need tuning per county |
| Fidlar Pay live testing | AJAX result table selector varies by county deployment |
| GovOS guest checkout | Stripe tokenized card required for automated guest CC flow |
| LandEx production account | API key + account ID at landex.com |
| Resend production account | API key at resend.com + domain verification |
| Twilio production account | Account SID + auth token + phone number |
| Stripe webhook | Configure endpoint in Stripe dashboard + `STRIPE_WEBHOOK_SECRET` |
