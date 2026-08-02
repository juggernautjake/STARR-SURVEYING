# Andrew Ash — Voice Actor & Vocal Coach Platform

**Started** 2026-08-02 · **Branch** `claude/andrew-ash-voice-platform-2026-08-02` · **Status** in progress
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
| `/AndrewAsh/p/[slug]` | Any custom page Andrew creates |

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

| # | Slice | Status |
|---|---|---|
| 1 | Photo pipeline + focal-point manifest | ✅ |
| 2 | Schema — 538 platform, 539 business ops | ✅ |
| 3 | `lib/voice` core — auth, widgets, theme, style, money, contracts, inquiry, expenses, tokens, notifications | ✅ |
| 4 | Design system stylesheet + chrome | ✅ |
| 5 | Widget renderer (26 types, responsive emission, owner mode) | ✅ |
| 6 | Default pages as block arrays | ⏳ |
| 7 | Public routes rendering through the renderer | ⏳ |
| 8 | Studio builder — drag, inspector, mobile toggle | ⏳ |
| 9 | Studio business surfaces | ⏳ |
| 10 | Client portal — contracts, e-sign, invoices, pay | ⏳ |
| 11 | API routes | ⏳ |
| 12 | Owner bar + footer login + per-widget edit | ⏳ |
| 13 | PWA + push | ⏳ |
| 14 | Tests, typecheck, `npm run build` | ⏳ |
| 15 | Playwright + OCR + contrast audit, desktop and 390px | ⏳ |

### Defects found and fixed during the build

1. **Headings invisible.** Starr's `globals.css` styles bare `h1–h6` site-wide; `.vaDisplay` set
   font-family but not `color`, so the element selector beat the inherited value. Fixed with a
   zero-specificity `:where()` reset. *Found in a browser; unfindable by reading the CSS.*
2. **Reel cards 3-up and titles truncated.** `vaGrid2`'s 320px minimum let a third column fit.
   Minimums are now set from what the content needs.
3. **Photos cropping heads off.** `object-fit: cover` centres; Andrew is at the far left of the
   choir and the top eighth of the costume square. Fixed with per-photo focal points in the
   generated manifest, applied by default so no call site can forget.
4. **A photo that no crop could fix.** `stage-costume` has his parents' arms around him. Two crop
   attempts failed; it moved to the About page with a caption. When a crop cannot make an image mean
   the right thing, the fix is a different placement.

---

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
