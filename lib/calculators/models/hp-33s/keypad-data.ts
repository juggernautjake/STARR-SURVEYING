// lib/calculators/models/hp-33s/keypad-data.ts
//
// HP 33s keypad layout. **Restructured from a high-resolution user-
// supplied device photo** during CALCULATOR_POLISH_2 P-7.
//
// The 33s has the signature V-shaped chevron physical layout. We
// render rectangular cells in a 5×10 grid that captures the device's
// logical key clusters. Like the HP 35s sibling (P-6 restructure),
// the f-shift (◀, yellow) and g-shift (▶, blue) modifiers live in
// the LEFT COLUMN between digit rows — not at the top.
//
// Engine: shared HP 35s RPN engine. KeyIds preserved.

import type { KeyDef, KeyKind } from '@/lib/calculators/shared';

const op = (kind: KeyKind = 'op'): { kind: KeyKind } => ({ kind });

export const HP_33S_KEYPAD: KeyDef[] = [
  // ── Row 1 — top 4 large slabs: ENG | SOLVE | MODES | DISPLAY ──────────
  // The 33s has these as the four widest keys at the top.  Each spans
  // ~1.25 cells visually; we render them as single cells across cols 1-4.
  { id: 'eng',    row: 1, col: 1, label: 'ENG',  shiftLabel: '←ENG',           ...op(),         tone: 'soft' },
  { id: 'solve',  row: 1, col: 2, label: 'SOLVE',                              ...op(),         tone: 'soft' },
  { id: 'mode',   row: 1, col: 3, label: 'MODES',                              ...op('mode'),   tone: 'soft' },
  { id: 'disp',   row: 1, col: 4, label: 'DISPLAY', shiftLabel: 'CONST',       ...op(),         tone: 'soft' },
  { id: 'up',     row: 1, col: 5, label: '▲',                                   ...op('nav'),    tone: 'accent' },

  // ── Row 2 — eˣ / LN / yˣ / 1/x / Σ+ ───────────────────────────────────
  { id: 'eexp',   row: 2, col: 1, label: 'eˣ',   shiftLabel: '10ˣ',            ...op(),         tone: 'soft' },
  { id: 'ln',     row: 2, col: 2, label: 'LN',   shiftLabel: 'LOG',            ...op(),         tone: 'soft' },
  { id: 'ypowx',  row: 2, col: 3, label: 'yˣ',   shiftLabel: 'ABS',            ...op(),         tone: 'soft' },
  { id: 'recip',  row: 2, col: 4, label: '1/x',  shiftLabel: 'x!',             ...op(),         tone: 'soft' },
  { id: 'sigma',  row: 2, col: 5, label: 'Σ+',   shiftLabel: 'Σ−',             ...op(),         tone: 'soft' },

  // ── Row 3 — R↓ / x² / √x / xʸ√y / % ──────────────────────────────────
  { id: 'rdown',  row: 3, col: 1, label: 'R↓',   shiftLabel: 'HYP',            ...op(),         tone: 'soft' },
  { id: 'xsq',    row: 3, col: 2, label: 'x²',   shiftLabel: 'x³',             ...op(),         tone: 'soft' },
  { id: 'sqrt',   row: 3, col: 3, label: '√x',   shiftLabel: 'ⁿ√x',            ...op(),         tone: 'soft' },
  { id: 'xrooty', row: 3, col: 4, label: 'xʸ√y', shiftLabel: 'RPN',            ...op(),         tone: 'soft' },
  { id: 'pct',    row: 3, col: 5, label: '%',    shiftLabel: 'INT÷',           ...op(),         tone: 'soft' },

  // ── Row 4 — STO / RCL / SIN / COS / TAN ──────────────────────────────
  { id: 'sto',    row: 4, col: 1, label: 'STO',  shiftLabel: 'CMPLX',          ...op(),         tone: 'soft' },
  { id: 'rcl',    row: 4, col: 2, label: 'RCL',  shiftLabel: 'RND',            ...op(),         tone: 'soft' },
  { id: 'sin',    row: 4, col: 3, label: 'SIN',  shiftLabel: 'ASIN',           ...op(),         tone: 'soft' },
  { id: 'cos',    row: 4, col: 4, label: 'COS',  shiftLabel: 'ACOS',           ...op(),         tone: 'soft' },
  { id: 'tan',    row: 4, col: 5, label: 'TAN',  shiftLabel: 'ATAN',           ...op(),         tone: 'soft' },

  // ── Row 5 — XEQ / x↔y / +/− / E / ← (delete) ─────────────────────────
  { id: 'xeq',    row: 5, col: 1, label: 'XEQ',  shiftLabel: 'GTO',            ...op(),         tone: 'soft' },
  { id: 'xchgy',  row: 5, col: 2, label: 'x↔y',  shiftLabel: 'MEM',            ...op(),         tone: 'soft' },
  { id: 'chs',    row: 5, col: 3, label: '+/−',  shiftLabel: 'nCr',            ...op('negate'), tone: 'soft' },
  { id: 'eex',    row: 5, col: 4, label: 'E',    shiftLabel: 'nPr',            ...op(),         tone: 'soft' },
  { id: 'del',    row: 5, col: 5, label: '←',    shiftLabel: 'CLEAR',          ...op('delete'), tone: 'soft' },

  // ── Row 6 — R/S | 7 | 8 | 9 | ÷ ──────────────────────────────────────
  { id: 'rs',     row: 6, col: 1, label: 'R/S',  shiftLabel: 'PRGM',           ...op(),         tone: 'soft' },
  { id: 'n7',     row: 6, col: 2, label: '7',                                    ...op('digit'),  tone: 'digit' },
  { id: 'n8',     row: 6, col: 3, label: '8',                                    ...op('digit'),  tone: 'digit' },
  { id: 'n9',     row: 6, col: 4, label: '9',                                    ...op('digit'),  tone: 'digit' },
  { id: 'div',    row: 6, col: 5, label: '÷',                                    ...op('binop'),  tone: 'op' },

  // ── Row 7 — fshift (yellow ◀) in col 1 | 4 | 5 | 6 | × ───────────────
  { id: 'fshift', row: 7, col: 1, label: '◀f',                                  ...op('shift'),  tone: 'shift' },
  { id: 'n4',     row: 7, col: 2, label: '4',                                    ...op('digit'),  tone: 'digit' },
  { id: 'n5',     row: 7, col: 3, label: '5',                                    ...op('digit'),  tone: 'digit' },
  { id: 'n6',     row: 7, col: 4, label: '6',                                    ...op('digit'),  tone: 'digit' },
  { id: 'mul',    row: 7, col: 5, label: '×',                                    ...op('binop'),  tone: 'op' },

  // ── Row 8 — gshift (blue ▶) in col 1 | 1 | 2 | 3 | − ─────────────────
  { id: 'gshift', row: 8, col: 1, label: '▶g',                                  ...op('shift'),  tone: 'shift' },
  { id: 'n1',     row: 8, col: 2, label: '1',                                    ...op('digit'),  tone: 'digit' },
  { id: 'n2',     row: 8, col: 3, label: '2',                                    ...op('digit'),  tone: 'digit' },
  { id: 'n3',     row: 8, col: 4, label: '3',                                    ...op('digit'),  tone: 'digit' },
  { id: 'sub',    row: 8, col: 5, label: '−',                                    ...op('binop'),  tone: 'op' },

  // ── Row 9 — C/ON | 0 | . | ENTER (spans 2 cols) ──────────────────────
  { id: 'on',     row: 9, col: 1, label: 'C',    shiftLabel: 'ON',              ...op('clear'),  tone: 'soft' },
  { id: 'n0',     row: 9, col: 2, label: '0',                                    ...op('digit'),  tone: 'digit' },
  { id: 'dot',    row: 9, col: 3, label: '.',                                    ...op('dot'),    tone: 'digit' },
  { id: 'enter',  row: 9, col: 4, label: 'ENTER',                                ...op('enter'),  tone: 'accent', colSpan: 2 },

  // ── Row 10 — bottom-left isolated a b/c key ──────────────────────────
  { id: 'frac',   row: 10, col: 1, label: 'a b/c',                               ...op(),         tone: 'soft' },
  { id: 'add',    row: 10, col: 5, label: '+',                                   ...op('binop'),  tone: 'op' },
];

export const HP_33S_GRID = { rows: 10, cols: 5 };
