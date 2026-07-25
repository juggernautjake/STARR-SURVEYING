// __tests__/dnd/new-variant-flow.test.tsx — variant CREATION as a deliberate act (owner 2026-07-25).
//
// "+ Variant" used to fork on the spot: one click produced an unnamed, byte-identical copy, and the only way
// to learn what it was for was to open it. Creation now asks what the version is FOR, requires a name, and
// writes nothing until the last step. Copies that haven't diverged say so on the card.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
import NewVariantFlow from '@/app/dnd/_ui/NewVariantFlow';
import { buildVariantCards } from '@/lib/dnd/variant-view';
import { forkSheet, type ActiveSheet } from '@/lib/dnd/system-variants';

const SYSTEMS = [{ id: 'pathfinder2e', label: 'Pathfinder 2e' }];
const meta5e = (over: Record<string, unknown> = {}) => ({ meta: { name: 'Lazzuh Gun', level: 3, className: 'Barbarian', ...over } });
const active5e = (over: Partial<ActiveSheet> = {}): ActiveSheet =>
  ({ system: 'dnd5e-2024', data: meta5e(), sheet_type: 'default', slotId: 'dnd5e-2024', kind: 'vanilla', ...over });

const flow = (over: Record<string, unknown> = {}) => renderToStaticMarkup(
  <NewVariantFlow
    characterId="c1" sourceSlotId="dnd5e-2024" sourceName="Lazzuh Gun" sourceSystem="dnd5e-2024"
    sourceLevel={3} systems={SYSTEMS} aiConfigured onClose={() => {}} {...over}
  />,
);

describe('NewVariantFlow — the purpose is chosen before anything is written', () => {
  it('offers all four purposes, described', () => {
    const html = flow();
    expect(html).toContain('A version to edit, in this system');
    expect(html).toContain('An exact copy');
    expect(html).toContain('A version in another system');
    expect(html).toContain('The same character at a different level');
  });

  it('says up front that nothing is saved yet', () => {
    expect(flow()).toContain('Nothing is saved until you confirm');
  });

  it('warns that an exact copy is tagged as a duplicate until it changes', () => {
    expect(flow()).toContain('tagged as a duplicate until you change something');
  });

  it('withholds transposing when no other system is available', () => {
    const html = flow({ systems: [] });
    expect(html).toContain('No other systems available');
  });

  it('withholds the level rebuild when AI is unavailable — it is an AI build', () => {
    const html = flow({ aiConfigured: false });
    expect(html).toContain('AI is not configured');
  });
});

describe('the Duplicate tag is derived, so it clears itself', () => {
  it('tags a fresh copy as a duplicate of its parent', () => {
    const active = active5e();
    const forked = forkSheet(active, {}, { fromSlotId: 'dnd5e-2024', name: 'Safety copy' });
    const cards = buildVariantCards(forked.active, forked.variants, { characterName: 'Lazzuh Gun' });
    const copy = cards.find((c) => c.slotId === forked.newSlotId)!;
    expect(copy.tags.map((t) => t.label)).toContain('Duplicate of Lazzuh Gun');
  });

  it('drops the tag as soon as the copy differs — no flag to clear', () => {
    const active = active5e();
    const forked = forkSheet(active, {}, { fromSlotId: 'dnd5e-2024', name: 'Diverged' });
    // Edit the copy: one changed field is enough to stop it matching its parent.
    (forked.variants[forked.newSlotId].data as { meta: { level: number } }).meta.level = 7;
    const cards = buildVariantCards(forked.active, forked.variants, { characterName: 'Lazzuh Gun' });
    const copy = cards.find((c) => c.slotId === forked.newSlotId)!;
    expect(copy.tags.map((t) => t.label).some((l) => l.startsWith('Duplicate'))).toBe(false);
  });

  it('never tags the original — it has no parent to duplicate', () => {
    const active = active5e();
    const forked = forkSheet(active, {}, { fromSlotId: 'dnd5e-2024' });
    const cards = buildVariantCards(forked.active, forked.variants, { characterName: 'Lazzuh Gun' });
    const origin = cards.find((c) => c.origin)!;
    expect(origin.tags.map((t) => t.label).some((l) => l.startsWith('Duplicate'))).toBe(false);
  });
});
