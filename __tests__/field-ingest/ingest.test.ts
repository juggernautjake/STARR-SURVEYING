// Field ingestion — store-and-forward, two clocks, idempotency (audit §3d, items 8n–8o).
//
// §3d's constraint is the design: *"points arrive late, in bursts, and out of order, hours after they
// were shot. A design that assumes ordered near-real-time arrival will look perfect in town and lose
// data in the field."* Everything asserted here is about what happens when arrival is not orderly.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseArrival, hashContent } from '@/lib/field-ingest/ingest';
import { pollTrimbleConnect, TrimbleConnectNotConfigured, createTrimbleConnectClient, type TrimbleConnectClient, type ConnectFile } from '@/lib/field-ingest/trimble-connect';

const ROOT = process.cwd();

const LANDXML = `<LandXML version="1.2">
  <Units><Imperial linearUnit="USSurveyFoot" /></Units>
  <CgPoints>
    <CgPoint name="1" code="IPF">3162345.12 942111.87 812.40</CgPoint>
    <CgPoint name="2" code="IPS">3162400.55 942150.00</CgPoint>
  </CgPoints>
</LandXML>`;

const GSI = '110001+00000001 81..00+12345678 82..00+87654321 83..00+00123400';
const RW5 = ['MO,AD0,UN0', 'SP,PN1,N 100.0000,E 200.0000,EL10.0000,--IPF corner'].join('\n');

describe('one path for every arrival', () => {
  it.each([
    [LANDXML, 'landxml', 2],
    [GSI, 'gsi', 1],
    [RW5, 'rw5', 1],
  ])('reads %#', (text, format, count) => {
    const a = parseArrival(text as string);
    expect(a.format).toBe(format);
    expect(a.points).toHaveLength(count as number);
  });

  it('refuses a file it cannot recognise instead of importing nonsense', () => {
    // Feeding GSI to the CSV reader produces rows — plausible-looking rows with the point number
    // parsed out of a word index. A refusal is the better failure.
    expect(() => parseArrival('a readme about surveying', 'notes.txt')).toThrow(/no reader was chosen|Could not recognise/);
  });

  it('never invents a measured_at', () => {
    // A point stamped with its upload time reads as having been shot at 6pm from the office car
    // park. Null is the honest answer when the format did not record it — which is all of them.
    for (const text of [LANDXML, GSI, RW5]) {
      for (const p of parseArrival(text).points) expect(p.measuredAt).toBeNull();
    }
  });

  it('records the unit the points are actually in, not the one the file claimed', () => {
    // The GSI reader normalises every block to metres, so echoing the instrument's own unit here
    // would label metres as feet.
    expect(parseArrival(GSI).unit).toBe('meter');
    expect(parseArrival(LANDXML).unit).toBe('USSurveyFoot');
    expect(parseArrival(RW5).unit).toBe('feet');
  });

  it('says out loud when a CSV was read with a guessed column mapping', () => {
    const csv = '1,3162345.12,942111.87,812.40,IPF\n2,3162400.55,942150.00,810.10,IPS\n3,3162450.00,942200.00,809.00,IPS';
    const a = parseArrival(csv);
    expect(a.format).toBe('csv');
    // A PENZD file read as PNEZD swaps northing and easting, and the swap is invisible once imported.
    expect(a.warnings.join(' ')).toMatch(/default PNEZD column mapping/);
  });

  it('carries the reader warnings through instead of dropping them', () => {
    // "14 points had no coordinates" is the sentence that explains a short import.
    const noUnits = '<LandXML version="1.2"><CgPoints><CgPoint name="1">1 2 3</CgPoint></CgPoints></LandXML>';
    expect(parseArrival(noUnits).warnings.join(' ')).toMatch(/No linear unit/);
  });

  it('hashes content, so the same bytes are the same arrival whatever the file was called', () => {
    expect(hashContent(LANDXML)).toBe(hashContent(LANDXML));
    expect(hashContent(LANDXML)).not.toBe(hashContent(GSI));
  });
});

// ── The poller ───────────────────────────────────────────────────────────────────────────────────

