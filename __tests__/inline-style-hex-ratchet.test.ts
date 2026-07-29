// __tests__/inline-style-hex-ratchet.test.ts — hold the line on hard-coded colours (P10-2, audit G-2).
//
// A colour written as `#1b0f30` inside a `style={{}}` object cannot be reached by a design token, a media
// query, the print stylesheet, or a contrast audit. That is not a style preference — it is why every
// theming pass has been expensive, and P10-3 is where it finally became concrete: the print stylesheet
// fixes ink by overriding CSS VARIABLES, and an inline hex is invisible to it. Those colours print as
// whatever they were on screen.
//
// THIS IS A RATCHET, NOT A RULE. There are 1,662 of them across 267 files. A guard that failed on all of
// them would be switched off within a day and a rewrite of that surface is not a slice. So: a file not in
// the baseline must have ZERO, and a file in it may not get worse. New code cannot add to the pile; old
// code can only be paid down.
import { describe, it, expect } from 'vitest';
import {
  scanRepo, readBaseline, regressions, improvements, countHexInInlineStyles, BASELINE_PATH,
} from '@/scripts/scan-inline-style-hex';

const current = scanRepo();
const baseline = readBaseline();

describe('the counter itself', () => {
  it('counts hexes inside a style object and ignores the ones outside it', () => {
    const src = `
      const a = '#ffffff';
      return <div style={{ color: '#ff0000', background: '#0f0' }} data-x="#123456" />;
    `;
    expect(countHexInInlineStyles(src)).toBe(2);
  });

  it('BRACE-MATCHES rather than stopping at the first inner }', () => {
    // A lazy /style=\{\{[^}]*\}\}/ stops at the nested object's closing brace and misses every hex after
    // it — reporting an improvement that never happened, which is the one way a ratchet lies.
    const src = `<div style={{ a: { b: '#111111' }, color: '#222222' }} />`;
    expect(countHexInInlineStyles(src)).toBe(2);
  });

  it('handles 3-, 6- and 8-digit forms, and no false positives on longer tokens', () => {
    expect(countHexInInlineStyles(`<div style={{ a: '#abc', b: '#aabbcc', c: '#aabbccdd' }} />`)).toBe(3);
    // An id-like `#abcdefghij` is not a colour; the \b keeps it out.
    expect(countHexInInlineStyles(`<div style={{ a: '#abcdefghij' }} />`)).toBe(0);
  });

  it('and finds nothing in a file with no inline styles', () => {
    expect(countHexInInlineStyles(`const c = '#ffffff'; export default c;`)).toBe(0);
  });
});

describe('THE RATCHET', () => {
  it('the baseline exists and is not empty (a missing one silently passes everything)', () => {
    expect(Object.keys(baseline).length, `${BASELINE_PATH} is missing or empty`).toBeGreaterThan(100);
  });

  it('NO FILE MAY GET WORSE, and a new file must have none at all', () => {
    const bad = regressions(current, baseline);
    const detail = bad.map((r) => `  ${r.file}: ${r.was} → ${r.now}`).join('\n');
    expect(
      bad,
      bad.length
        ? `Hard-coded colours inside style={{…}} went up. Use a CSS variable or a module class — an inline ` +
          `hex cannot be reached by a token, a media query, the print stylesheet or a contrast audit.\n${detail}\n` +
          `If this is deliberate, run: npx tsx scripts/scan-inline-style-hex.ts --write`
        : '',
    ).toEqual([]);
  });

  it('and the baseline stays honest — it never records MORE than the code has', () => {
    // A baseline entry above the real count is a budget nobody is using, and it quietly re-opens the door.
    // `--write` takes the minimum for exactly this reason; this asserts it was used that way.
    const inflated = improvements(current, baseline);
    const detail = inflated.map((r) => `  ${r.file}: baseline ${r.was}, actual ${r.now}`).join('\n');
    expect(
      inflated,
      inflated.length
        ? `The baseline is looser than the code. Lock the improvement in:\n${detail}\n` +
          `  npx tsx scripts/scan-inline-style-hex.ts --write`
        : '',
    ).toEqual([]);
  });
});

describe('what the ratchet is measuring', () => {
  it('reports a real, non-trivial number — so the scan is not silently matching nothing', () => {
    // A scanner that found zero would make every assertion above vacuously true. Same trap the campaign
    // export's seed scan guards against.
    const total = Object.values(current).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(500);
    expect(Object.keys(current).length).toBeGreaterThan(100);
  });

  it('and covers the DND surface, which is the one that gets re-themed', () => {
    // The sheet has four formats × four systems × every colour skin. It is where an unreachable colour
    // costs the most, so a scan that somehow skipped it would miss the point of the whole item.
    expect(Object.keys(current).some((f) => f.startsWith('app/dnd/'))).toBe(true);
  });
});
