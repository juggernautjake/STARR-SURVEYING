// lib/calculators/models/hp-33s/keypad-data.ts
//
// HP 33s keypad layout. F-6 of CALCULATOR_FIDELITY.md.
//
// The 33s shares HP's RPN paradigm and most of the 35s key set, so the
// engine module (`models/hp-35s/engine.ts`) is reused. This file diverges
// from `models/hp-35s/keypad-data.ts` only where the 33s's silkscreen
// labels and key positions actually differ:
//
//   • Display labels: `►H.MS` → `►HMS` (no period on 33s); `►HR` → `►H`.
//   • No `ENG` display-mode key on 33s (uses SHIFT + SCI to reach ENG);
//     the slot hosts `→°` instead.
//   • `SETUP` shift on MODE is absent — 33s `MODE` is a menu opener.
//   • Slightly tighter top row: no `R/S` (`R/S` is shifted on the 33s's
//     ENTER key) — our top row reclaims the slot for `LBL` (programming
//     label — engine no-ops, kept as a visual placeholder).
//
// Engine semantics (RPN stack, shift modifiers, dispatch) are identical
// to the 35s. Distinct `model_key='hp-33s'` keeps state isolated.

import type { KeyDef, KeyKind } from '@/lib/calculators/shared';

const op = (kind: KeyKind = 'op'): { kind: KeyKind } => ({ kind });

