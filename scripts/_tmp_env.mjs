import fs from 'node:fs';
import pg from 'pg';
const raw = (fs.readFileSync('.env.local','utf8').match(/SUPABASE_DB_URL\s*=\s*"?([^"\n\r]+)"?/)||[])[1];
const c = new pg.Client({ connectionString: raw.trim(), ssl:{rejectUnauthorized:false} });
await c.connect();
const rows = (await c.query("select name, type, tags, description, statblock, environments from dnd_creatures")).rows;
console.log('with environments already:', rows.filter(r=>(r.environments||[]).length).length);

// How many creatures MENTION an environment word in their own prose?
const ENV = ['arctic','desert','forest','grassland','hill','mountain','swamp','underdark','underground','urban','coastal','ocean','sea','jungle','cave','tundra','marsh','plains','sky','subterranean'];
let mention = 0; const hits = {};
for (const r of rows) {
  const text = `${r.description||''} ${JSON.stringify(r.statblock||{})}`.toLowerCase();
  const found = ENV.filter(e => new RegExp(`\b${e}s?\b`).test(text));
  if (found.length) { mention++; for (const f of found) hits[f]=(hits[f]||0)+1; }
}
console.log('mention an environment word in their own text:', mention, `(${(mention/rows.length*100).toFixed(1)}%)`);
console.log(Object.entries(hits).sort((a,b)=>b[1]-a[1]).slice(0,12));

// Plane-bearing types
const byTag = {};
for (const r of rows) { const t=(r.tags||[])[0]; if(t) byTag[t]=(byTag[t]||0)+1; }
const PLANAR = ['fiend','celestial','elemental','fey','undead','aberration','construct'];
console.log('\ncreatures whose TYPE implies a plane of origin:',
  PLANAR.reduce((n,t)=>n+(byTag[t]||0),0), 'of', rows.length);
for (const t of PLANAR) console.log('  ', t, byTag[t]||0);
await c.end();
