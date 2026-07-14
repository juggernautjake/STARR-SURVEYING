// scripts/verify-fs-questions.ts
//
// Comprehensive generation check for the whole FS course. For EVERY FS problem
// template it generates many randomized instances and asserts the question is
// well-formed and the answer is always right:
//   • the answer_formula yields a finite, sane number every time,
//   • no {{placeholder}} survives in the question text,
//   • a positive grading tolerance is set,
//   • multiple-choice option sets always contain the correct answer (and are
//     distinct), so the right answer is never missing/duplicated,
//   • the numbers actually VARY across instances (parametric, not fixed),
//   • any attached figure renders (non-empty SVG) so every diagram is generated.
// Then it checks the static interaction questions (multi_select / ordering /
// drag_label / hotspot): the stored correct_answer must be consistent with the
// options / targets / regions the student sees.
//
// Run:  npx tsx scripts/verify-fs-questions.ts   (npm run verify:fs-questions)

import { generateFromTemplate, dbRowToTemplate } from '../lib/problemEngine';
// @ts-expect-error - no type declarations for 'pg'
import pg from 'pg';
import fs from 'node:fs';

const N = 25; // instances per template

function dbUrl(): string {
  let url = process.env.SUPABASE_DB_URL;
  if (!url) { const m = fs.readFileSync('.env.local', 'utf8').match(/SUPABASE_DB_URL=(.+)/); url = m ? m[1].trim().replace(/^["']|["']$/g, '') : ''; }
  return url || '';
}

const numEq = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-9);

interface Fail { template: string; reason: string }

async function main() {
  const c = new pg.Client({ connectionString: dbUrl() });
  await c.connect();

  const fails: Fail[] = [];
  let templateCount = 0;
  let instanceCount = 0;

  /* ---------- 1) Every FS problem template ---------- */
  const { rows: templates } = await c.query(
    `select * from problem_templates where (created_by like 'fs%' or 'fs-buildout' = any(tags) or exam_category = 'FS') and is_active`);

  for (const r of templates) {
    templateCount++;
    const tpl = dbRowToTemplate(r as never);
    const isMC = tpl.question_type === 'multiple_choice';
    const answers = new Set<string>();
    let templateFail = '';

    for (let i = 0; i < N && !templateFail; i++) {
      instanceCount++;
      let g: { question_text: string; correct_answer: string; options?: string[]; diagram?: string; tolerance?: number };
      try {
        g = generateFromTemplate(tpl) as typeof g;
      } catch (e) {
        templateFail = `threw: ${e instanceof Error ? e.message : String(e)}`;
        break;
      }

      // Answer must be a finite, sane number.
      const ans = parseFloat(g.correct_answer);
      if (!Number.isFinite(ans)) { templateFail = `non-finite answer "${g.correct_answer}"`; break; }
      if (Math.abs(ans) > 1e9) { templateFail = `implausible answer ${ans}`; break; }
      answers.add(g.correct_answer);

      // No unreplaced placeholders in the question text.
      if (/\{\{[^}]+\}\}/.test(g.question_text)) { templateFail = `unreplaced placeholder in "${g.question_text.slice(0, 80)}"`; break; }

      // Positive tolerance.
      if (!(typeof g.tolerance === 'number' && g.tolerance > 0)) { templateFail = `non-positive tolerance ${g.tolerance}`; break; }

      // Multiple-choice: options must include the correct answer and be distinct.
      if (isMC) {
        const opts = g.options || [];
        if (opts.length < 3) { templateFail = `only ${opts.length} options`; break; }
        const includes = opts.some(o => o === g.correct_answer || (Number.isFinite(parseFloat(o)) && numEq(parseFloat(o), ans)));
        if (!includes) { templateFail = `options ${JSON.stringify(opts)} miss answer ${g.correct_answer}`; break; }
        if (new Set(opts).size !== opts.length) { templateFail = `duplicate options ${JSON.stringify(opts)}`; break; }
      }

      // If the template declares a figure, it must render to a non-empty SVG.
      if (tpl.diagram && !(g.diagram && g.diagram.includes('<svg'))) { templateFail = `figure failed to render`; break; }
    }

    // Numbers must vary across instances (unless the template is genuinely fixed).
    if (!templateFail && answers.size < 2 && (tpl.parameters || []).some(p => p.type === 'integer' || p.type === 'float' || p.type === 'angle_dms' || p.type === 'bearing')) {
      templateFail = `answer never varied across ${N} instances (all = ${[...answers][0]})`;
    }

    if (templateFail) fails.push({ template: `${tpl.name} [${r.id}]`, reason: templateFail });
    console.log(`${templateFail ? 'FAIL' : 'PASS'}  ${tpl.name}${templateFail ? '  ← ' + templateFail : `  (${answers.size} distinct answers)`}`);
  }

  /* ---------- 2) Static interaction questions ---------- */
  const { rows: interactions } = await c.query(
    `select id, question_type, options, correct_answer, left(question_text,50) qt
       from question_bank
      where exam_category in ('FS','FS-MOCK')
        and question_type in ('multi_select','ordering','drag_label','hotspot')`);

  const norm = (s: unknown) => String(s).toLowerCase().trim();
  for (const q of interactions) {
    const opts = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
    let ca: unknown;
    try { ca = JSON.parse(q.correct_answer); } catch { ca = q.correct_answer; }
    let reason = '';

    if (q.question_type === 'multi_select') {
      const optSet = new Set((opts as string[]).map(norm));
      if (!Array.isArray(ca) || ca.length === 0) reason = 'correct_answer not a non-empty array';
      else for (const a of ca as string[]) if (!optSet.has(norm(a))) { reason = `answer "${a}" not in options`; break; }
    } else if (q.question_type === 'ordering') {
      const a = (ca as string[]).map(norm).sort();
      const o = (opts as string[]).map(norm).sort();
      if (!Array.isArray(ca) || a.length !== o.length || a.some((v, i) => v !== o[i])) reason = 'ordering answer is not a permutation of the options';
    } else if (q.question_type === 'drag_label') {
      const terms = new Set(((opts?.terms) || []).map(norm));
      const targets = (opts?.targets) || [];
      if (!Array.isArray(ca) || ca.length !== targets.length) reason = `answer length ${(ca as unknown[])?.length} != ${targets.length} targets`;
      else for (const a of ca as string[]) if (!terms.has(norm(a))) { reason = `placed term "${a}" not in term pool`; break; }
    } else if (q.question_type === 'hotspot') {
      const ids = new Set((((opts?.regions) || []) as { id: string }[]).map(r => norm(r.id)));
      if (!ids.has(norm(q.correct_answer))) reason = `correct region "${q.correct_answer}" not among regions`;
    }

    if (reason) fails.push({ template: `${q.question_type} "${q.qt}" [${q.id}]`, reason });
  }
  console.log(`\nInteraction questions checked: ${interactions.length}`);

  await c.end();

  console.log(`\nTemplates: ${templateCount} · instances generated: ${instanceCount} · interaction Qs: ${interactions.length}`);
  if (fails.length === 0) {
    console.log('\nALL FS QUESTION-GENERATION CHECKS PASS');
    process.exit(0);
  }
  console.log(`\n${fails.length} FAILURE(S):`);
  for (const f of fails) console.log(`  ✗ ${f.template}\n      ${f.reason}`);
  process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
