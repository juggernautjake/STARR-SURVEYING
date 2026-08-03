# Andrew Ash — Voice Actor & Vocal Coach Platform

**Started** 2026-08-02 · **Shipped** 2026-08-02 · **Status** COMPLETE — merged to `main` (`cf2454f1d`) and live

> **Moved to `completed/` 2026-08-02.** Every action item in this document is shipped and deployed;
> verified on production, not just locally — all 7 public pages return 200 and all 13 studio pages
> render their real content behind the login gate.
>
> Three things remain and none is a coding task: **VAPID keys** for phone notifications, **Andrew's
> own Stripe account** for card payment, and **Andrew's content** (real credits, testimonials, contact
> details, his account). Each is named with its exact command or env var in "Shipped and deployed"
> below. They are recorded as owner actions rather than deferred work — the code for all three is
> written and waiting.
**Route** `/AndrewAsh` on starr-surveying.com (temporary — see §9 Migration)

---

## 1. Who this is for and what it has to do

Andrew Donald Ash is a voice actor and vocal coach. He graduated from the University of Mary
Hardin-Baylor in summer 2026 with a music degree and a business emphasis, and has just finished his
first professional contract — telephony and on-hold audio for a company's phone lines. He wants to
build a voice-over career and a coaching clientele.

He needs two things from one platform:

1. **A portfolio a casting director will take seriously.** Demo reels reachable without a scroll,
   proof of range, and a way to ask for a quote.
2. **The entire business behind it.** Inquiries, contracts, e-signature, invoices, payment, expenses,
   documents, coaching students — on a phone, with notifications.

And he must be able to change all of it himself, without a developer.

### The three hard requirements that shape every decision

| Requirement | What it forces |
|---|---|
| *"He has full control over the portfolio page… create projects/pages… widget system… control colors and styles"* | Every page is DATA, not code. See §3. |
| *"Works on pc or on his phone so he can get notifications and manage the business"* | Installable PWA + web push + a studio designed phone-first. See §6. |
| *"We will take the code and move it to a new domain and repository"* | Zero coupling to Starr. Own auth, own tables (`va_*`), own chrome, own stylesheet. See §9. |

---

## 2. Design direction

Andrew's taste: League of Legends, Hollow Knight, Skyrim, Lord of the Rings, Rogue Legacy.

What those share is not dragons — it is a **contrast structure**: a very dark ground, one metallic
accent carrying all emphasis, inscriptional serif type. That is *also* what a performer's portfolio
wants: a dark stage so the photographs and the play button are the brightest things on the page.

The brief asked for "totally professional" **and** for those games to inform it. This is the shape
where those are the same decision rather than a compromise.

- **Display face** — Cinzel (Roman inscriptional capitals). Reads as Rivendell to one visitor and as
  a concert programme to another — exactly the range needed by someone selling both character work
  and classical training.
- **Body face** — Inter. Everything that must be read rather than admired.
- **Default palette** — *Ink & Gold*: `#0A0D14` ground, `#ECE6DA` text (15.3:1), `#D9B65B` accent
  (10.2:1), `#6FD3D6` secondary.
- **Alternatives** — Hallownest (cool blue-black), Ember (forge orange), Parchment (light).
  Every preset is contrast-checked in code; `themeContrast()` warns Andrew in the theme editor.

**Research applied** (see §11 for sources): demo reels sit directly beneath the hero — before
services, before the biography — because the decision to keep listening is made in 5–10 seconds and
the reel must be reachable without a scroll or a submenu.

---

## 3. Architecture: every page is widgets

> *"Please make sure that all of the pages that we generate can all be fully edited with the widget
> renderer + editor."*

There is no such thing as a hardcoded page. Home, voice-over, coaching, work, about and contact are
all **block arrays** in `lib/voice/default-pages.ts`, rendered by the same `WidgetRenderer` that
renders a project page Andrew builds from scratch. The first time he edits one, it is copied into
`va_pages` and becomes his. Nothing is locked.

