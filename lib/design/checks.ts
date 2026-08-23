// lib/design/checks.ts — the contract, checked while you are still drawing.
//
// Slices Q1–Q3 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// ── WHY THE CHECKS BELONG IN THE CANVAS AND NOT ONLY IN THE SWEEP ───────────────────────────────
//
// `scripts/ui-fit-sweep.mjs` measures pages that already exist. By the time it speaks, the page is
// built, the decision is old, and somebody has to go back and argue with a layout they thought was
// finished. The same four measurements applied to a MOCKUP cost nothing to act on: the element is
// selected, the number is on screen, and moving it is a drag.
//
// Every threshold comes from `contract.json`, which the sweep also reads. They were separate
// literals in three files until 2026-08-23 — which is exactly how a studio ends up blessing a
// mockup that the live page would fail, with both sides certain they agreed.
//
// ── WHY A FINDING CAN BE DISMISSED, AND WHY IT MUST CARRY A REASON ──────────────────────────────
//
// Some of these are wrong sometimes. A 24px icon that sits inside a 48px hit area is not a
// mis-tap; a 10px label on a ruler is not unreadable body copy. A checker that cannot be told it is
// wrong gets ignored wholesale, and then it catches nothing at all.
//
// So dismissal is a first-class outcome — but it takes a REASON, and the reason travels into the
// exported brief. That turns "I clicked the x" into a decision somebody can read and disagree with,
// which is the only version of dismissal worth having.

import contract from './contract.json';
import type { DesignView, DesignElement, Dismissal } from './document';

export const CONTRACT = {
  minTapTarget: contract.minTapTarget,
  minFontPx: contract.minFontPx,
  minContrastBody: contract.minContrastBody,
  minContrastLarge: contract.minContrastLarge,
  largeTextPx: contract.largeTextPx,
} as const;

export type { Dismissal };

export type CheckId = 'tap-target' | 'text-size' | 'off-canvas' | 'contrast' | 'overlap';

export interface Finding {
  id: string;                 // stable per element+check, so a dismissal survives an edit
  check: CheckId;
  elementId: string;
  elementName: string;
  severity: 'must' | 'should';
  /** What is wrong, in the terms the person is working in. Never a rule number. */
  message: string;
  /** What to do about it. Omitted when the fix is obvious from the message. */
  fix?: string;
}

/** A finding's identity is the element plus the check — NOT its position, or moving it 8px would
 *  resurrect a dismissal you already answered. */
export function findingId(elementId: string, check: CheckId): string {
  return `${elementId}:${check}`;
}

// ── COLOUR ──────────────────────────────────────────────────────────────────────────────────────

/** #rgb, #rrggbb, rgb()/rgba() → channels. Returns null for anything else (a token, a gradient). */
export function parseColour(value: string): { r: number; g: number; b: number } | null {
  const text = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(text);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
  return null;
}

