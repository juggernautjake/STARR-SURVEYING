// lib/calculators/models/ti-30xa/keypad-data.ts
//
// TI-30Xa keypad layout. **Rewritten from a high-resolution user-provided
// device photo** during the CALCULATOR_POLISH_2 round. The earlier shipped
// layout had a generic numeric-block-on-the-left arrangement; the real
// TI-30Xa interleaves the numeric block with memory keys (STO/RCL/a b/c/←)
// in column 1, with the standard operator stack (÷ × − + =) in column 5.
//
// Photo-confirmed grid is 5 cols × 8 rows. Every key has a yellow 2nd-shift
// label printed above it. The 2nd key itself is **green** (not yellow,
// which is unusual for TI); digit + operator keys are **black** with
// white labels; everything else is light grey. Color overrides land in
// CalculatorModal.css under .calc-model--ti-30xa.
//
// Engine semantics still come from the shared TI-36X Pro algebraic engine.

import type { KeyDef, KeyKind } from '@/lib/calculators/shared';

const op = (kind: KeyKind = 'op'): { kind: KeyKind } => ({ kind });

export const TI_30XA_KEYPAD: KeyDef[] = [
  // ── Row 1 — modifier + DRG/LOG/LN/OFF ─────────────────────────────────
  { id: '2nd',   row: 1, col: 1, label: '2nd',                                  ...op('shift'), tone: 'shift' },
  { id: 'mode',  row: 1, col: 2, label: 'DRG',  shiftLabel: 'DRG►',            ...op('mode'),  tone: 'soft' },
  { id: 'log',   row: 1, col: 3, label: 'LOG',  shiftLabel: '10ˣ',             ...op(),         tone: 'soft' },
  { id: 'ln',    row: 1, col: 4, label: 'LN',   shiftLabel: 'eˣ',              ...op(),         tone: 'soft' },
  { id: 'off',   row: 1, col: 5, label: 'OFF',  shiftLabel: 'ˣ√y',             ...op('clear'),  tone: 'soft' },

  // ── Row 2 — HYP + trig + yˣ ──────────────────────────────────────────
  { id: 'hyp',   row: 2, col: 1, label: 'HYP',  shiftLabel: 'K',               ...op(),         tone: 'soft' },
  { id: 'sin',   row: 2, col: 2, label: 'SIN',  shiftLabel: 'SIN⁻¹',           ...op(),         tone: 'soft' },
  { id: 'cos',   row: 2, col: 3, label: 'COS',  shiftLabel: 'COS⁻¹',           ...op(),         tone: 'soft' },
  { id: 'tan',   row: 2, col: 4, label: 'TAN',  shiftLabel: 'TAN⁻¹',           ...op(),         tone: 'soft' },
  { id: 'pow',   row: 2, col: 5, label: 'yˣ',   shiftLabel: 'ˣ√y',             ...op(),         tone: 'soft' },

  // ── Row 3 — π / 1/x / x² / √x  with ÷ in the operator column ─────────
  { id: 'pi',    row: 3, col: 1, label: 'π',    shiftLabel: 'x≷y',             ...op(),         tone: 'soft' },
  { id: 'recip', row: 3, col: 2, label: '1/x',  shiftLabel: 'FRQ',             ...op(),         tone: 'soft' },
  { id: 'xsq',   row: 3, col: 3, label: 'x²',   shiftLabel: 'x̄',              ...op(),         tone: 'soft' },
  { id: 'sqrt',  row: 3, col: 4, label: '√x',   shiftLabel: 'σxn-1',           ...op(),         tone: 'soft' },
  { id: 'div',   row: 3, col: 5, label: '÷',                                    ...op('binop'),  tone: 'op' },

  // ── Row 4 — Σ+ / EE / ( / )  with × in the operator column ───────────
  { id: 'sigma', row: 4, col: 1, label: 'Σ+',   shiftLabel: 'Σ−',              ...op(),         tone: 'soft' },
  { id: 'ee',    row: 4, col: 2, label: 'EE',   shiftLabel: 'n',               ...op(),         tone: 'soft' },
  { id: 'lparen',row: 4, col: 3, label: '(',    shiftLabel: 'Σx',              ...op('paren'),  tone: 'soft' },
  { id: 'rparen',row: 4, col: 4, label: ')',    shiftLabel: 'Σx²',             ...op('paren'),  tone: 'soft' },
  { id: 'mul',   row: 4, col: 5, label: '×',                                    ...op('binop'),  tone: 'op' },

  // ── Row 5 — STO / 7 / 8 / 9 / −  ─────────────────────────────────────
  { id: 'sto',   row: 5, col: 1, label: 'STO',  shiftLabel: 'EXC',             ...op(),         tone: 'soft' },
  { id: 'n7',    row: 5, col: 2, label: '7',                                    ...op('digit'),  tone: 'digit' },
  { id: 'n8',    row: 5, col: 3, label: '8',    shiftLabel: 'nCr',             ...op('digit'),  tone: 'digit' },
  { id: 'n9',    row: 5, col: 4, label: '9',    shiftLabel: 'nPr',             ...op('digit'),  tone: 'digit' },
  { id: 'sub',   row: 5, col: 5, label: '−',                                    ...op('binop'),  tone: 'op' },

  // ── Row 6 — RCL / 4 / 5 / 6 / +  ─────────────────────────────────────
  { id: 'rcl',   row: 6, col: 1, label: 'RCL',  shiftLabel: 'SUM',             ...op(),         tone: 'soft' },
  { id: 'n4',    row: 6, col: 2, label: '4',    shiftLabel: 'FLO',             ...op('digit'),  tone: 'digit' },
  { id: 'n5',    row: 6, col: 3, label: '5',    shiftLabel: 'SCI',             ...op('digit'),  tone: 'digit' },
  { id: 'n6',    row: 6, col: 4, label: '6',    shiftLabel: 'ENG',             ...op('digit'),  tone: 'digit' },
  { id: 'add',   row: 6, col: 5, label: '+',                                    ...op('binop'),  tone: 'op' },

  // ── Row 7 — a b/c / 1 / 2 / 3 / =  ───────────────────────────────────
  { id: 'frac',  row: 7, col: 1, label: 'a b/c', shiftLabel: 'd/c',            ...op(),         tone: 'soft' },
  { id: 'n1',    row: 7, col: 2, label: '1',    shiftLabel: 'x³',              ...op('digit'),  tone: 'digit' },
  { id: 'n2',    row: 7, col: 3, label: '2',    shiftLabel: '%',               ...op('digit'),  tone: 'digit' },
  { id: 'n3',    row: 7, col: 4, label: '3',    shiftLabel: 'x!',              ...op('digit'),  tone: 'digit' },
  { id: 'eq',    row: 7, col: 5, label: '=',                                    ...op('eval'),   tone: 'eval' },

  // ── Row 8 — ← / 0 / . / +/− swap. Col 5 left empty (real device too) ─
  { id: 'del',   row: 8, col: 1, label: '←',    shiftLabel: 'F↔D',             ...op('delete'), tone: 'soft' },
  { id: 'n0',    row: 8, col: 2, label: '0',    shiftLabel: '³√x',             ...op('digit'),  tone: 'digit' },
  { id: 'dot',   row: 8, col: 3, label: '.',    shiftLabel: 'FIX',             ...op('dot'),    tone: 'digit' },
  { id: 'negate',row: 8, col: 4, label: '+⇄−',                                  ...op('negate'), tone: 'digit' },
];

export const TI_30XA_GRID = { rows: 8, cols: 5 };
