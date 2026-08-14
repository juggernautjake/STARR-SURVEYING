// __tests__/jobs/briefing-recorder.test.ts — slice B2 of
// docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// Everything here is a decision the recorder makes BEFORE any bytes exist, and every one of them
// fails silently when it is wrong: a codec the browser cannot encode throws on construction with a
// message about "NotSupported" that reads like the screen-share was refused; a support check that
// says yes on iOS Safari renders a dead button; a size projection that under-reads lets somebody
// record for forty minutes and lose it at the upload.

import { describe, it, expect } from 'vitest';
import {
  pickRecorderMimeType, extensionForMimeType, describeRecorderSupport,
  formatDuration, formatBytes, projectRecordingSize, recordingFileName,
  RECORDER_MIME_CANDIDATES,
} from '@/lib/jobs/recorder';

describe('picking a codec', () => {
  it('prefers vp9, which is what keeps a long walkthrough under the ceiling', () => {
    expect(pickRecorderMimeType(() => true)).toBe('video/webm;codecs=vp9,opus');
  });

  it('falls back to vp8 where vp9 is unavailable', () => {
    const supported = (t: string) => !t.includes('vp9');
    expect(pickRecorderMimeType(supported)).toBe('video/webm;codecs=vp8,opus');
  });

  it('takes mp4 as a last resort rather than refusing to record', () => {
    const supported = (t: string) => t === 'video/mp4';
    expect(pickRecorderMimeType(supported)).toBe('video/mp4');
  });

  it('returns null when the browser can encode none of them', () => {
    // The caller MUST refuse rather than construct an unconstrained MediaRecorder: that produces an
    // unlabelled blob we cannot name a file extension for, on a path where the file name decides
    // whether a <video> element will play it back later.
    expect(pickRecorderMimeType(() => false)).toBeNull();
  });

  it('treats a throwing isTypeSupported as a no and keeps looking', () => {
    // Some implementations throw on a malformed type instead of returning false. One candidate
    // blowing up must not abort the search and leave a capable browser unable to record.
    const supported = (t: string) => {
      if (t.includes('vp9')) throw new TypeError('bad mime');
      return t.includes('vp8');
    };
    expect(pickRecorderMimeType(supported)).toBe('video/webm;codecs=vp8,opus');
  });

  it('offers webm before mp4', () => {
    // Chrome will happily accept mp4 and produce a file other browsers struggle to seek.
    const webm = RECORDER_MIME_CANDIDATES.findIndex((t) => t.startsWith('video/webm'));
    const mp4 = RECORDER_MIME_CANDIDATES.indexOf('video/mp4');
    expect(webm).toBeLessThan(mp4);
  });
});

describe('the file extension', () => {
  it('follows the container, not the codec', () => {
    expect(extensionForMimeType('video/webm;codecs=vp9,opus')).toBe('webm');
    expect(extensionForMimeType('video/mp4')).toBe('mp4');
  });

  it('defaults to webm rather than producing an extensionless name', () => {
    expect(extensionForMimeType(null)).toBe('webm');
    expect(extensionForMimeType(undefined)).toBe('webm');
  });
});

describe('whether this browser can record at all', () => {
  const full = { hasDisplayMedia: true, hasMediaRecorder: true, hasUserMedia: true, isSecureContext: true };

  it('says yes when everything is there', () => {
    expect(describeRecorderSupport(full).supported).toBe(true);
  });

  it('blames the URL before the browser on an insecure origin', () => {
    // http:// strips navigator.mediaDevices entirely, so every other check reports "unsupported"
    // and sends somebody hunting for a different browser when the problem is the address bar.
    const v = describeRecorderSupport({ ...full, isSecureContext: false, hasDisplayMedia: false, hasUserMedia: false });
    expect(v.supported).toBe(false);
    expect(v.reason).toMatch(/https/i);
  });

  it('names the browsers that do work when screen capture is missing', () => {
    // D2: getDisplayMedia does not exist on iOS Safari. "Not supported" alone leaves somebody
    // trying the same thing on the same phone.
    const v = describeRecorderSupport({ ...full, hasDisplayMedia: false });
    expect(v.supported).toBe(false);
    expect(v.reason).toMatch(/Chrome|Edge|Firefox/);
    expect(v.reason).toMatch(/iPhone|iPad/i);
  });

  it('tells a missing recorder apart from a missing microphone', () => {
    const noRec = describeRecorderSupport({ ...full, hasMediaRecorder: false });
    const noMic = describeRecorderSupport({ ...full, hasUserMedia: false });
    expect(noRec.supported).toBe(false);
    expect(noMic.supported).toBe(false);
    expect(noRec.reason).not.toBe(noMic.reason);
    expect(noMic.reason).toMatch(/microphone|voice/i);
  });

  it('always gives a reason when it says no', () => {
    for (const env of [
      { ...full, isSecureContext: false }, { ...full, hasDisplayMedia: false },
      { ...full, hasMediaRecorder: false }, { ...full, hasUserMedia: false },
    ]) {
      const v = describeRecorderSupport(env);
      expect(v.supported).toBe(false);
      expect(v.reason.length).toBeGreaterThan(20);
    }
  });
});

