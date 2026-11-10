/**
 * The video player stays open and keeps its place (owner, 2026-11-09).
 *
 * "whenever I click somewhere else or open another program, the video player closes, and in order
 * to go back to the video and where I was in it, I have to reopen it and scroll. I need the video
 * player to stay open and keep its place in the video until the user clicks the x button on the
 * modal. Also, we need better video controls like changing the speed of the videos and stuff."
 *
 * The arithmetic (lib/viewers/video-memory.ts) is unit-tested; the wiring is pinned as source text,
 * checking the CALLERS, as unified-file-viewer.test.ts does.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  SPEEDS, videoKey, stepSpeed, formatClock, resumePoint, clampTime,
  savePosition, loadPosition, saveSpeed, loadSpeed,
} from '@/lib/viewers/video-memory';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

describe('video-memory: the arithmetic', () => {
  it('a file is remembered by its id; a bare URL by its path, not its changing signature', () => {
    expect(videoKey('abc', 'https://x/v.mp4?token=1')).toBe('abc');
    expect(videoKey(null, 'https://x/v.mp4?token=1')).toBe(videoKey(null, 'https://x/v.mp4?token=2'));
    expect(videoKey(null, 'https://x/v.mp4?token=1')).toBe('https://x/v.mp4');
    expect(videoKey(null, null)).toBe('');
  });

  it('speed steps through the list and stops at either end', () => {
    expect(stepSpeed(1, 1)).toBe(1.25);
    expect(stepSpeed(1, -1)).toBe(0.75);
    expect(stepSpeed(3, 1)).toBe(3);
    expect(stepSpeed(0.25, -1)).toBe(0.25);
    expect(stepSpeed(1.1, 1)).toBe(1.25);   // an odd rate set elsewhere snaps onto the list
    expect(SPEEDS).toContain(2);
  });

  it('times read like a player clock', () => {
    expect(formatClock(7)).toBe('0:07');
    expect(formatClock(296)).toBe('4:56');
    expect(formatClock(3723)).toBe('1:02:03');
    expect(formatClock(NaN)).toBe('0:00');
  });

  it('picks up where it was — unless that is the very start or the very end', () => {
    expect(resumePoint(83.4, 300)).toBe(83.4);
    expect(resumePoint(0.4, 300)).toBe(0);
    expect(resumePoint(299.2, 300)).toBe(0);
    expect(resumePoint(null, 300)).toBe(0);
    expect(resumePoint(50, NaN)).toBe(50);   // duration not known yet (a live stream, a slow header)
  });

  it('a seek stays inside the video', () => {
    expect(clampTime(-4, 100)).toBe(0);
    expect(clampTime(140, 100)).toBe(100);
    expect(clampTime(40, NaN)).toBe(40);
  });
});

describe('video-memory: storage', () => {
  beforeEach(() => {
    (globalThis as unknown as { sessionStorage: MemoryStorage }).sessionStorage = new MemoryStorage();
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
  });

  it('a position survives being saved and read back, per video', () => {
    savePosition('a', 83.46);
    savePosition('b', 12);
    expect(loadPosition('a')).toBe(83.5);
    expect(loadPosition('b')).toBe(12);
    expect(loadPosition('c')).toBeNull();
  });

  it('the speed is a preference, and nonsense in storage falls back to 1×', () => {
    expect(loadSpeed()).toBe(1);
    saveSpeed(1.5);
    expect(loadSpeed()).toBe(1.5);
    localStorage.setItem('video-speed', '7');
    expect(loadSpeed()).toBe(1);
  });

  it('no storage at all loses the memory, never the video', () => {
    (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = {
      getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); },
    };
    expect(() => savePosition('a', 5)).not.toThrow();
    expect(loadPosition('a')).toBeNull();
  });
});

describe('the wiring', () => {
  const PLAYER = read('app/admin/components/media/VideoPlayer.tsx');
  const VIEWER = read('app/admin/components/files/FileViewer.tsx');
  const MEDIA = read('app/admin/components/MediaViewer.tsx');
  const EXPLORER = read('app/admin/components/files/FolderExplorer.tsx');
  const JOB = read('app/admin/jobs/[id]/page.tsx');

  it('both viewers play video through the one player, one player per file', () => {
    expect(VIEWER).toMatch(/<VideoPlayer[^>]*?key=\{file\.id\}/);
    expect(MEDIA).toMatch(/<VideoPlayer\s+key=\{videoKey\(/);
    expect(VIEWER).not.toMatch(/<video\b/);
    expect(MEDIA).not.toMatch(/<video\b/);
  });

  it('the player has speed, skip, frame step, loop and picture-in-picture, and still loads lazily', () => {
    expect(PLAYER).toContain('aria-label="Playback speed"');
    expect(PLAYER).toContain('seekBy(-SKIP_SECONDS)');
    expect(PLAYER).toContain('frame(1)');
    expect(PLAYER).toContain('requestPictureInPicture');
    expect(PLAYER).toContain('preload="metadata"');
  });

  it('it saves its place as it plays, when hidden and on the way out — and restores it on load', () => {
    expect(PLAYER).toContain("addEventListener('visibilitychange'");
    expect(PLAYER).toContain("addEventListener('pagehide'");
    expect(PLAYER).toMatch(/onLoadedMetadata[\s\S]*resumePoint\(/);
  });

  it('a video closes only on the ✕: not on Escape, not on a click outside', () => {
    expect(VIEWER).toMatch(/kind === 'video' && \(e\.key === 'Escape'/);
    expect(MEDIA).toContain("onClick={k === 'video' ? undefined : onClose}");
    expect(MEDIA).toContain("kind(media) !== 'video'");
  });

  it('the viewer no longer echoes the caller back (the error #185 ping-pong)', () => {
    expect(VIEWER).not.toMatch(/useEffect\(\(\) => \{ onCurrentChange\?\.\(currentId\)/);
    expect(VIEWER).toContain('const select = useCallback');
  });

  it('a redraw reopens the open file, and the job page keeps its tab in the address', () => {
    expect(EXPLORER).toContain('fe-open:${rootId}');
    expect(EXPLORER).toMatch(/void openFile\(node\)/);
    expect(JOB).toContain("new URLSearchParams(window.location.search).get('tab')");
    expect(JOB).toContain('window.history.replaceState');
  });
});