function fakeClient(files: ConnectFile[], contents: Record<string, string>, failOn?: string): TrimbleConnectClient {
  return {
    async listChangedFiles(_projectId, since) {
      if (!since) return files;
      const t = Date.parse(since);
      return files.filter((f) => Date.parse(f.modifiedAt) >= t);
    },
    async downloadFile(_projectId, fileId) {
      if (fileId === failOn) throw new Error('download blew up');
      return contents[fileId] ?? '';
    },
  };
}

// `ingestArrival` talks to Postgres; the poller's logic is what these tests are about, so the
// database half is faked. Each call returns a fresh, successful import unless told otherwise.
const ingestMock = vi.fn();
vi.mock('@/lib/field-ingest/ingest', async (orig) => {
  const actual = await orig<typeof import('@/lib/field-ingest/ingest')>();
  return { ...actual, ingestArrival: (...args: unknown[]) => ingestMock(...args) };
});

describe('Trimble Connect poller', () => {
  beforeEach(() => {
    ingestMock.mockReset();
    ingestMock.mockResolvedValue({ batchId: 'b', alreadyImported: false, imported: 10, skipped: 0, format: 'landxml', warnings: [] });
  });

  const files: ConnectFile[] = [
    { id: 'f3', name: 'topo-c.landxml', modifiedAt: '2026-08-01T12:00:00.000Z' },
    { id: 'f1', name: 'topo-a.landxml', modifiedAt: '2026-08-01T10:00:00.000Z' },
    { id: 'f2', name: 'topo-b.rw5', modifiedAt: '2026-08-01T11:00:00.000Z' },
    { id: 'x1', name: 'sitephoto.jpg', modifiedAt: '2026-08-01T11:30:00.000Z' },
    { id: 'x2', name: 'model.ifc', modifiedAt: '2026-08-01T11:45:00.000Z' },
  ];
  const contents = { f1: LANDXML, f2: RW5, f3: LANDXML };

  it('skips files that are not point files', async () => {
    // A Connect project is full of PDFs, photos and IFC models. Fetching a 200 MB model to discover
    // it is not a point file is a poll that times out.
    const r = await pollTrimbleConnect(fakeClient(files, contents), { sourceId: 's', projectId: 'p', cursor: null });
    expect(r.filesSeen).toBe(3);
    expect(r.filesImported).toBe(3);
  });

  it('imports oldest first, so points arrive in the order they were produced', async () => {
    await pollTrimbleConnect(fakeClient(files, contents), { sourceId: 's', projectId: 'p', cursor: null });
    const names = ingestMock.mock.calls.map((c) => (c[1] as { fileName: string }).fileName);
    expect(names).toEqual(['topo-a.landxml', 'topo-b.rw5', 'topo-c.landxml']);
  });

  it('advances the cursor to the newest file it actually imported', async () => {
    const r = await pollTrimbleConnect(fakeClient(files, contents), { sourceId: 's', projectId: 'p', cursor: null });
    expect(r.cursor).toBe('2026-08-01T12:00:00.000Z');
  });

  it('does NOT advance the cursor past a failure', async () => {
    // Moving it first loses everything between the old cursor and the new one — permanently,
    // silently, and only noticed when somebody goes looking for a corner that was definitely shot.
    const r = await pollTrimbleConnect(fakeClient(files, contents, 'f2'), { sourceId: 's', projectId: 'p', cursor: null });
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].file).toBe('topo-b.rw5');
    // f1 (10:00) succeeded, f2 (11:00) failed → the cursor stops at f1, so the next poll retries f2.
    expect(r.cursor).toBe('2026-08-01T10:00:00.000Z');
  });

  it('rewinds the cursor by an overlap, so a file written on the boundary is not lost forever', async () => {
    // Server clocks and file timestamps disagree by seconds. Without an overlap, a file written in
    // the same second the cursor was taken falls between two polls and is never seen again.
    const seen: Array<string | null> = [];
    const client: TrimbleConnectClient = {
      async listChangedFiles(_p, since) { seen.push(since); return []; },
      async downloadFile() { return ''; },
    };
    await pollTrimbleConnect(client, { sourceId: 's', projectId: 'p', cursor: '2026-08-01T12:00:00.000Z' });
    expect(seen[0]).toBe('2026-08-01T11:58:00.000Z');
  });

  it('does not double-import when the overlap re-serves a file', async () => {
    // The price of the overlap, paid by content-hash idempotency rather than by cleverness.
    ingestMock.mockResolvedValue({ batchId: 'b', alreadyImported: true, imported: 4, skipped: 0, format: 'landxml', warnings: [] });
    const r = await pollTrimbleConnect(fakeClient(files, contents), { sourceId: 's', projectId: 'p', cursor: null });
    expect(r.filesAlreadyImported).toBe(3);
    expect(r.filesImported).toBe(0);
    expect(r.pointsImported).toBe(0);
  });

  it('keeps a null cursor when the first poll finds nothing', async () => {
    const r = await pollTrimbleConnect(fakeClient([], {}), { sourceId: 's', projectId: 'p', cursor: null });
    expect(r.cursor).toBeNull();
    expect(r.filesSeen).toBe(0);
  });
});

