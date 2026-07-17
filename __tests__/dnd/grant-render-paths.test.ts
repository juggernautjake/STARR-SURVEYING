// __tests__/dnd/grant-render-paths.test.ts — the grant targets split by HOW they render, and Rule 2
// demands the registry be honest about it:
//   · grant_feature / grant_sense — effect-rendered: a component reads ledger.explain(<target>).
//   · grant_proficiency / grant_language — effect-rendered: ledger.collected('grant_proficiency').
//   · grant_attack / grant_spell / grant_resource — a full structured object, so authored on the item's
//     grants* field (which renders while the item is active), NOT as a ref-string effect. Their help +
//     rendersAt now say so, so a builder can't emit an effect that renders nowhere.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { findTarget } from '@/lib/dnd/effects/targets';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const FEATURES = read('app/dnd/_sheet/components/Features.tsx');
const ATTACKS = read('app/dnd/_sheet/components/Attacks.tsx');
const SPELLS = read('app/dnd/_sheet/components/SpellsPanel.tsx');
const RESOURCES = read('app/dnd/_sheet/components/Resources.tsx');

describe('effect-rendered grants read the ledger at their claimed home', () => {
  it('grant_feature is surfaced via ledger.explain in the Features tab', () => {
    expect(findTarget('grant_feature')!.rendersAt).toMatch(/Features/);
    expect(FEATURES).toContain(".explain('grant_feature')");
  });
});

describe('structured grants are authored on the item field, and the help says so', () => {
  it.each([
    ['grant_attack', 'grantsAttack', ATTACKS, /Attacks/],
    ['grant_spell', 'grantsSpell', SPELLS, /Spells/],
    ['grant_resource', 'grantsResource', RESOURCES, /Resources/],
  ] as const)('%s → the item %s field, which renders', (key, field, component, homeRe) => {
    const t = findTarget(key)!;
    expect(t.rendersAt).toMatch(homeRe);
    expect(t.help).toContain(field);           // help directs authoring to the field that renders
    expect(t.rendersAt).toContain(field);      // rendersAt names the mechanism, not just the tab
    expect(component).toContain(`i.${field}`);  // the component actually reads that field
  });
});
