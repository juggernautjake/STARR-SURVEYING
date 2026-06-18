// __tests__/admin/lead-reply-ai-draft.test.ts
//
// LR5 of lead-reply-expansion-2026-06-18.md — AI-drafted reply via
// Claude. Locks:
//   - Pure prompt + extraction helpers in lib/leads/ai-draft.ts.
//   - The endpoint at /api/admin/leads/[id]/ai-draft wires the
//     Anthropic SDK call with claude-sonnet-4-6 and degrades to 503
//     `AI_DISABLED` when ANTHROPIC_API_KEY isn't set.
//   - The composer renders the 🤖 AI Draft button + hint panel,
//     hides it when the endpoint reports the feature isn't
//     configured, and pastes the returned HTML into the editor.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  SYSTEM_PROMPT,
  buildDraftPrompt,
  extractDraftHtml,
} from '@/lib/leads/ai-draft';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('SYSTEM_PROMPT shape', () => {
  it("declares the firm's identity + the firm's contact line", () => {
    expect(SYSTEM_PROMPT).toMatch(/Starr Surveying/);
    expect(SYSTEM_PROMPT).toMatch(/info@starr-surveying\.com/);
    expect(SYSTEM_PROMPT).toMatch(/\(936\) 662-0077/);
  });

  it("enforces HTML-only output + bans inventing pricing / dates", () => {
    expect(SYSTEM_PROMPT).toMatch(/Return HTML only/);
    expect(SYSTEM_PROMPT).toMatch(/Never invent specific pricing, dates/);
  });

  it("explicitly bans revealing the internal office notes", () => {
    expect(SYSTEM_PROMPT).toMatch(/Never reveal internal office notes/);
  });
});

