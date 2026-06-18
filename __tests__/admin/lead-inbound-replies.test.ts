// __tests__/admin/lead-inbound-replies.test.ts
//
// LR7 of lead-reply-expansion-2026-06-18.md — schema + UI for inbound
// customer replies. Provider parsing is intentionally agnostic (Resend
// Inbound, Postmark, SendGrid Inbound Parse, Mailgun Routes all post
// similar JSON), and the actual provider config / DNS work happens
// outside the codebase. The schema + webhook + UI ship now.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  extractBodyHtml,
  extractBodyText,
  extractFromEmail,
  extractMessageId,
  extractReferenceNumber,
  parseAddress,
  parseInbound,
} from '@/lib/leads/inbound-parser';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('parseAddress (pure)', () => {
  it("strips 'Display Name <addr>' wrappers + lowercases", () => {
    expect(parseAddress('Mary Smith <Mary@Example.COM>')).toBe('mary@example.com');
    expect(parseAddress('mary@example.com')).toBe('mary@example.com');
    expect(parseAddress('"Mary" <mary@x.com>')).toBe('mary@x.com');
  });
});

describe('extractFromEmail (pure)', () => {
  it("reads payload.from when it's a string", () => {
    expect(extractFromEmail({ from: 'Mary <mary@x.com>' })).toBe('mary@x.com');
  });
  it("reads payload.from.email when it's an object", () => {
    expect(extractFromEmail({ from: { email: 'Mary@X.com' } })).toBe('mary@x.com');
  });
  it("falls back to payload.email", () => {
    expect(extractFromEmail({ email: 'a@b.com' })).toBe('a@b.com');
  });
  it("returns '' when none of the fields are present", () => {
    expect(extractFromEmail({})).toBe('');
  });
});

describe('extractBodyText + extractBodyHtml (pure)', () => {
  it('reads each provider\'s common field names', () => {
    expect(extractBodyText({ text: 'plain' })).toBe('plain');
    expect(extractBodyText({ TextBody: 'pm' })).toBe('pm');
    expect(extractBodyText({ body_plain: 'mg' })).toBe('mg');
    expect(extractBodyText({})).toBe('');

    expect(extractBodyHtml({ html: '<p>x</p>' })).toBe('<p>x</p>');
    expect(extractBodyHtml({ HtmlBody: '<p>pm</p>' })).toBe('<p>pm</p>');
    expect(extractBodyHtml({ body_html: '<p>mg</p>' })).toBe('<p>mg</p>');
    expect(extractBodyHtml({})).toBeNull();
    expect(extractBodyHtml({ html: '   ' })).toBeNull();
  });
});

describe('extractReferenceNumber (pure)', () => {
  it("finds an SS-… reference number in the subject", () => {
    expect(extractReferenceNumber({ subject: 'Re: Your request [SS-260618-ABC]' }))
      .toBe('SS-260618-ABC');
  });
  it("finds the reference inside the body text when missing from the subject", () => {
    expect(extractReferenceNumber({
      subject: 'Quick question',
      text: 'reference: SS-260618-XYZ for our quote',
    })).toBe('SS-260618-XYZ');
  });
  it("returns null when no reference is anywhere", () => {
    expect(extractReferenceNumber({ subject: 'hi', text: 'no ref here' })).toBeNull();
  });
});

describe('extractMessageId (pure)', () => {
  it("reads each provider's message-id field name", () => {
    expect(extractMessageId({ messageId: 'res_1' })).toBe('res_1');
    expect(extractMessageId({ MessageID: 'pm_1' })).toBe('pm_1');
    expect(extractMessageId({ message_id: 'sg_1' })).toBe('sg_1');
    expect(extractMessageId({})).toBeNull();
  });
});

describe('parseInbound (pure)', () => {
  it("returns null when the sender OR the reference is missing", () => {
    expect(parseInbound({ subject: '[SS-260618-A]' })).toBeNull();
    expect(parseInbound({ from: 'mary@x.com', subject: 'no ref' })).toBeNull();
  });

  it("packs every field when the payload is complete", () => {
    const parsed = parseInbound({
      from: 'Mary <mary@example.com>',
      subject: 'Re: SS-260618-XYZ',
      text: 'Hi, thanks for the quote',
      html: '<p>Hi, thanks for the quote</p>',
      messageId: 'res_12345',
    });
    expect(parsed).toEqual({
      fromEmail: 'mary@example.com',
      subject: 'Re: SS-260618-XYZ',
      bodyText: 'Hi, thanks for the quote',
      bodyHtml: '<p>Hi, thanks for the quote</p>',
      messageId: 'res_12345',
      referenceNumber: 'SS-260618-XYZ',
    });
  });
});

