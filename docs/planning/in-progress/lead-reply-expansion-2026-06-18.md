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
| **LR2** | **Pull reply attachments into the bucket.** Replies composed in the dialog upload bytes to `lead-attachments/replies/<reply_id>/<uuid>-<name>` via the same `uploadLeadAttachments` helper extracted to `lib/leads/intake.ts`. The `lead_replies.attachments` JSONB gets `storage_path` populated. The GET endpoint signs the URLs (same pattern as the lead-detail GET) so the history view's chips link to real downloads. |
| **LR3** | **Notes card → conversation log.** New `public.lead_notes` table (id, lead_id, author_email, body, pinned bool, created_at). The existing `lead.notes` column stays (it's the customer-supplied original); the new table holds office-side notes. Render a "Notes from the office" card under "Notes from customer" with an inline composer (textarea + Save) and pinned-first sorting. |
| **LR4** | **Common reply templates** — new `public.reply_templates` table (id, name, subject_template, body_html_template, category, created_by, created_at, is_org_default). Five seeded org-defaults: First contact / Quote follow-up / Scheduling site visit / Requesting more info / Job complete. Composer gets a "Templates ▾" picker above the toolbar that fills subject + body when chosen. Variables: `{{first_name}}` / `{{full_name}}` / `{{ref_number}}` / `{{survey_type}}` / `{{quote_amount}}`. |
| **LR5** | **AI-drafted reply via Claude.** New `POST /api/admin/leads/[id]/ai-draft` route that calls Anthropic's Messages API with the lead's full context (notes, reply history, attachments list, status) + the customer's most recent message + an instruction to draft a polite, professional reply. Composer gets a "🤖 AI Draft" button that pops the result into the editor. Uses `claude-sonnet-4-6` per project convention. Falls back gracefully when `ANTHROPIC_API_KEY` isn't set. |
| **LR6** | **Conversation threading on the job after conversion.** When a lead converts to a job, the lead_replies + lead_notes + reply attachments stay linked to the lead_id; the new job page surfaces a "Original inquiry" card with a link back to the lead so the running conversation isn't lost. |
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
