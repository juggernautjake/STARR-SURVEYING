// app/dnd/characters/[id]/builder — the dedicated GUIDED, step-by-step character builder (B1).
//
// "Build step by step" (the stepbystep mode) lands here rather than on the sheet: a purpose-built page
// that walks the character through Foundations → Levels → Review in that system's own vanilla rules, like
// the D&D Beyond builder. This page is the per-system PLAN — it assembles the ordered steps (their bodies
// built from the existing, tested per-system builders + the 5e level walker) and hands them to the
// system-agnostic `GuidedBuilder` shell. Later slices replace the one-shot Foundations bodies with true
// per-level choice flows + a live preview (see the guided-builder planning doc). Owner/DM only.
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getDndUser } from '@/lib/dnd/auth';
import { getCharacterAccess } from '@/lib/dnd/characters';
import { normalizeSystem } from '@/lib/dnd/systems';
import { glossaryFor } from '@/lib/dnd/glossary';
import { dndAiConfigured } from '@/lib/dnd/ai';
import { readActiveSlotMeta } from '@/lib/dnd/system-variants';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';
import styles from '@/app/dnd/_ui/hextech.module.css';
import GuidedBuilder, { type GuidedStep } from '@/app/dnd/_ui/builder/GuidedBuilder';
import Dnd5eManualBuilder from '@/app/dnd/_ui/Dnd5eManualBuilder';
import PF2CharacterBuilder from '@/app/dnd/_ui/PF2CharacterBuilder';
import IGCharacterBuilder from '@/app/dnd/_ui/IGCharacterBuilder';
import IGVanillaLibrary from '@/app/dnd/_ui/IGVanillaLibrary';
import LevelBuilder from '@/app/dnd/_ui/LevelBuilder';

export const dynamic = 'force-dynamic';

const SYSTEM_LABEL: Record<string, string> = {
  'dnd5e-2014': 'D&D 5e (2014)',
  'dnd5e-2024': 'D&D 5e (2024)',
  'pathfinder2e': 'Pathfinder 2e',
  'intuitive-games': 'Intuitive Games',
};

export default async function CharacterBuilderPage({ params }: { params: { id: string } }) {
  const user = await getDndUser();
  if (!user) redirect('/dnd');

  const res = await getCharacterAccess(params.id);
  if (!res.access) redirect('/dnd');
  const { character, canWrite } = res.access;
  // Building changes the sheet, so this page is for people who can write to it.
  if (!canWrite) redirect(`/dnd/characters/${params.id}`);

  const system = normalizeSystem((character as { system?: string }).system);
  const data = ((character.data as unknown as Character | null) ?? blankCharacter(character.name)) as Character;
  const variantKind = readActiveSlotMeta((character as { system_variants?: unknown }).system_variants).kind ?? 'vanilla';
  const aiConfigured = dndAiConfigured();

  // Assemble the system's steps. B1 reuses the existing per-system builders for Foundations and the 5e
  // level walker for Levels; each later slice deepens a step into a true per-choice flow.
  const steps: GuidedStep[] = [];
  const foundations = (title: string, help: string, node: ReactNode) =>
    steps.push({ id: `foundations`, title, phase: 'Foundations', help, node });

  if (system === 'dnd5e-2014' || system === 'dnd5e-2024') {
    foundations(
      'Class, race, background & abilities',
      'Pick your class, subclass, species/race and background, then set your ability scores (standard array, point buy, or roll). Everything offered is vanilla and rules-legal for the level you choose.',
      <Dnd5eManualBuilder system={system} characterId={character.id} />,
    );
    steps.push({
      id: 'levels', title: 'Level by level', phase: 'Levels',
      help: 'Walk each level in order — the sheet unlocks the choices that level grants (subclass, ASI or feat, expertise, spells) and will not advance until you make them.',
      node: (
        <LevelBuilder
          characterId={character.id}
          characterName={character.name}
          system={system}
          currentLevel={data.meta?.level ?? 1}
          className={data.meta?.className ?? ''}
          subclassName={data.meta?.subclass ?? ''}
          aiConfigured={aiConfigured}
        />
      ),
    });
  } else if (system === 'pathfinder2e') {
    foundations(
      'Ancestry, class, background, attributes & picks',
      'Pick your ancestry/heritage, class and subclass, background and deity, allocate your attribute boosts, and choose your trained skills, feats and spells. Ineligible picks are shown greyed with the reason.',
      <PF2CharacterBuilder characterId={character.id} initialName={character.name} aiConfigured={aiConfigured} startOpen />,
    );
  } else if (system === 'intuitive-games') {
    foundations(
      'Ancestry, class, background, abilities & picks',
      'Pick your ancestry, class and subclass, specialization and background, allocate your ability boosts, and choose stances, powers, feats and your defensive power. Provenance (vanilla vs custom) is tracked as you go.',
      <div style={{ display: 'grid', gap: 16 }}>
        <IGCharacterBuilder characterId={character.id} initialName={character.name} aiConfigured={aiConfigured} variantKind={variantKind} startOpen />
        <IGVanillaLibrary />
      </div>,
    );
  } else {
    // Unknown/other system — no dedicated builder; send them to the sheet.
    redirect(`/dnd/characters/${params.id}`);
  }

  // A final Review step (its deeper "confirm every choice is rules-legal" summary is a later slice).
  steps.push({
    id: 'review', title: 'Review & finish', phase: 'Review',
    help: 'Review the character you built, then open the sheet. You can always come back and keep building.',
    node: (
      <div style={{ display: 'grid', gap: 10, fontSize: 14, color: 'var(--hx-text)' }}>
        <p style={{ margin: 0, color: 'var(--hx-muted)' }}>Your picks are saved as you make them. Open the sheet to see the finished character on any template and style.</p>
        <Link className={styles.hexBtn} href={`/dnd/characters/${character.id}`} style={{ justifySelf: 'start' }}>Open the character sheet →</Link>
      </div>
    ),
  });

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div>
            <Link className={styles.hexBtn} href={`/dnd/characters/${params.id}`} style={{ marginBottom: 10 }}>← Back to sheet</Link>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>
              Build {character.name}
            </h1>
            <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0', maxWidth: 760 }}>
              Building in <strong style={{ color: 'var(--hx-gold-2)' }}>{SYSTEM_LABEL[system] ?? system}</strong> — step by step, in the system's own vanilla rules. Every option explains itself; ineligible picks are greyed with the reason.
            </p>
          </div>
          <GuidedBuilder
            characterId={character.id}
            characterName={character.name}
            systemLabel={SYSTEM_LABEL[system] ?? system}
            steps={steps}
            glossary={glossaryFor(system)}
          />
        </div>
      </div>
    </div>
  );
}
