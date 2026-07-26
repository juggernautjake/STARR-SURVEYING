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

  it('a RENAMED element misses, and that is recorded rather than hidden', () => {
    // Manual rows are keyed by the element's PRE-edit name, so after a rename nothing matches. Fixing it
    // needs an element id on the audit row — a schema change, not a UI one — and until then the marker
    // falls back to its general text rather than showing someone else's edit.
    // Matched across the comment's line wrap — a literal `toContain` on a wrapped sentence is the same
    // brittle-source-assertion trap this session has hit three times already.
    expect(MARK.replace(/\s*\n\s*\/\/\s*/g, ' ')).toContain('a RENAMED element no longer matches its rows');
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

describe('what is still NOT done here', () => {
  it('no Revert in the hover — `Tip` cannot host one as written', () => {
    // It sets `pointerEvents: 'none'` on the tooltip and takes `tip: string`, not a node. Building a
    // second, interactive popover for this alone was not worth it; the Revert already exists per-edit in
    // `EditReviewPanel`. Asserted so a future slice knows the blocker is real rather than an oversight.
    const tip = read('app/dnd/_ui/Tip.tsx');
    expect(tip).toContain("pointerEvents: 'none'");
    expect(MARK).not.toContain('Revert');
  });
});
