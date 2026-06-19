const { Client } = require('pg');
const fs = require('fs');
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const ids = process.argv.slice(2);
  const out = [];
  for (const oi of ids) {
    const m = (await c.query(`select id, order_index, title, description, tags from learning_modules where order_index=$1 and coalesce(is_academic,false)=false and deleted_at is null order by id limit 1`,[oi])).rows[0];
    if(!m){ console.log('NO MODULE order',oi); continue; }
    const les = (await c.query(`select id, title, order_index from learning_lessons where module_id=$1 and deleted_at is null order by order_index, title`,[m.id])).rows;
    out.push({ module: m, lessons: les });
    console.log(`order ${oi}: ${m.title} (${les.length} lessons) id=${m.id}`);
  }
  fs.writeFileSync('scripts/_tmp_landlaw/existing/_targets.json', JSON.stringify(out,null,1));
  await c.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
