# Support Desk — Planning Document

**Status:** RFC / sub-plan of `STARR_SAAS_MASTER_PLAN.md` §5.2; ticket schema already shipped in `seeds/267_saas_customer_portal_schema.sql`
**Owner:** Jacob (Starr Software)
**Created:** 2026-05-13
**Target repo path:** `docs/planning/in-progress/SUPPORT_DESK.md`

> **One-sentence pitch:** Build an in-house customer ↔ operator ticketing system using the existing WebSocket plumbing (`/api/ws/ticket`) + the `support_tickets` schema, with customer self-service at `/admin/support` and operator triage at `/platform/support` — avoiding the per-ticket cost of Intercom / Help Scout / Zendesk.

---

## 0. Decisions locked

| Q | Decision | Rationale |
|---|---|---|
| **Master Q5 — Build vs buy** | **Build in-house** | Existing WebSocket route already exists; ~3-week build vs. ongoing per-conversation cost from a 3P; customer data stays in our DB |

---

## 1. Goals & non-goals

### Goals

1. **Customer can file a ticket in <30 seconds** from `/admin/support`.
2. **Operator gets notified in <30 seconds** of a new ticket (web push + email + Slack optional).
3. **Real-time reply UX** — like a chat, not an email back-and-forth. Existing WebSocket plumbing makes this cheap.
4. **Knowledge base first** — customer searches `/docs` before filing; reduces ticket volume.
5. **Internal notes** on tickets (operator-side only) for collaboration without leaking to customer.
6. **SLA tracking** — first-response time + time-to-resolve per priority. Surfaces on `/platform/support` dashboard.
7. **Escalation** — tickets can be reassigned across operators; priority can be raised; customer notified.
8. **File attachments** — screenshots, log dumps, document uploads. Stored in a dedicated Supabase Storage bucket per org.

### Non-goals

- A full CRM / customer success workflow. Tickets are a help channel; lifecycle management lives in `/platform/customers`.
- Multi-channel routing (Twitter / Slack channels / SMS). Email and in-app only.
- AI-powered ticket triage in v1 (operator-side AI assistant deferred to Phase 6 per OPERATOR_CONSOLE.md §8.8).
- Public bug-tracking / community forum. Not in v1.
- Chatbot pre-filtering. Too much false-positive risk for a 47-customer SaaS.

---

## 2. Information architecture

### 2.1 Customer-side — `/admin/support`

```
/admin/support              Ticket list (this customer's tickets)
/admin/support/new          New ticket form
/admin/support/tickets/[id] Ticket thread
```

Notification bell badge fires when there's an unread operator reply on any open ticket.

### 2.2 Operator-side — `/platform/support`

```
/platform/support                    Inbox (all open tickets across all tenants)
/platform/support/tickets/[id]       Ticket detail + thread
/platform/support/sla                SLA dashboard
/platform/support/knowledge-base     Internal KB authoring (links to /docs)
```

### 2.3 Public — `/docs`

```
/docs                       Knowledge base home (search + categories)
/docs/[category]            Category listing
/docs/[category]/[slug]     Article
/docs/search?q=...          Search results
```

The KB is public (anyone can read). Internal-only KB articles (operator runbooks) live at `/platform/support/knowledge-base` with the `internal_only=true` flag.

---

## 3. Surfaces

### 3.1 Customer-side ticket list — `/admin/support`

```
┌──────────────────────────────────────────────────────────────────┐
│ Support · 2 open · 5 closed       [+ New ticket]  [Search KB]     │
├──────────────────────────────────────────────────────────────────┤
│ Search articles: [How do I import jobs?_______________________]   │
│                                                                    │
│ My tickets                                                         │
│   T-0042  CAD export to DXF crashes        Awaiting reply  2h ago │
│   T-0039  How do I bulk-import jobs?       Open            1d ago │
│   T-0035  (Closed) Password reset issue                  resolved │
│                                                                    │
│ Suggested articles                                                 │
│   • How do I import jobs?                                          │
│   • CAD export troubleshooting                                     │
│   • Resetting your password                                        │
└──────────────────────────────────────────────────────────────────┘
```

**KB search** is the first thing customers see — friction in the right place. Search results render inline; clicking a result opens the article in a side drawer (no full-page navigation away from support).

### 3.2 New ticket form — `/admin/support/new`

