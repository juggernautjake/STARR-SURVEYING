// CreatureStatblock — a catalogued creature's full stat block, laid out to be read and used.
//
// OWNER: *"I want full stat blocks that can be used like a character sheet if a dm should choose to add that
// creature to their campaign … interactable stat blocks."*
//
// So every attack that has a to-hit or damage carries its roll control (`StatblockEntryRoll`, which already exists
// and publishes into the shared roll feed). The rest is presentation — but presentation is most of what "fully
// complete and match the system it was made for" means: a stat block is a well-established printed form, and a
// reader who knows the game finds things by their position on the page.
//
// EVERY FIELD IS OPTIONAL AND NONE IS FAKED. A creature with no `senses` line prints no senses line; it does not
// print "Senses: —". The model's own comment is explicit that absent is normal rather than missing, and inventing a
// dash where a source printed nothing is the smallest possible version of inventing a rule.
//
// A SERVER COMPONENT except for the roll buttons, which bring their own `'use client'`. Nothing here needs state.
import {
  STATBLOCK_ABILITIES,
  ABILITY_LABELS,
  ENTRY_KIND_LABELS,
  STATBLOCK_ENTRY_KINDS,
  abilityModifier,
  formatModifier,
  entriesOfKind,
  type Statblock,
} from '@/lib/dnd/homebrew/statblock';
import StatblockEntryRoll from '@/app/dnd/_ui/StatblockEntryRoll';
import ConditionText from '@/app/dnd/_ui/ConditionText';
import styles from './statblock.module.css';

