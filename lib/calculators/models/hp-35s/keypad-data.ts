// lib/calculators/models/hp-35s/keypad-data.ts
//
// HP 35s keypad layout. C-15 of EXAM_CALCULATORS.md.
//
// Real device is 7 cols × 9 rows. We render 6×11 with the most-used keys
// surfaced for FS/PS exam practice. The HP 35s has *two* shift modifiers
// (left-shift orange, right-shift blue) — the generic KeyDef only carries
// one `shiftLabel`, so each key's orange label goes there. Blue labels
// will land in C-16 alongside the engine state machine.

import type { KeyDef, KeyKind } from '@/lib/calculators/shared';

const op = (kind: KeyKind = 'op'): { kind: KeyKind } => ({ kind });

export const HP_35S_KEYPAD: KeyDef[] = [
  // Row 1 — top function row + modifiers (top-left orange shift, top-right blue)
  { id: 'fshift', row: 1, col: 1, label: '◀',   ...op('shift'), tone: 'shift' },         // left-shift (orange)
  { id: 'gshift', row: 1, col: 2, label: '▶',   ...op('shift'), tone: 'shift' },         // right-shift (blue)
  { id: 'on',     row: 1, col: 3, label: 'ON',  shiftLabel: 'OFF', ...op('clear'),  tone: 'soft' },
  { id: 'mode',   row: 1, col: 4, label: 'MODE', shiftLabel: 'SETUP', ...op('mode'),  tone: 'soft' },
  { id: 'rs',     row: 1, col: 5, label: 'R/S', ...op(),       tone: 'soft' },
  { id: 'enter',  row: 1, col: 6, label: 'ENTER', ...op('enter'), tone: 'accent' },

  // Row 2 — stack ops + clear
  { id: 'xchgy',  row: 2, col: 1, label: 'x↔y',   shiftLabel: 'LAST x',  ...op(), tone: 'soft' },
  { id: 'rdown',  row: 2, col: 2, label: 'R↓',    shiftLabel: 'R↑',      ...op(), tone: 'soft' },
  { id: 'chs',    row: 2, col: 3, label: '+/−',   ...op('negate'),       tone: 'soft' },
  { id: 'eex',    row: 2, col: 4, label: 'EEX',   ...op(),               tone: 'soft' },
  { id: 'del',    row: 2, col: 5, label: '←',     shiftLabel: 'CLEAR',   ...op('delete'), tone: 'soft' },
  { id: 'undo',   row: 2, col: 6, label: 'UNDO',  ...op(),               tone: 'soft' },

  // Row 3 — sin/cos/tan + inverses
  { id: 'sin',    row: 3, col: 1, label: 'sin',  shiftLabel: 'sin⁻¹',   ...op(), tone: 'soft' },
  { id: 'cos',    row: 3, col: 2, label: 'cos',  shiftLabel: 'cos⁻¹',   ...op(), tone: 'soft' },
  { id: 'tan',    row: 3, col: 3, label: 'tan',  shiftLabel: 'tan⁻¹',   ...op(), tone: 'soft' },
  { id: 'sqrt',   row: 3, col: 4, label: '√x',   shiftLabel: 'x²',      ...op(), tone: 'soft' },
  { id: 'ypowx',  row: 3, col: 5, label: 'yˣ',   shiftLabel: 'ˣ√y',     ...op(), tone: 'soft' },
  { id: 'pi',     row: 3, col: 6, label: 'π',    shiftLabel: 'e',       ...op(), tone: 'soft' },

  // Row 4 — log/ln/exp + storage
  { id: 'log',    row: 4, col: 1, label: 'log',  shiftLabel: '10ˣ',     ...op(), tone: 'soft' },
  { id: 'ln',     row: 4, col: 2, label: 'ln',   shiftLabel: 'eˣ',      ...op(), tone: 'soft' },
  { id: 'recip',  row: 4, col: 3, label: '1/x',  ...op(),               tone: 'soft' },
  { id: 'sto',    row: 4, col: 4, label: 'STO',  ...op(),               tone: 'soft' },
  { id: 'rcl',    row: 4, col: 5, label: 'RCL',  ...op(),               tone: 'soft' },
  { id: 'fact',   row: 4, col: 6, label: 'x!',   shiftLabel: 'nCr',     ...op(), tone: 'soft' },

  // Row 5 — display modes + RAD/DEG
  { id: 'fix',    row: 5, col: 1, label: 'FIX',  ...op(),               tone: 'soft' },
  { id: 'sci',    row: 5, col: 2, label: 'SCI',  ...op(),               tone: 'soft' },
  { id: 'eng',    row: 5, col: 3, label: 'ENG',  ...op(),               tone: 'soft' },
  { id: 'all',    row: 5, col: 4, label: 'ALL',  ...op(),               tone: 'soft' },
  { id: 'rad',    row: 5, col: 5, label: '►RAD', shiftLabel: '►DEG',    ...op(), tone: 'soft' },
  { id: 'dms',    row: 5, col: 6, label: '►H.MS', shiftLabel: '►HR',    ...op(), tone: 'soft' },

  // Row 6 — power / abs / parens
  { id: 'absx',   row: 6, col: 1, label: '|x|',  ...op(),               tone: 'soft' },
  { id: 'lparen', row: 6, col: 2, label: '(',    ...op('paren'),        tone: 'soft' },
  { id: 'rparen', row: 6, col: 3, label: ')',    ...op('paren'),        tone: 'soft' },
  { id: 'mod',    row: 6, col: 4, label: 'MOD',  ...op(),               tone: 'soft' },
  { id: 'mul',    row: 7, col: 5, label: '×',    ...op('binop'),        tone: 'op' },
  { id: 'div',    row: 7, col: 6, label: '÷',    ...op('binop'),        tone: 'op' },

  // Row 7 — top of numeric block
  { id: 'n7',     row: 7, col: 1, label: '7',    ...op('digit'),        tone: 'digit' },
  { id: 'n8',     row: 7, col: 2, label: '8',    ...op('digit'),        tone: 'digit' },
  { id: 'n9',     row: 7, col: 3, label: '9',    ...op('digit'),        tone: 'digit' },
  { id: 'space',  row: 7, col: 4, label: ' ',    ...op(),               tone: 'soft' },

  // Row 8 — middle of numeric block
  { id: 'n4',     row: 8, col: 1, label: '4',    ...op('digit'),        tone: 'digit' },
  { id: 'n5',     row: 8, col: 2, label: '5',    ...op('digit'),        tone: 'digit' },
  { id: 'n6',     row: 8, col: 3, label: '6',    ...op('digit'),        tone: 'digit' },
  { id: 'pct',    row: 8, col: 4, label: '%',    ...op(),               tone: 'soft' },
  { id: 'sub',    row: 8, col: 5, label: '−',    ...op('binop'),        tone: 'op' },
  { id: 'add',    row: 8, col: 6, label: '+',    ...op('binop'),        tone: 'op' },

  // Row 9 — bottom of numeric block + ans
  { id: 'n1',     row: 9, col: 1, label: '1',    ...op('digit'),        tone: 'digit' },
  { id: 'n2',     row: 9, col: 2, label: '2',    ...op('digit'),        tone: 'digit' },
  { id: 'n3',     row: 9, col: 3, label: '3',    ...op('digit'),        tone: 'digit' },
  { id: 'lastx',  row: 9, col: 4, label: 'LASTx', ...op(),              tone: 'soft' },

  // Row 10 — zero / decimal / change-sign
  { id: 'n0',     row: 10, col: 1, label: '0',   ...op('digit'),        tone: 'digit' },
  { id: 'dot',    row: 10, col: 2, label: '.',   ...op('dot'),          tone: 'digit' },
  { id: 'comma',  row: 10, col: 3, label: ',',   ...op('comma'),        tone: 'soft' },
  { id: 'eq',     row: 10, col: 4, label: '=',   ...op('eval'),         tone: 'eval', colSpan: 3 },
];

export const HP_35S_GRID = { rows: 10, cols: 6 };
