'use client';
// IGContentPicker — add a power or a feat to a BUILT Intuitive Games character (IG-S3).
//
// The sheet could already ADD both kinds — each had a <select> of names drawn from the full
// catalog. What a dropdown cannot do is show you anything about what you are picking: not the
// rules text, not the prerequisites, and above all not whether this character may take it. A
// vanilla character chose from ~60 power names and found out which ones its class actually allows
// only from the refusal afterwards. That is the gap; the picker is the same content with the
// answers attached.
//
// The PF2 sheet got this surface first; this is its IG counterpart, and it follows PF2's two
// settled contracts:
//
//   · SHOW EVERYTHING, GREY THE INELIGIBLE, HIDE NOTHING. Hiding entries makes the list look
//     arbitrary and leaves "why can't I take this?" unanswered.
//   · THE GREYING IS FEEDBACK TIMING, NEVER THE ENFORCEMENT POINT. The ig-edit route re-derives
//     the variant and the DM flag server-side, so nothing in the request body decides whether the
//     rules apply to it.
//
// Where it deliberately DIVERGES from the PF2 picker, because IG is not PF2:
//
//   · FEATS CARRY NO ELIGIBILITY VERDICT. `gateIgEdit` gates `add_power` and nothing else, and
//     eligibility.ts explains why: IG feat prerequisites are free English prose ("Training in
//     Perception and Strength 14"), unparseable without inventing structure the source does not
//     have. So feats show their prerequisite TEXT and let the player judge. Rendering a computed
//     ✓/✕ there would be the UI asserting a verdict the rules engine has explicitly declined to
//     reach — worse than showing nothing, because it would look authoritative.
//   · POWER ELIGIBILITY FAILS OPEN. A character with no class power list yet (IG parent classes
//     genuinely carry none) gets no verdict rather than a blanket refusal.
import { useMemo, useState } from 'react';
import {
  IG_POWERS, IG_SPELL_ROSTER, IG_DEFENSIVE_POWERS,
} from '@/lib/dnd/systems/intuitive-games/content';
import { IG_GENERAL_FEATS, IG_COMBAT_FEATS, type IGFeat } from '@/lib/dnd/systems/intuitive-games/feats';
import { igPowerEligibility } from '@/lib/dnd/systems/intuitive-games/eligibility';
import { igContextFor } from '@/lib/dnd/systems/intuitive-games/rules-gate';
import type { IGCharacter } from '@/lib/dnd/systems/intuitive-games/model';

export type IGPickerKind = 'power' | 'feat';

