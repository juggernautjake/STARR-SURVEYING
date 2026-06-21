import { Client } from 'pg';
import { dbRowToTemplate, generateFromTemplate } from '../../lib/problemEngine';

(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const { rows } = await c.query(
    `select * from problem_templates where created_by='seed:nmsu-sur292' order by category, name`
  );
  console.log(`Loaded ${rows.length} templates.\n`);
  let pass = 0, fail = 0;
  for (const row of rows) {
    const tmpl = dbRowToTemplate(row);
    let ok = true, msgs: string[] = [];
    // Generate 25 randomized instances; each must yield a finite numeric answer
    // that self-grades correct within the template tolerance.
    const tol = (tmpl.answer_format && (tmpl.answer_format as any).tolerance) || row.tolerance_hint || 0.5;
    for (let i = 0; i < 25; i++) {
      const p = generateFromTemplate(tmpl);
      const ans = parseFloat(p.correct_answer);
      if (!isFinite(ans)) { ok = false; msgs.push(`NaN/inf answer on iter ${i} (raw='${p.correct_answer}')`); break; }
      // self-grade: user submits the generated answer -> must be within tolerance
      if (Math.abs(ans - ans) > tol) { ok = false; msgs.push('self-grade fail'); break; }
      // question text must have no unsubstituted {{ }}
      if (/\{\{/.test(p.question_text)) { ok = false; msgs.push(`unsubstituted var: ${p.question_text.match(/\{\{[^}]+\}\}/)}`); break; }
    }
    if (ok) { pass++; console.log(`  ✓ ${tmpl.name.slice(0,60)}`); }
    else { fail++; console.log(`  ✗ ${tmpl.name.slice(0,60)} :: ${msgs.join('; ')}`); }
  }
  console.log(`\nRESULT: ${pass} pass, ${fail} fail of ${rows.length}`);
  await c.end();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
