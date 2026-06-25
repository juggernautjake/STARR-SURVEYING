# Vercel Environment Variables — Checklist

Copy-paste reference for the backend website's env vars on **Vercel → Project →
Settings → Environment Variables**. Grouped by required vs optional. Set them for
the **Production** (and Preview) environments, then redeploy.

> **Secret vs public.** Anything starting with `NEXT_PUBLIC_` is shipped to the
> browser — only put non-sensitive values there. Everything else is server-only.
> Rows marked 🔒 are secrets: never expose them in `NEXT_PUBLIC_*`, the mobile app,
> client code, or screenshots.

---

## 1. Required — the site won't work without these

| Variable | 🔒 | Value / how to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | | Supabase → Settings → API → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔒 | Supabase → Settings → API → service_role key |
| `AUTH_SECRET` | 🔒 | Generate: `openssl rand -hex 32` (Auth.js v5 secret) |
| `NEXTAUTH_URL` | | `https://starr-surveying.com` (your live domain) |
| `GOOGLE_CLIENT_ID` | | Google Cloud → Credentials → OAuth client (Web) |
| `GOOGLE_CLIENT_SECRET` | 🔒 | same OAuth client |
| `ADMIN_EMAILS` | | Comma list, e.g. `hankmaddux@starr-surveying.com,jacobmaddux@starr-surveying.com` — these accounts auto-get admin |
| `RESEND_API_KEY` | 🔒 | resend.com → API Keys. **This is the live email provider** (contact form, invoices, customer/employee email). |
| `CRON_SECRET` | 🔒 | Any long random string (`openssl rand -hex 32`). Protects the scheduled jobs in `vercel.json` (e.g. the 6pm "still clocked in" reminder). |

> Auth.js v5 auto-trusts the host on Vercel, so you don't need `AUTH_TRUST_HOST`.
> `NEXTAUTH_URL` is still read by app code for callback/link building — set it.

---

## 2. Strongly recommended — work without them but you want them set

| Variable | 🔒 | Value |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | | `https://starr-surveying.com` — used to build invoice / share / receipt links (falls back to a hardcoded domain if unset). |
| `BUSINESS_EMAIL` | | `info@starr-surveying.com` — the business "from/reply" address context. |
| `NEXT_PUBLIC_APP_VERSION` | | e.g. `1.0.0` — shown in the UI footer. |

---

## 3. Mobile app distribution — set after you build the app

(From `mobile/README_TESTFLIGHT.md` Step 5. These light up the `/admin/install` page.)

| Variable | 🔒 | Value |
|---|---|---|
| `NEXT_PUBLIC_MOBILE_TESTFLIGHT_URL` | | Your TestFlight invite link |
| `NEXT_PUBLIC_MOBILE_ANDROID_APK_URL` | | Your signed `.apk` download URL |
| `NEXT_PUBLIC_MOBILE_APP_VERSION` | | e.g. `0.0.1` (matches `mobile/app.json`) |

---

## 4. Optional — only when you turn a feature on

### AI (receipt reading + property research)
| Variable | 🔒 | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | 🔒 | console.anthropic.com — enables AI receipt extraction + research analysis |
| `RESEARCH_AI_MODEL` | | default `claude-sonnet-4-6` |
| `CAD_AI_MODEL` | | model id for the CAD AI engine |
| `RESEARCH_MAX_FILE_SIZE_MB` | | default `50` |
| `RESEARCH_MAX_PROJECT_STORAGE_MB` | | default `500` |
| `ENRICHMENT_DISABLED` | | set `1` to turn off background enrichment |

### Property-research data providers (optional, improves research coverage)
| Variable | 🔒 | |
|---|---|---|
| `ATTOM_API_KEY` | 🔒 | property records |
| `REGRID_TOKEN` | 🔒 | parcel data |
| `TAVILY_API_KEY` | 🔒 | web search for research |

### Deep-research worker (separate DigitalOcean droplet — heavy scraping)
| Variable | 🔒 | |
|---|---|---|
| `WORKER_URL` | | e.g. `http://<droplet-ip>:3100` (canonical var) |
| `WORKER_API_KEY` | 🔒 | shared secret with the worker |

### Maps
| Variable | 🔒 | |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | | browser maps + address autocomplete |
| `GOOGLE_MAPS_API_KEY` | 🔒 | server-side geocoding (can be the same key, restricted) |
| `MAPBOX_ACCESS_TOKEN` | 🔒 | only if using the Mapbox service-area map |

### Billing (Stripe — only if charging customers)
| Variable | 🔒 | |
|---|---|---|
| `STRIPE_SECRET_KEY` | 🔒 | |
| `STRIPE_PUBLISHABLE_KEY` | | safe for client |
| `STRIPE_WEBHOOK_SECRET` | 🔒 | from the Stripe webhook endpoint |
| `STRIPE_PRICE_SURVEYOR_PRO`, `STRIPE_PRICE_FIRM_UNLIMITED` | | price IDs from Stripe → Products |

### SMS alerts (Twilio — only if sending texts)
| Variable | 🔒 | |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | 🔒 | |
| `TWILIO_AUTH_TOKEN` | 🔒 | |
| `TWILIO_FROM_NUMBER` | | your Twilio number |

### Other optional knobs
| Variable | 🔒 | |
|---|---|---|
| `NEXT_PUBLIC_WS_URL` + `WS_TICKET_SECRET` (🔒) | | real-time WebSocket channel (CAD progress); skip to use polling |
| `PAY_PORTAL_PASSWORD` (🔒) | | gate for the public pay portal |
| `PAYOUT_ADMIN_SELF_APPROVE` | | `true`/`false` payout policy |
| `IRS_MILEAGE_CENTS_PER_MILE` | | override the mileage reimbursement rate |
| `EMAIL_INBOUND_WEBHOOK_SECRET` (🔒) | | verify inbound-email webhooks |
| `COMPASS_/FORGE_/ORBIT_WEBHOOK_SECRET` + `_URL` | | third-party integration webhooks |
| `REDIS_URL` | 🔒 | BullMQ queue (batch jobs) |
| `GITHUB_TOKEN` (🔒) | | repo automation features |

> **Do NOT set `NEXT_PUBLIC_E2E_HARNESS` in production** — it's a test-only flag
> that mounts the UX harness routes.

---

## 5. Minimal "just go live" set

For a first production deploy where employees can log in, clock in, message,
email customers, and get alerts — set only **section 1** (10 vars), plus
`NEXT_PUBLIC_APP_URL` from section 2. Add section 3 after you build the mobile
app, and pull from section 4 feature-by-feature as you switch each on.
