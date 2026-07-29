// __tests__/dnd/campaign-export.test.ts — the whole campaign, as one file (P9-2, audit H-2).
//
// P2-5 made deleting a campaign deliberate — archive by default, `?hard=1` plus a confirmation naming what
// it destroys. It could not make it SAFE, because there was no way to keep what was about to go. A dialog
// listing eight things you are about to lose forever is a better warning, not a safety net.
//
// THE MANIFEST IS THE DESIGN, AND THIS FILE IS WHAT MAKES IT TRUE. A hand-written export that reads six
// tables is right until someone adds a seventh, and then it silently returns an incomplete backup — the
// worst failure available here, because it looks complete and is discovered only when someone restores.
// The coverage test below derives the candidate set from `seeds/*.sql`, so adding a campaign-scoped table
// fails here until it is either exported or excluded with a reason.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CAMPAIGN_EXPORT_TABLES, CAMPAIGN_EXPORT_EXCLUSIONS, buildCampaignExport, campaignExportToJson,
  campaignExportFileBase, campaignExportSummary,
} from '@/lib/dnd/export/campaign-export';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Every `dnd_*` table whose CREATE TABLE declares a `campaign_id`, read out of the seeds. */
function tablesWithCampaignId(): string[] {
  const dir = join(process.cwd(), 'seeds');
  const found = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(dir, file), 'utf8');
    // Each CREATE TABLE block up to its closing paren.
    const re = /CREATE TABLE(?: IF NOT EXISTS)?\s+(dnd_[a-z_]+)\s*\(([\s\S]*?)\n\s*\)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
      if (/\bcampaign_id\b/.test(m[2])) found.add(m[1].toLowerCase());
    }
  }
  return [...found].sort();
}

describe('THE COVERAGE GUARD — a new campaign-scoped table cannot slip past', () => {
  const declared = tablesWithCampaignId();
  const exported = new Set(CAMPAIGN_EXPORT_TABLES.map((t) => t.table));
  const excluded = new Set(CAMPAIGN_EXPORT_EXCLUSIONS.map((t) => t.table));

  it('the seeds really do declare campaign-scoped tables (the scan is not vacuously passing)', () => {
    // A regex that matched nothing would make every assertion below trivially true, which is the way a
    // guard like this dies quietly.
    expect(declared.length).toBeGreaterThan(8);
    expect(declared).toContain('dnd_sessions');
    expect(declared).toContain('dnd_roll_log');
  });

  it('every table with a campaign_id is EXPORTED or EXCLUDED WITH A REASON', () => {
    const unaccounted = declared.filter((t) => !exported.has(t) && !excluded.has(t));
    expect(unaccounted, `add these to CAMPAIGN_EXPORT_TABLES or CAMPAIGN_EXPORT_EXCLUSIONS: ${unaccounted.join(', ')}`)
      .toEqual([]);
  });

  it('and nothing is in both lists', () => {
    for (const t of CAMPAIGN_EXPORT_TABLES) expect(excluded.has(t.table), t.table).toBe(false);
  });

  it('every exclusion states WHY, at length', () => {
    // Absence has to be a recorded decision. "we chose not to" and "we missed it" look identical
    // otherwise, and the whole value of the manifest is that the difference is visible.
    expect(CAMPAIGN_EXPORT_EXCLUSIONS.length).toBeGreaterThan(0);
    for (const e of CAMPAIGN_EXPORT_EXCLUSIONS) expect(e.why.length, e.table).toBeGreaterThan(80);
  });

  it('CHARACTERS ARE EXCLUDED, and that is a privacy decision, not an oversight', () => {
    // They survive the campaign's deletion by design (the delete handler detaches them first), each has
    // its own loss-less export that its OWNER controls, and bundling every player's full sheet into a
    // file the DM downloads hands one person a copy of everyone else's character.
    expect(excluded.has('dnd_characters')).toBe(true);
    const why = CAMPAIGN_EXPORT_EXCLUSIONS.find((e) => e.table === 'dnd_characters')!.why;
    expect(why).toMatch(/detach/i);
    expect(why).toMatch(/own/i);
    // …but the LINK is kept, so a restore still knows who played here.
    expect(exported.has('dnd_campaign_characters')).toBe(true);
  });
});

describe('the manifest is well-formed', () => {
  it('keys and tables are unique', () => {
    expect(new Set(CAMPAIGN_EXPORT_TABLES.map((t) => t.key)).size).toBe(CAMPAIGN_EXPORT_TABLES.length);
    expect(new Set(CAMPAIGN_EXPORT_TABLES.map((t) => t.table)).size).toBe(CAMPAIGN_EXPORT_TABLES.length);
  });

  it('every entry describes itself in the words the delete dialog uses', () => {
    for (const t of CAMPAIGN_EXPORT_TABLES) {
      expect(t.describes.trim().length, t.table).toBeGreaterThan(2);
      expect(t.describes, t.table).not.toMatch(/^dnd_/);
    }
  });

  it('indirect links name the column they join on', () => {
    // A `via: 'session'` entry with no column would silently read the whole table.
    for (const t of CAMPAIGN_EXPORT_TABLES) {
      if (t.link.via !== 'campaign') expect(t.link.column, t.table).toBeTruthy();
    }
  });

  it('and the tables that need a session/encounter really are the indirect ones', () => {
    const indirect = CAMPAIGN_EXPORT_TABLES.filter((t) => t.link.via !== 'campaign').map((t) => t.table);
    // Recaps, encounters and RSVPs hang off a session; initiative hangs off an encounter. None of them
    // has a campaign_id, so a `via: 'campaign'` entry for any would return nothing at all — an empty
    // array that reads as "this campaign had no recaps".
    expect(indirect).toContain('dnd_recaps');
    expect(indirect).toContain('dnd_encounters');
    expect(indirect).toContain('dnd_initiative_entries');
    for (const t of indirect) expect(tablesWithCampaignId(), t).not.toContain(t);
  });
});