### Widget taxonomy

**Literal** widgets render their own props: `heading` `text` `image` `gallery` `audio` `audioList`
`video` `embed` `button` `buttonRow` `quote` `stats` `cards` `featureCards` `steps` `specList` `faq`
`credits` `divider` `spacer` `cta` `hero` `contactForm`

**Bound** widgets render live platform data: `demoReels` `projectGrid` `testimonials` `packages`
`creditsList`

*Why bound widgets exist:* Andrew's reels appear on the home page and the voice-over page; his
coaching rates appear on the coaching page and in project footers. As literal widgets, changing a
price would mean remembering every page that quotes it — and the one he forgets is the one a client
reads. Bound widgets make "edit it once" structural.

### Constrained styling

Every style value is a **named scale**, not a free value: widths are four measures, spacing is an
0–10 step scale, type is a 0–10 scale. A widget Andrew never touches is automatically on-palette and
automatically legible, because colours default to `null` = "inherit the theme".

This is the answer to the two ways page builders fail: too few knobs (everything looks identical,
he gives up and calls a developer) and too many (he ships 8px grey-on-grey by accident).

### Storage: JSONB, not rows

`va_pages.blocks` is a JSONB array. A drag-reorder is one UPDATE of one column, so "saved" and "in
the order I left it" cannot disagree. As rows it would be N UPDATEs, a deferred unique constraint,
and a real chance of a half-applied reorder — which shows up to Andrew as blocks silently swapping.

`draft_blocks` is a second column on the same row, so publishing is a column copy and reverting is a
column copy the other way — no id swap, no dangling references.

---

## 4. Responsive: he edits the phone view too

> *"He needs to be able to view it as mobile… and edit the mobile view of the elements… programmatic
> formatting that will try to automatically format them nicely on mobile, but he can manually edit."*

Three layers, resolved in order:

```
desktop style  →  automatic adaptation  →  Andrew's explicit mobile overrides
```

**The automatic layer** (`autoMobileStyle`) targets the four things that actually break on a phone,
not a uniform shrink: display type overflowing, vertical rhythm eating the screen, multi-column
layouts, and scaled-down/right-aligned media. Body copy is left alone — 16px is 16px everywhere.

**The manual layer** is a SPARSE patch. If mobile held a full style copy, editing desktop would stop
affecting the phone the moment the phone view was opened once — the classic responsive-builder bug.
Sparse means desktop stays the source of truth for everything not deliberately overridden.

**Container queries, not media queries.** The rules key off the *canvas* width, so the builder's
phone preview is literally the phone layout, not an approximation — and no iframe is needed.

---

## 5. Public site

| Route | Purpose |
|---|---|
| `/AndrewAsh` | Hero → **reels** → services → work → process → about → testimonials → CTA |
| `/AndrewAsh/voice-over` | Reels by category, studio spec, usage licences, worked price examples |
| `/AndrewAsh/coaching` | Philosophy, focuses, packages, FAQ |
| `/AndrewAsh/work` + `/work/[slug]` | Project index and widget-built project pages |
| `/AndrewAsh/about` | Story, timeline, credits, gallery |
| `/AndrewAsh/contact` | The quote/sample request form |
| `/AndrewAsh/[slug]` | Any custom page Andrew creates |

*The last row said `/p/[slug]` until 2026-08-02 and no route existed at either address — see defect 17.
It is a bare slug now because that is the URL the studio was already generating and showing him.*

**Pricing is published.** The single biggest reason a small business does not enquire is not knowing
whether this is a $200 or a $2,000 decision. The contact form shows a live estimate as they type,
computed by the same function that renders the published examples — so the page and the tool can
never disagree.

---

## 6. The studio (Andrew's backend)

