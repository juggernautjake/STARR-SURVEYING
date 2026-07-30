'use client';
// app/dnd/_ui/bestiary/SystemLens.tsx — the system a stat block is being read in (N3-3).
//
// Owner, 2026-07-30, a complete UI spec:
//
//   *"The bestiary should just default to the 2024 edition. I want it so that the system that is currently
//   being shown to the user is at the top of the stat block, and the user can click it to have a drop-down
//   menu of all of the systems. If they select another system, then it should reload the stat block to show
//   the corrected stats for the system chosen. This should be dynamic in real time."*
//
//   *"This should do away with the whole 'USE IN ANOTHER SYSTEM' element at the bottom of the stat block."*
//
// ── WHY THE LENS REPLACES THE PANEL RATHER THAN JOINING IT ──────────────────────────────────────────
//
// The old `?to=` panel and this control answer the same question — *which system's numbers am I reading?* —
// and keeping both would leave two controls that can DISAGREE: the header saying Pathfinder while a panel
// below shows a 5e block under a "converted" heading. One answer, at the top, where a reader looks before
// they read a single number.
//
// ── DERIVED HERE, NOT FETCHED ───────────────────────────────────────────────────────────────────────
//
// `deriveNativeStatblock` is pure, total and cheap, so switching is a re-render rather than a round trip —
// which is what *"dynamic in real time"* asks for. It also means there is no stale derived row: change the
// tier tables and every block on the site is correct on the next page load, with nothing to regenerate.
//
// A PUBLISHED block always wins over a derived one (N7). If the catalogue actually holds this creature in
// the chosen system, that is a real designer's numbers and no measurement should overwrite them.
import { useMemo, useState } from 'react';

import CreatureStatblock from './CreatureStatblock';
import styles from '../hextech.module.css';
import type { Statblock } from '@/lib/dnd/homebrew/statblock';
import { deriveNativeStatblock, isRefusal } from '@/lib/dnd/statblocks/derive-native';
import { transposeCreature, type BestiarySystem } from '@/lib/dnd/bestiary/transpose';

/** Every system a reader can look through. Ordered with the default first. */
export const LENS_SYSTEMS: BestiarySystem[] = [
  'dnd5e-2024', 'dnd5e-2014', 'pathfinder2e', 'intuitive-games',
];

export const SYSTEM_LABEL: Record<BestiarySystem, string> = {
  'dnd5e-2024': 'D&D 5e (2024)',
  'dnd5e-2014': 'D&D 5e (2014)',
  pathfinder2e: 'Pathfinder 2e',
  'intuitive-games': 'Intuitive Games',
};

/** A creature as the catalogue holds it, in one system. */
export interface LensSource {
  name: string;
  system: string;
  type?: string | null;
  size?: string | null;
  cr?: string | null;
  statblock: Statblock;
}

