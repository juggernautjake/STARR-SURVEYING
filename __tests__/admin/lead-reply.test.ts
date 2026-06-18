// __tests__/admin/lead-reply.test.ts
//
// lead-reply-2026-06-18 — user asked for a Reply button on the lead
// detail page that opens a full email composer (B / I / U + lists +
// links + emoji + file attachments) and sends the reply through Resend
// from info@starr-surveying.com to the customer.
//
// Three artifacts to lock:
//   - seeds/319 creates `lead_replies` with the audit columns.
//   - app/api/admin/leads/[id]/reply/route.ts handles POST + GET.
//   - app/admin/leads/[id]/ReplyDialog.tsx is the composer.
//   - app/admin/leads/[id]/page.tsx wires the button + the modal.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('seed 319 — lead_replies audit table', () => {
  const SRC = read('seeds/319_lead_replies.sql');

  it('creates the lead_replies table with the audit columns', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.lead_replies/);
    expect(SRC).toMatch(/lead_id\s+UUID NOT NULL REFERENCES public\.leads\(id\) ON DELETE CASCADE/);
    expect(SRC).toMatch(/sender_email\s+TEXT NOT NULL/);
    expect(SRC).toMatch(/to_email\s+TEXT NOT NULL/);
    expect(SRC).toMatch(/subject\s+TEXT NOT NULL/);
    expect(SRC).toMatch(/body_html\s+TEXT NOT NULL/);
    expect(SRC).toMatch(/attachments\s+JSONB NOT NULL DEFAULT '\[\]'::JSONB/);
    expect(SRC).toMatch(/resend_id\s+TEXT/);
    expect(SRC).toMatch(/send_error\s+TEXT/);
  });

  it('enables RLS + adds the service_role full-access policy', () => {
    expect(SRC).toMatch(/ALTER TABLE public\.lead_replies ENABLE ROW LEVEL SECURITY/);
    expect(SRC).toMatch(/CREATE POLICY service_role_full_access_lead_replies/);
  });

  it('defaults org_id to the Starr tenant uuid (multi-tenancy shim)', () => {
    expect(SRC).toMatch(/org_id\s+UUID DEFAULT '00000000-0000-0000-0000-000000000001'::UUID/);
  });
});

describe('reply API route', () => {
  const SRC = read('app/api/admin/leads/[id]/reply/route.ts');

  it("exports a POST + GET handler gated by requireAdmin", () => {
    expect(SRC).toMatch(/export const POST = withErrorHandler/);
    expect(SRC).toMatch(/export const GET = withErrorHandler/);
    expect(SRC).toMatch(/async function requireAdmin/);
  });

  it('parses multipart payloads + attachments via formData', () => {
    expect(SRC).toMatch(/req\.formData\(\)/);
    expect(SRC).toMatch(/key === 'attachments' && value instanceof File/);
  });

  it("sends from info@starr-surveying.com via Resend with html + text + attachments", () => {
    expect(SRC).toMatch(/from: 'Starr Surveying <info@starr-surveying\.com>'/);
    expect(SRC).toMatch(/reply_to: 'info@starr-surveying\.com'/);
    expect(SRC).toMatch(/payload\.attachments = files/);
  });

  it('always records a row in lead_replies — success OR failure', () => {
    expect(SRC).toMatch(/\.from\('lead_replies'\)[\s\S]{0,200}?\.insert\(insertPayload\)/);
    expect(SRC).toMatch(/resend_id: resendId/);
    expect(SRC).toMatch(/send_error: sendError/);
  });

  it("returns 400 when subject or body is missing", () => {
    expect(SRC).toMatch(/Subject is required/);
    expect(SRC).toMatch(/Reply body is required/);
  });

  it("returns 400 when no recipient email can be resolved", () => {
    expect(SRC).toMatch(/No recipient email on the lead/);
  });
});

describe('ReplyDialog composer', () => {
  const SRC = read('app/admin/leads/[id]/ReplyDialog.tsx');

  it("renders the To / Subject inputs with prefill props", () => {
    expect(SRC).toMatch(/data-testid="reply-to"/);
    expect(SRC).toMatch(/data-testid="reply-subject"/);
  });

  it("renders a formatting toolbar (B / I / U + lists + link)", () => {
    // Each ToolbarBtn carries an aria-label for accessibility.
    expect(SRC).toMatch(/label="Bold"/);
    expect(SRC).toMatch(/label="Italic"/);
    expect(SRC).toMatch(/label="Underline"/);
    expect(SRC).toMatch(/label="Bullet list"/);
    expect(SRC).toMatch(/label="Numbered list"/);
    expect(SRC).toMatch(/label="Link"/);
  });

  it("renders an emoji palette", () => {
    expect(SRC).toMatch(/data-testid="reply-emoji-toggle"/);
    expect(SRC).toMatch(/data-testid="reply-emoji-panel"/);
    expect(SRC).toMatch(/QUICK_EMOJIS/);
  });

  it("supports adding + removing attachments", () => {
    expect(SRC).toMatch(/data-testid="reply-attachments-input"/);
    expect(SRC).toMatch(/data-testid="reply-attachments-list"/);
    expect(SRC).toMatch(/removeAttachment/);
  });

  it("renders the contentEditable body editor + Send button", () => {
    expect(SRC).toMatch(/data-testid="reply-editor"/);
    expect(SRC).toMatch(/data-testid="reply-send"/);
    expect(SRC).toMatch(/contentEditable/);
  });

  it("POSTs the reply as multipart FormData to /api/admin/leads/{id}/reply", () => {
    expect(SRC).toMatch(/\/api\/admin\/leads\/\$\{encodeURIComponent\(leadId\)\}\/reply/);
    expect(SRC).toMatch(/new FormData\(\)/);
    expect(SRC).toMatch(/method: 'POST'/);
  });

  it("toasts the API error body when send fails so the user knows why", () => {
    expect(SRC).toMatch(/addToast\(`Couldn't send reply — \$\{detail\}`, 'error'\)/);
  });
});

describe('lead detail page wires the Reply composer', () => {
  const SRC = read('app/admin/leads/[id]/page.tsx');

  it('imports the ReplyDialog component', () => {
    expect(SRC).toMatch(/import ReplyDialog from '\.\/ReplyDialog'/);
  });

  it('renders a primary Reply button gated on lead.email', () => {
    expect(SRC).toMatch(/data-testid="reply-button"/);
    expect(SRC).toMatch(/disabled=\{!lead\.email\}/);
  });

  it("the Reply button is now the primary header CTA (Mark contacted demoted)", () => {
    // The Reply button uses lead-detail__btn--primary; Mark contacted
    // dropped to the secondary `lead-detail__btn`.
    expect(SRC).toMatch(/lead-detail__btn lead-detail__btn--primary"[\s\S]{0,400}data-action="reply"/);
  });

  it("mounts the ReplyDialog only when open + has an email recipient", () => {
    expect(SRC).toMatch(/\{replyOpen && lead && lead\.email && \(/);
    expect(SRC).toMatch(/<ReplyDialog\s/);
  });

  it("the Reply subject is prefilled with the SS reference number when present", () => {
    expect(SRC).toMatch(/defaultSubject=\{`Re: Your Starr Surveying request/);
    expect(SRC).toMatch(/lead\.notes\.match\(\/Ref:\\s\*\(\\S\+\)\//);
  });
});
