import { dbRowToTemplate, generateFromTemplate, generateParameterValues, evalFormula } from '../../../lib/problemEngine';
import * as fs from 'fs';
const j = JSON.parse(fs.readFileSync('scripts/_tmp_landlaw/fs/m7.json','utf8'));
for (const t of j.problem_templates) {
  if (!/aliquot|quarter-fraction/i.test(t.name)) continue;
  const tmpl = dbRowToTemplate({ ...t, parameters: t.parameters, computed_vars: t.computed_vars, answer_format: t.answer_format, tags: [], is_active: true });
  const vars = generateParameterValues(t.parameters);
  for (const cv of t.computed_vars) vars[cv.name] = evalFormula(cv.formula, vars);
  console.log('\n== '+t.name);
  console.log('vars:', JSON.stringify(vars));
  console.log('answer eval:', evalFormula(t.answer_formula, vars));
}
