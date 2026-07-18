// __tests__/mobile/capture-intent.test.ts — the Work Mode camera capture-intent routing + metadata stamp.
import { describe, it, expect } from 'vitest';
import {
  captureDestination, shouldAnalyze, assembleCaptureMetadata, CAPTURE_INTENTS,
} from '@/mobile/lib/captureIntent';

describe('captureDestination routing', () => {
  it('routes a job photo/video to field_media, no analysis, no financials', () => {
    expect(captureDestination('job_photo')).toMatchObject({ parentTable: 'field_media', mediaType: 'photo', aiAnalyze: false, toFinancials: false });
    expect(captureDestination('job_video')).toMatchObject({ parentTable: 'field_media', mediaType: 'video' });
  });
  it('routes a receipt to receipts → financials + AI auto-analyze', () => {
    expect(captureDestination('receipt')).toMatchObject({ parentTable: 'receipts', aiAnalyze: true, toFinancials: true, mediaType: null });
  });
  it('routes a document to job_files → AI analyze, not financials', () => {
    expect(captureDestination('document')).toMatchObject({ parentTable: 'job_files', aiAnalyze: true, toFinancials: false });
  });
  it('falls back to a job photo for an unknown intent (never routes to nowhere)', () => {
    // @ts-expect-error — exercising the corrupt-value guard
    expect(captureDestination('bogus')).toMatchObject({ parentTable: 'field_media', mediaType: 'photo' });
  });
  it('shouldAnalyze is true only for receipt + document', () => {
    expect(CAPTURE_INTENTS.map(shouldAnalyze)).toEqual([false, false, true, true]);
  });
});

describe('assembleCaptureMetadata', () => {
  const base = { capturedAt: '2026-07-18T12:00:00.000Z', jobId: 'job-1' };

  it('always carries capturedAt + jobId, dropping everything absent', () => {
    expect(assembleCaptureMetadata(base)).toEqual(base);
  });

  it('includes location + accuracy only when both coords are finite', () => {
    expect(assembleCaptureMetadata({ ...base, location: { latitude: 35.1, longitude: -106.6, accuracy: 5 } }))
      .toMatchObject({ latitude: 35.1, longitude: -106.6, accuracy: 5 });
    // a partial/NaN fix is dropped entirely
    expect(assembleCaptureMetadata({ ...base, location: { latitude: Number.NaN, longitude: -106.6 } }))
      .toEqual(base);
  });

  it('stamps job number, device, heading, crew, and recorder when known', () => {
    const meta = assembleCaptureMetadata({
      ...base, jobNumber: '24-118', deviceModel: 'iPhone 15 Pro', headingDeg: 270,
      crewUserIds: ['u1', '', 'u2'], recordedByUserId: 'u1',
    });
    expect(meta.jobNumber).toBe('24-118');
    expect(meta.deviceModel).toBe('iPhone 15 Pro');
    expect(meta.headingDeg).toBe(270);
    expect(meta.crewUserIds).toEqual(['u1', 'u2']); // empty ids filtered
    expect(meta.recordedByUserId).toBe('u1');
  });

  it('omits an empty crew list rather than storing []', () => {
    expect(assembleCaptureMetadata({ ...base, crewUserIds: ['', null as unknown as string] }).crewUserIds).toBeUndefined();
  });
});
