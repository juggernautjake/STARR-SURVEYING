// __tests__/dnd/pf2-panels.test.tsx — the PF2 panel set (T-5a).
//
// `usePf2Panels` is the Pathfinder 2e SheetPanelSet: the ordered, gated content blocks a format shell
// arranges (the Classic default shell today; Codex/Dashboard/Play later). This test pins the panel
// ids + order and the gates — the section-presence rules the old monolith encoded inline, now the one
// place every format reads. Rendered via react-dom/server like the rest of the sheet suite (vitest
// runs in `environment: 'node'`), capturing the hook's return from a probe component.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import { usePf2Panels, type Pf2PanelSet, type UsePf2PanelsArgs } from '@/app/dnd/_ui/pf2/usePf2Panels';
import { blankPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';

// The hook calls useRouter() for its edit-refresh; a stub is all the panel-gating logic needs.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

/** Render a throwaway probe that calls the hook and hand its return back out. */
function capture(args: UsePf2PanelsArgs): Pf2PanelSet {
  let out: Pf2PanelSet | null = null;
  function Probe() {
    out = usePf2Panels(args);
    return null;
  }
  ReactDOMServer.renderToStaticMarkup(React.createElement(Probe));
  return out!;
}

const ids = (set: Pf2PanelSet) => set.panels.map((p) => p.id);

describe('usePf2Panels — the ordered, gated PF2 panel set', () => {
  it('a bare, non-editable character shows only the always-on sections, in order', () => {
    // Attributes, Defenses and Skills always render; Conditions/Strikes/Feats/Spells are gated off.
    const set = capture({ pf2: blankPF2Character('T'), canEdit: false });
    expect(ids(set)).toEqual(['pf2-attributes', 'pf2-defenses', 'pf2-skills']);
  });

  it('no Conditions panel when there are no conditions; it appears (after Defenses) when there is one', () => {
    const c = blankPF2Character('T');
    expect(ids(capture({ pf2: c }))).not.toContain('pf2-conditions');
    const withCond = { ...c, combat: { ...c.combat, conditions: [{ name: 'Frightened', value: 2 }] } };
    expect(ids(capture({ pf2: withCond }))).toEqual(['pf2-attributes', 'pf2-defenses', 'pf2-conditions', 'pf2-skills']);
  });

  it('no Strikes/Feats panel when empty and not editable; both appear once the viewer can edit', () => {
    const c = blankPF2Character('T');
    // Not editable, no attacks/feats → neither gated section.
    expect(ids(capture({ pf2: c, canEdit: false }))).not.toContain('pf2-strikes');
    expect(ids(capture({ pf2: c, canEdit: false }))).not.toContain('pf2-feats');
    // An editor reaches the ＋ Weapon / ＋ Feat affordances even with none yet — so both render.
    const editable = capture({ pf2: c, canEdit: true, characterId: 'x' });
    // The custom-sections panel (D-13) is always offered to an owner, so it trails the editable set.
    expect(ids(editable)).toEqual(['pf2-attributes', 'pf2-defenses', 'pf2-skills', 'pf2-strikes', 'pf2-feats', 'pf2-custom']);
  });

  it('the Spells panel is gated on being a caster, independent of edit rights', () => {
    const c = blankPF2Character('T'); // spellcasting.kind === 'none'
    expect(ids(capture({ pf2: c, canEdit: true, characterId: 'x' }))).not.toContain('pf2-spells');
    const caster = { ...c, spellcasting: { ...c.spellcasting, kind: 'prepared' as const, tradition: 'arcane' as const } };
    expect(ids(capture({ pf2: caster, canEdit: false }))).toContain('pf2-spells');
  });

  it('every panel carries the SheetPanel shape the format shells consume', () => {
    const set = capture({ pf2: blankPF2Character('T'), canEdit: true, characterId: 'x' });
    for (const p of set.panels) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.label).toBe('string');
      expect(typeof p.emoji).toBe('string');
      expect(typeof p.render).toBe('function');
    }
  });

  it('returns the surrounding furniture the Classic shell lays out', () => {
    const set = capture({ pf2: blankPF2Character('T') });
    // header/nav/roller/overlays/footer are always present; the refusal banner is null until an
    // edit is refused.
    for (const key of ['header', 'nav', 'roller', 'overlays', 'footer'] as const) {
      expect(set[key], key).toBeTruthy();
    }
    expect(set.banner).toBeNull();
  });

  it('the custom-sections panel (D-13) shows for owners, or when any section exists, and hides otherwise', () => {
    expect(ids(capture({ pf2: blankPF2Character('T'), canEdit: false }))).not.toContain('pf2-custom');
    expect(ids(capture({ pf2: blankPF2Character('T'), canEdit: true, characterId: 'x' }))).toContain('pf2-custom');
    expect(ids(capture({ pf2: blankPF2Character('T'), canEdit: false, customSections: [{ id: 's1', title: 'Log', blocks: [] }] }))).toContain('pf2-custom');
  });
});
