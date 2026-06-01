// lib/cad/io/trv-titleblock.ts
//
// cad-trv-import-export-deep-semantic Pass 6 — pure helper that
// applies TRV project metadata (90 / 101-106) to the survey
// drawing's title block. NON-DESTRUCTIVE: only fills fields the
// user hasn't typed into yet (empty strings + obvious null /
// undefined), so re-importing a TRV over an existing project
// can't clobber the surveyor's already-set firm name + license,
// etc.

import type { TitleBlockConfig } from '../types';
import type { TrvMetadata, TrvDrawingElement } from './trv-parser';
import { extractTextElements } from './trv-drawing-elements';

/** cad-trv-drawing-element-rendering Slice 4 — structured title-block
 *  values recovered from the paper-space `28,5` text elements (firm
 *  name, surveyor + RPLS license, job no., customer, flood note).
 *  The TRV metadata codes (90 / 101-106) DON'T carry these, so the
 *  drawing-element text is the only source. Filled into the title
 *  block non-destructively alongside `applyTrvMetadataToTitleBlock`. */
export interface TrvTitleBlockHints {
  firmName?: string;
  surveyorName?: string;
  surveyorLicense?: string;
  projectNumber?: string;
  clientName?: string;
  notes?: string;
}

/** Detect structured title-block fields from the PAPER-space `28,5`
 *  text elements. Pure: no DOM/store. Pattern-driven (specific
 *  regexes) so an unexpected line is left alone rather than
 *  mis-assigned. */
export function extractTitleBlockHints(elements: ReadonlyArray<TrvDrawingElement>): TrvTitleBlockHints {
  const hints: TrvTitleBlockHints = {};
  const paper = extractTextElements(elements).filter((e) => e.space === 'PAPER');
  for (const el of paper) {
    const t = el.text.replace(/\s*\n\s*/g, ' ').trim(); // flatten multi-line for matching
    // Surveyor certification → name + RPLS number.
    let m = t.match(/\bI,\s*(.+?),\s*Registered Professional Land\s*Surveyor\s*No\.?\s*(\d+)/i);
    if (m) {
      hints.surveyorName ??= m[1].trim();
      hints.surveyorLicense ??= m[2].trim();
      continue;
    }
    // Job number + customer.
    m = t.match(/JOB\s*NO\.?\s*(\S+)\s+CUSTOMER:\s*(.+?)\s*$/i);
    if (m) {
      hints.projectNumber ??= m[1].trim();
      hints.clientName ??= m[2].trim();
      continue;
    }
    // Firm name — short line naming a surveying firm (not the firm-
    // license line, which reads "...SURV. FIRM NO...").
    if (!hints.firmName && /\b(SURVEYING|SURVEYORS)\b/i.test(t) && t.length <= 40 && !/LICENSED|FIRM\s*NO/i.test(t)) {
      hints.firmName = t;
      continue;
    }
    // Flood-zone note.
    if (!hints.notes && /\bFEMA\b|flood\s*plain/i.test(t)) {
      hints.notes = t;
      continue;
    }
  }
  return hints;
}

/** Patch the title block with TRV metadata values where the
 *  current field is empty. Returns a fresh TitleBlockConfig
 *  (no mutation of the input). `hints` (Slice 4) fills the
 *  firm / surveyor / job fields the metadata codes don't carry. */
export function applyTrvMetadataToTitleBlock(
  metadata: TrvMetadata,
  current: TitleBlockConfig,
  hints?: TrvTitleBlockHints,
): TitleBlockConfig {
  const next: TitleBlockConfig = { ...current };
  // Project name: 101.
  if (isEmpty(next.projectName) && nonEmpty(metadata.projectName)) {
    next.projectName = metadata.projectName as string;
  }
  // Survey date: 102 (TRV uses DD-MM-YYYY in the samples).
  if (isEmpty(next.surveyDate) && nonEmpty(metadata.surveyDate)) {
    next.surveyDate = formatTrvDate(metadata.surveyDate as string);
  }
  // Scale: 103. Source carries a bare number like "1"; we wrap
  // it into the conventional `1" = N'` form when the value parses
  // as a number so the title block reads naturally.
  if (isEmpty(next.scaleLabel) && nonEmpty(metadata.scale)) {
    next.scaleLabel = formatTrvScale(metadata.scale as string);
  }
  // Notes: when a sourcePath is present + notes are empty, drop
  // a single-line "Imported from <path>" note so the surveyor
  // can trace the origin.
  if (isEmpty(next.notes) && nonEmpty(metadata.sourcePath)) {
    next.notes = `Imported from ${metadata.sourcePath as string}`;
  }
  // Slice 4 — structured fields recovered from paper-space `28,5`
  // text. Non-destructive: only fills currently-empty fields.
  if (hints) {
    if (isEmpty(next.firmName) && nonEmpty(hints.firmName)) next.firmName = hints.firmName;
    if (isEmpty(next.surveyorName) && nonEmpty(hints.surveyorName)) next.surveyorName = hints.surveyorName;
    if (isEmpty(next.surveyorLicense) && nonEmpty(hints.surveyorLicense)) next.surveyorLicense = hints.surveyorLicense;
    if (isEmpty(next.projectNumber) && nonEmpty(hints.projectNumber)) next.projectNumber = hints.projectNumber;
    if (isEmpty(next.clientName) && nonEmpty(hints.clientName)) next.clientName = hints.clientName;
    if (isEmpty(next.notes) && nonEmpty(hints.notes)) next.notes = hints.notes;
  }
  return next;
}

/** True for null / undefined / empty / whitespace-only strings. */
function isEmpty(s: string | null | undefined): boolean {
  return s === null || s === undefined || s.trim().length === 0;
}

/** True for a string that isn't empty/whitespace. */
function nonEmpty(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

/** TRV survey dates land in DD-MM-YYYY form (e.g. "20-5-2026").
 *  Convert to ISO-ish `YYYY-MM-DD` for our title block when the
 *  shape matches; otherwise pass through unchanged so an
 *  unexpected format doesn't get mangled. */
export function formatTrvDate(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return raw.trim();
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** Convert a TRV scale value (typically a bare number) into the
 *  `1" = N'` form our title block expects. Pass through anything
 *  that's already a labeled scale string. */
export function formatTrvScale(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return `1" = ${trimmed}'`;
  }
  return trimmed;
}
