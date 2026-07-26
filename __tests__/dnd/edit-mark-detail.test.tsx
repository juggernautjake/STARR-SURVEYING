// __tests__/dnd/edit-mark-detail.test.tsx — the ✎ marker says WHAT changed (rules platform, Slice 20).
//
// The doc's remaining ✎ ask was "surface the SPECIFIC per-element diff (8d6 → 10d6) + a Revert on the
// hover". The diff half lands here. The marker has always meant "this differs from how it came", and the
// audit log has always held the exact before/after — nothing joined them, so hovering told a player only
// that *something* was different about a spell they were looking at.
//
// It also wires `editedElementName`, which I added last session for exactly this matching and then left
// with no consumer — the "authored but not wired" defect this codebase produces most, committed by me
// while auditing others.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { editedElementName, describeEdit } from '@/lib/dnd/edit-describe';
import { indexEdits, editFor } from '@/app/dnd/_sheet/lib/use-element-edits';

const NOW = '2026-07-26T12:00:00.000Z';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const HOOK = read('app/dnd/_sheet/lib/use-element-edits.ts');
const MARK = read('app/dnd/_sheet/components/ui/EditMark.tsx');

describe('one fetch for the whole sheet', () => {
  it('shares an in-flight promise per character rather than fetching per marker', () => {
    // A sheet can carry twenty edited elements. A hook that fetched per marker would issue twenty
    // requests for one page.
    expect(HOOK).toContain('const inflight = new Map<string, Promise<Map<string, ElementEdit>>>()');
    expect(HOOK).toContain('const cached = inflight.get(characterId)');
  });

  it('keeps only the NEWEST change per element', () => {
    // The route returns newest-first, so the first row seen for an element is its latest — which is what
    // "what changed here" means on a hover. A history belongs in the review panel.
    expect(HOOK).toContain('if (out.has(key)) continue');
  });

  it('skips the revert bookkeeping rows', () => {
    expect(HOOK).toContain("startsWith('revert:')");
  });

  it('never throws at the sheet — the marker must render without it', () => {
    expect(HOOK).toContain('.catch(() => new Map<string, ElementEdit>())');
  });
});

describe('the marker leads with the specific change, and keeps its own meaning', () => {
  it('puts the diff, the person and the date first', () => {
    expect(MARK).toContain('`${detail.summary} — ${detail.who}, ${detail.when}. ${GENERIC}`');
  });

  it('still explains what ✎ MEANS underneath', () => {
    // The mark means "differs from how it came" whether or not the log can name the change; dropping that
    // would trade one kind of ignorance for another.
    expect(MARK).toContain('GENERIC');
    expect(MARK).toContain('a record, not a warning');
  });

  it('falls back cleanly when the join misses', () => {
    expect(MARK).toContain('detail ?');
  });
});

describe('the join, and where it legitimately misses', () => {
  it('matches an element by the audit path, in both vocabularies', () => {
    expect(editedElementName('spell.Fireball.damage')).toBe('Fireball');
    expect(editedElementName('spells[fireball]')).toBe('fireball');
  });

  it('matches case- and space-insensitively, as the pickers do', () => {
    expect(HOOK).toContain("s.trim().toLowerCase().replace(/\\s+/g, ' ')");
  });

  it('a RENAMED element still finds its history — no schema change needed', () => {
    // This looked like it needed an element id on the audit row. It does not: the RENAME IS ITSELF AN
    // AUDITED ROW (`spell.Fireball.name: Fireball → Firestorm`), so the old name is recoverable from data
    // already present. Without this, the marker showed the generic text on exactly the elements someone
    // had been working on most.
    const map = indexEdits([
      { id: '1', created_at: NOW, field_path: 'spell.Fireball.name', old_value: 'Fireball', new_value: 'Firestorm' },
      { id: '2', created_at: NOW, field_path: 'spell.Fireball.damage', old_value: '8d6', new_value: '10d6' },
    ]);
    expect(editFor(map, 'Firestorm')?.summary).toBe('spell.Fireball.name: Fireball → Firestorm');
  });

  it('follows a CHAIN of renames', () => {
    // A → B → C. Rows arrive newest-first, so the walk goes backwards through them.
    const map = indexEdits([
      { id: '1', created_at: NOW, field_path: 'feature.B.name', old_value: 'B', new_value: 'C' },
      { id: '2', created_at: NOW, field_path: 'feature.A.name', old_value: 'A', new_value: 'B' },
      { id: '3', created_at: NOW, field_path: 'feature.A.body', old_value: 'old text', new_value: 'new text' },
    ]);
    expect(editFor(map, 'C')).toBeTruthy();
  });

  it('does not spin on a rename cycle', () => {
    // These names are user input: renaming X to Y and back again would loop forever without the depth cap.
    const map = indexEdits([
      { id: '1', created_at: NOW, field_path: 'item.Y.name', old_value: 'Y', new_value: 'X' },
      { id: '2', created_at: NOW, field_path: 'item.X.name', old_value: 'X', new_value: 'Y' },
    ]);
    expect(map).toBeInstanceOf(Map); // reaching here at all is the assertion
  });

  it('never lets a rename overwrite an element\'s OWN newer change', () => {
    // If the renamed-to name has its own row, that one wins — it is the more recent truth.
    const map = indexEdits([
      { id: '1', created_at: NOW, field_path: 'spell.Firestorm.damage', old_value: '10d6', new_value: '12d6' },
      { id: '2', created_at: NOW, field_path: 'spell.Fireball.name', old_value: 'Fireball', new_value: 'Firestorm' },
    ]);
    expect(editFor(map, 'Firestorm')?.summary).toBe('spell.Firestorm.damage: 10d6 → 12d6');
  });

  it('the summary it shows is the shared formatter, not a second one', () => {
    expect(HOOK).toContain('summary: describeEdit(row)');
    expect(describeEdit({ field_path: 'spell.Fireball.damage', old_value: '8d6', new_value: '10d6' }))
      .toBe('spell.Fireball.damage: 8d6 → 10d6');
  });
});

