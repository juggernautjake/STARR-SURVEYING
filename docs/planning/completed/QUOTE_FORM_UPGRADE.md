# Quote Form Upgrade

Customer-facing quote-request flow needs four things:

1. **Banner on the homepage form** that routes to the quote estimate
   calculator (`/pricing`) — “Try our quote estimate calculator now!”
2. **New required fields** on the quote form: Property Street Address
   (already required), **Property ID** and **County** (new). Apply to
   both the home page form and `/contact`.
3. **File / image attachments** on the quote form so customers stop
   trying to attach files to a direct email and getting nowhere.
4. **Email deliverability** investigation for `info@starr-surveying.com`.
   Customers report emails to that address “don’t work”. Symptoms are
   not fully understood — could be the form pathway, the direct-mailbox
   pathway, or both. Cover the form pathway in code; write a one-pager
   checklist for the direct pathway (DNS, MX, SPF/DKIM/DMARC) since
   that is a registrar/email-provider issue, not a code issue.

## 1. Current state of the code

- **Homepage form** lives inline in `app/page.tsx:396-636`. Uses
  `useState<ContactFormData>` with fields `name, email, phone, company,
  propertyStreet, propertyCity, propertyNumber, serviceType,
  projectDetails, preferredContact, howHeard`. Submits JSON to
  `/api/contact` (line 172).
- **/contact page form** in `app/contact/page.tsx` is a near-duplicate
  of the homepage form. Same field shape; same submit target.
- **API route** `app/api/contact/route.ts` is a ~1100-line file with
  HTML + plain-text email templates, Resend transport, reference-number
  generation. Sends two emails: a business notification (to
  `info@starr-surveying.com` + `starrsurveying@yahoo.com`) and a
  customer confirmation. Resend `from:` is
  `Starr Surveying <noreply@starr-surveying.com>`; `reply_to:` is set
  to the customer’s email for the business notification, and to
  `info@starr-surveying.com` for the customer confirmation.
- **No file-upload infrastructure** on the public-facing forms today.
  The admin section has a `media_library` upload route
  (`app/api/admin/media/route.ts`) and a `JobFileManager` UI but they
  are auth-gated and not the right surface for unauthenticated quote
  requests.
- **/pricing** hosts the `SurveyCalculator` component
  (`app/components/SurveyCalculator.tsx`), dynamically imported. That
  is the “quote estimate calculator” page the banner should route to.

## 2. Slices