describe('buildDraftPrompt (pure)', () => {
  it("starts with customer + survey type + reference number when present", () => {
    const out = buildDraftPrompt({
      customerName: 'Mary Smith',
      customerInquiry: 'Need a boundary survey for my lot in Conroe.',
      surveyType: 'Boundary',
      referenceNumber: 'SS-260618-XYZ',
    });
    expect(out).toMatch(/Customer name: Mary Smith/);
    expect(out).toMatch(/Survey type: Boundary/);
    expect(out).toMatch(/Reference: SS-260618-XYZ/);
    expect(out).toMatch(/=== Customer's original inquiry ===\nNeed a boundary survey for my lot in Conroe\./);
    expect(out).toMatch(/Draft a single polite reply HTML now\./);
  });

  it('caps reply history at 6 entries + flags them newest-first', () => {
    const ctx = {
      customerName: 'X',
      customerInquiry: '',
      replyHistory: Array.from({ length: 10 }, (_, i) => ({
        sender: `s${i}`,
        subject: `Subject ${i}`,
        bodyText: `Body ${i}`,
        sentAt: `2026-06-${10 + i}T12:00:00Z`,
      })),
    };
    const out = buildDraftPrompt(ctx);
    expect(out).toMatch(/Prior outbound replies \(newest first\)/);
    expect(out).toMatch(/Subject 0/);
    expect(out).toMatch(/Subject 5/);
    expect(out).not.toMatch(/Subject 6/);
  });

  it('marks the office notes section as DO NOT REVEAL', () => {
    const out = buildDraftPrompt({
      customerName: 'X',
      customerInquiry: '',
      officeNotes: [{ author: 'hank', body: 'Spoke with Mary Tuesday', createdAt: '2026-06-18' }],
    });
    expect(out).toMatch(/Internal office notes \(DO NOT REVEAL TO CUSTOMER\)/);
    expect(out).toMatch(/\[2026-06-18\] hank: Spoke with Mary Tuesday/);
  });

  it("includes the surveyor's hint when provided", () => {
    const out = buildDraftPrompt({
      customerName: 'X',
      customerInquiry: '',
      surveyorHint: 'they asked about scheduling for Tuesday',
    });
    expect(out).toMatch(/Surveyor's instruction for this reply/);
    expect(out).toMatch(/they asked about scheduling for Tuesday/);
  });

  it("falls back to '(none on file)' when the inquiry is empty", () => {
    const out = buildDraftPrompt({ customerName: 'X', customerInquiry: '' });
    expect(out).toMatch(/\(none on file\)/);
  });
});

describe('extractDraftHtml (pure)', () => {
  it("returns the input trimmed when no fence", () => {
    expect(extractDraftHtml('  <p>Hi</p>  ')).toBe('<p>Hi</p>');
  });

  it("unwraps ```html ... ``` fences", () => {
    expect(extractDraftHtml('```html\n<p>Hi</p>\n```')).toBe('<p>Hi</p>');
    expect(extractDraftHtml('```\n<p>Hi</p>\n```')).toBe('<p>Hi</p>');
  });

  it("returns '' for empty / falsy input", () => {
    expect(extractDraftHtml('')).toBe('');
    expect(extractDraftHtml(null as unknown as string)).toBe('');
  });
});

describe('ai-draft API route', () => {
  const SRC = read('app/api/admin/leads/[id]/ai-draft/route.ts');

  it("gates POST on admin auth", () => {
    expect(SRC).toMatch(/isAdmin\(session\.user\.roles\)/);
    expect(SRC).toMatch(/'Forbidden'/);
  });

  it("503s with AI_DISABLED when ANTHROPIC_API_KEY isn't set", () => {
    expect(SRC).toMatch(/error: 'AI_DISABLED'/);
    expect(SRC).toMatch(/\{ status: 503 \}/);
  });

  it("uses claude-sonnet-4-6 per project model convention", () => {
    expect(SRC).toMatch(/const MODEL = 'claude-sonnet-4-6'/);
  });

  it("loads lead + recent reply history + recent office notes", () => {
    expect(SRC).toMatch(/\.from\('leads'\)[\s\S]{0,200}\.maybeSingle\(\)/);
    expect(SRC).toMatch(/\.from\('lead_replies'\)[\s\S]{0,200}\.limit\(6\)/);
    expect(SRC).toMatch(/\.from\('lead_notes'\)[\s\S]{0,200}\.limit\(6\)/);
  });

  it("calls client.messages.create with the system prompt + user turn", () => {
    expect(SRC).toMatch(/client\.messages\.create\(\{[\s\S]{0,400}system: SYSTEM_PROMPT/);
    expect(SRC).toMatch(/role: 'user', content: userPrompt/);
  });

  it("returns { html, model } with extractDraftHtml-cleaned output", () => {
    expect(SRC).toMatch(/const html = extractDraftHtml\(modelText\)/);
    expect(SRC).toMatch(/return NextResponse\.json\(\{ html, model: MODEL \}\)/);
  });
});

describe('ReplyDialog wires the AI Draft button', () => {
  const SRC = read('app/admin/leads/[id]/ReplyDialog.tsx');

  it("renders the 🤖 AI Draft toggle + the hint panel", () => {
    expect(SRC).toMatch(/data-testid="reply-ai-toggle"/);
    expect(SRC).toMatch(/data-testid="reply-ai-hint-panel"/);
    expect(SRC).toMatch(/data-testid="reply-ai-go"/);
  });

  it("hides the AI button when the endpoint reports the feature is disabled", () => {
    expect(SRC).toMatch(/setAiDisabled\(true\)/);
    expect(SRC).toMatch(/\{!aiDisabled && \(/);
  });

  it("POSTs the optional surveyorHint along with the request", () => {
    expect(SRC).toMatch(/surveyorHint: surveyorHint\.trim\(\) \|\| undefined/);
  });

  it("pastes the returned html into the editor", () => {
    expect(SRC).toMatch(/editorRef\.current\.innerHTML = data\.html/);
  });

  it("toasts the API error body when the draft fails", () => {
    expect(SRC).toMatch(/addToast\(`AI draft failed — \$\{data\.error \?\? `HTTP \$\{res\.status\}`\}`, 'error'\)/);
  });
});
