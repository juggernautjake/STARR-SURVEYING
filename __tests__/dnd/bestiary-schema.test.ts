// __tests__/dnd/bestiary-schema.test.ts — the bestiary schema's load-bearing decisions (P13-2).
//
// A seed cannot be executed here, so these assert the DECISIONS the SQL encodes — the ones a later slice
// could quietly undo while everything still compiles. The same shape as `rsvp.test.ts` pinning seed 460's
// unique constraint.
//
// Every assertion below corresponds to something that would be expensive to discover after 320 SRD rows
// have been imported against the wrong shape.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(join(process.cwd(), 'seeds/462_dnd_bestiary.sql'), 'utf8');
// Comments stripped for the negative assertions — this file's own prose discusses the things it must not
// contain, and matching that prose is the trap this suite has fallen into seven times already.
const code = SQL.replace(/^\s*--.*$/gm, '');

describe('the catalogue table', () => {
  it('is re-importable: UPSERT-able on a stable slug per system', () => {
    // Without this a corrected re-run duplicates the entire bestiary instead of fixing it.
    expect(code).toMatch(/UNIQUE \(slug, system\)/);
  });

  it('cannot hold a row without a licence and an attribution', () => {
    // Legal, not decorative: the source licences require the attribution to travel with the content, so
    // an import must not be able to omit it quietly.
    expect(code).toMatch(/source\s+text NOT NULL/);
    expect(code).toMatch(/licence\s+text NOT NULL/);
    expect(code).toMatch(/attribution\s+text NOT NULL/);
    expect(code).toMatch(/dnd_creatures_attribution_present CHECK/);
  });

  it('stores CR as text with a separate sortable column', () => {
    // 5e CR is fractional below 1 and PF2 level is a different scale — no numeric column is honest for
    // both. `cr_sort` is nullable so an unparseable rating sorts last rather than claiming a rank.
    expect(code).toMatch(/\bcr\s+text\b/);
    expect(code).toMatch(/cr_sort\s+numeric/);
    expect(code).not.toMatch(/\bcr\s+(integer|numeric|int)\b/);
  });

  it('keeps the statblock as one JSONB, not forty columns', () => {
    expect(code).toMatch(/statblock\s+jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
  });

  it('defaults `variant_eligible` to FALSE', () => {
    // The brief is explicit that versioning is selective — a rabbit does not need three stat blocks.
    // Defaulting true would put two thousand pointless variants on the board.
    expect(code).toMatch(/variant_eligible\s+boolean NOT NULL DEFAULT false/);
  });
});

describe('variants are rows, and only for creatures that earn them', () => {
  it('constrains tier to weak/base/elite and one row per tier', () => {
    expect(code).toMatch(/tier IN \('weak', 'base', 'elite'\)/);
    expect(code).toMatch(/UNIQUE \(creature_id, tier\)/);
  });

  it('requires a stated derivation', () => {
    // "Balanced usable" has to be traceable: a number nobody can trace back to a rule is an invented
    // mechanic, which Ground Rule 3 forbids.
    expect(code).toMatch(/derivation\s+text NOT NULL/);
  });

  it('cascades from its creature', () => {
    expect(code).toMatch(/creature_id\s+uuid NOT NULL REFERENCES dnd_creatures\(id\) ON DELETE CASCADE/);
  });
});

describe('forking reuses dnd_homebrew rather than a third table', () => {
  it('adds the provenance columns to the authored-content table', () => {
    // A forked creature is an ordinary homebrew piece, so it is editable, shareable, public/private and
    // adoptable by every mechanism the Studio already has — for free.
    expect(code).toMatch(/ALTER TABLE dnd_homebrew ADD COLUMN IF NOT EXISTS forked_from uuid/);
    expect(code).toMatch(/ALTER TABLE dnd_homebrew ADD COLUMN IF NOT EXISTS forked_from_label text/);
  });

  it('does NOT make forked_from a foreign key', () => {
    // Deliberate: a fork must outlive its ancestor leaving the catalogue, keeping `forked_from_label` as
    // readable provenance when the row is gone. A FK with ON DELETE CASCADE would delete someone's work.
    expect(code).not.toMatch(/forked_from uuid[^;]*REFERENCES/);
  });

  it('leaves the catalogue immutable — no ownership column on dnd_creatures', () => {
    // The reason these are two tables. Adding an owner here is the change that would make the catalogue
    // mutable and start the drift toward one confused table.
    const table = code.slice(code.indexOf('CREATE TABLE IF NOT EXISTS dnd_creatures'), code.indexOf('CREATE TABLE IF NOT EXISTS dnd_creature_variants'));
    expect(table).not.toMatch(/owner_user_id/);
  });
});

describe('RLS and indexes', () => {
  it('enables RLS on both new tables', () => {
    // Every dnd_* table has RLS on with app-code-only authorization; a new table that forgets is a hole.
    expect(code).toMatch(/ALTER TABLE dnd_creatures ENABLE ROW LEVEL SECURITY/);
    expect(code).toMatch(/ALTER TABLE dnd_creature_variants ENABLE ROW LEVEL SECURITY/);
  });

  it('indexes the array filters with GIN, which btree cannot serve', () => {
    expect(code).toMatch(/idx_dnd_creatures_tags ON dnd_creatures USING GIN \(tags\)/);
    expect(code).toMatch(/idx_dnd_creatures_environments ON dnd_creatures USING GIN \(environments\)/);
  });

  it('indexes name search case-insensitively', () => {
    expect(code).toMatch(/lower\(name\)/);
  });
});