/** One selectable row, normalised across the two kinds so the list body stays single-purpose. */
interface Row {
  name: string;
  /** School for a power, General/Combat for a feat. */
  category: string;
  /** Rules text, where the catalog has it. */
  effect?: string;
  /** Feats only — the site's own prerequisite prose, shown verbatim and never parsed. */
  prerequisites?: string | null;
  /** Powers only. Absent for feats BY DESIGN; see the header note. */
  elig?: { ok: boolean; reason?: string };
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Every power the character could name, effect text where we have it.
 *
 * Built from the ROSTER rather than from `IG_POWERS` alone. The two are not the same list:
 * `IG_POWERS` holds the entries whose verbatim effect text has been transcribed, while
 * `IG_SPELL_ROSTER` is the complete set of names from the site's spell list. Listing only the
 * former would make a real IG spell look like it does not exist — the same "a missing entry reads
 * as the system having no such thing" failure the PF2 catalog footer exists to prevent.
 */
function allPowers(): Row[] {
  const effects = new Map<string, { effect?: string; category?: string }>();
  for (const p of [...IG_POWERS, ...IG_DEFENSIVE_POWERS]) {
    effects.set(norm(p.name), { effect: p.effect, category: p.category });
  }

  const rows = new Map<string, Row>();
  for (const [school, names] of Object.entries(IG_SPELL_ROSTER)) {
    for (const name of names) {
      const known = effects.get(norm(name));
      rows.set(norm(name), { name, category: known?.category || school, effect: known?.effect });
    }
  }
  // Anything with transcribed text that the roster does not list (the site's own two directions of
  // drift are already tracked in content.ts) still belongs in the picker.
  for (const p of [...IG_POWERS, ...IG_DEFENSIVE_POWERS]) {
    if (!rows.has(norm(p.name))) rows.set(norm(p.name), { name: p.name, category: p.category ?? '', effect: p.effect });
  }
  return [...rows.values()];
}

function allFeats(): Row[] {
  return [...IG_GENERAL_FEATS, ...IG_COMBAT_FEATS].map((f: IGFeat) => ({
    name: f.name,
    category: f.group === f.category ? f.category : `${f.category} · ${f.group}`,
    effect: f.effect,
    prerequisites: f.prerequisites,
  }));
}

export default function IGContentPicker({
  ig, kind, isDM, variantKind = 'vanilla', onAdd, onClose,
}: {
  ig: IGCharacter;
  kind: IGPickerKind;
  isDM?: boolean;
  /** Defaults to vanilla — the safe direction, matching the server. */
  variantKind?: 'vanilla' | 'custom';
  /** Emits ONE op. The sheet's `postEdits` takes an array, so the caller wraps it. */
  onAdd: (edit: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const isVanilla = variantKind !== 'custom';
  const ctx = useMemo(() => igContextFor(ig), [ig]);

  const rows = useMemo(() => {
    const needle = norm(q);
    const base = kind === 'power' ? allPowers() : allFeats();
    const matched = base.filter((r) =>
      !needle || norm(r.name).includes(needle) || norm(r.effect ?? '').includes(needle));

    if (kind === 'feat') {
      // No verdict to sort by — alphabetical, which is how the site itself lists them.
      return matched.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 80);
    }

    const judged = matched.map((r) => ({ ...r, elig: igPowerEligibility(r.name, ctx) }));
    // Eligible first, then alphabetical. The cap is applied AFTER the sort, so what falls off the
    // end is what the character cannot take anyway.
    return judged
      .sort((a, b) => (Number(b.elig.ok) - Number(a.elig.ok)) || a.name.localeCompare(b.name))
      .slice(0, 80);
  }, [q, kind, ctx]);

  const total = kind === 'power' ? allPowers().length : allFeats().length;
  const heading = isDM ? `Grant a ${kind}` : `Add a ${kind}`;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(680px, 100%)', maxHeight: '80vh', display: 'grid', gap: 10,
          background: 'var(--hx-bg-2, #14121a)', border: '1px solid var(--hx-line)', borderRadius: 12, padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <strong style={{ fontFamily: 'var(--hx-font-display)', fontSize: 16, color: 'var(--hx-gold-2)', flex: 1 }}>{heading}</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--hx-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {isDM && (
          <div style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
            You are the DM: off-list picks are allowed on purpose, and arrive marked as granted.
          </div>
        )}

        {kind === 'feat' && (
          // Said plainly rather than implied by the absence of ticks. IG feat prerequisites are
          // prose on the source site; the rules engine declines to judge them, and the UI saying so
          // is more honest than a verdict it would have to invent.
          <div style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
            IG states feat prerequisites in prose, so they are shown as written rather than checked
            automatically. Read them before taking one.
          </div>
        )}

        <input
          value={q} onChange={(e) => setQ(e.target.value)} autoFocus
          placeholder={`Search ${total} ${kind}s…`}
          style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--hx-line)', background: 'var(--hx-bg-1, #0d0b12)', color: 'var(--hx-text)', fontSize: 13 }}
        />

        <div style={{ overflowY: 'auto', display: 'grid', gap: 6 }}>
          {rows.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--hx-muted)', padding: '8px 2px' }}>Nothing matches “{q}”.</div>
          )}
          {rows.map((r) => {
            // Only powers can be blocked — feats are ungated on the server, so blocking them here
            // would be the UI inventing a rule.
            const blocked = kind === 'power' && isVanilla && !isDM && !!r.elig && !r.elig.ok;
            const offRules = !blocked && !!r.elig && !r.elig.ok;
            return (
              <div
                key={r.name}
                style={{
                  display: 'grid', gap: 3, padding: '7px 9px', borderRadius: 8,
                  border: '1px solid var(--hx-line)', opacity: blocked ? 0.65 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--hx-text)', flex: 1 }}>{r.name}</span>
                  {r.category && <span style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>{r.category}</span>}
                  <button
                    type="button"
                    disabled={blocked}
                    // Name only. `add_feat` deliberately carries no category: applyIgEdit routes
                    // the feat to its General/Combat bucket by looking up its REAL category, which
                    // is better than anything derivable from this row's display label.
                    onClick={() => onAdd({ op: kind === 'power' ? 'add_power' : 'add_feat', name: r.name })}
                    title={blocked
                      ? 'This is a vanilla character, so its powers are held to its class and level. Build a custom character, or ask the DM to grant it.'
                      : offRules
                      ? 'Allowed because this character is custom — it will be marked as off-rules.'
                      : `Add ${r.name}`}
                    style={{
                      background: 'none', border: '1px solid var(--hx-line)', borderRadius: 10,
                      color: blocked ? '#d98080' : 'var(--hx-muted)', cursor: blocked ? 'not-allowed' : 'pointer',
                      fontSize: 10.5, padding: '2px 8px', whiteSpace: 'nowrap',
                    }}
                  >{blocked ? '✕ Blocked' : offRules ? '＋ Anyway' : '＋ Add'}</button>
                </div>

                {/* The reason, when there is a verdict AND it is negative. ✕ when it blocks, ⚠ when
                    it is merely off-rules — the same two-tone distinction the sheet's own markers use. */}
                {r.elig && !r.elig.ok && (
                  <span style={{ fontSize: 11, color: blocked ? '#d98080' : '#e0a020' }}>
                    {blocked ? '✕' : '⚠'} {r.elig.reason}
                  </span>
                )}

                {/* Feats: prerequisites verbatim, never parsed. `null` means the site lists none. */}
                {kind === 'feat' && (
                  <span style={{ fontSize: 11, color: 'var(--hx-muted)' }}>
                    <em>Prerequisites:</em> {r.prerequisites ?? 'none listed'}
                  </span>
                )}

                {r.effect && (
                  <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>{r.effect}</span>
                )}
                {kind === 'power' && !r.effect && (
                  // Named on the site's spell list but its text is not transcribed yet. Saying so
                  // beats an empty row that reads as a power with no rules.
                  <span style={{ fontSize: 11, color: 'var(--hx-muted)', fontStyle: 'italic' }}>
                    Rules text not yet transcribed from the source.
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {rows.length >= 80 && (
          <div style={{ fontSize: 11, color: 'var(--hx-muted)' }}>
            Showing the first 80 matches — narrow the search to see more.
          </div>
        )}
      </div>
    </div>
  );
}
