// Instrument interchange — LandXML, GSI, RW5, JobXML (audit §3c.2, items 8j–8l).
//
// Every test here exists because the failure it prevents is SILENT. None of these formats throws when
// misread; they all produce a plausible number of plausible-looking points in the wrong place. So the
// assertions are about specific values in specific places, not about counts.

import { describe, it, expect } from 'vitest';
import { parseXml, XmlParseError, attr, firstChild, descendantsNamed } from '@/lib/cad/import/xml-lite';
import { parseLandXml, parseLandXmlAsRows, looksLikeLandXml, METERS_PER_UNIT } from '@/lib/cad/import/landxml-parser';
import { parseGsi, parseGsiAsRows, detectGsiVariant, parseGsiLine, looksLikeGsi } from '@/lib/cad/import/gsi-parser';
import { parseRW5Document, parseRW5, looksLikeRw5 } from '@/lib/cad/import/rw5-parser';
import { parseJobXMLDocument, parseJobXML, looksLikeJobXml } from '@/lib/cad/import/jobxml-parser';
import { detectSurveyFormat, supportedFormats } from '@/lib/cad/import/format-detect';

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────

const LANDXML = `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2">
  <Units><Imperial linearUnit="USSurveyFoot" areaUnit="squareUSSurveyFoot" /></Units>
  <CoordinateSystem name="NAD83 Texas Central" epsgCode="32139" />
  <CgPoints>
    <CgPoint name="101" code="IPF" desc="1/2&quot; iron pipe found">3162345.12 942111.87 812.40</CgPoint>
    <CgPoint name="102" code="IPS">3162400.55 942150.00</CgPoint>
    <CgPoint name="103" pntRef="101" />
  </CgPoints>
  <Alignments>
    <Alignment name="CL-1" staStart="0" length="250.5">
      <CoordGeom>
        <Line><Start>3162345.12 942111.87</Start><End>3162400.55 942150.00</End></Line>
        <Curve rot="cw" radius="100"><Start>3162400.55 942150.00</Start><End>3162450.00 942200.00</End></Curve>
      </CoordGeom>
    </Alignment>
  </Alignments>
  <Surfaces>
    <Surface name="EG" desc="Existing ground">
      <Definition surfType="TIN">
        <Pnts>
          <P id="1">100 200 10</P>
          <P id="2">110 200 11</P>
          <P id="3">105 210 12</P>
        </Pnts>
        <Faces>
          <F>1 2 3</F>
          <F i="1">1 2 3</F>
        </Faces>
      </Definition>
    </Surface>
  </Surfaces>
</LandXML>`;

// A real Leica line: point 1, easting 12345.678 m, northing 87654.321 m, elevation 1234.0 mm-based.
// Information character 6 is '0' → the value is in millimetres.
const GSI8 = [
  '110001+00000001 81..00+12345678 82..00+87654321 83..00+00123400',
  '110002+00000002 81..00+12345700 82..00+87654400 83..00+00123500 41....+00000012 71....+00000FNC',
].join('\n');

const GSI16 = [
  '*110001+0000000000000001 81..00+0000000012345678 82..00+0000000087654321 83..00+0000000000123400',
].join('\n');

const RW5_CARLSON = [
  'JB,NMTESTJOB,DT08-01-2026,TM10:00:00',
  'MO,AD0,UN0,SF1.00000000,EC1,EO0.0,AU0',
  'SP,PN1,N 3162345.1200,E 942111.8700,EL812.4000,--IPF 1/2 inch pipe, NW corner',
  'SP,PN2,N 3162400.5500,E 942150.0000,EL0.0000,--IPS',
].join('\n');

// Topcon MAGNET writes its setup as an OC record — the case the old reader missed entirely.
const RW5_TOPCON_METRIC = [
  'JB,NMSITE01,DT08-01-2026',
  '--Topcon MAGNET Field',
  'MO,AD0,UN1,SF1.00000000,EC1,EO0.0,AU0',
  'OC,OP1,N 5000.0000,E 5000.0000,EL100.0000,--CP1 control',
  'BK,OP1,BP2,BS0.0000,BC0.0000',
  'SS,OP1,FP10,AR90.0000,ZE90.0000,SD25.000,--TOPO',
  'SS,OP1,FP11,AR91.0000,ZE90.0000,SD26.000,--TOPO',
].join('\n');

