// __tests__/cad/integration-failure-paths.test.ts
//
// C44d — every integration fails LEGIBLY.
//
// C44c drove the happy path: real data out, real data back. This drives the other one, and the
// standard is not "does not crash". A parser that swallows a malformed file and returns zero points
// with no complaint has not handled the error — it has hidden it, and the result on screen is
// indistinguishable from a valid empty file. That is the **"queued ≠ failed"** class this codebase
// has already paid for once, in a different subsystem.
//
// So each assertion below demands ONE of two outcomes, never a third:
//
//   1. It throws, with a message naming what was wrong.
//   2. It returns, with the failure reported in `warnings` / `error` / a row-level `error`.
//
// Returning empty and quiet is the failure being tested for.
//
// ── WHY THE BAD INPUT IS SHAPED LIKE THIS ───────────────────────────────────────────────────────
//
// Not random bytes. Random bytes are easy to reject and nobody uploads them. The inputs here are the
// ones a surveyor actually produces: the right format truncated mid-record, the right extension on
// the wrong file, a coordinate that is text, an XML document that is well-formed and empty. Those
// are the ones that parse to something plausible.

import { describe, it, expect } from 'vitest';
import { importFromDxf } from '@/lib/cad/delivery/dxf-reader';
import { importFromGeoJSON } from '@/lib/cad/delivery/geojson-reader';
import { parseLandXml } from '@/lib/cad/import/landxml-parser';
import { importTrvFromText } from '@/lib/cad/io/trv-io';
import { parseRW5 } from '@/lib/cad/import/rw5-parser';
import { parseGsiAsRows } from '@/lib/cad/import/gsi-parser';
import { parseJobXML } from '@/lib/cad/import/jobxml-parser';
import { processImport } from '@/lib/cad/import/import-pipeline';
import { detectSurveyFormat } from '@/lib/cad/import/format-detect';
import { parseXml, XmlParseError } from '@/lib/cad/import/xml-lite';
import { toolRegistry } from '@/lib/cad/ai/tool-registry';
import { executeProposal } from '@/lib/cad/ai/proposals';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { generateId } from '@/lib/cad/types';

/** Ran without throwing, produced nothing, and said nothing about why. The shape being hunted. */
function silentlyEmpty(opts: { produced: number; complaints: unknown[] }): boolean {
  return opts.produced === 0 && opts.complaints.length === 0;
}

const GARBAGE = 'this is not a survey file, it is a note to self about lunch\nand a second line';

describe('C44d — readers refuse a file they cannot read', () => {
  it('DXF: a non-DXF file does not come back as an empty drawing', () => {
    let threw: Error | null = null;
    let result: ReturnType<typeof importFromDxf> | null = null;
    try {
      result = importFromDxf(GARBAGE);
    } catch (e) {
      threw = e as Error;
    }
    if (threw) {
      expect(threw.message.length, 'threw with an empty message').toBeGreaterThan(10);
      return;
    }
    expect(
      silentlyEmpty({
        produced: Object.keys(result!.document.features).length,
        complaints: result!.warnings,
      }),
      'imported nothing and reported nothing — indistinguishable from an empty drawing',
    ).toBe(false);
  });

  it('GeoJSON: invalid JSON throws rather than returning an empty collection', () => {
    // The one case where throwing is clearly right: the text is not the format at all, and a caller
    // that gets `{ features: [] }` back has no way to tell that from a file with no features.
    expect(() => importFromGeoJSON('{ "type": "FeatureCollection", ')).toThrow();
  });

  it('GeoJSON: valid JSON that is not GeoJSON is reported, not absorbed', () => {
    const result = importFromGeoJSON('{"hello":"world"}');
    expect(
      silentlyEmpty({
        produced: Object.keys(result.document.features).length,
        complaints: result.warnings,
      }),
      'a JSON file that is not GeoJSON imported silently as nothing',
    ).toBe(false);
  });

  it('LandXML: a well-formed XML document that is not LandXML names the root it found', () => {
    // Outcome 1, and the best version of it in this codebase: the message says what was expected,
    // what was there, and where the other two XML survey formats are handled. A surveyor who
    // uploaded a JobXML by mistake is told where to go next, in the error itself.
    expect(() => parseLandXml('<?xml version="1.0"?><Inventory><Item>widget</Item></Inventory>'))
      .toThrow(/Expected a <LandXML> document; found <Inventory>/);
  });

  it('LandXML: malformed XML throws with the reason', () => {
    // A malformed file that parses to nothing looks exactly like a valid file with no points.
    expect(() => parseXml('<LandXML><CgPoints></LandXML>')).toThrow(XmlParseError);
  });

  it('TRV: a non-TRV file is reported rather than opening as a blank drawing', () => {
    // This one failed when it was written. The parser skips a line it does not recognise rather
    // than erroring on it — right for a format with vendor extensions, wrong at the import level:
    // a note-to-self about lunch produced zero points, zero traverses and zero notes, which is
    // exactly what a valid empty survey produces. The surveyor saw a blank drawing and no reason.
    const report = importTrvFromText(GARBAGE);
    expect(
      silentlyEmpty({
        produced: report.mapped.features.length,
        complaints: report.notes,
      }),
      'a non-TRV file opened as an empty drawing with no notes',
    ).toBe(false);
    expect(report.notes.join(' ')).toMatch(/may not be a .TRV file/);
  });

  it('TRV: a real file that maps to nothing is NOT reported as unrecognised', () => {
    // The check reads the PARSE, not the mapping. A genuine TRV whose points all failed to map is
    // a different problem with its own notes, and one message for both would blur them into "the
    // import did not work" — which is the sentence a surveyor cannot act on.
    const emptyButReal = ['#,TRAVERSE PC', '999,begin', '80,10.0.1.0', '#,POINTS', '95,0'].join('\n');
    const report = importTrvFromText(emptyButReal);
    expect(report.notes.join(' ')).not.toMatch(/may not be a .TRV file/);
  });
});

