// __tests__/dnd/migrate-content.test.ts — moving `dnd_content` into the Studio (P6-19).
//
// `dnd_content` is the original homebrew library (Phase C19). The Studio is where authored content lives
// now. The plan's item is "move the rows in and retire the old route", and it was deliberately placed last
// "so nothing in active play breaks early".
//
// THE MAPPING IS THE PART THAT CAN BE WRONG, and a script cannot check it for you — so it is pure, and
// these tests are mostly about the rows it REFUSES to migrate. A migration that silently drops rows is the
// worst version of this: the old table gets retired, the rows are gone, and nobody knows which ones,
// because the script printed a count.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONTENT_KINDS, CONTENT_KIND_MAP, CONTENT_KIND_COMPROMISES, CONTENT_MIGRATION_STATUS,
  migrateContentRow, migrateContentRows, mappingIsValid, contentSummary, type ContentRow,
} from '@/lib/dnd/homebrew/migrate-content';
import { HOMEBREW_KINDS } from '@/lib/dnd/homebrew/model';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const row = (over: Partial<ContentRow> = {}): ContentRow => ({
  id: 'src-1',
  campaign_id: 'camp-1',
  kind: 'magic_item',
  name: 'Axe of Mild Inconvenience',
  rarity: 'rare',
  data: { stats: { weight: 4 }, effects: [{ target: 'ac', operation: 'add', value: 1 }] },
  requires_attunement: true,
  created_by: 'user-1',
  ...over,
});

describe('the kind map', () => {
  it('covers every content kind the table allows', () => {
    // The nine come from `dnd_content`'s own CHECK constraint. A kind with no entry would migrate to
    // nothing and be reported as unmapped — better than silence, but it should not happen at all.
    for (const k of CONTENT_KINDS) expect(CONTENT_KIND_MAP[k], k).toBeTruthy();
  });

  it('and every target is a REAL Studio kind', () => {
    // The check that catches a typo in the map. Without it, `feature: 'abilty'` migrates nine rows into a
    // kind that does not exist and the Studio renders them as nothing.
    expect(mappingIsValid()).toBe(true);
    const known = new Set<string>(HOMEBREW_KINDS);
    for (const [from, to] of Object.entries(CONTENT_KIND_MAP)) expect(known.has(to), `${from} → ${to}`).toBe(true);
  });

  it('THE THREE INEXACT ONES ARE RECORDED, not just performed', () => {
    // magic_item → item, feature → ability, attack → action. Each is a judgement, and a judgement that
    // lives only in the code is one nobody can disagree with later.
    expect(CONTENT_KIND_COMPROMISES.map((c) => c.from).sort()).toEqual(['attack', 'feature', 'magic_item']);
    for (const c of CONTENT_KIND_COMPROMISES) {
      expect(CONTENT_KIND_MAP[c.from]).toBe(c.to);
      expect(c.why.length, c.from).toBeGreaterThan(30);
    }
  });

  it('and `feat` stays `feat` — it is NOT collapsed into `feature`', () => {
    // A feat is chosen; a feature is granted. Collapsing them makes a class feature look like something
    // you can take at an ASI.
    expect(CONTENT_KIND_MAP.feat).toBe('feat');
    expect(CONTENT_KIND_MAP.feature).toBe('ability');
  });
});

