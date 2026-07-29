// lib/dnd/builder/preview.ts — what the character looks like right now (P5-7).
//
// The guided builder's design was "each slot becomes one screen with a live preview panel". The screens
// exist — all three systems' level walkers are wired into the flow — and the PREVIEW never was. So a player
// walks nine levels of choices watching a form, and finds out what they built by leaving the builder.
//
// PURE, AND SYSTEM-AGNOSTIC BY DELEGATION. Every number here comes from the per-system resolver that
// already owns it — `resolveHp` for hit points, the PF2/IG sidecars for their own stats — rather than from
// a fourth place that computes them slightly differently. The whole point of a preview is that it agrees
// with the sheet; one that quietly disagrees is worse than none, because the disagreement is discovered
// after the character is built.
//
// A FIELD IT CANNOT RESOLVE IS OMITTED, never zeroed. `AC —` reads as "not set yet", which is true during
// a build; `AC 0` reads as a character with no armour class, which is a bug report.
import { resolveHp } from '../combat-hp';
import type { CharacterSystem } from '../systems';

export interface PreviewStat {
  label: string;
  value: string;
}

export interface BuildPreview {
  name: string;
  /** "Level 5 Cleric (Warpriest)" — whatever of it is known. */
  headline: string;
  stats: PreviewStat[];
  /** True when nothing but a name is known — the caller shows an encouraging blank state instead of a
   *  grid of dashes, which reads as broken rather than as unstarted. */
  empty: boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** The six 5e-style abilities, in the order every sheet in this repo prints them. */
const ABILITY_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ABILITY_LABEL: Record<string, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
};

/** `+3` / `−1` — a modifier with a sign, and a real minus rather than a hyphen. */
export function signed(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

/**
 * Read the identity line from wherever this system keeps it.
 *
 * `meta` is the shared projection every system writes, so it is checked first; the sidecars are the
 * fallback for a character built before that projection existed.
 */
function identity(data: Record<string, unknown>): { level: number | null; className: string; subclass: string; ancestry: string } {
  const meta = (data.meta && typeof data.meta === 'object' ? data.meta : {}) as Record<string, unknown>;
  const pf2 = (data.pf2e && typeof data.pf2e === 'object' ? (data.pf2e as Record<string, unknown>).identity : null) as Record<string, unknown> | null;
  const ig = (data.ig && typeof data.ig === 'object' ? (data.ig as Record<string, unknown>).identity : null) as Record<string, unknown> | null;
  const from = (key: string) => str(meta[key]) || str(pf2?.[key]) || str(ig?.[key]);
  return {
    level: num(meta.level) ?? num(pf2?.level) ?? num(ig?.level),
    className: from('className'),
    subclass: from('subclass'),
    // 5e says "race" / "species", PF2 and IG say "ancestry". Checked in that order so whichever the
    // system wrote is found, and labelled generically below rather than asserting one system's word.
    ancestry: str(meta.race) || str(meta.species) || from('ancestry'),
  };
}

/** Ability modifiers, from the shared 5e block or a PF2/IG sidecar's own attributes. */
function abilityStats(data: Record<string, unknown>): PreviewStat[] {
  const out: PreviewStat[] = [];
  const abilities = (data.abilities && typeof data.abilities === 'object' ? data.abilities : null) as Record<string, unknown> | null;
  if (abilities) {
    for (const key of ABILITY_ORDER) {
      const entry = abilities[key] as Record<string, unknown> | number | undefined;
      // 5e stores `{ score, mod }`; some sheets store the bare score. Both are read rather than one being
      // declared canonical, because both exist in the database today.
      const mod = typeof entry === 'object' && entry ? num(entry.mod) : null;
      const score = typeof entry === 'object' && entry ? num(entry.score) : num(entry);
      if (mod != null) out.push({ label: ABILITY_LABEL[key], value: signed(mod) });
      else if (score != null) out.push({ label: ABILITY_LABEL[key], value: signed(Math.floor((score - 10) / 2)) });
    }
    if (out.length) return out;
  }
  // PF2 and IG store MODIFIERS directly — no score, no derivation. Treating those as scores would print
  // a +4 Wisdom cleric as −3.
  const sidecar = (data.pf2e ?? data.ig) as Record<string, unknown> | undefined;
  const attrs = sidecar && typeof sidecar === 'object' ? (sidecar.attributes as Record<string, unknown> | undefined) : undefined;
  if (attrs) {
    for (const key of ABILITY_ORDER) {
      const mod = num(attrs[key.toUpperCase()]) ?? num(attrs[key]);
      if (mod != null) out.push({ label: ABILITY_LABEL[key], value: signed(mod) });
    }
  }
  return out;
}

/** Build the preview. `system` picks the right HP resolver; everything else is read defensively. */
export function buildPreview(system: CharacterSystem | string, name: string, raw: unknown): BuildPreview {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const id = identity(data);

  const headlineBits = [
    id.level != null ? `Level ${id.level}` : '',
    id.ancestry,
    id.className,
    id.subclass ? `(${id.subclass})` : '',
  ].filter(Boolean);

  const stats: PreviewStat[] = [];

  // HP through the shared resolver, which is the module that already knows each system keeps it somewhere
  // different (P1-1). A preview computing its own would be the fourth opinion on one number.
  const hp = resolveHp(system as CharacterSystem, data);
  if (hp.maxHp != null) {
    stats.push({ label: 'HP', value: hp.currentHp != null && hp.currentHp !== hp.maxHp ? `${hp.currentHp} / ${hp.maxHp}` : String(hp.maxHp) });
  }

  const combat = (data.combat && typeof data.combat === 'object' ? data.combat : {}) as Record<string, unknown>;
  const ac = num(combat.ac) ?? num((data.pf2e as Record<string, unknown> | undefined)?.ac);
  if (ac != null) stats.push({ label: 'AC', value: String(ac) });

  const speed = num(combat.speed) ?? num(((data.pf2e ?? data.ig) as Record<string, unknown> | undefined)?.combat && ((((data.pf2e ?? data.ig) as Record<string, unknown>).combat) as Record<string, unknown>).speed);
  if (speed != null) stats.push({ label: 'Speed', value: `${speed} ft` });

  stats.push(...abilityStats(data));

  return {
    name: str(name) || 'New character',
    headline: headlineBits.join(' '),
    stats,
    // "Nothing chosen yet" is not the same as "no stats" — a character with a class but no abilities has
    // started. Empty means genuinely nothing but a name.
    empty: !headlineBits.length && stats.length === 0,
  };
}
