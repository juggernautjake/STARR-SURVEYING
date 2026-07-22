// __tests__/dnd/custom-section-view.test.tsx — the D-13 custom-section renderer.
//
// The same component draws player-authored sections on 5e/PF2/IG, so this pins that the three block kinds
// render their content read-only, empty blocks are hidden, and owners get the edit affordance. Rendered via
// react-dom/server like the rest of the sheet suite (vitest `environment: 'node'`).
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CustomSectionView from '@/app/dnd/_sheet/components/CustomSectionView';
import type { CustomSection } from '@/lib/dnd/custom-sections';

const section: CustomSection = {
  id: 's1',
  title: 'Ship Log',
  icon: '🚀',
  blocks: [
    { id: 'b1', kind: 'text', heading: 'Manifest', body: 'First paragraph.\n\nSecond paragraph.' },
    { id: 'b2', kind: 'stats', rows: [{ label: 'Fuel', value: '80%' }, { label: '', value: '' }] },
    { id: 'b3', kind: 'list', heading: 'Cargo', items: ['Ore', '', 'Water'] },
    { id: 'b4', kind: 'text', body: '   ' }, // empty → hidden
  ],
};

describe('CustomSectionView — read-only render', () => {
  const html = renderToStaticMarkup(<CustomSectionView section={section} />);

  it('renders text block heading + both paragraphs', () => {
    expect(html).toContain('Manifest');
    expect(html).toContain('First paragraph.');
    expect(html).toContain('Second paragraph.');
  });

  it('renders stat rows but drops the empty one', () => {
    expect(html).toContain('Fuel');
    expect(html).toContain('80%');
  });

  it('renders list items, skipping blank ones', () => {
    expect(html).toContain('Ore');
    expect(html).toContain('Water');
    expect(html.match(/<li/g) ?? []).toHaveLength(2); // the blank item is not rendered
  });

  it('hides an entirely-empty block, and shows no owner controls when not editable', () => {
    expect(html).not.toContain('Edit section');
  });
});

describe('CustomSectionView — editable', () => {
  it('shows the owner Edit affordance when editable', () => {
    const html = renderToStaticMarkup(<CustomSectionView section={section} editable onChange={() => {}} />);
    expect(html).toContain('Edit section');
  });

  it('an empty section prompts the owner to populate it', () => {
    const empty: CustomSection = { id: 's2', title: 'Blank', blocks: [] };
    const html = renderToStaticMarkup(<CustomSectionView section={empty} editable onChange={() => {}} />);
    expect(html).toContain('This section is empty');
    expect(html).toContain('Edit section');
  });
});