describe('every marker call site passes its element name', () => {
  // A marker with no name silently gets the generic tooltip — working, but never the detail. Passing it is
  // the whole wiring, so it is asserted per site rather than assumed.
  const SITES: [string, string][] = [
    ['app/dnd/_sheet/components/Attacks.tsx', 'a'],
    ['app/dnd/_sheet/components/Features.tsx', 'f'],
    ['app/dnd/_sheet/components/Inventory.tsx', 'it'],
    ['app/dnd/_sheet/components/SpellsPanel.tsx', 's'],
  ];
  for (const [file, v] of SITES) {
    it(file.split('/').pop()!, () => {
      expect(read(file)).toContain(`<EditMark on={${v}.customized} name={${v}.name} />`);
    });
  }
});

describe('Revert, from the marker itself', () => {
  const TIP = read('app/dnd/_ui/Tip.tsx');

  it('Tip can host controls now — one property was the whole blocker', () => {
    // Recorded twice as needing `Tip` rebuilt. It did not: the tooltip span is a CHILD of the wrapper, so
    // moving the mouse into it never fires the wrapper's `onMouseLeave` — reaching it already worked, and
    // only `pointerEvents: 'none'` stopped the click. Same lesson as the rename blocker: a constraint
    // written down from a glance, not re-derived.
    expect(TIP).toContain("pointerEvents: actions ? 'auto' : 'none'");
  });

  it('stays click-through when there is nothing to click', () => {
    // A plain tooltip must never swallow a click meant for what is underneath it.
    expect(TIP).toContain('actions?: ReactNode');
    expect(TIP).toContain("{actions && <span style={{ display: 'flex'");
  });

  it('keeps the explanation as TEXT rather than widening `tip` to a node', () => {
    // `tip` is what `aria-describedby` announces, and a caller that only wants words should not have to
    // think about interactivity.
    expect(TIP).toContain('tip: string');
  });

  it('the marker offers it only with a specific change AND write access', () => {
    expect(MARK).toContain('actions={detail && canWrite ?');
  });

  it('reuses the existing endpoint rather than a second revert path', () => {
    // Same route and same pure `revertSheetEdit` the review panel uses — a second door, not a second
    // implementation.
    expect(MARK).toContain('/edits/revert');
    expect(MARK).toContain("body: JSON.stringify({ editId: detail.id })");
  });

  it('pulls the sheet back in afterwards, so the marker reflects the undo', () => {
    expect(MARK).toContain('await reloadFromDb()');
  });

  it('carries the audit row id through the index for exactly this', () => {
    const map = indexEdits([
      { id: 'row-7', created_at: NOW, field_path: 'spell.Fireball.damage', old_value: '8d6', new_value: '10d6' },
    ]);
    expect(editFor(map, 'Fireball')?.id).toBe('row-7');
  });
});
