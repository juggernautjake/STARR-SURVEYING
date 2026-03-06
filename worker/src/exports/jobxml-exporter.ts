// worker/src/exports/jobxml-exporter.ts — Phase 11 Module N
// Trimble JobXML survey data export.
// JobXML is used by Trimble Access and Trimble Business Center.
//
// Spec §11.15.2 — Trimble JobXML Export

/**
 * Export reconciled boundary corners as Trimble JobXML format.
 */
export function exportToJobXML(
  corners: {
    northing: number;
    easting: number;
    elevation?: number;
    code?: string;
    name?: string;
  }[],
  projectName: string,
): string {
  const now = new Date().toISOString();

  const points = corners
    .map((c, i) => {
      const name = c.name || `B${i + 1}`;
      const code = c.code || 'BNDRY';
      const elev = c.elevation || 0;

      return `    <Point>
      <Name>${escapeXml(name)}</Name>
      <Code>${escapeXml(code)}</Code>
      <Grid>
        <North>${c.northing.toFixed(6)}</North>
        <East>${c.easting.toFixed(6)}</East>
        <Elevation>${elev.toFixed(4)}</Elevation>
      </Grid>
    </Point>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<JOBFile>
  <FieldBook>
    <JobName>${escapeXml(projectName)}</JobName>
    <CreatedDate>${now}</CreatedDate>
    <Description>STARR RECON Boundary Research Export</Description>
    <CoordinateSystem>
      <SystemName>NAD83 Texas Central Zone 4203</SystemName>
      <ZoneName>TX Central</ZoneName>
      <DatumName>NAD83</DatumName>
      <Units>US Survey Feet</Units>
    </CoordinateSystem>
  </FieldBook>
  <Reductions>
${points}
  </Reductions>
</JOBFile>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
