// HomebrewDesignerLinks — the door to the homebrew designers (P0-4).
//
// WHY THIS FILE EXISTS. `/dnd/characters/[id]/build/class`, `/build/subclass` and `/build/feat` are three
// complete, tested, working authoring pages that **nothing in the codebase linked to**. A repo-wide search
// for those paths returned only the three files' own header comments, so the flagship "author your own
// class" capability was reachable only by typing a URL — which is to say, not reachable. That was finding
// A-3 of the 2026-07-28 audit and the best value-per-hour item in it.
//
// It is a server component on purpose: three links and a system check need no client JavaScript, and the
// character page that renders it is already a server component holding the system.
//
// THE SYSTEM GATE IS NOT DECORATION. These designers emit the 5e shapes — `ClassDefinition` via
// `parseCustomClassDraft → buildCustomClass`, and `CustomFeat` — which `lib/dnd/classes/registry.ts` only
// resolves for the two 5e editions (`BY_SYSTEM` holds exactly those keys). A Pathfinder 2e or Intuitive
// Games character reaching the class designer would author something with a hit die and an ASI ladder that
// its own engine cannot consume: a form that saves and then does nothing, which is worse than an absent
// button. So those systems get an honest pointer at the Content Studio instead of a dead end.
//
// The pages themselves carry NO system guard (they never needed one while nothing linked to them). Wiring
// this link without gating it is what would turn a harmless orphan into a live trap, which is why the gate
// ships in the same slice as the link.
import Link from 'next/link';
import styles from './hextech.module.css';
import { isSharedEngineSystem, systemLabel } from '@/lib/dnd/systems';

interface Designer {
  href: string;
  glyph: string;
  title: string;
  blurb: string;
}

export default function HomebrewDesignerLinks({
  characterId,
  system,
}: {
  characterId: string;
  /** The character's system key. Decides whether the designers are offered or explained away. */
  system: string;
}) {
  const fiveE = isSharedEngineSystem(system);

  const designers: Designer[] = [
    {
      href: `/dnd/characters/${characterId}/build/class`,
      glyph: '✦',
      title: 'Design a class',
      blurb: 'Hit die, saves, proficiencies, spellcasting and a feature at every level. It levels through the same engine an official class does.',
    },
    {
      href: `/dnd/characters/${characterId}/build/subclass`,
      glyph: '✧',
      title: 'Design a subclass',
      blurb: 'A new path for an existing or homebrew class, with its features at the levels that class grants them.',
    },
    {
      href: `/dnd/characters/${characterId}/build/feat`,
      glyph: '◈',
      title: 'Design a feat',
      blurb: 'Category, prerequisite and rules text. It is then offered at this character’s ASI slots like any other feat.',
    },
  ];

  return (
    <div style={{ maxWidth: 960, margin: '12px auto 0', padding: '0 12px' }}>
      <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 10 }}>
        <div className={styles.framedPanelTop} />
        <div>
          <h2 className={styles.panelTitle} style={{ margin: 0, fontSize: 14 }}>Make your own content</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.55 }}>
            {fiveE
              ? 'Build a class, subclass or feat from scratch. Anything you author is flagged as custom, shows on the sheet with its mark, and needs your DM’s nod in a vanilla campaign — it is real content, not a note.'
              : `The class, subclass and feat designers produce ${systemLabel('dnd5e-2024')}-shaped content, which ${systemLabel(system)}’s rules engine cannot resolve — so they are not offered here rather than saving you something that would never take effect.`}
          </p>
        </div>

        {fiveE ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {designers.map((d) => (
              <Link
                key={d.href}
                href={d.href}
                style={{
                  display: 'grid', gap: 4, padding: '11px 13px', textDecoration: 'none', borderRadius: 3,
                  border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.42)', color: 'inherit',
                }}
              >
                <strong style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', fontSize: 14 }}>
                  <span aria-hidden style={{ marginRight: 6, color: 'var(--hx-teal-1)' }}>{d.glyph}</span>
                  {d.title}
                </strong>
                <span style={{ fontSize: 12, color: 'var(--hx-muted)', lineHeight: 1.5 }}>{d.blurb}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-text)', lineHeight: 1.55 }}>
            You can still add anything you like to this sheet through{' '}
            <strong style={{ color: 'var(--hx-gold-2)' }}>＋ Add a different …</strong> at any choice point,
            which takes content from anywhere in {systemLabel(system)} — or writes your own — and marks it on
            the sheet.
          </p>
        )}
      </section>
    </div>
  );
}
