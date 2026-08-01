// lib/cad/export/landxml-writer.ts — points and parcels out, as LandXML (audit §3c.2, item 8j).
//
// The other half of the interchange spine. Import lets a firm bring its history in; export is what
// stops the software becoming a place data goes to die — and for a firm evaluating whether to switch,
// "can I get my data back out" is a question asked before the first upload, not after.
//
// ── WRITTEN TO BE READ BY THE FIVE VENDORS, WHICH CONSTRAINS MORE THAN IT SOUNDS ────────────────
//
// · **Northing first.** Same convention as the reader, same consequence for getting it wrong — a
//   mirrored site plan that looks plausible.
// · **`<Units>` is mandatory in practice.** Civil 3D and Trimble Business Center both reject or
//   silently mis-scale a document with no unit declaration. The caller must say; there is no default,
//   because a wrong default is a survey off by a factor of 3.28.
// · **Everything is escaped.** A point description containing `&` or `<` — "TREE 12<AT FENCE" is
//   exactly the sort of code a crew types — produces a file that fails to parse in the receiving
//   software, with an error naming a line number and nothing about why.
// · **Numbers are written at full precision.** Rounding coordinates on export is silent, permanent
//   data loss; a surveyor's northing carries meaningful digits well past the decimal point.

import type { LandXmlPoint, LinearUnit } from '../import/landxml-parser';

export interface LandXmlExportInput {
  /** Required. See the header — there is deliberately no default unit. */
  linearUnit: Exclude<LinearUnit, 'unknown'>;
  /** Free text for `<Project name>`; the job or drawing name. */
  projectName: string;
  /** Written into `<Application>` so a recipient knows what produced the file. */
  application?: { name: string; version?: string };
  /** Attributes for `<CoordinateSystem>`, e.g. `{ name: 'NAD83 Texas Central', epsgCode: '32139' }`.
   *  Omitted entirely when absent rather than emitted empty — an empty element asserts a projection
   *  the file does not have. */
  coordinateSystem?: Record<string, string>;
  points: ReadonlyArray<Pick<LandXmlPoint, 'name' | 'code' | 'description' | 'northing' | 'easting' | 'elevation'>>;
  /** Optional closed figures, by point name. */
  parcels?: ReadonlyArray<{ name: string; description?: string; area?: number; pointNames: string[] }>;
  /** Overridable for deterministic tests. Defaults to now. */
  timestamp?: Date;
}

const UNIT_ATTRS: Record<Exclude<LinearUnit, 'unknown'>, { system: 'Imperial' | 'Metric'; linear: string; area: string; volume: string }> = {
  USSurveyFoot: { system: 'Imperial', linear: 'USSurveyFoot', area: 'squareUSSurveyFoot', volume: 'cubicUSSurveyFeet' },
  foot: { system: 'Imperial', linear: 'foot', area: 'squareFoot', volume: 'cubicFeet' },
  meter: { system: 'Metric', linear: 'meter', area: 'squareMeter', volume: 'cubicMeter' },
};

/** Escape for XML text and attribute values. Both `<` and `&` are mandatory; `>`, `"` and `'` are
 *  belt-and-braces and cost nothing. */
export function xmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&apos;'
  ));
}

/** Full precision, no exponent, no trailing noise. `String(n)` switches to exponential notation for
 *  very small and very large magnitudes, and no LandXML consumer reliably reads `1e-7`. */
function num(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) {
    // `String(1e21)` is `"1e+21"`. No survey coordinate is that large, but a corrupt value passed
    // straight through would produce a file the receiving software rejects at parse time with an
    // error naming a line number and nothing about why. BigInt renders it in full.
    return Math.abs(n) < 1e21 ? String(n) : BigInt(n).toString();
  }
  const s = n.toFixed(9).replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

export function buildLandXml(input: LandXmlExportInput): string {
  const unit = UNIT_ATTRS[input.linearUnit];
  const stamp = (input.timestamp ?? new Date()).toISOString();
  const [date, timeWithZ] = stamp.split('T');
  const time = timeWithZ.replace('Z', '');

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xsi:schemaLocation="http://www.landxml.org/schema/LandXML-1.2 http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd" ' +
    `version="1.2" date="${date}" time="${time}">`,
  );

  lines.push('  <Units>');
  lines.push(`    <${unit.system} linearUnit="${unit.linear}" areaUnit="${unit.area}" volumeUnit="${unit.volume}" temperatureUnit="fahrenheit" pressureUnit="inchHG" angularUnit="decimal degrees" directionUnit="decimal degrees" />`);
  lines.push('  </Units>');

  if (input.coordinateSystem && Object.keys(input.coordinateSystem).length > 0) {
    const attrs = Object.entries(input.coordinateSystem)
      .map(([k, v]) => `${k}="${xmlEscape(String(v))}"`)
      .join(' ');
    lines.push(`  <CoordinateSystem ${attrs} />`);
  }

  if (input.application) {
    lines.push(`  <Application name="${xmlEscape(input.application.name)}"${input.application.version ? ` version="${xmlEscape(input.application.version)}"` : ''} />`);
  }

  lines.push(`  <Project name="${xmlEscape(input.projectName)}" />`);

  if (input.points.length > 0) {
    lines.push('  <CgPoints>');
    for (const p of input.points) {
      const attrs = [`name="${xmlEscape(p.name)}"`];
      if (p.code) attrs.push(`code="${xmlEscape(p.code)}"`);
      if (p.description) attrs.push(`desc="${xmlEscape(p.description)}"`);
      // Northing first. Elevation omitted when null rather than written as 0 — the reader's trap 4
      // in the other direction: an exported 0 becomes a real sea-level elevation on the next import.
      const coords = p.elevation === null
        ? `${num(p.northing)} ${num(p.easting)}`
        : `${num(p.northing)} ${num(p.easting)} ${num(p.elevation)}`;
      lines.push(`    <CgPoint ${attrs.join(' ')}>${coords}</CgPoint>`);
    }
    lines.push('  </CgPoints>');
  }

  if (input.parcels?.length) {
    const byName = new Map(input.points.map((p) => [p.name, p]));
    lines.push('  <Parcels>');
    for (const parcel of input.parcels) {
      const verts = parcel.pointNames.map((n) => byName.get(n)).filter((p): p is NonNullable<typeof p> => !!p);
      // A parcel whose points are not in the export would write an empty <CoordGeom>, which reads
      // downstream as a parcel of zero area rather than as a missing one.
      if (verts.length < 3) continue;
      const attrs = [`name="${xmlEscape(parcel.name)}"`];
      if (parcel.description) attrs.push(`desc="${xmlEscape(parcel.description)}"`);
      if (parcel.area !== undefined) attrs.push(`area="${num(parcel.area)}"`);
      attrs.push('parcelType="Single"', 'state="proposed"');
      lines.push(`    <Parcel ${attrs.join(' ')}>`);
      lines.push('      <CoordGeom>');
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % verts.length];
        lines.push('        <Line>');
        lines.push(`          <Start pntRef="${xmlEscape(a.name)}">${num(a.northing)} ${num(a.easting)}</Start>`);
        lines.push(`          <End pntRef="${xmlEscape(b.name)}">${num(b.northing)} ${num(b.easting)}</End>`);
        lines.push('        </Line>');
      }
      lines.push('      </CoordGeom>');
      lines.push('    </Parcel>');
    }
    lines.push('  </Parcels>');
  }

  lines.push('</LandXML>');
  return lines.join('\n');
}
