import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  toggleKey,
  SELECTION_OPTIONS,
  DEFAULT_GATHER_SELECTIONS_VALUE,
  type GatherSelectionKey,
} from '@/app/admin/research/components/GatherSelectionsField';

// Plan GATHER_AND_REVIEW_SPLIT S3 — the Configure "what to find" checklist. The keys must match the
// worker's selection set, the default must be all_files/no-adjoiners, and RerunDialog must send the
// selections through so a chosen checklist actually reaches the run.

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('the checklist options', () => {
  it('offers exactly the nine worker selection keys', () => {
    const keys = SELECTION_OPTIONS.flatMap((g) => g.options.map((o) => o.key)).sort();
    expect(keys).toEqual(
      ['all_deeds', 'all_files', 'all_plats', 'gis_parcel', 'gis_satellite', 'google_map', 'recent_deed', 'recent_easement', 'recent_plat'].sort(),
    );
  });

  it('defaults to all_files with adjoiners off', () => {
    expect(DEFAULT_GATHER_SELECTIONS_VALUE).toEqual({ items: ['all_files'], adjoiners: { enabled: false, items: [] } });
  });
});

describe('toggleKey', () => {
  it('adds and removes keys, keeping a stable order', () => {
    let keys: GatherSelectionKey[] = [];
    keys = toggleKey(keys, 'recent_deed', true);
    keys = toggleKey(keys, 'recent_plat', true);
    // recent_plat is ordered before recent_deed in SELECTION_OPTIONS
    expect(keys).toEqual(['recent_plat', 'recent_deed']);
    keys = toggleKey(keys, 'recent_deed', false);
    expect(keys).toEqual(['recent_plat']);
  });

  it('does not duplicate an already-selected key', () => {
    expect(toggleKey(['recent_plat'], 'recent_plat', true)).toEqual(['recent_plat']);
  });
});

describe('RerunDialog wires the checklist into the run settings', () => {
  const dialog = read('app/admin/research/components/RerunDialog.tsx');
  it('renders the field and sends gatherSelections', () => {
    expect(dialog).toMatch(/<GatherSelectionsField/);
    expect(dialog).toMatch(/gatherSelections: form\.gatherSelections/);
  });
});
