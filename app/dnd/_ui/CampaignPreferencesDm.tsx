// app/dnd/_ui/CampaignPreferencesDm.tsx — the DM's comprehensive campaign preferences panel (Area P4).
// The owner: a DM page that "totally controls a campaign." Every configurable mechanic is here, each with a
// value AND a "players may choose" lock — when the DM unticks the lock, every player in the campaign uses the
// DM's value (resolvePreferences enforces this server-agnostically). Persists to the campaign's `theme` jsonb
// via PATCH /api/dnd/campaigns/[id] (DM-only, enforced by the route). Vanilla is the default everywhere.
'use client';

import { useState } from 'react';
import styles from './hextech.module.css';
import Tip from './Tip';
import {
  type CampaignPreferences,
  DEFAULT_CAMPAIGN_PREFERENCES,
} from '@/lib/dnd/preferences';
// The field metadata (options, help, order) now lives in ONE shared catalog so this DM panel and the
// per-character settings modal can never drift (settings S-3). Adding a setting is one entry there.
import {
  ENUM_OPTIONS, ENUM_HELP, ENUM_ORDER, BOOL_LABEL, BOOL_HELP, BOOL_ORDER,
  type EnumPrefField as EnumField, type BoolPrefField as BoolField,
} from '@/lib/dnd/preference-options';

/** A small info dot — the "little more-info icon" next to any setting that has options.
 *
 *  It was a native `title` until CX-11, which is exactly the marker the owner reported as telling
 *  them nothing on hover: `title` needs a second of steady mouse-hover and never fires on touch.
 *  It is now a Tip (hover, focus, tap, Escape), and the copy says what the ? is FOR — every dot in
 *  this panel sits on a setting the DM is about to impose on other people's sheets, so the reach of
 *  the choice matters as much as the choice itself. */
function InfoDot({ tip }: { tip: string }) {
  return (
    <Tip
      glyph="?"
      title="What this setting does"
      label="what this setting does"
      tip={`${tip} This is a campaign-wide choice: leave “players may choose” ticked and a player can still set it differently on their own sheet; untick it and your value is locked for everyone at the table.`}
      triggerStyle={{ marginLeft: 6, color: 'var(--hx-muted)' }}
    />
  );
}

const ENUM_TITLE: Record<EnumField, string> = {
  exhaustionModel: 'Exhaustion model',
  longRestModel: 'Long-rest model',
  equipLimits: 'Equipment limits',
  diceRollerStyle: 'Dice roller style',
  recordMode: 'Roll recording mode',
  shapeshiftStats: 'Shape-shift ability scores',
  downedDamageModel: 'Damage while dying (PF2)',
};

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

      {/* Boolean settings (auto-apply mechanics / auto-attune / auto-apply feat bonuses) */}
      {BOOL_ORDER.map((field) => {
        const setting = prefs[field];
        return (
          <div key={field} style={rowStyle}>
            <div style={headStyle}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--hx-text)', cursor: busy ? 'wait' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={setting.value}
                  disabled={busy}
                  onChange={(e) => save({ ...prefs, [field]: { ...setting, value: e.target.checked } })}
                />
                <strong style={{ color: 'var(--hx-gold-2)' }}>{BOOL_LABEL[field]}</strong>
                <InfoDot tip={BOOL_HELP[field]} />
              </label>
              <LockToggle
                playerCanChoose={setting.playerCanChoose}
                disabled={busy}
                onChange={(v) => save({ ...prefs, [field]: { ...setting, playerCanChoose: v } })}
              />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>{BOOL_HELP[field]}</div>
          </div>
        );
      })}

      {/* Enum settings */}
      {ENUM_ORDER.map((field) => {
        const setting = prefs[field];
        return (
          <div key={field} style={rowStyle}>
            <div style={headStyle}>
              <strong style={{ color: 'var(--hx-gold-2)', fontSize: 13.5 }}>{ENUM_TITLE[field]}<InfoDot tip={ENUM_HELP[field]} /></strong>
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
