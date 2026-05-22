// lib/calculators/models/hp-35s/keypad-data.ts
//
// HP 35s keypad layout. **Restructured from a high-resolution user-
// supplied device photo** during CALCULATOR_POLISH_2 P-6.
//
// Major structural change vs the previously-shipped layout:
//   • The two shift modifiers ◀f (yellow) and ▶g (blue) are NOT at
//     the top row — they're in the LEFT COLUMN between digit rows,
//     adjacent to the numeric block per the real device.
//   • Top of keypad is the small function-key row (R/S | GTO | XEQ
//     | MODE | DISPLAY/↑ | CONST/MEM/↓), not modifiers.
//   • ENTER is a WIDE key (spans 2 cols) in the middle row right
//     under the trig keys — NOT at the bottom.
//   • SIN/COS/TAN row sits high in the keypad, not in the middle.
//   • The tiny `a b/c` fraction key is isolated at the very bottom-
//     left corner.
//
// Engine handlers in models/hp-35s/engine.ts dispatch on `keyId`
// strings (fshift, gshift, enter, n0..n9, sin/cos/tan, etc.) — those
// IDs are preserved so existing tests keep passing.

import type { KeyDef, KeyKind } from '@/lib/calculators/shared';

const op = (kind: KeyKind = 'op'): { kind: KeyKind } => ({ kind });