describe('what is honestly not built', () => {
  it('refuses clearly when no Trimble credentials exist rather than half-working', () => {
    // §3d: a Connect licence is a per-customer prerequisite, not a settings field. A plausible-looking
    // wrong implementation would look built, fail in production, and be debugged by somebody who
    // assumed it had been tested.
    const prev = process.env.TRIMBLE_CONNECT_TOKEN;
    delete process.env.TRIMBLE_CONNECT_TOKEN;
    expect(() => createTrimbleConnectClient()).toThrow(TrimbleConnectNotConfigured);
    try {
      createTrimbleConnectClient();
    } catch (e) {
      // …and points at the path that DOES work today.
      expect((e as Error).message).toMatch(/watched folder/);
    }
    if (prev) process.env.TRIMBLE_CONNECT_TOKEN = prev;
  });
});

describe('the two clocks are structural, not conventional', () => {
  const seed = fs.readFileSync(path.join(ROOT, 'seeds/522_field_ingest.sql'), 'utf8');
  const ingest = fs.readFileSync(path.join(ROOT, 'lib/field-ingest/ingest.ts'), 'utf8');
  const api = fs.readFileSync(path.join(ROOT, 'app/api/admin/field-ingest/route.ts'), 'utf8');

  it('makes received_at impossible for a client to supply', () => {
    // The column defaults and no insert lists it, so no code path can accidentally write a client's
    // clock into the field that answers "what is new".
    expect(seed).toMatch(/received_at\s+timestamptz NOT NULL DEFAULT now\(\)/);
    expect(ingest).not.toMatch(/received_at:/);
  });

  it('allows measured_at to be null, because most formats do not record it', () => {
    expect(seed).toMatch(/measured_at\s+timestamptz,/);
    expect(seed).not.toMatch(/measured_at\s+timestamptz NOT NULL/);
  });

  it('says in the schema which clock answers which question', () => {
    // The next person to write a query will otherwise pick whichever one autocompletes first.
    expect(seed).toMatch(/COMMENT ON COLUMN instrument_points\.measured_at/);
    expect(seed).toMatch(/COMMENT ON COLUMN instrument_points\.received_at/);
    expect(seed).toMatch(/NEVER to answer "when was this shot"/);
  });

  it('returns both clocks together, so a caller cannot present one as the other', () => {
    expect(api).toMatch(/measured_at, received_at/);
  });

  it('records a FAILED arrival rather than only throwing', () => {
    // A watched folder rejecting the crew's export for a week produces no error anywhere unless the
    // failure is written down — the exact invisibility store-and-forward creates.
    expect(ingest).toMatch(/status: 'failed'/);
  });

  it('dedupes on content so a re-upload is not a second day of points', () => {
    expect(seed).toMatch(/idx_ingest_batches_dedupe/);
    expect(ingest).toMatch(/\.eq\('file_hash', fileHash\)/);
    expect(api).toMatch(/already imported — nothing was duplicated/);
  });
});