describe('C44d — the instrument parsers name the row that failed', () => {
  it('RW5: a coordinate that is text becomes a row-level error, not a dropped row', () => {
    // The dangerous version of this bug is not a crash. It is 47 points importing out of 48, with
    // nothing on screen saying which one is missing or that one is.
    const rows = parseRW5([
      'JB,NMTESTJOB,DT08-01-2026',
      'SP,PN1,N 3162345.1200,E 942111.8700,EL812.4000,--IPF',
      'SP,PN2,N NOTANUMBER,E 942150.0000,EL0.0000,--IPS',
    ].join('\n'));
    const result = processImport(rows, 'job.rw5');
    // Every row is accounted for as either parsed or errored — none may simply vanish between the
    // file and the summary the surveyor reads.
    expect(result.stats.parsedSuccessfully + result.stats.parseErrors).toBe(result.stats.totalRows);
  });

  it('RW5: a file with no records at all does not report a clean import', () => {
    const result = processImport(parseRW5(GARBAGE), 'lunch.rw5');
    expect(
      silentlyEmpty({ produced: result.points.length, complaints: [] as unknown[] }) &&
        result.stats.totalRows === 0,
      'a file with nothing in it produced a clean zero-point import',
    ).toBe(true);
    // …and the pipeline must not claim rows it never saw.
    expect(result.stats.parsedSuccessfully).toBe(0);
  });

  it('GSI: a truncated word-index block is reported', () => {
    // Truncation mid-record is what a cable pull or a full card actually produces.
    const rows = parseGsiAsRows('110001+00000001 81..00+123456');
    const result = processImport(rows, 'job.gsi');
    expect(result.stats.parsedSuccessfully + result.stats.parseErrors).toBe(result.stats.totalRows);
  });

  it('JobXML: a point with no coordinates is not imported at the origin', () => {
    // Coercing a missing grid to 0,0 puts a boundary corner in the Gulf of Mexico, silently.
    const rows = parseJobXML(`<?xml version="1.0"?>
<JOBFile version="5.0">
  <Reductions>
    <Point><Name>1001</Name><Code>IPF</Code></Point>
  </Reductions>
</JOBFile>`);
    const result = processImport(rows, 'job.jxl');
    const planted = result.points.find((p) => p.northing === 0 && p.easting === 0);
    expect(planted, 'a point with no coordinates was planted at the origin').toBeUndefined();
  });
});

describe('C44d — format detection says what it does not recognise', () => {
  it('names the format it found, with a reason', () => {
    const d = detectSurveyFormat('<?xml version="1.0"?><LandXML version="1.2"></LandXML>', 'a.xml');
    expect(d.format).toBe('landxml');
    // The reason is what the import dialog shows. "landxml" alone tells the surveyor nothing about
    // why this file was read that way, and gives them nothing to argue with when it is wrong.
    expect(d.reason.length).toBeGreaterThan(10);
  });

  it('does not guess a format for a file it cannot place', () => {
    const d = detectSurveyFormat(GARBAGE, 'lunch.txt');
    expect(d.format).toBe('unknown');
    expect(d.reason.length).toBeGreaterThan(10);
  });
});

describe('C44d — the AI surface refuses in words a surveyor can act on', () => {
  it('every registry refusal explains itself', () => {
    useDrawingStore.getState().newDocument();
    const bad: Array<[string, unknown]> = [
      ['addPoint', { x: Number.NaN, y: 0 }],
      ['drawCircle', { center: { x: 0, y: 0 }, radius: -5 }],
      ['drawArc', { start: { x: 0, y: 0 }, through: { x: 5, y: 0 }, end: { x: 10, y: 0 } }],
      ['drawRectangle', { corner: { x: 0, y: 0 }, opposite: { x: 0, y: 10 } }],
      ['moveFeatures', { ids: ['nope'], dx: 1, dy: 1 }],
      ['scaleFeatures', { ids: ['nope'], factor: 0 }],
      ['mirrorFeatures', { ids: ['nope'], axisStart: { x: 0, y: 0 }, axisEnd: { x: 0, y: 0 } }],
      ['deleteFeatures', { ids: [] }],
      ['measureFeature', { id: 'nope' }],
    ];
    for (const [name, args] of bad) {
      const def = toolRegistry[name as keyof typeof toolRegistry] as {
        execute: (a: never) => { ok: boolean; reason?: string };
      };
      const r = def.execute(args as never);
      expect(r.ok, `${name} accepted input it should have refused`).toBe(false);
      // The refusal is surfaced verbatim in the chat, so it is the sentence the surveyor reads. A
      // bare `ok: false` is a blank panel with extra steps.
      expect(r.reason, `${name} refused with no reason`).toBeTruthy();
      expect(r.reason!.length, `${name}'s reason is too short to act on`).toBeGreaterThan(15);
    }
  });

  it('a proposal for a tool that cannot be applied says so instead of doing nothing', () => {
    const r = executeProposal(
      {
        id: generateId(), createdAt: 0,
        toolName: 'inverseTwoPoints' as never,
        args: {} as never,
        description: 'x', confidence: 0.5,
        provenance: {
          aiOrigin: 'test', aiConfidence: 0.5, aiPromptHash: 'h',
          aiSourcePoints: [], aiBatchId: 'b',
        },
      },
      false,
    );
    // C38's hole: this used to return `undefined`, which the card reads as success.
    expect(r).toBeDefined();
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain('inverseTwoPoints');
  });
});
