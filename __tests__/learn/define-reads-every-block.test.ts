// __tests__/learn/define-reads-every-block.test.ts
//
// Owner, 2026-08-06: *"we have terms scattered throughout the lessons that we can hover over/click
// and get the definition for. Right now no definitions are being supplied… Is claude api not hooked
// up correctly?"*
//
// ── IT WAS HOOKED UP CORRECTLY. THE ROUTE READ THE WRONG BLOCK. ─────────────────────────────────
//
// `/api/admin/learn/define` did:
//
//     const block = response.content[0];
//     const definition = block && block.type === 'text' ? block.text.trim() : '';
//     if (!definition) return 502 'No definition returned';
//
// On Claude Opus 5 **thinking is on by default** — omitting the `thinking` parameter used to mean
// "no thinking", and on this model it means adaptive thinking. So the response arrives as
// `[thinking, text]`, `content[0]` is a thinking block whose text is empty (`display` defaults to
// `"omitted"`), the ternary yields `''`, and the route returns 502 while holding a perfectly good
// definition in `content[1]`.
//
// Measured against the live API on 2026-08-06: identical requests returned `[text]` on one call and
// `[thinking, text]` on the next — adaptive thinking decides per request. That is why this looked
// intermittent before it looked total, and why checking the API key never explained it.
//
// The second half of the same change: `max_tokens` now caps thinking AND the answer together. One
// measured request spent 158 of its 220-token budget on thinking and stopped at `max_tokens`
// mid-sentence.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'app', 'api', 'admin', 'learn', 'define', 'route.ts'),
  'utf8',
);

/** Source with comments removed. The fix note in that file quotes the old `content[0]` line on
 *  purpose, and a bare match would score the explanation as the defect. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

/** The extraction the route performs, lifted so the shapes can be tested directly. */
type Block = { type: string; text?: string };
function definitionFrom(content: Block[]): string {
  return content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
}

describe('pulling the definition out of a Claude response', () => {
  it('reads the text block when it is first', () => {
    expect(definitionFrom([{ type: 'text', text: 'A bearing is a direction.' }]))
      .toBe('A bearing is a direction.');
  });

  it('reads the text block when a thinking block precedes it', () => {
    // The exact shape the live API returned. `content[0]` indexing scored this as no definition.
    expect(definitionFrom([
      { type: 'thinking', text: '' },
      { type: 'text', text: 'A bearing is a direction.' },
    ])).toBe('A bearing is a direction.');
  });

  it('joins a reply split across several text blocks', () => {
    expect(definitionFrom([
      { type: 'thinking', text: '' },
      { type: 'text', text: 'A bearing is ' },
      { type: 'text', text: 'a direction.' },
    ])).toBe('A bearing is a direction.');
  });

  it('still reports nothing when there is genuinely no text', () => {
    expect(definitionFrom([{ type: 'thinking', text: '' }])).toBe('');
    expect(definitionFrom([])).toBe('');
  });
});

describe('the route itself', () => {
  it('does not index content[0]', () => {
    // The specific line that caused this. A future edit that reintroduces positional indexing on
    // the content array reintroduces the bug, silently, on any request where Claude decides to think.
    expect(CODE).not.toMatch(/response\.content\[0\]/);
    expect(CODE).toMatch(/response\.content\s*\r?\n?\s*\.filter/);
  });

  it('budgets max_tokens for thinking as well as the answer', () => {
    // 220 was sized for a 1-3 sentence definition alone. A measured request spent 158 on thinking.
    const m = CODE.match(/max_tokens:\s*(\d+)/);
    expect(m, 'max_tokens should be set explicitly').toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(600);
  });

  it('keeps a tooltip from deliberating', () => {
    // A definition popup is latency-visible; low effort keeps adaptive thinking short. Turning
    // thinking off entirely is the other lever but risks leaking <thinking> tags into the answer
    // on this model — in a definition popup that would be user-visible.
    expect(CODE).toMatch(/effort:\s*'low'/);
  });

  it('distinguishes truncation from an empty answer', () => {
    expect(CODE).toMatch(/stop_reason === 'max_tokens'/);
  });
});
