// lib/calculators/models/ti-30xa/keypad-data.ts
//
// TI-30Xa keypad layout. Added after the EXAM_CALCULATORS.md plan
// completed at the user's request to support the TI-30Xa.
//
// The TI-30Xa is the *original* TI-30X — a simple, single-line scientific
// calculator. Algebraic-entry only (no MathPrint, no multi-line display).
// Single 2nd shift modifier (yellow); no ALPHA. Common surveying-relevant
// features: trig + inverse via 2nd, log/10ˣ, ln/eˣ, x², √, yˣ, factorial,
// 3 memory slots (STO/RCL/SUM), DRG mode toggle, F↔D fraction toggle.
//
// Layout: 5 cols × 9 rows. Standard numeric block bottom-right; function
// keys above; 2nd in the top-left corner per device. Each key's secondary
// (2nd) label is printed above in yellow per the device convention.

import type { KeyDef, KeyKind } from '@/lib/calculators/shared';

const op = (kind: KeyKind = 'op'): { kind: KeyKind } => ({ kind });

export const TI_30XA_KEYPAD: KeyDef[] = [
  // Row 1 — 2nd + mode + clear/on
  { id: '2nd',  row: 1, col: 1, label: '2nd',       ...op('shift'), tone: 'shift' },
  { id: 'mode', row: 1, col: 2, label: 'DRG',       shiftLabel: 'DRG►',     ...op('mode'),  tone: 'soft' },
  { id: 'hyp',  row: 1, col: 3, label: 'HYP',       shiftLabel: 'HYP⁻¹',    ...op(),         tone: 'soft' },
  { id: 'frac', row: 1, col: 4, label: 'a b/c',     shiftLabel: 'F↔D',      ...op(),         tone: 'soft' },
  { id: 'clear', row: 1, col: 5, label: 'ON/AC',    shiftLabel: 'OFF',      ...op('clear'),  tone: 'soft' },

  // Row 2 — π, trig openers
  { id: 'pi',   row: 2, col: 1, label: 'π',         shiftLabel: 'e',        ...op(),         tone: 'soft' },
  { id: 'sin',  row: 2, col: 2, label: 'sin',       shiftLabel: 'sin⁻¹',   ...op(),         tone: 'soft' },
  { id: 'cos',  row: 2, col: 3, label: 'cos',       shiftLabel: 'cos⁻¹',   ...op(),         tone: 'soft' },
  { id: 'tan',  row: 2, col: 4, label: 'tan',       shiftLabel: 'tan⁻¹',   ...op(),         tone: 'soft' },
  { id: 'ee',   row: 2, col: 5, label: 'EE',        shiftLabel: 'EXP',     ...op(),         tone: 'soft' },

  // Row 3 — power / root / log / ln
  { id: 'xsq',  row: 3, col: 1, label: 'x²',        shiftLabel: '√',        ...op(),         tone: 'soft' },
  { id: 'recip',row: 3, col: 2, label: 'x⁻¹',       shiftLabel: 'x!',       ...op(),         tone: 'soft' },
  { id: 'pow',  row: 3, col: 3, label: 'yˣ',        shiftLabel: 'ʸ√x',      ...op(),         tone: 'soft' },
  { id: 'log',  row: 3, col: 4, label: 'log',       shiftLabel: '10ˣ',     ...op(),         tone: 'soft' },
  { id: 'ln',   row: 3, col: 5, label: 'ln',        shiftLabel: 'eˣ',      ...op(),         tone: 'soft' },

  // Row 4 — parens / EE etc.  + memory
  { id: 'lparen', row: 4, col: 1, label: '(',       shiftLabel: '%',       ...op('paren'),  tone: 'soft' },
  { id: 'rparen', row: 4, col: 2, label: ')',       shiftLabel: 'σ',       ...op('paren'),  tone: 'soft' },
  { id: 'sto',    row: 4, col: 3, label: 'STO',     ...op(),                tone: 'soft' },
  { id: 'rcl',    row: 4, col: 4, label: 'RCL',     ...op(),                tone: 'soft' },
  { id: 'sum',    row: 4, col: 5, label: 'SUM',     ...op(),                tone: 'soft' },

  // Row 5 — comma / →DMS / Abs / del
  { id: 'comma',  row: 5, col: 1, label: ',',        ...op('comma'),       tone: 'soft' },
  { id: 'dms',    row: 5, col: 2, label: '►DMS',    shiftLabel: 'D.MS',    ...op(),         tone: 'soft' },
  { id: 'absx',   row: 5, col: 3, label: '|x|',     ...op(),               tone: 'soft' },
  { id: 'ans',    row: 5, col: 4, label: 'ANS',     ...op('ans'),          tone: 'soft' },
  { id: 'del',    row: 5, col: 5, label: 'DEL',     shiftLabel: 'INS',     ...op('delete'), tone: 'soft' },

  // Row 6 — top of numeric block
  { id: 'n7',  row: 6, col: 1, label: '7', ...op('digit'),  tone: 'digit' },
  { id: 'n8',  row: 6, col: 2, label: '8', ...op('digit'),  tone: 'digit' },
  { id: 'n9',  row: 6, col: 3, label: '9', ...op('digit'),  tone: 'digit' },
  { id: 'mul', row: 6, col: 4, label: '×', ...op('binop'),  tone: 'op' },
  { id: 'div', row: 6, col: 5, label: '÷', ...op('binop'),  tone: 'op' },

  // Row 7
  { id: 'n4',  row: 7, col: 1, label: '4', ...op('digit'),  tone: 'digit' },
  { id: 'n5',  row: 7, col: 2, label: '5', ...op('digit'),  tone: 'digit' },
  { id: 'n6',  row: 7, col: 3, label: '6', ...op('digit'),  tone: 'digit' },
  { id: 'add', row: 7, col: 4, label: '+', ...op('binop'),  tone: 'op' },
  { id: 'sub', row: 7, col: 5, label: '−', ...op('binop'),  tone: 'op' },

  // Row 8
  { id: 'n1',  row: 8, col: 1, label: '1', ...op('digit'),  tone: 'digit' },
  { id: 'n2',  row: 8, col: 2, label: '2', ...op('digit'),  tone: 'digit' },
  { id: 'n3',  row: 8, col: 3, label: '3', ...op('digit'),  tone: 'digit' },
  { id: 'eq',  row: 8, col: 4, label: '=', ...op('eval'),   tone: 'eval', rowSpan: 2 },

  // Row 9 — zero / decimal / negate
  { id: 'n0',     row: 9, col: 1, label: '0',   ...op('digit'),   tone: 'digit' },
  { id: 'dot',    row: 9, col: 2, label: '.',   ...op('dot'),     tone: 'digit' },
  { id: 'negate', row: 9, col: 3, label: '(−)', ...op('negate'),  tone: 'digit' },
];

export const TI_30XA_GRID = { rows: 9, cols: 5 };