const JOBXML = `<?xml version="1.0"?>
<JOBFile version="5.0">
  <Reductions>
    <Point>
      <Name>1001</Name><Code>IPF</Code>
      <Description1>corner</Description1><Description2>fence</Description2>
      <Grid><North>3162345.12</North><East>942111.87</East><Elevation>812.40</Elevation></Grid>
      <WGS84><Latitude>31.05</Latitude><Longitude>-97.46</Longitude></WGS84>
    </Point>
    <Point>
      <Name>1002</Name><Code>DESIGN</Code>
    </Point>
  </Reductions>
</JOBFile>`;

// ── xml-lite ─────────────────────────────────────────────────────────────────────────────────────

describe('xml-lite', () => {
  it('keeps nesting, which is the whole reason it exists', () => {
    // A regex cannot say which <Surface> a <P> belongs to, and getting that wrong merges two
    // surfaces into one without any symptom.
    const root = parseXml('<a><b><c>1</c></b><b><c>2</c></b></a>');
    const bs = root.children;
    expect(bs).toHaveLength(2);
    expect(firstChild(bs[0], 'c')?.text).toBe('1');
    expect(firstChild(bs[1], 'c')?.text).toBe('2');
  });

  it('throws on a mismatched close tag rather than returning an empty tree', () => {
    // A malformed file that parses to nothing looks exactly like a valid file with no points —
    // audit §1.1b's failure mode, in a file reader.
    expect(() => parseXml('<a><b></a>')).toThrow(XmlParseError);
    expect(() => parseXml('<a>')).toThrow(XmlParseError);
  });

  it('decodes entities and numeric references', () => {
    const root = parseXml('<a t="1/2&quot; pipe">A &amp; B &#65;</a>');
    expect(attr(root, 't')).toBe('1/2" pipe');
    expect(root.text).toBe('A & B A');
  });

  it('tolerates a > inside an attribute value', () => {
    // "TREE 12>FENCE" is exactly the sort of code a crew types.
    const root = parseXml('<p desc="TREE 12>FENCE">x</p>');
    expect(attr(root, 'desc')).toBe('TREE 12>FENCE');
    expect(root.text).toBe('x');
  });

  it('ignores namespace prefixes when matching names', () => {
    const root = parseXml('<lx:LandXML xmlns:lx="x"><lx:CgPoint>1 2</lx:CgPoint></lx:LandXML>');
    expect(descendantsNamed(root, 'CgPoint')).toHaveLength(1);
  });
});

// ── LandXML ──────────────────────────────────────────────────────────────────────────────────────

describe('LandXML import', () => {
  const doc = parseLandXml(LANDXML);

  it('reads coordinates NORTHING-first, which is the single most likely bug in this file', () => {
    // LandXML content is "northing easting elevation". Assuming X,Y — the near-universal habit —
    // mirrors every point about the 45° line, with no crash and no warning.
    const p = doc.points.find((x) => x.name === '101')!;
    expect(p.northing).toBe(3162345.12);
    expect(p.easting).toBe(942111.87);
    expect(p.elevation).toBe(812.4);
  });

  it('distinguishes "no elevation" from "elevation zero"', () => {
    // Coercing a missing Z to 0 puts a boundary corner at sea level.
    expect(doc.points.find((x) => x.name === '102')!.elevation).toBeNull();
  });

  it('does not plant a reference-only point at the origin', () => {
    const ref = doc.points.find((x) => x.refersTo === '101')!;
    expect(ref).toBeDefined();
    expect(doc.warnings.join(' ')).toMatch(/references to other points/);
    // …and the pipeline rows report it as an error rather than importing 0,0.
    const rows = parseLandXmlAsRows(LANDXML);
    const refRow = rows.find((r) => r.error);
    expect(refRow?.error).toMatch(/reference/i);
    expect(rows.filter((r) => r.data).every((r) => r.data!.northing !== 0)).toBe(true);
  });

  it('reads the declared unit and knows a US survey foot is not an international foot', () => {
    expect(doc.units.linear).toBe('USSurveyFoot');
    // 1200/3937, not 0.3048. Two parts per million — inside the noise on a lot, outside it on a
    // section line.
    expect(METERS_PER_UNIT.USSurveyFoot).toBeCloseTo(0.30480060960, 10);
    expect(METERS_PER_UNIT.USSurveyFoot).not.toBe(METERS_PER_UNIT.foot);
  });

  it('keeps the coordinate system verbatim rather than assuming one', () => {
    expect(doc.coordinateSystem?.name).toBe('NAD83 Texas Central');
    expect(doc.coordinateSystem?.epsgCode).toBe('32139');
  });

  it('warns when units or projection are missing instead of guessing', () => {
    const bare = parseLandXml('<LandXML version="1.2"><CgPoints><CgPoint name="1">1 2 3</CgPoint></CgPoints></LandXML>');
    expect(bare.warnings.join(' ')).toMatch(/No linear unit/);
    expect(bare.warnings.join(' ')).toMatch(/No <CoordinateSystem>/);
    expect(bare.points).toHaveLength(1);
  });

  it('reads alignments and says when the geometry was approximated', () => {
    const a = doc.alignments[0];
    expect(a.name).toBe('CL-1');
    expect(a.hasCurves).toBe(true);
    // Shared endpoints are not duplicated: Line end == Curve start.
    expect(a.vertices).toEqual([
      { northing: 3162345.12, easting: 942111.87 },
      { northing: 3162400.55, easting: 942150 },
      { northing: 3162450, easting: 942200 },
    ]);
    expect(doc.warnings.join(' ')).toMatch(/arc geometry between them is not reconstructed/);
  });

  it('reads TIN surfaces and drops the invisible hull faces', () => {
    const s = doc.surfaces[0];
    expect(s.points).toHaveLength(3);
    // `i="1"` marks a face outside the surface. Keeping it inflates the TIN to its bounding triangle.
    expect(s.faces).toEqual([[1, 2, 3]]);
  });

  it('refuses a non-LandXML document by name rather than returning nothing', () => {
    expect(() => parseLandXml('<JOBFile />')).toThrow(/Expected a <LandXML> document/);
    expect(() => parseLandXml('not xml at all')).toThrow(/does not parse as XML/);
  });

  it('detects itself without matching a schema URL in an unrelated file', () => {
    expect(looksLikeLandXml(LANDXML)).toBe(true);
    expect(looksLikeLandXml('<Other xsi:schemaLocation="http://www.landxml.org/schema/LandXML-1.2" />')).toBe(false);
  });
});