```
┌──────────────────────────────────────────────────────────────────┐
│ New support ticket                                                 │
│                                                                    │
│ Subject: [____________________________________________]            │
│                                                                    │
│ Category: ( ) Bug  ( ) Question  ( ) Billing  ( ) Feature request  │
│           ( ) Other                                                │
│                                                                    │
│ Priority: ( ) Normal  ( ) High — something's blocking my work      │
│           ( ) Urgent — service is down                             │
│           (Critical is operator-only)                              │
│                                                                    │
│ What happened?                                                     │
│ [_____________________________________________________________]    │
│ [_____________________________________________________________]    │
│ [_____________________________________________________________]    │
│                                                                    │
│ What did you expect?  (optional)                                   │
│ [_____________________________________________________________]    │
│                                                                    │
│ Attachments: [+ Add screenshot / file]                             │
│                                                                    │
│ Context (auto-attached):                                           │
│  • URL: /admin/cad/drawings/draw_abc123                            │
│  • Browser: Chrome 127, macOS 14.5                                 │
│  • Session ID: sess_01H4...                                        │
│  • Active org: Acme Surveying                                      │
│  • Active bundle: Firm Suite                                       │
│                                                                    │
│              [Cancel]  [Submit ticket]                             │
└──────────────────────────────────────────────────────────────────┘
```

Auto-attached context is critical: most tickets need it. Pre-filling URL + browser + session removes a back-and-forth. Customer can see it before submit + scrub anything they want.

### 3.3 Ticket thread (customer view) — `/admin/support/tickets/[id]`

```
┌──────────────────────────────────────────────────────────────────┐
│ T-0042 · CAD export to DXF crashes              [Subscribe ▼]      │
│ Open · 2h ago · Assigned to Jacob (Starr Software)                │
├──────────────────────────────────────────────────────────────────┤
│ You · 2h ago                                                       │
│   When I export a drawing to DXF, the editor freezes for 3-4      │
│   seconds, then I get a "Save failed" toast and the drawing is    │
│   gone from my recent files. The export does end up downloading   │
│   though. Steps: open drawing draw_abc123, File → Export → DXF.   │
│   📎 screenshot-1.png                                              │
│                                                                    │
│ Jacob (Starr Software) · 1h ago                                    │
│   Thanks for the detail. Can you check whether the drawing is     │
│   still accessible from /admin/cad/drawings/draw_abc123 directly? │
│   If yes, this is a known caching issue we shipped a fix for in   │
│   v2.4.0 (released earlier today). Try refreshing the recent list.│
│                                                                    │
│ Reply:                                                             │
│ [_____________________________________________________________]    │
│ [+ Attach file]                            [Reply] [Mark resolved] │
└──────────────────────────────────────────────────────────────────┘
```

- New replies arrive via WebSocket → toast notification.
- "Mark resolved" closes the ticket (customer-side); they can reopen within 7 days.
- "Subscribe" lets a customer add another teammate to the ticket thread (for shared visibility).

### 3.4 Operator inbox — `/platform/support`

```
┌──────────────────────────────────────────────────────────────────┐
│ Support · 12 open · 3 awaiting first response · 8 awaiting reply  │
│                                          [Bulk: assign / close]   │
├──────────────────────────────────────────────────────────────────┤
│ Filter: Status ▾ Priority ▾ Assignee ▾ Org ▾ Tag ▾ [Search...]   │
├──────────────────────────────────────────────────────────────────┤
│  #     Org              Subject            Priority  Age  Assigned│
│ ────────────────────────────────────────────────────────────────  │
│ T-0042 Acme            CAD DXF crash       🔥 Urgent  2h   Jacob  │
│ T-0041 Crews Eng       Bell County adapter  P2       1d    Hank   │
│ T-0040 Brown & Co      How do I invite?     P3       1d    —      │
│ T-0039 Dixie           Login redirect loop  P1       3d    Jacob  │
│  …                                                                 │
├──────────────────────────────────────────────────────────────────┤
│ SLA breaches: 1 (Dixie's >24h without first response)             │
└──────────────────────────────────────────────────────────────────┘
```

Sortable by every column. Default: priority desc, then age asc. Bulk actions on multi-select.

### 3.5 Ticket detail (operator view) — `/platform/support/tickets/[id]`

```
┌──────────────────────────────────────────────────────────────────┐
│ T-0042 · CAD export to DXF crashes        Acme Surveying          │
│ Status: [Open ▾]  Priority: [Urgent ▾]  Assigned: [Jacob ▾]       │
│ Tags: [bug] [cad] [+]                                              │
├──────────────────────────────────────────────────────────────────┤
│ Customer context (sticky sidebar):                                 │
│  • Plan: Firm Suite ($499/mo)                                      │
│  • Founded: 3 months ago                                           │
│  • Users: 12 / 12 seats                                            │
│  • Open tickets: 1 (this one)                                      │
│  • Recent activity: 6 CAD drawings this week                       │
│  • [View full customer page →]                                     │
│  • [Impersonate to debug →]                                        │
│                                                                    │
│ Thread:                                                            │
│   Alice@acme.com · 2h ago — "When I export... 📎 screenshot-1.png" │
│   Jacob · 1h ago — "Thanks for the detail. Can you check..."       │
│                                                                    │
│ Internal notes (operator-only):                                    │
│   Jacob · 30m ago — "v2.4.0 might have fixed this; checking logs"  │
│                                                                    │
│ Reply (visible to customer):                                       │
│ [_____________________________________________________________]    │
│ [+ Attach] [+ KB article]            [Reply]                       │
│                                                                    │
│ Internal note (not visible to customer):                           │
│ [_____________________________________________________________]    │
│                                              [Save internal note]  │
│                                                                    │
│ Actions: [Reassign] [Change priority] [Add tag] [Close] [Escalate] │
└──────────────────────────────────────────────────────────────────┘
```

