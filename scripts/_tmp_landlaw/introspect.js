const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const more = (await c.query(`select table_name from information_schema.tables where table_schema='public' and (table_name ilike '%quiz%' or table_name ilike '%lesson%' or table_name ilike '%learning%' or table_name ilike '%question%' or table_name ilike '%flashcard%' or table_name ilike '%practice%' or table_name ilike '%problem%' or table_name ilike '%module%' or table_name ilike '%curriculum%' or table_name ilike '%course%' or table_name ilike '%topic%') order by table_name`)).rows.map(r=>r.table_name);
  console.log('RELATED_TABLES:\n' + more.join('\n'));
  await c.end();
})().catch(e=>{console.error('ERR', e.message); process.exit(1);});