// The `LandXML export` block lived here and tested `lib/cad/export/landxml-writer.ts`, which C44a
// found had no path to any surface. Its rules were re-asserted against the writer that actually
// runs — see `__tests__/cad/landxml-round-trip.test.ts` — and then the dead module was deleted.
// Recoverable from git. A deletion that discards the only place a requirement was written down is
// not a cleanup, which is why the rules moved before the file went.

// ── Leica GSI ────────────────────────────────────────────────────────────────────────────────────

describe('Leica GSI import (and GeoMax with it)', () => {
  it('reads EASTING from WI 81 and NORTHING from WI 82 — the opposite of LandXML', () => {
    // GSI is easting-first. Carrying the LandXML habit across mirrors every point.
    const doc = parseGsi(GSI8);
    const p = doc.points[0];
    expect(p.easting).toBeCloseTo(12345.678, 6);   // 12345678 mm
    expect(p.northing).toBeCloseTo(87654.321, 6);  // 87654321 mm
    expect(p.elevation).toBeCloseTo(123.4, 6);
  });

  it('detects GSI8 vs GSI16 from the file rather than asking', () => {
    // Misreading GSI16 as GSI8 splits every value in half and still parses.
    expect(detectGsiVariant(GSI8)).toBe('GSI8');
    expect(detectGsiVariant(GSI16)).toBe('GSI16');
    const wide = parseGsi(GSI16);
    expect(wide.variant).toBe('GSI16');
    expect(wide.points[0].easting).toBeCloseTo(12345.678, 6);
  });

  it('applies the per-block unit, because reading mm as metres is a factor of 1000', () => {
    // Same digits, unit character 1 (1/1000 international foot) instead of 0 (mm).
    const feetThousandths = '110001+00000001 81..01+12345678 82..01+87654321';
    const p = parseGsi(feetThousandths).points[0];
    expect(p.easting).toBeCloseTo(12345678 * (0.3048 / 1000), 6);
    expect(p.easting).not.toBeCloseTo(12345.678, 3);
  });

  it('honours the sign character, which is not part of the number', () => {
    // parseFloat on the zero-padded remainder drops the '-' and puts the point on the wrong side of
    // the origin.
    const neg = parseGsi('110001+00000001 81..00-12345678 82..00+87654321').points[0];
    expect(neg.easting).toBeCloseTo(-12345.678, 6);
    const blocks = parseGsiLine('110001+00000001 81..00-12345678', 'GSI8');
    expect(blocks.find((b) => b.wi === '81')!.sign).toBe(-1);
  });

  it('strips zero padding from the point number', () => {
    // A point named "0000000000000012" is nobody's idea of point 12.
    expect(parseGsi(GSI16).points[0].pointName).toBe('1');
    expect(parseGsi(GSI8).points[1].pointName).toBe('2');
  });

  it('reads code and remark blocks', () => {
    const p = parseGsi(GSI8).points[1];
    expect(p.code).toBe('12');
    expect(p.description).toBe('FNC');
  });

  it('converts to the target unit on the way into the pipeline', () => {
    // Defaulting to metres would import a Texas boundary at roughly a third of its size — visible,
    // and easy to "fix" by scaling, which is how a legal description stops matching the ground.
    const rows = parseGsiAsRows(GSI8, 'USSurveyFoot');
    expect(rows[0].data!.easting).toBeCloseTo(12345.678 * (3937 / 1200), 4);
    const metric = parseGsiAsRows(GSI8, 'meter');
    expect(metric[0].data!.easting).toBeCloseTo(12345.678, 6);
  });

  it('explains a file of raw observations instead of reporting "no points"', () => {
    const observationsOnly = '110001+00000001 21.324+09000000 22.324+09000000 31..00+00025000';
    const doc = parseGsi(observationsOnly);
    expect(doc.points).toHaveLength(0);
    expect(doc.warnings.join(' ')).toMatch(/raw observations|No coordinate blocks/);
  });

  it('detects itself', () => {
    expect(looksLikeGsi(GSI8)).toBe(true);
    expect(looksLikeGsi(GSI16)).toBe(true);
    expect(looksLikeGsi('1,3162345.12,942111.87,812.4,IPF')).toBe(false);
  });
});

