// __tests__/dnd/ig-content-picker.test.ts — adding catalogued content from the IG sheet (IG-S3).
//
// The gap this closes is narrow and worth stating precisely, because it is NOT "the sheet could
// not add content" — it could, via a <select> per kind, each drawing from the full catalog. It is
// that a dropdown of bare names shows nothing about what you are choosing:
//   · no rules text, for either kind;
//   · no prerequisites, which for IG feats are the only guidance there is (prose on the source
//     site, unparseable, so the player must read them);
//   · no eligibility, which is the one that mattered. A vanilla character could pick any of ~60
//     power names and learn which its class actually allows only from the refusal afterwards.
// The picker is the same content with the answers attached.
//
// The assertions below are mostly on source text, which is the weaker kind. They are paired with
// real calls into the eligibility and edit cores wherever the claim is about BEHAVIOUR, so the
// wiring checks stay wiring checks and the rules claims are actually exercised.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applyIgEdit } from '@/lib/dnd/systems/intuitive-games/edit';
import { gateIgEdit } from '@/lib/dnd/systems/intuitive-games/rules-gate';
import { blankIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import { IG_GENERAL_FEATS, IG_COMBAT_FEATS, findIGFeat } from '@/lib/dnd/systems/intuitive-games/feats';
import { IG_SPELL_ROSTER } from '@/lib/dnd/systems/intuitive-games/content';
import { allFeats } from '@/app/dnd/_ui/IGContentPicker';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const picker = read('app/dnd/_ui/IGContentPicker.tsx');
// The picker wiring moved into the IG panel set (useIgPanels, T-6a); the Classic shell (IGSheet) is now
// thin. Read both so the source anchor holds wherever the code lives.
const sheet = read('app/dnd/_ui/IGSheet.tsx') + read('app/dnd/_ui/ig/useIgPanels.tsx');

describe('the picker covers both kinds the sheet can add', () => {
  it('handles powers and feats', () => {
    expect(picker).toContain("export type IGPickerKind = 'power' | 'feat'");
  });

  it('sources powers from the ROSTER, not only from the entries with transcribed text', () => {
    // IG_POWERS holds what has been transcribed; IG_SPELL_ROSTER is the complete name list. Using
    // only the former would make a real IG spell look like it does not exist.
    expect(picker).toContain('IG_SPELL_ROSTER');
    expect(picker).toContain('IG_POWERS');
    // And the roster genuinely is the larger set, which is what makes the distinction matter.
    const rosterNames = new Set(Object.values(IG_SPELL_ROSTER).flat().map((n) => n.toLowerCase()));
    expect(rosterNames.size).toBeGreaterThan(40);
  });

  it('says so when a rostered power has no rules text yet, rather than rendering a blank', () => {
    expect(picker).toContain('Rules text not yet transcribed from the source.');
  });

  it('sources feats from both site pages', () => {
    expect(picker).toContain('IG_GENERAL_FEATS');
    expect(picker).toContain('IG_COMBAT_FEATS');
    expect(IG_GENERAL_FEATS.length + IG_COMBAT_FEATS.length).toBeGreaterThan(80);
  });
});

describe('powers are judged; feats are deliberately NOT', () => {
  it('computes eligibility for powers only', () => {
    expect(picker).toContain('igPowerEligibility');
    // The `elig` field is optional precisely so a feat row can have no verdict at all.
    expect(picker).toContain('elig?: { ok: boolean; reason?: string }');
  });

  it('never blocks a feat, because the server never gates one', () => {
    // The mirror-image bug: the UI inventing a restriction the rules do not have.
    expect(picker).toContain("const blocked = kind === 'power'");

    // Exercised for real, not merely read: gateIgEdit passes every add_feat through untouched even
    // with enforcement fully on.
    const c = blankIGCharacter('T');
    const gate = gateIgEdit(c, { op: 'add_feat', name: IG_GENERAL_FEATS[0].name }, { enforce: true });
    expect(gate.edit).not.toBeNull();
    expect(gate.refusal).toBeUndefined();
  });

  it('shows feat prerequisites verbatim instead of a computed verdict', () => {
    // IG prerequisites are free English prose. A computed ✓/✕ would be the UI asserting a verdict
    // the rules engine has explicitly declined to reach, and it would look authoritative.
    expect(picker).toContain('<em>Prerequisites:</em>');
    expect(picker).toContain("'none listed'");
    expect(picker).toContain('shown as written rather than checked');
    // A real feat with a real prose prerequisite, to prove the field is populated prose.
    const withPrereq = IG_GENERAL_FEATS.find((f) => f.prerequisites);
    expect(withPrereq?.prerequisites).toMatch(/[a-z]/i);
  });
});

describe('vanilla, custom and DM are three distinct behaviours', () => {
  it('vanilla is blocked, custom may take it anyway, DM is never blocked', () => {
    expect(picker).toContain("const isVanilla = variantKind !== 'custom'");
    expect(picker).toContain('✕ Blocked');
    expect(picker).toContain('＋ Anyway');
    expect(picker).toContain('Grant a ');
  });

  it('and the gate it is predicting behaves the same way', () => {
    // The picker's greying must not drift from the server. Same power, three contexts.
    const c = { ...blankIGCharacter('T'), identity: { ...blankIGCharacter('T').identity, className: 'Wizard', subclass: 'Evoker', level: 3 } };
    const offList = { op: 'add_power' as const, name: 'Definitely Not An IG Power' };

    const vanilla = gateIgEdit(c, offList, { enforce: true });
    const custom = gateIgEdit(c, offList, { enforce: false, unboundReason: 'custom-character' });
    const dm = gateIgEdit(c, offList, { enforce: false, unboundReason: 'dm-grant' });

    expect(vanilla.edit, 'vanilla is refused').toBeNull();
    expect(vanilla.refusal).toBeTruthy();
    expect(custom.edit, 'custom is allowed').not.toBeNull();
    expect(dm.edit, 'the DM is allowed').not.toBeNull();
    expect(dm.offRules, 'and a DM grant is marked as one').toContain('granted by the DM');
  });

  it('states plainly that the greying is not the enforcement point', () => {
    expect(picker).toContain('NEVER THE ENFORCEMENT POINT');
  });
});

describe('the sheet mounts it', () => {
  it('gives powers a catalogued ＋ Add beside the homebrew ✎ New', () => {
    // Two buttons answering different questions: pick a real power vs author one.
    expect(sheet).toContain("setPicker('power')");
    expect(sheet).toContain("setIgEditor({ kind: 'power' })");
  });

  it('replaces the blind feat dropdown', () => {
    expect(sheet).toContain("setPicker('feat')");
    expect(sheet).not.toContain('<option value="">+ add feat…</option>');
    expect(sheet).not.toContain('igAllFeats');
  });

  it('routes adds through postEdits, so refusals still surface', () => {
    // IGSheet reports gate refusals where PF2Sheet fires and forgets; the picker must not bypass
    // that by fetching on its own.
    expect(sheet).toContain('void postEdits([edit])');
    expect(picker).not.toContain('fetch(');
  });

  it('passes the same server-derived isDM and variant the gate uses', () => {
    expect(sheet).toMatch(/<IGContentPicker[\s\S]{0,200}isDM=\{isDM\} variantKind=\{variantKind\}/);
  });
});

describe('an added feat lands in the right bucket without the picker deciding', () => {
  it('sends the name only, and applyIgEdit sorts General from Combat', () => {
    // The picker's display label is "Combat · Style"; deriving a bucket from that string would be
    // fragile, and applyIgEdit already looks up the feat's real category.
    expect(picker).toContain("onAdd({ op: kind === 'power' ? 'add_power' : 'add_feat', name: r.name })");

    // Deliberately picks feats whose names are UNIQUE across the two pages. Three names are not
    // (see the collision block at the end of this file), and for those the bucket is genuinely
    // undecidable from the name alone — which is the finding, not something to paper over here.
    const collisions = new Set(['armor proficiency', 'shield proficiency', 'weapon training']);
    const combat = IG_COMBAT_FEATS.find((f) => !collisions.has(f.name.toLowerCase()))!.name;
    const general = IG_GENERAL_FEATS.find((f) => !collisions.has(f.name.toLowerCase()))!.name;
    let c = blankIGCharacter('T');
    c = applyIgEdit(c, { op: 'add_feat', name: combat });
    c = applyIgEdit(c, { op: 'add_feat', name: general });
    expect(c.feats.combat).toContain(combat);
    expect(c.feats.general).toContain(general);
  });

  it('and a duplicate pick is harmless', () => {
    const name = IG_GENERAL_FEATS[0].name;
    let c = blankIGCharacter('T');
    c = applyIgEdit(c, { op: 'add_feat', name });
    c = applyIgEdit(c, { op: 'add_feat', name });
    expect([...c.feats.general, ...c.feats.combat].filter((f) => f === name)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A content collision found while building this picker, recorded rather than guessed.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Three feat names appear on BOTH IG feat pages with DIFFERENT rules text — a terse entry in the
 * General page's "Special" group, and a fuller one on the Combat page:
 *
 *   Armor Proficiency  · General/Special: "Eliminate the penalty on Reflex saves from wearing armor."
 *                      · Combat/Combat:   "...proficient with all types of armor, and no longer take
 *                                          a penalty on reflex saves based on the DR granted by that
 *                                          armor worn."
 *   Shield Proficiency · same shape
 *   Weapon Training    · same shape
 *
 * This matters because the IG model keys feats by NAME: `feats.general` and `feats.combat` are
 * bare `string[]`. So for these three:
 *   · `findIGFeat` returns whichever comes first in `igAllFeats()` — the General/Special one — and
 *     the Combat text is unreachable, including in the sheet's hover tooltip.
 *   · `applyIgEdit`'s `add_feat` routes them to `general` for the same reason, whichever the
 *     player actually meant.
 *
 * NOT fixed here, deliberately, and this is the same call as B3 in system-bleed.test.ts. The
 * likely reading is that the General page's "Special" group cross-references feats detailed on the
 * Combat page, which would make the Combat text authoritative and the collision a duplicate rather
 * than two feats. That is a reading of the source, not a fact in evidence — and acting on it means
 * either deleting authored content or changing the feat identity model. Both are the owner's call.
 *
 * Asserted so the ambiguity cannot be quietly resolved by a later edit without this record dying
 * with it: if the duplicates go away, this test fails and forces the block to be deleted.
 */
describe('KNOWN: three IG feat names collide across the two source pages', () => {
  const COLLIDING = ['Armor Proficiency', 'Shield Proficiency', 'Weapon Training'];

  it('each collides with a General/Special and a Combat entry, with different text', () => {
    for (const name of COLLIDING) {
      const key = name.toLowerCase();
      const general = IG_GENERAL_FEATS.find((f) => f.name.toLowerCase() === key);
      const combat = IG_COMBAT_FEATS.find((f) => f.name.toLowerCase() === key);
      expect(general, `${name} on the General page`).toBeTruthy();
      expect(combat, `${name} on the Combat page`).toBeTruthy();
      expect(general!.group, `${name} is a General/Special entry`).toBe('Special');
      expect(general!.effect, `${name}'s two entries say different things`).not.toBe(combat!.effect);
    }
  });

  it('and no OTHER feat name collides — the finding is exactly these three', () => {
    const counts = new Map<string, number>();
    for (const f of [...IG_GENERAL_FEATS, ...IG_COMBAT_FEATS]) {
      const k = f.name.trim().toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const dups = [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k).sort();
    expect(dups).toEqual(COLLIDING.map((n) => n.toLowerCase()).sort());
  });

  it('the consequence is real: these three always resolve to the General entry', () => {
    // Pinned as behaviour so the record and the bug stay tied together.
    for (const name of COLLIDING) {
      expect(findIGFeat(name)?.category, `${name} resolves General-first`).toBe('General');
      const c = applyIgEdit(blankIGCharacter('T'), { op: 'add_feat', name });
      expect(c.feats.general, `${name} is bucketed General`).toContain(name);
      expect(c.feats.combat, `${name} never reaches the Combat bucket`).not.toContain(name);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Duplicate feat names across IG's two feat pages (found by driving the app in a browser —
// React was warning about duplicate keys on the IG builder's chips).
//
// The key collision was the SYMPTOM. The bug underneath it: a character's `feats` is a bare
// `string[]`, so the general and combat "Armor Proficiency" write the same string and selection
// is tested by name. Two rows for one storable value is the UI offering a choice that does not
// exist, and a composite React key would have silenced the warning while leaving that in place.
//
// These tests pin the invariant that makes the options safe to key by name AND honest to show:
// one row per distinct name.
describe('IG feat options are distinct by name', () => {
  it('the source genuinely publishes three feats on both pages', () => {
    // Asserted rather than described, so this test explains itself if the source is ever
    // reconciled and the dedupe becomes unnecessary — the list changing is the signal to revisit.
    const general = new Set(IG_GENERAL_FEATS.map((f) => f.name));
    const both = IG_COMBAT_FEATS.filter((f) => general.has(f.name)).map((f) => f.name).sort();
    expect(both).toEqual(['Armor Proficiency', 'Shield Proficiency', 'Weapon Training']);
  });

  it('the picker emits one row per name, so no two rows can share a React key', () => {
    const names = allFeats().map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('a merged row keeps BOTH published effect texts rather than picking a winner', () => {
    // The combat version of Armor Proficiency is materially stronger than the general one
    // (all armor types vs only the Reflex penalty), so dropping either silently misinforms.
    const row = allFeats().find((r) => r.name === 'Armor Proficiency')!;
    expect(row.effect).toContain('Reflex saves')   // the General wording
    expect(row.effect).toMatch(/all types of armor/i) // the Combat wording
    expect(row.category).toMatch(/General/)
    expect(row.category).toMatch(/Combat/)
  });

  it('the builder deduplicates its chip options for the same reason', () => {
    const src = read('app/dnd/_ui/IGCharacterBuilder.tsx');
    expect(src).toMatch(/new Set\([\s\S]{0,160}e\.name/);
  });
});
