// __tests__/admin/lead-reply-templates.test.ts
//
// LR4 of lead-reply-expansion-2026-06-18.md — locks the reply-template
// system end-to-end:
//   - Seed 321 creates the table + seeds five org-default templates.
//   - Pure helpers in lib/leads/templates.ts handle the {{var}}
//     substitution + the lead → vars derivation.
//   - GET /api/admin/reply-templates lists ordered by is_org_default
//     then category then name.
//   - The ReplyDialog renders a Templates picker that fills subject +
//     body when chosen, interpolating from the lead context.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildTemplateVarsFromLead,
  extractFirstName,
  extractRefNumber,
  formatQuoteAmount,
  interpolateTemplate,
} from '@/lib/leads/templates';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('interpolateTemplate (pure)', () => {
  it('substitutes single + multiple known keys', () => {
    expect(interpolateTemplate('Hello {{first_name}}', { first_name: 'Mary' }))
      .toBe('Hello Mary');
    expect(interpolateTemplate('{{first_name}} {{full_name}}', {
      first_name: 'Mary', full_name: 'Mary Smith',
    })).toBe('Mary Mary Smith');
  });

  it('leaves unknown keys literal (typos do not crash the template)', () => {
    expect(interpolateTemplate('Hello {{unknown}}', { first_name: 'x' }))
      .toBe('Hello {{unknown}}');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(interpolateTemplate('{{ first_name }}', { first_name: 'Bo' }))
      .toBe('Bo');
  });

  it("empty / null / undefined values substitute to ''", () => {
    expect(interpolateTemplate('a{{first_name}}z', { first_name: '' })).toBe('az');
    expect(interpolateTemplate('a{{first_name}}z', { first_name: undefined as unknown as string }))
      .toBe('az');
  });

  it("returns '' for a non-string template", () => {
    expect(interpolateTemplate(null as unknown as string, {})).toBe('');
  });
});

describe('extractFirstName + extractRefNumber + formatQuoteAmount (pure)', () => {
  it("first name splits on whitespace + falls back to 'there'", () => {
    expect(extractFirstName('Mary Smith')).toBe('Mary');
    expect(extractFirstName('Mary')).toBe('Mary');
    expect(extractFirstName('   ')).toBe('there');
    expect(extractFirstName(null)).toBe('there');
    expect(extractFirstName(undefined)).toBe('there');
  });

  it("ref number pulls SS-… out of the customer notes", () => {
    expect(extractRefNumber('Ref: SS-260618-133521-JPV\n\nHello,')).toBe('SS-260618-133521-JPV');
    expect(extractRefNumber('no ref here')).toBe('');
    expect(extractRefNumber(null)).toBe('');
  });

  it("quote amount formats numbers as USD; null / NaN → $0.00", () => {
    expect(formatQuoteAmount(1234.5)).toBe('$1,234.50');
    expect(formatQuoteAmount(0)).toBe('$0.00');
    expect(formatQuoteAmount(null)).toBe('$0.00');
    expect(formatQuoteAmount(Number.NaN)).toBe('$0.00');
  });
});

describe('buildTemplateVarsFromLead (pure)', () => {
  it('packs every var from a populated lead', () => {
    expect(buildTemplateVarsFromLead({
      name: 'Mary Smith',
      notes: 'Ref: SS-260618-XYZ\n\nHello,',
      survey_type: 'Boundary survey',
      quote_amount: 1250,
    })).toEqual({
      first_name: 'Mary',
      full_name: 'Mary Smith',
      ref_number: 'SS-260618-XYZ',
      survey_type: 'Boundary survey',
      quote_amount: '$1,250.00',
    });
  });

  it('falls back to friendly defaults when the lead is sparse', () => {
    expect(buildTemplateVarsFromLead({})).toEqual({
      first_name: 'there',
      full_name: 'there',
      ref_number: '',
      survey_type: 'survey',
      quote_amount: '$0.00',
    });
  });
});

