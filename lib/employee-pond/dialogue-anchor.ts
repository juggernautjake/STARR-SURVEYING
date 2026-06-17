// lib/employee-pond/dialogue-anchor.ts
//
// employee-pond Slice E5 — pure helper that decides where the side
// dialogue panel attaches relative to its clicked orb. Source-locked
// because anchoring logic is the kind of thing that subtly breaks on
// edge orbs without anyone noticing.
//
// All coordinates are relative to the pond center.

export type DialogueOrigin =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export interface DialogueAnchor {
  /** px from pond center to dialogue's top-left corner. */
  left: number;
  top: number;
  /** Which corner of the dialogue points at the orb. Drives the
   *  `transform-origin` for the expand animation. */
  origin: DialogueOrigin;
}

export interface AnchorInput {
  orbX: number;
  orbY: number;
  orbRadius: number;
  dialogueWidth: number;
  dialogueHeight: number;
  /** Padding between the orb and the dialogue. */
  gap: number;
  /** Pond radius so the dialogue can clamp inside it (E5 keeps the
   *  dialogue free to overflow; pond-clamp ships if it ever shows). */
  pondRadius: number;
}

/** Decide the orb-relative position + the origin corner. Strategy:
 *  - If the orb is in the LEFT half of the pond, anchor the dialogue
 *    to the right of the orb. Otherwise to the left. Same logic for
 *    top/bottom.
 *  - The origin corner points back at the orb so the expand animation
 *    grows out of the right side. */
export function anchorDialogue(input: AnchorInput): DialogueAnchor {
  const { orbX, orbY, orbRadius, dialogueWidth, dialogueHeight, gap } = input;
  // Orb in left half → dialogue to the right; orb in right half →
  // dialogue to the left. Equal/center bias right to avoid undefined
  // case when orbX === 0.
  const placeRight = orbX <= 0;
  // Orb in bottom half (y > 0 in screen coords) → dialogue above.
  // y < 0 → dialogue below.
  const placeBelow = orbY < 0;

  const left = placeRight
    ? orbX + orbRadius + gap
    : orbX - orbRadius - gap - dialogueWidth;
  const top = placeBelow
    ? orbY + orbRadius + gap
    : orbY - orbRadius - gap - dialogueHeight;

  // The corner of the dialogue closest to the orb is the origin.
  // When placeRight + placeBelow: orb at top-left of dialogue.
  // When placeRight + !placeBelow: orb at bottom-left.
  // When !placeRight + placeBelow: orb at top-right.
  // When !placeRight + !placeBelow: orb at bottom-right.
  const origin: DialogueOrigin = placeBelow
    ? placeRight
      ? 'top-left'
      : 'top-right'
    : placeRight
      ? 'bottom-left'
      : 'bottom-right';

  return { left, top, origin };
}

/** Pretty-format "years with company" from a hire-date ISO string.
 *  Returns null when the date isn't parseable (the dialogue renders
 *  "—" then). */
export function yearsWithCompany(
  hireDateIso: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!hireDateIso) return null;
  const hired = new Date(hireDateIso);
  if (Number.isNaN(hired.getTime())) return null;
  const ms = now.getTime() - hired.getTime();
  if (ms < 0) return 0;
  const years = ms / (1000 * 60 * 60 * 24 * 365.25);
  return Math.floor(years * 10) / 10; // one decimal
}