The sidebar with customer context + impersonation entry point is the operator's killer feature — most tickets need "let me look at their account".

### 3.6 SLA dashboard — `/platform/support/sla`

```
┌──────────────────────────────────────────────────────────────────┐
│ SLA performance · last 30 days                                     │
│                                                                    │
│ First response time:                                               │
│   Urgent: 1.2h avg (target <1h)            🟡 87% within target   │
│   High:   3.4h avg (target <4h)            🟢 94% within target   │
│   Normal: 6.1h avg (target <8h)            🟢 97% within target   │
│                                                                    │
│ Time-to-resolve:                                                   │
│   Urgent: 8h avg (target <12h)             🟢 92%                 │
│   High:   1.4d avg (target <2d)            🟢 95%                 │
│   Normal: 3.2d avg (target <5d)            🟢 98%                 │
│                                                                    │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │  Ticket volume over time (line chart)                       │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│ Top tags this month: cad (12), billing (8), import (5), ...        │
│ Top requesters: Acme (5), Crews Eng (3), ...                       │
└──────────────────────────────────────────────────────────────────┘
```

Powers operator visibility into "are we keeping up?". Triggers alerts when an SLA target is breached on a single ticket.

---

## 4. Data model

The `support_tickets` + `support_ticket_messages` tables are already shipped in `seeds/267_saas_customer_portal_schema.sql`. Additions for this sub-plan:

```sql
-- Knowledge base articles
CREATE TABLE IF NOT EXISTS public.kb_articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,
  category        TEXT NOT NULL,
  title           TEXT NOT NULL,
  body_markdown   TEXT NOT NULL,
  bundle_scope    TEXT[],                          -- which bundles this is relevant to; null = all
  internal_only   BOOLEAN DEFAULT false,            -- operator-runbook articles
  author_email    TEXT,
  helpful_count   INT DEFAULT 0,
  unhelpful_count INT DEFAULT 0,
  view_count      INT DEFAULT 0,
  published_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kb_published ON public.kb_articles(published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kb_category  ON public.kb_articles(category, published_at DESC);
-- Full-text search
ALTER TABLE public.kb_articles
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body_markdown,''))) STORED;
CREATE INDEX IF NOT EXISTS idx_kb_search ON public.kb_articles USING GIN(search_tsv);

-- Per-ticket subscribers (additional users CC'd)
CREATE TABLE IF NOT EXISTS public.ticket_subscribers (
  ticket_id  UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  added_by   TEXT NOT NULL,
  added_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (ticket_id, user_email)
);

-- KB article ↔ ticket link (operator can attach KB article to a reply)
CREATE TABLE IF NOT EXISTS public.ticket_kb_links (
  ticket_id  UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.kb_articles(id) ON DELETE CASCADE,
  linked_by  TEXT NOT NULL,
  linked_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (ticket_id, article_id)
);
```

These three tables ship in a follow-up migration `seeds/268_saas_support_kb_schema.sql`.

---

## 5. Real-time updates

The existing `/api/ws/ticket` WebSocket route is the foundation. Extended for v2:

- Channels named `org:<org_id>:tickets` (customer side) and `platform:tickets` (operator side).
- Customer subscribes to their org's channel when on `/admin/support/*`.
- Operator subscribes to `platform:tickets` when on `/platform/support/*`.
- Events fanned out:
  - `ticket.created` (new from customer)
  - `ticket.replied` (new message)
  - `ticket.status_changed`
  - `ticket.assigned`
  - `ticket.priority_changed`

Fallback: HTTP polling every 30 seconds if WebSocket disconnects.

---

## 6. SLA targets + alerts

Default SLA targets (configurable per org via Firm Suite tier later):

| Priority | First response | Resolution |
|---|---|---|
| Critical | 30 min | 4 hours |
| Urgent | 1 hour | 12 hours |
| High | 4 hours | 2 days |
| Normal | 8 business hours | 5 business days |
| Low | 1 business day | 10 business days |

Cron checks every 5 min for tickets approaching SLA breach. Fires:
- In-app notification to operator
- Slack message to #support channel (Phase E-2)
- Email to operator at 50% / 80% / 100% of SLA window

