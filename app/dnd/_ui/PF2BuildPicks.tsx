'use client';
// PF2BuildPicks — searchable, eligibility-aware feat/spell selection inside the PF2 builder (S16).
//
// The builder could not offer feats or spells at all, so a PF2 character could only gain them
// AFTER the fact, from the sheet or the AI. This closes that, and does it with the same greying
// treatment as the sheet's picker and the IG builder: an ineligible entry is shown, struck through
// and disabled, WITH its reason.
//
// Why show rather than hide: the server refuses an illegal build either way (gatePf2Picks), so the
// only thing at stake here is WHEN the player finds out. Hiding entries would make the list look
// arbitrary and leave "why can't I take this?" unanswered.
//
// The catalog is large (800+ feats), so this is search-first rather than a wall of chips — the IG
// builder can render every option because IG has a few dozen.
import { useMemo, useState } from 'react';
import { PF2_ALL_FEATS, PF2_ALL_SPELLS, PF2_CATALOG_STATUS } from '@/lib/dnd/systems/pathfinder2e/data';
import { pf2FeatEligibility, pf2SpellEligibility } from '@/lib/dnd/systems/pathfinder2e/eligibility';
import TakeAnyway from './builder/TakeAnyway';
import type { UnlockOffer } from '@/lib/dnd/slots/entitlement';

