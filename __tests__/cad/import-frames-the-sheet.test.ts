// CAD_AUDIT Slice S17 — imported points are framed on the sheet, not on their raw extent.
//
// The owner's ask was "the rendered points should always be centered on the white page and have the
// extents zoomed by default", and the honest finding is that **most of this already worked**:
// `ImportDialog` centres the paper under the imported points, with a comment naming the exact reason
// (features are stored at raw state-plane coordinates, often in the millions, while the paper frame
// defaults to world origin). That is the seventh feature this program has called missing and found
// present, and it is why the fix here is one line rather than a new module.
//
// What was genuinely inconsistent: having fitted the paper, this path then zoomed to the FEATURE
// extent. The TRV importer deliberately zooms to the PAPER instead, and its comment says why — one
// outlier shot drags the strict bbox out and leaves the lot a speck. The two import paths disagreed;
// now they don't.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { expectOrder } from '../helpers/expect-order';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const strip = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('the survey-data import frames what it just positioned', () => {
  const code = strip(read('app/admin/cad/components/ImportDialog.tsx'));

  it('still centres the paper under the imported points', () => {
    // The pre-existing behaviour. Asserted so a later "simplification" cannot quietly drop it and
    // send state-plane jobs back off the sheet.
    expect(code).toContain('fitPaperToBounds(');
    expect(code).toContain('paperOrigin');
  });

  it('zooms to the PAPER once the paper has been fitted', () => {
    expect(code).toMatch(/paperWasFitted\s*\?\s*'cad:zoomToPaper'\s*:\s*'cad:zoomExtents'/);
  });

  it('records whether the fit actually happened, rather than assuming it did', () => {
    // An import with no coordinates fits no paper; framing a sheet that was never positioned would
    // be worse than framing the data.
    expect(code).toContain('paperWasFitted = true');
    expectOrder(code, 'paperWasFitted = true', 'cad:zoomToPaper', 'the fit is recorded before it is used');
  });
});

describe('the TRV import it was made consistent with', () => {
  const code = strip(read('app/admin/cad/components/MenuBar.tsx'));

  it('also fits the paper and zooms to it', () => {
    expect(code).toContain('maybeFitPaperToImportedFeatures(');
    expect(code).toContain('cad:zoomToPaper');
  });
});
