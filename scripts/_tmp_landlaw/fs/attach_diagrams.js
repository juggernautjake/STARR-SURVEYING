const fs = require('fs');
// map: module -> { templateIndex -> diagramSpec }
const MAP = {
  2: {
    1: { type:'leveling', bsVar:'bs', fsVar:'fs', title:'Differential leveling: HI − FS' },
  },
  3: {
    2: { type:'compass', azVar:'az', title:'Azimuth → bearing' },
    4: { type:'compass', azVar:'az', title:'Forward azimuth' },
  },
  4: {
    0: { type:'traverse', legs:[{azVar:'az',distVar:'dist',label:'course'}], title:'Course (latitude)' },
    1: { type:'traverse', legs:[{azVar:'az',distVar:'dist',label:'course'}], title:'Course (departure)' },
    2: { type:'inverse', aNVar:'nA',aEVar:'eA',bNVar:'nB',bEVar:'eB',aLabel:'A',bLabel:'B', title:'Inverse A→B (distance)' },
    3: { type:'inverse', aNVar:'nA',aEVar:'eA',bNVar:'nB',bEVar:'eB',aLabel:'A',bLabel:'B', title:'Inverse A→B (azimuth)' },
    4: { type:'traverse', startNVar:'n1', startEVar:'e1', legs:[{azVar:'az',distVar:'dist',label:'P→Q'}], title:'Forward: coordinates of Q' },
    5: { type:'traverse', startNVar:'n1', startEVar:'e1', legs:[{azVar:'az',distVar:'dist',label:'P→Q'}], title:'Forward: coordinates of Q' },
    8: { type:'triangle', vertices:[{nVar:'nA',eVar:'eA',label:'A'},{nVar:'nB',eVar:'eB',label:'B'},{nVar:'nC',eVar:'eC',label:'C'}], title:'Area by coordinates' },
  },
  5: {
    0: { type:'triangle', vertices:[{nVar:'nA',eVar:'eA',label:'A'},{nVar:'nB',eVar:'eB',label:'B'},{nVar:'nC',eVar:'eC',label:'C'},{nVar:'nD',eVar:'eD',label:'D'}], title:'Parcel by coordinates' },
    4: { type:'curve', rVar:'R', iVar:'I', title:'Horizontal curve: tangent T' },
    5: { type:'curve', rVar:'R', iVar:'I', title:'Horizontal curve: length L' },
    7: { type:'curve', rVar:'R', iVar:'I', title:'Horizontal curve: external E' },
  },
  9: {
    2: { type:'inverse', aNVar:'nA',aEVar:'eA',bNVar:'nB',bEVar:'eB',aLabel:'A',bLabel:'B', title:'Inverse via R▸P (distance)' },
    3: { type:'inverse', aNVar:'nA',aEVar:'eA',bNVar:'nB',bEVar:'eB',aLabel:'A',bLabel:'B', title:'Inverse via R▸P (azimuth)' },
    4: { type:'traverse', startNVar:'nP', startEVar:'eP', legs:[{azVar:'az',distVar:'dist',label:'P→Q'}], title:'Forward via P▸R' },
    6: { type:'triangle', vertices:[{nVar:'nA',eVar:'eA',label:'A'},{nVar:'nB',eVar:'eB',label:'B'},{nVar:'nC',eVar:'eC',label:'C'}], title:'Area by coordinates' },
    7: { type:'curve', rVar:'R', iVar:'I', title:'Horizontal curve: tangent T' },
  },
};
let count = 0;
for (const [N, idxMap] of Object.entries(MAP)) {
  const p = `scripts/_tmp_landlaw/fs/m${N}.json`;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const [idx, spec] of Object.entries(idxMap)) {
    if (j.problem_templates && j.problem_templates[+idx]) { j.problem_templates[+idx].diagram = spec; count++; }
    else console.log(`WARN m${N} idx ${idx} missing`);
  }
  fs.writeFileSync(p, JSON.stringify(j, null, 1));
}
console.log(`attached ${count} diagram specs`);
