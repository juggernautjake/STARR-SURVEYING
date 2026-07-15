// lib/dnd/systems/intuitive-games/builder.ts — deterministic "build as-is from the vanilla library" for the
// Intuitive Games system (IG builder Slice 7b). Given a set of picks (ancestry, class, subclass, stances,
// powers, feats, weapons), assemble a valid Character on the shared sheet engine AND record the picks as a
// kinded `igBuild` block so provenance flags each element with the correct kind (a stance as a stance, a
// power as a power) rather than mis-reading them as generic features. Everything here is drawn from the
// vanilla catalog, so a straight assemble is 100% VANILLA; a pick that isn't in the catalog is flagged CUSTOM
// by the provenance classifier — no special-casing needed. Pure — no services.
import type { Character } from '@/app/dnd/_sheet/types';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import { IG_STANCES, IG_POWERS, IG_FEATS } from './content';

/** The kinded record of what an Intuitive Games character was built from (stored on the character data). */
export interface IGBuild {
  ancestry?: string;
  className?: string;
  subclass?: string;
  stances?: string[];
  powers?: string[];
  feats?: string[];
  weapons?: string[];
}

export interface IGPicks extends IGBuild {
  name?: string;
  level?: number;
}

const effectOf = (list: { name: string; effect?: string }[], name: string): string => {
  const hit = list.find((e) => e.name.trim().toLowerCase() === String(name ?? '').trim().toLowerCase());
  return hit?.effect ?? '';
};

let _uid = 0;
const uid = (p: string) => `${p}-${(_uid++).toString(36)}`;

/**
 * Assemble an Intuitive Games character from vanilla picks. The returned Character carries the picks both as
 * displayable sheet content (features for stances/powers/feats, attacks for weapons) and as a kinded
 * `igBuild` block for accurate provenance. Custom (non-catalog) picks are still placed on the sheet — they'll
 * simply be flagged CUSTOM by the provenance classifier.
 */
export function assembleIGVanillaCharacter(picks: IGPicks): Character & { igBuild: IGBuild } {
  const char = blankCharacter(picks.name || 'New Character') as Character & { igBuild: IGBuild };
  char.meta.species = picks.ancestry || '';
  char.meta.className = picks.className || '';
  char.meta.subclass = picks.subclass || '';
  char.meta.level = picks.level ?? 1;

  const features: Character['features'] = [];
  for (const s of picks.stances ?? []) features.push({ id: uid('stance'), name: s, source: 'Stance', body: [effectOf(IG_STANCES, s) || 'Stance.'], tone: 'teal' });
  for (const pw of picks.powers ?? []) features.push({ id: uid('power'), name: pw, source: 'Power', body: [effectOf(IG_POWERS, pw) || 'Power.'], tone: 'pink' });
  for (const f of picks.feats ?? []) features.push({ id: uid('feat'), name: f, source: 'Feat', body: [effectOf(IG_FEATS, f) || 'Feat.'] });
  char.features = features;

  char.attacks = (picks.weapons ?? []).map((w) => ({
    id: uid('atk'), name: w, ability: 'str' as const, proficient: true, range: 'Melee', damage: '1d6', damageType: 'physical',
  }));

  char.igBuild = {
    ancestry: picks.ancestry, className: picks.className, subclass: picks.subclass,
    stances: [...(picks.stances ?? [])], powers: [...(picks.powers ?? [])], feats: [...(picks.feats ?? [])], weapons: [...(picks.weapons ?? [])],
  };
  return char;
}
