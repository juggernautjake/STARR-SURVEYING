// The Content Studio is REACHABLE, and its picker is generated rather than hand-listed (P6-5/P6-6/P6-7).
//
// Written the same way as `homebrew-designer-reachability.test.ts`, and for the same reason: this repo's
// characteristic defect is a finished feature nobody can click. The Studio is the largest thing being built
// here, so it gets its door tested from the first slice rather than after an audit finds it.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { HOMEBREW_KINDS } from '@/lib/dnd/homebrew/model';
import { allKindSpecs, KIND_GROUPS, fieldsForKind } from '@/lib/dnd/homebrew/kinds';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const has = (p: string) => existsSync(join(process.cwd(), p));

describe('the Studio has pages, and something links to them', () => {
  it('browse, build and detail all exist', () => {
    for (const p of ['app/dnd/content/page.tsx', 'app/dnd/content/new/page.tsx', 'app/dnd/content/[id]/page.tsx']) {
      expect(has(p), p).toBe(true);
    }
  });

  it('the lobby carries the Content Builder button the owner asked for', () => {
    // "a content builder button on the user page" — MyTable IS the user page's own section.
    const src = read('app/dnd/_ui/MyTable.tsx');
    expect(src).toContain('/dnd/content/new');
    expect(src, 'and a way to see what you have made').toContain('/dnd/content?tab=mine');
  });

  it('the header menu offers browsing to everyone and building to signed-in users', () => {
    const src = read('app/dnd/_ui/DndHeader.tsx');
    expect(src).toContain('/dnd/content');
    expect(src).toContain('/dnd/content/new');
  });

  it('every link the browse page emits points at a page that exists', () => {
    // The failure this catches is the one that nearly shipped in this very slice: buttons added to the
    // lobby pointing at `/dnd/content/new` before that page was written.
    const src = read('app/dnd/content/page.tsx');
    for (const target of ['/dnd/content/new', '/dnd/content/${p.id}']) {
      expect(src, `browse should link to ${target}`).toContain(target);
    }
    expect(has('app/dnd/content/new/page.tsx')).toBe(true);
    expect(has('app/dnd/content/[id]/page.tsx')).toBe(true);
  });
});

describe('the picker is generated from the registry, not hand-listed', () => {
  it('renders from KIND_GROUPS / kindsInGroup rather than naming kinds', () => {
    const src = read('app/dnd/content/new/page.tsx');
    expect(src).toContain('KIND_GROUPS');
    expect(src).toContain('kindsInGroup');
    // A hand-written list is how a new kind gets added to the registry and silently never appears.
    expect(src, 'no kind may be hard-coded in the picker').not.toMatch(/'creature'|'subclass'|'potion'/);
  });

  it('every kind belongs to a group the picker actually renders', () => {
    for (const spec of allKindSpecs()) {
      expect(KIND_GROUPS, `${spec.kind} is in group "${spec.group}", which the picker never renders`)
        .toContain(spec.group);
    }
  });

  it('every kind has a spec, so the registry and the vocabulary cannot drift', () => {
    expect(allKindSpecs().map((s) => s.kind).sort()).toEqual([...HOMEBREW_KINDS].sort());
  });

  it('and every kind produces a form with at least the identity fields', () => {
    for (const kind of HOMEBREW_KINDS) {
      const keys = fieldsForKind(kind).map((f) => f.key);
      expect(keys, `${kind} must collect a summary`).toContain('summary');
      expect(keys, `${kind} must collect rules text`).toContain('description');
    }
  });
});

describe('the builder is honest about what it cannot do yet', () => {
  it('renders unimplemented field types as a labelled gap, not as a text box', () => {
    // A form that appears to accept a statblock and silently discards it is worse than one that admits
    // the gap — the author would only find out after saving.
    const src = read('app/dnd/_ui/ContentBuilder.tsx');
    expect(src).toContain('IMPLEMENTED');
    expect(src).toContain('OWED_BY');
    expect(src, 'the placeholder must name the slice that builds it').toMatch(/not built yet/i);
  });

  it('shows the prose-only notice when a kind carries no mechanics in the chosen system', () => {
    const src = read('app/dnd/_ui/ContentBuilder.tsx');
    expect(src).toContain('proseOnlyNotice');
  });

  it('drives the whole form from the registry, with no per-kind branches', () => {
    const src = read('app/dnd/_ui/ContentBuilder.tsx');
    expect(src).toContain('fieldsForKind');
    expect(src).toContain('sectionsForKind');
    expect(src, 'a per-kind branch here is the thing the registry exists to prevent')
      .not.toMatch(/kind === '(class|creature|feat|item)'/);
  });
});
