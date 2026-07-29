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
import BuildPreviewPanel from '@/app/dnd/_ui/builder/BuildPreviewPanel';
import { buildPreview } from '@/lib/dnd/builder/preview';
import Dnd5eManualBuilder from '@/app/dnd/_ui/Dnd5eManualBuilder';
import PF2CharacterBuilder from '@/app/dnd/_ui/PF2CharacterBuilder';
import IGCharacterBuilder from '@/app/dnd/_ui/IGCharacterBuilder';
import IGVanillaLibrary from '@/app/dnd/_ui/IGVanillaLibrary';
import LevelBuilder from '@/app/dnd/_ui/LevelBuilder';
import PF2LevelBuilder from '@/app/dnd/_ui/PF2LevelBuilder';
import IGLevelBuilder from '@/app/dnd/_ui/IGLevelBuilder';

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
  const { character, canWrite, isDM } = res.access;
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
      <Dnd5eManualBuilder system={system} characterId={character.id} layout="steps" aiConfigured={aiConfigured} variantKind={variantKind} isDM={isDM} />,
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
          abilities={data.abilities}
          // Same test the sheet (`App.tsx`) and the AI edit route already use, so the picker cannot
          // disagree with them about whether this character casts.
          hasSpellcasting={!!data.spellcasting?.ability || (data.spells?.length ?? 0) > 0}
          aiConfigured={aiConfigured}
        />
      ),
    });
  } else if (system === 'pathfinder2e') {
    foundations(
      'Ancestry, class, background, attributes & picks',
      'Pick your ancestry/heritage, class and subclass, background and deity, allocate your attribute boosts, and choose your trained skills, feats and spells. Ineligible picks are shown greyed with the reason.',
      <PF2CharacterBuilder characterId={character.id} initialName={character.name} aiConfigured={aiConfigured} startOpen layout="steps" variantKind={variantKind} isDM={isDM} />,
    );
    // PF2 has twenty levels and a working level walker of its own (`PF2LevelBuilder` → /pf2-levels), but
    // the guided builder only ever gave it Foundations → Review: a Pathfinder player walking this flow
    // never reached the walker at all, while a 5e player did. Both components were already built, tested
    // and mounted on the standalone /levels page — they were simply never wired into this flow.
    steps.push({
      id: 'levels', title: 'Level by level', phase: 'Levels',
      help: 'Walk each level in order — ability boosts, feats and class features unlock as you go, from the Remaster progression.',
      node: (
        <PF2LevelBuilder
          characterId={character.id}
          characterName={character.name}
          className={data.meta?.className ?? ''}
          currentLevel={data.meta?.level ?? 1}
        />
      ),
    });
  } else if (system === 'intuitive-games') {
    foundations(
      'Ancestry, class, background, abilities & picks',
      'Pick your ancestry, class and subclass, specialization and background, allocate your ability boosts, and choose stances, powers, feats and your defensive power. Provenance (vanilla vs custom) is tracked as you go.',
      <div style={{ display: 'grid', gap: 16 }}>
        <IGCharacterBuilder characterId={character.id} initialName={character.name} aiConfigured={aiConfigured} variantKind={variantKind} isDM={isDM} startOpen layout="steps" />
        <IGVanillaLibrary />
      </div>,
    );
    // Same for Intuitive Games (`IGLevelBuilder` → /ig-levels, the scraped schedule).
    steps.push({
      id: 'levels', title: 'Level by level', phase: 'Levels',
      help: 'Walk each level in order — the scraped IG schedule unlocks the traits, feats, powers and boosts each level grants.',
      node: (
        <IGLevelBuilder
          characterId={character.id}
          characterName={character.name}
          subclass={data.meta?.subclass || data.meta?.className || ''}
          currentLevel={data.meta?.level ?? 1}
        />
      ),
    });
  } else {
    // Unknown/other system — no dedicated builder; send them to the sheet.
    redirect(`/dnd/characters/${params.id}`);
  }

  // Build summary for the Review step (B5/B18). Read from the character's current data — the builders reload
  // the page after Build, so this reflects the finished character. Kept loose (optional access) so a
  // half-built or unbuilt character just shows fewer facts.
  const idFacts: [string, string][] = [['Name', character.name]];
  if (system === 'pathfinder2e' || system === 'intuitive-games') {
    const key = system === 'pathfinder2e' ? 'pf2e' : 'ig';
    const idn = (character.data as Record<string, { identity?: Record<string, unknown> }> | null)?.[key]?.identity;
    if (idn) {
      if (idn.ancestry) idFacts.push(['Ancestry', String(idn.ancestry)]);
      if (idn.className) idFacts.push(['Class', String(idn.className) + (idn.subclass ? ` (${idn.subclass})` : '')]);
      if (idn.specialization) idFacts.push(['Specialization', String(idn.specialization)]);
      if (idn.background) idFacts.push(['Background', String(idn.background)]);
      if (idn.level) idFacts.push(['Level', String(idn.level)]);
    }
  } else {
    const meta = data.meta;
    if (meta) {
      if (meta.species) idFacts.push([system === 'dnd5e-2024' ? 'Species' : 'Race', String(meta.species)]);
      if (meta.className) idFacts.push(['Class', String(meta.className) + (meta.subclass ? ` (${meta.subclass})` : '')]);
      if (meta.background) idFacts.push(['Background', String(meta.background)]);
      if (meta.level) idFacts.push(['Level', String(meta.level)]);
    }
  }

  // The BUILT numbers, not just the picks. "Review the character you built" showed only identity facts —
  // species, class, background, level — which are the things you literally just typed in. It could not have
  // told you the build had gone wrong, and for a while it hadn't been telling anyone: a level-8 Fighter
  // rendered with 1 hit point and no class features for as long as that bug existed (slices 10–11), and
  // this screen said "Fighter · Level 8" and looked entirely happy about it.
  //
  // These are read from the SAME stored data the sheet renders, so if the review looks right the sheet is
  // right. Each is optional: a half-built character simply shows fewer rows rather than zeroes.
  const buildFacts: [string, string][] = [];
  if (system === 'pathfinder2e' || system === 'intuitive-games') {
    const pf2 = (character.data as { pf2e?: { combat?: Record<string, unknown>; skills?: unknown[]; feats?: unknown[] } } | null)?.pf2e;
    if (pf2?.combat) {
      if (typeof pf2.combat.currentHp === 'number') buildFacts.push(['Hit points', String(pf2.combat.currentHp)]);
      if (typeof pf2.combat.heroPoints === 'number') buildFacts.push(['Hero points', String(pf2.combat.heroPoints)]);
      if (Array.isArray(pf2.feats) && pf2.feats.length) buildFacts.push(['Feats', String(pf2.feats.length)]);
    }
    const ig = (character.data as { ig?: { combat?: { hitPoints?: Record<string, unknown> }; feats?: unknown[]; powers?: unknown[] } } | null)?.ig;
    if (ig?.combat?.hitPoints && typeof ig.combat.hitPoints.max === 'number') buildFacts.push(['Hit points', String(ig.combat.hitPoints.max)]);
    if (Array.isArray(ig?.powers) && ig!.powers.length) buildFacts.push(['Powers', String(ig!.powers.length)]);
  } else if (data.combat) {
    const cb = data.combat;
    if (cb.maxHp) buildFacts.push(['Hit points', String(cb.maxHp)]);
    if (cb.hitDiceTotal) buildFacts.push(['Hit dice', `${cb.hitDiceTotal}d${cb.hitDiceSize}`]);
    if (cb.ac) buildFacts.push(['Armour class', String(cb.ac)]);
    const profSaves = Object.entries(data.saves ?? {}).filter(([, v]) => (v as { proficient?: boolean })?.proficient).map(([k]) => k.toUpperCase());
    if (profSaves.length) buildFacts.push(['Save proficiencies', profSaves.join(', ')]);
    const classFeatures = (data.features ?? []).filter((f) => f.id?.startsWith('cls-'));
    if (classFeatures.length) buildFacts.push(['Class features', String(classFeatures.length)]);
  }

  steps.push({
    id: 'review', title: 'Review & finish', phase: 'Review',
    help: 'Review the character you built, then open the sheet. You can always come back and keep building.',
    node: (
      <div style={{ display: 'grid', gap: 12, fontSize: 14, color: 'var(--hx-text)' }}>
        {idFacts.length > 1 ? (
          <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 14px', margin: 0 }}>
            {idFacts.map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--hx-muted)', alignSelf: 'baseline' }}>{k}</dt>
                <dd style={{ margin: 0, fontWeight: 600, color: 'var(--hx-text)' }}>{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p style={{ margin: 0, color: 'var(--hx-muted)' }}>Make your picks in the earlier steps and press Build — then this shows a summary of the finished character.</p>
        )}
        {buildFacts.length > 0 && (
          <>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--hx-teal-1)', marginTop: 2 }}>
              What the build produced
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 14px', margin: 0 }}>
              {buildFacts.map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--hx-muted)', alignSelf: 'baseline' }}>{k}</dt>
                  <dd style={{ margin: 0, fontWeight: 600, color: 'var(--hx-text)' }}>{v}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        <p style={{ margin: 0, color: 'var(--hx-muted)', fontSize: 12.5 }}>Everything picked from the library is vanilla and rules-legal; custom picks are flagged. Open the sheet to see the finished character on any template and style.</p>
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
              Building in <strong style={{ color: 'var(--hx-gold-2)' }}>{SYSTEM_LABEL[system] ?? system}</strong> — step by step, in the system&rsquo;s own vanilla rules. Every option explains itself; ineligible picks are greyed with the reason.
            </p>
          </div>
          <GuidedBuilder
            characterId={character.id}
            characterName={character.name}
            systemLabel={SYSTEM_LABEL[system] ?? system}
            steps={steps}
            glossary={glossaryFor(system)}
            // The live preview the guided builder was designed with (P5-7). Rendered HERE, on the server,
            // from the character's stored data — so it shows what actually saved, and it re-renders when a
            // step's `router.refresh()` lands. The shell only places it.
            preview={<BuildPreviewPanel preview={buildPreview(system, character.name, character.data)} />}
          />
        </div>
      </div>
    </div>
  );
}
