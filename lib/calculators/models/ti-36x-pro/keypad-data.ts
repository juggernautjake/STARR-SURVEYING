// lib/calculators/models/ti-36x-pro/keypad-data.ts
//
// Static keypad data for the TI-36X Pro emulator.
// C-6 of EXAM_CALCULATORS.md.
//
// The renderer (`<Keypad>`) is generic — it takes a KeyDef[] and lays
// the keys out in a CSS grid. Adding a sibling model in Phase 5 is a
// reskin: copy this file, swap labels + positions, share the engine.
//
// Coordinates are 1-indexed CSS grid `gridArea` row/col pairs. Span > 1
// lets a key occupy multiple cells (e.g. up-arrow in TI's 4-direction
// pad). For C-6 the keys are visual-only — handler wiring lands in C-7.

import type { KeyDef, KeyKind } from '@/lib/calculators/shared';

const op = (kind: KeyKind = 'op'): { kind: KeyKind } => ({ kind });

export const TI_36X_PRO_KEYPAD: KeyDef[] = [
  // Row 1 — modifier / mode
  { id: '2nd',   row: 1, col: 1, label: '2nd',   shiftLabel: undefined,           ...op('shift'), tone: 'shift' },
  { id: 'mode',  row: 1, col: 2, label: 'mode',  shiftLabel: 'quit',              ...op('mode'),  tone: 'soft' },
  { id: 'math',  row: 1, col: 3, label: 'math',  shiftLabel: 'reset',             ...op(),         tone: 'soft' },
  { id: 'apps',  row: 1, col: 4, label: 'apps',  shiftLabel: 'recall mem',        ...op(),         tone: 'soft' },
  { id: 'clear', row: 1, col: 5, label: 'clear', shiftLabel: 'on/off',            ...op('clear'), tone: 'soft' },

  // Row 2 — navigation cluster
  { id: 'up',    row: 2, col: 3, label: '▲',     ...op('nav'),  tone: 'soft' },
  { id: 'left',  row: 3, col: 2, label: '◀',     ...op('nav'),  tone: 'soft' },
  { id: 'enter', row: 3, col: 3, label: 'enter', ...op('enter'), tone: 'accent' },
  { id: 'right', row: 3, col: 4, label: '▶',     ...op('nav'),  tone: 'soft' },
  { id: 'down',  row: 4, col: 3, label: '▼',     ...op('nav'),  tone: 'soft' },

  // Row 2/3 — quick functions surrounding the nav
  { id: 'pi',    row: 2, col: 1, label: 'π',     shiftLabel: 'e',                ...op(),         tone: 'soft' },
  { id: 'eepow', row: 2, col: 2, label: 'eᵉ',    shiftLabel: '10ˣ',              ...op(),         tone: 'soft' },
  { id: 'recip', row: 2, col: 4, label: 'x⁻¹',   shiftLabel: 'x',                ...op(),         tone: 'soft' },
  { id: 'sto',   row: 2, col: 5, label: 'sto→',  shiftLabel: 'mem',              ...op(),         tone: 'soft' },

  { id: 'frac',  row: 3, col: 1, label: 'a b/c', shiftLabel: 'F↔D',              ...op(),         tone: 'soft' },
  { id: 'pct',   row: 3, col: 5, label: '%',     shiftLabel: '→DMS',             ...op(),         tone: 'soft' },

  { id: 'xsq',   row: 4, col: 1, label: 'x²',    shiftLabel: '√',                ...op(),         tone: 'soft' },
  { id: 'xcube', row: 4, col: 2, label: 'x³',    shiftLabel: '³√',               ...op(),         tone: 'soft' },
  { id: 'pow',   row: 4, col: 4, label: 'xʸ',    shiftLabel: 'ʸ√x',              ...op(),         tone: 'soft' },
  { id: 'absx',  row: 4, col: 5, label: '|x|',   shiftLabel: 'angle',            ...op(),         tone: 'soft' },

  // Row 5 — trig + logs
  { id: 'sin',   row: 5, col: 1, label: 'sin',   shiftLabel: 'sin⁻¹',           ...op(),         tone: 'soft' },
  { id: 'cos',   row: 5, col: 2, label: 'cos',   shiftLabel: 'cos⁻¹',           ...op(),         tone: 'soft' },
  { id: 'tan',   row: 5, col: 3, label: 'tan',   shiftLabel: 'tan⁻¹',           ...op(),         tone: 'soft' },
  { id: 'log',   row: 5, col: 4, label: 'log',   shiftLabel: '10ˣ',              ...op(),         tone: 'soft' },
  { id: 'ln',    row: 5, col: 5, label: 'ln',    shiftLabel: 'eˣ',               ...op(),         tone: 'soft' },

  // Row 6 — parentheses + factorial + comma + EE
  { id: 'lparen', row: 6, col: 1, label: '(',    shiftLabel: 'matrix',           ...op('paren'), tone: 'soft' },
  { id: 'rparen', row: 6, col: 2, label: ')',    shiftLabel: 'vector',           ...op('paren'), tone: 'soft' },
  { id: 'fact',   row: 6, col: 3, label: 'x!',   shiftLabel: 'nCr',              ...op(),         tone: 'soft' },
  { id: 'comma',  row: 6, col: 4, label: ',',    shiftLabel: 'nPr',              ...op('comma'), tone: 'soft' },
  { id: 'ee',     row: 6, col: 5, label: 'EE',   shiftLabel: 'rand',             ...op(),         tone: 'soft' },

  // Numeric block — rows 7-9
  { id: 'n7',  row: 7, col: 1, label: '7', ...op('digit'),  tone: 'digit' },
  { id: 'n8',  row: 7, col: 2, label: '8', ...op('digit'),  tone: 'digit' },
  { id: 'n9',  row: 7, col: 3, label: '9', ...op('digit'),  tone: 'digit' },
  { id: 'mul', row: 7, col: 4, label: '×', ...op('binop'),  tone: 'op' },
  { id: 'div', row: 7, col: 5, label: '÷', ...op('binop'),  tone: 'op' },

  { id: 'n4',  row: 8, col: 1, label: '4', ...op('digit'),  tone: 'digit' },
  { id: 'n5',  row: 8, col: 2, label: '5', ...op('digit'),  tone: 'digit' },
  { id: 'n6',  row: 8, col: 3, label: '6', ...op('digit'),  tone: 'digit' },
  { id: 'add', row: 8, col: 4, label: '+', ...op('binop'),  tone: 'op' },
  { id: 'sub', row: 8, col: 5, label: '−', ...op('binop'),  tone: 'op' },

  { id: 'n1',   row: 9, col: 1, label: '1',    ...op('digit'), tone: 'digit' },
  { id: 'n2',   row: 9, col: 2, label: '2',    ...op('digit'), tone: 'digit' },
  { id: 'n3',   row: 9, col: 3, label: '3',    ...op('digit'), tone: 'digit' },
  { id: 'ans',  row: 9, col: 4, label: 'ans',  ...op('ans'),   tone: 'soft'  },
  { id: 'eq',   row: 9, col: 5, label: '=',    ...op('eval'),  tone: 'eval' },

  { id: 'n0',     row: 10, col: 1, label: '0',   ...op('digit'),    tone: 'digit', colSpan: 2 },
  { id: 'dot',    row: 10, col: 3, label: '.',   ...op('dot'),      tone: 'digit' },
  { id: 'negate', row: 10, col: 4, label: '(−)', ...op('negate'),   tone: 'digit' },
  { id: 'del',    row: 10, col: 5, label: 'del', ...op('delete'),   tone: 'soft'  },
];

export const TI_36X_PRO_GRID = { rows: 10, cols: 5 };
