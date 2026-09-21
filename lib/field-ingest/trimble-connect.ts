// lib/field-ingest/trimble-connect.ts — the near-live path (audit §3d, item 8o).
//
// §3d researched this and the answer shaped the whole module:
//
//   *"Trimble Connect has no webhooks. The Core API provides Object Sync, which detects changes
//    SINCE a given timestamp — a polling mechanism, not push. So the architecture is a poller with a
//    cursor, and 'how fresh' is a dial we set (poll interval), not something the vendor pushes to us."*
//
// So: a cursor, an interval, and no pretence of real time. The honest promise is *"the point appears
// shortly after the next sync"* — seconds to a couple of minutes with connectivity. §3d is explicit
// about not over-promising: *"Do not promise 'instant, any brand.' … a firm that switches on the
// strength of a demo and then loses a day's shots in a dead zone is not a customer we get back."*
//
// ── THE CURSOR IS ADVANCED ON SUCCESS, AND ONLY ON SUCCESS ──────────────────────────────────────
//
// If the cursor moves before the points are saved, a failure mid-import loses everything between the
// old cursor and the new one — permanently, silently, and only noticed when somebody goes looking for
// a corner that was definitely shot. So the order is: fetch → ingest → THEN advance. The cost of
// getting this wrong in the other direction is re-reading a window, and `ingestArrival` is
// idempotent by content hash precisely so that costs nothing.
//
// The cursor is also rewound by a small overlap on each poll. Server clocks and file timestamps
// disagree by seconds, and a file written in the same second the cursor was taken can otherwise fall
// between two polls forever.
//
// ── CREDENTIALS ARE OWNER-GATED, THE POLLER IS NOT ──────────────────────────────────────────────
//
// §3d: Trimble Connect *"requires a Trimble Connect licence on the signed-in user to sync field data
// at all. That is a per-customer cost and a per-customer prerequisite."* Nobody here has one, so this
// cannot be tested against the live API. It is written against a narrow `TrimbleConnectClient`
// interface so the logic — cursor handling, ordering, idempotency, error capture — is exercised
// against a fake, and only the HTTP details wait on an account.

import { ingestArrival } from './ingest';
import { supabaseAdmin } from '@/lib/supabase';

/** One file in a Trimble Connect project, as Object Sync reports it. */
export interface ConnectFile {
  id: string;
  name: string;
  /** ISO 8601. What the cursor is compared against. */
  modifiedAt: string;
  size?: number;
}

/** The slice of the Trimble Connect Core API this needs. Deliberately tiny: a wide interface would
 *  have to be faked in full to test a cursor. */
export interface TrimbleConnectClient {
  /** Files in `projectId` changed at or after `since`. `since` null = everything. */
  listChangedFiles(projectId: string, since: string | null): Promise<ConnectFile[]>;
  /** File contents as text. */
  downloadFile(projectId: string, fileId: string): Promise<string>;
}

export interface PollResult {
  sourceId: string;
  filesSeen: number;
  filesImported: number;
  filesAlreadyImported: number;
  pointsImported: number;
  /** Per-file failures. One bad file must not abandon the rest of the sync — a crew's day is in the
   *  other twelve. */
  failures: Array<{ file: string; error: string }>;
  /** The cursor as it stands after this poll. Unchanged from the input when nothing succeeded. */
  cursor: string | null;
}

/** How far back to rewind the cursor on each poll, to cover clock skew between us and the vendor. */
const OVERLAP_SECONDS = 120;

function rewind(cursor: string | null): string | null {
  if (!cursor) return null;
  const t = Date.parse(cursor);
  if (!Number.isFinite(t)) return null;
  return new Date(t - OVERLAP_SECONDS * 1000).toISOString();
}

export interface PollOptions {
  sourceId: string;
  projectId: string;
  cursor: string | null;
  jobId?: string | null;
  /** Extensions worth downloading. A Connect project is full of PDFs, photos and IFC models, and
   *  fetching a 200 MB model to discover it is not a point file is a poll that times out. */
  extensions?: string[];
}

const DEFAULT_EXTENSIONS = ['.xml', '.landxml', '.jxl', '.rw5', '.raw', '.rd5', '.gsi', '.txt', '.csv'];