/** WCAG relative luminance. */
export function luminance(colour: { r: number; g: number; b: number }): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number | null {
  const one = parseColour(a);
  const two = parseColour(b);
  if (!one || !two) return null;
  const l1 = luminance(one);
  const l2 = luminance(two);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** The ratio this text has to reach. Large text is allowed less, exactly as WCAG allows. */
export function requiredContrast(fontPx: number, bold: boolean): number {
  const isLarge = fontPx >= 24 || (bold && fontPx >= CONTRACT.largeTextPx);
  return isLarge ? CONTRACT.minContrastLarge : CONTRACT.minContrastBody;
}

// ── THE CHECKS ──────────────────────────────────────────────────────────────────────────────────

export interface CheckContext {
  /** Is this element a control a finger has to hit? Answered by the catalogue, not guessed here. */
  isControl: (element: DesignElement) => boolean;
  /** Does this element render text? */
  hasText: (element: DesignElement) => boolean;
  /** The label to call it in a message. */
  nameOf: (element: DesignElement) => string;
  /** What the artboard is painted with, for contrast against an element with no own background. */
  pageBackground: string;
}

function fontSizeOf(el: DesignElement): number | null {
  const raw = el.style.fontSize;
  if (!raw) return null;
  const px = /^(\d+(?:\.\d+)?)px$/.exec(raw.trim());
  if (px) return parseFloat(px[1]);
  const rem = /^(\d+(?:\.\d+)?)rem$/.exec(raw.trim());
  return rem ? parseFloat(rem[1]) * 16 : null;
}

function isBold(el: DesignElement): boolean {
  const weight = el.style.fontWeight;
  return weight === 'bold' || (!!weight && parseInt(weight, 10) >= 600);
}

/**
 * Every finding on one view.
 *
 * Deliberately pure: a view in, findings out. It is called on every edit, it is called by the
 * exporter, and it is the thing the tests can hold still.
 */
export function runChecks(view: DesignView, ctx: CheckContext): Finding[] {
  const findings: Finding[] = [];
  const add = (el: DesignElement, check: CheckId, severity: Finding['severity'], message: string, fix?: string) => {
    findings.push({ id: findingId(el.id, check), check, elementId: el.id, elementName: ctx.nameOf(el), severity, message, fix });
  };

  for (const el of view.elements) {
    // ── A control too small to hit ──────────────────────────────────────────────────────────────
    if (ctx.isControl(el)) {
      const small = Math.min(el.w, el.h);
      if (small < CONTRACT.minTapTarget) {
        add(el, 'tap-target', 'must',
          `${ctx.nameOf(el)} is ${el.w}×${el.h}. A control needs ${CONTRACT.minTapTarget}px on its short side to be reliably tappable.`,
          `Make it at least ${CONTRACT.minTapTarget}px tall, or give it padding rather than shrinking the box.`);
      }
    }

    // ── Type below the readable floor ───────────────────────────────────────────────────────────
    const font = fontSizeOf(el);
    if (font !== null && ctx.hasText(el) && font < CONTRACT.minFontPx) {
      add(el, 'text-size', 'must',
        `${ctx.nameOf(el)} is set in ${font}px. Under ${CONTRACT.minFontPx}px stops being readable on a phone.`);
    }

    // ── Off the edge of the artboard ────────────────────────────────────────────────────────────
    if (el.x < 0 || el.x + el.w > view.width) {
      const off = el.x < 0 ? { side: 'left', by: -el.x } : { side: 'right', by: el.x + el.w - view.width };
      add(el, 'off-canvas', 'should',
        `${ctx.nameOf(el)} hangs ${off.by}px off the ${off.side} edge, so it is cut off in the exported image.`,
        'Move it back inside, or dismiss this with "parked deliberately".');
    }

    // ── Text nobody can read against what is behind it ──────────────────────────────────────────
    const colour = el.style.color;
    const behind = el.style.background ?? el.style.backgroundColor ?? ctx.pageBackground;
    if (colour && ctx.hasText(el)) {
      const ratio = contrastRatio(colour, behind);
      const needed = requiredContrast(font ?? 14, isBold(el));
      // `null` means a token or a gradient — unknowable here, and guessing would produce a warning
      // on every correctly-tokenised element, which is how a checker teaches people to ignore it.
      if (ratio !== null && ratio < needed) {
        add(el, 'contrast', 'must',
          `${ctx.nameOf(el)} has ${ratio.toFixed(1)}:1 contrast against what is behind it — ${needed}:1 is the minimum for this size.`,
          'Darken the text, or lighten the background behind it.');
      }
    }
  }

  // Must-fix before should-fix, then in the order they were placed, so the list does not reshuffle
  // under the cursor as elements are edited.
  return findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'must' ? -1 : 1));
}

/** The findings still standing, and the ones answered — both, because both go in the export. */
export function applyDismissals(
  findings: Finding[],
  dismissals: Dismissal[],
): { open: Finding[]; answered: Array<Finding & { reason: string }> } {
  const byId = new Map(dismissals.map((d) => [d.findingId, d]));
  const open: Finding[] = [];
  const answered: Array<Finding & { reason: string }> = [];
  for (const f of findings) {
    const d = byId.get(f.id);
    if (d) answered.push({ ...f, reason: d.reason });
    else open.push(f);
  }
  return { open, answered };
}
