// MyContentStrip — the creator's own custom content, on the lobby (P6-11, the half P6-10 left owed).
//
// A server component that queries directly, for the same reasons the browse page does: no client JS, no
// loading flash, and it renders on first paint. It shows the SIX most recently touched pieces — enough to
// recognise what you were last working on, few enough that it stays a strip rather than becoming a second
// browse page. "See all" goes to the real one.
//
// Renders NOTHING when the user has authored nothing. An empty section with a "you have no content" line is
// noise on a lobby that already has a Content Builder button three inches above it — the button is the call
// to action, and repeating it as an empty state would just make the page longer.
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import styles from './hextech.module.css';
import { homebrewKindLabel, isHomebrewKind } from '@/lib/dnd/homebrew/model';
import { normalizeVisibility } from '@/lib/dnd/homebrew/store';

interface Row {
  id: string;
  name: string;
  kind: string;
  visibility: string | null;
  image_url: string | null;
  partial_to_level: number | null;
}

export default async function MyContentStrip({ userId }: { userId: string }) {
  const { data } = await supabaseAdmin
    .from('dnd_homebrew')
    .select('id, name, kind, visibility, image_url, partial_to_level')
    .eq('owner_user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(6);

  const rows = ((data ?? []) as Row[]).filter((r) => isHomebrewKind(r.kind));
  if (!rows.length) return null;

  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <h2 className={styles.panelTitle} style={{ margin: 0, fontSize: 13 }}>🔨 Your custom content</h2>
        <Link href="/dnd/content?tab=mine" style={{ fontSize: 12, color: 'var(--hx-teal-1)', textDecoration: 'none' }}>
          See all →
        </Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        {rows.map((r) => {
          const visibility = normalizeVisibility(r.visibility);
          return (
            <Link
              key={r.id}
              href={`/dnd/content/${r.id}`}
              className={styles.framedPanel}
              style={{ textDecoration: 'none', color: 'inherit', padding: '10px 12px', display: 'grid', gap: 4, alignContent: 'start' }}
            >
              {r.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.image_url} alt="" style={{ width: '100%', height: 72, objectFit: 'cover', borderRadius: 3 }} />
              )}
              <span style={{ fontSize: 10, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--hx-teal-1)' }}>
                {homebrewKindLabel(r.kind as Parameters<typeof homebrewKindLabel>[0])}
              </span>
              <span style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', fontSize: 13.5, wordBreak: 'break-word' }}>
                {r.name}
              </span>
              <span style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>
                {/* Say "draft" rather than "private" for an unpublished piece: on your OWN work the useful
                    distinction is finished-and-shared vs still-being-worked-on, not the storage flag. */}
                {visibility === 'public' ? 'published' : visibility === 'unlisted' ? 'link only' : 'draft'}
                {r.partial_to_level != null && ` · to level ${r.partial_to_level}`}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
