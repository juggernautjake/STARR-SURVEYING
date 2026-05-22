// lib/calculators/shared.ts
//
// Shared types across calculator engines. Each model exports its own
// KeyDef[] (a data file in lib/calculators/models/<model>/keypad-data.ts)
// and the generic <Keypad> renderer in app/admin/components/calculator
// turns it into a grid.

export type KeyKind =
  | 'digit'
  | 'dot'
  | 'binop'
  | 'eval'
  | 'shift'
  | 'mode'
  | 'clear'
  | 'delete'
  | 'paren'
  | 'comma'
  | 'negate'
  | 'ans'
  | 'enter'
  | 'nav'
  | 'op';        // any key whose handling isn't covered above

export type KeyTone =
  | 'digit'      // light, large
  | 'op'         // dark — operators
  | 'eval'       // brand red / accent — equals
  | 'shift'      // 2nd / shift modifier
  | 'soft'       // function keys, modes, navigation
  | 'accent';    // enter, special

export interface KeyDef {
  id: string;
  /** Primary label (always shown). */
  label: string;
  /** Optional label printed in shift-color above the key (the 2nd-key alt). */
  shiftLabel?: string;
  /** CSS grid row (1-indexed). */
  row: number;
  /** CSS grid col (1-indexed). */
  col: number;
  /** Optional column span (e.g. wide "0" key on the bottom row). */
  colSpan?: number;
  /** Optional row span. */
  rowSpan?: number;
  /** Drives the visual style — see KeyTone above. */
  tone?: KeyTone;
  /** Drives the engine's interpretation — see KeyKind above. C-7 wires this. */
  kind?: KeyKind;
}