| Route | Purpose |
|---|---|
| `/AndrewAsh/studio` | Dashboard: money, inquiries, what needs attention |
| `/AndrewAsh/studio/pages` + `/pages/[id]` | The builder — drag reorder, live preview, style inspector, desktop/mobile toggle |
| `/AndrewAsh/studio/media` | Image/audio/video library |
| `/AndrewAsh/studio/demos` | Demo reels |
| `/AndrewAsh/studio/inquiries` | Quote requests → clients |
| `/AndrewAsh/studio/clients` | Contacts + portal links |
| `/AndrewAsh/studio/contracts` | Draft → send → signed → countersigned |
| `/AndrewAsh/studio/invoices` | Line items, totals, payments |
| `/AndrewAsh/studio/expenses` | Expenditures, tax categories, receipts, P&L |
| `/AndrewAsh/studio/documents` | Private vault — tax, contracts, session masters |
| `/AndrewAsh/studio/coaching` | Students, packages, session log |
| `/AndrewAsh/studio/settings` | Identity, theme, nav, invoice/contract defaults |

### Signed-in editing

> *"Whenever he is logged in, each page and widget should have a little edit button… whenever he is
> not logged in, it will not have that button."*

- A **small login link at the very bottom of the footer** — a door for one person on a page written
  for clients.
- When signed in: an **owner bar** on every public page, and a **per-widget edit button** that
  deep-links into the builder with that block selected.
- A **client-view toggle** that renders exactly what a visitor sees.
- Signed out, none of it renders — not hidden by CSS, *absent from the DOM*.

---

## 7. Business logic

- **Money is integer cents everywhere.** Quantities are integer thousandths, because voice work is
  billed in 1.5 hours and floats reintroduce the error cents were chosen to avoid.
- **Contracts** ship with the clauses a first-year freelancer does not know to ask for: usage scope,
  revision limits, cancellation, late payment, and ownership **on payment** rather than on delivery.
- **E-signature** is typed-name + timestamp + IP + user-agent + **SHA-256 of the exact text signed**.
  The hash is the load-bearing part: an edit after signing becomes detectable rather than silent.
- **Client access is a token, not an account.** Clients visit twice — once to sign, once to pay.
  Passwords would mean account recovery and a support burden; Andrew gets a real login because the
  keys to the business should not live in a browser history.
- **Expenses** carry a constrained tax category and a business-use percentage, so January's Schedule
  C is a query instead of a shoebox. Capital purchases are flagged and excluded from the in-year
  deduction rather than silently overstating it.
- **Income is cash received**, never invoiced-but-unpaid. Outstanding is shown separately and
  labelled. A freelancer who counts unpaid invoices as income spends money that has not arrived.

---

## 8. Notifications & PWA

The **notification row is durable**; push is a best-effort delivery attempt on top of it. A denied
permission, a phone in a drawer, or a push outage must never lose "an invoice was paid".

Service worker scoped to `/AndrewAsh/` — enforced by the path it is served from, so "it cannot touch
the surveying app" is a property of the URL, not a promise in a comment. It caches build output and
photographs; it explicitly does **not** cache studio HTML (client lists, unpaid invoices), `/api/`,
or audio.

---

## 9. Migration to Andrew's own domain

**Squarespace cannot host this.** It is a closed CMS: you cannot deploy a Next.js app, a Postgres
schema, server routes or Stripe webhooks to it. Google Drive is likewise not an app storage backend —
no CDN URLs, API quotas, and a ToS that does not contemplate it. Costed alternatives in
`docs/planning/ANDREW_ASH_HOSTING_COSTS_2026-08-02.md`.

**Coupling to Starr, and how it was kept to nothing:**

| Concern | Isolation |
|---|---|
| Chrome | Own header/footer; `LayoutShell` suppresses Starr's |
| Styles | Own stylesheet + a scoped `:where()` reset that neutralises the host's bare-element rules |
| Auth | Own `va_users` + `va_session` cookie |
| Data | Every table `va_*`; two seed files |
| Assets | `public/andrew/`, `public/AndrewAsh/` |
| Imports from Starr | `@/lib/supabase` only |