// ── RW5 family ───────────────────────────────────────────────────────────────────────────────────

describe('RW5 family — Carlson, Topcon, Spectra', () => {
  it('still reads Carlson SP records', () => {
    const doc = parseRW5Document(RW5_CARLSON);
    expect(doc.rows.filter((r) => r.data)).toHaveLength(2);
    expect(doc.rows[0].data!.northing).toBe(3162345.12);
    expect(doc.rows[0].data!.easting).toBe(942111.87);
  });

  it('reads the OC record, which is how Topcon and Spectra write the setup station', () => {
    // The gap that made those two vendors "partly covered": a file whose control came from an
    // occupy record imported as zero points and read as "the file has no points".
    const doc = parseRW5Document(RW5_TOPCON_METRIC);
    const pts = doc.rows.filter((r) => r.data);
    expect(pts).toHaveLength(1);
    expect(pts[0].data!.northing).toBe(5000);
    expect(pts[0].data!.easting).toBe(5000);
    expect(pts[0].data!.rawCode).toBe('CP1');
  });

  it('reads the unit from the MO record and says so when it is metric', () => {
    // Never looked at before: a metric Topcon file imported as feet is 3.28× off with no error.
    expect(parseRW5Document(RW5_CARLSON).unit).toBe('feet');
    const metric = parseRW5Document(RW5_TOPCON_METRIC);
    expect(metric.unit).toBe('meters');
    expect(metric.warnings.join(' ')).toMatch(/METRES/);
  });

  it('warns when no unit was declared rather than assuming feet', () => {
    expect(parseRW5Document('SP,PN1,N 100.0,E 200.0,EL0.0,--X').warnings.join(' ')).toMatch(/No MO record/);
  });

  it('keeps a description containing a comma in one piece', () => {
    // Comma-splitting first turns "IPF 1/2 inch pipe, NW corner" into junk fields.
    const doc = parseRW5Document(RW5_CARLSON);
    expect(doc.rows[0].data!.rawCode).toBe('IPF');
    expect(doc.rows[0].data!.description).toBe('1/2 inch pipe, NW corner');
  });

  it('does not rename a point to its own field code', () => {
    // The old reader treated a single comment word as a point NAME.
    const doc = parseRW5Document(RW5_CARLSON);
    expect(doc.rows[1].data!.pointName).toBe('2');
    expect(doc.rows[1].data!.rawCode).toBe('IPS');
  });

  it('explains a file of pure observations', () => {
    const observations = ['MO,AD0,UN0', 'SS,OP1,FP10,AR90.0,ZE90.0,SD25.0,--TOPO'].join('\n');
    const doc = parseRW5Document(observations);
    expect(doc.rows.filter((r) => r.data)).toHaveLength(0);
    expect(doc.warnings.join(' ')).toMatch(/observation record/);
  });

  it('identifies the dialect from the file header', () => {
    expect(parseRW5Document(RW5_TOPCON_METRIC).dialect).toBe('topcon');
    expect(parseRW5Document('--Survey Pro\nSP,PN1,N 1,E 2').dialect).toBe('spectra');
  });

  it('keeps the old call signature working', () => {
    expect(parseRW5(RW5_CARLSON).filter((r) => r.data)).toHaveLength(2);
    expect(looksLikeRw5(RW5_CARLSON)).toBe(true);
  });
});

