'use client';
// PF2ContentPicker — add a feat or spell to a Pathfinder 2e sheet from the rules library.
//
// PF2 had no picker at all: the catalog existed and the gated `add_feat`/`add_spell` ops existed,
// but nothing in the UI could reach them, so a player could only get content onto a PF2 sheet by
// asking the AI. This is the PF2 counterpart of the 5e SpellPicker/FeatPicker.
//
// Same contract as those, deliberately, so three systems behave the same way:
//   · ineligible entries are SHOWN, greyed, with the reason — hiding them makes the list look
//     arbitrary and leaves "why can't I take this?" unanswered
//   · a vanilla character is hard-blocked; a custom one gets "＋ Anyway"
//   · the DM is never blocked
//
// The server gate is the real enforcement (pf2-edit runs `gatePf2Edit` regardless of what this
// sends). This exists so a player learns at pick-time rather than at save-time.
import { useMemo, useState } from 'react';
import type { PF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import { PF2_ALL_FEATS, PF2_ALL_SPELLS, PF2_CATALOG_STATUS } from '@/lib/dnd/systems/pathfinder2e/data';
import { pf2FeatEligibility, pf2SpellEligibility } from '@/lib/dnd/systems/pathfinder2e/eligibility';
import { pf2ContextFor } from '@/lib/dnd/systems/pathfinder2e/rules-gate';

type Kind = 'feat' | 'spell';

export default function PF2ContentPicker({
  pf2, kind, isDM, variantKind = 'vanilla', onAdd, onClose,
}: {
  pf2: PF2Character;
  kind: Kind;
  isDM?: boolean;
  /** Vanilla characters are held to their class and level; custom ones are flagged, not blocked. */
  variantKind?: 'vanilla' | 'custom';
  onAdd: (edit: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const ctx = useMemo(() => pf2ContextFor(pf2), [pf2]);
  const isVanilla = variantKind === 'vanilla';

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (kind === 'feat') {
      return PF2_ALL_FEATS
        .filter((f) => !needle || f.name.toLowerCase().includes(needle) || f.effect.toLowerCase().includes(needle))
        .map((f) => ({
          key: f.name,
          name: f.name,
          meta: `Level ${f.level} · ${f.track}${f.className ? ` · ${f.className}` : ''}`,
          body: f.effect,
          elig: pf2FeatEligibility(f, ctx),
          edit: { op: 'add_feat', name: f.name, level: f.level, track: f.track },
        }))
        // Eligible first, so the list opens on what the character can actually take.
        .sort((a, b) => Number(b.elig.ok) - Number(a.elig.ok) || a.name.localeCompare(b.name))
        .slice(0, 80);
    }
    return PF2_ALL_SPELLS
      .filter((s) => !needle || s.name.toLowerCase().includes(needle) || s.effect.toLowerCase().includes(needle))
      .map((s) => ({
        key: s.name,
        name: s.name,
        meta: `${s.rank === 0 ? 'cantrip' : `rank ${s.rank}`}${s.focus ? ' · focus' : ''}${s.traditions.length ? ` · ${s.traditions.join('/')}` : ''}`,
        body: s.effect,
        elig: pf2SpellEligibility(s, ctx),
        edit: { op: 'add_spell', name: s.name, rank: s.rank, ...(s.focus ? { focus: true } : {}) },
      }))
      .sort((a, b) => Number(b.elig.ok) - Number(a.elig.ok) || a.name.localeCompare(b.name))
      .slice(0, 80);
  }, [kind, q, ctx]);

  const status = kind === 'feat' ? PF2_CATALOG_STATUS.feats : PF2_CATALOG_STATUS.spells;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(2,4,10,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(720px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--hx-bg, #0a1018)', border: '1px solid var(--hx-line)', borderRadius: 12, overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--hx-line)' }}>
          <strong style={{ flex: 1, color: 'var(--hx-text)' }}>
            {isDM ? `Grant a ${kind}` : `Add a ${kind} from the library`}
          </strong>
          <button className="btn tiny" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {isDM && (
          <div style={{ padding: '6px 14px', fontSize: 11.5, color: 'var(--hx-muted)', borderBottom: '1px solid var(--hx-line)' }}>
            Anything you grant lands immediately — off-level and off-tradition picks are allowed on
            purpose, and arrive marked as granted.
          </div>
        )}

        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--hx-line)' }}>
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${kind}s…`}
            style={{ width: '100%', padding: '6px 10px', fontSize: 13, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', borderRadius: 8, color: 'var(--hx-text)' }}
          />
        </div>

        <div style={{ overflowY: 'auto', padding: '8px 14px 14px' }}>
          {rows.length === 0 && (
            <p style={{ color: 'var(--hx-muted)', fontSize: 13, margin: '12px 0' }}>
              Nothing matches that search.
            </p>
          )}
          {rows.map((r) => {
            // The DM is never blocked — granting off-curve content is a legitimate DM act.
            const blocked = isVanilla && !r.elig.ok && !isDM;
            return (
              <div key={r.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--hx-line)', opacity: r.elig.ok ? 1 : 0.65 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--hx-text)' }}>
                    {r.name}{' '}
                    <span style={{ fontWeight: 400, color: 'var(--hx-muted)', fontSize: 12 }}>{r.meta}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--hx-muted)', marginTop: 2 }}>{r.body}</div>
                  {!r.elig.ok && (
                    <div style={{ fontSize: 11.5, color: blocked ? 'var(--hx-danger)' : '#e0a020', marginTop: 3 }}>
                      {blocked ? '✕' : '⚠'} {r.elig.reason}
                    </div>
                  )}
                </div>
                <button
                  className={`btn tiny ${r.elig.ok && !blocked ? 'solid' : ''}`}
                  disabled={blocked}
                  onClick={() => { if (!blocked) onAdd(r.edit); }}
                  title={
                    blocked ? `Not available: ${r.elig.reason} (this is a vanilla character — build a custom one to take it anyway)`
                      : r.elig.ok ? `Add ${r.name}`
                        : `Off-rules: ${r.elig.reason} — allowed because this character is custom`
                  }
                  style={blocked ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                >
                  {blocked ? '✕ Blocked' : r.elig.ok ? '＋ Add' : '＋ Anyway'}
                </button>
              </div>
            );
          })}
        </div>

        {/* The catalog knows it is partial; say so rather than letting a missing entry read as
            "Pathfinder has no such spell". */}
        {!status.complete && (
          <div style={{ padding: '8px 14px', borderTop: '1px solid var(--hx-line)', fontSize: 11.5, color: 'var(--hx-muted)' }}>
            {status.count} {kind}s catalogued so far — not the full list yet.
          </div>
        )}
      </div>
    </div>
  );
}
