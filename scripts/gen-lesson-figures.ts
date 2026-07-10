// scripts/gen-lesson-figures.ts
// Render representative static SVGs from the parametric survey-diagram renderers
// and write them into public/lessons/fs/diagrams/ so lessons can embed the same
// figure family the questions generate. Run: npx tsx scripts/gen-lesson-figures.ts
import {
  renderHeightRelations, renderTiltedPhoto, renderContourMap, renderTowerTwoAngles,
  renderRoundedCornerLot, renderPlat, renderProfile, renderCrossSection, buildDiagramFromSpec,
} from '../lib/diagrams/survey-diagram';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join('public', 'lessons', 'fs', 'diagrams');
fs.mkdirSync(dir, { recursive: true });

const figs: Record<string, string> = {
  'geoid-height-systems.svg': renderHeightRelations(150, 190, 40, 'Height systems: h = H + N'),
  'tilted-photo-geometry.svg': renderTiltedPhoto(18, 'Tilted photograph geometry'),
  'contour-hill.svg': renderContourMap(1000, 100, 1875, 'Contour map — reading the highest contour'),
  'tower-two-angles.svg': renderTowerTwoAngles(100, 22, 42, 'Height from two angle stations'),
  'rounded-corner-lot.svg': renderRoundedCornerLot(120, 60, 20, 'Lot area with a rounded corner'),
  'sewer-grade-profile.svg': renderProfile(
    [{ sta: 0, elev: 1228.69, label: 'MH1' }, { sta: 247.55, elev: 1229.27, label: 'MH2' }],
    { cutSta: 125, title: 'Sewer grade profile & cut' }),
  'cut-fill-section.svg': renderCrossSection(12, 4, 'fill', 'Typical fill cross-section (slope staking)'),
  'recorded-plat-lots.svg': renderPlat(
    [{ width: 50, label: '1' }, { width: 50, label: '2' }, { width: 50, label: '3' },
     { width: 50, label: '4' }, { width: 32.3, label: '5', dim: '30±' }],
    { monA: 'A', monB: 'B', streetName: 'First Street', title: 'Recorded plat — lots & monuments' }),
  'horizontal-curve-elements.svg': buildDiagramFromSpec({ type: 'curve', rVar: 'R', iVar: 'I', title: 'Horizontal curve elements' } as never, { R: 600, I: 92 }) || '',
};

let n = 0;
for (const [name, svg] of Object.entries(figs)) {
  if (!svg) { console.error('EMPTY:', name); continue; }
  fs.writeFileSync(path.join(dir, name), svg + '\n');
  n++;
}
console.log(`wrote ${n} lesson figures to ${dir}`);
