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
- [ ] **EM2 — Recipient picker.** Let the sender pick a **customer** (from
  leads/jobs contacts) or an **employee** (from the users/employees list) instead
  of typing a raw address — with free-text still allowed. Show name + email.
- [ ] **EM3 — Templates.** A small set of reusable templates (e.g. job update,
  quote follow-up, schedule reminder) that pre-fill subject + body with simple
  placeholders the sender can edit before sending.
- [ ] **EM4 — Multi-recipient / role send.** Allow sending to several recipients
  or a role (e.g. all field crew) in one action; record each send. Guard against
  accidental large sends (confirm count).
- [ ] **EM5 — Sent log + draft autosave.** Persist a record of sent emails
  (who/when/subject) viewable by admins, and autosave the in-progress draft to
  localStorage so a navigation/refresh doesn't lose it.
