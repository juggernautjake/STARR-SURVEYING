const fs = require('fs');
const dir = 'scripts/_tmp_landlaw/content';
let tot={lessons:0,blocks:0,flashcards:0,questions:0,templates:0,homework:0,images:0};
for (let n=1;n<=7;n++){
  const p=`${dir}/m${n}.json`;
  let j;
  try { j=JSON.parse(fs.readFileSync(p,'utf8')); } catch(e){ console.log(`m${n}: JSON PARSE ERROR -> ${e.message}`); continue; }
  let blocks=0, flash=0, imgs=0;
  for (const l of j.lessons||[]){ blocks+=(l.blocks||[]).length; flash+=(l.flashcards||[]).length; imgs+=(l.images_needed||[]).length; }
  const q=(j.quiz_questions||[]).length, t=(j.problem_templates||[]).length, hw=(j.homework||[]).length;
  // check MC correctness
  let badMC=0;
  for (const qq of j.quiz_questions||[]){ if(qq.question_type==='multiple_choice' && !(qq.options||[]).includes(qq.correct_answer)) badMC++; }
  console.log(`m${n} [${(j.module&&j.module.title||'').slice(0,42)}] lessons=${(j.lessons||[]).length} blocks=${blocks} flash=${flash} Q=${q} tmpl=${t} hw=${hw} badMC=${badMC} order=${j.module&&j.module.order_index}`);
  tot.lessons+=(j.lessons||[]).length; tot.blocks+=blocks; tot.flashcards+=flash; tot.questions+=q; tot.templates+=t; tot.homework+=hw; tot.images+=imgs;
}
console.log('TOTALS:', JSON.stringify(tot));