export default function SystemLens({
  source,
  published = {},
  initial = 'dnd5e-2024',
}: {
  /** The row this page is built from — whichever system it happens to be stored in. */
  source: LensSource;
  /** Other systems this creature is ALREADY published in, keyed by system. These beat derivation. */
  published?: Partial<Record<BestiarySystem, LensSource>>;
  /** Defaults to 2024, the site-wide default settled the same day. */
  initial?: BestiarySystem;
}) {
  const [system, setSystem] = useState<BestiarySystem>(initial);
  const [open, setOpen] = useState(false);

  const view = useMemo(() => build(source, published, system), [source, published, system]);

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* ── The header IS the control ──────────────────────────────────────────────────────────────
          At the TOP, because it says what the numbers below it ARE. A reader who finds this after
          reading the block has already read it wrong. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', position: 'relative' }}>
        <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hx-muted)' }}>
          Reading as
        </span>
        <button
          type="button"
          className={styles.hexBtn}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="listbox"
          style={{ minHeight: 40, borderColor: 'var(--hx-teal-1)', color: 'var(--hx-teal-1)', fontWeight: 700 }}
        >
          {SYSTEM_LABEL[system]} <span aria-hidden="true" style={{ marginLeft: 4 }}>{open ? '▴' : '▾'}</span>
        </button>

        {/* The provenance of what you are looking at, beside the control rather than buried under the
            block — "published" and "derived" are different kinds of claim and the difference is the
            reader's to make (N3-4). */}
        <span
          style={{
            fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: view.kind === 'published' ? 'var(--hx-gold-2)' : 'var(--hx-muted)',
          }}
        >
          {view.kind === 'published' ? '◆ Published' : view.kind === 'derived' ? '◇ Derived' : '◇ Converted'}
        </span>

        {open && (
          <ul
            role="listbox"
            aria-label="Game system"
            style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 20, margin: '4px 0 0', padding: 4,
              listStyle: 'none', minWidth: 220,
              border: '1px solid var(--hx-teal-1)', background: 'var(--hx-panel)',
            }}
          >
            {LENS_SYSTEMS.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  role="option"
                  aria-selected={s === system}
                  onClick={() => { setSystem(s); setOpen(false); }}
                  style={{
                    width: '100%', textAlign: 'left', minHeight: 38, padding: '8px 10px', cursor: 'pointer',
                    background: s === system ? 'rgba(10,200,185,0.14)' : 'none',
                    border: 'none', color: s === system ? 'var(--hx-teal-1)' : 'var(--hx-text)', fontSize: 13,
                  }}
                >
                  {SYSTEM_LABEL[s]}
                  {/* `published` holds only the OTHER systems' rows, so the creature's own system has to be
                      counted here or the menu contradicts itself — the 2014 Badger's menu showed no ◆
                      beside 2014 and then rendered "◆ Published" the moment it was picked. `isPublished`
                      is shared with build() so the marker and the badge can never disagree again. */}
                  {isPublished(source, published, s) && (
                    <span style={{ float: 'right', color: 'var(--hx-gold-2)', fontSize: 11 }} aria-label="published">◆</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreatureStatblock statblock={view.statblock} name={source.name} system={system} />

      {/* WHAT WAS DONE TO GET HERE. A derived block with no notes is exactly the lie G5 exists to
          prevent — it would read as a designer's numbers rather than a measurement. */}
      {view.notes.length > 0 && (
        <div style={{ border: '1px solid var(--hx-gold-line)', background: 'rgba(200,154,60,0.08)', padding: '10px 12px' }}>
          <strong style={{ fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hx-gold-2)' }}>
            {view.kind === 'derived' ? 'How these numbers were built' : `${view.notes.length} thing${view.notes.length === 1 ? '' : 's'} need a human`}
          </strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: '1.1rem', display: 'grid', gap: 5 }}>
            {view.notes.map((n) => (
              <li key={n} style={{ fontSize: 12.5, color: 'var(--hx-text)', lineHeight: 1.5 }}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface LensView {
  kind: 'published' | 'derived' | 'converted';
  statblock: Statblock;
  notes: string[];
}

/**
 * The publisher's row for a system, if there is one.
 *
 * The SOURCE row counts when you are reading it in its own system — `published` deliberately holds only
 * the OTHER systems (`loadSiblings` excludes the creature's own), so anything asking "is this system
 * published?" has to check both or it will answer no for the one system that is certainly yes.
 *
 * One function rather than the same expression written twice, because the two readers are the menu marker
 * and the badge, and they disagreed: the 2014 Badger's dropdown showed no ◆ beside 2014 and then rendered
 * "◆ Published" the instant it was chosen.
 */
function publishedRow(
  source: LensSource,
  published: Partial<Record<BestiarySystem, LensSource>>,
  system: BestiarySystem,
): LensSource | undefined {
  return source.system === system ? source : published[system];
}

/** Is this system one a designer wrote for? Exported for tests — the menu's ◆ is a claim, not decoration. */
export function isPublished(
  source: LensSource,
  published: Partial<Record<BestiarySystem, LensSource>>,
  system: BestiarySystem,
): boolean {
  return Boolean(publishedRow(source, published, system));
}

/**
 * What to show for a chosen system, in strict order of trustworthiness.
 *
 *   published → a designer wrote these numbers for this system. Nothing beats it.
 *   derived   → rebuilt from that system's own measured tier table (N2-1).
 *   converted → the old transposition, for systems with no table of their own (Intuitive Games).
 *
 * Exported for tests: the ORDER is the claim, and a UI-only implementation would leave it unpinned.
 */
export function build(
  source: LensSource,
  published: Partial<Record<BestiarySystem, LensSource>>,
  system: BestiarySystem,
): LensView {
  const own = publishedRow(source, published, system);
  if (own) return { kind: 'published', statblock: own.statblock, notes: [] };

  const derived = deriveNativeStatblock(
    { name: source.name, system: source.system, type: source.type, size: source.size, cr: source.cr, statblock: source.statblock },
    system,
  );
  if (!isRefusal(derived)) {
    return { kind: 'derived', statblock: derived.statblock, notes: derived.notes };
  }

  // No table for this system (IG), or nothing to place the creature on a scale with. Transposition is the
  // honest fallback: it carries what has a correspondence and NAMES what does not, which is a weaker claim
  // clearly labelled rather than a strong claim quietly wrong.
  const t = transposeCreature(
    { name: source.name, system: source.system, type: source.type, size: source.size, cr: source.cr, statblock: source.statblock },
    system,
  );
  return { kind: 'converted', statblock: t.statblock, notes: [derived.reason, ...t.unmapped] };
}
