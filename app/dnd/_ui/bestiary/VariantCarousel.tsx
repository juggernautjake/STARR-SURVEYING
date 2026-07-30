'use client';
// app/dnd/_ui/bestiary/VariantCarousel.tsx — the variants of a creature, and what makes each one different
// (N3-5).
//
// Owner, 2026-07-30:
//
//   *"If there are variants of the creature posted in that system, there should be an element below the
//   stat block showing a carousel of the variants that can be clicked to view the variant stat block. All
//   differences in the variant stat block should be noted."*
//
// Two requirements, and the second is the substance. The page previously rendered the variants as a stack
// of collapsed `<details>`: every variant closed, nothing comparable, and the only account of what changed
// was the derivation SENTENCE — a claim about what a formula intended rather than a record of what it did.
//
// ── THE DIFF IS COMPUTED, NOT QUOTED ────────────────────────────────────────────────────────────────
//
// `diffStatblocks` compares the two blocks, so the list under a variant is what actually moved. This
// matters beyond tidiness: the PF2 adjustment's sentence says it shifts *"AC, attacks, DCs and saves"*, and
// a DC written inside an action's prose is NOT shifted by `deriveVariant`. Quoting the sentence repeats a
// promise the data does not keep; comparing the blocks tells the reader what is in front of them.
//
// The base creature is the FIRST card rather than an implied elsewhere — it is the thing every other card
// is a difference from, and a carousel of variants with no base is a comparison with one side missing.
import { useMemo, useState } from 'react';

import CreatureStatblock from './CreatureStatblock';
import styles from '../hextech.module.css';
import type { Statblock } from '@/lib/dnd/homebrew/statblock';
import { diffStatblocks, type StatDiff } from '@/lib/dnd/statblocks/diff';

export interface VariantView {
  id: string;
  name: string;
  tier: string;
  cr: string | null;
  statblock: Statblock;
  derivation: string | null;
}

export default function VariantCarousel({
  baseName,
  baseCr,
  baseStatblock,
  variants,
  system,
}: {
  baseName: string;
  baseCr: string | null;
  baseStatblock: Statblock;
  variants: VariantView[];
  system?: string;
}) {
  // The base is index 0 but NOT the default, and the reason is what the page looks like rather than what
  // the component would prefer. The lens renders this creature's block directly above; opening the
  // carousel on the base too would stack two near-identical stat blocks and make the panel read as a
  // rendering bug. So the base is present — it is the anchor every diff is measured from, and a reader
  // has to be able to get back to it — and the carousel opens on the first VARIANT, which is the thing
  // this panel exists to show.
  const [selected, setSelected] = useState(variants.length > 0 ? 1 : 0);

  const cards = useMemo(
    () => [
      { id: '__base__', name: baseName, tier: 'base', cr: baseCr, statblock: baseStatblock, derivation: null },
      ...variants,
    ],
    [baseName, baseCr, baseStatblock, variants],
  );

  const current = cards[Math.min(selected, cards.length - 1)];
  const isBase = current.id === '__base__';
  const diffs = useMemo(
    () => (isBase ? [] : diffStatblocks(baseStatblock, current.statblock)),
    [isBase, baseStatblock, current.statblock],
  );

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* ── THE CAROUSEL ──────────────────────────────────────────────────────────────────────────────
          A horizontal scroller of real buttons rather than a slider with arrows: there are rarely more
          than three of these, every one should be reachable in a single click, and a tab strip is
          keyboard-navigable for free where a drag-carousel is not. */}
      <div
        role="tablist"
        aria-label={`${baseName} versions`}
        style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}
      >
        {cards.map((v, i) => {
          const on = i === Math.min(selected, cards.length - 1);
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSelected(i)}
              style={{
                flex: '0 0 auto', minHeight: 44, padding: '6px 12px', cursor: 'pointer', textAlign: 'left',
                border: `1px solid ${on ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`,
                background: on ? 'rgba(10,200,185,0.14)' : 'rgba(1,10,19,0.4)',
                color: on ? 'var(--hx-teal-1)' : 'var(--hx-text)',
                display: 'grid', gap: 2,
              }}
            >
              <span style={{ fontFamily: 'var(--hx-font-display)', fontSize: 13 }}>{v.name}</span>
              <span style={{ fontSize: 10.5, color: 'var(--hx-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {v.id === '__base__' ? 'As published' : v.tier}
                {v.cr ? ` · CR ${v.cr}` : ''}
              </span>
            </button>
          );
        })}
      </div>

      <CreatureStatblock statblock={current.statblock} name={current.name} system={system} />

      {/* ── WHAT IS DIFFERENT ─────────────────────────────────────────────────────────────────────────
          The owner's "all differences should be noted", computed rather than quoted. Shown BELOW the
          block: a reader compares after reading, not before. */}
      {!isBase && (
        <div style={{ border: '1px solid var(--hx-gold-line)', background: 'rgba(200,154,60,0.08)', padding: '10px 12px', display: 'grid', gap: 8 }}>
          <strong style={{ fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hx-gold-2)' }}>
            {diffs.length === 0
              ? `Identical to ${baseName}`
              : `${diffs.length} difference${diffs.length === 1 ? '' : 's'} from ${baseName}`}
          </strong>

          {/* A variant whose formula moved nothing is a real row — a creature with no AC and no HP to
              shift — and saying so is better than an empty box that reads as a rendering failure. */}
          {diffs.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--hx-text)', margin: 0, lineHeight: 1.5 }}>
              Every field this variant could change was absent from the base creature, so the two blocks
              are the same. The row exists; the adjustment had nothing to act on.
            </p>
          )}

          {diffs.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
              {diffs.map((d) => <DiffRow key={d.key} d={d} />)}
            </ul>
          )}

          {/* The derivation sentence stays, UNDER the measured list rather than instead of it: it is the
              provenance ("a house formula, not an official rule") which a diff cannot express. */}
          {current.derivation && (
            <p style={{ fontSize: 11.5, color: 'var(--hx-muted)', margin: 0, lineHeight: 1.5 }}>
              {current.derivation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Long prose — an entry's rules text — is truncated rather than dumped: the diff is a summary, and the
 *  full text is in the block directly above. */
const clip = (s: string) => (s.length > 90 ? `${s.slice(0, 90)}…` : s);

function DiffRow({ d }: { d: StatDiff }) {
  const arrow = d.direction === 'up' ? '▲' : d.direction === 'down' ? '▼' : '→';
  const colour = d.direction === 'up' ? 'var(--hx-teal-1)' : d.direction === 'down' ? '#e08a7a' : 'var(--hx-muted)';
  return (
    <li style={{ fontSize: 12.5, color: 'var(--hx-text)', lineHeight: 1.5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ color: colour }} aria-hidden="true">{arrow}</span>
      <strong style={{ color: 'var(--hx-gold-2)', fontWeight: 600 }}>{d.label}</strong>
      {/* "added" and "removed" read as themselves rather than as a comparison with a blank, which would
          print "→ 12" and leave a reader wondering what the base had. */}
      {d.from === null ? (
        <span>added: {clip(d.to ?? '')}</span>
      ) : d.to === null ? (
        <span>removed (was {clip(d.from)})</span>
      ) : (
        <span>
          <span style={{ color: 'var(--hx-muted)' }}>{clip(d.from)}</span>
          <span style={{ color: colour, margin: '0 5px' }}>→</span>
          <span style={{ color: 'var(--hx-text)', fontWeight: 600 }}>{clip(d.to)}</span>
        </span>
      )}
    </li>
  );
}
