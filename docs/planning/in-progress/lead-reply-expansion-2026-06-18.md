# Lead reply expansion — 2026-06-18

> User ask:
>   - "Please do render the reply history."
>   - "We need to be able to keep notes for jobs and customers
>     and be able to recall ongoing conversations with
>     customers."
>   - "Please build out some common replies."
>   - "Make it so that AI is integrated into this so that it can
>     generate a good reply at the click of a button to respond
>     to the customers questions or comments."
>   - "Yes, please pull the attachments into the lead attachments
>     bucket."
>   - "Build out the full planning document and move it into the
>     in progress folder so that the stop hook can start
>     building in slices."

## Top-level diagnosis

The reply composer shipped in `edfdc2c` (LR0) gave the office
an outbound channel, but the conversation surface around it is
incomplete:

1. **Reply history is invisible.** The GET endpoint at
   `/api/admin/leads/[id]/reply` exists but nothing renders it.
   Every send writes to `public.lead_replies` and then vanishes
   from the UI until you query the table by hand.
2. **Reply attachments don't persist.** Files attached in the
   composer flow through Resend but the bytes never land in
   the `lead-attachments` bucket. The office only has the
   Resend log as the archive.
3. **No notes / ongoing-conversation surface.** Surveyors need
   a per-customer (per-lead, per-job) running thread of
   internal context — "Hank called Mary on Tuesday, said quote
   too high, needs revised pricing for 5-acre add-on." Today
   that goes in someone's head.
4. **No common replies.** Every reply is composed from scratch.
   The same three or four messages get rewritten every week
   (intro, quote follow-up, scheduling, closeout).
5. **No AI assist.** The user wants a one-click "draft a reply
   to this customer's question" button — Claude reads the
   thread + the customer's most recent message + the lead
   context, drafts a polite reply, the surveyor edits / sends.

## Slice plan

Each slice = its own commit + the three post-build checks
(typecheck, lint, vitest). Slices are sized so the stop hook
can pick them up one at a time.

