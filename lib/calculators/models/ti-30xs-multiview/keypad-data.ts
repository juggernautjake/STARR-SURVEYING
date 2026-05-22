// lib/calculators/models/ti-30xs-multiview/keypad-data.ts
//
// TI-30XS MultiView keypad layout. F-5 of CALCULATOR_FIDELITY.md.
//
// Split off from the TI-36X Pro keypad reuse so the MultiView can drift
// to match its own device silkscreen. Engine is still the shared
// algebraic engine in `models/ti-36x-pro/engine.ts` — the dispatch
// table cares about `keyId` strings, not which file they came from.
//
// MultiView vs Pro key-set differences (per the real device):
//   • No `math` menu key on MultiView; that slot hosts `prb` instead.
//   • No matrix / vector menu under SHIFT — MultiView is purely scalar.
//   • Dedicated `n/d` (natural-fraction) and `Un/d` (mixed-number) keys
//     more prominent than on Pro.
//   • `→%` percent function on the EE key's shift slot (replaces Pro's
//     `rand`).
//   • Statistics is the simpler `stat` editor (no two-variable rich
//     output that the Pro has).
//   • The `data` key is renamed `stat` on MultiView.

import type { KeyDef, KeyKind } from '@/lib/calculators/shared';

const op = (kind: KeyKind = 'op'): { kind: KeyKind } => ({ kind });

export const TI_30XS_MULTIVIEW_KEYPAD: KeyDef[] = [
  // Row 1 — modifier + mode + clear
  { id: '2nd',   row: 1, col: 1, label: '2nd',                                  ...op('shift'), tone: 'shift' },
  { id: 'mode',  row: 1, col: 2, label: 'mode',  shiftLabel: 'quit',            ...op('mode'),  tone: 'soft' },
  { id: 'prb',   row: 1, col: 3, label: 'prb',   shiftLabel: 'rand',            ...op(),         tone: 'soft' },
  { id: 'stat',  row: 1, col: 4, label: 'stat',  shiftLabel: 'stat-reg',        ...op(),         tone: 'soft' },
  { id: 'clear', row: 1, col: 5, label: 'clear', shiftLabel: 'on/off',          ...op('clear'),  tone: 'soft' },

  // Row 2 — 4-way nav cluster (centered) + π / x⁻¹ / sto
  { id: 'up',    row: 2, col: 3, label: '▲',                                    ...op('nav'),    tone: 'soft' },
  { id: 'pi',    row: 2, col: 1, label: 'π',     shiftLabel: 'e',               ...op(),         tone: 'soft' },
  { id: 'recip', row: 2, col: 2, label: 'x⁻¹',                                  ...op(),         tone: 'soft' },
  { id: 'recall',row: 2, col: 4, label: 'recall', shiftLabel: 'reset',          ...op(),         tone: 'soft' },
  { id: 'sto',   row: 2, col: 5, label: 'sto→',  shiftLabel: 'mem',             ...op(),         tone: 'soft' },

  { id: 'left',  row: 3, col: 2, label: '◀',                                    ...op('nav'),    tone: 'soft' },
  { id: 'right', row: 3, col: 4, label: '▶',                                    ...op('nav'),    tone: 'soft' },
  { id: 'down',  row: 4, col: 3, label: '▼',                                    ...op('nav'),    tone: 'soft' },

  // Row 3 — fractions: MultiView's headline feature
  { id: 'frac',  row: 3, col: 1, label: 'n/d',   shiftLabel: 'F↔D',             ...op(),         tone: 'soft' },
  { id: 'mixed', row: 3, col: 5, label: 'Un/d',                                 ...op(),         tone: 'soft' },

  // Row 4 — power / root / ►DMS
  { id: 'xsq',   row: 4, col: 1, label: 'x²',    shiftLabel: '√',               ...op(),         tone: 'soft' },
  { id: 'xcube', row: 4, col: 2, label: 'x³',    shiftLabel: '³√',              ...op(),         tone: 'soft' },
  { id: 'pow',   row: 4, col: 4, label: 'xʸ',    shiftLabel: 'ʸ√x',             ...op(),         tone: 'soft' },
  { id: 'pct',   row: 4, col: 5, label: '►DMS',  shiftLabel: '►HR',             ...op(),         tone: 'soft' },

  // Row 5 — trig + logs
  { id: 'sin',   row: 5, col: 1, label: 'sin',   shiftLabel: 'sin⁻¹',           ...op(),         tone: 'soft' },
  { id: 'cos',   row: 5, col: 2, label: 'cos',   shiftLabel: 'cos⁻¹',           ...op(),         tone: 'soft' },
  { id: 'tan',   row: 5, col: 3, label: 'tan',   shiftLabel: 'tan⁻¹',           ...op(),         tone: 'soft' },
  { id: 'log',   row: 5, col: 4, label: 'log',   shiftLabel: '10ˣ',             ...op(),         tone: 'soft' },
  { id: 'ln',    row: 5, col: 5, label: 'ln',    shiftLabel: 'eˣ',              ...op(),         tone: 'soft' },

  // Row 6 — parens / factorial / comma / EE.  F-5 fidelity: MultiView's
  // EE shift is `→%` (percent conversion), not `rand` which lives on
  // the `prb` key in row 1.
  { id: 'lparen', row: 6, col: 1, label: '(',                                   ...op('paren'),  tone: 'soft' },
  { id: 'rparen', row: 6, col: 2, label: ')',                                   ...op('paren'),  tone: 'soft' },
  { id: 'fact',   row: 6, col: 3, label: 'x!',   shiftLabel: 'nCr',             ...op(),         tone: 'soft' },
  { id: 'comma',  row: 6, col: 4, label: ',',    shiftLabel: 'nPr',             ...op('comma'),  tone: 'soft' },
  { id: 'ee',     row: 6, col: 5, label: 'EE',   shiftLabel: '→%',              ...op(),         tone: 'soft' },

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

  { id: 'n1',   row: 9, col: 1, label: '1',     ...op('digit'), tone: 'digit' },
  { id: 'n2',   row: 9, col: 2, label: '2',     ...op('digit'), tone: 'digit' },
  { id: 'n3',   row: 9, col: 3, label: '3',     ...op('digit'), tone: 'digit' },
  { id: 'ans',  row: 9, col: 4, label: 'ans',   ...op('ans'),   tone: 'soft'  },
  { id: 'eq',   row: 9, col: 5, label: 'enter', ...op('eval'),  tone: 'eval' },

  { id: 'n0',     row: 10, col: 1, label: '0',   ...op('digit'),    tone: 'digit', colSpan: 2 },
  { id: 'dot',    row: 10, col: 3, label: '.',   ...op('dot'),      tone: 'digit' },
  { id: 'negate', row: 10, col: 4, label: '(−)', ...op('negate'),   tone: 'digit' },
  { id: 'del',    row: 10, col: 5, label: 'del', ...op('delete'),   tone: 'soft'  },
];

export const TI_30XS_MULTIVIEW_GRID = { rows: 10, cols: 5 };
