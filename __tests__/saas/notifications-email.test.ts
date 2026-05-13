// __tests__/saas/notifications-email.test.ts
//
// Locks the template renderer + the Resend adapter's dev-mode short
// circuit. Phase F-2.
//
// Spec: docs/planning/in-progress/CUSTOMER_MESSAGING_PLAN.md §3 + §4.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  renderTemplate,
  renderTemplateDef,
  sendEmailViaResend,
} from '@/lib/saas/notifications/email';
import {
  INVITE_SENT,
  PASSWORD_RESET,
  SIGNUP_WELCOME,
} from '@/lib/saas/notifications/templates';

describe('renderTemplate', () => {
  it('substitutes top-level {{var}}', () => {
    expect(renderTemplate('Hi {{name}}', { name: 'Alice' })).toBe('Hi Alice');
  });

  it('substitutes dotted paths {{user.name}}', () => {
    expect(renderTemplate('Hi {{user.name}}', { user: { name: 'Alice' } })).toBe('Hi Alice');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(renderTemplate('{{ name }}', { name: 'Bob' })).toBe('Bob');
  });

  it('leaves placeholders alone when a key is missing (surfaces the gap)', () => {
    expect(renderTemplate('Hi {{name}}', {})).toBe('Hi {{name}}');
  });

  it('handles null + undefined values as "missing"', () => {
    expect(renderTemplate('Hi {{name}}', { name: null })).toBe('Hi {{name}}');
    expect(renderTemplate('Hi {{name}}', { name: undefined })).toBe('Hi {{name}}');
  });

  it('renders numbers + booleans as strings', () => {
    expect(renderTemplate('{{count}} of {{total}}', { count: 7, total: 10 })).toBe('7 of 10');
    expect(renderTemplate('active: {{flag}}', { flag: true })).toBe('active: true');
  });

  it('handles multiple substitutions in one string', () => {
    const out = renderTemplate('{{a}} + {{b}} = {{c}}', { a: 1, b: 2, c: 3 });
    expect(out).toBe('1 + 2 = 3');
  });
});

describe('renderTemplateDef', () => {
  it('renders subject + html + text together', () => {
    const out = renderTemplateDef(
      { subject: 'Hi {{name}}', html: '<p>{{name}}</p>', text: 'Hi {{name}}' },
      { name: 'Alice' },
    );
    expect(out).toEqual({
      subject: 'Hi Alice',
      html: '<p>Alice</p>',
      text: 'Hi Alice',
    });
  });

  it('handles templates without a text variant', () => {
    const out = renderTemplateDef(
      { subject: 'Hi', html: '<p>X</p>' },
      {},
    );
    expect(out.text).toBeUndefined();
  });
});

describe('template definitions', () => {
  it('SIGNUP_WELCOME renders a full email when given typical vars', () => {
    const out = renderTemplateDef(SIGNUP_WELCOME, {
      user: { name: 'Alice', email: 'alice@acme.com' },
      org: { name: 'Acme Surveying', url: 'https://acme.starrsoftware.com' },
      plan: { label: 'Firm Suite', amount: '$499' },
    });
    expect(out.subject).toContain('Alice');
    expect(out.html).toContain('Acme Surveying');
    expect(out.html).toContain('Firm Suite');
    expect(out.text).toContain('Alice');
    expect(out.text).toContain('https://acme.starrsoftware.com');
  });

  it('INVITE_SENT renders inviter + invite link', () => {
    const out = renderTemplateDef(INVITE_SENT, {
      inviter: { name: 'Alice', email: 'alice@acme.com' },
      org: { name: 'Acme Surveying' },
      invite: { role: 'surveyor', url: 'https://starrsoftware.com/accept-invite/abc123' },
    });
    expect(out.subject).toContain('Alice');
    expect(out.subject).toContain('Acme Surveying');
    expect(out.html).toContain('starrsoftware.com/accept-invite/abc123');
  });

  it('PASSWORD_RESET renders the reset URL', () => {
    const out = renderTemplateDef(PASSWORD_RESET, {
      user: { email: 'alice@acme.com' },
      reset: { url: 'https://starrsoftware.com/reset-password?token=abc' },
    });
    expect(out.html).toContain('reset-password?token=abc');
    expect(out.text).toContain('reset-password?token=abc');
  });
});

describe('sendEmailViaResend (dev-mode short circuit)', () => {
  const originalKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it('returns true and skips fetch when no API key is set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const out = await sendEmailViaResend({
      to: 'a@b.com',
      subject: 'hi',
      html: '<p>hi</p>',
    });
    expect(out).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns true when the key is the placeholder "your_resend_api_key"', async () => {
    process.env.RESEND_API_KEY = 'your_resend_api_key';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const out = await sendEmailViaResend({
      to: 'a@b.com',
      subject: 'hi',
      html: '<p>hi</p>',
    });
    expect(out).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('calls Resend when a real key is set + returns true on 2xx', async () => {
    process.env.RESEND_API_KEY = 're_test_key_123';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{"id":"e_abc"}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const out = await sendEmailViaResend({
      to: 'a@b.com',
      subject: 'hi',
      html: '<p>hi</p>',
      tags: { event: 'signup_welcome', orgId: 'org_1' },
    });
    expect(out).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe('https://api.resend.com/emails');
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.to).toEqual(['a@b.com']);
    expect(body.subject).toBe('hi');
    expect(body.tags).toEqual([
      { name: 'event', value: 'signup_welcome' },
      { name: 'orgId', value: 'org_1' },
    ]);
  });

  it('returns false on Resend non-2xx without throwing', async () => {
    process.env.RESEND_API_KEY = 're_test_key_123';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{"message":"bad"}', { status: 422, headers: { 'content-type': 'application/json' } }),
    );
    const out = await sendEmailViaResend({
      to: 'a@b.com',
      subject: 'hi',
      html: '<p>hi</p>',
    });
    expect(out).toBe(false);
  });
});
