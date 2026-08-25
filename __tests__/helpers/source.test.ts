// __tests__/helpers/source.test.ts — the stripper has to be right, because everything else trusts it.
//
// A helper used by source-reading assertions is load-bearing in a quiet way: when it is wrong, the
// tests that depend on it do not error, they just stop asking the question. The case that matters
// most here is the negative one — `not.toMatch()` over stripped source passes when the stripper has
// eaten the evidence, and a test that cannot fail is indistinguishable from a test that is passing.

import { describe, it, expect } from 'vitest';
import { stripComments, code, cssCode, expectOrder } from './source';

describe('expectOrder', () => {
  it('passes when the first really does come first', () => {
    expect(() => expectOrder('a = 1;\nb = 2;', 'a =', 'b =')).not.toThrow();
  });

  it('fails when the order is wrong, and says where both are', () => {
    expect(() => expectOrder('b = 2;\na = 1;', 'a =', 'b ='))
      .toThrow(/expected "a =" \(at \d+\) to come before "b =" \(at \d+\)/);
  });

  it('REFUSES a missing anchor instead of passing on -1', () => {
    // The whole point. `expect(src.indexOf('X')).toBeGreaterThan(src.indexOf('Y'))` with Y absent
    // becomes toBeGreaterThan(-1) and passes for any X that exists — order never checked.
    expect(() => expectOrder('a = 1;', 'a =', 'nowhere')).toThrow(/anchor not found.*nowhere/);
    expect(() => expectOrder('a = 1;', 'nowhere', 'a =')).toThrow(/anchor not found.*nowhere/);
  });

  it('and names WHICH anchor went missing', () => {
    // Seven assertions in one plan failed because an anchor moved, each reporting "expected -1 to be
    // greater than 45". Naming the absent one turns a puzzle into a one-line fix.
    expect(() => expectOrder('a = 1;', 'a =', 'captures[viewId] ='))
      .toThrow(/captures\[viewId\] =/);
  });
});

describe('stripComments', () => {
  it('removes line and block comments', () => {
    expect(code('const a = 1; // two\nconst b = 2;')).toBe('const a = 1; \nconst b = 2;');
    expect(code('const a = /* hi */ 1;')).toBe('const a =  1;');
  });

  it('does NOT eat a URL inside a string — the bug in every hand-rolled version', () => {
    // `.replace(/\/\/[^\n]*/g, '')` turns this into `const u = 'https:` and takes the rest of the
    // line with it. Six files in this repo used that form.
    const src = "const u = 'https://example.com/x';";
    expect(code(src)).toBe(src);
    expect(code(src)).toContain('example.com');
  });

  it('and leaves a bare // inside a string alone too', () => {
    expect(code("const k = 'a//b';")).toBe("const k = 'a//b';");
    expect(code('const k = "a//b";')).toBe('const k = "a//b";');
    expect(code('const k = `a//b`;')).toBe('const k = `a//b`;');
  });

  it('survives an escaped quote rather than running to the end of the file', () => {
    const src = "const s = 'it\\'s fine'; // gone\nconst t = 1;";
    expect(code(src)).toBe("const s = 'it\\'s fine'; \nconst t = 1;");
  });

  it('keeps the line count, so a failure still points at the right place', () => {
    const src = 'a\n/* one\ntwo\nthree */\nb';
    expect(code(src).split('\n')).toHaveLength(src.split('\n').length);
    expect(code(src).split('\n')[4]).toBe('b');
  });

  it('leaves an unterminated block comment out rather than throwing', () => {
    expect(code('a\n/* never closed').trimEnd()).toBe('a');
  });

  it('treats // as content in CSS, where it is not a comment', () => {
    const css = '.a { background: url(https://x.com/i.png); } /* note */';
    expect(cssCode(css)).toBe('.a { background: url(https://x.com/i.png); } ');
  });

  it('and the whole point: prose about a rule is not the rule', () => {
    // The exact shape that broke six assertions in PAGE_CONSOLIDATION — a comment quoting the very
    // string the test asserts has been removed from the code.
    const src = [
      '// The literal "Deductible at 50%" is gone; the sentence reads the constant now.',
      'const s = `Deductible at ${pct}%`;',
    ].join('\n');
    expect(code(src)).not.toMatch(/Deductible at 50%/);
    expect(code(src)).toMatch(/Deductible at \$\{pct\}%/);
  });

  it('is exported under the name the tests already use', () => {
    expect(code('// x')).toBe(stripComments('// x'));
  });
});
