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
import { kindSpec, kindIsMechanicalIn } from '@/lib/dnd/homebrew/kinds';
import { systemLabel, normalizeSystem } from '@/lib/dnd/systems';

export const dynamic = 'force-dynamic';

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
