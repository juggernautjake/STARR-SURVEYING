// lib/dnd/export/campaign-export.ts — everything a campaign is, as one JSON document (P9-2, audit H-2).
//
// P2-5 made deleting a campaign deliberate: archive is the default, the hard delete needs `?hard=1` and a
// confirmation naming what it destroys. What it could not do was make the delete SAFE, because there was
// no way to keep what was about to be destroyed. A confirmation dialog that lists eight things you are
// about to lose forever is not safety; it is a better warning.
//
// THE MANIFEST IS THE WHOLE DESIGN. A hand-written export that reads six tables is right until someone
// adds a seventh, and then it silently returns an incomplete backup — the worst possible failure here,
// because it looks like a complete one and is discovered only when someone tries to restore. So every
// campaign-scoped table is listed below with HOW it links to the campaign, and every table deliberately
// left out is listed with WHY. A test derives the candidate set from `seeds/*.sql` and fails if a table
// declaring a `campaign_id` appears in neither list.

/** How a table's rows are found from a campaign id. */
export type CampaignLink =
  /** The table has its own `campaign_id`. */
  | { via: 'campaign' }
  /** The table hangs off a session; rows are found from the campaign's session ids. */
  | { via: 'session'; column: 'session_id' }
  /** The table hangs off an encounter, which hangs off a session. */
  | { via: 'encounter'; column: 'encounter_id' };

export interface CampaignTable {
  table: string;
  link: CampaignLink;
  /** The key in the exported document. */
  key: string;
  /** What it holds, in the words the confirmation dialog uses. */
  describes: string;
}

/**
 * Every campaign-scoped table the export carries.
 *
 * `dnd_characters` is NOT here and that is the single most important line in this file — see
 * `CAMPAIGN_EXPORT_EXCLUSIONS`.
 */
export const CAMPAIGN_EXPORT_TABLES: CampaignTable[] = [
  { table: 'dnd_campaign_members', link: { via: 'campaign' }, key: 'members', describes: 'roster entries' },
  { table: 'dnd_campaign_characters', link: { via: 'campaign' }, key: 'characterLinks', describes: 'character links' },
  { table: 'dnd_sessions', link: { via: 'campaign' }, key: 'sessions', describes: 'sessions' },
  { table: 'dnd_recaps', link: { via: 'session', column: 'session_id' }, key: 'recaps', describes: 'session recaps' },
  { table: 'dnd_encounters', link: { via: 'session', column: 'session_id' }, key: 'encounters', describes: 'encounters' },
  { table: 'dnd_initiative_entries', link: { via: 'encounter', column: 'encounter_id' }, key: 'initiativeEntries', describes: 'initiative order' },
  { table: 'dnd_handouts', link: { via: 'campaign' }, key: 'handouts', describes: 'handouts' },
  { table: 'dnd_maps', link: { via: 'campaign' }, key: 'maps', describes: 'maps' },
  { table: 'dnd_media', link: { via: 'campaign' }, key: 'media', describes: 'uploaded media' },
  { table: 'dnd_content', link: { via: 'campaign' }, key: 'content', describes: 'campaign content' },
  { table: 'dnd_messages', link: { via: 'campaign' }, key: 'messages', describes: 'chat' },
  { table: 'dnd_roll_log', link: { via: 'campaign' }, key: 'rollLog', describes: 'logged rolls' },
  { table: 'dnd_invites', link: { via: 'campaign' }, key: 'invites', describes: 'invites' },
  { table: 'dnd_soundboard_tabs', link: { via: 'campaign' }, key: 'soundboardTabs', describes: 'soundboard tabs' },
  { table: 'dnd_sounds', link: { via: 'campaign' }, key: 'sounds', describes: 'sounds' },
  { table: 'dnd_session_rsvps', link: { via: 'session', column: 'session_id' }, key: 'rsvps', describes: 'session RSVPs' },
];

/**
 * Campaign-scoped tables deliberately NOT exported, each with the reason.
 *
 * Absence has to be a recorded decision, or the next person to read the manifest cannot tell "we chose
 * not to" from "we missed it" — and the whole value of the manifest is that the difference is visible.
 */
export const CAMPAIGN_EXPORT_EXCLUSIONS: { table: string; why: string }[] = [
  {
    table: 'dnd_characters',
    why:
      'Characters are NOT the campaign’s to export. They survive its deletion by design — the delete handler ' +
      'detaches them (`campaign_id: null`) precisely so a DM closing their table cannot destroy other people’s ' +
      'sheets — and each already has its own loss-less per-character export (P9-1) that its OWNER controls. ' +
      'Bundling a player’s full sheet into a document the DM downloads would hand one person a copy of ' +
      'everyone else’s character, which is a privacy decision dressed up as a convenience. The roster link is ' +
      'exported instead, so a restore knows who played here.',
  },
];

export interface CampaignExport {
  /** The format's own version, so a future importer can tell what it is looking at. */
  formatVersion: 1;
  exportedAt: string;
  campaign: Record<string, unknown>;
  tables: Record<string, unknown[]>;
  /** Row counts, so the file states its own completeness without anyone counting arrays by hand. */
  counts: Record<string, number>;
  /** Carried INTO the file — a reader six months from now should not have to find this source. */
  excludes: { table: string; why: string }[];
}

/** Build the document. Pure: the route does the fetching, this decides the shape. */
export function buildCampaignExport(args: {
  campaign: Record<string, unknown>;
  tables: Record<string, unknown[]>;
  exportedAt: string;
}): CampaignExport {
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  // Every manifest key appears, EMPTY ARRAY INCLUDED. A missing key and an empty array mean different
  // things to whoever restores this: "that table was not read" versus "that table had nothing in it".
  for (const t of CAMPAIGN_EXPORT_TABLES) {
    const rows = args.tables[t.key] ?? [];
    tables[t.key] = rows;
    counts[t.key] = rows.length;
  }
  return {
    formatVersion: 1,
    exportedAt: args.exportedAt,
    campaign: args.campaign,
    tables,
    counts,
    excludes: CAMPAIGN_EXPORT_EXCLUSIONS,
  };
}

export function campaignExportToJson(doc: CampaignExport): string {
  return JSON.stringify(doc, null, 2);
}

/** A safe, lower-kebab file base from the campaign name. Mirrors `exportFileBase` for characters. */
export function campaignExportFileBase(name: string): string {
  const slug = (name || 'campaign').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'campaign';
}

/** One line per thing the export carries — the same words the delete confirmation uses. */
export function campaignExportSummary(doc: CampaignExport): string {
  const parts = CAMPAIGN_EXPORT_TABLES
    .filter((t) => (doc.counts[t.key] ?? 0) > 0)
    .map((t) => `${doc.counts[t.key]} ${t.describes}`);
  return parts.length ? parts.join(', ') : 'nothing beyond the campaign itself';
}
