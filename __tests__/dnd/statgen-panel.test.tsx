// __tests__/dnd/statgen-panel.test.tsx — the 5e ability-generation widget (MB-1).
//
// Rendered via react-dom/server like the rest of the sheet suite. Pins that the panel surfaces the four
// methods, one input per ability with a live modifier, and the racial/background increase breakdown.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StatGenPanel from '@/app/dnd/_ui/StatGenPanel';

const scores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };

describe('StatGenPanel', () => {
  it('offers all four generation methods', () => {
    const html = renderToStaticMarkup(
      <StatGenPanel value={scores} onChange={() => {}} method="manual" onMethodChange={() => {}} />,
    );
    for (const label of ['Standard array', 'Point buy', 'Roll', 'Manual']) expect(html).toContain(label);
  });

  it('shows one input per ability with the live modifier of the final score', () => {
    const html = renderToStaticMarkup(
      <StatGenPanel value={scores} onChange={() => {}} method="manual" onMethodChange={() => {}} />,
    );
    for (const label of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) expect(html).toContain(label);
    expect(html).toContain('+2'); // STR 15 → +2
    expect(html).toContain('-1'); // CHA 8 → -1
  });

  it('folds racial/background increases into the final + modifier, and labels the column', () => {
    const html = renderToStaticMarkup(
      <StatGenPanel value={scores} onChange={() => {}} method="manual" onMethodChange={() => {}}
        increases={{ str: 2 }} increaseLabel="Racial" />,
    );
    expect(html).toContain('Racial'); // the column header
    expect(html).toContain('17'); // STR 15 + 2 racial = 17 (final)
    expect(html).toContain('+3'); // mod of 17
  });

  it('shows the point-buy budget in point-buy mode', () => {
    const html = renderToStaticMarkup(
      <StatGenPanel value={{ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 }} onChange={() => {}}
        method="pointbuy" onMethodChange={() => {}} />,
    );
    expect(html).toMatch(/0 \/ 27 points left/); // 15/15/15/8/8/8 spends exactly 27
  });

  it('offers the inline 4d6 roll button in roll mode', () => {
    const html = renderToStaticMarkup(
      <StatGenPanel value={scores} onChange={() => {}} method="roll" onMethodChange={() => {}} />,
    );
    expect(html).toMatch(/Roll 4d6/);
  });
});
