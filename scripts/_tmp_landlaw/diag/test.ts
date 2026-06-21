import { buildDiagramFromSpec, renderTraverse, renderInverse } from '../../../lib/diagrams/survey-diagram';
import * as fs from 'fs';
// 1) 4-leg traverse with an inverse highlight between A(0) and C(2)
const trav = buildDiagramFromSpec(
  { type:'traverse', legs:[
     {azVar:'az1',distVar:'d1'},{azVar:'az2',distVar:'d2'},{azVar:'az3',distVar:'d3'},{azVar:'az4',distVar:'d4'}],
     inverseFrom:0, inverseTo:2, title:'Compute inverse A→C' },
  { az1:45, d1:300, az2:135, d2:250, az3:210, d3:280, az4:310, d4:240 });
// 2) inverse two points
const inv = buildDiagramFromSpec(
  { type:'inverse', aNVar:'nA',aEVar:'eA',bNVar:'nB',bEVar:'eB',aLabel:'A',bLabel:'B' },
  { nA:5000, eA:5000, nB:5420.5, eB:5310.2 });
// 3) curve
const cur = buildDiagramFromSpec({ type:'curve', rVar:'R', iVar:'I' }, { R:573, I:36 });
// 4) leveling
const lev = buildDiagramFromSpec({ type:'leveling', bsVar:'bs', fsVar:'fs' }, { bs:6.42, fs:3.87 });
// 5) compass
const com = buildDiagramFromSpec({ type:'compass', azVar:'az' }, { az:247.74 });
const checks = { trav, inv, cur, lev, com };
for (const [k,v] of Object.entries(checks)) {
  const ok = !!v && v.startsWith('<svg') && v.includes('</svg>');
  console.log(`${k}: ${ok?'OK':'FAIL'} (${v?v.length:0} chars)`);
}
// null safety: bad spec must return null not throw
console.log('null-safety:', buildDiagramFromSpec({type:'traverse',legs:[{azVar:'x',distVar:'y'}]},{})===null ? 'OK' : 'FAIL');
fs.writeFileSync('scripts/_tmp_landlaw/diag/preview.html', '<style>body{display:flex;flex-wrap:wrap;gap:12px;background:#eef}</style>'+Object.values(checks).join(''));
console.log('wrote preview.html');