describe('what it refuses, and why refusing is the point', () => {
  it('a row with no creator is REFUSED, not assigned to whoever runs the script', () => {
    // `dnd_homebrew.owner_user_id` is NOT NULL and `created_by` is ON DELETE SET NULL, so a row whose
    // author's account was deleted has nobody to own it. Assigning those to the operator would silently
    // make one person the author of other people's work.
    const out = migrateContentRow(row({ created_by: null }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/no creator/);
  });

  it('an unmapped kind is refused by name', () => {
    const out = migrateContentRow(row({ kind: 'sandwich' }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('sandwich');
  });

  it('a nameless row is refused', () => {
    expect(migrateContentRow(row({ name: '  ' })).ok).toBe(false);
  });

  it('and the reasons come back with the batch, so nothing vanishes into a count', () => {
    const { pieces, skipped } = migrateContentRows([row(), row({ id: 's2', created_by: null }), row({ id: 's3', kind: 'x' })]);
    expect(pieces).toHaveLength(1);
    expect(skipped.map((s) => s.sourceId)).toEqual(['s2', 's3']);
    for (const s of skipped) expect(s.reason.length).toBeGreaterThan(4);
  });
});

describe('what survives the move', () => {
  const out = migrateContentRow(row());
  const piece = out.ok ? out.piece : null;

  it('the engine payload is carried through VERBATIM', () => {
    // `engine/content.ts` reads `data.stats` and `data.effects`. A migrated +1-AC ring has to change the
    // same number it did before, or the migration is a data loss with extra steps.
    expect(piece?.payload.stats).toEqual({ weight: 4 });
    expect(piece?.payload.effects).toEqual([{ target: 'ac', operation: 'add', value: 1 }]);
  });

  it('rarity and attunement ride along rather than being dropped', () => {
    // The Studio's `item` kind has nowhere else to put them, and dropping them quietly turns a legendary
    // attuned item into a mundane one.
    expect(piece?.payload.rarity).toBe('rare');
    expect(piece?.payload.requiresAttunement).toBe(true);
  });

  it('and the provenance is stamped on, which is what makes a re-run safe', () => {
    expect(piece?.payload.migratedFrom).toMatchObject({ table: 'dnd_content', id: 'src-1', kind: 'magic_item', campaignId: 'camp-1' });
  });

  it('EVERYTHING LANDS PRIVATE', () => {
    // A campaign-scoped row was visible to that campaign's members; a Studio piece is visible to its owner
    // or to everyone. Mapping "some people could see it" to "everyone can" is a migration that publishes
    // other people's work.
    expect(piece?.visibility).toBe('private');
  });

  it('the system is `any`, because the row never claimed one', () => {
    // `dnd_content` predates the system column; every row was written when 5e was the only system. `any`
    // says "this was not scoped", which is true — asserting 5e would be inventing an attribute.
    expect(piece?.system).toBe('any');
  });

  it('attribution comes from created_by', () => {
    expect(piece?.owner_user_id).toBe('user-1');
  });

  it('and a junk `data` becomes an empty payload rather than throwing', () => {
    for (const data of [null, 'nope', 42, []]) {
      const o = migrateContentRow(row({ data }));
      expect(o.ok, String(data)).toBe(true);
      if (o.ok) expect(o.piece.payload.stats).toBeUndefined();
    }
  });
});

describe('the summary, since dnd_content has none', () => {
  it('describes what the row was', () => {
    expect(contentSummary(row())).toMatch(/magic item/);
    expect(contentSummary(row())).toMatch(/rare/);
    expect(contentSummary(row())).toMatch(/attunement/);
  });

  it('and still says something for a bare row', () => {
    expect(contentSummary(row({ kind: '', rarity: null, requires_attunement: false }))).toMatch(/Migrated from/);
  });
});

describe('THE CUTOVER IS NOT DONE, and the status says so', () => {
  it('the mapping and script are ready; the migration and the retirement are not', () => {
    // The plan's item is "migrate and retire the old route". Half of that is a code change and half is an
    // operation on live data that has not happened. Claiming the item complete without saying which half
    // shipped is the kind of thing that gets discovered when someone deletes the route.
    expect(CONTENT_MIGRATION_STATUS.mappingComplete).toBe(true);
    expect(CONTENT_MIGRATION_STATUS.scriptReady).toBe(true);
    expect(CONTENT_MIGRATION_STATUS.migrationRun).toBe(false);
    expect(CONTENT_MIGRATION_STATUS.oldRouteRetired).toBe(false);
  });

  it('and the note gives the cutover ORDER', () => {
    expect(CONTENT_MIGRATION_STATUS.note).toMatch(/seed 455/);
    expect(CONTENT_MIGRATION_STATUS.note).toMatch(/run the script/);
  });

  it('the old route is still serving, and was not quietly weakened', () => {
    const route = read('app/api/dnd/content/route.ts');
    expect(route).toContain('export async function POST');
    expect(route).toContain('export async function GET');
  });
});

describe('the script', () => {
  const script = read('scripts/migrate-dnd-content.ts');

  it('DRY RUN IS THE DEFAULT', () => {
    // A one-way copy into a table whose rows are hard to tell apart afterwards. `--write` should be a
    // thing you meant.
    expect(script).toContain("process.argv.includes('--write')");
    expect(script).toMatch(/Dry run\. Nothing was written/);
  });

  it('is idempotent, via the stamped provenance', () => {
    // Which is the property that makes it safe to run at all: a half-finished run can just be re-run.
    expect(script).toContain('migratedFrom');
    expect(script).toMatch(/already\.has\(piece\.sourceId\)/);
  });

  it('prints every skipped row rather than a count', () => {
    expect(script).toMatch(/for \(const s of skipped\) console\.log/);
  });

  it('leaves the source rows alone', () => {
    // Nothing here deletes or updates `dnd_content`. The old rows are the rollback.
    expect(script).not.toMatch(/from\('dnd_content'\)[\s\S]{0,80}\.(delete|update)\(/);
    expect(script).toMatch(/The old rows are UNTOUCHED/);
  });

  it('and does the decisions in the MODULE, not in itself', () => {
    expect(script).toContain('migrateContentRows(rows)');
    expect(script).not.toContain('CONTENT_KIND_MAP');
  });
});
