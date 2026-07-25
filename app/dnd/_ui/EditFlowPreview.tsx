'use client';
// EditFlowPreview — a DEV-ONLY visual harness for the unified edit/build UI (VariantBrowser, DraftSaveBanner,
// EditFlow). Renders the components with mock data so they can be screenshotted (Playwright) without auth or a
// real character. Not shipped to production (the route that renders it is gated to non-prod).
import { useState } from 'react';
import VariantBrowser from './VariantBrowser';
import DraftSaveBanner from './DraftSaveBanner';
import EditFlow, { TransposeReport, type EditFlowSystem } from './EditFlow';
import type { VariantCard } from '@/lib/dnd/variant-view';

export default function EditFlowPreview({ cards, systems }: { cards: VariantCard[]; systems: EditFlowSystem[] }) {
  const [showEdit, setShowEdit] = useState(false);
  const heading = (t: string) => <h2 style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '22px 0 6px' }}>{t}</h2>;
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 16px 80px' }}>
      <h1 style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-3)', fontSize: 20 }}>Edit / Build flow — visual harness</h1>
      <p style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>Mock data. Dev-only.</p>

      {heading('Versions picker (VariantBrowser, expanded)')}
      <VariantBrowser characterId="preview" cards={cards} aiConfigured canWrite transposeSystems={systems} startOpen />

      {heading('Draft save banner (while editing a working copy)')}
      <DraftSaveBanner characterId="preview" sourceName="Gandalf the Grey" />

      {heading('Edit flow dialog')}
      <button type="button" onClick={() => setShowEdit(true)} data-testid="open-editflow" style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--hx-gold-2, #c8aa6e)', background: 'rgba(200,170,110,0.12)', color: 'var(--hx-gold-2, #c8aa6e)', fontFamily: 'var(--hx-font-display)' }}>Open Edit dialog</button>
      {showEdit && (
        <EditFlow characterId="preview" slotId="dnd5e-2024" name="Gandalf the Grey" system="dnd5e-2024" systems={systems.filter((s) => s.id !== 'dnd5e-2024')} aiConfigured onClose={() => setShowEdit(false)} />
      )}

      {/* The post-transpose report, which the dialog only reaches after a real AI build — rendered here with
          a mock result so the homebrew/violations styling can be seen without one. */}
      {heading('Transpose report (what the AI built)')}
      <TransposeReport
        onOpen={() => {}}
        result={{
          system: 'pathfinder2e',
          summary: 'Rebuilt as a Pathfinder 2e Wizard (Evocation) at level 5. Mapped the 5e spell list onto PF2 arcane spells of equivalent rank; kept the staff as a bonded item.',
          hp: 42,
          custom: [
            { type: 'feat', name: 'Grey Wanderer', note: 'no vanilla PF2 equivalent for the 5e Ritual Caster build' },
            { type: 'spell', name: 'Kindled Word', note: 'balanced against rank-3 arcane damage spells' },
          ],
          violations: [{ field: 'abilities.int', severity: 'warning', message: 'Intelligence 20 is at the level-5 cap — verify the ancestry boost.' }],
        }}
      />
    </div>
  );
}
