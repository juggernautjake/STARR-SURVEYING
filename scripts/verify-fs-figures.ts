// scripts/verify-fs-figures.ts
//
// Figure↔question consistency check. For every figure-bearing FS template it
// generates many instances and asserts the numbers rendered in the diagram
// exactly match the numbers in the question text (and satisfy internal
// derivations). Run:  npx tsx scripts/verify-fs-figures.ts
//
// Both the question text and the diagram are produced from the SAME randomized
// vars in one generateFromTemplate call, so a mismatch means the diagram spec
// references the wrong variable — exactly the class of bug we must catch.

import { generateFromTemplate, dbRowToTemplate } from '../lib/problemEngine';
// @ts-expect-error - no type declarations for 'pg'
import pg from 'pg';
import fs from 'node:fs';

const N = 8; // instances per template

function svgLabels(svg: string): string[] {
  const out: string[] = [];
  const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) out.push(m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  return out;
}
const numsIn = (s: string): number[] => (s.match(/-?\d+(?:,\d{3})*(?:\.\d+)?/g) || []).map(x => parseFloat(x.replace(/,/g, '')));
// first number after a marker substring
function after(text: string, marker: RegExp): number | null {
  const m = text.match(marker);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}
const approx = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;

interface Chk { ok: boolean; msg: string }
type Checker = (q: string, labels: string[], ans: number) => Chk;

