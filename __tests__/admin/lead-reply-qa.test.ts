// __tests__/admin/lead-reply-qa.test.ts
//
// LR9 of lead-reply-expansion-2026-06-18.md — QA + bug review pass.
// Two real bugs were found while walking the slices LR1–LR8 end to
// end. Both are stored-XSS vectors that would let a hostile customer
// inject script into the surveyor's session. Both have minimal,
// well-tested fixes.
//
// Bug 1: LR4 templates substitute customer-supplied vars (name,
//        survey_type) into HTML bodies via innerHTML. A customer
//        whose name is `<script>alert(1)</script>` would trigger
//        when the surveyor picked a template.
//        Fix: new `interpolateTemplateHtml(template, vars)` HTML-
//        escapes each var value; the dialog uses it for the body.
//
// Bug 2: LR7 inbound webhook stores the customer's raw email HTML.
//        The RepliesList renders inbound bodies via
//        dangerouslySetInnerHTML. A hostile customer email could
//        carry <script> / onerror=/ javascript: payloads.
//        Fix: new `sanitizeInboundHtml(html)` strips dangerous tags
//        + event handlers + javascript:/data: URIs server-side
//        before insert.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  escapeHtml,
  interpolateTemplate,
  interpolateTemplateHtml,
} from '@/lib/leads/templates';
import { parseInbound, sanitizeInboundHtml } from '@/lib/leads/inbound-parser';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('escapeHtml (pure)', () => {
  it("escapes the five canonical chars", () => {
    expect(escapeHtml('<script>alert("hi")</script>'))
      .toBe('&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt;');
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it("is idempotent on already-safe input", () => {
    expect(escapeHtml('Hello world')).toBe('Hello world');
  });
});

describe('interpolateTemplate vs interpolateTemplateHtml (pure)', () => {
  it("plain-text interpolation does NOT escape (subject lines)", () => {
    // Subjects are plain text; double-escaping ampersands would read
    // wrong in the customer's mailbox. The plain helper stays raw.
    expect(interpolateTemplate('Hi {{first_name}}', { first_name: 'Tom & Jerry' }))
      .toBe('Hi Tom & Jerry');
  });

  it("HTML interpolation escapes every var value", () => {
    expect(interpolateTemplateHtml('<p>Hi {{first_name}}</p>', {
      first_name: '<script>alert(1)</script>',
    })).toBe('<p>Hi &lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it("HTML interpolation tolerates whitespace inside the braces", () => {
    expect(interpolateTemplateHtml('{{ first_name }}', { first_name: 'A<B' }))
      .toBe('A&lt;B');
  });

  it("HTML interpolation leaves unknown keys literal (escape only known vars)", () => {
    expect(interpolateTemplateHtml('<p>Hi {{unknown}}</p>', { first_name: 'x' }))
      .toBe('<p>Hi {{unknown}}</p>');
  });

  it("HTML interpolation substitutes empty for null / undefined values", () => {
    expect(interpolateTemplateHtml('a{{first_name}}z', { first_name: '' })).toBe('az');
    expect(interpolateTemplateHtml('a{{first_name}}z', {})).toBe('a{{first_name}}z');
  });
});

describe('ReplyDialog uses the HTML-safe interpolator for the body', () => {
  const SRC = read('app/admin/leads/[id]/ReplyDialog.tsx');

  it("imports interpolateTemplateHtml", () => {
    expect(SRC).toMatch(/interpolateTemplateHtml/);
  });

  it("subject still uses plain interpolateTemplate; body uses the HTML-safe one", () => {
    expect(SRC).toMatch(/const nextSubject = interpolateTemplate\(t\.subject_template, vars\)/);
    expect(SRC).toMatch(/const nextBody = interpolateTemplateHtml\(t\.body_html_template, vars\)/);
  });
});

describe('sanitizeInboundHtml (pure)', () => {
  it("strips <script>...</script> blocks", () => {
    expect(sanitizeInboundHtml('<p>Hi</p><script>alert(1)</script>'))
      .toBe('<p>Hi</p>');
  });

  it("strips <style> / <iframe> / <object> / <embed> blocks", () => {
    expect(sanitizeInboundHtml('<style>x{display:none}</style><p>Hi</p>'))
      .toBe('<p>Hi</p>');
    expect(sanitizeInboundHtml('<iframe src="evil"></iframe><p>Hi</p>'))
      .toBe('<p>Hi</p>');
    expect(sanitizeInboundHtml('<object data="evil"></object><p>Hi</p>'))
      .toBe('<p>Hi</p>');
  });

  it("strips orphan opener / self-closing tags too (e.g. <iframe />)", () => {
    expect(sanitizeInboundHtml('<iframe src="evil" /><p>Hi</p>')).toBe('<p>Hi</p>');
    expect(sanitizeInboundHtml('<script src="x.js" /><p>Hi</p>')).toBe('<p>Hi</p>');
  });

  it("strips inline event handlers on any tag", () => {
    expect(sanitizeInboundHtml('<p onclick="x()">Hi</p>')).toBe('<p>Hi</p>');
    expect(sanitizeInboundHtml('<img src="x" onerror="alert(1)" />'))
      .toBe('<img src="x" />');
    expect(sanitizeInboundHtml('<a href=\'x\' onmouseover=\'y\'>z</a>'))
      .toBe('<a href=\'x\'>z</a>');
  });

  it("rewrites javascript: URIs to #", () => {
    expect(sanitizeInboundHtml('<a href="javascript:alert(1)">x</a>'))
      .toBe('<a href="#">x</a>');
    expect(sanitizeInboundHtml('<a href=javascript:alert(1)>x</a>'))
      .toBe('<a href="#">x</a>');
  });

  it("rewrites data: URIs in src / href to #", () => {
    expect(sanitizeInboundHtml('<a href="data:text/html,evil">x</a>'))
      .toBe('<a href="#">x</a>');
    expect(sanitizeInboundHtml('<iframe src="data:text/html,evil"></iframe><p>Hi</p>'))
      .toBe('<p>Hi</p>'); // iframe block stripped wholesale
  });

  it("preserves safe markup verbatim", () => {
    expect(sanitizeInboundHtml('<p>Hello <strong>Mary</strong></p><ul><li>One</li></ul>'))
      .toBe('<p>Hello <strong>Mary</strong></p><ul><li>One</li></ul>');
  });

  it("returns null for falsy input", () => {
    expect(sanitizeInboundHtml(null)).toBeNull();
    expect(sanitizeInboundHtml(undefined)).toBeNull();
    expect(sanitizeInboundHtml('')).toBeNull();
    expect(sanitizeInboundHtml('   ')).toBeNull();
  });
});

describe('parseInbound sanitises the bodyHtml before returning', () => {
  it("passes the raw HTML through sanitizeInboundHtml", () => {
    const parsed = parseInbound({
      from: 'mary@example.com',
      subject: 'Re: SS-260618-XYZ',
      text: 'Hi',
      html: '<p>Hi</p><script>alert(1)</script>',
    });
    expect(parsed?.bodyHtml).toBe('<p>Hi</p>');
  });

  it("returns null bodyHtml when the entire payload was hostile", () => {
    const parsed = parseInbound({
      from: 'mary@example.com',
      subject: 'Re: SS-260618-XYZ',
      text: 'Hi',
      html: '<script>alert(1)</script>',
    });
    expect(parsed?.bodyHtml).toBeNull();
  });
});

describe('LR9 plan annotation locks the QA findings', () => {
  // Smoke test that the annotation note in the doc references both
  // bugs so a future reviewer reading the plan + completed/ sees the
  // diagnostic trail.
  const PLAN = read('docs/planning/in-progress/lead-reply-expansion-2026-06-18.md');

  it("mentions the template-vars XSS fix", () => {
    expect(PLAN).toMatch(/interpolateTemplateHtml/);
  });

  it("mentions the inbound-HTML sanitiser", () => {
    expect(PLAN).toMatch(/sanitizeInboundHtml/);
  });
});
