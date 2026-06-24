# Email to Customers & Employees — Build-Out & Mobile

**Status:** 🟡 In progress — a single-recipient freeform composer exists; needs
recipient picker, templates, bulk send, and mobile polish.

## How this doc is driven

Stop-hook driven: next unchecked slice → read live code → smallest shippable
change → typecheck + lint + commit + push → check box + note. All `[x]` → move to
`completed/`. Keep desktop intact; verify mobile at 390px.

## Current state (verified 2026-06-24)

- UI: `app/admin/email/new/page.tsx` (To / Subject / Message; admin-only).
- API: `app/api/admin/email/send/route.ts` — sends via **Resend**
  (`RESEND_API_KEY`), plaintext→HTML, `reply_to` = sender. Dev mode logs instead
  of sending. Accepts any address in `to` (customers or employees both work).
- Gaps: freeform recipient only (no contact picker), no templates, one recipient
  at a time, no draft saving, composer not mobile-tuned.

## Slice plan

- [x] **EM1 — Mobile composer polish.** Full-width stacked fields, auto-sizing
  message area, 44px Send, no overflow at 390px. Verify via `ux-harness?page=email`
  (register the page in the harness if needed). Keep desktop unchanged.
  _Done 2026-06-24:_ registered `email` → `app/admin/email/new/page` in the
  ux-harness PAGES map so the composer is auditable at 390px. The fields were
  already stacked + full-width with 44px inputs and a full-width Send on mobile;
  trimmed the message textarea's mobile `min-height` from 220px → 160px so all
  fields + Send fit a phone screen without pushing the form off-view (it still
  grows as you type via `resize: vertical`). Verified at 390px: To/Subject 44px,
  Send 44px full-width (366px), 0px overflow. Desktop 220px box unchanged.
- [x] **EM2 — Recipient picker.** Let the sender pick a **customer** (from
  leads/jobs contacts) or an **employee** (from the users/employees list) instead
  of typing a raw address — with free-text still allowed. Show name + email.
  _Done 2026-06-24:_ added `GET /api/admin/email/recipients` (admin-only) →
  `{ employees, customers }`: employees from `registered_users` (non-banned, name
  or title-cased email), customers from distinct `leads` contacts with an email
  (most recent 500, de-duped). The composer's To field gained a **Choose…** toggle
  that opens an inline picker with **Employees / Customers tabs**, a search box, and
  tappable rows (name + email) that fill the To field; the directory loads lazily on
  first open. The raw `type="email"` input stays editable so free-text still works.
  Verified at 390px: picker opens, tab switch swaps lists, tapping a customer fills
  `to`, 0px overflow.
- [x] **EM3 — Templates.** A small set of reusable templates (e.g. job update,
  quote follow-up, schedule reminder) that pre-fill subject + body with simple
  placeholders the sender can edit before sending.
  _Done 2026-06-24:_ added `lib/email/templates.ts` — a pure, unit-tested catalog
  of 4 templates (job update, quote follow-up, schedule reminder, crew dispatch)
  with `[Placeholder]` tokens, plus `getEmailTemplate(id)` and a
  case-insensitive `fillTemplate(text, values)` that leaves unknown/empty
  placeholders intact (`__tests__/email/templates.test.ts`, 5 passing). The composer
  gained a **"Start from a template…"** dropdown above Subject; choosing one fills
  subject + body (confirms before clobbering an existing draft). Verified at 390px:
  selecting "schedule reminder" populated subject + a 264-char body with
  placeholders preserved, 0px overflow.
- [x] **EM4 — Multi-recipient / role send.** Allow sending to several recipients
  or a role (e.g. all field crew) in one action; record each send. Guard against
  accidental large sends (confirm count).
  _Done 2026-06-24:_ the send route now parses the To field on commas/semicolons/
  whitespace and accepts an optional `role`, which it expands server-side to every
  non-banned `registered_users` row with that role (`.contains('roles', [role])`).
  Recipients are de-duped, each validated, and **capped at 100/send** (hard 400 over
  the cap). It sends **one Resend message per recipient** (parallel) so customer
  addresses are never disclosed to each other, collects per-address failures, and
  returns `{ sent_count, failed_count, failed }`. Composer: To input is now
  `multiple` (comma-separated), plus an **"Or send to a role"** select (Field Crew /
  Employees / Admins / Drawers / Researchers / Equipment Managers) with a hint. A
  **count-confirm guard** fires before any send reaching >1 person or a whole role,
  and success reads "✓ Email sent to N recipients." Verified at 390px: role broadcast
  posts `role:field_crew`, confirm fires, success shows the count, 0px overflow.
- [ ] **EM5 — Sent log + draft autosave.** Persist a record of sent emails
  (who/when/subject) viewable by admins, and autosave the in-progress draft to
  localStorage so a navigation/refresh doesn't lose it.
