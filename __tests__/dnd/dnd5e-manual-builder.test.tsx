// __tests__/dnd/dnd5e-manual-builder.test.tsx — the 5e manual builder shell (MB-2a).
//
// Rendered via react-dom/server. Confirms the dropdowns populate from the REAL catalogs and the stat panel +
// build control are present, so the builder is wired end-to-end (not an empty shell).
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// The builder now uses useRouter (for the "Ask AI" refresh); stub it so a server-render test has no app-router.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
import Dnd5eManualBuilder from '@/app/dnd/_ui/Dnd5eManualBuilder';
import { classesForSystem } from '@/lib/dnd/classes/registry';
import { speciesCatalogFor } from '@/lib/dnd/species/view';

describe('Dnd5eManualBuilder', () => {
  it('renders the core dropdowns + the stat panel + a build button (2024)', () => {
    const html = renderToStaticMarkup(<Dnd5eManualBuilder system="dnd5e-2024" />);
    expect(html).toContain('Manual build');
    expect(html).toContain('Level');
    expect(html).toContain('Species');
    expect(html).toContain('Class');
    expect(html).toContain('Background');
    expect(html).toContain('Ability scores');
    expect(html).toContain('Standard array'); // the StatGenPanel is mounted
    expect(html).toContain('Build character');
  });

  it('populates the class + species dropdowns from the real catalog', () => {
    const html = renderToStaticMarkup(<Dnd5eManualBuilder system="dnd5e-2024" />);
    const someClass = classesForSystem('dnd5e-2024')[0].name;
    const someSpecies = speciesCatalogFor('dnd5e-2024')[0].name;
    expect(html).toContain(someClass);
    expect(html).toContain(someSpecies);
  });

  it('labels the ability column "Racial" for 2014 (species grant increases)', () => {
    const html = renderToStaticMarkup(<Dnd5eManualBuilder system="dnd5e-2014" />);
    expect(html).toContain('Racial');
    expect(html).toContain('2014'); // "D&amp;D 2014" once the & is HTML-escaped
  });
});