| Slice | What ships |
|---|---|
| **LR1** | **Render reply history** below the Notes card on `/admin/leads/[id]`. New `<RepliesList>` client component pulls from `GET /api/admin/leads/[id]/reply`, renders newest-first, each entry showing sender, sent_at, subject, preview, expand-on-click for full HTML body + attachments list. Render the `send_error` inline so failed sends are visible too. Lazy loads (only fetches when the page mounts past the contact card, not every poll). Refreshes when the ReplyDialog fires `onSent` via a parent-tracked refreshKey bump so the new row appears immediately. ✅ shipped |
| **LR2** | **Pull reply attachments into the bucket.** `uploadLeadAttachments` grew an optional `pathPrefix` arg so the reply route can store under `replies/<reply_id>/<uuid>-<name>`. The reply POST now collects raw bytes alongside the Resend base64, uploads + backfills `lead_replies.attachments` with the storage paths after the row insert returns. The GET signs URLs across every row (Promise.all signLeadAttachmentUrls) so the history view's chips link to real downloads. Failures fall through silently — the Resend email is the legal record. ✅ shipped |
| **LR3** | **Notes card → conversation log.** Seed 320 creates `public.lead_notes` (id, lead_id, author_email, body, pinned, created_at, updated_at, org_id, with a BEFORE UPDATE trigger keeping updated_at fresh). The existing `lead.notes` column stays untouched (customer-supplied); the new table holds office-side notes. `/api/admin/leads/[id]/notes` ships GET/POST/PATCH/DELETE all gated to admin. `<LeadNotesCard>` renders below the customer-notes card with an inline composer (textarea + pin checkbox + Save), Ctrl/⌘+Enter submit shortcut, per-row pin toggle + delete-with-confirm, pinned-first sort + a tinted background for pinned items. Apply seed 320 to enable. ✅ shipped |
| **LR4** | **Common reply templates** — seed 321 creates `public.reply_templates` with the audit columns + UNIQUE (org_id, name) + a BEFORE UPDATE trigger, then seeds the five org-defaults: First contact (intake), Quote follow-up (sales), Scheduling site visit (scheduling), Requesting more info (intake), Job complete (delivery). Each body uses the `{{var}}` substitution syntax. Pure helpers in `lib/leads/templates.ts`: `interpolateTemplate(template, vars)` swaps `{{key}}` tokens (whitespace-tolerant; unknown keys stay literal), `extractFirstName / extractRefNumber / formatQuoteAmount`, plus `buildTemplateVarsFromLead({name, notes, survey_type, quote_amount})` for the dialog. `GET /api/admin/reply-templates` lists org-defaults first then by category + name. ReplyDialog renders a "📋 Templates ▾" picker above the formatting toolbar; choosing a template interpolates from the lead context and fills subject + body. Apply seed 321 to enable. ✅ shipped |
| **LR5** | **AI-drafted reply via Claude.** Pure helpers in `lib/leads/ai-draft.ts`: `SYSTEM_PROMPT` (declares the firm's identity + contact line, bans inventing pricing/dates, bans revealing office notes verbatim), `buildDraftPrompt(ctx)` packs customer + survey type + reference + reply history (capped 6, newest-first) + office notes (capped 6, marked DO NOT REVEAL) + optional surveyor hint, `extractDraftHtml` strips ```html …``` fences. POST `/api/admin/leads/[id]/ai-draft` calls `claude-sonnet-4-6` via the `@anthropic-ai/sdk`, returns `{ html, model }`; degrades to 503 `AI_DISABLED` when ANTHROPIC_API_KEY isn't set. ReplyDialog renders a 🤖 AI Draft button alongside the Templates picker; click expands a hint panel ("optional instruction for the draft"); submit posts to the endpoint, pastes the returned HTML into the editor, surfaces error toasts. AI button hides when the 503 lands so dev/unconfigured envs aren't cluttered. ✅ shipped |
| **LR6** | **Conversation threading on the job after conversion.** New `GET /api/admin/jobs/[id]/origin-lead` looks up the lead via `converted_job_id`, returns `{ lead: { id, name, status, reference_number, reply_count, notes_count, last_replied_at } | null }`. New `<JobOriginatingLead>` renders a brand-tinted card at the top of the job overview tab: 💬 + "Originating inquiry" header with the SS-… reference chip, then a meta line ("From Mary Smith · 5 replies · 3 office notes · last reply 2d ago"), then a primary "View full conversation →" link back to `/admin/leads/[id]`. The card silently no-renders when no lead converted to this job, so jobs created fresh (without `?fromLead`) stay uncluttered. ✅ shipped |
| **LR7** | **Surface customer-side replies.** Customers reply to our messages by email; right now those go to info@ + Hank but never get pinned to the lead. Add a Resend webhook handler that parses inbound replies (via the `Re: SS-…` reference number), attaches them to the lead, and the history shows both directions. Requires Resend inbound parsing or a separate mailbox poller; ship the schema + UI now, the inbound parser may defer if the bookkeeping is heavier than expected. |
| **LR8** | **Style + polish pass** — 3 passes per the user spec. Each pass walks the composer + history surfaces, fixes layout shifts, tightens spacing, adds focus states, verifies dark mode if relevant. |
| **LR9** | **QA + bug review pass.** Cross-browser send/receive smoke test; check the AI draft on a fresh / stale / converted lead; verify attachment download from the history view; confirm notes survive a lead → job conversion. |

## Notes locked from the spec

- **Reply history is the source of truth** for what the office
  said. `lead.notes` stays customer-supplied; `lead_notes` is
  office-supplied; `lead_replies` is outbound; inbound replies
  (when LR7 lands) live in the same `lead_replies` table with
  a `direction` column.
- **Templates use `{{var}}` interpolation, not Handlebars.** A
  tiny pure helper `interpolateTemplate(template, vars)` keeps
  the surface testable without pulling in a templating lib.
- **AI draft is one-shot.** The surveyor edits the result; we
  don't ship multi-turn chat with the AI in the composer.
  That'd be a separate slice if anyone asks for it.
- **Attachments archive is best-effort.** The Resend email is
  the legal record; the bucket is a UI convenience. Per-file
  upload failures drop the storage_path silently.
- **AI never auto-sends.** The draft lands in the editor; the
  surveyor reads + clicks Send. Closed-loop human review
  prevents tone disasters.