export async function pollTrimbleConnect(client: TrimbleConnectClient, opts: PollOptions): Promise<PollResult> {
  const exts = (opts.extensions ?? DEFAULT_EXTENSIONS).map((e) => e.toLowerCase());
  const since = rewind(opts.cursor);

  const all = await client.listChangedFiles(opts.projectId, since);
  const candidates = all.filter((f) => exts.some((e) => f.name.toLowerCase().endsWith(e)));

  const result: PollResult = {
    sourceId: opts.sourceId,
    filesSeen: candidates.length,
    filesImported: 0,
    filesAlreadyImported: 0,
    pointsImported: 0,
    failures: [],
    cursor: opts.cursor,
  };

  // Oldest first. Points then arrive in the order they were produced, which is the closest this path
  // can get to the order they were shot — and a later file that supersedes an earlier one lands last.
  const ordered = [...candidates].sort((a, b) => Date.parse(a.modifiedAt) - Date.parse(b.modifiedAt));

  let highWater: number | null = opts.cursor ? Date.parse(opts.cursor) : null;

  for (const file of ordered) {
    try {
      const text = await client.downloadFile(opts.projectId, file.id);
      const res = await ingestArrival(text, {
        sourceId: opts.sourceId,
        jobId: opts.jobId ?? null,
        fileName: file.name,
        createdBy: 'trimble-connect',
      });
      if (res.alreadyImported) result.filesAlreadyImported++;
      else {
        result.filesImported++;
        result.pointsImported += res.imported;
      }
      // Advanced only AFTER the points are saved. Moving it first loses everything between the old
      // cursor and the new one on any failure — permanently, and only noticed when somebody goes
      // looking for a corner that was definitely shot.
      const t = Date.parse(file.modifiedAt);
      if (Number.isFinite(t) && (highWater === null || t > highWater)) highWater = t;
    } catch (err) {
      // One unreadable file does not abandon the sync. A crew's day is in the other twelve, and the
      // cursor deliberately does NOT advance past a failure, so the next poll retries it.
      result.failures.push({ file: file.name, error: err instanceof Error ? err.message : String(err) });
      break;
    }
  }

  if (highWater !== null) result.cursor = new Date(highWater).toISOString();
  return result;
}

/** Run one poll for a configured source and persist the outcome.
 *
 *  Separated from `pollTrimbleConnect` so the logic above stays pure and testable against a fake,
 *  while this half owns the database. */
export async function runSourcePoll(client: TrimbleConnectClient, source: {
  id: string;
  config: { projectId?: string; jobId?: string | null; extensions?: string[] };
  sync_cursor: string | null;
}): Promise<PollResult | { error: string }> {
  const projectId = source.config?.projectId;
  if (!projectId) {
    const error = 'This Trimble Connect source has no projectId configured.';
    await supabaseAdmin.from('instrument_sources').update({ last_polled_at: new Date().toISOString(), last_error: error }).eq('id', source.id);
    return { error };
  }

  try {
    const result = await pollTrimbleConnect(client, {
      sourceId: source.id,
      projectId,
      cursor: source.sync_cursor,
      jobId: source.config.jobId ?? null,
      extensions: source.config.extensions,
    });

    const now = new Date().toISOString();
    await supabaseAdmin.from('instrument_sources').update({
      last_polled_at: now,
      // `last_ok_at` moves only on a clean poll. A source failing on one file every time is still
      // failing, and a green "last polled" timestamp would hide that indefinitely.
      ...(result.failures.length === 0 ? { last_ok_at: now, last_error: null } : { last_error: `${result.failures.length} file(s) failed: ${result.failures[0].error}` }),
      sync_cursor: result.cursor,
      updated_at: now,
    }).eq('id', source.id);

    return result;
  } catch (err) {
    // A whole-poll failure (auth expired, network down). Recorded so a source that has been silently
    // failing for a week is visible — the invisibility store-and-forward creates is the point.
    const error = err instanceof Error ? err.message : String(err);
    await supabaseAdmin.from('instrument_sources').update({
      last_polled_at: new Date().toISOString(),
      last_error: error,
    }).eq('id', source.id);
    return { error };
  }
}

