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
import type { TrvMetadata } from './trv-parser';

/** Patch the title block with TRV metadata values where the
 *  current field is empty. Returns a fresh TitleBlockConfig
 *  (no mutation of the input). */
export function applyTrvMetadataToTitleBlock(
  metadata: TrvMetadata,
  current: TitleBlockConfig,
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