export default function PF2BuildPicks({
  kind, className, ancestry, level, tradition, selected, onToggle, limit, cantripLimit,
  offer, exceptions = [], onTakeAnyway, onUndoException,
}: {
  kind: 'feat' | 'spell';
  className: string;
  ancestry: string;
  level: number;
  tradition?: string;
  selected: string[];
  onToggle: (name: string) => void;
  /** How many the character is ENTITLED to at this level (PF2 feat slots = one per level per track).
   *  Once that many are chosen, the rest are blocked with the reason — the same treatment an ineligible
   *  pick already gets. Omitted = uncapped, which is still right for spells until their per-level
   *  known/prepared counts are modelled (slot plan S7).
   *
   *  Why a cap at all: this control offered the whole catalog with an unbounded toggle, so a level-1
   *  character could take thirty feats — while the label above it truthfully read "7 owed by level 12".
   *  The count was computed and displayed and then not enforced. */
  limit?: number;
  /** How many CANTRIPS this caster gets (slot plan S7c). Rank-aware on purpose: `limit` above is a flat
   *  count, which is right for feat slots and wrong for spells — a PF2 caster's entitlement is per RANK,
   *  so one number cannot express "5 cantrips, and levelled spells governed separately".
   *
   *  Only cantrips are capped here, which is 5e's S7b split applied to PF2: cantrips are a known list for
   *  every caster, so the number bites at pick time. LEVELLED spells are deliberately left uncapped — for a
   *  PREPARED caster the sheet list is the spellbook or the whole tradition, both far larger than what is
   *  cast in a day, so capping the picker there would refuse spells the class plainly has. That cap belongs
   *  on the prepare step, exactly as 5e put it on the prepared toggle.
   *
   *  Omitted = uncapped, which is what a reduced caster (Magus/Summoner) must get: their tables are not
   *  modelled, and inventing one is the bug this work exists to undo. */
  cantripLimit?: number;
  /** The escape hatch (slot plan S6b). Omitted → no hatch, and the picker behaves exactly as before. */
  offer?: UnlockOffer;
  /** Names already taken through the hatch. */
  exceptions?: string[];
  onTakeAnyway?: (name: string) => void;
  onUndoException?: (name: string) => void;
}) {
  const [q, setQ] = useState('');

  const ctx = useMemo(() => ({
    className, ancestry, level,
    // Picks under review do NOT satisfy each other's prerequisites — matching the server gate, or
    // the builder would show a chain as legal that the save then refuses.
    featNames: [],
    ...(tradition ? { tradition } : {}),
  }), [className, ancestry, level, tradition]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Below two characters the list is thousands of rows; showing only what is already selected
    // keeps the control usable and makes the current choices reviewable at a glance.
    if (needle.length < 2) {
      const chosen = new Set(selected.map((s) => s.toLowerCase()));
      const pool = kind === 'feat' ? PF2_ALL_FEATS : PF2_ALL_SPELLS;
      return pool.filter((e) => chosen.has(e.name.toLowerCase())).slice(0, 40).map(toRow);
    }
    const pool = kind === 'feat' ? PF2_ALL_FEATS : PF2_ALL_SPELLS;
    return pool
      .filter((e) => e.name.toLowerCase().includes(needle))
      .slice(0, 40)
      .map(toRow)
      .sort((a, b) => Number(b.ok) - Number(a.ok) || a.name.localeCompare(b.name));

    function toRow(e: (typeof PF2_ALL_FEATS)[number] | (typeof PF2_ALL_SPELLS)[number]) {
      if (kind === 'feat') {
        const f = e as (typeof PF2_ALL_FEATS)[number];
        const v = pf2FeatEligibility(f, ctx);
        return { name: f.name, meta: `L${f.level} ${f.track}${f.className ? ` · ${f.className}` : ''}`, ok: v.ok, reason: v.reason };
      }
      const s = e as (typeof PF2_ALL_SPELLS)[number];
      const v = pf2SpellEligibility(s, ctx);
      return { name: s.name, meta: s.rank === 0 ? 'cantrip' : `rank ${s.rank}${s.focus ? ' · focus' : ''}`, ok: v.ok, reason: v.reason };
    }
  }, [kind, q, ctx, selected]);

  /** Cantrips already chosen, resolved against the CATALOG rather than the search rows — the rows are
   *  filtered by the query, so counting them would let the budget drift as the player types. */
  const cantripsChosen = useMemo(() => {
    if (cantripLimit == null) return 0;
    const chosen = new Set(selected.map((s) => s.trim().toLowerCase()));
    return PF2_ALL_SPELLS.filter((s) => s.rank === 0 && chosen.has(s.name.toLowerCase())).length;
  }, [cantripLimit, selected]);

  const status = kind === 'feat' ? PF2_CATALOG_STATUS.feats : PF2_CATALOG_STATUS.spells;
  const input = { padding: '6px 9px', fontSize: 12.5, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6 } as const;

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${status.count} ${kind}s…`}
        style={input}
      />
      {/* The budget, shown UP FRONT. S7b's finding, and it applies unchanged: a cap discovered only by
          being refused reads as a bug, while the same number stated before you pick reads as a rule. */}
      {cantripLimit != null && (
        <div style={{ fontSize: 11.5, color: cantripsChosen > cantripLimit ? 'var(--hx-danger-2)' : 'var(--hx-muted)' }}>
          Cantrips {cantripsChosen}/{cantripLimit}
          {cantripsChosen > cantripLimit ? ' — over this class’s number; remove one to get back to legal.' : ''}
          {' · '}levelled spells are limited by your slots per rank when you prepare them.
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {rows.map((r) => {
          const active = selected.some((s) => s.toLowerCase() === r.name.toLowerCase());
          // Already-selected entries are never blocked, so a pick made before the class was chosen
          // can still be removed rather than stranded — and so a full list can always be undone.
          const full = limit != null && !active && selected.length >= limit;
          // Cantrips are counted on their own — see `cantripLimit`. `>=` matches the feat cap: a caster
          // already over the number (an older character, a DM grant) can still REMOVE, never add, so
          // nothing is silently deleted.
          const cantripFull = cantripLimit != null && !active && r.meta === 'cantrip' && cantripsChosen >= cantripLimit;
          const blocked = (!r.ok && !active) || full || cantripFull;
          const why = cantripFull
            ? `You've chosen all ${cantripLimit} cantrips this class grants at level ${level} — deselect one first.`
            : full
              ? `You've used all ${limit} feat slot${limit === 1 ? '' : 's'} this class grants by level ${level} — deselect one first.`
              : r.reason;
          return (
            <button
              key={r.name} type="button"
              onClick={() => { if (!blocked) onToggle(r.name); }}
              disabled={blocked}
              title={blocked ? `${why} — pick a different class or level, or build a custom character.` : `${r.name} · ${r.meta}`}
              style={{
                fontSize: 11.5, padding: '3px 8px', borderRadius: 12,
                cursor: blocked ? 'not-allowed' : 'pointer',
                border: `1px solid ${active ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`,
                background: active ? 'rgba(10,200,185,0.15)' : 'transparent',
                color: active ? 'var(--hx-teal-1)' : 'var(--hx-muted)',
                opacity: blocked ? 0.4 : 1,
                textDecoration: blocked ? 'line-through' : 'none',
              }}
            >{r.name} <span style={{ fontSize: 9.5, opacity: 0.7 }}>{r.meta}</span></button>
          );
        })}
      </div>
      {/* The escape hatch. Its options are the refusals THIS SEARCH surfaced, not the whole catalog — with
          thousands of entries a complete "everything you can't have" list would be unusable, and the player
          is already looking at the thing they want. Scoped to eligibility refusals, not the slot `limit`,
          because the server gate judges eligibility only: a hatch over the cap would promise an exception
          the build never records. */}
      {offer && onTakeAnyway && onUndoException && (
        <TakeAnyway
          offer={offer}
          noun={kind}
          blocked={rows
            .filter((r) => !r.ok && !selected.some((s) => s.toLowerCase() === r.name.toLowerCase()))
            .map((r) => ({ name: r.name, ...(r.reason ? { reason: r.reason } : {}) }))}
          taken={exceptions}
          onTake={onTakeAnyway}
          onUntake={onUndoException}
        />
      )}
      {q.trim().length < 2 && (
        <div style={{ fontSize: 11, color: 'var(--hx-muted)' }}>
          Type at least two characters to search. {!status.complete && `${status.count} ${kind}s catalogued so far — not the full list yet.`}
        </div>
      )}
    </div>
  );
}
