'use client';
// app/dnd/_ui/PendingFeatsEditor.tsx — write a feat without leaving the class draft (P6-12b).
//
// The owner's ask: "they might even be able to homebrew custom feats while making the class to make those
// feats available at certain levels."
//
// NOTHING HERE IS SAVED. These live in the builder's state and become real pieces only after the class row
// exists — so the panel says so, plainly, rather than leaving the author to guess whether closing the tab
// loses their feat. It does, and that is the design: a feat written inside a draft shares the draft's fate.
import { useId } from 'react';
import styles from './hextech.module.css';
import {
  blankPendingFeat, featCategoryOptions, validatePendingFeats, type PendingFeat,
} from '@/lib/dnd/homebrew/inline-feats';

export default function PendingFeatsEditor({
  feats,
  nextLevel,
  onChange,
}: {
  feats: PendingFeat[];
  nextLevel: number;
  onChange: (next: PendingFeat[]) => void;
}) {
  const idBase = useId();
  const categories = featCategoryOptions();
  // Shown WHILE writing, not on save. A save that fails after the class was already created is the failure
  // this whole slice is arranged to avoid; a save that is blocked before it starts is just a form.
  const problems = validatePendingFeats(feats);

  const update = (id: string, patch: Partial<PendingFeat>) =>
    onChange(feats.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--hx-line)', paddingTop: 10 }}>
      <div style={{ fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.55 }}>
        Need a feat this class hands out? Write it here and it is created alongside the class, and added to
        the level you choose. <strong style={{ color: 'var(--hx-text)' }}>Nothing is saved until you save
        the class</strong> — close this without saving and these go with it.
      </div>

      {feats.map((feat) => (
        <div key={feat.id} style={{ border: '1px solid var(--hx-line)', borderRadius: 8, padding: '8px 10px', display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input className={styles.input} placeholder="Feat name" aria-label="Feat name"
              value={feat.name} onChange={(e) => update(feat.id, { name: e.target.value })}
              style={{ flex: '1 1 180px', minWidth: 0, padding: '5px 8px', fontSize: 12.5 }} />
            <input className={styles.input} type="number" min={1} max={20} aria-label="Level"
              value={feat.level} onChange={(e) => update(feat.id, { level: Number(e.target.value) || 1 })}
              style={{ width: 70, padding: '5px 8px', fontSize: 12.5 }} />
            <select className={styles.input} aria-label="Feat category" id={`${idBase}-${feat.id}-cat`}
              value={feat.category} onChange={(e) => update(feat.id, { category: e.target.value })}
              style={{ flex: '0 1 160px', padding: '5px 8px', fontSize: 12.5 }}>
              {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <input className={styles.input} placeholder="One line — what it does" aria-label="Feat summary"
            value={feat.summary} onChange={(e) => update(feat.id, { summary: e.target.value })}
            style={{ width: '100%', padding: '5px 8px', fontSize: 12.5 }} />
          <textarea className={styles.input} rows={3} placeholder="The full rules text." aria-label="Feat rules text"
            value={feat.description} onChange={(e) => update(feat.id, { description: e.target.value })}
            style={{ width: '100%', padding: '6px 8px', fontSize: 12.5, resize: 'vertical' }} />
          <div>
            <button type="button" className={styles.hexBtn} style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => onChange(feats.filter((f) => f.id !== feat.id))}>
              Remove
            </button>
          </div>
        </div>
      ))}

      {problems.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--hx-gold-2)' }}>
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      <button type="button" className={styles.hexBtn} style={{ padding: '6px 14px', fontSize: 12.5, justifySelf: 'start' }}
        onClick={() => onChange([...feats, blankPendingFeat(`${idBase}-${feats.length}-${nextLevel}`, nextLevel)])}>
        ＋ Write a feat for level {nextLevel}
      </button>
    </div>
  );
}
