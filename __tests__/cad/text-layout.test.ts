// CAD_AUDIT Slice S11 — the survey-info blocks lay out in paper space, not screen space.
//
// Both defects here were found by driving the app, not by reading it, and neither would have failed
// a test that existed at the time: one produced a plat with words split in half, the other produced
// a thumbnail sheet with full-size lettering piled on top of it.

import { describe, it, expect } from 'vitest';
import { wrapTextToWidth, sheetTextSize, TB_MIN_LEGIBLE_PX } from '@/lib/cad/render/text-layout';

describe('wrapTextToWidth', () => {
  it('breaks between words, never inside them', () => {
    // The bug verbatim: the notes block sliced every N characters, so a real plat rendered
    // "Texas State Plan / e Coordinate System".
    const note = 'Basis of bearing is the Texas State Plane Coordinate System, Central Zone (NAD 83)';
    const lines = wrapTextToWidth(note, 40);
    for (const line of lines) expect(line.trim()).toBe(line);
    // Every word survives intact and in order.
    expect(lines.join(' ').split(/\s+/)).toEqual(note.split(/\s+/));
  });

  it('never exceeds the character budget', () => {
    const lines = wrapTextToWidth('the quick brown fox jumps over the lazy dog', 12);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(12);
  });

  it('hard-breaks a single word longer than the line', () => {
    // A 60-character unbroken token is a URL or a stamped monument id. Letting it run past the
    // block's edge reads as a rendering fault rather than a long word.
    const lines = wrapTextToWidth('supercalifragilisticexpialidocious', 10);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(10);
    expect(lines.join('')).toBe('supercalifragilisticexpialidocious');
  });

  it('keeps the rest of the text after a hard break', () => {
    // The tail is where an off-by-one silently eats characters, and losing text off a plat note is
    // worse than wrapping it badly.
    const lines = wrapTextToWidth('aaaaaaaaaaaa then more words here', 5);
    expect(lines.join(' ').replace(/\s+/g, ' ')).toContain('then more words here');
  });

  it('collapses whitespace rather than emitting blank lines', () => {
    // Notes pasted from a PDF carry newlines and double spaces.
    const lines = wrapTextToWidth('one\n\ntwo    three', 40);
    expect(lines).toEqual(['one two three']);
  });

  it('returns nothing for empty or whitespace-only input', () => {
    expect(wrapTextToWidth('', 40)).toEqual([]);
    expect(wrapTextToWidth('   \n  ', 40)).toEqual([]);
  });

  it('survives a degenerate budget without looping forever', () => {
    const lines = wrapTextToWidth('abc def', 0);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(1);
  });
});

describe('sheetTextSize', () => {
  it('passes a legible size through unchanged', () => {
    expect(sheetTextSize(9)).toBe(9);
    expect(sheetTextSize(TB_MIN_LEGIBLE_PX)).toBe(TB_MIN_LEGIBLE_PX);
  });

  it('suppresses text below legibility instead of flooring it', () => {
    // This is the whole fix. The old code raised the size to a pixel floor, so as the sheet shrank
    // with zoom the boxes kept shrinking and the lettering did not — at 8% zoom "SURVEY FIRM",
    // "GRAPHIC SCALE" and the north arrow's "N" were drawn full-size over a thumbnail.
    expect(sheetTextSize(TB_MIN_LEGIBLE_PX - 0.01)).toBeNull();
    expect(sheetTextSize(0.2)).toBeNull();
  });

  it('suppresses rather than throwing on a degenerate size', () => {
    // Paper geometry goes through several divisions; NaN here must not reach PIXI.
    expect(sheetTextSize(NaN)).toBeNull();
    // Infinity is suppressed too. It cannot come from legitimate paper geometry, and a PIXI.Text
    // asked for an infinite font size takes the renderer down with it.
    expect(sheetTextSize(Infinity)).toBeNull();
    expect(sheetTextSize(-3)).toBeNull();
  });
});
