const { Client } = require('pg');
const fs = require('fs');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async () => {
  let c, ok=false;
  for (let attempt=1; attempt<=5 && !ok; attempt++){
    c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
    try { await c.connect(); ok=true; }
    catch(e){ console.error(`connect attempt ${attempt} failed: code=${e.code} msg=${JSON.stringify(e.message)}`); await sleep(1500); }
  }
  if(!ok){ console.error('could not connect after retries'); process.exit(2); }
  try {
    for (const f of process.argv.slice(2)) {
      const sql = fs.readFileSync(f, 'utf8');
      try {
        const res = await c.query(sql);
        const last = Array.isArray(res) ? res[res.length-1] : res;
        console.log(`APPLIED ${f}` + (last && last.rows && last.rows[0] ? ' -> ' + JSON.stringify(last.rows[0]) : ''));
      } catch (e) {
        console.error(`FAILED ${f} -> code=${e.code} ${e.message}`);
        if (e.position) { const p=parseInt(e.position); console.error('  near: ...' + sql.slice(Math.max(0,p-160), p+100).replace(/\n/g,' ') + '...'); }
        await c.end(); process.exit(1);
      }
    }
  } finally { try{ await c.end(); }catch{} }
})().catch(e=>{console.error('OUTER', e && e.stack || e); process.exit(3);});
