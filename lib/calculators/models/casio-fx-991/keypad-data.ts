// lib/calculators/models/casio-fx-991/keypad-data.ts
//
// Casio fx-991ES PLUS keypad layout. C-11 of EXAM_CALCULATORS.md.
//
// Layout deviates slightly from the physical device for clarity (the
// real fx-991ES PLUS uses 6 cols × ~9 rows with several keys split into
// shift/alpha sub-labels). We render 5 cols × 9 rows here with the
// most-used functions surfaced and shift alternates printed above. The
// underlying engine (C-13) handles SHIFT semantics; this slice is
// visual-only.

import type { KeyDef, KeyKind } from '@/lib/calculators/shared';

const op = (kind: KeyKind = 'op'): { kind: KeyKind } => ({ kind });

export const CASIO_FX991_KEYPAD: KeyDef[] = [
  // Row 1 — modifiers + mode + nav up
  { id: 'shift', row: 1, col: 1, label: 'SHIFT', ...op('shift'), tone: 'shift' },
  { id: 'alpha', row: 1, col: 2, label: 'ALPHA', ...op('shift'), tone: 'shift' },
  { id: 'up',    row: 1, col: 3, label: '▲', ...op('nav'),       tone: 'accent' },
  { id: 'mode',  row: 1, col: 4, label: 'MODE',  shiftLabel: 'SETUP',  ...op('mode'),  tone: 'soft' },
  { id: 'on',    row: 1, col: 5, label: 'ON',    shiftLabel: 'OFF',    ...op('clear'), tone: 'soft' },

  // Row 2 — nav cluster + replay
  { id: 'left',  row: 2, col: 2, label: '◀', ...op('nav'), tone: 'accent' },
  { id: 'replay',row: 2, col: 3, label: 'REPLAY', ...op('nav'), tone: 'accent' },
  { id: 'right', row: 2, col: 4, label: '▶', ...op('nav'), tone: 'accent' },
  { id: 'absx',  row: 2, col: 5, label: 'Abs', shiftLabel: '|x|', ...op(), tone: 'soft' },

  // Row 3 — function row
  { id: 'down',  row: 3, col: 3, label: '▼', ...op('nav'),     tone: 'accent' },
  { id: 'frac',  row: 3, col: 1, label: '◇/▢', shiftLabel: '◇/▢/▢', ...op(),  tone: 'soft' },
  { id: 'sqrt',  row: 3, col: 2, label: '√',    shiftLabel: '∛',     ...op(),  tone: 'soft' },
  { id: 'xsq',   row: 3, col: 4, label: 'x²',   shiftLabel: 'x⁻¹',   ...op(),  tone: 'soft' },
  { id: 'pow',   row: 3, col: 5, label: '^',    shiftLabel: '√(',    ...op(),  tone: 'soft' },

  // Row 4 — log/ln/exp
  { id: 'log',   row: 4, col: 1, label: 'log',  shiftLabel: '10ˣ',   ...op(), tone: 'soft' },
  { id: 'ln',    row: 4, col: 2, label: 'ln',   shiftLabel: 'eˣ',    ...op(), tone: 'soft' },
  { id: 'neg',   row: 4, col: 3, label: '(−)',  ...op('negate'),     tone: 'soft' },
  { id: 'dms',   row: 4, col: 4, label: '° ′ ″', shiftLabel: '◄DMS', ...op(), tone: 'soft' },
  { id: 'hyp',   row: 4, col: 5, label: 'hyp',  ...op(),             tone: 'soft' },

  // Row 5 — trig
  { id: 'sin',   row: 5, col: 1, label: 'sin',  shiftLabel: 'sin⁻¹', ...op(), tone: 'soft' },
  { id: 'cos',   row: 5, col: 2, label: 'cos',  shiftLabel: 'cos⁻¹', ...op(), tone: 'soft' },
  { id: 'tan',   row: 5, col: 3, label: 'tan',  shiftLabel: 'tan⁻¹', ...op(), tone: 'soft' },
  { id: 'recip', row: 5, col: 4, label: 'x⁻¹',  ...op(),             tone: 'soft' },
  { id: 'fact',  row: 5, col: 5, label: 'x!',   shiftLabel: 'nCr',   ...op(), tone: 'soft' },

  // Row 6 — parens / comma / EE / pi
  { id: 'lparen', row: 6, col: 1, label: '(',   shiftLabel: '%',     ...op('paren'), tone: 'soft' },
  { id: 'rparen', row: 6, col: 2, label: ')',   shiftLabel: ',',     ...op('paren'), tone: 'soft' },
  { id: 'comma',  row: 6, col: 3, label: ',',   ...op('comma'),       tone: 'soft' },
  { id: 'ee',     row: 6, col: 4, label: '×10ˣ', ...op(),             tone: 'soft' },
  { id: 'pi',     row: 6, col: 5, label: 'π',   shiftLabel: 'e',     ...op(), tone: 'soft' },

  // Numeric block — rows 7-9 + bottom row 10
  { id: 'n7',  row: 7, col: 1, label: '7', ...op('digit'),  tone: 'digit' },
  { id: 'n8',  row: 7, col: 2, label: '8', ...op('digit'),  tone: 'digit' },
  { id: 'n9',  row: 7, col: 3, label: '9', ...op('digit'),  tone: 'digit' },
  { id: 'del', row: 7, col: 4, label: 'DEL', shiftLabel: 'INS', ...op('delete'), tone: 'soft' },
  { id: 'ac',  row: 7, col: 5, label: 'AC',  shiftLabel: 'OFF', ...op('clear'),  tone: 'soft' },

  { id: 'n4',  row: 8, col: 1, label: '4', ...op('digit'),  tone: 'digit' },
  { id: 'n5',  row: 8, col: 2, label: '5', ...op('digit'),  tone: 'digit' },
  { id: 'n6',  row: 8, col: 3, label: '6', ...op('digit'),  tone: 'digit' },
  { id: 'mul', row: 8, col: 4, label: '×', ...op('binop'),  tone: 'op' },
  { id: 'div', row: 8, col: 5, label: '÷', ...op('binop'),  tone: 'op' },

  { id: 'n1',  row: 9, col: 1, label: '1', ...op('digit'),  tone: 'digit' },
  { id: 'n2',  row: 9, col: 2, label: '2', ...op('digit'),  tone: 'digit' },
  { id: 'n3',  row: 9, col: 3, label: '3', ...op('digit'),  tone: 'digit' },
  { id: 'add', row: 9, col: 4, label: '+', ...op('binop'),  tone: 'op' },
  { id: 'sub', row: 9, col: 5, label: '−', ...op('binop'),  tone: 'op' },

  { id: 'n0',   row: 10, col: 1, label: '0',   ...op('digit'),  tone: 'digit' },
  { id: 'dot',  row: 10, col: 2, label: '.',   ...op('dot'),    tone: 'digit' },
  { id: 'ans',  row: 10, col: 3, label: 'Ans', shiftLabel: 'DRG', ...op('ans'), tone: 'soft' },
  { id: 'eq',   row: 10, col: 4, label: '=',   ...op('eval'),   tone: 'eval', colSpan: 2 },
];

export const CASIO_FX991_GRID = { rows: 10, cols: 5 };
