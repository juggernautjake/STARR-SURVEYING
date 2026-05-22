// lib/calculators/models/casio-fx-115/keypad-data.ts
//
// Casio fx-115ES PLUS keypad layout. F-7 of CALCULATOR_FIDELITY.md.
//
// Split off from the fx-991 reuse so the fx-115 can drift if/when the
// devices' silkscreens diverge further. The two are siblings in the
// ES PLUS family and share ~95% of the key set; the fx-115 omits a
// couple of fx-991-exclusive functions:
//
//   • No base-N conversion modes (BIN/OCT/HEX/DEC) — fx-115 has only
//     decimal arithmetic; that menu entry on MODE doesn't exist.
//   • Fewer numerical-solver modes on the SETUP submenu.
//   • The `Abs` key on fx-115 carries a slightly different ALPHA-shift
//     letter (the silkscreen is `A` on both, but the cell position
//     differs by one row on some fx-115 revisions — we keep the fx-991
//     position for v1 and flag for V-F user spot-check).
//
// Engine is still the shared fx-991 algebraic engine. Distinct
// `model_key='casio-fx-115'` keeps state isolated per device.

import type { KeyDef, KeyKind } from '@/lib/calculators/shared';

const op = (kind: KeyKind = 'op'): { kind: KeyKind } => ({ kind });

export const CASIO_FX115_KEYPAD: KeyDef[] = [
  // Row 1 — modifiers + mode + nav up + ON
  { id: 'shift', row: 1, col: 1, label: 'SHIFT', ...op('shift'), tone: 'shift' },
  { id: 'alpha', row: 1, col: 2, label: 'ALPHA', ...op('shift'), tone: 'shift' },
  { id: 'up',    row: 1, col: 3, label: '▲', ...op('nav'),       tone: 'accent' },
  { id: 'mode',  row: 1, col: 4, label: 'MODE',  shiftLabel: 'SETUP',  ...op('mode'),  tone: 'soft' },
  { id: 'on',    row: 1, col: 5, label: 'ON',    shiftLabel: 'OFF',    ...op('clear'), tone: 'soft' },

  // Row 2 — nav cluster + Abs
  { id: 'left',  row: 2, col: 2, label: '◀', ...op('nav'), tone: 'accent' },
  { id: 'replay',row: 2, col: 3, label: 'REPLAY', ...op('nav'), tone: 'accent' },
  { id: 'right', row: 2, col: 4, label: '▶', ...op('nav'), tone: 'accent' },
  { id: 'absx',  row: 2, col: 5, label: 'Abs', ...op(), tone: 'soft' },

  // Row 3 — function row
  { id: 'down',  row: 3, col: 3, label: '▼', ...op('nav'),     tone: 'accent' },
  { id: 'frac',  row: 3, col: 1, label: '◇/▢', shiftLabel: '◇/▢/▢', ...op(),  tone: 'soft' },
  { id: 'sqrt',  row: 3, col: 2, label: '√',    shiftLabel: '∛',     ...op(),  tone: 'soft' },
  { id: 'xsq',   row: 3, col: 4, label: 'x²',   shiftLabel: 'x⁻¹',   ...op(),  tone: 'soft' },
  { id: 'pow',   row: 3, col: 5, label: '^',    shiftLabel: '√(',    ...op(),  tone: 'soft' },

  // Row 4 — log/ln/hyp/dms/eng
  { id: 'log',   row: 4, col: 1, label: 'log',  shiftLabel: '10ˣ',   ...op(), tone: 'soft' },
  { id: 'ln',    row: 4, col: 2, label: 'ln',   shiftLabel: 'eˣ',    ...op(), tone: 'soft' },
  { id: 'hyp',   row: 4, col: 3, label: 'hyp',  ...op(),             tone: 'soft' },
  { id: 'dms',   row: 4, col: 4, label: '° ′ ″', shiftLabel: '◄DMS', ...op(), tone: 'soft' },
  { id: 'eng',   row: 4, col: 5, label: 'ENG',  ...op(),             tone: 'soft' },

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

  // Bottom row — same as the fx-991 layout post-F-2 fidelity fix:
  // `0 | . | (−) | Ans | =`
  { id: 'n0',   row: 10, col: 1, label: '0',   ...op('digit'),  tone: 'digit' },
  { id: 'dot',  row: 10, col: 2, label: '.',   ...op('dot'),    tone: 'digit' },
  { id: 'neg',  row: 10, col: 3, label: '(−)', ...op('negate'), tone: 'digit' },
  { id: 'ans',  row: 10, col: 4, label: 'Ans', shiftLabel: 'DRG', ...op('ans'), tone: 'soft' },
  { id: 'eq',   row: 10, col: 5, label: '=',   ...op('eval'),   tone: 'eval' },
];

export const CASIO_FX115_GRID = { rows: 10, cols: 5 };
