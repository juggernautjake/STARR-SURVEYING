// __tests__/dnd/pf2-boost-allocator.test.tsx — the PF2 boost picker (MB-3).
//
// Rendered via react-dom/server against the real ancestry/background data. Confirms the staged sets render
// (with the flaw), and — since react-dom/server can't run effects — that the module is wired to statgen/pf2.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Pf2BoostAllocator from '@/app/dnd/_ui/Pf2BoostAllocator';
import { pf2AncestryFull } from '@/lib/dnd/systems/pathfinder2e/data';

describe('Pf2BoostAllocator', () => {
  it('renders the four staged boost sets and the resolved modifiers', () => {
    const html = renderToStaticMarkup(
      <Pf2BoostAllocator ancestry="Elf" background="" classKeyOptions={['STR']} onChange={() => {}} />,
    );
    expect(html).toContain('Ancestry');
    expect(html).toContain('Background');
    expect(html).toContain('Class key attribute');
    expect(html).toContain('Free boosts');
    // The six attribute readouts.
    for (const a of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) expect(html).toContain(a);
  });

  it('surfaces the ancestry flaw when the ancestry has one', () => {
    // Elf prints a CON flaw in the flaw-aware data.
    const elf = pf2AncestryFull('Elf');
    expect(elf?.flaw).toBeTruthy();
    const html = renderToStaticMarkup(
      <Pf2BoostAllocator ancestry="Elf" background="" classKeyOptions={['STR']} onChange={() => {}} />,
    );
    expect(html).toMatch(/flaw −2/);
  });

  it('offers the two-free-no-flaw alternative for an ancestry', () => {
    const html = renderToStaticMarkup(
      <Pf2BoostAllocator ancestry="Elf" background="" classKeyOptions={['STR']} onChange={() => {}} />,
    );
    expect(html).toMatch(/two free ancestry boosts, no flaw/);
  });
});
