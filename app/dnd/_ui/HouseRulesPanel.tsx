// app/dnd/_ui/HouseRulesPanel.tsx — the player-facing view of a campaign's active house rules (Area P3
// scaffold). The DM sets these on the campaign preferences panel (P4); they're resolved for this player and
// fed to the sheet (P2c). This surfaces them read-only so a player can SEE the rules in force and which ones
// the DM has locked (🔒). When per-player overrides land (P2b), the unlocked rows here become editable.
import type { EffectivePreferences } from '@/lib/dnd/preferences';

// Human labels for each stored value, shared in spirit with the DM panel's option lists.
const VALUE_LABEL: Record<string, string> = {
  // exhaustion
  vanilla: 'Vanilla (rules-as-written)',
  'flat-2-per-level': '−2 to every d20 test per level',
  // long rest
  'half-hit-dice': 'Half hit dice (2014 RAW)',
  gritty: 'Gritty realism (7-day rest)',
  epic: 'Epic (long rest = short rest)',
  // equip
  enforced: 'Enforced',
  off: 'Off',
  // dice styles
  futuristic: 'Futuristic',
  rugged: 'Rugged',
  natural: 'Natural',
  fantasy: 'Fantasy',
  medieval: 'Medieval',
  // record mode
  auto: 'Auto (roller applies effects)',
  manual: 'Manual roll input',
  irl: 'Record IRL rolls',
};

const label = (v: string | boolean): string =>
  typeof v === 'boolean' ? (v ? 'On' : 'Off') : (VALUE_LABEL[v] ?? v);

const ROWS: { key: keyof EffectivePreferences; name: string }[] = [
  { key: 'autoMechanics', name: 'Auto-apply mechanics' },
  { key: 'exhaustionModel', name: 'Exhaustion model' },
  { key: 'longRestModel', name: 'Long-rest model' },
  { key: 'equipLimits', name: 'Equipment limits' },
  { key: 'diceRollerStyle', name: 'Dice roller style' },
  { key: 'recordMode', name: 'Roll recording' },
];

export default function HouseRulesPanel({ preferences }: { preferences: EffectivePreferences }) {
  return (
    <section className="framedPanel" style={{ border: '1px solid var(--hx-line)', padding: '12px 14px', display: 'grid', gap: 8 }}>
      <div>
        <strong style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>◆ Campaign house rules</strong>
        <div style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
          The rules in force for this campaign. A 🔒 means your DM has locked it for everyone.
        </div>
      </div>
      <dl style={{ display: 'grid', gap: 6, margin: 0 }}>
        {ROWS.map(({ key, name }) => {
          const pref = preferences[key];
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, borderTop: '1px solid var(--hx-line)', paddingTop: 6 }}>
              <dt style={{ fontSize: 12, color: 'var(--hx-teal-1)' }}>{name}</dt>
              <dd style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-text)', textAlign: 'right' }}>
                {label(pref.value)}
                {pref.lockedByDM && <span title="Locked by your DM" style={{ marginLeft: 6, color: 'var(--hx-gold-2)' }}>🔒</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
