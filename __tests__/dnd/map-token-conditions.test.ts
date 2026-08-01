// __tests__/dnd/map-token-conditions.test.ts — status on the board. M5-4.
//
// The rule this slice is really about is the one the map keeps re-learning: a value copied onto a token
// is a value that goes stale. The portrait, the size and now the conditions are all READ at render time.
// These tests pin the parts of that which are testable without a browser — the accessible name, and the
// source-level guarantee that nothing writes status onto a map object.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { conditionSuffix } from '@/app/dnd/_ui/maps/TokenConditions';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the accessible name carries the words the badges cannot', () => {
  it('names each condition', () => {
    // The pips are aria-hidden — a screen reader announcing "circle, circle, circle" is noise. The words
    // have to be somewhere, and the token's own name is the place that already exists.
    expect(conditionSuffix(['poisoned', 'prone'], 0)).toBe(', poisoned, prone');
  });

  it('states exhaustion as a LEVEL, not as a word', () => {
    // "Exhaustion 5" and "exhaustion 1" are different situations — one is nearly dead. A badge saying
    // only "exhausted" hides the number that decides whether the character can act.
    expect(conditionSuffix([], 5)).toBe(', exhaustion 5');
    expect(conditionSuffix(['prone'], 3)).toBe(', prone, exhaustion 3');
  });

  it('is EMPTY when there is nothing wrong, not "no conditions"', () => {
    // A healthy token must read as its name and nothing else; padding every name with "no conditions"
    // makes the ones that matter harder to hear, not easier.
    expect(conditionSuffix([], 0)).toBe('');
  });

  it('does not treat exhaustion 0 as a status', () => {
    expect(conditionSuffix([], 0)).toBe('');
    expect(conditionSuffix(['prone'], 0)).toBe(', prone');
  });
});

describe('status is READ, never stored on the token', () => {
  const TOKENS = read('lib/dnd/maps/tokens.ts');
  const SUBJECTS = read('lib/dnd/maps/subjects.ts');

  it('the token model still refuses to carry status', () => {
    // `tokens.ts` already refuses to store HP for this reason and says so. Conditions must not sneak in
    // through a different door.
    expect(TOKENS).not.toMatch(/conditions\s*[:?]/);
    expect(TOKENS).not.toMatch(/exhaustion\s*[:?]/);
  });

  it('conditions come from the character row at read time', () => {
    expect(SUBJECTS).toMatch(/data->combat/);
    expect(SUBJECTS).toMatch(/conditions:/);
  });

  it('a creature gets NO conditions — a bestiary row is a template, not a piece on the board', () => {
    // Inventing per-instance state for a template would attach a status to every copy of that monster at
    // once. Both creature paths must return empty.
    const creatureBlocks = SUBJECTS.split('subjectKey({ creatureId')[1] ?? '';
    expect(creatureBlocks).toMatch(/conditions: \[\]/);
    const variantBlocks = SUBJECTS.split('subjectKey({ creatureVariantId')[1] ?? '';
    expect(variantBlocks).toMatch(/conditions: \[\]/);
  });

  it('the query stays narrow — the whole sheet is NOT pulled to render a row of circles', () => {
    // `data` is the entire sheet state. Selecting it for twenty tokens would move megabytes; the comment
    // in that file is explicit about it, and this is the assertion behind the comment.
    expect(SUBJECTS).not.toMatch(/select\('id, name, token_url, art_url, system, data'\)/);
    expect(SUBJECTS).toMatch(/data->meta, data->combat/);
  });
});

describe('the badges are wired to the board', () => {
  const PAGE = read('app/dnd/campaigns/[id]/world/page.tsx');

  it('the world page renders them on the token', () => {
    // This repo's most common defect is finishing something nobody can see.
    expect(PAGE).toMatch(/<TokenConditions conditions=\{conditions\} exhaustion=\{exhaustion\} side=\{side\} \/>/);
  });

  it('and folds the words into the token’s accessible name', () => {
    // Asserts the BEHAVIOUR — status reaches the accessible name — not the exact shape of the
    // expression. The first cut pinned the literal `aria-label={isSelected ? ...}` and broke the moment
    // M5-5 added "current turn" to the same string, which was a true change failing a test about
    // something else.
    expect(PAGE).toMatch(/conditionSuffix\(conditions, exhaustion\)/);
    // Line-scoped rather than a character class: the expression contains `${label}`, so `[^}]*` stops at
    // the first closing brace and never reaches `${status}`. Asserting on the line that carries the
    // token's aria-label is both simpler and harder to get subtly wrong.
    const ariaLines = PAGE.split('\n').filter((l) => l.includes('aria-label={'));
    expect(ariaLines.some((l) => l.includes('${status}')), 'no token aria-label carries the status').toBe(true);
  });
});

describe('the badge component itself', () => {
  const SRC = read('app/dnd/_ui/maps/TokenConditions.tsx');

  it('caps the WHOLE column and states the overflow rather than truncating silently', () => {
    // Measured in the browser: three conditions plus exhaustion plus an overflow pip made a stack
    // 2.19× the height of the token it annotated — the status ring became the piece. The cap is on the
    // column, overflow marker included, so it stays about as tall as the token.
    expect(SRC).toMatch(/MAX_BADGES = 3/);
    expect(SRC).toMatch(/all\.length > MAX_BADGES/);
    expect(SRC).toMatch(/MAX_BADGES - 1/);
    expect(SRC).toMatch(/\+\{dropped\.length\}/);
  });

  it('names the dropped ones in the overflow tooltip', () => {
    // Capped is not the same as lost. Every dropped condition is still in the tooltip AND in the token's
    // accessible name.
    expect(SRC).toMatch(/title=\{dropped\.map\(\(p\) => p\.title\)\.join\(', '\)\}/);
  });

  it('sizes from the token’s footprint, not a pixel count', () => {
    // Inside the transformed layer one CSS pixel is one world unit, so a fixed size is a different
    // fraction of a Tiny and a Gargantuan token — the same bug the token ring already had once.
    expect(SRC).toMatch(/side \* 0\.3/);
    expect(SRC).not.toMatch(/width: \d+px/);
  });

  it('hides the pips from assistive tech, having put the words elsewhere', () => {
    expect(SRC).toMatch(/aria-hidden="true"/);
  });

  it('never swallows a condition it has no glyph for', () => {
    // An unknown condition — a homebrew one, or a system this table has not taught the map — must still
    // show a mark. Dropping it would be the map quietly disagreeing with the sheet.
    expect(SRC).toMatch(/\?\? '●'/);
  });
});
