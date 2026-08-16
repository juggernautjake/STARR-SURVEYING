// __tests__/inline-style-hex-ratchet.test.ts — hold the line on hard-coded colours (P10-2, audit G-2).
//
// A colour written as `#1b0f30` inside a `style={{}}` object cannot be reached by a design token, a media
// query, the print stylesheet, or a contrast audit. That is not a style preference — it is why every
// theming pass has been expensive, and P10-3 is where it finally became concrete: the print stylesheet
// fixes ink by overriding CSS VARIABLES, and an inline hex is invisible to it. Those colours print as
// whatever they were on screen.
//
// THIS IS A RATCHET, NOT A RULE. There are ~3,450 of them across ~311 files. A guard that failed on all
// of them would be switched off within a day and a rewrite of that surface is not a slice. So: a file not
// in the baseline must have ZERO, and a file in it may not get worse. New code cannot add to the pile; old
// code can only be paid down.
//
// 2026-08-16 — COVERAGE WIDENED, and the reason is worth keeping. The counter matched only a literal
// `style={{`, so the identical defect written as a style OBJECT was invisible to it:
//
//     const s: Record<string, React.CSSProperties> = { card: { background: '#FFFFFF' } };
//     <section style={s.card}>
//
// `JobNotesPanel.tsx` shipped that way — a brand-new file with 30 hard-coded colours passing the "a new
// file must have ZERO" rule, rendering a white card with near-black text on all four dark skins. When the
// blind spot was measured it held 1,855 hexes across 103 files: the hole was BIGGER than the guard.
// The counter now reads both spellings, which is why the baseline jumped 1,624 → 3,449 in one commit
// with no code getting worse. A guard that matches the SPELLING of a defect rather than the thing that
// makes it a defect will be routed around, usually by accident.
import { describe, it, expect } from 'vitest';
import {
  scanRepo, readBaseline, regressions, improvements, countHexInInlineStyles, countHexInStyleObjects,
  countHexInFile, BASELINE_PATH,
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

describe('the blind spot that let JobNotesPanel through', () => {
  it('counts hexes in a CSSProperties style object, which has no `style={{` at all', () => {
    const src = `
      const s: Record<string, React.CSSProperties> = {
        card: { background: '#FFFFFF', border: '1px solid #E5E7EB' },
        btn: { background: '#1D3095' },
      };
      export default () => <section style={s.card}><button style={s.btn} /></section>;
    `;
    // The old counter saw nothing here — that is the entire bug.
    expect(countHexInInlineStyles(src)).toBe(0);
    expect(countHexInStyleObjects(src)).toBe(3);
    expect(countHexInFile(src)).toBe(3);
  });

  it('matches the single-const form as well as the Record form', () => {
    expect(countHexInStyleObjects(`const a: React.CSSProperties = { color: '#abc' };`)).toBe(1);
    expect(countHexInStyleObjects(`const a: CSSProperties = { color: '#aabbcc' };`)).toBe(1);
  });

  it('brace-matches to the END of the object rather than the first nested }', () => {
    const src = `const s: Record<string, React.CSSProperties> = { a: { b: '#111111' }, c: { d: '#222222' } };`;
    expect(countHexInStyleObjects(src)).toBe(2);
  });

  it('does not run past the declaration into an unrelated `= {` on a later line', () => {
    // `[^=\\n]*` is line-bounded for this reason: without it, a `CSSProperties` mention followed by any
    // later assignment would swallow the rest of the file and count colours that are not style at all.
    const src = [
      `type X = React.CSSProperties;`,
      `const palette = { brand: '#123456' };`,
    ].join('\n');
    expect(countHexInStyleObjects(src)).toBe(0);
  });

  it('and the two counters do not double-count the same hex', () => {
    const src = `
      const s: Record<string, React.CSSProperties> = { card: { color: '#111111' } };
      export default () => <div style={{ ...s.card, background: '#222222' }} />;
    `;
    expect(countHexInStyleObjects(src)).toBe(1);
    expect(countHexInInlineStyles(src)).toBe(1);
    expect(countHexInFile(src)).toBe(2);
  });

  it('the panel that caused this widening now reads ZERO', () => {
    // Belt and braces: it is in neither the baseline nor the current scan, and a regression would be
    // caught by THE RATCHET below anyway. This names the file so the reason survives.
    const file = 'app/admin/components/jobs/JobNotesPanel.tsx';
    expect(current[file] ?? 0, `${file} put hard-coded colours back`).toBe(0);
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
