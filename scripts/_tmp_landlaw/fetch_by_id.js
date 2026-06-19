// usage: node fetch_by_id.js <key>:<module_id> ...  -> writes _targets.json with module.order_index=<key>
const { Client } = require('pg');
const fs = require('fs');
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const out = [];
  for (const arg of process.argv.slice(2)) {
    const [key, id] = arg.split(':');
    const m = (await c.query(`select id, order_index, title, description from learning_modules where id=$1`,[id])).rows[0];
    if(!m){ console.log('NO MODULE', id); continue; }
    const les = (await c.query(`select id, title, order_index from learning_lessons where module_id=$1 and deleted_at is null order by order_index, title`,[id])).rows;
    out.push({ key, module: { id: m.id, order_index: Number(key), real_order: m.order_index, title: m.title, description: m.description }, lessons: les });
    console.log(`key ${key}: ${m.title} (${les.length} lessons) id=${m.id}`);
  }
  fs.writeFileSync('scripts/_tmp_landlaw/existing/_targets.json', JSON.stringify(out,null,1));
  await c.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