| Slice | Description | Status |
|-------|-------------|--------|
| **A** | Banner above the homepage quote form linking to `/pricing` with copy “Try our quote estimate calculator now!”. Single CSS section + Link. | ✅ Shipped — added a gradient banner card (red→blue, matches the email-header palette) immediately after the contact section subtitle in `app/page.tsx`. Banner wraps a `<Link href="/pricing">` so it routes to the quote estimate calculator page. Sub-line copy: “Get an instant price range in under a minute — no waiting.” Hover lifts + brightens with the arrow shifting right. Mobile breakpoint (≤480px) scales padding + font sizes down. CSS lives in `app/styles/Home.css` under `.home-contact__calc-banner*`. Typecheck clean; 151/151 calc tests still pass. |
| **B** | Add **Property ID** + **County** as required fields on both forms (homepage + `/contact`). Wire through `IncomingFormData` / `NormalizedData` in `/api/contact`, render in both business + customer email templates (HTML and plain-text). | ✅ Shipped — added a new required **County** field (state key `propertyCounty`) and promoted the previously-optional Property / Account Number to a required **Property ID** (state key kept as `propertyNumber` for API compat) on both `app/page.tsx` (homepage) and `app/contact/page.tsx` (contact page). Client-side validation gates submit on all three new required values plus the existing name/email/phone/street/city. `/api/contact/route.ts` now: (1) types `propertyCounty` + `property_county` in `IncomingFormData`, (2) carries `propertyCounty` in `NormalizedData`, (3) normalizes from either casing, (4) server-side validates that contact-form submissions (non-calculator source) include propertyAddress + propertyCounty + propertyNumber and returns a clear 400 if missing, (5) renders the new County row + renamed "Property ID" label in both HTML email templates (business notification + customer confirmation) and both plain-text variants. The pricing-calculator submission path (source === 'pricing-calculator') is unaffected — it has its own internal validation. Typecheck clean; 151/151 calc tests pass. |
| **C** | File-attachment uploader on both forms. Accept wide-open file types (images: png/jpg/jpeg/gif/webp/heic; pdf; docs: doc/docx/xls/xlsx/csv/txt; CAD: dwg/dxf/kml/kmz). 25 MB total, up to 10 files. Switch `/api/contact` body from JSON to `multipart/form-data`, attach each file to the Resend business notification email via the `attachments` array. Customer confirmation lists filenames + sizes for receipt. | ✅ Shipped — added attachment uploader to both home + /contact forms with the file-type allowlist + 10-file / 25-MB caps. New `lib/quote-attachments.ts` is the single source of truth for the allowlist, caps, validator, and `formatBytes` helper — imported by both client pages and the server route. **Client**: each page now has an `attachments: File[]` state, a hidden file input wrapped in a labeled "Choose files…" button, an inline list of currently-attached files (name + size + ✕ remove), and switches the fetch body to `FormData` when files are present (otherwise stays JSON for back-compat with the calculator and the previous JSON flow). Validation happens at the point of file-pick: invalid type or exceeded cap shows the existing form-level error and rejects the addition. **Server**: `/api/contact/route.ts` now branches on `Content-Type` — JSON path stays untouched; the new multipart path uses `request.formData()`, decodes each `attachments` File to base64 `Buffer`, re-validates server-side (treat client as untrusted), passes the array to a new optional `attachments` parameter on the Resend `sendEmail()` helper, which sets the `attachments` field on the Resend API payload. **Email templates**: business HTML email now renders an "Attachments (N)" section listing filenames + sizes; customer confirmation HTML shows a "Files You Sent (N)" receipt section; both plain-text variants include the same summary. Files attach only to the business notification — customers already have the originals locally so the confirmation just lists what they sent. **CSS**: both `app/styles/Home.css` and `app/styles/Contact.css` get matching `.<scope>__attachments*` rules — labeled choose-files button (brand blue), 0.8rem hint copy, attachment row pills with name + size + circular remove button. Typecheck clean; 151/151 calc tests pass. |
| **D** | **Email deliverability diagnostic doc** for the direct-to-`info@starr-surveying.com` pathway. Single-page checklist: Resend dashboard (sender domain verified? bounces? rate-limited?), DNS records (SPF includes resend? DKIM CNAMEs published? DMARC policy?), and MX records for `starr-surveying.com` (is the mailbox itself receiving — Google Workspace? Zoho? somewhere else? are MX records published correctly?). | ✅ Shipped — `docs/platform/EMAIL_DELIVERABILITY.md` is the new runbook. Splits the diagnosis into two independent pathways: (1) **outbound from the website** (Resend API key, sender domain verification, recipient list, send activity, bounces — all controllable from the codebase + Resend dashboard) and (2) **inbound to the mailbox** (MX records, the `info@` mailbox existing at whatever inbox host owns the domain, SPF/DKIM/DMARC policy — all outside the codebase, requires registrar + inbox-host access). Includes a failure-mode fingerprint table for the common symptoms ("customer fills form, no notifications" → likely RESEND_API_KEY missing; "customer emails directly, gets a bounce" → likely no MX record or no `info` alias) and a five-step form-submit smoke test for end-to-end verification. The doc explicitly notes that pathway 2 issues cannot be fixed from code — they require DNS / inbox-host changes — which is why the in-code work for slices A–C is the right scope and pathway-2 problems belong on the registrar / Workspace admin side. |

## 3. Risk + mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Multipart switchover breaks the existing JSON callers (calculator, contact page) | High | Keep the route backwards-compatible: detect `Content-Type` and branch. JSON callers stay JSON; the new multipart path is for forms that include files. |
| 25 MB email exceeds Resend’s per-message cap | Medium | Resend hard cap is ~40 MB. 25 MB total leaves headroom for HTML body + headers. Server-side reject above 25 MB with a clear error. |
| Customers upload malicious or oversized files | Medium | Server-side MIME validation, extension whitelist, per-file 10 MB cap, total 25 MB cap. Files are forwarded to Resend, never persisted to disk. |
| Sender domain unverified on Resend dashboard | High (if true) | Diagnostic doc walks through what to check. Don’t silently fail; surface `Resend API error` in server logs. |

## 4. Out of scope

- Persisting submissions to the database (the API today doesn’t do
  this; out of scope for this round).
- Anti-spam (CAPTCHA, rate-limiting). Existing form has none; not
  changing that in this slice.
- Long-running upload UX (progress bars beyond a simple loading
  state) — keep the UX simple.

## 5. Audits

- **V-A**: visual check that the homepage banner renders above the
  quote form and routes to `/pricing` correctly.
- **V-B**: form-submit smoke test that Property ID + County are
  required, and that they show up in the business + customer emails.
- **V-C**: form-submit smoke test with an image, a PDF, and a doc;
  verify the Resend payload includes the `attachments` array and the
  business email arrives with the files.
- **V-D**: read the diagnostic doc against the live Resend dashboard
  + the registrar DNS records.
