// app/dnd/_ui/BuilderHelp.tsx — the "how character building works" onboarding (Slice 9).
//
// A collapsible walkthrough at the top of the new-character form so a first-time user
// understands the whole flow before filling anything in: pick a system + mode, upload
// what they have, the AI builds a grounded sheet, open questions get resolved, then they
// pick or generate a look and refine live with the edit chat.
'use client';

import { useState } from 'react';
import styles from './hextech.module.css';

const STEPS: { n: string; title: string; body: string }[] = [
  { n: '1', title: 'Choose a system', body: 'Pick a ruleset (Pathfinder, D&D 5e 2014/2024, …) or stay system-ambiguous. The AI builds using ONLY that system’s rules — never mixing systems or inventing mechanics.' },
  { n: '2', title: 'Pick a build mode', body: 'Ruthless builds it all now, Questioning asks about gaps and conflicts, Step-by-step guides you field by field. You can change your mind later.' },
  { n: '3', title: 'Upload what you have', body: 'PDFs, sheets, screenshots, and notes. They’re stored privately with your character; the AI reads them to fill the sheet, and anything it can’t map is saved so nothing is lost.' },
  { n: '4', title: 'The AI builds your sheet', body: 'It fills stats, feats, abilities, mechanics, attacks, spells and gear — grounded in your system. If it’s confused or two sources disagree, it asks you instead of guessing.' },
  { n: '5', title: 'Choose or generate a look', body: 'Browse ready-made sheet styles (they all work with every system) or let the AI compose a fully custom sheet from building blocks.' },
  { n: '6', title: 'Refine live with AI', body: 'The bottom-right assistant applies any change you ask for — new feats, abilities, transformations, spells, or styling — live, and only ever to this one character.' },
];

export default function BuilderHelp() {
  const [open, setOpen] = useState(false);
  return (
    <section className={styles.framedPanel} style={{ padding: '12px 14px' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={styles.hexBtn}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>◆ How character building works</span>
        <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{open ? 'Hide' : 'Show me'}</span>
      </button>
      {open && (
        <ol style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 10 }}>
          {STEPS.map((s) => (
            <li key={s.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span
                aria-hidden
                style={{
                  flex: '0 0 auto', width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center',
                  fontSize: 12, fontWeight: 700, color: 'var(--hx-navy-0, #010a13)', background: 'var(--hx-gold-2, #f0e6d2)',
                }}
              >
                {s.n}
              </span>
              <span>
                <strong style={{ fontSize: 13, color: 'var(--hx-text)' }}>{s.title}</strong>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--hx-muted)', lineHeight: 1.45 }}>{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
