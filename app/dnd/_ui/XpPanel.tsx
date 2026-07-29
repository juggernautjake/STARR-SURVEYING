// XpPanel — experience points, and the nudge toward levelling (P3-4, audit B-4).
//
// The finding was not only "no XP field". It was that **nothing in the product ever told a player it was
// time to level** — which matters because levelling is the moment the builders exist for, and the level
// walker had no route in from a sheet other than knowing it was there.
//
// So this is two things: a number you can set, and a link that appears when the number says you have earned
// a level. The second is the part that was actually missing.
//
// MILESTONE IS A FIRST-CLASS ANSWER, not a degraded one. Plenty of tables never touch XP, and Intuitive
// Games has no sourced table at all (Ground Rule 3). On those the panel explains itself in one line and
// offers no bar, rather than showing an empty gauge that implies someone forgot to fill it in.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './hextech.module.css';
import { xpProgress, xpRulesFor, normalizeXp } from '@/lib/dnd/xp';

export default function XpPanel({
  characterId,
  system,
  currentXp,
  currentLevel,
  canWrite,
}: {
  characterId: string;
  system: string;
  currentXp?: number | null;
  currentLevel: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [xp, setXp] = useState(normalizeXp(currentXp));
  const [draft, setDraft] = useState(String(normalizeXp(currentXp)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rules = xpRulesFor(system);
  const progress = xpProgress(system, xp, currentLevel);
  const milestone = rules.model === 'milestone';

  async function save() {
    const next = normalizeXp(draft);
    if (busy || next === xp) return;
    setBusy(true); setErr(null);
    try {
      // Goes through the ordinary sheet PATCH, so an XP change is audited and undoable exactly like any
      // other edit rather than getting its own privileged path.
      const r = await fetch(`/api/dnd/characters/${characterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xp: next }),
      });
      if (!r.ok) { setErr('Could not save that.'); return; }
      setXp(next);
      router.refresh();
    } catch {
      setErr('Network error — please try again.');
    } finally { setBusy(false); }
  }

  // The nudge. Only when the XP has genuinely outrun the sheet — never as a permanent "level up!" button,
  // which would train people to ignore it.
  const canLevel = !milestone && progress.level > currentLevel;

  return (
    <section className={styles.framedPanel} style={{ padding: '12px 16px', display: 'grid', gap: 8 }}>
      <div className={styles.framedPanelTop} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h2 className={styles.panelTitle} style={{ margin: 0, fontSize: 14 }}>Experience</h2>
        {!milestone && canWrite && (
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              className={styles.input}
              type="number"
              min={0}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Experience points"
              style={{ width: 110, padding: '5px 8px', fontSize: 12.5 }}
            />
            <button type="button" className={styles.hexBtn} onClick={save} disabled={busy || normalizeXp(draft) === xp}
              style={{ padding: '5px 12px', fontSize: 12 }}>
              {busy ? 'Saving…' : 'Set'}
            </button>
          </span>
        )}
      </div>

      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--hx-text)' }}>{progress.label}</p>

      {progress.fraction != null && (
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.round(progress.fraction * 100)}%`, height: '100%', background: 'var(--hx-teal-1)' }} />
        </div>
      )}

      {canLevel && (
        <Link
          href={`/dnd/characters/${characterId}/levels`}
          className={`${styles.hexBtn} ${styles.hexBtnPrimary}`}
          style={{ textDecoration: 'none', justifySelf: 'start', padding: '7px 15px', fontSize: 13 }}
        >
          ▲ You&apos;ve earned level {progress.level} — level up
        </Link>
      )}

      {err && <p style={{ margin: 0, fontSize: 12, color: 'var(--hx-danger, #ff6b6b)' }}>{err}</p>}
    </section>
  );
}
