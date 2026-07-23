// __tests__/dnd/ig-boost-allocator.test.tsx — the IG boost picker (MB-4).
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import IgBoostAllocator from '@/app/dnd/_ui/IgBoostAllocator';

describe('IgBoostAllocator', () => {
  const html = renderToStaticMarkup(<IgBoostAllocator onChange={() => {}} />);

  it('states the IG method (start 10, eight boosts, cap 14) and the budget', () => {
    expect(html).toMatch(/Start 10/);
    expect(html).toMatch(/spend/);
    expect(html).toMatch(/8 left/); // nothing spent yet
    expect(html).toMatch(/cap 14/);
  });

  it('shows a stepper per ability starting at 10 with a +0 modifier', () => {
    for (const a of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) expect(html).toContain(a);
    expect(html).toContain('10'); // starting score
    expect(html).toContain('+0'); // starting modifier
  });

  it('flags the unspent budget until all eight boosts are placed', () => {
    // Fresh allocation is invalid (0 of 8 spent), so the error list renders.
    expect(html).toMatch(/Spend all 8/);
  });
});