describe('seed 322 — direction + from_email + inbound_message_id', () => {
  const SRC = read('seeds/322_lead_replies_direction.sql');

  it("adds the new columns via ADD COLUMN IF NOT EXISTS", () => {
    expect(SRC).toMatch(/ADD COLUMN IF NOT EXISTS direction\s+TEXT NOT NULL DEFAULT 'outbound'/);
    expect(SRC).toMatch(/ADD COLUMN IF NOT EXISTS from_email\s+TEXT/);
    expect(SRC).toMatch(/ADD COLUMN IF NOT EXISTS inbound_message_id TEXT/);
  });

  it("relaxes body_html NOT NULL so inbound text-only payloads can land", () => {
    expect(SRC).toMatch(/ALTER COLUMN body_html DROP NOT NULL/);
  });

  it("adds a CHECK constraint binding direction to outbound|inbound", () => {
    expect(SRC).toMatch(/CHECK \(direction IN \('outbound', 'inbound'\)\)/);
  });

  it("indexes (lead_id, direction, sent_at DESC) for thread sort", () => {
    expect(SRC).toMatch(/idx_lead_replies_lead_direction_sent[\s\S]{0,200}\(lead_id, direction, sent_at DESC\)/);
  });

  it("dedupes webhook retries via UNIQUE (inbound_message_id) WHERE NOT NULL", () => {
    expect(SRC).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uniq_lead_replies_inbound_message_id[\s\S]{0,200}WHERE inbound_message_id IS NOT NULL/);
  });
});

describe('inbound webhook route', () => {
  const SRC = read('app/api/webhooks/email-inbound/route.ts');

  it("503s when EMAIL_INBOUND_WEBHOOK_SECRET isn't set", () => {
    expect(SRC).toMatch(/'Inbound webhook is not configured'/);
    expect(SRC).toMatch(/\{ status: 503 \}/);
  });

  it("requires the x-webhook-secret header to match the env value", () => {
    expect(SRC).toMatch(/req\.headers\.get\('x-webhook-secret'\)/);
    expect(SRC).toMatch(/!provided \|\| provided !== secret/);
  });

  it("looks up the lead by LIKE 'Ref: <reference>%'", () => {
    expect(SRC).toMatch(/`Ref: \$\{parsed\.referenceNumber\}%`/);
    expect(SRC).toMatch(/\.like\('notes', refPattern\)/);
  });

  it("inserts the row with direction='inbound' + from_email + inbound_message_id", () => {
    expect(SRC).toMatch(/direction: 'inbound' as const/);
    expect(SRC).toMatch(/from_email: parsed\.fromEmail/);
    expect(SRC).toMatch(/inbound_message_id: parsed\.messageId/);
  });

  it("treats a PG_UNIQUE_VIOLATION as success (webhook retry)", () => {
    expect(SRC).toMatch(/PG_UNIQUE_VIOLATION = '23505'/);
    expect(SRC).toMatch(/reason: 'duplicate'/);
  });

  it("200s on no-reference / no-lead so the provider stops retrying", () => {
    expect(SRC).toMatch(/reason: 'no_reference_number'/);
    expect(SRC).toMatch(/reason: 'lead_not_found'/);
  });
});

describe('RepliesList renders direction-aware rows', () => {
  const SRC = read('app/admin/leads/[id]/RepliesList.tsx');

  it("forks the row data-direction attribute on inbound vs outbound", () => {
    expect(SRC).toMatch(/data-direction=\{isInbound \? 'inbound' : 'outbound'\}/);
  });

  it("shows a ↗ / ↘ glyph in the header", () => {
    expect(SRC).toMatch(/data-testid="lead-replies-direction-glyph"/);
    expect(SRC).toMatch(/\{isInbound \? '↘' : '↗'\}/);
  });

  it("tints inbound rows green via CSS", () => {
    expect(SRC).toMatch(/\.lead-detail__reply\[data-direction="inbound"\]/);
  });

  it("uses from_email as the displayed sender on inbound rows", () => {
    expect(SRC).toMatch(/isInbound\s*\?\s*\(r\.from_email \?\? r\.sender_email\)/);
  });

  it("falls back to body_text when body_html is null (inbound providers)", () => {
    expect(SRC).toMatch(/data-testid="lead-replies-text-fallback"/);
  });
});

describe('reply GET route selects the new direction columns', () => {
  const SRC = read('app/api/admin/leads/[id]/reply/route.ts');

  it("includes direction + from_email in the GET select", () => {
    expect(SRC).toMatch(/sent_at, direction, from_email/);
  });
});
