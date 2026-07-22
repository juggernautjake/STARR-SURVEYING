// __tests__/dnd/ig-panels.test.tsx — the Intuitive Games panel set (T-6a).
//
// `useIgPanels` is the IG SheetPanelSet: the ordered, gated content blocks a format shell arranges (the
// Classic default shell today; Codex/Dashboard/Play later). This test pins the panel ids + order and the
// gates — the section-presence rules the old IGSheet monolith encoded inline, now the one place every format
// reads. Rendered via react-dom/server like the rest of the sheet suite (vitest runs in `environment: 'node'`),
// capturing the hook's return from a probe component.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import { useIgPanels, type IgPanelSet, type UseIgPanelsArgs } from '@/app/dnd/_ui/ig/useIgPanels';
import { blankIGCharacter, blankIGCompanion } from '@/lib/dnd/systems/intuitive-games/model';

// The hook calls useRouter() for its edit-refresh; a stub is all the panel-gating logic needs.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

/** Render a throwaway probe that calls the hook and hand its return back out. */
function capture(args: Partial<UseIgPanelsArgs> & { ig: UseIgPanelsArgs['ig'] }): IgPanelSet {
  let out: IgPanelSet | null = null;
  function Probe() {
    out = useIgPanels({ elements: [], ...args });
    return null;
  }
  ReactDOMServer.renderToStaticMarkup(React.createElement(Probe));
  return out!;
}

const ids = (set: IgPanelSet) => set.panels.map((p) => p.id);

describe('useIgPanels — the ordered, gated IG panel set', () => {
  it('a bare, non-editable character shows only the always-on sections, in order', () => {
    // Vitals, Abilities and Reference always render (IG has no AC — Vitals leads with HP + Fort/Ref/Will +
    // Proficiency); Skills/Combat/Powers/Feats/Equipment/Companion/Details are gated off.
    const set = capture({ ig: blankIGCharacter('T'), canEdit: false });
    expect(ids(set)).toEqual(['ig-vitals', 'ig-abilities', 'ig-reference']);
  });

  it('no Skills panel when the character has no skills; it appears (after Abilities) when there is one', () => {
    const c = blankIGCharacter('T');
    expect(ids(capture({ ig: c }))).not.toContain('ig-skills');
    const withSkill = { ...c, skills: [{ name: 'Athletics', ability: 'STR' as const, ranks: 1, proficient: true, misc: 0, combat: false }] };
    expect(ids(capture({ ig: withSkill }))).toEqual(['ig-vitals', 'ig-abilities', 'ig-skills', 'ig-reference']);
  });

  it('no Combat panel when nothing combat-relevant is set; it appears (after Skills) once there is', () => {
    const c = blankIGCharacter('T');
    expect(ids(capture({ ig: c }))).not.toContain('ig-combat');
    // The Combat gate is a genuine has-anything check and is NOT widened by edit rights.
    const withHp = { ...c, combat: { ...c.combat, hitPoints: { ...c.combat.hitPoints, classBackgroundHp: 8 } } };
    expect(ids(capture({ ig: withHp, canEdit: false }))).toContain('ig-combat');
    expect(ids(capture({ ig: c, canEdit: true, characterId: 'x' }))).not.toContain('ig-combat');
  });

  it('no Powers/Feats panel when empty and not editable; both appear once the viewer can edit', () => {
    const c = blankIGCharacter('T');
    expect(ids(capture({ ig: c, canEdit: false }))).not.toContain('ig-powers');
    expect(ids(capture({ ig: c, canEdit: false }))).not.toContain('ig-feats');
    // An editor reaches the ＋ Add / ＋ add feat… affordances even with none yet — so both render.
    const editable = capture({ ig: c, canEdit: true, characterId: 'x' });
    expect(ids(editable)).toEqual(['ig-vitals', 'ig-abilities', 'ig-powers', 'ig-feats', 'ig-reference']);
  });

  it('the Companion panel is gated on a companion existing, independent of edit rights', () => {
    const c = blankIGCharacter('T');
    expect(ids(capture({ ig: c, canEdit: true, characterId: 'x' }))).not.toContain('ig-companion');
    const withPet = { ...c, companion: blankIGCompanion('Wolf', 'Beast') };
    const set = capture({ ig: withPet, canEdit: false });
    expect(ids(set)).toContain('ig-companion');
    // It sits after Reference/Equipment and before Details, matching the monolith's order.
    expect(ids(set)).toEqual(['ig-vitals', 'ig-abilities', 'ig-reference', 'ig-companion']);
  });

  it('the Details panel appears when there is any identity/ancestry/bio/notes content', () => {
    const c = blankIGCharacter('T');
    expect(ids(capture({ ig: c }))).not.toContain('ig-details');
    const withNotes = { ...c, notes: 'A wandering blade.' };
    expect(ids(capture({ ig: withNotes }))).toEqual(['ig-vitals', 'ig-abilities', 'ig-reference', 'ig-details']);
  });

  it('every panel carries the SheetPanel shape the format shells consume', () => {
    const set = capture({ ig: blankIGCharacter('T'), canEdit: true, characterId: 'x' });
    for (const p of set.panels) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.label).toBe('string');
      expect(typeof p.emoji).toBe('string');
      expect(typeof p.render).toBe('function');
    }
  });

  it('returns the surrounding furniture the Classic shell lays out', () => {
    const set = capture({ ig: blankIGCharacter('T') });
    // header/nav/overlays are always present; the refusal banner is null until an edit is refused.
    for (const key of ['header', 'nav', 'overlays'] as const) {
      expect(set[key], key).toBeTruthy();
    }
    expect(set.banner).toBeNull();
    // The roller is now ALWAYS mounted (RO-5c): the persistent animated roller with its template picker,
    // ready to roll — not a toast that only appears after the first roll.
    expect(set.roller).toBeTruthy();
  });
});