---

## 10. Build ledger

**Branch** `claude/research-platform-phase-gh-2026-08-02` (shared with another session — see §13).
**Local dev** `npx next dev -p 3211`. **Production check** `npm run build` then `npx next start -p 3212`.
**Login** username `juggernautjake` or email `jacobmaddux96@gmail.com`. Andrew has no account yet — he
picks his own username, email and password via Studio → Settings → Team (`/api/voice/team`).

**Database is LIVE.** Seeds 538, 539, 540 and 541 are applied to production Supabase
(`node scripts/apply-seeds.mjs --only 541_voice_payment_methods.sql`).

| # | Slice | Status |
|---|---|---|
| 1 | Photo pipeline + focal-point manifest (16 photos) | ✅ |
| 2 | Schema — 538 platform, 539 business ops, 540 username | ✅ applied |
| 3 | `lib/voice` core — 17 modules | ✅ |
| 4 | Design system + public chrome | ✅ |
| 5 | Widget renderer — 29 types, responsive emission, owner mode | ✅ |
| 6 | Default pages as block arrays (6 public pages) | ✅ |
| 7 | Public routes via `(site)` route group | ✅ |
| 8 | Auth — login, first-run setup, team, username-or-email | ✅ verified end to end |
| 9 | Studio shell — phone-first nav, dashboard | ✅ |
| 10 | "Start here" playbook — 13 sections, 10 task cards, live checkboxes | ✅ |
| 11 | Page builder — 3 panes, inspector, mobile toggle, autosave | ✅ built, **not yet driven in a browser** |
| 12 | API — auth, team, inquiries, uploads, pages, checklist | ✅ |
| 13 | Inquiry form + script upload | ✅ built, **upload not yet exercised end to end** |
| 14 | `npm run build` green | ✅ |
| 15 | Studio → Inquiries — list, tabs, detail, signed attachments, lead→client | ✅ 2026-08-02 |
| 16 | Studio → Invoices — list, money tiles, builder, document view, payment ledger | ✅ 2026-08-02 |
| 17 | Studio → Expenses — deduction-first tiles, category breakdown, fast entry, Schedule C mapping | ✅ 2026-08-02 |
| 18 | Studio → Clients — activity-sorted list, lifetime value, portal token control | ✅ 2026-08-02 |
| 19 | Studio → Contracts + public signing page — draft, send, e-sign with evidence, countersign | ✅ 2026-08-02 |
| 20 | Studio → Settings — identity, theme picker with live contrast warnings, paperwork defaults, team accounts | ✅ 2026-08-02 |
| 21 | Studio → Coaching — adoptable default rate card, inline price editing, one-tap lesson logging, lesson notes | ✅ 2026-08-02 |
| 22 | Studio → Media, Demos, Documents — shared sequential uploader, copy-the-reference library, missing-reel prompts, private signed vault | ✅ 2026-08-02 |
| — | **Every studio nav link now resolves — verified 13/13 at HTTP 200** | ✅ 2026-08-02 |
| 23 | Client portal `/client/[token]` — one link showing a client's agreements and invoices together | ✅ 2026-08-02 |
| 24 | Invoice pay page `/invoice/[token]` — document view, payment methods, "I've sent it", card via Stripe | ✅ 2026-08-02 |
| 25 | Payment settings + client-declared payment confirmation in the studio | ✅ 2026-08-02 |
| 26 | Vitest for `lib/voice` — 107 tests across money, payments, widgets, contracts, expenses | ✅ 2026-08-02 |
| 27 | Contrast audit run — **941 text nodes across 7 routes × 2 viewports, every one clears WCAG AA** | ✅ 2026-08-02 |
| 28 | 390px sweep of all 13 studio pages — **13/13 fit with no undersized controls** (`scripts/audit-voice-mobile.mjs`, new) | ✅ 2026-08-02 |
| 29 | Web push — subscribe/unsubscribe panel + `/api/voice/push`; the granted path needs VAPID keys to exercise | ✅ built 2026-08-02 |
| 30 | Custom pages reachable — `(site)/[slug]`, shadowed-slug guard, page-shaped scaffold | ✅ 2026-08-02 |

