// app/dnd/content/[id] — read one piece of custom content (P6-5).
//
// Visibility-gated through the SAME pure helper the API uses (`canReadHomebrew`), so a link that works in
// one place cannot 404 in the other. A piece the viewer may not see returns `notFound()` rather than a 403:
// a private piece should not confirm its own existence to someone walking ids.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import styles from '@/app/dnd/_ui/hextech.module.css';
import { homebrewKindLabel } from '@/lib/dnd/homebrew/model';
import { rowToHomebrew, canReadHomebrew, canWriteHomebrew, type HomebrewRow } from '@/lib/dnd/homebrew/store';
import { kindSpec, kindIsMechanicalIn, fieldsForKind } from '@/lib/dnd/homebrew/kinds';
import {
  normalizeStatblock, isStatblockEmpty, abilityModifier, formatModifier,
  STATBLOCK_ABILITIES, ABILITY_LABELS,
} from '@/lib/dnd/homebrew/statblock';
import { systemLabel, normalizeSystem } from '@/lib/dnd/systems';

export const dynamic = 'force-dynamic';

/** The descriptive statblock rows the `creature` spec collects as their own fields. Printed inside the
 *  statblock so it reads as one block, while staying stored separately — one place to change each fact. */
const DESCRIPTIVE_ROWS: [string, string][] = [
  ['senses', 'Senses'],
  ['languages', 'Languages'],
  ['resistances', 'Resistances & immunities'],
];

async function load(id: string) {
  const { data } = await supabaseAdmin.from('dnd_homebrew').select('*').eq('id', id).maybeSingle();
  const row = data as HomebrewRow | null;
  if (!row) return null;
  const { data: u } = await supabaseAdmin.from('dnd_users').select('display_name').eq('id', row.owner_user_id).maybeSingle();
  return rowToHomebrew(row, (u as { display_name?: string } | null)?.display_name ?? '');
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const piece = await load(params.id);
  // Metadata leaks to anyone who can request the URL, so it must respect the same gate the page does —
  // an unreadable piece gets a generic title rather than advertising its name in a browser tab or a
  // link preview.
  const session = getDndSession();
  if (!piece || !canReadHomebrew(piece, { userId: session?.userId ?? null })) {
    return { title: 'Custom Content | Starr Tabletop' };
  }
  return { title: `${piece.name} | Starr Tabletop` };
}

