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
  // Row 1 — modifier / mode. Photo-confirmed from a high-resolution
  // user-supplied TI-36X Pro shot (CALCULATOR_POLISH_2 audit).
  // The real device shows: 2nd | mode (quit) | delete (insert) | arrow
  // cluster | arrow cluster — i.e. the right two cells host the nav,
  // not `apps`/`clear`. Renamed `apps` → `delete` to match the
  // silkscreen; `clear` floats up to col 5 as a placeholder until the
  // numeric block restructuring puts it near `on` (deferred — bigger
  // slice). `math` shift label updated from `reset` to `d/dx□` per the
  // device (derivative function).
  { id: '2nd',   row: 1, col: 1, label: '2nd',                                    ...op('shift'),   tone: 'shift' },
  { id: 'mode',  row: 1, col: 2, label: 'mode',  shiftLabel: 'quit',              ...op('mode'),    tone: 'soft' },
  { id: 'math',  row: 1, col: 3, label: 'math',  shiftLabel: 'd/dx□',             ...op(),           tone: 'soft' },
  { id: 'del',   row: 1, col: 4, label: 'delete', shiftLabel: 'insert',           ...op('delete'),  tone: 'soft' },
  { id: 'clear', row: 1, col: 5, label: 'clear', shiftLabel: 'on/off',            ...op('clear'),   tone: 'soft' },

  // Row 2-4 — navigation cluster (real device has the 4-way arrow pad
  // with an empty center — no enter button there; equals/enter is at
  // the bottom-right of the numeric block). F-1 fidelity fix removed
  // the previously-shipped bogus center-enter key.
  { id: 'up',    row: 2, col: 3, label: '▲',     ...op('nav'),  tone: 'soft' },
  { id: 'left',  row: 3, col: 2, label: '◀',     ...op('nav'),  tone: 'soft' },
  { id: 'right', row: 3, col: 4, label: '▶',     ...op('nav'),  tone: 'soft' },
  { id: 'down',  row: 4, col: 3, label: '▼',     ...op('nav'),  tone: 'soft' },

  // Row 2/3 — quick functions surrounding the nav. F-1 fixes:
  // • `eepow` label was `eᵉ/10ˣ` — that's redundant with ln-key shifts.
  //   Replaced with `data` (the TI-36X Pro statistics-editor key) and a
  //   `stat-reg` shift, which is closer to the device. The key currently
  //   no-ops in the engine — placeholder for a future stats slice.
  // • `recip` had a meaningless `x` shift label; removed (the device's
  //   real shift here is the cube root which we already host on `xcube`).
  // • `pct` was labeled `%` as primary with `→DMS` as shift; on the real
  //   device the primary is `►DMS` (paired with `►HR` shift via 2nd).
  //   Swapped so the surveyor-useful primary surfaces.
  { id: 'pi',    row: 2, col: 1, label: 'π',     shiftLabel: 'e',                ...op(),         tone: 'soft' },
  { id: 'data',  row: 2, col: 2, label: 'data',  shiftLabel: 'stat-reg',         ...op(),         tone: 'soft' },
  { id: 'recip', row: 2, col: 4, label: 'x⁻¹',                                    ...op(),         tone: 'soft' },
  { id: 'sto',   row: 2, col: 5, label: 'sto→',  shiftLabel: 'mem',              ...op(),         tone: 'soft' },

  // Photo-confirmed: modern TI-36X Pro labels this `n/d` (natural fraction),
  // not the older `a b/c` (mixed-number). `F↔D` shift is correct.
  { id: 'frac',  row: 3, col: 1, label: 'n/d', shiftLabel: 'F↔D',                 ...op(),         tone: 'soft' },
  { id: 'pct',   row: 3, col: 5, label: '►DMS',  shiftLabel: '►HR',              ...op(),         tone: 'soft' },

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
  // F-1: TI-36X Pro labels this key `enter`, not `=`. Engine treats
  // both ids interchangeably (dispatch handles both `enter` and `eq`).
  { id: 'eq',   row: 9, col: 5, label: 'enter', ...op('eval'),  tone: 'eval' },

  // Bottom row. Real device has `0 | . | (−) | enter`-aligned-with-row-above
  // and `on` in the corner. Row 1's `delete` replaces the previously-shipped
  // bottom-right `del`; this row now hosts `ans` instead so the (−) and
  // numeric keys have the device's bottom-of-block layout.
  { id: 'n0',     row: 10, col: 1, label: '0',   ...op('digit'),    tone: 'digit', colSpan: 2 },
  { id: 'dot',    row: 10, col: 3, label: '.',   ...op('dot'),      tone: 'digit' },
  { id: 'negate', row: 10, col: 4, label: '(−)', ...op('negate'),   tone: 'digit' },
  { id: 'on',     row: 10, col: 5, label: 'on',  shiftLabel: 'off', ...op('clear'),  tone: 'soft' },
];

export const TI_36X_PRO_GRID = { rows: 10, cols: 5 };