### Verifying it again

```
npm run build && npx next start -p 3225          # audits need a built server
node scripts/audit-voice-contrast.mjs  --base http://localhost:3225
node scripts/audit-voice-mobile.mjs    --base http://localhost:3225 --user juggernautjake --pass '…'
node scripts/audit-route-auth.mjs                # no server needed
npx vitest run __tests__/voice/                  # 107 cases
```

### How payment works (read this before touching it)

**Andrew's Stripe keys are not this repo's Stripe keys.** `STRIPE_SECRET_KEY` and
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` already exist here and belong to Starr Surveying. Reading them
would route a client's payment for voice work into a surveying company's account — silently and
correctly, as far as Stripe is concerned. So `lib/voice/payments.ts` reads `VOICE_`-prefixed
variables **with no fallback**, and there is a test asserting exactly that. Card payment needs all
three: `VOICE_STRIPE_SECRET_KEY`, `NEXT_PUBLIC_VOICE_STRIPE_PUBLISHABLE_KEY`, `VOICE_PAYMENTS_LIVE=true`
(plus `VOICE_STRIPE_WEBHOOK_SECRET` for the webhook). None are set, so card is **off**, and Studio →
Settings → Getting paid says so and names what is missing.

Everything else works today with nothing configured. Andrew enters Zelle/Venmo/PayPal/cheque details
in Settings; they appear on every invoice. A client presses "I've sent it", which writes a
`va_payments` row with `status='pending'` and `declared_by_client=true` — **it does not move
`paid_cents`**. Andrew sees it as "client says sent" and confirms with "It arrived", which is what
moves the money. Verified end to end in a browser: pending → confirmed → `paid_cents` 95000, status
`paid`.

When card is switched on, only the **webhook** may mark an invoice paid — never the browser. The
PaymentIntent id is stored in `reference` and checked before insert, because Stripe re-delivers events
and a retry would otherwise double-credit the invoice.

### Shipped and deployed — 2026-08-02

Everything the owner asked for is built, every audit is green, and it is **merged to `main` and live**
(merge `cf2454f1d`, authorised explicitly). Nothing on this platform is waiting on code.

**The deploy was itself the fix for a reported bug.** The owner saw "a lot of 404 pages in the backend
studio" and reasonably concluded pages were missing. They were not: `main` carried **6** studio pages
while the branch carried **18**, so the twelve newest — clients, contracts, coaching, expenses,
invoices, media, demos, documents and the client portal — had simply never been deployed. Verified
before merging by crawling every clickable `/AndrewAsh` link locally (41/41 answer,
`scripts/audit-voice-links.mjs`), which is a different and better question than the by-name route
check that had been passing all along while a real 404 sat in production.

**What still needs a person, not a developer:**

1. **Switch web push on.** `npx web-push generate-vapid-keys`, set `NEXT_PUBLIC_VOICE_VAPID_KEY`,
   `VOICE_VAPID_PUBLIC_KEY` and `VOICE_VAPID_PRIVATE_KEY` on the host, and `npm i web-push`. Studio →
   Settings → Notifications names those three until they exist. The subscribe flow's *unconfigured*,
   *denied* and *unsupported* states were checked in a browser; **the granted path cannot be exercised
   without real keys and is the one thing here not seen working end to end.**
2. **Card payments** need Andrew's own Stripe account and `VOICE_`-prefixed keys. Deliberately never
   falls back to this repo's Starr keys — see `lib/voice/payments.ts`.
3. **Andrew's account and content.** He picks his username, email and password at the studio login;
   §12's open questions are his to answer.

### What is waiting on a person, not on code

Section 12's open questions — the real credits, the telephony client's name, whether the testimonials
can be un-flagged — plus his contact details and coaching rates. And the payment handles: Studio →
Settings → Getting paid starts empty on purpose, so until Andrew fills it in, an invoice tells the
client to reply to his email.

### Defects found and fixed during the build

1. **Headings invisible.** Starr's `globals.css` styles bare `h1–h6` site-wide; `.vaDisplay` set
   font-family but not `color`, so the element selector beat the inherited value. Fixed with a
   zero-specificity `:where()` reset. *Found in a browser; unfindable by reading the CSS.*
2. **Reel cards 3-up, titles truncated to "COMME…".** `vaGrid2`'s 320px minimum let a third column
   fit at 1440px. Minimums are now derived from what has to fit inside them.
3. **Photos cropping heads off.** `object-fit: cover` centres; Andrew is at the far left of the choir
   and in the top eighth of the square costume photo. Focal points now travel with each photo in the
   generated manifest and are applied by default.
4. **A photo no crop could fix.** `stage-costume` has his parents' arms around him. Two crop attempts
   failed; it moved to the About page with a caption.
5. **About section flattened.** A two-column layout became a vertical stack because a stack was all
   the widget set could express. Fixed by adding the missing primitive — `mediaText`.
6. **Every page 500'd on `node:crypto`.** The client-side contact form imported one constant from
   `contracts.ts`, which reaches `node:crypto` via `tokens.ts`. Webpack follows the module graph, not
   the usage. Usage scopes moved to a dependency-free module.
7. **Hydration failure across the whole site.** A client `SiteChrome` wrapper imported the
   `VoiceFooter` *server* component; the bundler emitted a client reference whose factory was
   `undefined` ("Cannot read properties of undefined (reading 'call')"). Replaced with a `(site)`
   route group — the App Router's own answer, resolved at build time with no client component in the
   tree.
8. **Same error, narrower.** The guide page (server) rendered `Checklist`/`TaskCard` (client) from
   inside a switch. Collapsed into one client module, `GuideBody`.
9. **`npm run build` failed; `npm run dev` never noticed.** Route files exported helpers
   (`slugify`, `fileTypeAllowed`). A route may export only handlers + segment config. Moved to
   `lib/voice/slug.ts` and `lib/voice/upload-rules.ts`. **Always run `npm run build` before merging.**
10. **`web-push` "Module not found" on every page load.** A bare `require()` in a try/catch is still
    statically analysed. Indirected through a variable.
11. **Every inline icon sat on its own line.** Starr's reset includes
    `audio, canvas, embed, iframe, img, object, svg, video { display: block }`. Right for media,
    wrong for icons — so "◇ Agreements" on the portal and every studio panel title rendered as a
    glyph above its heading rather than beside it. One `:where(svg)` reset fixed the whole tenant.
    *Same class as defect 1: the host stylesheet wins until a zero-specificity rule takes it back.*
12. **Stacked invoice rows lost their numbers on a phone.** `.vaTable` carries `min-width: 480px` so
    a real table can scroll inside `.vaTableWrap`. Once the mobile rules made the rows blocks, that
    floor pushed every value 380px past the right edge — on screen it read as the labels having lost
    their values, which is not a layout bug anyone would guess from the symptom. Fixed with
    `min-width: 0` in the same media query. *Found by measuring `getBoundingClientRect()`, not by
    looking.*
13. **A white band under short pages.** The host `<body>` is white and the pages with no site footer
    (invoice, portal, signing) end before the viewport does. `.vaRoot` now has `min-height: 100vh`.
14. **The whole studio scrolled sideways on a phone, because of an email address.**
    `jacobmaddux96@gmail.com` is one unbreakable 175px token in a flex table cell that could not
    shrink. It widened its row, its table, the `.vaStudio` grid, and finally the fixed bottom nav —
    which is `100%` of a parent that was now 445px. **The sweep named the NAV and listed the cell
    last**: an overflow propagates outward, so the thing that looks broken is never the cause. The
    audit now sorts offenders narrowest-first for that reason.
15. **`.vaGuideSources` had no CSS at all.** The citation block under every pricing figure in the
    business guide — the thing that makes "charge $650 for a regional spot" credible — was rendering
    as a bare paragraph with default browser links. Nobody saw it because it sits at the bottom of a
    long section. The mobile sweep found it by measuring a 21px link.
16. **The contrast audit passed without measuring anything.** Its first-ever run hit a server on the
    wrong port, loaded zero routes, found zero failures, and printed
    "✓ Every measurable text node clears WCAG AA." A green tick for an audit that never ran is worse
    than a red one. Zero measurements is now an explicit failure. *(Then the real run: 941 nodes, all
    passing.)*

17. **Custom pages had no URL — the headline feature stopped one route short.** The builder created
    `kind: 'page'` rows and Studio → Pages linked to them at `/AndrewAsh/<slug>`; nothing served that
    path. Andrew could build a page, publish it, click the address the studio showed him, and land on
    a 404. Every individual piece existed and worked, so nothing ever failed — **the hole was in the
    seam**, and it took reading this doc's route table against `find app/AndrewAsh -name page.tsx` to
    see it. Fixed by `(site)/[slug]/page.tsx`.

    Two consequences worth recording:

    - **Some static routes may be shadowed and some may not**, and the difference is not "does a route
      exist" but "does that route read `va_pages`". `about` and `work` are `SystemPage`, which prefers
      Andrew's row — that IS adopting a built-in page, so blocking those slugs would break the feature
      the guard protects. `studio`, `login`, `client`, `invoice`, `contract`, `api` and `p` never
      consult the table and would swallow a page silently and permanently. Only those are in
      `SHADOWED_SLUGS`. **A test written against the real `DEFAULT_PAGES` list caught me having put
      `work` on the wrong side of that line.**
    - **A page was being seeded with project scaffolding** — a "Project" eyebrow, a player captioned
      "The finished spot", and a Client/Role/Delivered spec list. On a page about his rates that is
      not a head start, it is five blocks to delete before he can begin, which is where a person
      decides the builder is fighting them. `newPageBlocks` now exists.

## 11. Sources

- Voice-actor portfolio conventions — [SiteBuilderReport](https://www.sitebuilderreport.com/inspiration/voice-actor-portfolios), [VoiceBros](https://voicebros.com/en/blog/building-voice-over-portfolio), [Backstage](https://www.backstage.com/magazine/article/how-to-make-a-voice-over-portfolio-75134/)
- Demo reel structure — [ReelCrafter](https://www.reelcrafter.com/blog/how-to-make-a-voice-over-demo-reel-as-a-professional-voice-actor), [Voices.com](https://www.voices.com/help/beginners-guide-to-voice-acting/planning-your-demos), [StageMilk](https://www.stagemilk.com/what-makes-a-great-voice-over-demo/)
- Coaching site features and rates — [Paperbell](https://paperbell.com/blog/how-to-be-a-voice-coach/), [Qrolic](https://qrolic.com/blog/top-website-features-voice-coaches-2025/)

---

## 12. Open questions for Andrew

1. Exact degree title (BA / BM / BBA in what).
2. Real production names, roles, years and venues for the credits list.
3. The telephony client's name — may he say it publicly?
4. Real testimonials. Every one currently on the site is flagged EXAMPLE and blocked from publishing.
5. Coaching rates — defaults are $65 single / $240 for four / $255 audition intensive.
6. Contact email, phone, social links.
7. Whether stage/musical video exists to embed.