Customer-side: no SLA visibility (don't promise on a public clock).

---

## 7. Phased delivery

Maps to master plan Phase E. ~3 weeks.

| Slice | Description | Estimate |
|---|---|---|
| **E-1** | Schema already shipped (seeds/267); add seeds/268 for KB + subscribers + links | 1 day |
| **E-2** | Customer `/admin/support` list + new-ticket form | 3 days |
| **E-3** | Customer ticket thread view + reply UI | 2 days |
| **E-4** | Operator `/platform/support` inbox + filters + bulk actions | 3 days |
| **E-5** | Operator ticket detail with internal notes + assign / priority / status / tag actions | 3 days |
| **E-6** | WebSocket fanout via existing /api/ws/ticket extension | 2 days |
| **E-7** | Knowledge base: `/docs` public read + admin authoring at `/platform/support/knowledge-base` | 4 days |
| **E-8** | KB search + suggest-articles on new-ticket form | 2 days |
| **E-9** | SLA tracking + breach alerts | 2 days |
| **E-10** | Email integration: ticket-created notifies operators + ticket-replied notifies recipient | 2 days |
| **E-11** | File attachments (Supabase Storage bucket per org) | 2 days |

**Total: ~3-4 weeks**.

---

## 8. Open questions

1. **Knowledge base content authoring.** Markdown editor in-app, or external (Notion / GitHub) that syncs? Recommend in-app — keeps everything in one place; existing `/admin/learn/manage/article-editor` is a working pattern.
2. **Customer-side ticket auto-close.** If no reply in N days, close automatically? Recommend yes, 14 days, with email warning at day 12.
3. **Operator coverage hours.** 9-5 CT? 24/7? Recommend M-F 8-6 CT for v1; SLA targets above assume business hours only.
4. **Anonymous KB feedback.** "Was this article helpful?" — anonymous yes/no, or require login? Recommend anonymous, easy signal collection.
5. **Customer can edit/delete their own message.** Within 5 minutes of posting, recommend yes. After that, no — preserve thread integrity for audit.
6. **Tickets created on behalf of a customer.** Operator can file a ticket as a customer (for legal/compliance/follow-up). Recommend yes, audit-loud.

---

## 9. Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Ticket volume spikes beyond operator capacity | Medium | KB-first design; signup rate-limit ties to operator team size; SLA target relaxation if needed |
| Customer floods with low-priority tickets | Low | No rate limit needed at 47-customer scale; revisit at 500+ |
| File attachment is malicious (virus / exploit) | Medium | Scan via ClamAV-equivalent in Supabase Edge Function before exposing to operator; operator-side download requires confirmation |
| Operator replies to wrong ticket / wrong customer | High | Recipient name + org always visible at top of thread; double-confirmation on first reply to a new customer |
| Internal note accidentally posted as customer-visible | High | UI strongly differentiates the two textareas (different colors, "INTERNAL ONLY" header); type-level constraint on submit |
| Search reveals a customer's confidential subject in KB indexing | Critical | Tickets are NEVER indexed for KB search; the two systems are entirely separate corpora |
| WebSocket scaling breaks at 1000 concurrent connections | Low | Existing /api/ws/ticket handles current load; scaling concerns deferred to 10x current volume |

---

## 10. Cross-references

- `STARR_SAAS_MASTER_PLAN.md` §5.2 (parent)
- `OPERATOR_CONSOLE.md` §3.6 — operator-side inbox layout
- `CUSTOMER_PORTAL.md` §3.7 — customer-side ticket list
- `seeds/267_saas_customer_portal_schema.sql` — already-shipped `support_tickets`, `support_ticket_messages` tables
- `seeds/268_saas_support_kb_schema.sql` (to be authored) — KB articles, subscribers, links
- `app/api/ws/ticket/route.ts` — existing WebSocket route to extend
- `app/admin/learn/manage/article-editor/[id]/page.tsx` — existing Markdown editor pattern to reuse

---

## 11. Definition of done

1. ✅ Customer can file a ticket from `/admin/support` in <30 seconds.
2. ✅ Auto-attached context (URL, browser, session) appears + customer can scrub.
3. ✅ Operator sees new tickets in real-time via WebSocket.
4. ✅ Operator ticket detail shows full customer context sidebar + impersonation entry.
5. ✅ Internal notes are operator-only.
6. ✅ KB search returns relevant articles for any query.
7. ✅ KB articles can be authored by operators + published / unpublished.
8. ✅ SLA targets tracked + breaches alert the operator.
9. ✅ File attachments work + are scanned for malware.
10. ✅ Email notifications fire on every ticket event (created, replied, resolved, reassigned).
11. ✅ All Phase E vitest cases pass.
