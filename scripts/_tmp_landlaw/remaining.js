const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const rows = (await c.query(`
    select m.id, m.order_index, m.title, coalesce(m.acc_course_id,'') acc,
      count(distinct l.id) lessons,
      count(distinct l.id) filter (where bk.cnt is null or bk.cnt=0) empty
    from learning_modules m
    join learning_lessons l on l.module_id=m.id and l.deleted_at is null
    left join (select lesson_id,count(*) cnt from lesson_blocks group by 1) bk on bk.lesson_id=l.id
    where m.deleted_at is null and coalesce(m.acc_course_id,'') <> 'nmsu-sur292'
    group by m.id, m.order_index, m.title, m.acc_course_id
    having count(distinct l.id) filter (where bk.cnt is null or bk.cnt=0) > 0
    order by m.order_index, m.title`)).rows;
  let totEmpty=0;
  for (const r of rows){ totEmpty+=+r.empty; console.log(`${r.id}  [${String(r.order_index).padStart(2)}] ${r.title.slice(0,44).padEnd(44)} empty=${r.empty}/${r.lessons} acc=${r.acc}`); }
  console.log(`\nREMAINING: ${rows.length} modules, ${totEmpty} empty lessons`);
  await c.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
