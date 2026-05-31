// __tests__/cad/ui/layer-panel-polygon-expand.test.ts
//
// cad-layer-grouping-and-context-menus Slice 1 — locks the expand-
// chevron POLYLINE / POLYGON rows render in the LayerPanel + the
// indented read-only vertex child rows. Pure-helper behavior is
// locked separately by feature-vertices.test.ts.
//
// Source-regex on LayerPanel.tsx since the panel needs a populated
// drawing store + selection mock to mount under jsdom.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'LayerPanel.tsx'),
  'utf8',
);

describe('LayerPanel — helper imports + expand state', () => {
  it('imports the formatFeatureVertices + isExpandableFeature helpers', () => {
    expect(SRC).toMatch(
      /from '@\/lib\/cad\/feature-vertices'/,
    );
    expect(SRC).toMatch(/formatFeatureVertices/);
    expect(SRC).toMatch(/isExpandableFeature/);
  });

  it('tracks expanded feature ids in an `expandedFeatures` Set state', () => {
    expect(SRC).toMatch(/const \[expandedFeatures, setExpandedFeatures\] = useState<Set<string>>\(new Set\(\)\);/);
  });
});

describe('LayerPanel — chevron + vertex rows on POLYLINE/POLYGON feature rows', () => {
  it('renders the expand chevron button with a per-feature testid', () => {
    expect(SRC).toContain('data-testid={`layer-panel-feature-expand-${feat.id}`}');
  });

  it('uses ChevronDown when expanded and ChevronRight when collapsed', () => {
    expect(SRC).toMatch(/isExpanded \? <ChevronDown size=\{10\} \/> : <ChevronRight size=\{10\} \/>/);
  });

  it('chevron click toggles the expandedFeatures set via stopPropagation', () => {
    expect(SRC).toMatch(/setExpandedFeatures\(\(prev\) => \{\s*const next = new Set\(prev\);\s*if \(next\.has\(feat\.id\)\) next\.delete\(feat\.id\);\s*else next\.add\(feat\.id\);\s*return next;\s*\}\);/);
  });

  it('gates expand-related UI on isExpandableFeature(feat) so other types stay layout-stable', () => {
    expect(SRC).toMatch(/const expandable = isExpandableFeature\(feat\);/);
    expect(SRC).toMatch(/const isExpanded = expandable && expandedFeatures\.has\(feat\.id\);/);
  });

  it('renders an indented vertex list when expanded, using formatFeatureVertices', () => {
    expect(SRC).toContain('data-testid={`layer-panel-feature-vertices-${feat.id}`}');
    expect(SRC).toMatch(/formatFeatureVertices\(feat\)\.map\(\(line, i\) =>/);
  });

  it('keeps a placeholder spacer for non-expandable rows so the row layout stays consistent', () => {
    expect(SRC).toMatch(/<span className="shrink-0 w-3" aria-hidden \/>/);
  });
});
