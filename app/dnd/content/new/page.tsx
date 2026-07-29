// app/dnd/content/new — pick WHAT you are making, then build it (P6-6).
//
// Two steps, in the order the owner specified: *"the user should first select what kind of thing they are
// homebrewing … as well as the system … Then depending on what they choose, the building options will
// totally adjust."* With no `?kind=`, this is the picker; with one, it is the form.
//
// The picker is generated entirely from `lib/dnd/homebrew/kinds.ts` — groups, glyphs, blurbs and all — so a
// new buildable kind appears here the moment it is added to the registry, with no change to this file.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDndSession } from '@/lib/dnd/auth';
import styles from '@/app/dnd/_ui/hextech.module.css';
import ContentBuilder from '@/app/dnd/_ui/ContentBuilder';
import { isHomebrewKind, homebrewKindLabel } from '@/lib/dnd/homebrew/model';
import { KIND_GROUPS, kindsInGroup, kindIsMechanicalIn, normalizeContentSystem } from '@/lib/dnd/homebrew/kinds';
import { availableSystems } from '@/lib/dnd/systems';
import { dndAiConfigured } from '@/lib/dnd/ai';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Build custom content | Starr Tabletop' };

export default function NewContentPage({
  searchParams,
}: {
  searchParams: { kind?: string; system?: string };
}) {
  // Reading is open across /dnd; CREATING needs an account, the same boundary the header menu draws.
  const session = getDndSession();
  if (!session) redirect('/dnd');

  const systems = availableSystems().map((s) => ({ key: s.key, name: s.name }));
  const kind = searchParams.kind;

  if (isHomebrewKind(kind)) {
    const system = normalizeContentSystem(kind, searchParams.system ?? systems[0]?.key);
    return (
      <div className={styles.root}>
        <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
          <div style={{ width: '100%', maxWidth: 780, margin: '0 auto', display: 'grid', gap: 16 }}>
            <div>
              <Link className={styles.hexBtn} href="/dnd/content/new" style={{ marginBottom: 10 }}>← Pick something else</Link>
              <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>
                New {homebrewKindLabel(kind).toLowerCase()}
              </h1>
            </div>
            <ContentBuilder kind={kind} system={system} availableSystems={systems} aiConfigured={dndAiConfigured()} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>
          <div>
            <Link className={styles.hexBtn} href="/dnd/content" style={{ marginBottom: 10 }}>← Custom Content</Link>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>What are you making?</h1>
            <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0', maxWidth: 720 }}>
              Pick a kind and the form reshapes around it — a creature asks for a statblock, a class asks for
              a hit die and a feature at every level, an item asks what it does. You choose the system next.
            </p>
          </div>

          {KIND_GROUPS.map((group) => (
            <section key={group} className={styles.framedPanel} style={{ padding: '14px 16px' }}>
              <div className={styles.framedPanelTop} />
              <h2 className={styles.panelTitle} style={{ marginTop: 0 }}>{group}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginTop: 8 }}>
                {kindsInGroup(group).map((k) => {
                  // Say up front where a kind carries real mechanics. An author picking "class" deserves to
                  // know before they start that only the 5e editions will resolve it — not after saving.
                  const mechanical = systems.filter((s) => kindIsMechanicalIn(k.kind, s.key));
                  return (
                    <Link
                      key={k.kind}
                      href={`/dnd/content/new?kind=${k.kind}`}
                      style={{
                        display: 'grid', gap: 5, padding: '12px 14px', textDecoration: 'none', borderRadius: 3,
                        border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.45)', color: 'inherit',
                        alignContent: 'start',
                      }}
                    >
                      <strong style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', fontSize: 15 }}>
                        <span aria-hidden style={{ marginRight: 7, color: 'var(--hx-teal-1)' }}>{k.icon}</span>
                        {homebrewKindLabel(k.kind)}
                      </strong>
                      <span style={{ fontSize: 12.5, color: 'var(--hx-text)', opacity: 0.85, lineHeight: 1.5 }}>{k.blurb}</span>
                      <span style={{ fontSize: 11, color: 'var(--hx-muted)', marginTop: 2 }}>
                        {mechanical.length === systems.length
                          ? 'Full mechanics in every system'
                          : mechanical.length === 0
                            ? 'Written as rules text'
                            : `Full mechanics in ${mechanical.map((s) => s.name).join(', ')}`}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
