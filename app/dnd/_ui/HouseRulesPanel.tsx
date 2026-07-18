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
  // shapeshift ability scores
  full: 'Full — form replaces scores (RAW)',
  partial: 'Partial — scores meet in the middle',
  none: 'None — forms don’t change scores',
  // downed-damage model (PF2)
  official: 'Official (damage raises Dying)',
};

const label = (v: string | boolean): string =>
  typeof v === 'boolean' ? (v ? 'On' : 'Off') : (VALUE_LABEL[v] ?? v);

// Each row's short "there are options for this" explainer, shown as a hover tooltip on an info dot.
const ROW_HELP: Partial<Record<keyof EffectivePreferences, string>> = {
  autoMechanics: 'When on, the roller folds a roll’s effects into the sheet automatically.',
  autoAttune: 'When on, an attunement item works as soon as it’s equipped — no separate attune step.',
  featAutoApply: 'When on, a feat’s ability-score increase applies itself.',
  exhaustionModel: 'How exhaustion penalties are applied.',
  longRestModel: 'How much a long rest restores (Vanilla = each system’s own rules).',
  equipLimits: 'Whether the one-armor / one-shield equip rules are enforced.',
  diceRollerStyle: 'The look of the in-app dice roller.',
  recordMode: 'How rolls are entered.',
  shapeshiftStats: 'What a shape-shift does to your ability scores.',
  downedDamageModel: 'PF2: whether damage while dying raises your Dying value.',
};

const ROWS: { key: keyof EffectivePreferences; name: string }[] = [
  { key: 'autoMechanics', name: 'Auto-apply mechanics' },
  { key: 'autoAttune', name: 'Auto-attune magic items' },
  { key: 'featAutoApply', name: 'Auto-apply feat bonuses' },
  { key: 'exhaustionModel', name: 'Exhaustion model' },
  { key: 'longRestModel', name: 'Long-rest model' },
  { key: 'equipLimits', name: 'Equipment limits' },
  { key: 'diceRollerStyle', name: 'Dice roller style' },
  { key: 'recordMode', name: 'Roll recording' },
  { key: 'shapeshiftStats', name: 'Shape-shift ability scores' },
  { key: 'downedDamageModel', name: 'Damage while dying (PF2)' },
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
              <dt style={{ fontSize: 12, color: 'var(--hx-teal-1)' }}>
                {name}
                {ROW_HELP[key] && (
                  <span title={ROW_HELP[key]} aria-label={ROW_HELP[key]} tabIndex={0} style={{ marginLeft: 5, fontSize: 10, color: 'var(--hx-muted)', cursor: 'help', border: '1px solid var(--hx-line)', borderRadius: '50%', padding: '0 4px' }}>?</span>
                )}
              </dt>
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
