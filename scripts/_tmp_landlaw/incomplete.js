const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  // existing non-academic modules and how many of their lessons have ZERO blocks (empty content)
  const rows = (await c.query(`
    select m.id, m.order_index, m.title,
      count(distinct l.id) lessons,
      count(distinct l.id) filter (where bk.cnt is null or bk.cnt=0) empty_lessons
    from learning_modules m
    join learning_lessons l on l.module_id=m.id
    left join (select lesson_id, count(*) cnt from lesson_blocks group by 1) bk on bk.lesson_id=l.id
    where coalesce(m.is_academic,false)=false and m.deleted_at is null
    group by m.id, m.order_index, m.title
    order by m.order_index`)).rows;
  let totEmpty=0, totLes=0;
  for (const r of rows){ totEmpty+=+r.empty_lessons; totLes+=+r.lessons; console.log(`[${String(r.order_index).padStart(2)}] ${r.title.slice(0,46).padEnd(46)} lessons=${r.lessons} empty=${r.empty_lessons}`); }
  console.log(`\nNON-ACADEMIC: ${rows.length} modules, ${totLes} lessons, ${totEmpty} EMPTY lessons need content`);
  await c.end();
})().catch(e=>{console.error('ERR', e.message); process.exit(1);});