const checkers: Record<string, Checker> = {
  // towerTwoAngles: A=alpha, B=beta, baseline=d
  'fa29f000-0000-0000-0000-000000000002': (q, labels, _a) => {
    const alpha = after(q, /angle A = (\d+(?:\.\d+)?)/);
    const beta = after(q, /angle B = (\d+(?:\.\d+)?)/);
    const d = after(q, /moves (\d+(?:\.\d+)?) ft/);
    const aLab = labels.find(l => /^A =/.test(l)); const bLab = labels.find(l => /^B =/.test(l));
    const dLab = labels.find(l => /^\d+(?:\.\d+)?'$/.test(l));
    const aFig = aLab ? numsIn(aLab)[0] : null, bFig = bLab ? numsIn(bLab)[0] : null, dFig = dLab ? numsIn(dLab)[0] : null;
    const ok = alpha === aFig && beta === bFig && d === dFig && aLab != null && bLab != null && dLab != null;
    return { ok, msg: `Q(A=${alpha},B=${beta},d=${d}) vs FIG(A=${aFig},B=${bFig},d=${dFig})` };
  },
  // curve: R, I match; T, LC internally consistent
  'fa30f000-0000-0000-0000-000000000003': (q, labels, _a) => {
    const R = after(q, /R = (\d+(?:\.\d+)?) ft/); const I = after(q, /I = (\d+(?:\.\d+)?)/);
    const rLab = labels.find(l => /^R =/.test(l)); const iLab = labels.find(l => /^I =/.test(l));
    const tLab = labels.find(l => /^T =/.test(l)); const lcLab = labels.find(l => /^LC =/.test(l));
    const Rfig = rLab ? numsIn(rLab)[0] : null, Ifig = iLab ? numsIn(iLab)[0] : null;
    const half = ((I || 0) * Math.PI / 180) / 2;
    const Texp = (R || 0) * Math.tan(half), LCexp = 2 * (R || 0) * Math.sin(half);
    const Tfig = tLab ? numsIn(tLab)[0] : NaN, LCfig = lcLab ? numsIn(lcLab)[0] : NaN;
    const ok = R === Rfig && I === Ifig && approx(Tfig, Texp, 0.05) && approx(LCfig, LCexp, 0.05);
    return { ok, msg: `Q(R=${R},I=${I}) FIG(R=${Rfig},I=${Ifig}) T=${Tfig}~${Texp.toFixed(2)} LC=${LCfig}~${LCexp.toFixed(2)}` };
  },
  // roundedLot: L, W, r
  'fa30f000-0000-0000-0000-000000000002': (q, labels, _a) => {
    const W = after(q, /A (\d+(?:\.\d+)?)-ft/); const L = after(q, /× (\d+(?:\.\d+)?)-ft/);
    const r = after(q, /radius (\d+(?:\.\d+)?) ft/);
    const rLab = labels.find(l => /^r =/.test(l)); const rFig = rLab ? numsIn(rLab)[0] : null;
    const dims = labels.filter(l => /^\d+(?:\.\d+)?'$/.test(l)).map(l => numsIn(l)[0]);
    const ok = rFig === r && dims.includes(L!) && dims.includes(W!);
    return { ok, msg: `Q(L=${L},W=${W},r=${r}) FIG dims=[${dims}] r=${rFig}` };
  },
  // plat (remainder): full-lot width w shown; remainder lot marked '?'
  'fa32f000-0000-0000-0000-000000000001': (q, labels, ans) => {
    const w = after(q, /a (\d+(?:\.\d+)?)\.00-ft record/);
    const M = after(q, /found (\d+(?:\.\d+)?) ft apart/);
    const dims = labels.filter(l => /^\d+(?:\.\d+)?'$/.test(l)).map(l => numsIn(l)[0]);
    const wCount = dims.filter(d => d === w).length;
    const remOk = approx((M || 0) - 4 * (w || 0), ans, 0.02); // remainder = M - 4w = answer
    const ok = wCount >= 4 && remOk && labels.includes('?');
    return { ok, msg: `Q(w=${w},M=${M},ans=${ans}) FIG wCount=${wCount} rem=?${labels.includes('?')} remChk=${remOk}` };
  },
  // profile: fl1, fl2 elevations present; cut marker present
  'fa33f000-0000-0000-0000-000000000001': (q, labels, _a) => {
    const fl1 = after(q, /flow line elev (\d+(?:\.\d+)?) ft\)/);
    const fl2 = after(q, /elev (\d+(?:\.\d+)?) ft\. At/);
    const elevs = labels.map(l => l).filter(l => /^\d{3,4}\.\d{2}$/.test(l)).map(l => parseFloat(l));
    const ok = fl1 != null && fl2 != null && elevs.some(e => approx(e, fl1, 0.005)) && elevs.some(e => approx(e, fl2, 0.005)) && labels.some(l => /cut/.test(l));
    return { ok, msg: `Q(fl1=${fl1},fl2=${fl2}) FIG elevs=[${elevs}] cut=${labels.some(l => /cut/.test(l))}` };
  },
  // crossSection: slope ratio and half-width
  'fa33f000-0000-0000-0000-000000000002': (q, labels, _a) => {
    const slope = after(q, /a (\d+(?:\.\d+)?):1 side/); const hw = after(q, /edge of road (\d+(?:\.\d+)?) ft/);
    const slopeLab = labels.find(l => /: 1$/.test(l)); const hwLab = labels.find(l => /to edge/.test(l));
    const slopeFig = slopeLab ? numsIn(slopeLab)[0] : null; const hwFig = hwLab ? numsIn(hwLab)[0] : null;
    const ok = slope === slopeFig && hw === hwFig;
    return { ok, msg: `Q(slope=${slope},hw=${hw}) FIG(slope=${slopeFig},hw=${hwFig})` };
  },
  // contour: two labeled index contours 5 intervals apart; answer above them
  'fa33f000-0000-0000-0000-000000000003': (_q, labels, ans) => {
    const idx = labels.filter(l => /^\d{1,3}(?:,\d{3})*$/.test(l)).map(l => parseFloat(l.replace(/,/g, ''))).sort((a, b) => a - b);
    if (idx.length < 2) return { ok: false, msg: `only ${idx.length} index labels: [${idx}]` };
    const interval = (idx[1] - idx[0]) / 5;
    const kAns = (ans - idx[0]) / interval;
    const ok = interval > 0 && Number.isInteger(Math.round(kAns * 1000) / 1000) && Math.abs(kAns - Math.round(kAns)) < 1e-6 && ans > idx[1];
    return { ok, msg: `labels=[${idx}] interval=${interval} ans=${ans} k=${kAns}` };
  },
};

async function main() {
  let url = process.env.SUPABASE_DB_URL;
  if (!url) { const m = fs.readFileSync('.env.local', 'utf8').match(/SUPABASE_DB_URL=(.+)/); url = m ? m[1].trim().replace(/^["']|["']$/g, '') : ''; }
  const c = new pg.Client({ connectionString: url }); await c.connect();
  const ids = Object.keys(checkers);
  const { rows } = await c.query(`select * from problem_templates where id = any($1::uuid[])`, [ids]);
  let totalFail = 0;
  for (const r of rows) {
    const tpl = dbRowToTemplate(r as never);
    let fails = 0; let firstFail = '';
    for (let i = 0; i < N; i++) {
      const g = generateFromTemplate(tpl) as { question_text: string; correct_answer: string; diagram?: string };
      if (!g.diagram) { fails++; if (!firstFail) firstFail = 'NO DIAGRAM'; continue; }
      const res = checkers[r.id](g.question_text, svgLabels(g.diagram), parseFloat(g.correct_answer));
      if (!res.ok) { fails++; if (!firstFail) firstFail = res.msg; }
    }
    totalFail += fails;
    console.log(`${fails === 0 ? 'PASS' : 'FAIL'}  ${r.name}: ${N - fails}/${N}${fails ? '  ← ' + firstFail : ''}`);
  }
  await c.end();
  console.log(totalFail === 0 ? '\nALL FIGURE↔QUESTION CHECKS PASS' : `\n${totalFail} FAILURES`);
  process.exit(totalFail === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