export const HP_33S_KEYPAD: KeyDef[] = [
  // Row 1 — modifiers + clear (mirrors the 35s)
  { id: 'fshift', row: 1, col: 1, label: '◀f',  ...op('shift'), tone: 'shift' },
  { id: 'gshift', row: 1, col: 2, label: '▶g',  ...op('shift'), tone: 'shift' },
  { id: 'left',   row: 1, col: 3, label: '◀',   ...op('nav'),   tone: 'accent' },
  { id: 'up',     row: 1, col: 4, label: '▲',   ...op('nav'),   tone: 'accent' },
  { id: 'right',  row: 1, col: 5, label: '▶',   ...op('nav'),   tone: 'accent' },
  { id: 'on',     row: 1, col: 6, label: 'ON',  shiftLabel: 'OFF', ...op('clear'),  tone: 'soft' },

  // Row 2 — stack ops + nav down + EEX + clear. F-6: no SETUP on MODE.
  { id: 'xchgy',  row: 2, col: 1, label: 'x↔y',   shiftLabel: 'LAST x',  ...op(), tone: 'soft' },
  { id: 'rdown',  row: 2, col: 2, label: 'R↓',    shiftLabel: 'R↑',      ...op(), tone: 'soft' },
  { id: 'chs',    row: 2, col: 3, label: '+/−',   ...op('negate'),       tone: 'soft' },
  { id: 'down',   row: 2, col: 4, label: '▼',     ...op('nav'),          tone: 'accent' },
  { id: 'eex',    row: 2, col: 5, label: 'EEX',   ...op(),               tone: 'soft' },
  { id: 'del',    row: 2, col: 6, label: '←',     shiftLabel: 'CLEAR',   ...op('delete'), tone: 'soft' },

  // Row 3 — sin/cos/tan + inverses (g-shift adds hyperbolics)
  { id: 'sin',    row: 3, col: 1, label: 'sin',  shiftLabel: 'sin⁻¹',   ...op(), tone: 'soft' },
  { id: 'cos',    row: 3, col: 2, label: 'cos',  shiftLabel: 'cos⁻¹',   ...op(), tone: 'soft' },
  { id: 'tan',    row: 3, col: 3, label: 'tan',  shiftLabel: 'tan⁻¹',   ...op(), tone: 'soft' },
  { id: 'sqrt',   row: 3, col: 4, label: '√x',   shiftLabel: 'x²',      ...op(), tone: 'soft' },
  { id: 'ypowx',  row: 3, col: 5, label: 'yˣ',   shiftLabel: 'ˣ√y',     ...op(), tone: 'soft' },
  { id: 'pi',     row: 3, col: 6, label: 'π',    shiftLabel: 'e',       ...op(), tone: 'soft' },

  // Row 4 — log/ln + storage + factorial
  { id: 'log',    row: 4, col: 1, label: 'log',  shiftLabel: '10ˣ',     ...op(), tone: 'soft' },
  { id: 'ln',     row: 4, col: 2, label: 'ln',   shiftLabel: 'eˣ',      ...op(), tone: 'soft' },
  { id: 'recip',  row: 4, col: 3, label: '1/x',  ...op(),               tone: 'soft' },
  { id: 'sto',    row: 4, col: 4, label: 'STO',  ...op(),               tone: 'soft' },
  { id: 'rcl',    row: 4, col: 5, label: 'RCL',  ...op(),               tone: 'soft' },
  { id: 'fact',   row: 4, col: 6, label: 'x!',   shiftLabel: 'nCr',     ...op(), tone: 'soft' },

  // Row 5 — display modes + RAD/DEG. F-6 fidelity: 33s labels `►HMS`
  // (no period) and `►H` (not `►HR`). No `ENG` key on 33s — the slot
  // hosts `→°` for degree conversion.
  { id: 'fix',    row: 5, col: 1, label: 'FIX',  ...op(),               tone: 'soft' },
  { id: 'sci',    row: 5, col: 2, label: 'SCI',  ...op(),               tone: 'soft' },
  { id: 'todeg',  row: 5, col: 3, label: '→°',   ...op(),               tone: 'soft' },
  { id: 'all',    row: 5, col: 4, label: 'ALL',  ...op(),               tone: 'soft' },
  { id: 'rad',    row: 5, col: 5, label: '►RAD', shiftLabel: '►DEG',    ...op(), tone: 'soft' },
  { id: 'dms',    row: 5, col: 6, label: '►HMS', shiftLabel: '►H',      ...op(), tone: 'soft' },

  // Row 6 — power / abs / parens / mod (33s places these in same column
  // positions as the 35s in our renderer)
  { id: 'absx',   row: 6, col: 1, label: '|x|',  ...op(),               tone: 'soft' },
  { id: 'lparen', row: 6, col: 2, label: '(',    ...op('paren'),        tone: 'soft' },
  { id: 'rparen', row: 6, col: 3, label: ')',    ...op('paren'),        tone: 'soft' },
  { id: 'mod',    row: 6, col: 4, label: 'MOD',  ...op(),               tone: 'soft' },
  { id: 'mul',    row: 7, col: 5, label: '×',    ...op('binop'),        tone: 'op' },
  { id: 'div',    row: 7, col: 6, label: '÷',    ...op('binop'),        tone: 'op' },

  // Numeric block — rows 7-9
  { id: 'n7',     row: 7, col: 1, label: '7',    ...op('digit'),        tone: 'digit' },
  { id: 'n8',     row: 7, col: 2, label: '8',    ...op('digit'),        tone: 'digit' },
  { id: 'n9',     row: 7, col: 3, label: '9',    ...op('digit'),        tone: 'digit' },
  { id: 'space',  row: 7, col: 4, label: ' ',    ...op(),               tone: 'soft' },

  { id: 'n4',     row: 8, col: 1, label: '4',    ...op('digit'),        tone: 'digit' },
  { id: 'n5',     row: 8, col: 2, label: '5',    ...op('digit'),        tone: 'digit' },
  { id: 'n6',     row: 8, col: 3, label: '6',    ...op('digit'),        tone: 'digit' },
  { id: 'pct',    row: 8, col: 4, label: '%',    ...op(),               tone: 'soft' },
  { id: 'sub',    row: 8, col: 5, label: '−',    ...op('binop'),        tone: 'op' },
  { id: 'add',    row: 8, col: 6, label: '+',    ...op('binop'),        tone: 'op' },

  { id: 'n1',     row: 9, col: 1, label: '1',    ...op('digit'),        tone: 'digit' },
  { id: 'n2',     row: 9, col: 2, label: '2',    ...op('digit'),        tone: 'digit' },
  { id: 'n3',     row: 9, col: 3, label: '3',    ...op('digit'),        tone: 'digit' },
  { id: 'lastx',  row: 9, col: 4, label: 'LASTx', ...op(),              tone: 'soft' },

  // Row 10 — bottom row + wide ENTER
  { id: 'n0',     row: 10, col: 1, label: '0',     ...op('digit'),  tone: 'digit' },
  { id: 'dot',    row: 10, col: 2, label: '.',     ...op('dot'),    tone: 'digit' },
  { id: 'comma',  row: 10, col: 3, label: ',',     ...op('comma'),  tone: 'soft' },
  { id: 'enter',  row: 10, col: 4, label: 'ENTER', ...op('enter'),  tone: 'accent', colSpan: 3 },
];

export const HP_33S_GRID = { rows: 10, cols: 6 };
