// app/admin/components/jobs/fieldwork-export.ts — Export helpers for FieldWorkView

import type { FieldPoint } from './fieldwork-types';
import { formatFullDateTime } from './fieldwork-types';

export type ExportFormat = 'csv' | 'pnezd' | 'dxf' | 'kml';

export function buildPointFileContent(pts: FieldPoint[], format: ExportFormat, jobName?: string): string {
  const coordPts = pts.filter(p => p.northing != null && p.easting != null);

  if (format === 'pnezd') {
    return coordPts
      .map(p => `${p.point_name || ''},${p.northing?.toFixed(4)},${p.easting?.toFixed(4)},${p.elevation?.toFixed(4) || ''},${p.description || ''}`)
      .join('\n');
  }

  if (format === 'dxf') {
    return buildDxfContent(coordPts, jobName);
  }

  if (format === 'kml') {
    return buildKmlContent(coordPts, jobName);
  }

  // CSV — full data with all fields
  const header = [
    'Point Name', 'Northing', 'Easting', 'Elevation', 'Code', 'Description',
    'Data Type', 'Accuracy (m)', 'Accuracy (cm)', 'RTK Status', 'PDOP', 'HDOP', 'VDOP',
    'Satellites', 'Hz Angle', 'Vt Angle', 'Slope Distance',
    'Antenna/Prism Ht', 'Base Station', 'Coordinate System', 'Geoid Model',
    'Instrument', 'Collected By', 'Collected At',
  ].join(',');

  const rows = pts.map(p =>
    [
      p.point_name || '',
      p.northing?.toFixed(4) || '',
      p.easting?.toFixed(4) || '',
      p.elevation?.toFixed(4) || '',
      p.raw_data?.code || '',
      `"${(p.description || '').replace(/"/g, '""')}"`,
      p.data_type,
      p.raw_data?.accuracy != null ? p.raw_data.accuracy.toFixed(4) : '',
      p.raw_data?.accuracy != null ? (p.raw_data.accuracy * 100).toFixed(2) : '',
      p.raw_data?.rtk_status || '',
      p.raw_data?.pdop?.toFixed(2) || '',
      p.raw_data?.hdop?.toFixed(2) || '',
      p.raw_data?.vdop?.toFixed(2) || '',
      p.raw_data?.satellites ?? '',
      p.raw_data?.hz_angle?.toFixed(4) || '',
      p.raw_data?.vt_angle?.toFixed(4) || '',
      p.raw_data?.slope_dist?.toFixed(4) || '',
      p.raw_data?.antenna_height?.toFixed(3) || p.raw_data?.prism_height?.toFixed(3) || '',
      p.raw_data?.base_station || '',
      p.raw_data?.coordinate_system || '',
      p.raw_data?.geoid_model || '',
      p.instrument || '',
      p.collected_by,
      p.collected_at,
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

/** Build minimal DXF file with points as POINT entities (readable by AutoCAD) */
function buildDxfContent(pts: FieldPoint[], jobName?: string): string {
  const lines: string[] = [];

  // DXF header
  lines.push('0', 'SECTION', '2', 'HEADER');
  lines.push('9', '$ACADVER', '1', 'AC1015'); // AutoCAD 2000 format
  lines.push('0', 'ENDSEC');

  // Tables section (layers)
  lines.push('0', 'SECTION', '2', 'TABLES');
  lines.push('0', 'TABLE', '2', 'LAYER', '70', '10');

  // Create layers by point code
  const codes = new Set<string>();
  for (const p of pts) {
    codes.add(p.raw_data?.code || p.data_type || 'DEFAULT');
  }
  let colorIdx = 1;
  for (const code of codes) {
    lines.push('0', 'LAYER', '2', code, '70', '0', '62', String(colorIdx % 255 || 1), '6', 'CONTINUOUS');
    colorIdx++;
  }
  lines.push('0', 'ENDTAB');
  lines.push('0', 'ENDSEC');

  // Entities section
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  for (const p of pts) {
    const layer = p.raw_data?.code || p.data_type || 'DEFAULT';
    // POINT entity
    lines.push(
      '0', 'POINT',
      '8', layer,
      '10', (p.easting ?? 0).toFixed(4),
      '20', (p.northing ?? 0).toFixed(4),
      '30', (p.elevation ?? 0).toFixed(4),
    );

    // TEXT entity with point name
    if (p.point_name) {
      lines.push(
        '0', 'TEXT',
        '8', layer,
        '10', ((p.easting ?? 0) + 1).toFixed(4),
        '20', ((p.northing ?? 0) + 1).toFixed(4),
        '30', (p.elevation ?? 0).toFixed(4),
        '40', '1.0', // text height
        '1', p.point_name,
      );
    }
  }

  lines.push('0', 'ENDSEC');
  lines.push('0', 'EOF');

  return lines.join('\n');
}

/** Build KML file for Google Earth visualization */
function buildKmlContent(pts: FieldPoint[], jobName?: string): string {
  // Note: KML uses WGS84 lat/lon, but our data is State Plane.
  // This exports as-is — user may need coordinate transformation.
  const name = jobName || 'Survey Points';
  const placemarks = pts.map(p => {
    const desc = [
      p.description || '',
      p.raw_data?.code ? `Code: ${p.raw_data.code}` : '',
      p.elevation != null ? `Elevation: ${p.elevation.toFixed(4)}` : '',
      p.raw_data?.accuracy != null ? `Accuracy: ${(p.raw_data.accuracy * 100).toFixed(1)}cm` : '',
      p.collected_by ? `Collected by: ${p.collected_by}` : '',
      p.collected_at ? `Time: ${formatFullDateTime(p.collected_at)}` : '',
    ].filter(Boolean).join('\n');

    return `  <Placemark>
    <name>${p.point_name || 'Unnamed'}</name>
    <description><![CDATA[${desc}]]></description>
    <Point>
      <coordinates>${p.easting?.toFixed(6) || 0},${p.northing?.toFixed(6) || 0},${p.elevation?.toFixed(4) || 0}</coordinates>
    </Point>
  </Placemark>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${name}</name>
  <description>Survey points exported from Starr Surveying. Note: Coordinates may be in State Plane (NAD83) and may need transformation for accurate Google Earth display.</description>
${placemarks}
</Document>
</kml>`;
}

export function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Parse a PNEZD or CSV file into FieldPoint[] */
export function parsePointFile(content: string, format: 'csv' | 'pnezd' | 'auto'): FieldPoint[] {
  const lines = content.trim().split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];

  // Auto-detect format
  if (format === 'auto') {
    const first = lines[0].toLowerCase();
    if (first.includes('point name') || first.includes('northing') || first.includes('easting')) {
      format = 'csv';
    } else {
      format = 'pnezd';
    }
  }

  if (format === 'pnezd') {
    return lines.map((line, i) => {
      const parts = line.split(',').map(s => s.trim());
      return {
        id: `import-${i}`,
        data_type: 'point',
        point_name: parts[0] || undefined,
        northing: parts[1] ? parseFloat(parts[1]) : undefined,
        easting: parts[2] ? parseFloat(parts[2]) : undefined,
        elevation: parts[3] ? parseFloat(parts[3]) : undefined,
        description: parts[4] || undefined,
        raw_data: { code: parts[0]?.replace(/[0-9-]/g, '') || undefined },
        collected_by: 'imported',
        collected_at: new Date().toISOString(),
      };
    }).filter(p => p.northing != null && p.easting != null);
  }

  // CSV — skip header row
  const header = lines[0].toLowerCase().split(',').map(s => s.trim().replace(/"/g, ''));
  const colIdx = (name: string) => header.findIndex(h => h.includes(name));
  const nameI = Math.max(colIdx('point name'), colIdx('point'), 0);
  const northI = colIdx('northing');
  const eastI = colIdx('easting');
  const elevI = colIdx('elevation');
  const codeI = colIdx('code');
  const descI = colIdx('description');
  const typeI = colIdx('type');
  const instrI = colIdx('instrument');
  const collByI = colIdx('collected by');
  const collAtI = colIdx('collected at');

  return lines.slice(1).map((line, i) => {
    const parts = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    const n = northI >= 0 ? parseFloat(parts[northI]) : undefined;
    const e = eastI >= 0 ? parseFloat(parts[eastI]) : undefined;

    return {
      id: `import-${i}`,
      data_type: typeI >= 0 ? parts[typeI] : 'point',
      point_name: parts[nameI] || undefined,
      northing: isNaN(n as number) ? undefined : n,
      easting: isNaN(e as number) ? undefined : e,
      elevation: elevI >= 0 ? parseFloat(parts[elevI]) || undefined : undefined,
      description: descI >= 0 ? parts[descI] : undefined,
      raw_data: { code: codeI >= 0 ? parts[codeI] : undefined },
      collected_by: collByI >= 0 ? parts[collByI] : 'imported',
      collected_at: collAtI >= 0 && parts[collAtI] ? parts[collAtI] : new Date().toISOString(),
      instrument: instrI >= 0 ? parts[instrI] : undefined,
    };
  }).filter(p => p.northing != null && p.easting != null);
}