export default function CreatureStatblock({
  statblock,
  name,
  system,
}: {
  statblock: Statblock;
  name?: string;
  /** Whose conditions the prose is explained against (owner 2026-07-30). Optional so existing callers keep
   *  working — with no system the text renders plain rather than explained against a guess, which is the
   *  right failure: a 5e tooltip on a Pathfinder creature would be confidently wrong. */
  system?: string | null;
}) {
  const s = statblock;
  const abilities = STATBLOCK_ABILITIES.filter((a) => typeof s.abilities?.[a] === 'number');
  /**
   * Systems that state MODIFIERS rather than scores — Pathfinder 2e's remaster prints only `Dex +3`.
   *
   * This renderer read `abilities` alone, so **all 1,594 Pathfinder creatures displayed no ability line at
   * all**: not a wrong number, no row. `abilityMods` was added in B1-5 for exactly this, argued through at
   * length (writing 3 into `abilities` renders a crippling weakness where the source states a strength),
   * covered by tests — and never wired into the one component that shows a creature to a reader. The
   * repo's signature defect, in the module whose plan opens by warning about it.
   *
   * Scores WIN when both are present: a score carries strictly more information, and its modifier is
   * derived below rather than stored, so the two can never disagree.
   */
  const abilityMods = abilities.length
    ? []
    : STATBLOCK_ABILITIES.filter((a) => typeof s.abilityMods?.[a] === 'number');

  /** A labelled line, rendered only when there is something to say. Takes a node as well as a string, so
   *  a value can be enriched (condition names explained in place) without a second renderer. */
  const line = (label: string, value: React.ReactNode) =>
    value === undefined || value === null || value === '' ? null : (
      <div className={styles.line}>
        <span className={styles.lineLabel}>{label}</span>
        <span className={styles.lineValue}>{value}</span>
      </div>
    );

  return (
    <div className={styles.block}>
      {/* ── the defensive core, which is what a DM reads first ── */}
      <div className={styles.core}>
        {line('Armor Class', s.ac === undefined ? undefined : `${s.ac}${s.acNote ? ` (${s.acNote})` : ''}`)}
        {line('Hit Points', s.hp === undefined ? s.hitDice : `${s.hp}${s.hitDice ? ` (${s.hitDice})` : ''}`)}
        {line('Speed', s.speed)}
      </div>

      {abilities.length > 0 && (
        <div className={styles.abilities}>
          {abilities.map((a) => {
            const score = s.abilities![a]!;
            return (
              <div key={a} className={styles.ability}>
                <span className={styles.abilityName}>{ABILITY_LABELS[a]}</span>
                <span className={styles.abilityScore}>{score}</span>
                {/* The modifier is DERIVED, not stored — the one number in a stat block that is always a
                    function of another, so storing it would let the two disagree. */}
                <span className={styles.abilityMod}>{formatModifier(abilityModifier(score))}</span>
              </div>
            );
          })}
        </div>
      )}

      {abilityMods.length > 0 && (
        <div className={styles.abilities}>
          {abilityMods.map((a) => (
            <div key={a} className={styles.ability}>
              <span className={styles.abilityName}>{ABILITY_LABELS[a]}</span>
              {/* The MODIFIER sits where a score would, because it is what the source states and what a
                  Pathfinder DM reads. No derived second line beneath it: there is no score behind a +3 and
                  no formula recovers one, so inventing a row to fill the space would be inventing a rule. */}
              <span className={styles.abilityScore}>{formatModifier(s.abilityMods![a]!)}</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.core}>
        {line('Saving Throws', s.saves)}
        {line('Skills', s.skills)}
        {line('Damage Resistances', s.resistances)}
        {line('Damage Immunities', s.immunities)}
        {line('Damage Vulnerabilities', s.vulnerabilities)}
        {/* The immunities line is a LIST of conditions by definition, so it is the one place a reader is
            most likely to meet a name they do not know. */}
        {s.conditionImmunities
          ? line('Condition Immunities', <ConditionText text={s.conditionImmunities} system={system} />)
          : null}
        {line('Senses', s.senses)}
        {line('Languages', s.languages)}
        {line('Challenge', s.cr === undefined ? undefined : `${s.cr}${s.xp ? ` (${s.xp.toLocaleString()} XP)` : ''}`)}
        {line('Proficiency Bonus', s.proficiencyBonus === undefined ? undefined : formatModifier(s.proficiencyBonus))}
      </div>

      {s.spellcasting && (
        <div className={styles.section}>
          <h4 className={styles.sectionHead}>Spellcasting</h4>
          <p className={styles.body}>{s.spellcasting}</p>
        </div>
      )}

      {/* Entries print in the printed order of a stat block — traits above actions, legendary last — which is
          `STATBLOCK_ENTRY_KINDS`'s declared order, read from the model rather than restated here. */}
      {STATBLOCK_ENTRY_KINDS.map((kind) => {
        const entries = entriesOfKind(s, kind);
        if (!entries.length) return null;
        return (
          <div key={kind} className={styles.section}>
            {/* `trait` is the unheaded material above Actions in a printed 5e block, so it gets no heading here
                either — a "Traits" header would be a small invention about how the form works. */}
            {kind !== 'trait' && <h4 className={styles.sectionHead}>{ENTRY_KIND_LABELS[kind]}</h4>}
            {entries.map((e, i) => (
              <div key={`${e.name}-${i}`} className={styles.entry}>
                <p className={styles.body}>
                  <strong className={styles.entryName}>{e.name}</strong>
                  {e.cost ? <span className={styles.cost}>{e.cost}</span> : null}
                  {e.uses ? <span className={styles.uses}>({e.uses})</span> : null}
                  {/* Conditions named in the prose become explained, in-place (owner 2026-07-30: the
                      skunk's spray causes sickness, and a reader should be able to hover it). */}
                  {e.body ? <> <ConditionText text={e.body} system={system} /></> : null}
                </p>
                {/* THE INTERACTIVE PART. Only where the source actually gave a to-hit or damage — offering a roll
                    button on a trait with no numbers would be a control that cannot work. */}
                {(e.toHit || e.damage) && (
                  <div className={styles.rolls}>
                    <StatblockEntryRoll toHit={e.toHit} damage={e.damage} />
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {/* An honest empty state. A stat block with nothing in it is a data problem, and saying so beats rendering
          an empty frame that looks like a rendering bug. */}
      {/* `abilityMods` counts too, or a Pathfinder creature with modifiers and nothing else would be told
          it has no stat block recorded. */}
      {abilities.length === 0 && abilityMods.length === 0 && s.ac === undefined && s.hp === undefined && !s.entries?.length && (
        <p className={styles.emptyNote}>
          {name ? `${name} has` : 'This creature has'} no stat block recorded yet.
        </p>
      )}
    </div>
  );
}
