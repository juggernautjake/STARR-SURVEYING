// lib/jobs/calc.ts — a tiny, safe arithmetic evaluator for the Work Mode field calculator.
//
// A field worker wants a quick calculator without leaving the hub. Rather than `eval` (unsafe) this
// tokenizes a +−×÷ expression, converts to RPN (shunting-yard), and evaluates — so it only ever does
// arithmetic, never runs code. Supports + - * / decimals, unary minus, and parentheses. Pure + tested.

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'lp' } | { t: 'rp' };

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

/** Normalize the display operators (× ÷ −) to ASCII so the tokenizer sees one form. */
function normalize(expr: string): string {
  return expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/[−–—]/g, '-').replace(/\s+/g, '');
}

function tokenize(expr: string): Tok[] {
  const s = normalize(expr);
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    // Unary minus in "operator position" (start, or after an op / '(') negates the FOLLOWING number
    // directly — so 3*-2 is 3 × (−2), not (3×0)−2. (A unary minus before a '(' falls back below.)
    const prev = out[out.length - 1];
    const unaryPos = !prev || prev.t === 'op' || prev.t === 'lp';
    if (c === '-' && unaryPos && i + 1 < s.length && (s[i + 1] >= '0' && s[i + 1] <= '9' || s[i + 1] === '.')) {
      let j = i + 1;
      while (j < s.length && (s[j] >= '0' && s[j] <= '9' || s[j] === '.')) j++;
      const v = Number(s.slice(i + 1, j));
      if (!Number.isFinite(v)) throw new Error('bad number');
      out.push({ t: 'num', v: -v });
      i = j;
      continue;
    }
    if (c >= '0' && c <= '9' || c === '.') {
      let j = i + 1;
      while (j < s.length && (s[j] >= '0' && s[j] <= '9' || s[j] === '.')) j++;
      const v = Number(s.slice(i, j));
      if (!Number.isFinite(v)) throw new Error('bad number');
      out.push({ t: 'num', v });
      i = j;
    } else if (c === '(') { out.push({ t: 'lp' }); i++; }
    else if (c === ')') { out.push({ t: 'rp' }); i++; }
    else if (c in PREC) {
      if (c === '-' && unaryPos) out.push({ t: 'num', v: 0 }); // e.g. -(2+3) → 0-(2+3)
      out.push({ t: 'op', v: c });
      i++;
    } else {
      throw new Error(`unexpected "${c}"`);
    }
  }
  return out;
}

/** Evaluate an arithmetic expression, or return null when it's incomplete/invalid (so the UI can just
 *  show nothing rather than throw). Division by zero → null. */
export function evalArithmetic(expr: string): number | null {
  let tokens: Tok[];
  try { tokens = tokenize(expr); } catch { return null; }
  if (!tokens.length) return null;

  // Shunting-yard → RPN.
  const output: Tok[] = [];
  const ops: Tok[] = [];
  for (const tk of tokens) {
    if (tk.t === 'num') output.push(tk);
    else if (tk.t === 'op') {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t === 'op' && PREC[top.v] >= PREC[tk.v]) output.push(ops.pop()!);
        else break;
      }
      ops.push(tk);
    } else if (tk.t === 'lp') ops.push(tk);
    else { // rp
      let matched = false;
      while (ops.length) {
        const top = ops.pop()!;
        if (top.t === 'lp') { matched = true; break; }
        output.push(top);
      }
      if (!matched) return null; // unbalanced
    }
  }
  while (ops.length) {
    const top = ops.pop()!;
    if (top.t === 'lp') return null; // unbalanced
    output.push(top);
  }

  // Evaluate the RPN.
  const stack: number[] = [];
  for (const tk of output) {
    if (tk.t === 'num') stack.push(tk.v);
    else if (tk.t === 'op') {
      const b = stack.pop(); const a = stack.pop();
      if (a === undefined || b === undefined) return null;
      let r: number;
      if (tk.v === '+') r = a + b;
      else if (tk.v === '-') r = a - b;
      else if (tk.v === '*') r = a * b;
      else { if (b === 0) return null; r = a / b; }
      stack.push(r);
    }
  }
  if (stack.length !== 1 || !Number.isFinite(stack[0])) return null;
  return stack[0];
}

/** Format a calculator result: trims floating-point noise to at most 6 decimals, no trailing zeros. */
export function formatCalcResult(n: number): string {
  if (!Number.isFinite(n)) return '';
  const r = Math.round(n * 1e6) / 1e6;
  return Number.isInteger(r) ? String(r) : String(r);
}
