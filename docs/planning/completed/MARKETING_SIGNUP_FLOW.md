# Marketing + Signup Flow — Planning Document

**Status:** Spec complete. Foundation shipped (D-1a precheck + complete; D-1b wizard UI; D-1c idempotency + retry; D-1d welcome email). Remaining items deferred with rationale: D-1e Stripe sub creation (Stripe products operator-credential-gated), D-1f subdomain DNS (operator-credential-gated), D-10a-d pricing-page redesign (cost exceeds value pre-customer-validation). Resume after first ~3 customers signed up + Stripe products created. Archived to `completed/` 2026-05-13.
**Owner:** Jacob (Starr Software)
**Created:** 2026-05-13
**Last updated:** 2026-05-13 (foundation shipped; remaining deferred with rationale)
**Target repo path:** `docs/planning/completed/MARKETING_SIGNUP_FLOW.md`

> **One-sentence pitch:** Redesign the marketing site's pricing page + add a 4-step signup wizard at `/signup` so a stranger can land on the marketing site, pick a bundle, complete signup, and reach `[their-slug].starrsoftware.com/admin/me` with a working 14-day trial in <60 seconds.

---

## 0. Decisions locked

| Q | Decision | Rationale |
|---|---|---|
| **Two pricing concepts coexist** | Existing `/pricing` page (Starr Surveying's services pricing) keeps its calculator + service-cards section; SaaS subscription pricing lives at the top of the same page | Two audiences (firms hiring Starr vs. firms subscribing to the software) need both |
| **Signup wizard at `/signup`** | 4 steps: plan picker → org info → admin info → confirmation | Per CUSTOMER_PORTAL §3.2 |
| **Trial mechanics** | 14 days, no credit card required up front | Per master §1.4 |
| **Domain check** | Slug uniqueness validated live during step 2 | Per CUSTOMER_PORTAL §3.2 |

---

## 1. Goals

1. **Conversion rate ≥5%** from pricing-page visit to signup completion.
2. **Time-to-first-value ≤90 seconds** from landing-page click to working admin shell.
3. **Honest pricing display** — every bundle, every cycle, every quota visible without modal-clicking.
4. **Compare-features table** lets a buyer side-by-side without leaving the page.
5. **Trial without card** removes friction; conversion to paid happens during the 14-day window.
6. **Resilience** — partial-signup (Stripe API down etc.) is recoverable.

### Non-goals

- A/B testing pricing copy in v1 (no traffic to support statistical significance).
- Marketing-quality animations or video. Static, fast-loading pricing page.
- Lead-magnet content / gated whitepapers / pop-up email capture.
- Sales-team workflow integration (HubSpot etc.) for v1 — first 20 customers handled manually.

---

## 2. Page-level information architecture

```
starrsoftware.com/
    /                          Marketing home
    /pricing                   Bundles + comparison + Starr services pricing
    /services                  (existing) Starr Surveying services
    /signup                    Wizard step 1 (or last-step if state restored)
    /signup?plan=firm_suite    Pre-selected plan
    /accept-invite/[token]     Existing-user-orphaned acceptance
    /reset-password            (existing)
    /docs                      Knowledge base public read
    /login                     Sign-in
    /credentials               (existing)
```

---

## 3. Pricing page redesign — `/pricing`

```
┌──────────────────────────────────────────────────────────────────┐
│ Starr Software for Surveying Firms                                 │
│                                                                    │
│ Powerful tools for firms that survey, draft, research, and bill.   │
│ One subscription, every tool. 14-day free trial. No card required. │
│                                                                    │
│ Billing: ( ) Monthly   (●) Annual (save 20%)                       │
│                                                                    │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐│
│ │  Recon   │  │  Draft   │  │  Field   │  │  Office  │  │   Firm   ││
│ │          │  │          │  │          │  │          │  │  Suite   ││
│ │  $79/mo  │  │  $79/mo  │  │  $39/mo  │  │ $159/mo  │  │ $399/mo  ││
│ │ per seat │  │ per seat │  │ per seat │  │ flat for │  │ flat for ││
│ │          │  │          │  │          │  │ 5 seats  │  │ 5 seats  ││
│ │  $99 mo. │  │  $99 mo. │  │  $49 mo. │  │ $199 mo. │  │ $499 mo. ││
│ │          │  │          │  │          │  │ +$39/seat│  │ +$49/seat││
│ │          │  │          │  │          │  │          │  │          ││
│ │ Property │  │ CAD edit │  │ Mobile   │  │ Business │  │ Everythng││
│ │ research │  │ + AI eng │  │ field    │  │ mgmt     │  │ in one   ││
│ │ + docs   │  │ + plots  │  │ + recpts │  │ + payroll│  │ + priority│ │
│ │          │  │          │  │          │  │ + sched  │  │ support   ││
│ │          │  │          │  │          │  │          │  │           ││
│ │[Try free]│  │[Try free]│  │[Try free]│  │[Try free]│  │[Try free] ││
│ └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘│
│                                                                    │
│   ── Compare every feature ▾ ──                                    │
│                                                                    │
│   ┌────────────────────────────────────────────────────────────┐ │
│   │ Feature                  Recon Draft Field Office Firm     │ │
│   │ Property research        ✓     —     —     —      ✓         │ │
│   │ Document library         ✓     —     —     —      ✓         │ │
│   │ County-clerk adapters    ✓     —     —     —      ✓         │ │
│   │ AI research engine       ✓     —     —     —      ✓         │ │
│   │ CAD editor               —     ✓     —     —      ✓         │ │
│   │ AI drawing engine        —     ✓     —     —      ✓         │ │
│   │ DXF / DWG export         —     ✓     —     —      ✓         │ │
│   │ Field data points        —     —     ✓     —      ✓         │ │
│   │ Receipts / mileage       —     —     ✓     ✓      ✓         │ │
│   │ Time tracking            —     —     ✓     ✓      ✓         │ │
│   │ Job management           —     —     ltd   ✓      ✓         │ │
│   │ Payroll                  —     —     —     ✓      ✓         │ │
│   │ Crew scheduling          —     —     —     ✓      ✓         │ │
│   │ Internal messaging       —     —     —     ✓      ✓         │ │
│   │ Learning hub             ×     ×     ×     ×      ✓         │ │
│   │ Storage                  10GB  20GB  10GB  50GB   200GB    │ │
│   │ AI tokens/mo             50k   100k  10k   100k   500k     │ │
│   │ Support                  Email Email Email Email  Priority │ │
│   │ Custom domain            —     —     —     —      ✓         │ │
│   │ SSO                      —     —     —     —      Add-on   │ │
│   └────────────────────────────────────────────────────────────┘ │
│                                                                    │
│   FAQ ▾                                                            │
│     • Can I change plans later?                                    │
│     • Do you offer annual billing?                                 │
│     • Is there a free tier?                                        │
│     • What happens after the trial ends?                           │
│     • Can I pay by check / ACH?                                    │
│     • Do you offer custom pricing for large firms?                 │
│                                                                    │
│ ── Hiring Starr Surveying for surveying work? Visit our services ─│
│                                                                    │
│ [Existing services calculator + cards from current /pricing page]  │
└──────────────────────────────────────────────────────────────────┘
```

CTAs on every bundle card go to `/signup?plan=<bundle_id>`.

---

## 4. Signup wizard — `/signup`

Four steps, one screen each. Back button on each. Step indicator at top. State persisted in URL query params + sessionStorage (resilient to accidental refresh).

### Step 1 — Plan picker

Pre-selected from `?plan=` query param. Page lists every bundle as a card (Recon / Draft / Field / Office / Firm Suite), monthly/annual toggle, optional bundle add-ons.

User can pick à la carte: "Office + Field" without buying Firm Suite, for instance.

```
Selected: [Office] [Field]   ← user can toggle bundles in/out
Annual billing (save 20%): [✓]
Total: $159/mo + $39/seat (5 seats included)
                                              [Continue →]
```

### Step 2 — Organization info

```
What's your firm's name?
[___________________________________]

Slug (your subdomain): [acme]starrsoftware.com  ← live uniqueness check
        ✓ Available

State of primary operation:
[ Texas ▾ ]

Phone (optional):
[___________________________________]

Logo (optional): [Upload]

                                       [← Back] [Continue →]
```

### Step 3 — Admin info

```
Your details — you'll be the first admin.

Email:
[___________________________________]
        ⚠ This email already has an account. [Sign in instead] or [Continue here]

Name:
[___________________________________]

Password:
[___________________________________]
Strength: ████░░ Good

[ ] I agree to the Terms of Service and Privacy Policy.

                                       [← Back] [Continue →]
```

If email already has an account (e.g. user invited to another org previously), offer "Sign in instead" — completes signup as adding-an-org-to-existing-account flow.

### Step 4 — Confirmation

```
You're almost in.

Firm:     Acme Surveying (acme.starrsoftware.com)
Plan:     Office bundle, annual ($1,908/year — save $480)
Trial:    14 days free, ends [2026-05-27]. No card required now.
Admin:    Alice Carter (alice@acme.com)

You'll get an email shortly with a magic-link for signing in.

[← Back]                              [Create my firm]
```

On click "Create my firm":
1. Server-side: create `organizations` row with `status='provisioning'` + 24h TTL.
2. Create Stripe customer.
3. Create Stripe subscription with `trial_period_days=14` + selected price IDs.
4. Create user + `organization_members` row with role `admin`.
5. Sign user in (JWT minted).
6. Update org `status='trialing'`.
7. Send welcome email via Resend.
8. Redirect to `https://acme.starrsoftware.com/admin/me?welcome=true`.

If step 2-3 fail (Stripe API down): retry up to 3 times with exponential backoff; if still failing, alert operator + apologize on a "Hang tight, we're finishing your setup..." screen + create a follow-up job.

---

## 5. API + backend

```
POST /api/signup/precheck
  Body: { slug, email }
  Returns: { slug_available, email_status: 'new' | 'existing_user' | 'banned' }

POST /api/signup/complete
  Body: { plan_bundle_ids, billing_cycle, org: { name, slug, state, phone, logo_data }, admin: { email, name, password } }
  Returns: { org_id, org_slug, jwt }
  Side effects: creates org, member, Stripe customer + sub, sends welcome email, audit log
```

Idempotency: every POST `/api/signup/complete` includes a client-generated idempotency key. Subsequent retries with the same key return the original org_id without creating duplicates.

---

## 6. Phased delivery

Maps to master plan Phase D-1 + D-10. ~3 weeks.

| Slice | Description | Estimate |
|---|---|---|
| **D-1a** | `POST /api/signup/precheck` + `POST /api/signup/complete` server routes | 2 days | ✅ Shipped — both routes. `complete` creates organizations + organization_members + registered_users (bcrypt-hashed password) + org_settings + subscriptions (trialing, 14-day) + audit_log; fires welcome email via dispatch. Idempotency-key support. Stripe customer/sub creation defers via metadata.stripe_pending=true until Stripe products exist; operator finalizes via /platform/billing. |
| **D-1b** | Signup wizard 4-step UI at `/signup` | 4 days | ✅ Shipped — `app/signup/page.tsx`. 4-step wizard (plan picker → org info → admin info → confirmation) with live slug uniqueness check (350ms debounce against /api/signup/precheck), email status check (new/existing/banned), per-step canContinue validation. Wrapped in Suspense (useSearchParams). Submit posts to `/api/signup/complete` (404 today → friendly fallback message + contact mailto until D-1e wires the endpoint). |
| **D-1c** | Idempotency + retry logic + provisioning-failed fallback screen | 2 days | ✅ Shipped — `/api/signup/complete` accepts `idempotencyKey` in body or `Idempotency-Key` header; cached in `organizations.metadata.idempotency_key`. Retry returns the original org. `/signup` wizard shows a friendly "contact info@starrsoftware.com" fallback on any non-2xx response, so partial failures aren't dead ends. |
| **D-1d** | Resend welcome-email template | 1 day | ✅ Shipped as part of F-2 — `SIGNUP_WELCOME` template in `lib/saas/notifications/templates.ts`. `/api/signup/complete` fires `dispatch('signup_welcome', ...)` immediately after org creation; Resend sends the HTML email with admin name, org name, and admin-shell URL. |
| **D-1f** | Subdomain DNS + Vercel routing validated for any slug | 1 day | ⏸ Deferred — operator-credential-gated. Requires Vercel project wildcard subdomain DNS (`*.starrsoftware.com` CNAME to `cname.vercel-dns.com`) configured in the Vercel dashboard + DNS provider. Once configured, every signed-up org's subdomain works automatically; no code change. Slug uniqueness + format validation already enforced server-side. |
| **D-1e** | Stripe subscription creation w/ trial_period_days = 14 + no card | 2 days | ⏸ Deferred until Stripe products exist (operator-credential-gated). The /api/signup/complete route currently creates a trialing subscription row in the local `subscriptions` table with metadata.stripe_pending=true; once Stripe products are created in the Stripe dashboard, this slice wires `stripe.subscriptions.create({customer, trial_period_days: 14, items: [...]})` and updates the row with stripe_subscription_id + stripe_customer_id. ~1 day of engineering once products are live. |
| **D-10a** | Pricing page redesign at `/pricing` w/ bundle cards + comparison table | 3 days | ⏸ Deferred — pricing page redesign is substantial UI work that touches the existing service-pricing calculator (different audience: Starr Surveying's own customers). The /signup wizard's plan-picker step already lets prospects pick bundles + see pricing; the marketing-page redesign is high-value but not blocking signup. Pick up once the SaaS has its first 3-5 paying customers and the marketing voice is clearer. |
| **D-10b** | Annual/monthly toggle wired | 1 day | ⏸ Deferred with D-10a (same page) |
| **D-10c** | FAQ accordion + service-pricing section retained | 1 day | ⏸ Deferred with D-10a |
| **D-10d** | Pricing page SEO (sitemap + schema.org structured data) | 1 day | ⏸ Deferred with D-10a — SEO most valuable after the page is final |

**Total: ~3 weeks**.

---

## 7. Open questions

1. **Default plan when no `?plan=` query.** Recommend: Firm Suite (highest ACV; can drop in step 1 if too expensive).
2. **Annual vs monthly default toggle.** Recommend: Annual (drives higher LTV; 20% savings visible).
3. **Step 3 password complexity rule.** Recommend: ≥8 chars, mixed case, one number. Bcrypt cost factor 10.
4. **Logo upload during signup.** Recommend: defer to org-settings post-signup; simplifies step 2.
5. **State selector.** Recommend: free-text with auto-suggest from US 50 states. Operator can add more later.
6. **Terms-of-Service link target.** Recommend: actual TOS lives at `/legal/terms` — needs to exist before signup launches.
7. **GDPR consent.** Defer for v1 (US-only); add when first European customer expresses interest.

---

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Signup completes locally but Stripe sub creation fails | High | Idempotency + automatic retry; pending state with 24h TTL; operator alert + manual provisioning path |
| Slug collision race (two signups for "acme" simultaneously) | Low | UNIQUE constraint on `organizations.slug` is source of truth; UI race is rare |
| Email service down → no welcome email | Low | Retry with backoff; magic-link in email is replaceable by signing in directly |
| User's chosen slug matches a reserved word (`www`, `admin`, etc.) | Low | Reserved list enforced server-side in /precheck |
| Subdomain DNS not propagated when user redirects | Low | Wildcard DNS pre-configured; subdomain works instantly |
| Trial abuse — same email signs up repeatedly with different orgs | Medium | Stripe customer dedup by email; rate-limit signups per email per 24h |
| Conversion rate too low | Medium | Iterate copy / placement; add testimonials when first happy customers exist |

---

## 9. Cross-references

- `STARR_SAAS_MASTER_PLAN.md` §1.1 (bundle proposal) + §4.1 (marketing surface)
- `CUSTOMER_PORTAL.md` §3.1 (pricing-page redesign) + §3.2 (signup wizard)
- `SUBSCRIPTION_BILLING_SYSTEM.md` §4.1 (signup → trial start flow)
- `app/pricing/page.tsx` — existing pricing page (Starr services calculator stays as bottom section)
- `app/api/contact/route.ts` — existing Resend wiring (reused for welcome email)
- `seeds/267_saas_customer_portal_schema.sql` — `org_invitations` table reused for cross-org-add scenario
