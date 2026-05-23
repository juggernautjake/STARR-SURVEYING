# Email Deliverability Runbook

When customers report that emails to `info@starr-surveying.com` "don't
work", there are two completely independent pathways that could be
broken. Diagnose each one separately.

| Pathway | What it is | Who controls it |
|---------|-----------|-----------------|
| **Outbound from the website** | Quote / contact form submissions sent via Resend, addressed to `info@starr-surveying.com` (and `starrsurveying@yahoo.com`) | This codebase + the Resend dashboard |
| **Inbound to the mailbox** | A customer typing `info@starr-surveying.com` into their email client and hitting send | The DNS provider (registrar) + the inbox host (Google Workspace, Zoho, Yahoo, etc.) |

## Pathway 1: outbound from the website

This is the path the quote / contact form takes:

```
Customer browser
  → POST /api/contact            (Next.js route)
  → fetch('https://api.resend.com/emails')
  → Resend delivers to:
      info@starr-surveying.com
      starrsurveying@yahoo.com
```

### Checklist

1. **Is `RESEND_API_KEY` set in production?** The route checks for it
   in `app/api/contact/route.ts`. If missing or set to the placeholder
   `your_resend_api_key`, the route silently returns success in dev
   mode and never sends.
   - Vercel / hosting dashboard → Environment Variables → `RESEND_API_KEY` exists?
2. **Is the sending domain verified on Resend?** The `from:` is
   `Starr Surveying <noreply@starr-surveying.com>`. If `starr-surveying.com`
   is not verified in the Resend dashboard, every send fails.
   - resend.com/domains → look for `starr-surveying.com` → Status = "Verified"?
   - If pending/failed: Resend lists DNS records (3× CNAME for DKIM,
     1× TXT for SPF include, optionally 1× MX for bounces). Publish
     those records at the registrar. Allow 5–60 minutes.
3. **Are sends actually happening?** Resend dashboard shows every API
   call. If the count is zero around the time customers reported the
   issue, the calls are not reaching Resend — server error or missing
   key. Server logs in Vercel show `Resend API error:` lines when the
   API rejects a send.
4. **Are sends being delivered?** Resend's "Activity" tab shows
   delivered / bounced / complained for each message. If bounces:
   click into one — the bounce reason is usually clear (mailbox
   doesn't exist, spam-blocked, rate-limited).
5. **Is the recipient list right?** `EMAIL_RECIPIENTS` in
   `app/api/contact/route.ts:8-11` is the source of truth. Today it's
   `info@starr-surveying.com` + `starrsurveying@yahoo.com`. If a team
   member should also be notified, add their address there.
6. **Are emails landing in spam?** Check the actual inbox: junk
   folder, then verify SPF/DKIM/DMARC (next section).

## Pathway 2: inbound to the mailbox

This pathway is **outside the website**. It is purely DNS + the
inbox host. The codebase cannot fix it.

### Checklist

1. **Where does mail for `starr-surveying.com` actually land?** Look
   up the MX records:
   ```
   dig MX starr-surveying.com +short
   ```
   The output tells you which inbox host owns the mailbox. Common
   answers:
   - `aspmx.l.google.com.` — Google Workspace
   - `mx.zoho.com.` — Zoho Mail
   - `mx1.starr-surveying.com.` — self-hosted (unlikely)
   - empty / no MX — **nothing receives mail at this domain at all**

   If there is no MX record, customers emailing `info@starr-surveying.com`
   directly will always bounce. Add MX records at the registrar
   pointing at whichever inbox host you intend to use.

2. **Does the `info@` mailbox exist at the inbox host?** Log into the
   chosen host (e.g. admin.google.com for Workspace) and confirm
   there is a user or alias for `info`. If the MX record points at
   Google Workspace but no `info` user exists, mail bounces with
   "address not found".

3. **SPF record published?** A TXT record on `starr-surveying.com`
   that includes the senders allowed to mail from this domain.
   Resend wants its server included:
   ```
   v=spf1 include:_spf.resend.com include:_spf.google.com ~all
   ```
   (Adjust the second `include:` based on your inbox host.)

4. **DKIM CNAMEs published?** Resend's domain-verification step
   provides three CNAME records. They must exist for outbound mail
   to authenticate. Without them, receivers (Gmail, Yahoo) silently
   drop messages or flag them as spam.

5. **DMARC policy published?** A TXT record on
   `_dmarc.starr-surveying.com`. A reasonable starter:
   ```
   v=DMARC1; p=quarantine; rua=mailto:postmaster@starr-surveying.com
   ```
   Without DMARC, Gmail in particular increasingly silently
   quarantines.

## Common failure-mode fingerprints

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Customer fills out form, never gets a confirmation reply, team never gets notified | `RESEND_API_KEY` missing in production, or sending domain unverified | Re-check env vars + Resend dashboard |
| Customer fills out form, gets a confirmation, team never gets notified | `EMAIL_RECIPIENTS` typo, or recipient inbox bouncing | Check Resend Activity tab for bounces |
| Customer emails `info@starr-surveying.com` directly, gets a bounce | No MX record, or no `info` mailbox at the inbox host | Publish MX + create `info` alias at the inbox host |
| Form submissions land in Yahoo but not Gmail | SPF or DKIM missing / misconfigured | Publish records per Resend's domain-verification step |
| Some submissions arrive, others don't | Rate-limit hit on Resend free tier, or recipient marked the sender as spam | Check Resend usage; consider a paid tier |

## Form-submit smoke test

To verify the outbound path end-to-end:

1. Fill out the homepage quote form with a real email you control,
   one attachment, and clearly-fake project details ("test from
   $YOURNAME at $TIMESTAMP").
2. Submit.
3. **Confirm in Resend Activity** that two emails went out (business
   + customer confirmation).
4. **Confirm in your test inbox** that the customer confirmation
   arrived (and lists the attachment by name).
5. **Confirm in `info@starr-surveying.com`** that the business
   notification arrived with the attachment.

If step 4 succeeds but step 5 fails, the problem is on the inbound
pathway — see Pathway 2.

If step 3 fails, the problem is in the codebase or env vars —
re-check `RESEND_API_KEY`.

## Related code

- `app/api/contact/route.ts` — sender, recipients, template, Resend wrapper
- `lib/quote-attachments.ts` — attachment validation
- `app/page.tsx` — homepage quote form
- `app/contact/page.tsx` — `/contact` form