describe('seed 321 — reply_templates table + org defaults', () => {
  const SRC = read('seeds/321_reply_templates.sql');

  it('creates the reply_templates table with the audit columns', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.reply_templates/);
    expect(SRC).toMatch(/subject_template\s+TEXT NOT NULL/);
    expect(SRC).toMatch(/body_html_template\s+TEXT NOT NULL/);
    expect(SRC).toMatch(/is_org_default\s+BOOLEAN NOT NULL DEFAULT FALSE/);
  });

  it("uses UNIQUE (org_id, name) so the org-default INSERT can ON CONFLICT DO NOTHING", () => {
    expect(SRC).toMatch(/UNIQUE \(org_id, name\)/);
    expect(SRC).toMatch(/ON CONFLICT \(org_id, name\) DO NOTHING/);
  });

  it('seeds the five org-defaults named in the plan', () => {
    expect(SRC).toMatch(/'First contact',\s*'intake',/);
    expect(SRC).toMatch(/'Quote follow-up',\s*'sales',/);
    expect(SRC).toMatch(/'Scheduling site visit',\s*'scheduling',/);
    expect(SRC).toMatch(/'Requesting more info',\s*'intake',/);
    expect(SRC).toMatch(/'Job complete',\s*'delivery',/);
  });

  it('every seeded body uses the {{var}} substitution syntax', () => {
    // first_name + ref_number are the minimum the plan requires.
    expect(SRC).toMatch(/\{\{first_name\}\}/);
    expect(SRC).toMatch(/\{\{ref_number\}\}/);
    expect(SRC).toMatch(/\{\{survey_type\}\}/);
    expect(SRC).toMatch(/\{\{quote_amount\}\}/);
  });

  it('enables RLS + adds the service_role full-access policy', () => {
    expect(SRC).toMatch(/ALTER TABLE public\.reply_templates ENABLE ROW LEVEL SECURITY/);
    expect(SRC).toMatch(/CREATE POLICY service_role_full_access_reply_templates/);
  });
});

describe('reply-templates API route', () => {
  const SRC = read('app/api/admin/reply-templates/route.ts');

  it('gates GET on admin auth', () => {
    expect(SRC).toMatch(/isAdmin\(session\.user\.roles\)/);
    expect(SRC).toMatch(/'Forbidden'/);
  });

  it("orders org-defaults first, then by category + name", () => {
    expect(SRC).toMatch(/\.order\('is_org_default', \{ ascending: false \}\)/);
    expect(SRC).toMatch(/\.order\('category', \{ ascending: true \}\)/);
    expect(SRC).toMatch(/\.order\('name', \{ ascending: true \}\)/);
  });
});

describe('ReplyDialog renders the Templates picker', () => {
  const SRC = read('app/admin/leads/[id]/ReplyDialog.tsx');

  it('fetches /api/admin/reply-templates on mount', () => {
    expect(SRC).toMatch(/fetch\('\/api\/admin\/reply-templates'\)/);
  });

  it('renders the picker row + toggle button when templates loaded', () => {
    expect(SRC).toMatch(/data-testid="reply-templates-row"/);
    expect(SRC).toMatch(/data-testid="reply-templates-toggle"/);
    expect(SRC).toMatch(/data-testid="reply-templates-list"/);
    expect(SRC).toMatch(/data-testid="reply-template-pick"/);
  });

  it("applyTemplate interpolates from leadVars + fills subject + body", () => {
    expect(SRC).toMatch(/const vars = leadVars \? buildTemplateVarsFromLead\(leadVars\) : \{\}/);
    expect(SRC).toMatch(/const nextSubject = interpolateTemplate\(t\.subject_template, vars\)/);
    // LR9 QA pass — body uses the HTML-safe variant so customer-
    // supplied vars can't XSS the surveyor; subject still uses
    // plain interpolateTemplate (plain text, no escape).
    expect(SRC).toMatch(/const nextBody = interpolateTemplateHtml\(t\.body_html_template, vars\)/);
    expect(SRC).toMatch(/setSubject\(nextSubject\)/);
    expect(SRC).toMatch(/editorRef\.current\.innerHTML = nextBody/);
  });
});

describe('lead detail page passes leadVars into the dialog', () => {
  const SRC = read('app/admin/leads/[id]/page.tsx');

  it("forwards name / notes / survey_type / quote_amount as leadVars", () => {
    expect(SRC).toMatch(/leadVars=\{\{[\s\S]{0,400}name: lead\.name,[\s\S]{0,400}notes: lead\.notes,[\s\S]{0,400}survey_type: lead\.survey_type,[\s\S]{0,400}quote_amount: lead\.quote_amount,/);
  });
});
