// app/dnd/_ui/CampaignPreferencesDm.tsx — the DM's comprehensive campaign preferences panel (Area P4).
// The owner: a DM page that "totally controls a campaign." Every configurable mechanic is here, each with a
// value AND a "players may choose" lock — when the DM unticks the lock, every player in the campaign uses the
// DM's value (resolvePreferences enforces this server-agnostically). Persists to the campaign's `theme` jsonb
// via PATCH /api/dnd/campaigns/[id] (DM-only, enforced by the route). Vanilla is the default everywhere.
'use client';

import { useState } from 'react';
import styles from './hextech.module.css';
import {
  type CampaignPreferences,
  DEFAULT_CAMPAIGN_PREFERENCES,
} from '@/lib/dnd/preferences';

// Field metadata drives the whole panel, so adding a future setting is one entry here + one in preferences.ts.
type EnumField = 'exhaustionModel' | 'longRestModel' | 'equipLimits' | 'diceRollerStyle' | 'recordMode';

const ENUM_OPTIONS: Record<EnumField, { value: string; label: string }[]> = {
  exhaustionModel: [
    { value: 'vanilla', label: 'Vanilla (rules-as-written)' },
    { value: 'flat-2-per-level', label: '−2 to every d20 test per level' },
  ],
  longRestModel: [
    { value: 'vanilla', label: 'Vanilla (full restore)' },
    { value: 'half-hit-dice', label: 'Half hit dice (2014 RAW)' },
    { value: 'gritty', label: 'Gritty realism (long rest = 7 days)' },
    { value: 'epic', label: 'Epic (long rest = a short rest)' },
  ],
  equipLimits: [
    { value: 'enforced', label: 'Enforced (one armor, one shield, no 2H + shield)' },
    { value: 'off', label: 'Off (no equipment limits)' },
  ],
  diceRollerStyle: [
    { value: 'futuristic', label: 'Futuristic' },
    { value: 'rugged', label: 'Rugged' },
    { value: 'natural', label: 'Natural' },
    { value: 'fantasy', label: 'Fantasy' },
    { value: 'medieval', label: 'Medieval' },
  ],
  recordMode: [
    { value: 'auto', label: 'Auto (roller applies effects)' },
    { value: 'manual', label: 'Manual roll input' },
    { value: 'irl', label: 'Record IRL rolls' },
  ],
};

const ENUM_HELP: Record<EnumField, string> = {
  exhaustionModel: 'How exhaustion penalties are applied.',
  longRestModel: 'How much a long rest restores.',
  equipLimits: 'Whether the one-armor / one-shield equip rules are enforced.',
  diceRollerStyle: 'The look of the in-app dice roller.',
  recordMode: 'How rolls are entered: the roller applies effects, you type a total, or you record a real-life roll.',
};

const ENUM_ORDER: EnumField[] = ['exhaustionModel', 'longRestModel', 'equipLimits', 'diceRollerStyle', 'recordMode'];

/** A "players may choose" lock: unticked → the DM's value is forced on every player (locked). */
function LockToggle({ playerCanChoose, disabled, onChange }: { playerCanChoose: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: playerCanChoose ? 'var(--hx-teal-1)' : 'var(--hx-gold-2)', cursor: disabled ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
      <input type="checkbox" checked={playerCanChoose} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {playerCanChoose ? 'Players may choose' : '🔒 Locked to this'}
    </label>
  );
}

export default function CampaignPreferencesDm({ campaignId, initialPreferences }: { campaignId: string; initialPreferences?: CampaignPreferences }) {
  const [prefs, setPrefs] = useState<CampaignPreferences>(initialPreferences ?? DEFAULT_CAMPAIGN_PREFERENCES);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(next: CampaignPreferences) {
    const prev = prefs;
    setPrefs(next); // optimistic
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/dnd/campaigns/${campaignId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preferences: next }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setPrefs(prev); // roll back on failure
        setMsg(j.error ?? 'Could not save preferences.');
        return;
      }
      const j = await r.json().catch(() => ({}));
      if (j.preferences) setPrefs(j.preferences as CampaignPreferences); // trust the server's normalized copy
      setMsg('Saved.');
    } catch {
      setPrefs(prev);
      setMsg('Network error.');
    } finally {
      setBusy(false);
    }
  }

  const rowStyle: React.CSSProperties = { display: 'grid', gap: 6, padding: '10px 0', borderTop: '1px solid var(--hx-line)' };
  const headStyle: React.CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' };

  return (
    <section className={styles.framedPanel}>
      <div className={styles.framedPanelTop} />
      <h2 className={styles.panelTitle} style={{ margin: 0 }}>◆ Campaign preferences</h2>
      <p style={{ fontSize: 12.5, color: 'var(--hx-muted)', margin: '4px 0 6px' }}>
        The house rules for this campaign. Everything defaults to the <strong>vanilla</strong> rules; change a
        setting to swap in a popular alternative. Untick “Players may choose” to <strong>lock</strong> a setting —
        every player then uses your value.
      </p>

      {/* Auto-apply mechanics (boolean) */}
      <div style={rowStyle}>
        <div style={headStyle}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--hx-text)', cursor: busy ? 'wait' : 'pointer' }}>
            <input
              type="checkbox"
              checked={prefs.autoMechanics.value}
              disabled={busy}
              onChange={(e) => save({ ...prefs, autoMechanics: { ...prefs.autoMechanics, value: e.target.checked } })}
            />
            <strong style={{ color: 'var(--hx-gold-2)' }}>Auto-apply mechanics</strong>
          </label>
          <LockToggle
            playerCanChoose={prefs.autoMechanics.playerCanChoose}
            disabled={busy}
            onChange={(v) => save({ ...prefs, autoMechanics: { ...prefs.autoMechanics, playerCanChoose: v } })}
          />
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>When on, the roller applies a roll’s effects to the sheet automatically. When off, rolls are recorded but nothing changes on its own.</div>
      </div>

      {/* Enum settings */}
      {ENUM_ORDER.map((field) => {
        const setting = prefs[field];
        return (
          <div key={field} style={rowStyle}>
            <div style={headStyle}>
              <strong style={{ color: 'var(--hx-gold-2)', fontSize: 13.5 }}>{field === 'exhaustionModel' ? 'Exhaustion model' : field === 'longRestModel' ? 'Long-rest model' : field === 'equipLimits' ? 'Equipment limits' : field === 'diceRollerStyle' ? 'Dice roller style' : 'Roll recording mode'}</strong>
              <LockToggle
                playerCanChoose={setting.playerCanChoose}
                disabled={busy}
                onChange={(v) => save({ ...prefs, [field]: { ...setting, playerCanChoose: v } })}
              />
            </div>
            <select
              value={setting.value}
              disabled={busy}
              onChange={(e) => save({ ...prefs, [field]: { ...setting, value: e.target.value } })}
              style={{ fontSize: 13, padding: '6px 8px', background: 'rgba(1,10,19,0.6)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 4, maxWidth: 420 }}
            >
              {ENUM_OPTIONS[field].map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <div style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>{ENUM_HELP[field]}</div>
          </div>
        );
      })}

      {msg && <div style={{ fontSize: 12, color: 'var(--hx-muted)', marginTop: 8 }}>{msg}</div>}
    </section>
  );
}