// ── The real client ─────────────────────────────────────────────────────────────────────────────
//
// ── 2026-09-21: THE GUESS WAS WRONG, AND IS NOW CORRECTED ──
//
// This client was written against a guessed API shape and said so, on the grounds that "a
// plausible-looking wrong implementation is worse than an honest gap." That caution was justified:
// the owner produced the published Core API reference, and `listChangedFiles` was hitting the wrong
// service entirely.
//
// It called `GET /files?projectId=…&modifiedAfter=…`. No such filter is documented. What exists is
// a dedicated service, which is precisely the cursor mechanism this module was built around:
//
//     GET /projects/{projectId}/objects   — "Get project content changes since last time"
//     GET /projects/{projectId}/status    — "Get project content sync cursor"
//
// Trimble's own description: "Object Sync helps detect changes to project content after a specified
// date and time. Project content includes Files, Folders, Releases, Views, User groups, and Users."
//
// So the cursor is now the SERVER's, not a timestamp we compose. That is strictly better: the two
// clocks problem this file worries about elsewhere does not arise if we never invent the cursor.
// `OVERLAP_SECONDS` stays for the timestamp fallback path, because a project that has never been
// synced has no cursor to start from.
//
// `GET /files/fs/{fileId}/downloadurl` was already correct and is unchanged.
//
// Base URL is region-specific and `app.connect.trimble.com` is the US master region — correct for
// this firm. The EU/UK/AP regions have their own hosts, which is why this stays an env var.
//
// Still unverified against a live account: the exact response shape of `/objects`. The mapping
// below is defensive about it rather than confident, and `runSourcePoll` records what came back.

export class TrimbleConnectNotConfigured extends Error {
  constructor() {
    super(
      'Trimble Connect is not configured. It needs (1) a paid Business licence — a personal/free ' +
      'subscription cannot use the API, (2) a Trimble ID on a CORPORATE domain, not a free email ' +
      'provider, and (3) OAuth credentials from the Request for API Credentials form. ' +
      'Until then, use the collector upload on the field data tab: it works with every vendor and ' +
      'needs no account at all.',
    );
    this.name = 'TrimbleConnectNotConfigured';
  }
}

export function createTrimbleConnectClient(): TrimbleConnectClient {
  const token = process.env.TRIMBLE_CONNECT_TOKEN;
  if (!token) throw new TrimbleConnectNotConfigured();
  const base = process.env.TRIMBLE_CONNECT_API_URL ?? 'https://app.connect.trimble.com/tc/api/2.0';

  return {
    async listChangedFiles(projectId, since) {
      // Object Sync. `since` is whatever the last successful poll stored — a server cursor when we
      // have one, an ISO timestamp on the first run. Both are sent as `since`; the service accepts
      // a date and returns a cursor, and the cursor is what gets stored for next time.
      const url = new URL(`${base}/projects/${encodeURIComponent(projectId)}/objects`);
      if (since) url.searchParams.set('since', since);
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`Trimble Connect object sync failed: ${r.status} ${await r.text()}`);

      // Object Sync returns every kind of project content — "Files, Folders, Releases, Views, User
      // groups, and Users". Only files carry points, so everything else is dropped here rather than
      // being handed to a parser that would report it as a malformed survey file.
      //
      // The envelope shape is not confirmed against a live account, so both a bare array and a
      // `{ items: [...] }` wrapper are accepted. Guessing one and being wrong would produce an
      // empty sync that looks like "no new points" forever.
      const body = (await r.json()) as unknown;
      const rows: Array<Record<string, unknown>> = Array.isArray(body)
        ? (body as Array<Record<string, unknown>>)
        : Array.isArray((body as { items?: unknown })?.items)
          ? ((body as { items: Array<Record<string, unknown>> }).items)
          : [];

      return rows
        .filter((o) => {
          const type = String(o.type ?? o.objectType ?? 'FILE').toUpperCase();
          const deleted = o.deleted === true || String(o.action ?? '').toUpperCase() === 'DELETED';
          return type === 'FILE' && !deleted;
        })
        .map((o) => ({
          id: String(o.id ?? o.objectId ?? ''),
          name: String(o.name ?? o.fileName ?? ''),
          modifiedAt: String(o.modifiedAt ?? o.versionModifiedAt ?? o.lastModified ?? new Date(0).toISOString()),
          size: typeof o.size === 'number' ? o.size : undefined,
        }))
        .filter((f) => f.id && f.name);
    },
    async downloadFile(projectId, fileId) {
      const r = await fetch(`${base}/files/fs/${encodeURIComponent(fileId)}/downloadurl`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`Trimble Connect downloadFile failed: ${r.status}`);
      const { url } = (await r.json()) as { url: string };
      const content = await fetch(url);
      if (!content.ok) throw new Error(`Trimble Connect download failed: ${content.status}`);
      return content.text();
    },
  };
}
