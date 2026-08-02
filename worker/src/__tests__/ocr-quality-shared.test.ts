// One definition of "readable", on both extraction paths (research plan R18).
//
// R18 put a quality floor on the app's extraction path. The WORKER path — the one that actually runs
// production pipelines — had none, and its document write was:
//
//     processing_status: firstPage.extractedText ? 'analyzed' : 'analyzed'
//
// Both branches of that ternary read 'analyzed'. So a scanned deed that OCR'd to nothing was marked
// fully analysed, exactly like one with text — a stronger claim than the app's path ever made about
// a document it could read.
//
// The two paths had already drifted on a neighbouring constant too: 500 chars in the app, 800 in the
// worker, with a comment at the app's call site explaining the difference rather than removing it.
// That is how a rule ends up enforced on one path and not the other, which is why the assessor now
// has exactly one definition.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { assessOcr, isLandRecordType, statusFor } from '../infra/ocr-quality.js';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const deedPage = (
  'THENCE North 45 degrees 12 minutes 30 seconds East, a distance of 210.5 feet to a 1/2 inch iron ' +
  'rod set for corner; THENCE South 44 degrees 47 minutes West, 318.20 feet to the POINT OF ' +
  'BEGINNING, containing 2.45 acres, being the same land conveyed in Volume 412, Page 88, ' +
  'Instrument No. 2019-12345, recorded March 11, 1968, subject to a 20 foot utility easement.'
).repeat(2);

describe('the assessor is the same one the app uses', () => {
  it('behaves identically on an empty extraction', () => {
    const a = assessOcr({ text: '' });
    expect(a.readability).toBe('unreadable');
    expect(statusFor(a)).toBe('unreadable');
  });

  it('still applies the digit test to a land record', () => {
    const wordy = 'THENCE along the fence line to a corner, thence with the meanders of the creek to a stake for corner, subject to easements of record. '.repeat(3);
    expect(assessOcr({ text: wordy, method: 'ocr-vision', isLandRecord: true }).readability).toBe('unreadable');
  });

  it('passes a real deed page', () => {
    expect(assessOcr({ text: deedPage, method: 'ocr-vision', isLandRecord: true }).readability).toBe('good');
  });

  it('knows a land record from a screenshot', () => {
    expect(isLandRecordType('deed')).toBe(true);
    expect(isLandRecordType('aerial_photo')).toBe(false);
  });
});

describe('there is exactly one definition', () => {
  it('the app re-exports the worker module rather than keeping a copy', () => {
    const appModule = read('../lib/research/ocr-quality.ts');
    expect(appModule).toContain("from '@/worker/src/infra/ocr-quality'");
    // No second implementation hiding behind the re-export.
    expect(appModule).not.toContain('export function assessOcr');
  });

  it('names the drift that motivated it', () => {
    const appModule = read('../lib/research/ocr-quality.ts');
    expect(appModule).toContain('500');
    expect(appModule).toContain('800');
  });
});

describe('the worker path no longer over-claims', () => {
  const uploader = read('src/services/artifact-uploader.ts');

  it('has no ternary whose branches are identical', () => {
    // The original bug, in its exact form.
    expect(uploader).not.toContain("firstPage.extractedText ? 'analyzed' : 'analyzed'");
    expect(uploader).not.toMatch(/\?\s*'analyzed'\s*:\s*'analyzed'/);
  });

  it('decides the status from the floor, at both write sites', () => {
    const uses = uploader.split('assessArtifact(firstPage.extractedText');
    // One definition plus two call sites, each reading status/readability/reason.
    expect(uses.length).toBeGreaterThanOrEqual(3);
    expect(uploader).toContain('readability_reason:');
  });

  it('reserves "analyzed" for text good enough to have been analysed', () => {
    expect(uploader).toContain("a.readability === 'good' ? 'analyzed' : 'extracted'");
  });

  it('imports the assessor instead of reimplementing it', () => {
    expect(uploader).toContain("from '../infra/ocr-quality.js'");
    expect(uploader).not.toContain('function assessOcr');
  });
});
