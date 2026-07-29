// app/dnd/preview/edit-flow/page.tsx — DEV-ONLY visual harness route for the unified edit/build UI.
// Gated to non-production so it's never exposed live. Builds mock version cards and renders the components.
import { notFound } from 'next/navigation';
import { devRouteVisible } from '@/lib/dnd/dev-routes';
import EditFlowPreview from '@/app/dnd/_ui/EditFlowPreview';
import { buildVariantCards } from '@/lib/dnd/variant-view';
import { availableSystems } from '@/lib/dnd/systems';
import type { ActiveSheet, SystemVariants } from '@/lib/dnd/system-variants';

export const dynamic = 'force-dynamic';

export default function EditFlowPreviewPage() {
  // Re-pointed at the shared rule (P1-4) — it was already gated, and correctly. Sharing it with
  // `hextech-demo` means the two dev harnesses cannot drift, and it adds the `NEXT_PUBLIC_E2E_HARNESS`
  // escape so a deployed preview can still be screenshotted.
  if (!devRouteVisible()) notFound();

  const active: ActiveSheet = {
    system: 'dnd5e-2024', sheet_type: 'default', slotId: 'dnd5e-2024', kind: 'vanilla', artUrl: null,
    data: { meta: { name: 'Gandalf the Grey', level: 5, className: 'Wizard', subclass: 'Evocation', species: 'Human' } },
    summary: 'A cautious Human evoker at level 5 — the canonical build this whole tree branches from.', summaryHash: 'x', summaryUpdatedAt: new Date(0).toISOString(),
  };
  const variants: SystemVariants = {
    'dnd5e-2024#2': {
      system: 'dnd5e-2024', sheet_type: 'default', kind: 'custom', parentSlotId: 'dnd5e-2024',
      data: { meta: { name: 'Gandalf the White', level: 12, classes: [{ classKey: 'wizard', level: 10 }, { classKey: 'cleric', level: 2 }] } },
      summary: 'The resurrected, multiclassed form — Wizard 10 / Cleric 2 with homebrew radiance. Much stronger than the original.',
    },
    'pathfinder2e': {
      system: 'pathfinder2e', sheet_type: 'default', kind: 'vanilla', parentSlotId: 'dnd5e-2024',
      data: { pf2e: { identity: { name: 'Gandalf', level: 5, className: 'Wizard', subclass: 'Evocation', ancestry: 'Human' } } },
    },
    'intuitive-games': {
      system: 'intuitive-games', sheet_type: 'default', kind: 'custom', parentSlotId: 'dnd5e-2024',
      data: { ig: { identity: { name: 'Grey Pilgrim', level: 4, className: 'Mystic', subclass: 'Flamecaller' } } },
    },
  };
  const cards = buildVariantCards(active, variants, {
    characterName: 'Gandalf the Grey', characterCampaignId: 'c1', campaignNames: { c1: 'Fellowship' },
  });
  const systems = availableSystems().map((s) => ({ id: s.key, label: s.name }));

  return <EditFlowPreview cards={cards} systems={systems} />;
}