describe('the clock', () => {
  it('reads mm:ss under an hour', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('grows an hours field rather than counting to 92 minutes', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(5525)).toBe('1:32:05');
  });

  it('does not render a negative time', () => {
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('the size on screen', () => {
  it('reads at a glance', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(90 * 1024 * 1024)).toBe('90 MB');
    expect(formatBytes(1.4 * 1024 * 1024 * 1024)).toBe('1.4 GB');
  });

  it('drops the decimal once the number is big enough not to need it', () => {
    expect(formatBytes(437.2 * 1024 * 1024)).toBe('437 MB');
  });

  it('refuses to render nonsense as a number', () => {
    expect(formatBytes(NaN)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('projecting where the size is going', () => {
  const LIMIT = 500 * 1024 * 1024;

  it('will not extrapolate from a two-second sample', () => {
    // A projection off two seconds of a static screen predicts 12 MB for an hour. That is a lie,
    // and a lie in this direction stops people recording at all when they later see the real rate.
    const p = projectRecordingSize({ bytesSoFar: 400_000, elapsedSeconds: 2, projectToSeconds: 3600, limitBytes: LIMIT });
    expect(p.projectedBytes).toBeNull();
  });

  it('projects from the observed rate once there is enough of one', () => {
    // 1 MB/s observed → about 3.6 GB in an hour.
    const p = projectRecordingSize({
      bytesSoFar: 20 * 1024 * 1024, elapsedSeconds: 20, projectToSeconds: 3600, limitBytes: LIMIT,
    });
    expect(p.projectedBytes).toBe(3600 * 1024 * 1024);
    expect(p.willExceedLimit).toBe(true);
  });

  it('stays quiet when the rate is comfortably under', () => {
    // ~100 KB/s → ~350 MB in an hour, under the 500 MB ceiling.
    const p = projectRecordingSize({
      bytesSoFar: 6 * 1024 * 1024, elapsedSeconds: 60, projectToSeconds: 3600, limitBytes: LIMIT,
    });
    expect(p.willExceedLimit).toBe(false);
  });

  it('flags a recording that is ALREADY over even without a projection', () => {
    // The certain case, and the one that must be reported however short the sample: these bytes
    // cannot be uploaded no matter what happens next.
    const p = projectRecordingSize({
      bytesSoFar: LIMIT + 1, elapsedSeconds: 3, projectToSeconds: 3600, limitBytes: LIMIT,
    });
    expect(p.projectedBytes).toBeNull();
    expect(p.willExceedLimit).toBe(true);
  });

  it('does not divide by zero on a recording that has produced nothing', () => {
    const p = projectRecordingSize({ bytesSoFar: 0, elapsedSeconds: 30, projectToSeconds: 3600, limitBytes: LIMIT });
    expect(p.projectedBytes).toBeNull();
    expect(p.willExceedLimit).toBe(false);
  });
});

describe('naming the recording', () => {
  const when = new Date(2026, 7, 14, 9, 5); // 2026-08-14 09:05, local — the stamp is local on purpose

  it('names it for the job and the moment', () => {
    expect(recordingFileName('2026-014', when, 'video/webm;codecs=vp9,opus'))
      .toBe('2026-014-briefing-2026-08-14-0905.webm');
  });

  it('still produces a usable name with no job number', () => {
    expect(recordingFileName(null, when, 'video/webm')).toBe('briefing-2026-08-14-0905.webm');
  });

  it('strips anything from a job number that would break an object key', () => {
    const name = recordingFileName('J/2026 #14', when, 'video/webm');
    expect(name).not.toMatch(/[/#\s]/);
    expect(name).toContain('briefing-2026-08-14-0905');
  });

  it('carries the container into the extension', () => {
    expect(recordingFileName('A1', when, 'video/mp4')).toMatch(/\.mp4$/);
  });

  it('gives two recordings in the same minute the same name — the uuid in the path keeps them apart', () => {
    // Documented rather than fixed: uniqueness lives in `briefingObjectPath`, so the display name is
    // free to be the human-readable one. If that ever changes this test is the reminder.
    expect(recordingFileName('A1', when, 'video/webm')).toBe(recordingFileName('A1', when, 'video/webm'));
  });
});