describe('buildCampaignExport', () => {
  const doc = buildCampaignExport({
    campaign: { id: 'c1', name: 'The Sunless Road', visibility: 'unlisted' },
    tables: { sessions: [{ id: 's1' }, { id: 's2' }], rollLog: [{ id: 'r1' }] },
    exportedAt: '2026-07-29T00:00:00.000Z',
  });

  it('EVERY manifest key appears, empty array included', () => {
    // A missing key and an empty array mean different things to whoever restores this: "that table was
    // not read" versus "that table had nothing in it". Only one of those is a reason to worry.
    for (const t of CAMPAIGN_EXPORT_TABLES) {
      expect(doc.tables, t.key).toHaveProperty(t.key);
      expect(Array.isArray(doc.tables[t.key]), t.key).toBe(true);
    }
  });

  it('counts match the arrays, so the file states its own completeness', () => {
    for (const [k, rows] of Object.entries(doc.tables)) expect(doc.counts[k], k).toBe(rows.length);
    expect(doc.counts.sessions).toBe(2);
    expect(doc.counts.rollLog).toBe(1);
    expect(doc.counts.handouts).toBe(0);
  });

  it('carries the format version and the campaign row itself', () => {
    expect(doc.formatVersion).toBe(1);
    expect(doc.campaign).toMatchObject({ id: 'c1', name: 'The Sunless Road' });
    expect(doc.exportedAt).toBe('2026-07-29T00:00:00.000Z');
  });

  it('and carries the EXCLUSIONS into the file', () => {
    // A reader six months from now should not have to find this repo to learn why their characters are
    // not in their campaign backup.
    expect(doc.excludes.some((e) => e.table === 'dnd_characters')).toBe(true);
  });

  it('round-trips through JSON unchanged', () => {
    expect(JSON.parse(campaignExportToJson(doc))).toEqual(doc);
  });

  it('the summary names only what is actually there', () => {
    expect(campaignExportSummary(doc)).toBe('2 sessions, 1 logged rolls');
    const empty = buildCampaignExport({ campaign: {}, tables: {}, exportedAt: 'x' });
    expect(campaignExportSummary(empty)).toMatch(/nothing beyond the campaign itself/);
  });

  it('and the filename base is safe', () => {
    expect(campaignExportFileBase('The Sunless Road')).toBe('the-sunless-road');
    expect(campaignExportFileBase('  ***  ')).toBe('campaign');
    expect(campaignExportFileBase('')).toBe('campaign');
  });
});

describe('the route', () => {
  const route = read('app/api/dnd/campaigns/[id]/export/route.ts');

  it('is DM-only — it contains the whole chat log, every roll and the invite list', () => {
    expect(route).toContain("getCampaignRole(params.id)) !== 'dm'");
    expect(route).toContain("status: 403");
  });

  it('and throttled, since it reads every row of a dozen tables', () => {
    expect(route).toContain("enforceRateLimit('write', session.userId)");
  });

  it('resolves sessions and encounters FIRST, because the indirect links need them', () => {
    expect(route).toContain("from('dnd_sessions').select('id').eq('campaign_id', params.id)");
    expect(route).toContain("from('dnd_encounters').select('id').in('session_id', sessionIds)");
  });

  it('a missing table yields [] rather than a 500', () => {
    // Several of these arrive with later seeds. An export that dies because the soundboard was never
    // migrated is useless in exactly the situation it exists for — and the empty result is still
    // counted, so a thin backup is visibly thin rather than silently wrong.
    expect(route).toMatch(/catch \{\s*return \[\];/);
  });

  it('and iterates the MANIFEST rather than a list written in the route', () => {
    expect(route).toContain('for (const entry of CAMPAIGN_EXPORT_TABLES)');
  });
});

describe('AND IT HAS A DOOR, at the moment it matters', () => {
  const ui = read('app/dnd/_ui/CampaignVisibilityControl.tsx');

  it('the export button sits in the same panel as archive and delete', () => {
    expect(ui).toContain('exportCampaign');
    expect(ui).toContain('/export`)');
  });

  it('and is offered AGAIN inside the delete confirmation', () => {
    // Someone who reached that dialog did not read the toolbar. Telling them there costs one line and is
    // the difference between a warning and a way out.
    expect(ui).toContain('Export everything first');
  });

  it('with its own busy flag, so an archive does not claim to be a download', () => {
    expect(ui).toContain('exporting ?');
    expect(ui).toContain('setExporting(false)');
  });
});