export default async function ContentDetailPage({ params }: { params: { id: string } }) {
  const session = getDndSession();
  const viewer = { userId: session?.userId ?? null };
  const piece = await load(params.id);
  if (!piece || !canReadHomebrew(piece, viewer)) notFound();

  const spec = kindSpec(piece.kind);
  const mine = canWriteHomebrew(piece, viewer);

  // The saved field values. `payload` is the kind's own shape, so everything below reads from the KIND SPEC
  // rather than naming creature fields — a new list field on any kind renders here with no change.
  const payload = (piece.payload && typeof piece.payload === 'object' ? piece.payload : {}) as Record<string, unknown>;
  const statblock = normalizeStatblock(payload.statblock);
  const listSections = fieldsForKind(piece.kind)
    .filter((f) => f.type === 'list')
    .map((f) => ({
      key: f.key,
      label: f.label,
      rows: (Array.isArray(payload[f.key]) ? payload[f.key] : []) as Record<string, unknown>[],
    }))
    .filter((s) => s.rows.length > 0);
  const scope = piece.system === 'any' ? 'Any system' : systemLabel(normalizeSystem(piece.system));
  const mechanical = piece.system !== 'any' && kindIsMechanicalIn(piece.kind, piece.system);

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 820, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div>
            <Link className={styles.hexBtn} href="/dnd/content" style={{ marginBottom: 10 }}>← Custom Content</Link>
            <span style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--hx-teal-1)', marginTop: 8 }}>
              {spec.icon} {homebrewKindLabel(piece.kind)} · {scope}
            </span>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '4px 0 0' }}>{piece.name}</h1>
            <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0', fontSize: 13 }}>
              by {piece.creator.name}
              {piece.partialToLevel != null && (
                <span style={{ color: 'var(--hx-gold-2)' }}> · partial build — written to level {piece.partialToLevel}</span>
              )}
              {mine && piece.visibility !== 'public' && <span> · {piece.visibility}</span>}
            </p>
          </div>

          {piece.imageUrl && (
            <div className={styles.framedPanel} style={{ padding: 6 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={piece.imageUrl} alt={piece.name} style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 420, objectFit: 'contain', borderRadius: 3 }} />
            </div>
          )}

          {piece.summary && (
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--hx-text)' }}>{piece.summary}</p>
          )}

          {/* The statblock, when the piece has one (P6-13). Rendered from the same normalizer the editor
              uses, and omitted entirely when empty — a grid of dashes reads as a BROKEN statblock rather
              than an unfinished one. */}
          {!isStatblockEmpty(statblock) && (
            <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 10 }}>
              <div className={styles.framedPanelTop} />
              <h2 className={styles.panelTitle} style={{ marginTop: 0 }}>Statblock</h2>

              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--hx-text)' }}>
                {statblock.ac !== undefined && (
                  <span><strong style={{ color: 'var(--hx-gold-2)' }}>AC</strong> {statblock.ac}{statblock.acNote ? ` (${statblock.acNote})` : ''}</span>
                )}
                {statblock.hp !== undefined && (
                  <span><strong style={{ color: 'var(--hx-gold-2)' }}>HP</strong> {statblock.hp}{statblock.hitDice ? ` (${statblock.hitDice})` : ''}</span>
                )}
                {statblock.speed && <span><strong style={{ color: 'var(--hx-gold-2)' }}>Speed</strong> {statblock.speed}</span>}
                {statblock.proficiencyBonus !== undefined && (
                  <span><strong style={{ color: 'var(--hx-gold-2)' }}>Prof.</strong> {formatModifier(statblock.proficiencyBonus)}</span>
                )}
              </div>

              {statblock.abilities && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, textAlign: 'center', borderTop: '1px solid var(--hx-line)', borderBottom: '1px solid var(--hx-line)', padding: '9px 0' }}>
                  {STATBLOCK_ABILITIES.map((a) => {
                    const score = statblock.abilities?.[a];
                    return (
                      <div key={a}>
                        <div style={{ fontSize: 10.5, letterSpacing: '0.1em', color: 'var(--hx-gold-2)' }}>{ABILITY_LABELS[a]}</div>
                        <div style={{ fontSize: 15, color: 'var(--hx-text)' }}>
                          {score ?? '—'}
                          {score != null && (
                            <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}> ({formatModifier(abilityModifier(score))})</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {(statblock.saves || statblock.skills) && (
                <div style={{ display: 'grid', gap: 3, fontSize: 13, color: 'var(--hx-text)' }}>
                  {statblock.saves && <span><strong style={{ color: 'var(--hx-gold-2)' }}>Saving throws</strong> {statblock.saves}</span>}
                  {statblock.skills && <span><strong style={{ color: 'var(--hx-gold-2)' }}>Skills</strong> {statblock.skills}</span>}
                </div>
              )}

              {/* The descriptive rows the creature spec collects as their own fields — rendered here so the
                  statblock reads as one block, but stored separately so there is one place to change each. */}
              {DESCRIPTIVE_ROWS.map(([key, lbl]) => {
                const raw = payload[key];
                const text = Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw : '';
                return text ? (
                  <div key={key} style={{ fontSize: 13, color: 'var(--hx-text)' }}>
                    <strong style={{ color: 'var(--hx-gold-2)' }}>{lbl}</strong> {text}
                  </div>
                ) : null;
              })}
            </section>
          )}

          {/* Repeating groups (traits, actions, reactions, legendary actions, species traits, lineages…) —
              rendered generically from the KIND's own `list` fields, so a new list field on any kind prints
              here with no change to this page. */}
          {listSections.map(({ key, label, rows }) => (
            <section key={key} className={styles.framedPanel} style={{ padding: '14px 16px' }}>
              <div className={styles.framedPanelTop} />
              <h2 className={styles.panelTitle} style={{ marginTop: 0 }}>{label}</h2>
              <div style={{ display: 'grid', gap: 10 }}>
                {rows.map((row, i) => (
                  <div key={i} style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--hx-text)' }}>
                    <strong style={{ color: 'var(--hx-gold-2)' }}>{String(row.name ?? `#${i + 1}`)}</strong>
                    {row.cost ? <span style={{ color: 'var(--hx-teal-1)', fontSize: 12 }}> · {String(row.cost)}</span> : null}
                    {row.trigger ? <span style={{ color: 'var(--hx-muted)', fontSize: 12 }}> · Trigger: {String(row.trigger)}</span> : null}
                    {row.attack ? <span style={{ color: 'var(--hx-muted)', fontSize: 12 }}> · {String(row.attack)} to hit</span> : null}
                    {row.damage ? <span style={{ color: 'var(--hx-muted)', fontSize: 12 }}> · {String(row.damage)}</span> : null}
                    {row.body ? <div style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{String(row.body)}</div> : null}
                  </div>
                ))}
              </div>
            </section>
          ))}

          <section className={styles.framedPanel} style={{ padding: '14px 16px' }}>
            <div className={styles.framedPanelTop} />
            <h2 className={styles.panelTitle} style={{ marginTop: 0 }}>Rules</h2>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.65, color: 'var(--hx-text)' }}>
              {piece.description || 'No rules text yet.'}
            </div>
          </section>

          {(piece.tags?.length ?? 0) > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {piece.tags!.map((t) => (
                <span key={t} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 999, border: '1px solid var(--hx-line)', color: 'var(--hx-muted)' }}>{t}</span>
              ))}
            </div>
          )}

          {/* Say plainly whether this resolves as numbers on a sheet or is rules text. A reader deciding
              whether to use it needs to know which, and guessing from the presence of a payload is exactly
              the kind of inference that goes wrong quietly. */}
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.55 }}>
            {mechanical
              ? 'This kind carries real mechanics in this system, so it can be applied to a character sheet once adoption ships.'
              : 'This is written as rules text — read it, share it, and apply it at the table by hand.'}
            {' '}Whether it is legal in a given campaign is the DM’s call.
          </p>

          {mine && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link className={styles.hexBtn} href={`/dnd/content/new?kind=${piece.kind}&system=${piece.system}`} style={{ textDecoration: 'none' }}>
                ＋ Make another {homebrewKindLabel(piece.kind).toLowerCase()}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