// ── Trimble JobXML ───────────────────────────────────────────────────────────────────────────────

describe('Trimble JobXML — hardened', () => {
  const doc = parseJobXMLDocument(JOBXML);

  it('does not import a coordinate-less record at 0, 0', () => {
    // Defect 1. On a Texas state-plane job, 0,0 is ~600 miles off the Gulf coast — visible alone,
    // invisible mixed into 400 real points.
    expect(doc.points).toHaveLength(1);
    expect(doc.warnings.join(' ')).toMatch(/no grid or local coordinate/);
    expect(parseJobXML(JOBXML).every((r) => !r.data || r.data.northing !== 0)).toBe(true);
  });

  it('reads from the <Grid> block and never from a WGS84 sibling', () => {
    // Defect 2: latitude read as a northing is a point in the Gulf of Guinea.
    const p = doc.points[0];
    expect(p.northing).toBe(3162345.12);
    expect(p.source).toBe('grid');
    expect(p.northing).not.toBe(31.05);
  });

  it('keeps the descriptions instead of hard-coding an empty string', () => {
    expect(doc.points[0].description).toBe('corner fence');
    expect(doc.points[0].code).toBe('IPF');
  });

  it('reads <PointRecord> as well as <Point>', () => {
    // Defect 3: a JXL file of PointRecords imported as zero points and read as "empty".
    const jxl = `<JOBFile><PointRecord><Name>7</Name><Grid><North>10</North><East>20</East></Grid></PointRecord></JOBFile>`;
    const d = parseJobXMLDocument(jxl);
    expect(d.points).toHaveLength(1);
    expect(d.points[0].name).toBe('7');
  });

  it('flags local coordinates as not being on the grid', () => {
    const local = `<JOBFile><Point><Name>1</Name><Local><North>1</North><East>2</East></Local></Point></JOBFile>`;
    expect(parseJobXMLDocument(local).warnings.join(' ')).toMatch(/local system, not the state plane grid/);
  });

  it('reports a malformed file rather than returning an empty success', () => {
    const rows = parseJobXML('<JOBFile><Point>');
    expect(rows).toHaveLength(1);
    expect(rows[0].error).toMatch(/does not parse as XML/);
  });

  it('detects itself', () => {
    expect(looksLikeJobXml(JOBXML)).toBe(true);
    expect(looksLikeJobXml(LANDXML)).toBe(false);
  });
});

// ── Routing ──────────────────────────────────────────────────────────────────────────────────────

describe('format detection', () => {
  it.each([
    [LANDXML, 'landxml'],
    [JOBXML, 'jobxml'],
    [GSI8, 'gsi'],
    [GSI16, 'gsi'],
    [RW5_CARLSON, 'rw5'],
    [RW5_TOPCON_METRIC, 'rw5'],
    ['1,3162345.12,942111.87,812.40,IPF\n2,3162400.55,942150.00,810.10,IPS\n3,3162450.00,942200.00,809.00,IPS', 'csv'],
  ])('routes a file to the right reader', (text, expected) => {
    expect(detectSurveyFormat(text as string).format).toBe(expected);
  });

  it('returns unknown rather than guessing, because a plausible import is worse than a refusal', () => {
    // Feeding GSI to the CSV reader produces rows — nonsense rows, with the point number parsed out
    // of a word index.
    const d = detectSurveyFormat('this is a readme about surveying', 'notes.txt');
    expect(d.format).toBe('unknown');
    expect(d.reason).toMatch(/no reader was chosen/);
  });

  it('does not let the extension override a failed content check', () => {
    expect(detectSurveyFormat('<Something else="1" />', 'points.xml').format).toBe('unknown');
  });

  it('covers all five vendors the audit names', () => {
    // §3c.2's table: Trimble, Topcon, Hexagon/Leica, GeoMax, Spectra Precision. The claim a firm is
    // shown must come from the same table the code uses (§1.3's lesson, applied to a sales answer).
    const vendors = new Set(supportedFormats().flatMap((f) => f.vendors));
    for (const v of ['Trimble', 'Topcon', 'Leica Geosystems', 'GeoMax', 'Spectra Precision']) {
      expect([...vendors].some((x) => x.includes(v.split(' ')[0])), `${v} is not covered`).toBe(true);
    }
  });
});
