# What Andrew's site will actually cost to run

**Written** 2026-08-02 · Prices verified against vendor documentation on that date.

---

## The short answer

| Stage | Monthly | What it covers |
|---|---|---|
| **Review / first year** | **$1–2** | Just the domain. Everything else is inside free tiers. |
| **Realistic working year** | **$6–7** | Domain + Cloudflare Workers paid tier once traffic or audio outgrows free. |
| **Comfortable, no-surprises** | **$26–32** | Adds Supabase Pro so the database never sleeps and backups are kept. |
| Plus, only when he earns | ~2.9% + 30¢ per card payment (Stripe). No monthly fee. |

**Give Andrew a figure of about $10/month for year one, and tell him it can reach $30 if the
business grows enough to need it.** That is honest at both ends, and the growth trigger is "clients
are paying you", which is the right time for a bill to appear.

---

## First: Squarespace cannot host this, and Google Drive cannot store it

You suggested Squarespace + Google Drive. I want to be direct about why that combination cannot
work, because it changes the plan rather than the price.

**Squarespace is a closed CMS.** You can build pages in their editor; you cannot deploy code to it.
There is no way to run a Next.js application, a Postgres schema, server-side API routes, a Stripe
webhook handler, or a service worker on Squarespace. Everything that makes this a *platform* rather
than a brochure — the widget builder, contracts, e-signature, invoicing, expenses, the client portal,
push notifications — is application code, and Squarespace has nowhere to put it.

If Andrew ever decides he wants a simple brochure site instead, Squarespace is a perfectly good
choice at $16–23/month. But it would be a *different product*, not this one moved.

**Google Drive is not an application storage backend.** It has no CDN URLs suitable for embedding
audio in a web page, its API is quota-limited per user in a way that breaks under page traffic, and
serving public web assets from a personal Drive is outside what the terms contemplate. Files are also
served slowly and with interstitial pages. Cloudflare R2 does this job properly and the first 10 GB
are free.

**What Google *is* good for here:** the domain (Google Domains moved to Squarespace Domains, so use
Cloudflare Registrar instead — it sells at wholesale cost), and Google Workspace if Andrew wants
`andrew@andrewashvoice.com` email at $7/user/month. Neither is required.

---

## The recommended stack

Chosen for: lowest cost that still permits commercial use, no cold-start surprises, and — critically
— **zero egress fees**, because a portfolio's whole job is serving audio and images to strangers.

| Layer | Service | Free tier | Paid |
|---|---|---|---|
| Hosting / app | **Cloudflare Workers + Pages** | 100k requests/day, unlimited bandwidth, commercial use allowed | **$5/mo** |
| Database | **Supabase** (Postgres) | 500 MB DB, 1 GB files, 5 GB egress — *pauses after 7 days idle* | **$25/mo** Pro |
| Media storage | **Cloudflare R2** | 10 GB + 1M writes + 10M reads/mo, **$0 egress** | $0.015/GB-mo |
| Domain | Cloudflare Registrar | — | **~$10–12/year** (~$1/mo) |
| Payments | Stripe | — | 2.9% + 30¢ per transaction |
| Transactional email | Resend | 3,000 emails/mo | $20/mo above that |
| Push notifications | Web Push (VAPID) | Free forever | — |

### Why not Vercel

Vercel's Hobby plan is free and would be the obvious choice — except its terms restrict it to
**non-commercial personal use**, and they enforce it. Andrew's site takes payments, so it is
commercial by their definition from day one. That makes Vercel **$20/month**, four times Cloudflare's
$5, for a site this size. Vercel is excellent; it is just the wrong price point here.

### Why Cloudflare R2 for audio specifically

Demo reels and session masters are the files that get downloaded repeatedly by strangers. On AWS S3,
egress is the line item that surprises people. R2 charges **nothing** for egress at any volume. A
50 GB library of reels and masters costs about **$0.60/month** and stays $0.60 whether ten people
listen or ten thousand.

### The one caveat: Supabase's free tier sleeps

The free database pauses after 7 days of inactivity and has to be woken. For a review site that is
fine — it wakes in seconds. For a live business where a client might load an invoice at 11pm, it is
not. That is the single reason to move to the $25 Pro tier, and it should happen the day Andrew
sends his first real invoice through the site, not before.

**Cheaper alternative if $25 is the sticking point:** Neon's free Postgres tier does not pause
(0.5 GB storage). It is a genuine option for year one; Supabase Pro is the better home once there is
revenue, because it bundles storage, backups and auth.

---

## Three worked scenarios

**Year one, reviewing and first few clients**
Domain $1 + everything else free = **$1/month.** ($12 for the year.)

**Working freelancer — a few thousand visitors, 20 GB of audio, live invoicing**
Domain $1 + Workers $5 + Supabase Pro $25 + R2 $0.30 = **~$31/month.**
On ~$1,500/month of voice work that is 2% of revenue.

**Deliberately lean — same business, Neon instead of Supabase Pro**
Domain $1 + Workers $5 + Neon free + R2 $0.30 = **~$6/month.**

---

## Migration effort

The build has been kept portable from the first commit, so this is a real estimate rather than a
hope:

- Everything lives in `app/AndrewAsh/`, `lib/voice/`, `public/andrew/`, `public/AndrewAsh/` and two
  seed files.
- It imports **exactly one** thing from the Starr codebase (`@/lib/supabase`), which is a ~10-line
  shim on the new project.
- It has its own auth, its own tables (all prefixed `va_`), its own header/footer, its own
  stylesheet and its own service worker.
- The stylesheet carries a scoped reset specifically so it looks identical on a clean host.

Expect **half a day** to stand up a new repository, point a domain at it, run the two seed files, and
move the media. Not a rewrite.

---

## What I would tell Andrew

> Hosting is about **$10 a month** for the first year — mostly just the domain, because everything
> else fits in free tiers at your volume. If it grows to the point where you are invoicing regularly
> through it, budget **$30 a month**. Stripe takes 2.9% + 30¢ of anything you actually get paid, and
> charges nothing otherwise.
>
> For comparison, a Squarespace site alone is $16–23/month and could not do the contracts, invoicing
> or client portal at all.

---

## Sources

- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [Pages + Workers 2026 comparison](https://costbench.com/software/cloud-infrastructure/cloudflare-pages-workers/)
- [Cloudflare R2 pricing 2026](https://www.budgetforge.dev/tools/cloudflare-r2-pricing-2026) · [R2 vs S3 vs B2](https://tech-insider.org/cloudflare-r2-vs-s3-vs-backblaze-b2-2026/)
- [Supabase pricing 2026](https://uibakery.io/blog/supabase-pricing) · [Neon free tier](https://www.freetiers.com/directory/neon)
- [Vercel Hobby plan terms](https://vercel.com/docs/plans/hobby) · [Vercel fair-use guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