export const HP_35S_KEYPAD: KeyDef[] = [
  // ── Row 1 — top function row (small slabs) ─────────────────────────────
  { id: 'rs',     row: 1, col: 1, label: 'R/S',  shiftLabel: 'PRGM',           ...op(),         tone: 'soft' },
  { id: 'gto',    row: 1, col: 2, label: 'GTO',  shiftLabel: 'ISG',            ...op(),         tone: 'soft' },
  { id: 'xeq',    row: 1, col: 3, label: 'XEQ',  shiftLabel: 'LBL',            ...op(),         tone: 'soft' },
  { id: 'mode',   row: 1, col: 4, label: 'MODE', shiftLabel: 'x?y',            ...op('mode'),   tone: 'soft' },
  { id: 'up',     row: 1, col: 5, label: '▲',                                   ...op('nav'),    tone: 'accent' },
  { id: 'const',  row: 1, col: 6, label: 'CONST', shiftLabel: 'FLAGS',         ...op(),         tone: 'soft' },

  // ── Row 2 — second function row + arrow ────────────────────────────────
  { id: 'rcl',    row: 2, col: 1, label: 'RCL',  shiftLabel: 'x²',             ...op(),         tone: 'soft' },
  { id: 'rdown',  row: 2, col: 2, label: 'R↓',   shiftLabel: 'R↑',             ...op(),         tone: 'soft' },
  { id: 'xchgy',  row: 2, col: 3, label: 'x↔y',  shiftLabel: 'LAST x',         ...op(),         tone: 'soft' },
  { id: 'arg',    row: 2, col: 4, label: '+/−',  shiftLabel: 'ARG',            ...op('negate'), tone: 'soft' },
  { id: 'down',   row: 2, col: 5, label: '▼',                                   ...op('nav'),    tone: 'accent' },
  { id: 'mem',    row: 2, col: 6, label: 'MEM',  shiftLabel: 'i',              ...op(),         tone: 'soft' },

  // ── Row 3 — trig + log/ln ──────────────────────────────────────────────
  { id: 'sin',    row: 3, col: 1, label: 'SIN',  shiftLabel: 'ASIN',           ...op(), tone: 'soft' },
  { id: 'cos',    row: 3, col: 2, label: 'COS',  shiftLabel: 'ACOS',           ...op(), tone: 'soft' },
  { id: 'tan',    row: 3, col: 3, label: 'TAN',  shiftLabel: 'ATAN',           ...op(), tone: 'soft' },
  { id: 'sqrt',   row: 3, col: 4, label: '√x',   shiftLabel: 'x²',             ...op(), tone: 'soft' },
  { id: 'ypowx',  row: 3, col: 5, label: 'yˣ',   shiftLabel: 'ˣ√y',            ...op(), tone: 'soft' },
  { id: 'recip',  row: 3, col: 6, label: '1/x',  shiftLabel: 'LOG',            ...op(), tone: 'soft' },

  // ── Row 4 — log/ln + ENTER (spans 2 cols) ──────────────────────────────
  { id: 'log',    row: 4, col: 1, label: 'log',  shiftLabel: '10ˣ',            ...op(), tone: 'soft' },
  { id: 'ln',     row: 4, col: 2, label: 'ln',   shiftLabel: 'eˣ',             ...op(), tone: 'soft' },
  { id: 'enter',  row: 4, col: 3, label: 'ENTER', shiftLabel: 'EQN',           ...op('enter'), tone: 'accent', colSpan: 2 },
  { id: 'eex',    row: 4, col: 5, label: 'E',    shiftLabel: 'ENG',            ...op(), tone: 'soft' },
  { id: 'undo',   row: 4, col: 6, label: '←',    shiftLabel: 'CLEAR',          ...op('delete'), tone: 'soft' },

  // ── Row 5 — EQN row (just an extra function row) ───────────────────────
  { id: 'eqn',    row: 5, col: 1, label: 'EQN',  shiftLabel: 'SOLVE',          ...op(), tone: 'soft' },
  { id: 'pi',     row: 5, col: 2, label: 'π',    shiftLabel: 'e',              ...op(), tone: 'soft' },
  { id: 'fact',   row: 5, col: 3, label: 'x!',   shiftLabel: 'nCr',            ...op(), tone: 'soft' },
  { id: 'absx',   row: 5, col: 4, label: '|x|',  ...op(),                       tone: 'soft' },
  { id: 'mod',    row: 5, col: 5, label: 'MOD',                                 ...op(),         tone: 'soft' },
  { id: 'pct',    row: 5, col: 6, label: '%',                                   ...op(),         tone: 'soft' },

  // ── Row 6 — numeric block top: digits 7-9 + ÷, with operator column ──
  // F-shift (yellow ◀) sits in col 1 — the device's hallmark layout.
  { id: 'fshift', row: 6, col: 1, label: '◀f',                                  ...op('shift'),  tone: 'shift' },
  { id: 'n7',     row: 6, col: 2, label: '7',                                    ...op('digit'),  tone: 'digit' },
  { id: 'n8',     row: 6, col: 3, label: '8',                                    ...op('digit'),  tone: 'digit' },
  { id: 'n9',     row: 6, col: 4, label: '9',                                    ...op('digit'),  tone: 'digit' },
  { id: 'dms',    row: 6, col: 5, label: '►H.MS', shiftLabel: '►HMS',            ...op(),         tone: 'soft' },
  { id: 'div',    row: 6, col: 6, label: '÷',                                    ...op('binop'),  tone: 'op' },

  // ── Row 7 — digits 4-6, × on right.  Blue ▶g in col 1 ──────────────────
  { id: 'gshift', row: 7, col: 1, label: '▶g',                                  ...op('shift'),  tone: 'shift' },
  { id: 'n4',     row: 7, col: 2, label: '4',                                    ...op('digit'),  tone: 'digit' },
  { id: 'n5',     row: 7, col: 3, label: '5',                                    ...op('digit'),  tone: 'digit' },
  { id: 'n6',     row: 7, col: 4, label: '6',                                    ...op('digit'),  tone: 'digit' },
  { id: 'rad',    row: 7, col: 5, label: '►RAD', shiftLabel: '►DEG',            ...op(),         tone: 'soft' },
  { id: 'mul',    row: 7, col: 6, label: '×',                                    ...op('binop'),  tone: 'op' },

  // ── Row 8 — digits 1-3, − on right. LASTx in col 1 ─────────────────────
  { id: 'lastx',  row: 8, col: 1, label: 'LASTx',                                ...op(),         tone: 'soft' },
  { id: 'n1',     row: 8, col: 2, label: '1',                                    ...op('digit'),  tone: 'digit' },
  { id: 'n2',     row: 8, col: 3, label: '2',                                    ...op('digit'),  tone: 'digit' },
  { id: 'n3',     row: 8, col: 4, label: '3',                                    ...op('digit'),  tone: 'digit' },
  { id: 'chs',    row: 8, col: 5, label: '+/−',                                  ...op('negate'), tone: 'soft' },
  { id: 'sub',    row: 8, col: 6, label: '−',                                    ...op('binop'),  tone: 'op' },

  // ── Row 9 — bottom row: C/ON | 0 . Σ | + ───────────────────────────────
  { id: 'on',     row: 9, col: 1, label: 'C',    shiftLabel: 'ON',              ...op('clear'),  tone: 'soft' },
  { id: 'n0',     row: 9, col: 2, label: '0',                                    ...op('digit'),  tone: 'digit' },
  { id: 'dot',    row: 9, col: 3, label: '.',                                    ...op('dot'),    tone: 'digit' },
  { id: 'sigma',  row: 9, col: 4, label: 'Σ+',                                   ...op(),         tone: 'soft' },
  { id: 'left',   row: 9, col: 5, label: '◀',                                    ...op('nav'),    tone: 'accent' },
  { id: 'add',    row: 9, col: 6, label: '+',                                    ...op('binop'),  tone: 'op' },

  // ── Row 10 — tiny isolated `a b/c` at the bottom-left corner ──────────
  { id: 'frac',   row: 10, col: 1, label: 'a b/c',                               ...op(),         tone: 'soft' },
  { id: 'comma',  row: 10, col: 2, label: ',',                                   ...op('comma'),  tone: 'soft' },
  { id: 'right',  row: 10, col: 5, label: '▶',                                   ...op('nav'),    tone: 'accent' },
];

export const HP_35S_GRID = { rows: 10, cols: 6 };
