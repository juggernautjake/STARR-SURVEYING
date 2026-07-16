// app/dnd/characters/[id]/levels — the level builder.
//
// The sheet's level control is a "Manage Levels" link to here rather than a +/- stepper, because
// bumping the number skips the choices a level unlocks (subclass, ASI-or-feat, expertise…) and
// leaves the sheet quietly wrong. This page walks those choices in order, and can hand off to the
// AI to homebrew a feature when the character is going somewhere the rulebook doesn't cover.
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getDndUser, isDndOpenAccess } from '@/lib/dnd/auth';
import { getCharacterAccess } from '@/lib/dnd/characters';
import { normalizeSystem } from '@/lib/dnd/systems';
import { dndAiConfigured } from '@/lib/dnd/ai';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';
import styles from '@/app/dnd/_ui/hextech.module.css';
import LevelBuilder from '@/app/dnd/_ui/LevelBuilder';

export const dynamic = 'force-dynamic';

export default async function CharacterLevelsPage({ params }: { params: { id: string } }) {
  const user = await getDndUser();
  if (!user) redirect(isDndOpenAccess() ? '/dnd' : `/dnd/login?next=/dnd/characters/${params.id}/levels`);

  const res = await getCharacterAccess(params.id);
  if (!res.access) redirect('/dnd');
  const { character, canWrite } = res.access;
  // Levelling changes the sheet, so this page is for people who can write to it.
  if (!canWrite) redirect(`/dnd/characters/${params.id}`);

  const data = ((character.data as unknown as Character | null) ?? blankCharacter(character.name)) as Character;
  const system = normalizeSystem((character as { system?: string }).system);

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 940, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div>
            <Link className={styles.hexBtn} href={`/dnd/characters/${params.id}`} style={{ marginBottom: 10 }}>
              ← Back to sheet
            </Link>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>
              {character.name} — Levels
            </h1>
            <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0', maxWidth: 700 }}>
              Build this character level by level. Each level is only complete once you have made the choices it
              unlocks — the sheet will not move to the next level until then.
            </p>
          </div>

          <LevelBuilder
            characterId={character.id}
            characterName={character.name}
            system={system}
            currentLevel={data.meta?.level ?? 1}
            className={data.meta?.className ?? ''}
            subclassName={data.meta?.subclass ?? ''}
            aiConfigured={dndAiConfigured()}
          />
        </div>
      </div>
    </div>
  );
}
